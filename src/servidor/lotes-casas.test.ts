// Casas novas e apagadas no programa (pedido do Rafael, 05/10/2026: "Nova casa" e "Apagar casa…"): gravarLote,
// o Reverter e o POST /api/lotes de ponta a ponta (base de dados em memória, dados fictícios).

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EntradaHistorico } from '../dominio/api';
import { type Operacao, operacaoApagar, operacaoCriar } from '../dominio/operacoes';
import { planearReversao } from '../dominio/reverter';
import type { Casa, Local } from '../dominio/tipos';
import { criarApp } from './app';
import { inserirDadosFicticios, inserirDadosM2, inserirLotes } from './dados-de-teste';
import * as esquema from './db/esquema';
import { abrirBd, type Bd } from './db/ligacao';
import { carregarEstado } from './estado';
import { gravarLote, lerHistorico } from './lotes';

/** 2026-10-05 no Luxemburgo. */
const AGORA = new Date('2026-10-05T10:00:00.000Z');
const ID = '1b2c3d4e-0000-4000-8000-0000000000';
const PROBLEMA = `problema-${ID}43`;

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

function gravar(operacoes: Operacao[], extra: { reverte?: number[] } = {}) {
  return gravarLote(bd, { operacoes, comentario: null, autor: 'ana@exemplo.lu', agora: AGORA, ...extra });
}

const estado = () => carregarEstado(bd, AGORA);
const completo = () => carregarEstado(bd, AGORA, { completo: true });

const localNovo: Local = {
  id: `local-${ID}41`,
  tipo: 'casa',
  nome: 'Casa Nova',
  morada: 'Rue Y, Luxembourg',
  pais: 'LU',
  lat: 49.62,
  lng: 6.11,
  raioM: 150,
};
const casaNova: Casa = {
  id: `casa-${ID}41`,
  nome: 'Casa Nova',
  localId: localNovo.id,
  apartamento: null,
  lotacao: 5,
  maxContrato: 4,
  tolerado: 5,
  notaContrato: null,
  senhorio: null,
  equipamento: null,
  sempreCheia: false,
  ordem: 3,
};

/** As frases do lote mais recente, como no Histórico. */
function frasesDoUltimo(): string[] {
  return (lerHistorico(bd, 1, AGORA)[0]?.alteracoes ?? []).map((a) => a.descricao);
}

describe('gravarLote: casas novas e apagadas', () => {
  it('criar uma casa com uma morada nova (local + casa) e pôr lá uma pessoa, pela ordem "errada"', () => {
    const r = gravar([
      { tipo: 'mover', pessoaId: 'p-alvaro', campo: 'casaId', de: null, para: casaNova.id },
      operacaoCriar('casa', casaNova),
      operacaoCriar('local', localNovo),
    ]);
    expect(r).toMatchObject({ tipo: 'gravado', loteId: 2 });
    const e = estado();
    expect(e.casas.find((c) => c.id === casaNova.id)).toStrictEqual(casaNova);
    expect(e.locais.find((l) => l.id === localNovo.id)).toStrictEqual(localNovo);
    expect(e.pessoas.find((p) => p.id === 'p-alvaro')?.casaId).toBe(casaNova.id);
    expect(frasesDoUltimo()).toEqual([
      'Casa Nova — local criado: Rue Y, Luxembourg',
      'Casa Nova — criada (Rue Y, Luxembourg)',
      'Álvaro Exemplo — casa: Fora das casas CMF → Casa Nova',
      'Álvaro Exemplo — casa confirmada',
    ]);
  });

  it('criar uma casa numa morada que já existe (a das outras duas): lote "ficha"', () => {
    const casa = { ...casaNova, localId: 'loc-casas', apartamento: 'C' };
    expect(gravar([operacaoCriar('casa', casa)])).toMatchObject({ tipo: 'gravado' });
    expect(estado().casas.map((c) => c.nome)).toEqual(['Casa Monte', 'Casa Ribeira', 'Casa Nova']);
    expect(bd.select().from(esquema.lotes).where(eq(esquema.lotes.id, 2)).get()?.tipo).toBe('ficha');
    expect(frasesDoUltimo()).toEqual(['Casa Nova — criada (Rua Fictícia 2)']);
  });

  it('apagar uma casa criada no programa, vazia, com o local dela', () => {
    gravar([operacaoCriar('local', localNovo), operacaoCriar('casa', casaNova)]);
    const e = completo();
    const r = gravar([
      operacaoApagar(e, 'local', localNovo.id) as Operacao,
      operacaoApagar(e, 'casa', casaNova.id) as Operacao,
    ]);
    expect(r).toMatchObject({ tipo: 'gravado', loteId: 3 });
    expect(estado().casas.some((c) => c.id === casaNova.id)).toBe(false);
    expect(estado().locais.some((l) => l.id === localNovo.id)).toBe(false);
    expect(frasesDoUltimo()).toEqual(['Casa Nova — apagada', 'Casa Nova — local apagado']);
  });

  it('apagar uma casa dos dados iniciais tirando no mesmo lote os moradores e onde dorme a carrinha; os problemas resolvidos (mesmo os antigos) saem com ela; o Reverter volta a pôr o que pode', () => {
    // Um problema criado no programa tem o id "problema-<UUID>" (o Reverter volta a criá-lo com esse id).
    bd.update(esquema.problemas)
      .set({ id: PROBLEMA })
      .where(eq(esquema.problemas.id, 'problema-velho01'))
      .run();
    expect(
      gravar([{ tipo: 'mover', pessoaId: 'p-elia', campo: 'casaId', de: null, para: 'casa-monte' }]),
    ).toMatchObject({
      loteId: 2,
    });
    const e = completo();
    const r = gravar([
      operacaoApagar(e, 'casa', 'casa-monte') as Operacao,
      { tipo: 'mover', pessoaId: 'p-bruno', campo: 'casaId', de: 'casa-monte', para: null },
      { tipo: 'mover', pessoaId: 'p-elia', campo: 'casaId', de: 'casa-monte', para: null },
      { tipo: 'dormida', carrinhaId: 'car-2', de: 'casa:casa-monte', para: null },
    ]);
    expect(r).toMatchObject({ tipo: 'gravado', loteId: 3 });
    const depois = completo();
    expect(depois.casas.map((c) => c.id)).toEqual(['casa-ribeira']);
    expect(depois.problemas.some((p) => p.id === PROBLEMA)).toBe(false);
    expect(depois.pessoas.find((p) => p.id === 'p-bruno')?.casaId).toBeNull();
    expect(depois.carrinhas.find((c) => c.id === 'car-2')?.dormeCasaId).toBeNull();
    // O local dos dados iniciais fica (a Casa Ribeira ainda lá está).
    expect(depois.locais.some((l) => l.id === 'loc-casas')).toBe(true);
    expect(frasesDoUltimo()).toEqual([
      'Bruno Fictício — casa: Casa Monte → Fora das casas CMF',
      'Élia Modelo — casa: Casa Monte → Fora das casas CMF',
      'ZZ 0002 — onde dorme: Casa Monte → por definir',
      'Casa Monte — problema apagado: «Torneira a pingar»',
      'Casa Monte — apagada',
    ]);

    // Reverter no Histórico: a casa, a Élia, onde dorme e o problema resolvido voltam; o Bruno saiu da
    // empresa e não volta para uma casa.
    const entrada = lerHistorico(bd, 1, AGORA)[0] as EntradaHistorico;
    const plano = planearReversao(estado(), entrada.alteracoes);
    expect(plano.erros).toEqual([]);
    expect(plano.impossiveis).toEqual([
      {
        descricao: 'Bruno Fictício — casa: Casa Monte → Fora das casas CMF',
        motivo: 'Bruno Fictício não está ativa.',
      },
    ]);
    expect(gravar(plano.operacoes, { reverte: [3] })).toMatchObject({ tipo: 'gravado', loteId: 4 });
    const revertido = completo();
    expect(revertido.casas.find((c) => c.id === 'casa-monte')).toStrictEqual(
      e.casas.find((c) => c.id === 'casa-monte'),
    );
    expect(revertido.problemas.find((p) => p.id === PROBLEMA)).toStrictEqual(
      e.problemas.find((p) => p.id === PROBLEMA),
    );
    expect(revertido.pessoas.find((p) => p.id === 'p-elia')?.casaId).toBe('casa-monte');
    expect(revertido.pessoas.find((p) => p.id === 'p-bruno')?.casaId).toBeNull();
    expect(revertido.carrinhas.find((c) => c.id === 'car-2')?.dormeCasaId).toBe('casa-monte');
  });
});

describe('POST /api/lotes: casas', () => {
  const app = () => criarApp({ bd, agora: () => AGORA });
  const postar = async (operacoes: unknown[]) => {
    const r = await app().request('/api/lotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versaoBase: 1, operacoes }),
    });
    return { status: r.status, corpo: (await r.json()) as { erros?: string[] } };
  };

  it('criar com local novo e com local existente → 201', async () => {
    expect((await postar([operacaoCriar('local', localNovo), operacaoCriar('casa', casaNova)])).status).toBe(
      201,
    );
    const outra = { ...casaNova, id: `casa-${ID}42`, nome: 'Casa Outra', localId: 'loc-casas' };
    expect((await postar([operacaoCriar('casa', outra)])).status).toBe(201);
    expect(estado().casas).toHaveLength(4);
  });

  it('recusas legíveis: nome repetido, campo a mais, sem lugares, "lugares iguais aos moradores"', async () => {
    const repetido = await postar([
      operacaoCriar('casa', { ...casaNova, localId: 'loc-casas', nome: 'casa monte' }),
    ]);
    expect(repetido).toStrictEqual({
      status: 400,
      corpo: { erro: expect.any(String), erros: ['casa monte — já há outra casa com este nome.'] },
    });
    const aMais = await postar([operacaoCriar('casa', { ...casaNova, senha: 'x' } as unknown as Casa)]);
    expect(aMais.corpo.erros).toEqual(['operacoes[0].para: Chave inválida: "senha"']);
    const semLugares = await postar([
      operacaoCriar('casa', { ...casaNova, localId: 'loc-casas', lotacao: 0 }),
    ]);
    expect(semLugares.corpo.erros).toEqual(['operacoes[0].para: Lotação: uma casa tem pelo menos 1 lugar.']);
    const cheia = await postar([
      operacaoCriar('casa', { ...casaNova, localId: 'loc-casas', sempreCheia: true }),
    ]);
    expect(cheia.corpo.erros).toEqual(['operacoes[0].para: Uma casa nova entra com os lugares da lotação.']);
    expect(estado().casas).toHaveLength(2);
  });

  it('apagar: com moradores, com uma carrinha a dormir lá, com um problema por resolver → 400', async () => {
    const e = completo();
    const ribeira = await postar([operacaoApagar(e, 'casa', 'casa-ribeira')]);
    expect(ribeira.status).toBe(400);
    expect(ribeira.corpo.erros).toEqual([
      'Casa Ribeira — ainda tem 1 morador: muda-os para outra casa (ou para "Fora das casas CMF") antes de a apagar.',
      'Casa Ribeira — tem 1 problema por resolver: resolve-o antes de a apagar.',
    ]);
    // O Bruno saiu da empresa mas ainda a tem; a ZZ 0002 dorme lá.
    const monte = await postar([operacaoApagar(e, 'casa', 'casa-monte')]);
    expect(monte.corpo.erros).toEqual([
      'Casa Monte — ainda tem 1 morador: muda-os para outra casa (ou para "Fora das casas CMF") antes de a apagar.',
      'Casa Monte — a ZZ 0002 dorme lá: muda onde dorme antes de a apagar.',
    ]);
    expect(completo().casas).toHaveLength(2);
  });

  it('recusas de uma casa nova feita à mão: id inventado, morada que não é de casas', async () => {
    const inventada = await postar([
      operacaoCriar('casa', { ...casaNova, id: 'inventada', localId: 'loc-casas' }),
    ]);
    expect(inventada).toStrictEqual({
      status: 400,
      corpo: {
        erro: expect.any(String),
        erros: [
          'Casa Nova — identificador inválido: uma casa nova tem o identificador gerado pelo programa ("casa-…").',
        ],
      },
    });
    const noParque = await postar([operacaoCriar('casa', { ...casaNova, localId: 'loc-parque' })]);
    expect(noParque.corpo.erros).toEqual(['Casa Nova — a morada escolhida não é de casas.']);
    const naObra = await postar([operacaoCriar('casa', { ...casaNova, localId: 'loc-obra' })]);
    expect(naObra.corpo.erros).toEqual(['Casa Nova — a morada escolhida não é de casas.']);
    expect(estado().casas).toHaveLength(2);
  });
});

describe('casa apagada por outra pessoa: as frases dizem o nome (ou "já não existe"), nunca o id', () => {
  const casa = { ...casaNova, localId: 'loc-casas' };

  it('409 com o nome que a casa tinha; 400 ao mover alguém ou pôr uma carrinha a dormir lá', () => {
    // O A cria a Casa Nova e põe lá o Álvaro; depois apaga-a, tirando-o.
    gravar([
      operacaoCriar('casa', casa),
      { tipo: 'mover', pessoaId: 'p-alvaro', campo: 'casaId', de: null, para: casa.id },
    ]);
    const e = completo();
    expect(
      gravar([
        { tipo: 'mover', pessoaId: 'p-alvaro', campo: 'casaId', de: casa.id, para: null },
        operacaoApagar(e, 'casa', casa.id) as Operacao,
      ]),
    ).toMatchObject({ tipo: 'gravado' });
    const nome = completo().pessoas.find((p) => p.id === 'p-alvaro')?.nomeCurto;

    // O B ainda tinha no rascunho o Álvaro na Casa Nova, a ir para a Casa Ribeira.
    const conflito = gravar([
      { tipo: 'mover', pessoaId: 'p-alvaro', campo: 'casaId', de: casa.id, para: 'casa-ribeira' },
    ]);
    expect(conflito).toMatchObject({ tipo: 'conflito' });
    const descricao = conflito.tipo === 'conflito' ? conflito.conflitos[0]?.descricao : '';
    // O parêntese do fim diz quem gravou por último e quando (autoriaDoConflito).
    expect(descricao).toContain(
      `${nome} — casa: esperavas Casa Nova (apagada), mas agora está fora das casas CMF (`,
    );
    expect(descricao).not.toContain(casa.id);

    expect(
      gravar([{ tipo: 'mover', pessoaId: 'p-alvaro', campo: 'casaId', de: null, para: casa.id }]),
    ).toStrictEqual({ tipo: 'invalido', erros: [`${nome}: a casa escolhida já não existe.`] });
    expect(
      gravar([{ tipo: 'dormida', carrinhaId: 'car-2', de: 'casa:casa-monte', para: `casa:${casa.id}` }]),
    ).toStrictEqual({ tipo: 'invalido', erros: ['ZZ 0002 — o sítio onde dormir escolhido já não existe.'] });
  });
});
