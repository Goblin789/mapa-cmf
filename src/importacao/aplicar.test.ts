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
import { aplicarNaBd, contarGravacoesDoPrograma, ErroGravacoesNoPrograma } from './aplicar';
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
        reverte: null,
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

  it('um condutor definido nas carrinhas não impede reimportar (chave estrangeira para as pessoas)', () => {
    const bd = abrirBd(':memory:');
    aplicarNaBd(bd, entidades(), { agora, comentario: 'primeira' });
    bd.update(carrinhas).set({ condutorId: 'p-900-001' }).where(eq(carrinhas.id, 'AA1111')).run();
    expect(() => aplicarNaBd(bd, entidades(), { agora, comentario: 'segunda' })).not.toThrow();
    expect(
      bd
        .select()
        .from(carrinhas)
        .all()
        .map((c) => c.condutorId),
    ).toEqual([null, null, null]);
  });

  it('um condutor vindo da importação liga-se depois de as pessoas entrarem', () => {
    const bd = abrirBd(':memory:');
    const e = entidades();
    const aa = e.carrinhas.find((c) => c.id === 'AA1111');
    if (aa) aa.condutorId = 'p-900-001';
    aplicarNaBd(bd, e, { agora, comentario: 'com condutor' });
    expect(bd.select().from(carrinhas).where(eq(carrinhas.id, 'AA1111')).get()?.condutorId).toBe('p-900-001');
  });

  it('casas que contam sempre como cheias ficam gravadas', () => {
    const bd = abrirBd(':memory:');
    const e = entidades();
    const b = e.casas.find((c) => c.id === 'casa-b');
    if (b) b.sempreCheia = true;
    aplicarNaBd(bd, e, { agora, comentario: 'x' });
    expect(
      bd
        .select()
        .from(casas)
        .all()
        .map((c) => [c.id, c.sempreCheia]),
    ).toEqual([
      ['casa-1-foret', false],
      ['casa-b', true],
    ]);
  });

  describe('proteção das gravações feitas no programa', () => {
    function comUmaMudanca() {
      const bd = abrirBd(':memory:');
      const primeiro = aplicarNaBd(bd, entidades(), { agora, comentario: 'primeira' });
      const quando = agora.toISOString();
      const { id } = bd
        .insert(lotes)
        .values({
          autor: 'local',
          tipo: 'mudanca',
          estado: 'aplicado',
          criadoEm: quando,
          efetivoEm: quando,
          comentario: null,
        })
        .returning({ id: lotes.id })
        .get();
      bd.update(pessoas).set({ casaId: null }).where(eq(pessoas.id, 'p-900-001')).run();
      bd.insert(alteracoes)
        .values({
          loteId: id,
          entidade: 'pessoa',
          entidadeId: 'p-900-001',
          campo: 'casaId',
          antes: '"casa-1-foret"',
          depois: 'null',
        })
        .run();
      return { bd, primeiro, mudanca: id };
    }

    it('conta só os lotes que não são importações', () => {
      const { bd } = comUmaMudanca();
      expect(contarGravacoesDoPrograma(bd)).toBe(1);
      expect(contarGravacoesDoPrograma(abrirBd(':memory:'))).toBe(0);
    });

    it('com gravações do programa recusa, explica e não mexe em nada', () => {
      const { bd } = comUmaMudanca();
      const antes = {
        pessoas: bd.select().from(pessoas).all(),
        lotes: bd.select().from(lotes).all(),
        alteracoes: bd.select().from(alteracoes).all(),
      };
      let erro: unknown;
      try {
        aplicarNaBd(bd, entidades(), { agora, comentario: 'segunda' });
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(ErroGravacoesNoPrograma);
      expect((erro as Error).message).toBe(
        'A base de dados tem 1 gravação feita no programa; reimportar apagava-a. ' +
          'Use --forcar se tiver mesmo a certeza.',
      );
      expect({
        pessoas: bd.select().from(pessoas).all(),
        lotes: bd.select().from(lotes).all(),
        alteracoes: bd.select().from(alteracoes).all(),
      }).toEqual(antes);
    });

    it('a mensagem diz quantas são', () => {
      expect(new ErroGravacoesNoPrograma(3).message).toBe(
        'A base de dados tem 3 gravações feitas no programa; reimportar apagava-as. ' +
          'Use --forcar se tiver mesmo a certeza.',
      );
    });

    it('com forcar, apaga-as e importa de novo', () => {
      const { bd, mudanca } = comUmaMudanca();
      const loteId = aplicarNaBd(bd, entidades(), { agora, comentario: 'forçada', forcar: true });
      expect(loteId).toBeGreaterThan(mudanca);
      expect(
        bd
          .select()
          .from(lotes)
          .all()
          .map((l) => [l.tipo, l.comentario]),
      ).toEqual([['importacao', 'forçada']]);
      expect(bd.select().from(alteracoes).all()).toEqual([]);
      expect(bd.select().from(pessoas).where(eq(pessoas.id, 'p-900-001')).get()?.casaId).toBe('casa-1-foret');
    });
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
