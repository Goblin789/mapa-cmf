import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Estado } from '../dominio/tipos';
import { alteracoes, lotes } from '../servidor/db/esquema';
import { abrirBd, type Bd } from '../servidor/db/ligacao';
import { carregarEstado } from '../servidor/estado';
import { aplicarNaBd } from './aplicar';
import { PASTA_DADOS_INICIAIS } from './executar';
import { executarSincronizacao, lerArgumentosSincronizacao } from './executarSincronizacao';
import { AUTOR_SINCRONIZACAO, alteracoesDoPlano, planoVazio, resumoDoPlano } from './sincronizar';
import { abrirBdSoLeitura, aplicarSincronizacao, ensaiarSincronizacao } from './sincronizarBd';
import { estadoFicticio, referenciaFicticia } from './sincronizarFicticios';
import type { DadosReferencia } from './tipos';

const IMPORTADO = new Date('2026-10-01T08:00:00.000Z');
const AGORA = new Date('2026-10-04T09:30:00.000Z');

/** Grava o estado fictício (importação + edições feitas no programa) e uma gravação do programa. */
function prepararBd(bd: Bd = abrirBd(':memory:')): Bd {
  const { versao: _v, geradoEm: _g, ...entidades } = estadoFicticio();
  aplicarNaBd(bd, entidades, { agora: IMPORTADO, comentario: 'Importação fictícia' });
  const { id } = bd
    .insert(lotes)
    .values({
      autor: 'local',
      tipo: 'mudanca',
      estado: 'aplicado',
      criadoEm: '2026-10-02T10:00:00.000Z',
      efetivoEm: '2026-10-02T10:00:00.000Z',
      comentario: null,
    })
    .returning({ id: lotes.id })
    .get();
  bd.insert(alteracoes)
    .values({
      loteId: id,
      entidade: 'carrinha',
      entidadeId: 'ZZ1001',
      campo: 'condutorId',
      antes: 'null',
      depois: '"p-ana"',
    })
    .run();
  return bd;
}

function dadosCom(mudar: (d: DadosReferencia) => void): DadosReferencia {
  const d = referenciaFicticia();
  mudar(d);
  return d;
}

function semData(e: Estado): Omit<Estado, 'geradoEm'> {
  const { geradoEm: _g, ...resto } = e;
  return resto;
}

const carrinha = (e: Estado, id: string) => e.carrinhas.find((c) => c.id === id);
const pessoa = (e: Estado, id: string) => e.pessoas.find((p) => p.id === id);

describe('aplicarSincronizacao', () => {
  it('atualiza os campos dos JSON sem mexer em condutores, onde dormem, temporárias, senhorio nem pessoas', () => {
    const bd = prepararBd();
    const antes = carregarEstado(bd);
    const dados = dadosCom((d) => {
      const zz1002 = d.carrinhas.find((c) => c.id === 'ZZ1002');
      if (zz1002) Object.assign(zz1002, { marca: 'Marca B', modelo: 'Modelo B', tipo: 'carro', lugares: 7 });
      const casa = d.casas.find((c) => c.id === 'casa-um');
      if (casa) casa.lotacao = 5;
      const alfa = d.clientes.find((c) => c.id === 'alfa');
      if (alfa) alfa.cor = '#F5D0D0';
      const rua = d.locais.find((l) => l.id === 'rua-a');
      if (rua) rua.lat = 49.61;
    });

    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    expect(r.tipo).toBe('aplicado');
    const depois = carregarEstado(bd);

    expect(depois.pessoas).toEqual(antes.pessoas);
    expect(depois.obras).toEqual(antes.obras);
    expect(carrinha(depois, 'ZZ1002')).toEqual({
      ...carrinha(antes, 'ZZ1002'),
      tipo: 'carro',
      marca: 'Marca B',
      modelo: 'Modelo B',
      lugares: 7,
    });
    // As edições feitas no programa ficaram.
    expect(carrinha(depois, 'ZZ1002')).toMatchObject({ condutorId: 'p-rui', dormeLocalId: 'parque' });
    expect(carrinha(depois, 'ZZ1001')).toEqual(carrinha(antes, 'ZZ1001'));
    // O carro de substituição (temporário, só na base de dados) fica igual, com a Gil e o condutor.
    expect(carrinha(depois, 'ZZ1008')).toEqual(carrinha(antes, 'ZZ1008'));
    expect(depois.casas.find((c) => c.id === 'casa-um')).toMatchObject({
      lotacao: 5,
      senhorio: 'Senhorio Fictício',
      equipamento: 'Máquina de lavar',
    });
    expect(depois.clientes.find((c) => c.id === 'alfa')?.cor).toBe('#F5D0D0');
    expect(depois.locais.find((l) => l.id === 'rua-a')?.lat).toBe(49.61);
  });

  it('insere clientes, locais, casas e veículos novos (uma casa nova pode apontar para um local novo)', () => {
    const bd = prepararBd();
    const dados = dadosCom((d) => {
      d.clientes.push({
        id: 'delta',
        nome: 'Delta',
        nomeExcel: 'DELTA',
        cor: '#E0E0A0',
        sigla: 'DE',
        interno: false,
        pessoasDoc: null,
      });
      d.locais.push({
        id: 'rua-b',
        tipo: 'casa',
        nome: 'Rua B',
        morada: '3 Rua Fictícia',
        pais: 'FR',
        lat: 49.1,
        lng: 6.2,
      });
      d.casas.push({
        id: 'casa-quatro',
        nome: 'Casa Quatro',
        nomeExcel: 'Casa Quatro',
        localId: 'rua-b',
        apartamento: null,
        lotacao: 6,
        moradoresDoc: null,
        maxContrato: 6,
        tolerado: 8,
        notaContrato: null,
      });
      d.carrinhas.push({
        id: 'ZZ1009',
        matricula: 'ZZ1009',
        matriculasAlternativas: [],
        tipo: 'carro',
        marca: 'Marca N',
        modelo: 'Modelo N',
        lugares: 5,
        pessoasDoc: 0,
        nota: 'Nova.',
      });
    });

    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    expect(r.tipo).toBe('aplicado');
    const depois = carregarEstado(bd);
    expect(depois.clientes.find((c) => c.id === 'delta')).toEqual(r.plano.novos.clientes[0]);
    expect(depois.locais.find((l) => l.id === 'rua-b')).toEqual(r.plano.novos.locais[0]);
    expect(depois.casas.find((c) => c.id === 'casa-quatro')).toEqual(r.plano.novos.casas[0]);
    expect(carrinha(depois, 'ZZ1009')).toEqual({
      id: 'ZZ1009',
      matricula: 'ZZ1009',
      tipo: 'carro',
      marca: 'Marca N',
      matriculasAlternativas: [],
      modelo: 'Modelo N',
      lugares: 5,
      dormeCasaId: null,
      dormeLocalId: null,
      temporaria: false,
      condutorId: null,
      nota: 'Nova.',
      ordem: 3,
    });
  });

  it('veículo vendido sai: quem lá ia fica sem transporte e "a confirmar", e o condutor é retirado', () => {
    const bd = prepararBd();
    const antes = carregarEstado(bd);
    const dados = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002');
    });

    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    expect(r.tipo).toBe('aplicado');
    const depois = carregarEstado(bd);

    expect(carrinha(depois, 'ZZ1002')).toBeUndefined();
    expect(pessoa(depois, 'p-rui')).toEqual({
      ...pessoa(antes, 'p-rui'),
      carrinhaId: null,
      carrinhaAConfirmar: true,
    });
    expect(pessoa(depois, 'p-eva')).toEqual({
      ...pessoa(antes, 'p-eva'),
      carrinhaId: null,
      carrinhaAConfirmar: true,
    });
    // Os outros não mudam.
    expect(pessoa(depois, 'p-ana')).toEqual(pessoa(antes, 'p-ana'));
    expect(pessoa(depois, 'p-gil')).toEqual(pessoa(antes, 'p-gil'));
    expect(carrinha(depois, 'ZZ1001')?.condutorId).toBe('p-ana');

    const linhas = bd
      .select()
      .from(alteracoes)
      .where(eq(alteracoes.loteId, r.tipo === 'aplicado' ? r.loteId : -1))
      .orderBy(asc(alteracoes.id))
      .all();
    expect(linhas.slice(0, 4).map((l) => [l.entidade, l.entidadeId, l.campo, l.antes, l.depois])).toEqual([
      // Pela ordem das pessoas no estado (por nome). A Eva já estava "a confirmar".
      ['pessoa', 'p-eva', 'carrinhaId', '"ZZ1002"', 'null'],
      ['pessoa', 'p-rui', 'carrinhaId', '"ZZ1002"', 'null'],
      ['pessoa', 'p-rui', 'carrinhaAConfirmar', 'false', 'true'],
      ['carrinha', 'ZZ1002', 'condutorId', '"p-rui"', 'null'],
    ]);
  });

  it('casa sem moradores sai e a carrinha que lá dormia fica com onde dorme por definir', () => {
    const bd = prepararBd();
    const dados = dadosCom((d) => {
      d.casas = d.casas.filter((c) => c.id !== 'casa-tres');
    });
    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    expect(r.tipo).toBe('aplicado');
    const depois = carregarEstado(bd);
    expect(depois.casas.map((c) => c.id)).not.toContain('casa-tres');
    expect(carrinha(depois, 'ZZ1001')).toMatchObject({
      dormeCasaId: null,
      dormeLocalId: null,
      condutorId: 'p-ana',
    });
  });

  it('cliente sem pessoas nem obras sai', () => {
    const bd = prepararBd();
    const dados = dadosCom((d) => {
      d.clientes = d.clientes.filter((c) => c.id !== 'gama');
    });
    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    expect(r.tipo).toBe('aplicado');
    expect(carregarEstado(bd).clientes.map((c) => c.id)).toEqual(['alfa', 'beta']);
  });

  it('trocas de valores únicos (cores, siglas, nomes de casas, matrículas) não colidem', () => {
    const bd = prepararBd();
    const dados = dadosCom((d) => {
      const [alfa, beta] = d.clientes;
      if (alfa && beta) {
        [alfa.cor, beta.cor] = [beta.cor, alfa.cor];
        [alfa.sigla, beta.sigla] = [beta.sigla, alfa.sigla];
      }
      const [um, dois] = d.casas;
      if (um && dois) [um.nome, dois.nome] = [dois.nome, um.nome];
      const [z1, z2] = d.carrinhas;
      if (z1 && z2) [z1.matricula, z2.matricula] = [z2.matricula, z1.matricula];
    });
    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    expect(r.tipo).toBe('aplicado');
    const depois = carregarEstado(bd);
    expect(depois.clientes.find((c) => c.id === 'alfa')).toMatchObject({ cor: '#C0F0C0', sigla: 'BE' });
    expect(depois.casas.find((c) => c.id === 'casa-um')?.nome).toBe('Casa Dois');
    expect(carrinha(depois, 'ZZ1001')?.matricula).toBe('ZZ1002');
  });

  it('erros bloqueantes: recusa e não grava nada', () => {
    const bd = prepararBd();
    const antes = carregarEstado(bd);
    const lotesAntes = bd.select().from(lotes).all();
    const dados = dadosCom((d) => {
      d.clientes = d.clientes.filter((c) => c.id !== 'alfa');
      d.casas = d.casas.filter((c) => c.id !== 'casa-um');
      // Isto sozinho seria gravado, mas com erros não se grava nada.
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002');
    });

    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    expect(r.tipo).toBe('recusado');
    expect(r.plano.erros).toHaveLength(2);
    expect(semData(carregarEstado(bd))).toEqual(semData(antes));
    expect(bd.select().from(lotes).all()).toEqual(lotesAntes);
  });

  it('carro temporário que não está no JSON fica, com quem lá vai e o condutor, mesmo quando outros saem', () => {
    const bd = prepararBd();
    const antes = carregarEstado(bd);
    const dados = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002');
    });

    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    expect(r.tipo).toBe('aplicado');
    const depois = carregarEstado(bd);
    expect(carrinha(depois, 'ZZ1002')).toBeUndefined();
    expect(carrinha(depois, 'ZZ1008')).toEqual(carrinha(antes, 'ZZ1008'));
    expect(pessoa(depois, 'p-gil')).toEqual(pessoa(antes, 'p-gil'));
    expect(aplicarSincronizacao(bd, dados, { agora: AGORA }).tipo).toBe('vazio');
  });

  it('carrinhas.json vazio: recusa e não grava nada (não tira a frota toda)', () => {
    const bd = prepararBd();
    const antes = carregarEstado(bd);
    const r = aplicarSincronizacao(
      bd,
      dadosCom((d) => {
        d.carrinhas = [];
      }),
      { agora: AGORA },
    );
    expect(r.tipo).toBe('recusado');
    expect(semData(carregarEstado(bd))).toEqual(semData(antes));
  });

  it('idempotente: correr outra vez não muda nada nem cria lote', () => {
    const bd = prepararBd();
    const dados = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002');
      d.casas = d.casas.filter((c) => c.id !== 'casa-tres');
      d.carrinhas.unshift({
        id: 'ZZ1000',
        matricula: 'ZZ1000',
        matriculasAlternativas: ['QQ1000'],
        tipo: 'carrinha',
        marca: null,
        modelo: 'Modelo N',
        lugares: 9,
        pessoasDoc: 0,
        nota: null,
      });
      const beta = d.clientes.find((c) => c.id === 'beta');
      if (beta) beta.nome = 'Beta Nova';
    });

    expect(aplicarSincronizacao(bd, dados, { agora: AGORA }).tipo).toBe('aplicado');
    const estado = carregarEstado(bd);
    const nLotes = bd.select().from(lotes).all().length;
    const nAlteracoes = bd.select().from(alteracoes).all().length;

    const segunda = aplicarSincronizacao(bd, dados, { agora: new Date('2026-10-05T09:00:00.000Z') });
    expect(segunda.tipo).toBe('vazio');
    expect(planoVazio(segunda.plano)).toBe(true);
    expect(semData(carregarEstado(bd))).toEqual(semData(estado));
    expect(bd.select().from(lotes).all()).toHaveLength(nLotes);
    expect(bd.select().from(alteracoes).all()).toHaveLength(nAlteracoes);
    expect(planoVazio(ensaiarSincronizacao(bd, dados).plano)).toBe(true);
  });

  it('histórico: UM lote "dados-iniciais"/ficha com o resumo e uma linha por campo; o histórico antigo fica', () => {
    const bd = prepararBd();
    const historicoAntes = bd.select().from(alteracoes).all();
    const lotesAntes = bd.select().from(lotes).all();
    const dados = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002');
      const zz1003 = d.carrinhas.find((c) => c.id === 'ZZ1003');
      if (zz1003) zz1003.modelo = 'Modelo D';
    });

    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    if (r.tipo !== 'aplicado') throw new Error(`esperava "aplicado", veio "${r.tipo}"`);
    expect(r.versao).toBe(r.loteId);
    expect(r.loteId).toBeGreaterThan(Math.max(...lotesAntes.map((l) => l.id)));

    expect(bd.select().from(lotes).where(eq(lotes.id, r.loteId)).get()).toEqual({
      id: r.loteId,
      autor: AUTOR_SINCRONIZACAO,
      tipo: 'ficha',
      estado: 'aplicado',
      criadoEm: AGORA.toISOString(),
      efetivoEm: AGORA.toISOString(),
      comentario: resumoDoPlano(r.plano),
    });
    const linhas = bd
      .select()
      .from(alteracoes)
      .where(eq(alteracoes.loteId, r.loteId))
      .orderBy(asc(alteracoes.id))
      .all();
    expect(linhas).toHaveLength(r.alteracoes);
    expect(linhas.map(({ id: _i, loteId: _l, ...resto }) => resto)).toEqual(alteracoesDoPlano(r.plano));
    expect(linhas.map((l) => `${l.entidadeId}.${l.campo}`)).toContain('ZZ1003.modelo');
    // O que já lá estava ficou igual.
    expect(bd.select().from(lotes).all().slice(0, lotesAntes.length)).toEqual(lotesAntes);
    expect(bd.select().from(alteracoes).all().slice(0, historicoAntes.length)).toEqual(historicoAntes);
  });
});

describe('ensaio e linha de comandos', () => {
  const pastas: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
  });

  function bdEmFicheiro(): string {
    const pasta = mkdtempSync(join(tmpdir(), 'mapa-cmf-sincronizar-'));
    pastas.push(pasta);
    const caminho = join(pasta, 'teste.db');
    const bd = prepararBd(abrirBd(caminho));
    bd.$client.close();
    return caminho;
  }

  it('o ensaio só lê: abre a base de dados só para leitura e não grava nada', () => {
    const caminho = bdEmFicheiro();
    const dados = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002');
    });
    const bd = abrirBdSoLeitura(caminho);
    try {
      const ensaio = ensaiarSincronizacao(bd, dados, AGORA);
      expect(ensaio.versao).toBe(2);
      expect(ensaio.plano.removidos.carrinhas.map((c) => c.id)).toEqual(['ZZ1002']);
      expect(() => aplicarSincronizacao(bd, dados, { agora: AGORA })).toThrow();
    } finally {
      bd.$client.close();
    }
    const outra = abrirBd(caminho);
    try {
      expect(carrinha(carregarEstado(outra), 'ZZ1002')).toBeDefined();
    } finally {
      outra.$client.close();
    }
  });

  it('recusa escrever o relatório dentro de dados-iniciais/ (só se lê de lá)', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const relatorio = join(PASTA_DADOS_INICIAIS, 'nao-escrever.html');
    expect(executarSincronizacao({ aplicar: false, bd: bdEmFicheiro(), relatorio })).toBe(1);
    expect(existsSync(relatorio)).toBe(false);
    expect(erro).toHaveBeenCalled();
  });

  it('argumentos: só --aplicar, --bd e --relatorio; um engano nunca cai na base de dados por omissão', () => {
    expect(lerArgumentosSincronizacao([])).toEqual({ opcoes: { aplicar: false } });
    expect(
      lerArgumentosSincronizacao(['--bd', 'dados/copia.db', '--aplicar', '--relatorio=dados/r.html']),
    ).toEqual({ opcoes: { aplicar: true, bd: 'dados/copia.db', relatorio: 'dados/r.html' } });
    expect(lerArgumentosSincronizacao(['--bd=dados/copia.db'])).toEqual({
      opcoes: { aplicar: false, bd: 'dados/copia.db' },
    });
    // "--db" (engano comum) gravava na base de dados verdadeira: agora é erro.
    expect(lerArgumentosSincronizacao(['--db', 'dados/copia.db', '--aplicar'])).toEqual({
      erro: 'Argumento desconhecido: --db. Use só --aplicar, --bd <caminho> e --relatorio <caminho>.',
    });
    expect(lerArgumentosSincronizacao(['--aplicar', '--bd'])).toEqual({
      erro: 'Falta o caminho depois de --bd.',
    });
    expect(lerArgumentosSincronizacao(['--bd', '--aplicar'])).toEqual({
      erro: 'Falta o caminho depois de --bd.',
    });
    expect(lerArgumentosSincronizacao(['--bd='])).toEqual({ erro: 'Falta o caminho depois de --bd.' });
    expect(lerArgumentosSincronizacao(['--bd', 'a.db', '--bd', 'b.db'])).toEqual({ erro: '--bd repetido.' });
    expect(lerArgumentosSincronizacao(['copia.db'])).toHaveProperty('erro');
  });

  it('base de dados que não existe: erro, sem a criar', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pasta = mkdtempSync(join(tmpdir(), 'mapa-cmf-sincronizar-'));
    pastas.push(pasta);
    const caminho = join(pasta, 'nao-existe.db');
    expect(
      executarSincronizacao({ aplicar: true, bd: caminho, relatorio: join(pasta, 'relatorio.html') }),
    ).toBe(1);
    expect(existsSync(caminho)).toBe(false);
  });
});
