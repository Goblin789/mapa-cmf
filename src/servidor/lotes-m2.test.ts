// Gravar as operações do M2 ('campo' e 'registo'), conflitos, reverter e histórico: gravarLote e a app de ponta
// a ponta (base de dados em memória, dados fictícios).

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConflitoServidor, EntradaHistorico } from '../dominio/api';
import type { CampoEditavel, EntidadeEditavel, ValorCampo } from '../dominio/campos';
import { type Operacao, operacaoApagar, operacaoCriar } from '../dominio/operacoes';
import { planearReversao } from '../dominio/reverter';
import type { Local, Obra, Pessoa } from '../dominio/tipos';
import { criarApp } from './app';
import { inserirDadosFicticios, inserirDadosM2, inserirLotes } from './dados-de-teste';
import * as esquema from './db/esquema';
import { abrirBd, type Bd } from './db/ligacao';
import { carregarEstado } from './estado';
import { gravarLote, lerHistorico } from './lotes';

/** 2026-10-04 no Luxemburgo. */
const AGORA = new Date('2026-10-04T10:00:00.000Z');
const ID = '1b2c3d4e-0000-4000-8000-0000000000';

let bd: Bd;

beforeEach(() => {
  bd = abrirBd(':memory:');
  inserirDadosFicticios(bd);
  inserirDadosM2(bd);
  // Lote 1: a importação.
  inserirLotes(bd, 1);
});

afterEach(() => {
  if (bd.$client.open) bd.$client.close();
});

function campo(
  entidade: EntidadeEditavel,
  id: string,
  nome: CampoEditavel,
  de: ValorCampo,
  para: ValorCampo,
): Operacao {
  return { tipo: 'campo', entidade, id, campo: nome, de, para };
}

function mover(
  pessoaId: string,
  c: 'casaId' | 'carrinhaId' | 'obraId',
  de: string | null,
  para: string | null,
): Operacao {
  return { tipo: 'mover', pessoaId, campo: c, de, para };
}

function gravar(operacoes: Operacao[], extra: { reverte?: number[]; autor?: string } = {}) {
  return gravarLote(bd, {
    operacoes,
    comentario: null,
    autor: extra.autor ?? 'ana@exemplo.lu',
    agora: AGORA,
    ...extra,
  });
}

const estado = () => carregarEstado(bd, AGORA);
const completo = () => carregarEstado(bd, AGORA, { completo: true });

const localNovo: Local = {
  id: `local-${ID}01`,
  tipo: 'obra',
  nome: 'Obra Nova',
  morada: 'Rue X, Luxembourg',
  pais: 'LU',
  lat: 49.61,
  lng: 6.12,
  raioM: 150,
};
const obraNova: Obra = {
  id: `obra-${ID}01`,
  nome: 'Obra Nova',
  clienteId: 'cli-alfa',
  localId: localNovo.id,
  estacionamentoLocalId: null,
  origem: 'manual',
};

describe('gravarLote: operações novas', () => {
  it('criar uma obra (local + obra) e mover uma pessoa para lá, com o mover antes do criar no pedido', () => {
    const r = gravar([
      mover('p-alvaro', 'obraId', null, obraNova.id),
      operacaoCriar('obra', obraNova),
      operacaoCriar('local', localNovo),
    ]);
    expect(r).toMatchObject({ tipo: 'gravado', loteId: 2, operacoes: 3 });
    const e = estado();
    expect(e.obras.find((o) => o.id === obraNova.id)).toStrictEqual(obraNova);
    expect(e.locais.find((l) => l.id === localNovo.id)).toStrictEqual(localNovo);
    expect(e.pessoas.find((p) => p.id === 'p-alvaro')?.obraId).toBe(obraNova.id);
    const lote = bd.select().from(esquema.lotes).where(eq(esquema.lotes.id, 2)).get();
    expect(lote).toMatchObject({ tipo: 'mudanca', reverte: null, autor: 'ana@exemplo.lu' });
    // Linhas pelas fases: inserts (local antes da obra), depois a pessoa; o registo na forma do Estado.
    const linhas = bd.select().from(esquema.alteracoes).all();
    expect(linhas.map((l) => [l.entidade, l.campo, l.antes])).toEqual([
      ['local', '@registo', null],
      ['obra', '@registo', null],
      ['pessoa', 'obraId', 'null'],
    ]);
    expect(linhas[1]?.depois).toBe(JSON.stringify(obraNova));
  });

  it('uma pessoa nova vai logo para uma casa e uma carrinha no mesmo lote', () => {
    const nova: Pessoa = {
      id: `pessoa-${ID}02`,
      numero: '000-099',
      numeroOriginal: null,
      apelidos: 'Nova',
      nome: 'Rita',
      nomeCurto: 'Rita Nova',
      nomesAlternativos: [],
      clienteId: 'cli-beta',
      obraId: null,
      casaId: null,
      carrinhaId: null,
      casaAConfirmar: false,
      carrinhaAConfirmar: false,
      telefone: null,
      temCarta: true,
      cartaValidade: '2028-01-01',
      ativa: true,
    };
    const r = gravar([
      operacaoCriar('pessoa', nova),
      mover(nova.id, 'casaId', null, 'casa-monte'),
      mover(nova.id, 'carrinhaId', null, 'car-1'),
    ]);
    expect(r).toMatchObject({ tipo: 'gravado' });
    expect(estado().pessoas.find((p) => p.id === nova.id)).toMatchObject({
      casaId: 'casa-monte',
      carrinhaId: 'car-1',
    });
    expect(lerHistorico(bd, 1)[0]?.alteracoes.map((a) => a.descricao)).toEqual([
      'Rita Nova — entrou (Construtora Beta)',
      'Rita Nova — casa: Fora das casas CMF → Casa Monte',
      'Rita Nova — carrinha: Sem transporte da empresa → ZZ 0001',
    ]);
  });

  it('apagar uma obra com pessoas → inválido; o local antes da obra no pedido → gravado (FK no fim)', () => {
    gravar([
      operacaoCriar('local', localNovo),
      operacaoCriar('obra', obraNova),
      mover('p-alvaro', 'obraId', null, obraNova.id),
    ]);
    const e = completo();
    const apagarObra = operacaoApagar(e, 'obra', obraNova.id) as Operacao;
    const apagarLocal = operacaoApagar(e, 'local', localNovo.id) as Operacao;
    expect(gravar([apagarObra])).toStrictEqual({
      tipo: 'invalido',
      erros: ['Obra Nova — ainda tem 1 pessoa: muda-as para outra obra antes de a apagar.'],
    });
    expect(gravar([apagarLocal, apagarObra, mover('p-alvaro', 'obraId', obraNova.id, null)])).toMatchObject({
      tipo: 'gravado',
    });
    expect(estado().obras.map((o) => o.id)).toEqual(['obra-vale']);
    // A obra apagada continua com nome nas frases dos lotes que a mostram.
    expect(lerHistorico(bd, 2)[1]?.alteracoes.map((a) => a.descricao)).toContain(
      'Álvaro Exemplo — obra: sem obra → Obra Nova',
    );
    expect(estado().locais.map((l) => l.id)).not.toContain(localNovo.id);
    // Linhas: a pessoa sai primeiro (fase 3), depois a obra e por fim o local (fase 4).
    expect(lerHistorico(bd, 1)[0]?.alteracoes.map((a) => [a.entidade, a.campo, a.depois])).toEqual([
      ['pessoa', 'obraId', 'null'],
      ['obra', '@registo', null],
      ['local', '@registo', null],
    ]);
  });

  it('o local de uma obra dos dados iniciais não se apaga; local "oficina" ou raio 50000 recusados', () => {
    const e = completo();
    expect(gravar([operacaoApagar(e, 'local', 'loc-parque') as Operacao])).toMatchObject({
      tipo: 'invalido',
    });
    expect(gravar([operacaoCriar('local', { ...localNovo, tipo: 'oficina' })])).toStrictEqual({
      tipo: 'invalido',
      erros: ['Obra Nova — Só se criam locais de obra ou estacionamento.'],
    });
    expect(gravar([operacaoCriar('local', { ...localNovo, raioM: 50000 })])).toMatchObject({
      tipo: 'invalido',
    });
  });

  it('período sobreposto → inválido, também com um período antigo que o Estado filtrado já não leva', () => {
    // O antigo (01/08 a 03/09) do Zé já não vem no GET /api/estado, mas conta.
    expect(estado().indisponibilidades.map((p) => p.id)).not.toContain('indisp-antigo01');
    const novo = { id: `indisp-${ID}03`, pessoaId: 'p-ze', inicio: '2026-09-01', fim: '2026-09-05' };
    expect(gravar([operacaoCriar('indisponibilidade', novo)])).toStrictEqual({
      tipo: 'invalido',
      erros: [
        'Zé Teste — já está indisponível de 01/08/2026 a 03/09/2026: os períodos não se podem sobrepor.',
      ],
    });
    expect(
      gravar([operacaoCriar('indisponibilidade', { ...novo, inicio: '2026-09-10', fim: '2026-09-12' })]),
    ).toMatchObject({
      tipo: 'gravado',
    });
  });

  it('problema aberto e depois resolvido: lotes "ficha", com as frases', () => {
    const problema = {
      id: `problema-${ID}04`,
      casaId: null,
      carrinhaId: 'car-1',
      texto: 'Espelho partido',
      abertoEm: '2026-10-04',
      resolvidoEm: null,
    };
    expect(gravar([operacaoCriar('problema', problema)])).toMatchObject({ tipo: 'gravado', loteId: 2 });
    expect(gravar([campo('problema', problema.id, 'resolvidoEm', null, '2026-10-04')])).toMatchObject({
      tipo: 'gravado',
      loteId: 3,
    });
    expect(
      bd
        .select({ tipo: esquema.lotes.tipo })
        .from(esquema.lotes)
        .all()
        .map((l) => l.tipo),
    ).toEqual(['importacao', 'ficha', 'ficha']);
    expect(lerHistorico(bd, 2).map((h) => h.alteracoes.map((a) => a.descricao))).toEqual([
      ['ZZ 0001 — problema resolvido: «Espelho partido»'],
      ['ZZ 0001 — problema aberto: «Espelho partido»'],
    ]);
  });

  it('trocar o nome no mapa (e o nº) entre duas pessoas: dois passos na BD, sem colidir', () => {
    expect(
      gravar([
        campo('pessoa', 'p-ze', 'nomeCurto', 'Zé Teste', 'Bruno Fictício'),
        campo('pessoa', 'p-bruno', 'nomeCurto', 'Bruno Fictício', 'Zé Teste'),
        campo('pessoa', 'p-ze', 'numero', '000-001', '000-001_3'),
        campo('pessoa', 'p-bruno', 'numero', '000-001_3', '000-001'),
      ]),
    ).toMatchObject({ tipo: 'gravado' });
    const pessoas = estado().pessoas;
    expect(pessoas.find((p) => p.id === 'p-ze')).toMatchObject({
      nomeCurto: 'Bruno Fictício',
      numero: '000-001_3',
    });
    expect(pessoas.find((p) => p.id === 'p-bruno')).toMatchObject({
      nomeCurto: 'Zé Teste',
      numero: '000-001',
    });
  });

  it('renomear uma pessoa e criar outra com o nome no mapa e o nº antigos dela, no mesmo lote', () => {
    const nova = (n: string): Pessoa => ({
      id: `pessoa-${ID}${n}`,
      numero: null,
      numeroOriginal: null,
      apelidos: 'Modelo',
      nome: 'Élia',
      nomeCurto: 'Élia Modelo',
      nomesAlternativos: [],
      clienteId: 'cli-beta',
      obraId: null,
      casaId: null,
      carrinhaId: null,
      casaAConfirmar: false,
      carrinhaAConfirmar: false,
      telefone: null,
      temCarta: null,
      cartaValidade: null,
      ativa: true,
    });
    // O criar vem antes dos 'campo' no pedido: na BD o novo entra com valores provisórios.
    const r = gravar([
      operacaoCriar('pessoa', { ...nova('05'), numero: '000-001' }),
      campo('pessoa', 'p-elia', 'nomeCurto', 'Élia Modelo', 'Élia M.'),
      campo('pessoa', 'p-ze', 'numero', '000-001', '000-009'),
    ]);
    expect(r).toMatchObject({ tipo: 'gravado' });
    const pessoas = estado().pessoas;
    expect(pessoas.find((p) => p.id === nova('05').id)).toMatchObject({
      nomeCurto: 'Élia Modelo',
      numero: '000-001',
    });
    expect(pessoas.find((p) => p.id === 'p-elia')?.nomeCurto).toBe('Élia M.');
    expect(pessoas.find((p) => p.id === 'p-ze')?.numero).toBe('000-009');
    // Nenhum valor provisório ficou na BD nem nas linhas do histórico.
    const provisorio = String.fromCharCode(1);
    expect(pessoas.some((p) => `${p.nomeCurto}${p.numero}`.includes(provisorio))).toBe(false);
    const linhas = bd.select().from(esquema.alteracoes).all();
    expect(linhas.some((l) => `${l.antes}${l.depois}`.includes(provisorio))).toBe(false);
    expect(lerHistorico(bd, 1)[0]?.alteracoes.map((a) => a.descricao)).toEqual([
      'Élia Modelo — entrou (Construtora Beta)',
      'Élia M. — nome no mapa: Élia Modelo → Élia M.',
      'Zé Teste — nº: 000-001 → 000-009',
    ]);
    // Um nº null entra como está (vários null não colidem).
    expect(gravar([operacaoCriar('pessoa', { ...nova('06'), nomeCurto: 'Élia N.' })])).toMatchObject({
      tipo: 'gravado',
    });
    expect(estado().pessoas.find((p) => p.id === nova('06').id)?.numero).toBeNull();
  });

  it('abrir e resolver um problema no mesmo rascunho grava-se num só lote', () => {
    const problema = {
      id: `problema-${ID}07`,
      casaId: 'casa-monte',
      carrinhaId: null,
      texto: 'Torneira a pingar',
      abertoEm: '2026-10-04',
      resolvidoEm: null,
    };
    const r = gravar([
      operacaoCriar('problema', problema),
      campo('problema', problema.id, 'resolvidoEm', null, '2026-10-04'),
    ]);
    expect(r).toMatchObject({ tipo: 'gravado', operacoes: 2 });
    expect(completo().problemas.find((p) => p.id === problema.id)?.resolvidoEm).toBe('2026-10-04');
    expect(lerHistorico(bd, 1)[0]?.alteracoes.map((a) => a.descricao)).toEqual([
      'Casa Monte — problema aberto: «Torneira a pingar»',
      'Casa Monte — problema resolvido: «Torneira a pingar»',
    ]);
    // E reverte-se inteiro (apaga-se), com o lote marcado.
    const plano = planearReversao(estado(), lerHistorico(bd, 1)[0]?.alteracoes ?? []);
    expect(plano.impossiveis).toEqual([]);
    expect(gravar(plano.operacoes, { reverte: [2] })).toMatchObject({ tipo: 'gravado', loteId: 3 });
    expect(completo().problemas.some((p) => p.id === problema.id)).toBe(false);
  });

  it('uma pessoa nova que sai logo da empresa (e com a carrinha a confirmar) grava-se', () => {
    const nova: Pessoa = {
      id: `pessoa-${ID}08`,
      numero: null,
      numeroOriginal: null,
      apelidos: 'Saída',
      nome: 'Rui',
      nomeCurto: 'Rui S.',
      nomesAlternativos: [],
      clienteId: 'cli-beta',
      obraId: null,
      casaId: null,
      carrinhaId: null,
      casaAConfirmar: false,
      carrinhaAConfirmar: false,
      telefone: null,
      temCarta: null,
      cartaValidade: null,
      ativa: true,
    };
    const r = gravar([
      operacaoCriar('pessoa', nova),
      campo('pessoa', nova.id, 'carrinhaAConfirmar', false, true),
      campo('pessoa', nova.id, 'ativa', true, false),
    ]);
    expect(r).toMatchObject({ tipo: 'gravado' });
    expect(completo().pessoas.find((p) => p.id === nova.id)).toMatchObject({
      ativa: false,
      carrinhaAConfirmar: true,
    });
  });

  it('o histórico usa o nome atual de um registo criado (a obra mudou de nome depois)', () => {
    gravar([
      operacaoCriar('local', localNovo),
      operacaoCriar('obra', obraNova),
      mover('p-alvaro', 'obraId', null, obraNova.id),
    ]);
    gravar([campo('obra', obraNova.id, 'nome', 'Obra Nova', 'Obra Renomeada')]);
    const lote2 = lerHistorico(bd, 5).find((h) => h.loteId === 2);
    expect(lote2?.alteracoes.map((a) => a.descricao)).toEqual([
      'Obra Renomeada — local criado: Rue X, Luxembourg',
      'Obra Renomeada — criada (Alfa Obras, Rue X, Luxembourg)',
      expect.stringMatching(/ — obra: .* → Obra Renomeada$/),
    ]);
  });

  it('campos de várias fichas (listas, booleanos, números, datas) gravam-se e voltam iguais', () => {
    expect(
      gravar([
        campo('carrinha', 'car-2', 'matriculasAlternativas', ['ZZ9999'], ['ZZ9999', 'ZZ8888']),
        campo('casa', 'casa-monte', 'sempreCheia', false, true),
        campo('casa', 'casa-monte', 'lotacao', 4, 5),
        campo('pessoa', 'p-alvaro', 'temCarta', false, true),
        campo('pessoa', 'p-alvaro', 'cartaValidade', null, '2029-05-31'),
        campo('local', 'loc-obra', 'lat', 49.6, 49.65),
        campo('local', 'loc-obra', 'lng', 6.1, 6.15),
      ]),
    ).toMatchObject({ tipo: 'gravado' });
    const e = estado();
    expect(e.carrinhas.find((c) => c.id === 'car-2')?.matriculasAlternativas).toEqual(['ZZ9999', 'ZZ8888']);
    expect(e.casas.find((c) => c.id === 'casa-monte')).toMatchObject({ sempreCheia: true, lotacao: 5 });
    expect(e.pessoas.find((p) => p.id === 'p-alvaro')).toMatchObject({
      temCarta: true,
      cartaValidade: '2029-05-31',
    });
    expect(e.locais.find((l) => l.id === 'loc-obra')).toMatchObject({ lat: 49.65, lng: 6.15 });
    // O histórico devolve TODAS as linhas (a lat e a lng, mesmo com a mesma frase).
    const frases = lerHistorico(bd, 1)[0]?.alteracoes.map((a) => a.descricao);
    expect(frases).toEqual([
      'ZZ 0002 — outras matrículas: ZZ 9999 → ZZ 9999, ZZ 8888',
      'Casa Monte — lugares iguais aos moradores: não → sim',
      'Casa Monte — lotação: 4 → 5',
      'Álvaro Exemplo — carta: não → sim',
      'Álvaro Exemplo — carta válida até: — → 31/05/2029',
      'Obra do Vale — pino mudado de sítio',
      'Obra do Vale — pino mudado de sítio',
    ]);
  });
});

describe('POST /api/lotes (M2)', () => {
  const app = () => criarApp({ bd, agora: () => AGORA });
  const postar = (corpo: unknown) =>
    app().request('/api/lotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });

  it('um "motivo" numa indisponibilidade é recusado (400) e nada se grava', async () => {
    const periodo = {
      id: `indisp-${ID}05`,
      pessoaId: 'p-ze',
      inicio: '2026-11-01',
      fim: null,
      motivo: 'baixa',
    };
    const r = await postar({
      versaoBase: 1,
      operacoes: [
        { tipo: 'registo', entidade: 'indisponibilidade', id: periodo.id, de: null, para: periodo },
      ],
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toStrictEqual({
      erro: 'Pedido inválido.',
      erros: ['operacoes[0].para: Chave inválida: "motivo"'],
    });
    expect(completo().indisponibilidades).toHaveLength(4);
  });

  it('um campo a mais numa operação ou no pedido também é recusado (400), não se deita fora', async () => {
    const versao = estado().versao;
    const r1 = await postar({
      versaoBase: 1,
      operacoes: [{ ...campo('casa', 'casa-monte', 'lotacao', 4, 5), motivo: 'x' }],
    });
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as { erros: string[] }).erros).toEqual([
      'operacoes[0]: Chave inválida: "motivo"',
    ]);
    const r2 = await postar({
      versaoBase: 1,
      operacoes: [
        { ...mover('p-ze', 'obraId', null, null), nota: 'x' },
        {
          ...operacaoCriar('indisponibilidade', {
            id: `indisp-${ID}06`,
            pessoaId: 'p-ze',
            inicio: '2026-11-01',
            fim: null,
          }),
          motivo: 'x',
        },
      ],
      extra: 1,
    });
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as { erros: string[] }).erros).toEqual([
      'operacoes[0]: Chave inválida: "nota"',
      'operacoes[1]: Chave inválida: "motivo"',
      'Chave inválida: "extra"',
    ]);
    expect(estado().versao).toBe(versao);
    expect(estado().casas.find((c) => c.id === 'casa-monte')?.lotacao).toBe(4);
  });

  it('apelidos opcionais (05/10/2026): pessoa nova sem apelidos e apelidos apagados gravam-se com ""; null → 400', async () => {
    const semApelidos: Pessoa = {
      id: `pessoa-${ID}09`,
      numero: null,
      numeroOriginal: null,
      apelidos: '',
      nome: 'Iva',
      nomeCurto: 'Iva',
      nomesAlternativos: [],
      clienteId: 'cli-beta',
      obraId: null,
      casaId: null,
      carrinhaId: null,
      casaAConfirmar: false,
      carrinhaAConfirmar: false,
      telefone: null,
      temCarta: null,
      cartaValidade: null,
      ativa: true,
    };
    const outra = completo().pessoas.find((p) => p.ativa && p.apelidos !== '');
    if (!outra) throw new Error('Faltam pessoas com apelidos nos dados fictícios');
    const r = await postar({
      versaoBase: estado().versao,
      operacoes: [
        operacaoCriar('pessoa', semApelidos),
        mover(semApelidos.id, 'casaId', null, 'casa-monte'),
        campo('pessoa', outra.id, 'apelidos', outra.apelidos, ''),
      ],
    });
    expect(r.status).toBe(201);
    const e = estado();
    expect(e.pessoas.find((p) => p.id === semApelidos.id)).toMatchObject({
      apelidos: '',
      casaId: 'casa-monte',
    });
    expect(e.pessoas.find((p) => p.id === outra.id)?.apelidos).toBe('');
    // No Histórico (pela ordem das fases da gravação), pelo nome no mapa; os apelidos apagados são "—".
    expect(lerHistorico(bd, 1)[0]?.alteracoes.map((a) => a.descricao)).toEqual([
      'Iva — entrou (Construtora Beta)',
      `${outra.nomeCurto} — apelidos: ${outra.apelidos} → —`,
      'Iva — casa: Fora das casas CMF → Casa Monte',
    ]);
    // Vazio é "" (a coluna é NOT NULL): null é recusado e nada se grava.
    const versao = estado().versao;
    const r2 = await postar({
      versaoBase: versao,
      operacoes: [campo('pessoa', semApelidos.id, 'apelidos', '', null)],
    });
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as { erros: string[] }).erros).toEqual([
      'operacoes[0].para: Apelidos: fica vazio com "", não com null.',
    ]);
    expect(estado().versao).toBe(versao);
  });

  it('local "oficina", campo que não se edita e valor fora dos limites → 400 com frases em português', async () => {
    const r1 = await postar({
      versaoBase: 1,
      operacoes: [operacaoCriar('local', { ...localNovo, tipo: 'oficina' })],
    });
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as { erros: string[] }).erros).toEqual([
      'operacoes[0].para: Só se criam locais de obra ou estacionamento.',
    ]);
    const r2 = await postar({
      versaoBase: 1,
      operacoes: [campo('casa', 'casa-monte', 'ordem' as never, 1, 2)],
    });
    expect(((await r2.json()) as { erros: string[] }).erros).toEqual([
      'operacoes[0].campo: O campo ordem não se pode mudar.',
    ]);
    const r3 = await postar({ versaoBase: 1, operacoes: [campo('casa', 'casa-monte', 'lotacao', 4, 61)] });
    expect(((await r3.json()) as { erros: string[] }).erros).toEqual([
      'operacoes[0].para: Lotação: tem de ser um número inteiro de 0 a 60.',
    ]);
    const pessoa = completo().pessoas[0];
    const r4 = await postar({
      versaoBase: 1,
      operacoes: [{ tipo: 'registo', entidade: 'pessoa', id: pessoa?.id, de: pessoa, para: null }],
    });
    expect(((await r4.json()) as { erros: string[] }).erros).toEqual([
      'operacoes[0]: Uma pessoa não se apaga: usa "Saiu da empresa".',
    ]);
  });

  it('conflitos 409 de "campo" e de "registo", com frases legíveis; nada se grava', async () => {
    // Alguém mudou a lotação para 6, apagou um problema, mudou o texto de outro e criou a Obra Nova. Cada
    // frase diz quem foi (o nome, como no Histórico) e quando.
    bd.insert(esquema.utilizadores)
      .values({
        id: 'oid-ana',
        email: 'ana@exemplo.lu',
        nome: 'Ana Exemplo',
        criadoEm: AGORA.toISOString(),
        ultimaEntradaEm: AGORA.toISOString(),
      })
      .run();
    const problema = completo().problemas.find((p) => p.id === 'problema-aberto1');
    gravar([campo('casa', 'casa-monte', 'lotacao', 4, 6)]);
    gravar([operacaoApagar(completo(), 'problema', 'problema-aberto2') as Operacao]);
    gravar([campo('problema', 'problema-aberto1', 'texto', 'Esquentador avariado', 'Esquentador')]);
    gravar([operacaoCriar('local', localNovo), operacaoCriar('obra', obraNova)]);
    const antes = { lotes: bd.select().from(esquema.lotes).all(), estado: completo() };
    const r = await postar({
      versaoBase: 1,
      operacoes: [
        campo('casa', 'casa-monte', 'lotacao', 4, 5),
        campo('problema', 'problema-aberto2', 'texto', 'Pneu furado', 'Pneu'),
        { tipo: 'registo', entidade: 'problema', id: 'problema-aberto1', de: problema, para: null },
        operacaoCriar('obra', obraNova),
      ],
    });
    expect(r.status).toBe(409);
    const corpo = (await r.json()) as { erro: string; conflitos: ConflitoServidor[] };
    expect(corpo.conflitos.map((c) => c.descricao)).toEqual([
      'Casa Monte — lotação: esperavas 4, mas agora é 6 (Ana Exemplo, 04/10 12:00)',
      'O problema que estavas a mudar já não existe (Ana Exemplo, 04/10 12:00)',
      'Casa Ribeira — mudou entretanto (Ana Exemplo, 04/10 12:00): não se apaga sem veres o que mudou',
      'Obra Nova — já existe (Ana Exemplo, 04/10 12:00)',
    ]);
    expect(corpo.erro).toBe('Alguém gravou mudanças nestas mesmas coisas entretanto. Nada foi gravado.');
    expect({ lotes: bd.select().from(esquema.lotes).all(), estado: completo() }).toStrictEqual(antes);
  });

  it('reverte: válido fica no lote; inexistente, o próprio ou o da importação → 400', async () => {
    const lote2 = gravar([campo('casa', 'casa-monte', 'lotacao', 4, 6)]);
    expect(lote2).toMatchObject({ loteId: 2 });
    const plano = planearReversao(estado(), lerHistorico(bd, 1)[0]?.alteracoes ?? []);
    expect(plano.operacoes).toEqual([campo('casa', 'casa-monte', 'lotacao', 6, 4)]);
    for (const [reverte, n] of [
      [[99], 99],
      [[3], 3],
      [[1], 1],
    ] as const) {
      const r = await postar({ versaoBase: 2, operacoes: plano.operacoes, reverte });
      expect(r.status).toBe(400);
      expect(((await r.json()) as { erros: string[] }).erros).toEqual([
        `A gravação nº ${n} não se pode reverter.`,
      ]);
    }
    // Um pedido que não desfaz nada do lote 2 não o marca como revertido.
    const outro = await postar({
      versaoBase: 2,
      operacoes: [campo('casa', 'casa-monte', 'sempreCheia', false, true)],
      reverte: [2],
    });
    expect(outro.status).toBe(400);
    expect(((await outro.json()) as { erros: string[] }).erros).toEqual([
      'A gravação nº 2 não se pode reverter.',
    ]);
    const ok = await postar({ versaoBase: 2, operacoes: plano.operacoes, reverte: [2] });
    expect(ok.status).toBe(201);
    expect(bd.select().from(esquema.lotes).where(eq(esquema.lotes.id, 3)).get()?.reverte).toBe('[2]');
    const historico = (await (await app().request('/api/historico')).json()) as EntradaHistorico[];
    expect(historico.map((h) => [h.loteId, h.reverte, h.revertidoPor])).toEqual([
      [3, [2], []],
      [2, [], [3]],
      [1, [], []],
    ]);
    expect(historico[0]?.alteracoes.map((a) => a.descricao)).toEqual(['Casa Monte — lotação: 6 → 4']);
    // Reverter outra vez a mesma gravação (um Histórico velho noutro separador) → 400 com a frase certa.
    const outraVez = await postar({ versaoBase: 3, operacoes: plano.operacoes, reverte: [2] });
    expect(outraVez.status).toBe(400);
    expect(((await outraVez.json()) as { erros: string[] }).erros).toEqual([
      'A gravação nº 2 já foi revertida.',
    ]);
    expect(bd.select().from(esquema.lotes).all()).toHaveLength(3);
  });

  it('reverter a reversão: o lote volta a estar em vigor e pode reverter-se outra vez', async () => {
    const historico = async () =>
      ((await (await app().request('/api/historico')).json()) as EntradaHistorico[]).map((h) => [
        h.loteId,
        h.revertidoPor,
      ]);
    expect(gravar([campo('casa', 'casa-monte', 'lotacao', 4, 6)])).toMatchObject({ loteId: 2 });
    // 3 reverte 2 (6 → 4); 4 reverte 3 (4 → 6): o efeito do 2 está outra vez em vigor.
    expect(gravar([campo('casa', 'casa-monte', 'lotacao', 6, 4)], { reverte: [2] })).toMatchObject({
      loteId: 3,
    });
    expect(gravar([campo('casa', 'casa-monte', 'lotacao', 4, 6)], { reverte: [3] })).toMatchObject({
      loteId: 4,
    });
    // O 2 já não aparece como revertido (o 3 deixou de estar em vigor); o 3 está, pelo 4.
    expect(await historico()).toEqual([
      [4, []],
      [3, [4]],
      [2, []],
      [1, []],
    ]);
    // O 3 continua a não se reverter outra vez (o 4 está em vigor).
    const r3 = await postar({
      versaoBase: 4,
      operacoes: [campo('casa', 'casa-monte', 'lotacao', 6, 4)],
      reverte: [3],
    });
    expect(r3.status).toBe(400);
    expect(((await r3.json()) as { erros: string[] }).erros).toEqual(['A gravação nº 3 já foi revertida.']);
    // O 2 reverte-se outra vez.
    const r2 = await postar({
      versaoBase: 4,
      operacoes: [campo('casa', 'casa-monte', 'lotacao', 6, 4)],
      reverte: [2],
    });
    expect(r2.status).toBe(201);
    expect(estado().casas.find((c) => c.id === 'casa-monte')?.lotacao).toBe(4);
    expect(await historico()).toEqual([
      [5, []],
      [4, []],
      [3, [4]],
      [2, [5]],
      [1, []],
    ]);
  });
});
