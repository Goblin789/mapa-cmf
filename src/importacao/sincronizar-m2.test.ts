// Sincronizar sem desfazer edições (M2): campos mudados no programa ficam ("Ficou o valor do programa"),
// --usar-json, registos apagados no programa não voltam, e os problemas das casas e veículos que saem.
// Bases de dados em memória (com as chaves estrangeiras ligadas), dados fictícios.

import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Operacao } from '../dominio/operacoes';
import { alteracoes, indisponibilidades, lotes, problemas } from '../servidor/db/esquema';
import { abrirBd, type Bd } from '../servidor/db/ligacao';
import { carregarEstado } from '../servidor/estado';
import { gravarLote } from '../servidor/lotes';
import { aplicarNaBd } from './aplicar';
import { lerArgumentosSincronizacao, textoConsola } from './executarSincronizacao';
import { gerarRelatorioSincronizacao } from './relatorioSincronizacao';
import {
  alteracoesDoPlano,
  contarPlano,
  frasesDoPlano,
  planearSincronizacao,
  planoVazio,
  resumoDoPlano,
} from './sincronizar';
import { aplicarSincronizacao, ensaiarSincronizacao, lerEditados } from './sincronizarBd';
import { estadoFicticio, referenciaFicticia } from './sincronizarFicticios';
import type { DadosReferencia } from './tipos';

const IMPORTADO = new Date('2026-10-01T08:00:00.000Z');
const AGORA = new Date('2026-10-04T09:30:00.000Z');

let bd: Bd;

beforeEach(() => {
  bd = abrirBd(':memory:');
  const { versao: _v, geradoEm: _g, ...entidades } = estadoFicticio();
  aplicarNaBd(bd, entidades, { agora: IMPORTADO, comentario: 'Importação fictícia' });
});

afterEach(() => {
  if (bd.$client.open) bd.$client.close();
});

function dadosCom(mudar: (d: DadosReferencia) => void): DadosReferencia {
  const d = referenciaFicticia();
  mudar(d);
  return d;
}

/** Uma gravação no programa (o servidor, autor 'local'). */
function noPrograma(operacoes: Operacao[]): void {
  expect(gravarLote(bd, { operacoes, comentario: null, autor: 'local', agora: AGORA })).toMatchObject({
    tipo: 'gravado',
  });
}

const lotacaoCasaUm = (de: number, para: number): Operacao => ({
  tipo: 'campo',
  entidade: 'casa',
  id: 'casa-um',
  campo: 'lotacao',
  de,
  para,
});

describe('planearSincronizacao com editados (função pura)', () => {
  const estado = estadoFicticio();

  it('um campo editado no programa fica, e aparece em "mantidos"; os outros campos mudam', () => {
    const dados = dadosCom((d) => {
      const casa = d.casas.find((c) => c.id === 'casa-um');
      if (casa) Object.assign(casa, { lotacao: 7, maxContrato: 6 });
    });
    const plano = planearSincronizacao(dados, estado, new Set(['casa:casa-um:lotacao']));
    expect(plano.mantidos).toEqual([
      {
        entidade: 'casa',
        id: 'casa-um',
        rotulo: 'Casa Um',
        campo: 'lotacao',
        valorPrograma: 4,
        valorJson: 7,
      },
    ]);
    expect(plano.alterados).toEqual([
      {
        entidade: 'casa',
        id: 'casa-um',
        rotulo: 'Casa Um',
        mudancas: [{ campo: 'maxContrato', antes: 4, depois: 6 }],
      },
    ]);
    expect(contarPlano(plano).mantidos).toBe(1);
    expect(resumoDoPlano(plano)).toContain('1 campo ficou com o valor do programa.');
    // --usar-json aplica o do JSON.
    const forcado = planearSincronizacao(
      dados,
      estado,
      new Set(['casa:casa-um:lotacao']),
      new Set(['casa:casa-um:lotacao']),
    );
    expect(forcado.mantidos).toEqual([]);
    expect(forcado.alterados[0]?.mudancas.map((m) => m.campo)).toEqual(['lotacao', 'maxContrato']);
  });

  it('só os campos editados que mudariam: sem diferença no JSON não há nada a dizer', () => {
    const plano = planearSincronizacao(referenciaFicticia(), estado, new Set(['casa:casa-um:lotacao']));
    expect(plano.mantidos).toEqual([]);
    expect(planoVazio(plano)).toBe(true);
  });

  it('um registo apagado no programa não volta a entrar', () => {
    const dados = dadosCom((d) => {
      d.locais.push({ ...(d.locais[0] as DadosReferencia['locais'][number]), id: 'rua-z', nome: 'Rua Z' });
    });
    expect(planearSincronizacao(dados, estado).novos.locais.map((l) => l.id)).toEqual(['rua-z']);
    const plano = planearSincronizacao(dados, estado, new Set(['local:rua-z:@registo']));
    expect(plano.novos.locais).toEqual([]);
    expect(plano.apagadosNoPrograma).toEqual([{ entidade: 'local', id: 'rua-z', rotulo: 'Local Rua Z' }]);
    expect(frasesDoPlano(plano, estado)).toContain('Local Rua Z foi apagado no programa: não volta a entrar');
  });

  it('a frase do apagado no programa concorda com o registo: a casa "apagada", o apartamento "apagado"', () => {
    const plano = planearSincronizacao(referenciaFicticia(), estado);
    plano.apagadosNoPrograma.push(
      { entidade: 'casa', id: 'casa-tres', rotulo: 'Casa Três' },
      { entidade: 'casa', id: 'apartamento-z', rotulo: 'Apartamento Z' },
    );
    expect(frasesDoPlano(plano, estado)).toEqual(
      expect.arrayContaining([
        'Casa Três foi apagada no programa: não volta a entrar',
        'Apartamento Z foi apagado no programa: não volta a entrar',
      ]),
    );
  });

  it('casas e veículos que saem: com problemas por resolver, recusado; os resolvidos apagam-se antes', () => {
    const semZZ1002 = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002' && c.id !== 'ZZ1003');
      d.casas = d.casas.filter((c) => c.id !== 'casa-tres');
    });
    const aberto = {
      id: 'problema-a',
      casaId: null,
      carrinhaId: 'ZZ1002',
      texto: 'Pneu',
      abertoEm: '2026-09-01',
      resolvidoEm: null,
    };
    const resolvido = { ...aberto, id: 'problema-r', resolvidoEm: '2026-09-02' };
    const daCasa = { ...aberto, id: 'problema-c', casaId: 'casa-tres', carrinhaId: null };
    const doCarro = { ...resolvido, id: 'problema-d', carrinhaId: 'ZZ1003' };
    const recusado = planearSincronizacao(semZZ1002, {
      ...estado,
      problemas: [aberto, resolvido, daCasa, doCarro],
    });
    expect(recusado.erros.map((e) => e.mensagem)).toEqual([
      'A casa "Casa Três" tem 1 problema por resolver: resolve-o antes.',
      'A carrinha ZZ 1002 tem 1 problema por resolver: resolve-o antes.',
    ]);
    const plano = planearSincronizacao(semZZ1002, {
      ...estado,
      problemas: [resolvido, { ...daCasa, resolvidoEm: '2026-09-03' }, doCarro],
    });
    expect(plano.erros).toEqual([]);
    expect(plano.problemasApagados.map((p) => p.id)).toEqual(['problema-c', 'problema-r', 'problema-d']);
    expect(alteracoesDoPlano(plano).filter((l) => l.entidade === 'problema')).toEqual([
      {
        entidade: 'problema',
        entidadeId: 'problema-c',
        campo: '@registo',
        antes: expect.any(String),
        depois: null,
      },
      {
        entidade: 'problema',
        entidadeId: 'problema-r',
        campo: '@registo',
        antes: expect.any(String),
        depois: null,
      },
      {
        entidade: 'problema',
        entidadeId: 'problema-d',
        campo: '@registo',
        antes: expect.any(String),
        depois: null,
      },
    ]);
    // Dois problemas abertos: plural.
    const dois = planearSincronizacao(semZZ1002, {
      ...estado,
      problemas: [aberto, { ...aberto, id: 'problema-b' }],
    });
    expect(dois.erros.map((e) => e.mensagem)).toContain(
      'A carrinha ZZ 1002 tem 2 problemas por resolver: resolve-os antes.',
    );
  });
});

describe('na base de dados', () => {
  it('lerEditados: só a linha mais recente de cada campo conta, e só a do programa', () => {
    expect(lerEditados(bd)).toEqual(new Set());
    noPrograma([lotacaoCasaUm(4, 6)]);
    expect(lerEditados(bd)).toEqual(new Set(['casa:casa-um:lotacao']));
    // A sincronização com --usar-json grava uma linha 'dados-iniciais': o campo deixa de contar.
    const dados = dadosCom((d) => {
      const casa = d.casas.find((c) => c.id === 'casa-um');
      if (casa) casa.lotacao = 5;
    });
    const r = aplicarSincronizacao(bd, dados, { agora: AGORA, usarJson: new Set(['casa:casa-um:lotacao']) });
    expect(r).toMatchObject({ tipo: 'aplicado' });
    expect(lerEditados(bd)).toEqual(new Set());
    expect(carregarEstado(bd).casas.find((c) => c.id === 'casa-um')?.lotacao).toBe(5);
  });

  it('um campo mudado no programa fica; o relatório e a consola dizem-no; o resto aplica-se', () => {
    noPrograma([lotacaoCasaUm(4, 6)]);
    const dados = dadosCom((d) => {
      const casa = d.casas.find((c) => c.id === 'casa-um');
      if (casa) Object.assign(casa, { lotacao: 5, maxContrato: 3 });
    });
    const ensaio = ensaiarSincronizacao(bd, dados, AGORA);
    expect(ensaio.plano.mantidos).toEqual([
      {
        entidade: 'casa',
        id: 'casa-um',
        rotulo: 'Casa Um',
        campo: 'lotacao',
        valorPrograma: 6,
        valorJson: 5,
      },
    ]);
    const meta = {
      agora: AGORA,
      modo: 'ensaio' as const,
      bd: 'copia.db',
      versao: 2,
      loteId: null,
      falha: null,
    };
    const html = gerarRelatorioSincronizacao(ensaio.plano, ensaio.estado, meta);
    expect(html).toContain('6. Ficou o valor do programa');
    expect(html).toContain('--usar-json casa:casa-um:lotacao');
    const consola = textoConsola(ensaio.plano, ensaio.estado, meta, 'r.html');
    expect(consola).toContain('Ficou o valor do programa (campos mudados no programa): 1');
    expect(consola).toContain('npm run sincronizar -- --aplicar --usar-json casa:casa-um:lotacao');

    const r = aplicarSincronizacao(bd, dados, { agora: AGORA });
    expect(r).toMatchObject({ tipo: 'aplicado' });
    expect(carregarEstado(bd).casas.find((c) => c.id === 'casa-um')).toMatchObject({
      lotacao: 6,
      maxContrato: 3,
    });
    // O lote grava uma linha por campo (só o que mudou).
    const linhas = bd
      .select()
      .from(alteracoes)
      .where(eq(alteracoes.loteId, r.tipo === 'aplicado' ? r.loteId : -1))
      .orderBy(asc(alteracoes.id))
      .all();
    expect(linhas.map((l) => [l.entidade, l.entidadeId, l.campo, l.antes, l.depois])).toEqual([
      ['casa', 'casa-um', 'maxContrato', '4', '3'],
    ]);
  });

  it('os problemas resolvidos de um veículo que sai apagam-se antes dele (com as chaves estrangeiras ligadas)', () => {
    noPrograma([
      {
        tipo: 'registo',
        entidade: 'problema',
        id: 'problema-00000001',
        de: null,
        para: {
          id: 'problema-00000001',
          casaId: null,
          carrinhaId: 'ZZ1003',
          texto: 'Luz',
          abertoEm: '2026-10-04',
          resolvidoEm: null,
        },
      },
    ]);
    const semZZ1003 = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1003');
    });
    expect(aplicarSincronizacao(bd, semZZ1003, { agora: AGORA })).toMatchObject({ tipo: 'recusado' });
    noPrograma([
      {
        tipo: 'campo',
        entidade: 'problema',
        id: 'problema-00000001',
        campo: 'resolvidoEm',
        de: null,
        para: '2026-10-04',
      },
    ]);
    const r = aplicarSincronizacao(bd, semZZ1003, { agora: AGORA });
    expect(r).toMatchObject({ tipo: 'aplicado' });
    expect(bd.select().from(problemas).all()).toEqual([]);
    expect(carregarEstado(bd).carrinhas.map((c) => c.id)).not.toContain('ZZ1003');
    expect(bd.$client.pragma('foreign_key_check')).toEqual([]);
  });

  it('casas no programa (05/10/2026): a criada no programa não sai; a apagada no programa não volta; nome igual ao de uma do programa é recusado', () => {
    const nova = {
      id: 'casa-1b2c3d4e-0000-4000-8000-000000000051',
      nome: 'Casa Nova',
      localId: 'rua-a',
      apartamento: null,
      lotacao: 3,
      maxContrato: null,
      tolerado: null,
      notaContrato: null,
      senhorio: null,
      equipamento: null,
      sempreCheia: false,
      ordem: 9,
    };
    const casaTres = carregarEstado(bd).casas.find((c) => c.id === 'casa-tres');
    noPrograma([
      { tipo: 'registo', entidade: 'casa', id: nova.id, de: null, para: nova },
      { tipo: 'registo', entidade: 'casa', id: 'casa-tres', de: casaTres ?? null, para: null },
      // A ZZ 1001 dormia na Casa Três.
      { tipo: 'dormida', carrinhaId: 'ZZ1001', de: 'casa:casa-tres', para: null },
    ]);
    const ensaio = ensaiarSincronizacao(bd, referenciaFicticia(), AGORA);
    expect(ensaio.plano.erros).toEqual([]);
    expect(ensaio.plano.removidos.casas).toEqual([]);
    expect(ensaio.plano.casasDoPrograma.map((c) => c.id)).toEqual([nova.id]);
    expect(ensaio.plano.novos.casas).toEqual([]);
    expect(ensaio.plano.apagadosNoPrograma).toEqual([
      { entidade: 'casa', id: 'casa-tres', rotulo: 'Casa Três' },
    ]);
    const relatorio = gerarRelatorioSincronizacao(ensaio.plano, ensaio.estado, {
      agora: AGORA,
      modo: 'ensaio',
      bd: ':memory:',
      versao: ensaio.versao,
      loteId: null,
      falha: null,
    });
    expect(relatorio).toContain('Casas criadas no programa (ficam): Casa Nova.');
    expect(aplicarSincronizacao(bd, referenciaFicticia(), { agora: AGORA })).toMatchObject({ tipo: 'vazio' });
    expect(
      carregarEstado(bd)
        .casas.map((c) => c.id)
        .sort(),
    ).toEqual(['casa-dois', 'casa-um', nova.id].sort());

    const comONome = dadosCom((d) => {
      const um = d.casas.find((c) => c.id === 'casa-um');
      if (um) um.nome = 'Casa Nova';
    });
    const recusado = aplicarSincronizacao(bd, comONome, { agora: AGORA });
    expect(recusado.tipo).toBe('recusado');
    expect(recusado.plano.erros.map((e) => e.mensagem)).toEqual([
      'A casa "Casa Nova" de casas.json tem o nome de uma casa criada no programa: não pode haver duas com o mesmo nome. Muda o nome de uma delas (no programa ou no JSON).',
    ]);
  });

  it('importar --aplicar --forcar apaga também os problemas e os períodos (antes das pessoas, casas e carrinhas)', () => {
    noPrograma([
      {
        tipo: 'registo',
        entidade: 'indisponibilidade',
        id: 'indisp-00000001',
        de: null,
        para: { id: 'indisp-00000001', pessoaId: 'p-ana', inicio: '2026-10-05', fim: null },
      },
      {
        tipo: 'registo',
        entidade: 'problema',
        id: 'problema-00000002',
        de: null,
        para: {
          id: 'problema-00000002',
          casaId: 'casa-um',
          carrinhaId: null,
          texto: 'Porta',
          abertoEm: '2026-10-04',
          resolvidoEm: null,
        },
      },
    ]);
    const { versao: _v, geradoEm: _g, ...entidades } = estadoFicticio();
    expect(() => aplicarNaBd(bd, entidades, { agora: AGORA, comentario: 'de novo' })).toThrow();
    aplicarNaBd(bd, entidades, { agora: AGORA, comentario: 'de novo', forcar: true });
    expect(bd.select().from(problemas).all()).toEqual([]);
    expect(bd.select().from(indisponibilidades).all()).toEqual([]);
    expect(bd.select().from(lotes).all()).toHaveLength(1);
  });
});

describe('argumentos --usar-json', () => {
  it('repetível, com o formato entidade:id:campo', () => {
    expect(
      lerArgumentosSincronizacao([
        '--aplicar',
        '--usar-json',
        'casa:casa-um:lotacao',
        '--usar-json=carrinha:ZZ1001:nota',
      ]),
    ).toEqual({ opcoes: { aplicar: true, usarJson: ['casa:casa-um:lotacao', 'carrinha:ZZ1001:nota'] } });
    expect(lerArgumentosSincronizacao(['--usar-json', 'casa-um:lotacao'])).toEqual({
      erro: '--usar-json leva entidade:id:campo (ex.: --usar-json casa:casa-um:lotacao).',
    });
    expect(lerArgumentosSincronizacao(['--usar-json'])).toHaveProperty('erro');
    expect(lerArgumentosSincronizacao(['--usar-json', 'pessoa:p-ana:nome'])).toHaveProperty('erro');
  });
});
