// POST /api/lotes e GET /api/historico, de ponta a ponta na app (base de dados em memória, dados fictícios).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConflitoServidor, EntradaHistorico } from '../dominio/api';
import type { CampoMovivel, Operacao } from '../dominio/operacoes';
import { criarApp, TAMANHO_MAXIMO_LOTE } from './app';
import { inserirDadosFicticios, inserirLotes } from './dados-de-teste';
import * as esquema from './db/esquema';
import { abrirBd, type Bd } from './db/ligacao';
import { carregarEstado } from './estado';

const AGORA = new Date('2026-10-03T08:30:00.000Z');

let bd: Bd;
let app: ReturnType<typeof criarApp>;

beforeEach(() => {
  bd = abrirBd(':memory:');
  inserirDadosFicticios(bd);
  // Um lote de importação já existente (versão 1), com comentário e sem alterações.
  inserirLotes(bd, 1);
  bd.$client.prepare("UPDATE lotes SET comentario = 'Importação de teste' WHERE id = 1").run();
  app = criarApp({ bd, agora: () => AGORA });
});

afterEach(() => {
  if (bd.$client.open) bd.$client.close();
});

function mover(pessoaId: string, campo: CampoMovivel, de: string | null, para: string | null): Operacao {
  return { tipo: 'mover', pessoaId, campo, de, para };
}

function condutor(carrinhaId: string, de: string | null, para: string | null): Operacao {
  return { tipo: 'condutor', carrinhaId, de, para };
}

function postar(corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return app.request('/api/lotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cabecalhos },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

/** Tudo o que uma gravação pode mudar: estado, lotes e alterações. */
function fotografia() {
  return {
    estado: carregarEstado(bd, AGORA),
    lotes: bd.select().from(esquema.lotes).all(),
    alteracoes: bd.select().from(esquema.alteracoes).all(),
  };
}

describe('POST /api/lotes — gravar', () => {
  it('grava as mudanças, o lote e as alterações e sobe a versão', async () => {
    const resposta = await postar({
      versaoBase: 1,
      operacoes: [
        mover('p-alvaro', 'casaId', null, 'casa-monte'),
        mover('p-alvaro', 'carrinhaId', null, 'car-2'),
        mover('p-ze', 'obraId', 'obra-vale', null),
      ],
      comentario: '  Troca de teste  ',
    });

    expect(resposta.status).toBe(201);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    expect(await resposta.json()).toStrictEqual({ loteId: 2, versao: 2 });

    const estado = carregarEstado(bd);
    expect(estado.versao).toBe(2);
    expect(estado.pessoas.find((p) => p.id === 'p-alvaro')).toMatchObject({
      casaId: 'casa-monte',
      carrinhaId: 'car-2',
      casaAConfirmar: false,
      carrinhaAConfirmar: false,
    });
    expect(estado.pessoas.find((p) => p.id === 'p-ze')).toMatchObject({
      obraId: null,
      casaId: 'casa-ribeira',
    });

    expect(bd.select().from(esquema.lotes).all().at(-1)).toStrictEqual({
      id: 2,
      autor: 'local',
      criadoEm: '2026-10-03T08:30:00.000Z',
      efetivoEm: '2026-10-03T08:30:00.000Z',
      estado: 'aplicado',
      tipo: 'mudanca',
      comentario: 'Troca de teste',
      reverte: null,
    });
    expect(bd.select().from(esquema.alteracoes).all()).toStrictEqual([
      {
        id: 1,
        loteId: 2,
        entidade: 'pessoa',
        entidadeId: 'p-alvaro',
        campo: 'casaId',
        antes: 'null',
        depois: '"casa-monte"',
      },
      {
        id: 2,
        loteId: 2,
        entidade: 'pessoa',
        entidadeId: 'p-alvaro',
        campo: 'casaAConfirmar',
        antes: 'true',
        depois: 'false',
      },
      {
        id: 3,
        loteId: 2,
        entidade: 'pessoa',
        entidadeId: 'p-alvaro',
        campo: 'carrinhaId',
        antes: 'null',
        depois: '"car-2"',
      },
      {
        id: 4,
        loteId: 2,
        entidade: 'pessoa',
        entidadeId: 'p-alvaro',
        campo: 'carrinhaAConfirmar',
        antes: 'true',
        depois: 'false',
      },
      {
        id: 5,
        loteId: 2,
        entidade: 'pessoa',
        entidadeId: 'p-ze',
        campo: 'obraId',
        antes: '"obra-vale"',
        depois: 'null',
      },
    ]);
  });

  it('o resto da pessoa (e as outras pessoas) não mudam', async () => {
    const antes = carregarEstado(bd, AGORA);
    expect(
      (await postar({ versaoBase: 1, operacoes: [mover('p-ze', 'carrinhaId', 'car-2', 'car-1')] })).status,
    ).toBe(201);
    const depois = carregarEstado(bd, AGORA);
    expect(depois.pessoas).toStrictEqual(
      antes.pessoas.map((p) => (p.id === 'p-ze' ? { ...p, carrinhaId: 'car-1' } : p)),
    );
    expect({ ...depois, pessoas: [], versao: 0 }).toStrictEqual({ ...antes, pessoas: [], versao: 0 });
  });

  it('comentário vazio, só com espaços, null ou ausente fica null', async () => {
    const ops = (para: string | null, de: string | null) => [mover('p-elia', 'carrinhaId', de, para)];
    expect((await postar({ versaoBase: 1, operacoes: ops('car-2', 'car-1'), comentario: '' })).status).toBe(
      201,
    );
    expect(
      (await postar({ versaoBase: 2, operacoes: ops('car-1', 'car-2'), comentario: '   ' })).status,
    ).toBe(201);
    expect((await postar({ versaoBase: 3, operacoes: ops(null, 'car-1'), comentario: null })).status).toBe(
      201,
    );
    expect((await postar({ versaoBase: 4, operacoes: ops('car-2', null) })).status).toBe(201);
    expect(
      bd
        .select()
        .from(esquema.lotes)
        .all()
        .slice(1)
        .map((l) => l.comentario),
    ).toStrictEqual([null, null, null, null]);
  });

  it('aceita Content-Type com charset e o Origin de páginas do próprio PC', async () => {
    let versao = 1;
    for (const origem of [
      'http://localhost:5173',
      'http://127.0.0.1:8787',
      'http://[::1]:5191',
      'https://LOCALHOST',
    ]) {
      const [de, para] = versao % 2 === 1 ? ['car-1', 'car-2'] : ['car-2', 'car-1'];
      const resposta = await postar(
        { versaoBase: versao, operacoes: [mover('p-elia', 'carrinhaId', de, para)] },
        { 'content-type': 'application/json; charset=UTF-8', origin: origem },
      );
      expect(resposta.status, origem).toBe(201);
      versao += 1;
    }
  });

  it('500 operações cabem no limite de tamanho', async () => {
    // A mesma pessoa vai e volta: compacta para uma só mudança (499 vezes ida e volta + 1 ida).
    const operacoes = Array.from({ length: 500 }, (_, i) =>
      i % 2 === 0
        ? mover('p-elia', 'carrinhaId', 'car-1', 'car-2')
        : mover('p-elia', 'carrinhaId', 'car-2', 'car-1'),
    );
    operacoes[499] = mover('p-elia', 'carrinhaId', 'car-1', 'car-2');
    expect(JSON.stringify({ versaoBase: 1, operacoes }).length).toBeLessThan(TAMANHO_MAXIMO_LOTE);
    const resposta = await postar({ versaoBase: 1, operacoes });
    expect(resposta.status).toBe(201);
    expect(bd.select().from(esquema.alteracoes).all()).toHaveLength(1);
  });
});

describe('POST /api/lotes — condutor', () => {
  it('define o condutor: grava a carrinha e a alteração, e o estado e o histórico mostram-no', async () => {
    const resposta = await postar({ versaoBase: 1, operacoes: [condutor('car-2', null, 'p-ze')] });
    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toStrictEqual({ loteId: 2, versao: 2 });

    const estado = (await (await app.request('/api/estado')).json()) as {
      carrinhas: { id: string; condutorId: string | null }[];
    };
    expect(estado.carrinhas.map((c) => [c.id, c.condutorId])).toStrictEqual([
      ['car-1', null],
      ['car-2', 'p-ze'],
    ]);
    expect(bd.select().from(esquema.alteracoes).all()).toStrictEqual([
      {
        id: 1,
        loteId: 2,
        entidade: 'carrinha',
        entidadeId: 'car-2',
        campo: 'condutorId',
        antes: 'null',
        depois: '"p-ze"',
      },
    ]);
    const historico = (await (await app.request('/api/historico?limite=1')).json()) as EntradaHistorico[];
    expect(historico[0]?.alteracoes.map((a) => a.descricao)).toStrictEqual([
      'ZZ 0002 — condutor: sem condutor → Zé Teste',
    ]);
  });

  it('condutor que não vai na carrinha → 400 e nada muda', async () => {
    const antes = fotografia();
    const resposta = await postar({ versaoBase: 1, operacoes: [condutor('car-1', null, 'p-ze')] });
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toStrictEqual({
      erro: 'Há mudanças que não se podem gravar. Nada foi gravado.',
      erros: ['Zé Teste não vai na carrinha ZZ 0001: não pode ser o condutor.'],
    });
    expect(fotografia()).toStrictEqual(antes);
  });

  it('o condutor sai da carrinha e deixa de ser condutor no mesmo lote', async () => {
    expect((await postar({ versaoBase: 1, operacoes: [condutor('car-2', null, 'p-ze')] })).status).toBe(201);
    const resposta = await postar({
      versaoBase: 2,
      operacoes: [mover('p-ze', 'carrinhaId', 'car-2', null), condutor('car-2', 'p-ze', null)],
    });
    expect(resposta.status).toBe(201);
    const estado = carregarEstado(bd, AGORA);
    expect(estado.carrinhas.find((c) => c.id === 'car-2')?.condutorId).toBeNull();
    expect(estado.pessoas.find((p) => p.id === 'p-ze')?.carrinhaId).toBeNull();
  });

  it('conflito de condutor → 409 com a frase pronta a mostrar', async () => {
    expect((await postar({ versaoBase: 1, operacoes: [condutor('car-2', null, 'p-ze')] })).status).toBe(201);
    const depois = fotografia();
    const resposta = await postar({ versaoBase: 1, operacoes: [condutor('car-2', null, null)] });
    // null → null não é mudança nenhuma: compacta para nada.
    expect(resposta.status).toBe(400);
    const segundo = await postar({ versaoBase: 1, operacoes: [condutor('car-2', null, 'p-ze')] });
    expect(segundo.status).toBe(409);
    expect(await segundo.json()).toStrictEqual({
      erro: 'Alguém mudou entretanto algumas destas pessoas ou carrinhas. Nada foi gravado.',
      conflitos: [
        {
          tipo: 'condutor',
          carrinhaId: 'car-2',
          esperado: null,
          atual: 'p-ze',
          descricao:
            'ZZ 0002 — condutor: esperavas que não tivesse condutor, mas agora é Zé Teste (alguém mudou entretanto)',
        },
      ],
    });
    expect(fotografia()).toStrictEqual(depois);
  });

  it('tirar da carrinha quem entretanto passou a conduzi-la → 409 (a versaoBase do pedido conta)', async () => {
    expect((await postar({ versaoBase: 1, operacoes: [condutor('car-2', null, 'p-ze')] })).status).toBe(201);
    const depois = fotografia();
    // Um browser ainda na versão 1 (sem saber que o Zé conduz) tira-o da car-2.
    const antigo = await postar({ versaoBase: 1, operacoes: [mover('p-ze', 'carrinhaId', 'car-2', null)] });
    expect(antigo.status).toBe(409);
    expect(((await antigo.json()) as { conflitos: ConflitoServidor[] }).conflitos).toStrictEqual([
      {
        tipo: 'condutor',
        carrinhaId: 'car-2',
        esperado: null,
        atual: 'p-ze',
        descricao:
          'ZZ 0002 — condutor: esperavas que não tivesse condutor, mas agora é Zé Teste (alguém mudou entretanto)',
      },
    ]);
    // O mesmo pedido sobre a versão atual é mal feito (faltava tirar o condutor): 400.
    const atual = await postar({ versaoBase: 2, operacoes: [mover('p-ze', 'carrinhaId', 'car-2', null)] });
    expect(atual.status).toBe(400);
    expect(fotografia()).toStrictEqual(depois);
  });
});

describe('POST /api/lotes — onde dorme', () => {
  const dormida = (carrinhaId: string, de: string | null, para: string | null): Operacao => ({
    tipo: 'dormida',
    carrinhaId,
    de,
    para,
  });

  it('muda onde dorme: grava a carrinha e a alteração, e o estado e o histórico mostram-no', async () => {
    const resposta = await postar({
      versaoBase: 1,
      operacoes: [dormida('car-1', 'local:loc-parque', 'casa:casa-monte')],
    });
    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toStrictEqual({ loteId: 2, versao: 2 });

    const estado = (await (await app.request('/api/estado')).json()) as {
      carrinhas: { id: string; dormeCasaId: string | null; dormeLocalId: string | null }[];
    };
    expect(estado.carrinhas.map((c) => [c.id, c.dormeCasaId, c.dormeLocalId])).toStrictEqual([
      ['car-1', 'casa-monte', null],
      ['car-2', 'casa-monte', null],
    ]);
    expect(bd.select().from(esquema.alteracoes).all()).toStrictEqual([
      {
        id: 1,
        loteId: 2,
        entidade: 'carrinha',
        entidadeId: 'car-1',
        campo: 'dormida',
        antes: '"local:loc-parque"',
        depois: '"casa:casa-monte"',
      },
    ]);
    const historico = (await (await app.request('/api/historico?limite=1')).json()) as EntradaHistorico[];
    expect(historico[0]?.alteracoes.map((a) => a.descricao)).toStrictEqual([
      'ZZ 0001 — onde dorme: Parque → Casa Monte',
    ]);
  });

  it('sítio que não existe → 400 e nada muda', async () => {
    const antes = fotografia();
    const resposta = await postar({
      versaoBase: 1,
      operacoes: [dormida('car-1', 'local:loc-parque', 'local:nada')],
    });
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toStrictEqual({
      erro: 'Há mudanças que não se podem gravar. Nada foi gravado.',
      erros: ['O sítio onde dormir "local:nada" não existe.'],
    });
    expect(fotografia()).toStrictEqual(antes);
  });

  it('conflito de onde dorme → 409 com a frase pronta a mostrar', async () => {
    expect(
      (await postar({ versaoBase: 1, operacoes: [dormida('car-2', 'casa:casa-monte', null)] })).status,
    ).toBe(201);
    const depois = fotografia();
    const segundo = await postar({
      versaoBase: 1,
      operacoes: [dormida('car-2', 'casa:casa-monte', 'casa:casa-ribeira')],
    });
    expect(segundo.status).toBe(409);
    expect(await segundo.json()).toStrictEqual({
      erro: 'Alguém mudou entretanto algumas destas pessoas ou carrinhas. Nada foi gravado.',
      conflitos: [
        {
          tipo: 'dormida',
          carrinhaId: 'car-2',
          esperado: 'casa:casa-monte',
          atual: null,
          descricao:
            'ZZ 0002 — onde dorme: esperavas Casa Monte, mas agora está por definir (alguém mudou entretanto)',
        },
      ],
    });
    expect(fotografia()).toStrictEqual(depois);
  });
});

describe('POST /api/lotes — compactação', () => {
  it('A → B → C grava só A → C', async () => {
    const resposta = await postar({
      versaoBase: 1,
      operacoes: [mover('p-ze', 'casaId', 'casa-ribeira', null), mover('p-ze', 'casaId', null, 'casa-monte')],
    });
    expect(resposta.status).toBe(201);
    expect(carregarEstado(bd).pessoas.find((p) => p.id === 'p-ze')?.casaId).toBe('casa-monte');
    expect(bd.select().from(esquema.alteracoes).all()).toStrictEqual([
      {
        id: 1,
        loteId: 2,
        entidade: 'pessoa',
        entidadeId: 'p-ze',
        campo: 'casaId',
        antes: '"casa-ribeira"',
        depois: '"casa-monte"',
      },
    ]);
  });

  // Decisão: se tudo se anula, responde 400 e não cria um lote vazio (a versão não sobe e o histórico
  // não fica com entradas sem nada). O browser já não envia nada nesse caso (Guardar só sai do modo de edição).
  it('A → B → A não grava nada e responde 400', async () => {
    const antes = fotografia();
    const resposta = await postar({
      versaoBase: 1,
      operacoes: [
        mover('p-ze', 'casaId', 'casa-ribeira', 'casa-monte'),
        mover('p-ze', 'casaId', 'casa-monte', 'casa-ribeira'),
      ],
    });
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toStrictEqual({
      erro: 'Não há nada para gravar: as mudanças anulam-se umas às outras.',
    });
    expect(fotografia()).toStrictEqual(antes);
  });

  it('o que se anula sai, o resto grava-se', async () => {
    const resposta = await postar({
      versaoBase: 1,
      operacoes: [
        mover('p-ze', 'casaId', 'casa-ribeira', 'casa-monte'),
        mover('p-elia', 'casaId', null, 'casa-monte'),
        mover('p-ze', 'casaId', 'casa-monte', 'casa-ribeira'),
      ],
    });
    expect(resposta.status).toBe(201);
    expect(
      bd
        .select()
        .from(esquema.alteracoes)
        .all()
        .map((a) => [a.entidadeId, a.campo]),
    ).toStrictEqual([['p-elia', 'casaId']]);
  });
});

describe('POST /api/lotes — conflitos (409)', () => {
  it('recusa tudo, sem tocar na base de dados, e explica cada conflito', async () => {
    const antes = fotografia();
    const resposta = await postar({
      versaoBase: 1,
      operacoes: [
        mover('p-elia', 'casaId', null, 'casa-monte'), // esta estava boa, mas também não se grava
        mover('p-ze', 'carrinhaId', 'car-1', 'car-2'),
        mover('p-alvaro', 'casaId', 'casa-ribeira', 'casa-monte'),
      ],
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { erro: string; conflitos: ConflitoServidor[] };
    expect(corpo).toStrictEqual({
      erro: 'Alguém mudou entretanto algumas destas pessoas. Nada foi gravado.',
      conflitos: [
        {
          tipo: 'mover',
          pessoaId: 'p-ze',
          campo: 'carrinhaId',
          esperado: 'car-1',
          atual: 'car-2',
          descricao:
            'Zé Teste — carrinha: esperavas ZZ 0001, mas agora está em ZZ 0002 (alguém mudou entretanto)',
        },
        {
          tipo: 'mover',
          pessoaId: 'p-alvaro',
          campo: 'casaId',
          esperado: 'casa-ribeira',
          atual: null,
          descricao:
            'Álvaro Exemplo — casa: esperavas Casa Ribeira, mas agora está fora das casas CMF (alguém mudou entretanto)',
        },
      ],
    });
    expect(fotografia()).toStrictEqual(antes);
  });

  it('dois browsers com o mesmo ponto de partida: o segundo recebe 409', async () => {
    const primeiro = await postar({
      versaoBase: 1,
      operacoes: [mover('p-elia', 'carrinhaId', 'car-1', 'car-2')],
    });
    expect(primeiro.status).toBe(201);
    const depois = fotografia();
    const segundo = await postar({
      versaoBase: 1,
      operacoes: [mover('p-elia', 'carrinhaId', 'car-1', null)],
    });
    expect(segundo.status).toBe(409);
    expect(fotografia()).toStrictEqual(depois);
  });
});

describe('POST /api/lotes — pedidos inválidos (400)', () => {
  it.each([
    ['pessoa inexistente', [mover('p-nada', 'casaId', null, 'casa-monte')], ['A pessoa p-nada não existe.']],
    [
      'destino inexistente',
      [mover('p-ze', 'casaId', 'casa-ribeira', 'casa-nada')],
      ['Zé Teste: o destino casa-nada não existe.'],
    ],
    [
      'carrinha inexistente',
      [mover('p-ze', 'carrinhaId', 'car-2', 'car-9')],
      ['Zé Teste: o destino car-9 não existe.'],
    ],
    [
      'obra inexistente',
      [mover('p-ze', 'obraId', 'obra-vale', 'obra-nada')],
      ['Zé Teste: o destino obra-nada não existe.'],
    ],
    [
      'pessoa inativa',
      [mover('p-bruno', 'casaId', 'casa-monte', 'casa-ribeira')],
      ['Bruno Fictício não está ativa.'],
    ],
  ])('%s', async (_nome, operacoes, erros) => {
    const antes = fotografia();
    const resposta = await postar({ versaoBase: 1, operacoes });
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toStrictEqual({
      erro: 'Há mudanças que não se podem gravar. Nada foi gravado.',
      erros,
    });
    expect(fotografia()).toStrictEqual(antes);
  });

  it('erros de referência repetidos aparecem uma vez', async () => {
    const resposta = await postar({
      versaoBase: 1,
      operacoes: [
        mover('p-bruno', 'casaId', 'casa-monte', 'casa-ribeira'),
        mover('p-bruno', 'carrinhaId', null, 'car-1'),
        mover('p-bruno', 'obraId', null, 'obra-vale'),
      ],
    });
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { erros: string[] }).erros).toStrictEqual([
      'Bruno Fictício não está ativa.',
    ]);
  });

  // Ex.: uma casa apagada por uma nova importação enquanto alguém tinha o rascunho aberto. O browser
  // junta os erros numa só frase: 500 frases enchiam o diálogo (e o leitor de ecrã lia-as todas).
  it('muitos erros de referência: devolve só os primeiros 10 e quantos faltam', async () => {
    const operacoes = Array.from({ length: 30 }, (_, i) =>
      mover(`p-nada-${i}`, 'casaId', null, 'casa-monte'),
    );
    const resposta = await postar({ versaoBase: 1, operacoes });
    expect(resposta.status).toBe(400);
    const { erros } = (await resposta.json()) as { erros: string[] };
    expect(erros).toHaveLength(11);
    expect(erros[0]).toBe('A pessoa p-nada-0 não existe.');
    expect(erros.at(-1)).toBe('… e mais 20.');
  });

  it('uma operação inválida impede as válidas', async () => {
    const antes = fotografia();
    const resposta = await postar({
      versaoBase: 1,
      operacoes: [
        mover('p-elia', 'casaId', null, 'casa-monte'),
        mover('p-nada', 'casaId', null, 'casa-monte'),
      ],
    });
    expect(resposta.status).toBe(400);
    expect(fotografia()).toStrictEqual(antes);
  });

  const op = mover('p-elia', 'casaId', null, 'casa-monte');
  it.each([
    ['0 operações', { versaoBase: 1, operacoes: [] }, /Não há operações para gravar/],
    ['501 operações', { versaoBase: 1, operacoes: Array(501).fill(op) }, /No máximo 500 operações/],
    ['sem operações', { versaoBase: 1 }, /operacoes/],
    ['sem versaoBase', { operacoes: [op] }, /versaoBase/],
    ['versaoBase negativa', { versaoBase: -1, operacoes: [op] }, /versaoBase/],
    ['versaoBase decimal', { versaoBase: 1.5, operacoes: [op] }, /versaoBase/],
    ['versaoBase em texto', { versaoBase: '1', operacoes: [op] }, /versaoBase/],
    ['tipo desconhecido', { versaoBase: 1, operacoes: [{ ...op, tipo: 'apagar' }] }, /operacoes\[0\]\.tipo/],
    [
      'campo desconhecido',
      { versaoBase: 1, operacoes: [{ ...op, campo: 'ativa' }] },
      /operacoes\[0\]\.campo/,
    ],
    [
      'sem "de"',
      { versaoBase: 1, operacoes: [{ tipo: 'mover', pessoaId: 'p-elia', campo: 'casaId', para: null }] },
      /operacoes\[0\]\.de/,
    ],
    ['pessoaId vazio', { versaoBase: 1, operacoes: [{ ...op, pessoaId: '' }] }, /operacoes\[0\]\.pessoaId/],
    [
      'pessoaId enorme',
      { versaoBase: 1, operacoes: [{ ...op, pessoaId: 'x'.repeat(201) }] },
      /operacoes\[0\]\.pessoaId/,
    ],
    ['para numérico', { versaoBase: 1, operacoes: [{ ...op, para: 7 }] }, /operacoes\[0\]\.para/],
    [
      'condutor sem carrinha',
      { versaoBase: 1, operacoes: [{ tipo: 'condutor', de: null, para: 'p-ze' }] },
      /operacoes\[0\]\.carrinhaId/,
    ],
    [
      'condutor sem "de"',
      { versaoBase: 1, operacoes: [{ tipo: 'condutor', carrinhaId: 'car-2', para: 'p-ze' }] },
      /operacoes\[0\]\.de/,
    ],
    [
      'condutor com pessoa vazia',
      { versaoBase: 1, operacoes: [{ tipo: 'condutor', carrinhaId: 'car-2', de: null, para: '' }] },
      /operacoes\[0\]\.para/,
    ],
    [
      'onde dorme sem carrinha',
      { versaoBase: 1, operacoes: [{ tipo: 'dormida', de: null, para: 'casa:casa-monte' }] },
      /operacoes\[0\]\.carrinhaId/,
    ],
    [
      'onde dorme sem "de"',
      { versaoBase: 1, operacoes: [{ tipo: 'dormida', carrinhaId: 'car-1', para: 'casa:casa-monte' }] },
      /operacoes\[0\]\.de/,
    ],
    [
      'onde dorme com uma chave mal feita',
      { versaoBase: 1, operacoes: [{ tipo: 'dormida', carrinhaId: 'car-1', de: null, para: 'casa-monte' }] },
      /operacoes\[0\]\.para: Onde dorme tem de ser "casa:<id>", "local:<id>" ou null\./,
    ],
    [
      'onde dorme com uma chave sem id',
      { versaoBase: 1, operacoes: [{ tipo: 'dormida', carrinhaId: 'car-1', de: 'local:', para: null }] },
      /operacoes\[0\]\.de/,
    ],
    [
      'onde dorme com um número',
      { versaoBase: 1, operacoes: [{ tipo: 'dormida', carrinhaId: 'car-1', de: null, para: 3 }] },
      /operacoes\[0\]\.para/,
    ],
    [
      'comentário longo',
      { versaoBase: 1, operacoes: [op], comentario: 'x'.repeat(501) },
      /no máximo 500 caracteres/,
    ],
    ['corpo é uma lista', [op], /esperava um objeto/],
    ['corpo é null', null, /esperava um objeto/],
  ])('%s', async (_nome, corpo, mensagem) => {
    const antes = fotografia();
    const resposta = await postar(corpo);
    expect(resposta.status).toBe(400);
    const json = (await resposta.json()) as { erro: string; erros: string[] };
    expect(json.erro).toBe('Pedido inválido.');
    expect(json.erros.join(' ')).toMatch(mensagem);
    expect(fotografia()).toStrictEqual(antes);
  });

  it('muitos erros de formato: devolve só os primeiros 10 e quantos faltam', async () => {
    const resposta = await postar({ versaoBase: 1, operacoes: Array(30).fill({ ...op, campo: 'x' }) });
    expect(resposta.status).toBe(400);
    const { erros } = (await resposta.json()) as { erros: string[] };
    expect(erros).toHaveLength(11);
    expect(erros.at(-1)).toBe('… e mais 20.');
  });

  it.each(['{', 'nada', '{"versaoBase":1,'])('JSON estragado %j', async (texto) => {
    const resposta = await postar(texto);
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toStrictEqual({ erro: 'O corpo do pedido não é JSON válido.' });
  });
});

describe('POST /api/lotes — proteções', () => {
  const corpoValido = JSON.stringify({
    versaoBase: 1,
    operacoes: [mover('p-elia', 'casaId', null, 'casa-monte')],
  });

  it.each([
    ['sem Content-Type', {}],
    ['texto', { 'content-type': 'text/plain' }],
    ['formulário', { 'content-type': 'application/x-www-form-urlencoded' }],
    ['multipart', { 'content-type': 'multipart/form-data; boundary=x' }],
    ['parecido', { 'content-type': 'application/jsonx' }],
  ])('415 se não for JSON (%s)', async (_nome, cabecalhos: Record<string, string>) => {
    const antes = fotografia();
    const resposta = await app.request('/api/lotes', {
      method: 'POST',
      headers: cabecalhos,
      body: corpoValido,
    });
    expect(resposta.status).toBe(415);
    expect(await resposta.json()).toHaveProperty('erro');
    expect(fotografia()).toStrictEqual(antes);
  });

  it.each([
    'http://atacante.example',
    'https://localhost.atacante.example',
    'http://127.0.0.1.atacante.example:8787',
    'null',
    'file://',
    'chrome-extension://localhost',
    'lixo',
    '',
  ])('403 com Origin de fora do PC (%j)', async (origem) => {
    const antes = fotografia();
    const resposta = await postar(corpoValido, { origin: origem });
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toStrictEqual({
      erro: 'Pedido recusado: a página não é deste computador.',
    });
    expect(fotografia()).toStrictEqual(antes);
  });

  it('o Origin não impede leituras (GET)', async () => {
    const resposta = await app.request('/api/historico', { headers: { origin: 'http://atacante.example' } });
    expect(resposta.status).toBe(200);
  });

  it('413 com o corpo acima do limite (com e sem Content-Length)', async () => {
    const antes = fotografia();
    const grande = JSON.stringify({
      versaoBase: 1,
      operacoes: [mover('p-elia', 'casaId', null, 'casa-monte')],
      comentario: 'x'.repeat(TAMANHO_MAXIMO_LOTE),
    });
    const semTamanho = await postar(grande);
    expect(semTamanho.status).toBe(413);
    expect(await semTamanho.json()).toHaveProperty('erro');

    const comTamanho = await postar(grande, { 'content-length': String(Buffer.byteLength(grande)) });
    expect(comTamanho.status).toBe(413);
    expect(fotografia()).toStrictEqual(antes);
  });

  it('GET /api/lotes não existe (404)', async () => {
    expect((await app.request('/api/lotes')).status).toBe(404);
  });
});

describe('GET /api/historico', () => {
  async function historico(consulta = ''): Promise<EntradaHistorico[]> {
    const resposta = await app.request(`/api/historico${consulta}`);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    return (await resposta.json()) as EntradaHistorico[];
  }

  it('o lote de importação aparece com o comentário e sem alterações', async () => {
    expect(await historico()).toStrictEqual([
      {
        loteId: 1,
        autor: 'teste',
        autorNome: 'teste',
        criadoEm: '2026-01-01T00:00:00.000Z',
        efetivoEm: '2026-01-01T00:00:00.000Z',
        tipo: 'importacao',
        estado: 'aplicado',
        comentario: 'Importação de teste',
        alteracoes: [],
        reverte: [],
        revertidoPor: [],
      },
    ]);
  });

  it('do mais recente para o mais antigo, com as frases prontas a mostrar', async () => {
    await postar({
      versaoBase: 1,
      operacoes: [mover('p-alvaro', 'casaId', null, 'casa-ribeira')],
      comentario: 'Primeira',
    });
    await postar({
      versaoBase: 2,
      operacoes: [mover('p-ze', 'carrinhaId', 'car-2', null), mover('p-ze', 'obraId', 'obra-vale', null)],
    });

    const lista = await historico();
    expect(lista.map((h) => [h.loteId, h.tipo, h.comentario])).toStrictEqual([
      [3, 'mudanca', null],
      [2, 'mudanca', 'Primeira'],
      [1, 'importacao', 'Importação de teste'],
    ]);
    expect(lista.map((h) => h.alteracoes.map((a) => a.descricao))).toStrictEqual([
      [
        'Zé Teste — carrinha: ZZ 0002 → Sem transporte da empresa',
        'Zé Teste — obra: Obra do Vale → sem obra',
      ],
      ['Álvaro Exemplo — casa: Fora das casas CMF → Casa Ribeira', 'Álvaro Exemplo — casa confirmada'],
      [],
    ]);
    expect(lista[0]?.alteracoes[0]).toStrictEqual({
      entidade: 'pessoa',
      entidadeId: 'p-ze',
      campo: 'carrinhaId',
      antes: '"car-2"',
      depois: 'null',
      descricao: 'Zé Teste — carrinha: ZZ 0002 → Sem transporte da empresa',
    });
  });

  it('limite: por omissão 50, no máximo 200', async () => {
    inserirLotes(bd, 60);
    expect(await historico()).toHaveLength(50);
    expect((await historico('?limite=1')).map((h) => h.loteId)).toStrictEqual([61]);
    expect(await historico('?limite=200')).toHaveLength(61);
  });

  // Acima do máximo devolve os 200 mais recentes em vez de um erro (o "Carregar mais" do browser também
  // não passa de 200: ver cliente/edicao/historico.ts).
  it.each(['201', '220', '99999', '123456789012345678901234567890'])(
    'limite acima do máximo (%s) dá os 200 mais recentes',
    async (limite) => {
      inserirLotes(bd, 230);
      const lista = await historico(`?limite=${limite}`);
      expect(lista).toHaveLength(200);
      expect(lista[0]?.loteId).toBe(231);
      expect(lista.at(-1)?.loteId).toBe(32);
    },
  );

  it.each(['0', '00', '-1', '1.5', 'abc', '', '1e2', ' 5', '0x10'])(
    'limite inválido %j dá 400',
    async (limite) => {
      const resposta = await app.request(`/api/historico?limite=${encodeURIComponent(limite)}`);
      expect(resposta.status).toBe(400);
      expect(await resposta.json()).toStrictEqual({
        erro: 'O limite tem de ser um número inteiro maior do que zero.',
      });
    },
  );
});
