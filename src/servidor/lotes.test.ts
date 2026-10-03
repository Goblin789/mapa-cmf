import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Operacao } from '../dominio/operacoes';
import { estadoExemplo } from '../dominio/teste-fabrica';
import { inserirDadosFicticios, inserirLotes } from './dados-de-teste';
import * as esquema from './db/esquema';
import { abrirBd, type Bd } from './db/ligacao';
import { carregarEstado } from './estado';
import {
  alteracoesDasOperacoes,
  descreverAlteracao,
  descreverConflito,
  gravarLote,
  lerHistorico,
} from './lotes';

const AGORA = new Date('2026-10-03T08:30:00.000Z');

function mover(pessoaId: string, campo: Operacao['campo'], de: string | null, para: string | null): Operacao {
  return { tipo: 'mover', pessoaId, campo, de, para };
}

describe('alteracoesDasOperacoes', () => {
  it('um campo por linha, com as marcas "a confirmar" que a mudança limpa', () => {
    const estado = estadoExemplo();
    expect(
      alteracoesDasOperacoes(estado, [
        mover('p-gil', 'casaId', null, 'casa-3'),
        mover('p-duarte', 'carrinhaId', 'zz1002', 'zz1003'),
        mover('p-ana', 'obraId', 'obra-b', null),
      ]),
    ).toStrictEqual([
      { pessoaId: 'p-gil', campo: 'casaId', antes: null, depois: 'casa-3' },
      { pessoaId: 'p-gil', campo: 'casaAConfirmar', antes: true, depois: false },
      { pessoaId: 'p-duarte', campo: 'carrinhaId', antes: 'zz1002', depois: 'zz1003' },
      { pessoaId: 'p-duarte', campo: 'carrinhaAConfirmar', antes: true, depois: false },
      { pessoaId: 'p-ana', campo: 'obraId', antes: 'obra-b', depois: null },
    ]);
  });

  it('a mesma pessoa em vários campos fica junta, por ordem fixa dos campos', () => {
    const estado = estadoExemplo();
    expect(
      alteracoesDasOperacoes(estado, [
        mover('p-ana', 'obraId', 'obra-b', 'obra-a'),
        mover('p-helena', 'casaId', null, 'casa-3'),
        mover('p-ana', 'casaId', 'casa-1', 'casa-2'),
      ]),
    ).toStrictEqual([
      { pessoaId: 'p-ana', campo: 'casaId', antes: 'casa-1', depois: 'casa-2' },
      { pessoaId: 'p-ana', campo: 'obraId', antes: 'obra-b', depois: 'obra-a' },
      { pessoaId: 'p-helena', campo: 'casaId', antes: null, depois: 'casa-3' },
    ]);
  });

  it('sem marca ligada não há linha para a marca; operações sem efeito e pessoas inexistentes não contam', () => {
    const estado = estadoExemplo();
    expect(
      alteracoesDasOperacoes(estado, [
        mover('p-ana', 'casaId', 'casa-1', 'casa-1'),
        mover('nao-existe', 'casaId', null, 'casa-1'),
        mover('p-bruno', 'carrinhaId', 'zz1001', null),
      ]),
    ).toStrictEqual([{ pessoaId: 'p-bruno', campo: 'carrinhaId', antes: 'zz1001', depois: null }]);
  });
});

describe('descreverConflito', () => {
  const estado = estadoExemplo();

  it('com valores nos dois lados', () => {
    expect(
      descreverConflito(estado, {
        pessoaId: 'p-ana',
        campo: 'carrinhaId',
        esperado: 'zz1002',
        atual: 'zz1001',
      }),
    ).toBe('Ana T. — carrinha: esperavas ZZ1002, mas agora está em ZZ1001 (alguém mudou entretanto)');
    expect(
      descreverConflito(estado, { pessoaId: 'p-ana', campo: 'casaId', esperado: 'casa-2', atual: 'casa-1' }),
    ).toBe('Ana T. — casa: esperavas Casa Dois, mas agora está em Casa Um (alguém mudou entretanto)');
  });

  it('quando agora não tem valor, diz onde está por palavras', () => {
    expect(
      descreverConflito(estado, { pessoaId: 'p-helena', campo: 'casaId', esperado: 'casa-2', atual: null }),
    ).toBe(
      'Helena Z. — casa: esperavas Casa Dois, mas agora está fora das casas CMF (alguém mudou entretanto)',
    );
    expect(
      descreverConflito(estado, {
        pessoaId: 'p-helena',
        campo: 'carrinhaId',
        esperado: 'zz1001',
        atual: null,
      }),
    ).toBe(
      'Helena Z. — carrinha: esperavas ZZ1001, mas agora está sem transporte da empresa (alguém mudou entretanto)',
    );
    expect(
      descreverConflito(estado, { pessoaId: 'p-helena', campo: 'obraId', esperado: 'obra-a', atual: null }),
    ).toBe('Helena Z. — obra: esperavas Obra Alfa, mas agora está sem obra (alguém mudou entretanto)');
  });

  it('quando esperava "sem valor" e ids desconhecidos', () => {
    expect(
      descreverConflito(estado, { pessoaId: 'p-gil', campo: 'obraId', esperado: null, atual: 'obra-b' }),
    ).toBe('Gil N. — obra: esperavas sem obra, mas agora está em Obra Beta (alguém mudou entretanto)');
    expect(
      descreverConflito(estado, { pessoaId: 'p-x', campo: 'casaId', esperado: null, atual: 'casa-x' }),
    ).toBe('p-x — casa: esperavas Fora das casas CMF, mas agora está em casa-x (alguém mudou entretanto)');
  });
});

describe('descreverAlteracao', () => {
  const estado = estadoExemplo();
  const linha = (campo: string, antes: string | null, depois: string | null, entidadeId = 'p-gil') => ({
    entidade: 'pessoa',
    entidadeId,
    campo,
    antes,
    depois,
  });

  it('casa, carrinha e obra com os nomes atuais', () => {
    expect(descreverAlteracao(estado, linha('casaId', 'null', '"casa-3"'))).toBe(
      'Gil N. — casa: Fora das casas CMF → Casa Três',
    );
    expect(descreverAlteracao(estado, linha('carrinhaId', '"zz1001"', 'null'))).toBe(
      'Gil N. — carrinha: ZZ1001 → Sem transporte da empresa',
    );
    expect(descreverAlteracao(estado, linha('obraId', '"obra-b"', '"obra-a"'))).toBe(
      'Gil N. — obra: Obra Beta → Obra Alfa',
    );
  });

  it('marcas "a confirmar"', () => {
    expect(descreverAlteracao(estado, linha('casaAConfirmar', 'true', 'false'))).toBe(
      'Gil N. — casa a confirmar: sim → não',
    );
    expect(descreverAlteracao(estado, linha('carrinhaAConfirmar', 'false', 'true', 'p-duarte'))).toBe(
      'Duarte S. — carrinha a confirmar: não → sim',
    );
  });

  it('valores em falta, JSON estragado e pessoas que já não existem não rebentam', () => {
    expect(descreverAlteracao(estado, linha('casaId', null, 'casa-3'))).toBe(
      'Gil N. — casa: Fora das casas CMF → Casa Três',
    );
    expect(descreverAlteracao(estado, linha('casaAConfirmar', null, '1', 'p-x'))).toBe(
      'p-x — casa a confirmar: — → 1',
    );
  });

  it('outras entidades ou campos: frase genérica com os valores em bruto', () => {
    expect(
      descreverAlteracao(estado, {
        entidade: 'casa',
        entidadeId: 'casa-1',
        campo: 'lotacao',
        antes: '3',
        depois: null,
      }),
    ).toBe('casa casa-1 — lotacao: 3 → —');
    expect(descreverAlteracao(estado, linha('telefone', 'null', '"000"'))).toBe(
      'pessoa p-gil — telefone: null → "000"',
    );
  });
});

describe('gravarLote e lerHistorico na base de dados', () => {
  let bd: Bd;

  beforeEach(() => {
    bd = abrirBd(':memory:');
    inserirDadosFicticios(bd);
    inserirLotes(bd, 1);
  });

  afterEach(() => {
    bd.$client.close();
  });

  const pedido = (operacoes: Operacao[], comentario: string | null = null) => ({
    operacoes,
    comentario,
    autor: 'local',
    agora: AGORA,
  });

  it('grava e devolve a nova versão; o histórico mostra-o primeiro', () => {
    const r = gravarLote(bd, pedido([mover('p-alvaro', 'casaId', null, 'casa-monte')], 'Teste'));
    expect(r).toStrictEqual({ tipo: 'gravado', loteId: 2, versao: 2, alteracoes: 2 });
    expect(carregarEstado(bd).pessoas.find((p) => p.id === 'p-alvaro')).toMatchObject({
      casaId: 'casa-monte',
      casaAConfirmar: false,
      carrinhaAConfirmar: true,
    });

    const historico = lerHistorico(bd, 10);
    expect(historico.map((h) => h.loteId)).toStrictEqual([2, 1]);
    expect(historico[0]).toStrictEqual({
      loteId: 2,
      autor: 'local',
      criadoEm: AGORA.toISOString(),
      efetivoEm: AGORA.toISOString(),
      tipo: 'mudanca',
      estado: 'aplicado',
      comentario: 'Teste',
      alteracoes: [
        {
          entidade: 'pessoa',
          entidadeId: 'p-alvaro',
          campo: 'casaId',
          antes: 'null',
          depois: '"casa-monte"',
          descricao: 'Álvaro Exemplo — casa: Fora das casas CMF → Casa Monte',
        },
        {
          entidade: 'pessoa',
          entidadeId: 'p-alvaro',
          campo: 'casaAConfirmar',
          antes: 'true',
          depois: 'false',
          descricao: 'Álvaro Exemplo — casa a confirmar: sim → não',
        },
      ],
    });
  });

  it('conflito, inválido e vazio não gravam nada', () => {
    const antes = { ...carregarEstado(bd, AGORA) };
    expect(gravarLote(bd, pedido([mover('p-ze', 'casaId', 'casa-monte', null)]))).toMatchObject({
      tipo: 'conflito',
    });
    expect(gravarLote(bd, pedido([mover('p-bruno', 'casaId', 'casa-monte', null)]))).toStrictEqual({
      tipo: 'invalido',
      erros: ['Bruno Fictício não está ativa.'],
    });
    expect(
      gravarLote(
        bd,
        pedido([
          mover('p-ze', 'casaId', 'casa-ribeira', 'casa-monte'),
          mover('p-ze', 'casaId', 'casa-monte', 'casa-ribeira'),
        ]),
      ),
    ).toStrictEqual({ tipo: 'vazio' });
    expect(carregarEstado(bd, AGORA)).toStrictEqual(antes);
    expect(bd.select().from(esquema.alteracoes).all()).toStrictEqual([]);
  });

  it('se uma escrita falhar a meio, nada fica gravado (transação)', () => {
    const antes = carregarEstado(bd, AGORA);
    bd.$client.exec(
      "CREATE TRIGGER falhar BEFORE INSERT ON alteracoes BEGIN SELECT RAISE(ABORT, 'falha de teste'); END",
    );
    expect(() =>
      gravarLote(
        bd,
        pedido([
          mover('p-alvaro', 'casaId', null, 'casa-monte'),
          mover('p-ze', 'carrinhaId', 'car-2', 'car-1'),
        ]),
      ),
    ).toThrow(/falha de teste/);
    expect(carregarEstado(bd, AGORA)).toStrictEqual(antes);
  });

  it('o histórico usa os nomes atuais e respeita o limite', () => {
    gravarLote(bd, pedido([mover('p-ze', 'carrinhaId', 'car-2', 'car-1')]));
    gravarLote(bd, pedido([mover('p-ze', 'obraId', 'obra-vale', null)]));
    bd.$client.prepare("UPDATE carrinhas SET matricula = 'ZZ0101' WHERE id = 'car-1'").run();

    const historico = lerHistorico(bd, 2);
    expect(historico.map((h) => h.loteId)).toStrictEqual([3, 2]);
    expect(historico.map((h) => h.alteracoes.map((a) => a.descricao))).toStrictEqual([
      ['Zé Teste — obra: Obra do Vale → sem obra'],
      ['Zé Teste — carrinha: ZZ0002 → ZZ0101'],
    ]);
    expect(lerHistorico(bd, 1).map((h) => h.loteId)).toStrictEqual([3]);
  });

  it('sem lotes, o histórico é uma lista vazia', () => {
    const vazia = abrirBd(':memory:');
    expect(lerHistorico(vazia, 50)).toStrictEqual([]);
    vazia.$client.close();
  });
});
