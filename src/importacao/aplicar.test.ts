import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  alteracoes,
  carrinhas,
  casas,
  clientes,
  locais,
  lotes,
  obras,
  pessoas,
} from '../servidor/db/esquema';
import { abrirBd } from '../servidor/db/ligacao';
import { aplicarNaBd } from './aplicar';
import { dadosFicticios, folhaExtraFicticia, folhaPessoalFicticia } from './dadosFicticios';
import { processarImportacao } from './processar';

function entidades() {
  return processarImportacao({
    listaMestra: new Map([
      ['Pessoal', folhaPessoalFicticia()],
      ['Não estão na lista', folhaExtraFicticia()],
    ]),
    michael: null,
    dados: dadosFicticios(),
  }).entidades;
}

const agora = new Date('2026-10-03T10:00:00.000Z');

describe('aplicarNaBd', () => {
  it('grava tudo e um lote de importação', () => {
    const bd = abrirBd(':memory:');
    const e = entidades();
    const loteId = aplicarNaBd(bd, e, { agora, comentario: '6 pessoas' });

    expect(bd.select().from(clientes).all()).toHaveLength(2);
    expect(bd.select().from(locais).all()).toHaveLength(2);
    expect(bd.select().from(casas).all()).toHaveLength(2);
    expect(bd.select().from(carrinhas).all()).toHaveLength(3);
    const gravadas = bd.select().from(pessoas).all();
    expect(gravadas).toHaveLength(6);
    expect(gravadas.find((p) => p.id === 'p-900-002_3')).toEqual(
      e.pessoas.find((p) => p.id === 'p-900-002_3'),
    );
    expect(
      bd
        .select()
        .from(carrinhas)
        .all()
        .find((c) => c.id === 'AA1111')?.matriculasAlternativas,
    ).toEqual(['ZZ9999']);
    expect(bd.select().from(lotes).all()).toEqual([
      {
        id: loteId,
        autor: 'importacao',
        tipo: 'importacao',
        estado: 'aplicado',
        criadoEm: '2026-10-03T10:00:00.000Z',
        efetivoEm: '2026-10-03T10:00:00.000Z',
        comentario: '6 pessoas',
      },
    ]);
  });

  it('voltar a aplicar substitui tudo (não duplica)', () => {
    const bd = abrirBd(':memory:');
    aplicarNaBd(bd, entidades(), { agora, comentario: 'primeira' });
    aplicarNaBd(bd, entidades(), { agora, comentario: 'segunda' });
    expect(bd.select().from(pessoas).all()).toHaveLength(6);
    expect(
      bd
        .select()
        .from(lotes)
        .all()
        .map((l) => l.comentario),
    ).toEqual(['segunda']);
  });

  it('apaga também obras e histórico já existentes (ordem das chaves estrangeiras) e o nº do lote cresce', () => {
    const bd = abrirBd(':memory:');
    const primeiro = aplicarNaBd(bd, entidades(), { agora, comentario: 'primeira' });
    // Estado como ficará depois do M2: uma obra com gente e uma alteração no histórico.
    bd.insert(obras)
      .values({ id: 'obra-1', nome: 'Obra', clienteId: 'alfa', localId: 'local-a', origem: 'manual' })
      .run();
    bd.update(pessoas).set({ obraId: 'obra-1' }).where(eq(pessoas.id, 'p-900-001')).run();
    bd.insert(alteracoes)
      .values({
        loteId: primeiro,
        entidade: 'pessoa',
        entidadeId: 'p-900-001',
        campo: 'obraId',
        depois: '"obra-1"',
      })
      .run();

    const segundo = aplicarNaBd(bd, entidades(), { agora, comentario: 'segunda' });
    expect(segundo).toBeGreaterThan(primeiro); // a versão do estado (maior id de lote) tem de subir
    expect(bd.select().from(obras).all()).toEqual([]);
    expect(bd.select().from(alteracoes).all()).toEqual([]);
    expect(
      bd
        .select()
        .from(pessoas)
        .all()
        .every((p) => p.obraId === null),
    ).toBe(true);
  });

  it('se alguma coisa falha, nada muda (uma só transação)', () => {
    const bd = abrirBd(':memory:');
    aplicarNaBd(bd, entidades(), { agora, comentario: 'boa' });
    const ma = entidades();
    const primeira = ma.pessoas[0];
    if (primeira) primeira.casaId = 'casa-que-nao-existe';
    expect(() => aplicarNaBd(bd, ma, { agora, comentario: 'má' })).toThrow();
    expect(bd.select().from(pessoas).all()).toHaveLength(6);
    expect(
      bd
        .select()
        .from(lotes)
        .all()
        .map((l) => l.comentario),
    ).toEqual(['boa']);
  });
});
