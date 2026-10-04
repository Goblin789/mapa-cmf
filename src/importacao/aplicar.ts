// Gravação da importação na base de dados: apaga tudo e insere de novo, numa única transação.
// Proteção: se a base de dados já tiver gravações feitas no programa (o modo de edição), reimportar
// apagava-as; só se faz com `forcar`.

import { count, eq, ne } from 'drizzle-orm';
import {
  alteracoes,
  carrinhas,
  casas,
  clientes,
  indisponibilidades,
  locais,
  lotes,
  obras,
  pessoas,
  problemas,
} from '../servidor/db/esquema';
import type { Bd } from '../servidor/db/ligacao';
import type { Entidades } from './tipos';

/** A base de dados tem gravações feitas no programa e a importação não foi forçada: nada foi gravado. */
export class ErroGravacoesNoPrograma extends Error {
  constructor(readonly gravacoes: number) {
    super(
      gravacoes === 1
        ? 'A base de dados tem 1 gravação feita no programa; reimportar apagava-a. ' +
            'Use --forcar se tiver mesmo a certeza.'
        : `A base de dados tem ${gravacoes} gravações feitas no programa; reimportar apagava-as. ` +
            'Use --forcar se tiver mesmo a certeza.',
    );
    this.name = 'ErroGravacoesNoPrograma';
  }
}

/** Linhas por INSERT (fica longe do limite de variáveis do SQLite). */
const POR_INSERT = 100;

function blocos<T>(lista: T[]): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += POR_INSERT) r.push(lista.slice(i, i + POR_INSERT));
  return r;
}

/** Lotes que não vêm de uma importação (mudanças, correções, fichas): o trabalho feito no programa. */
export function contarGravacoesDoPrograma(bd: Pick<Bd, 'select'>): number {
  return bd.select({ n: count() }).from(lotes).where(ne(lotes.tipo, 'importacao')).get()?.n ?? 0;
}

/**
 * Substitui o conteúdo da base de dados pelas entidades importadas e regista um lote de importação.
 * Apaga também o histórico (lotes e alterações) e, do M2, os períodos de indisponibilidade e os problemas.
 * Devolve o id do lote.
 * Se já houver gravações feitas no programa, recusa (ErroGravacoesNoPrograma) a não ser com `forcar`.
 */
export function aplicarNaBd(
  bd: Bd,
  entidades: Entidades,
  opcoes: { agora: Date; comentario: string; forcar?: boolean },
): number {
  const agora = opcoes.agora.toISOString();
  return bd.transaction(
    (tx) => {
      // Dentro da transação (IMMEDIATE): ninguém grava pelo meio entre contar e apagar.
      const gravacoes = contarGravacoesDoPrograma(tx);
      if (gravacoes > 0 && !opcoes.forcar) throw new ErroGravacoesNoPrograma(gravacoes);

      // Por ordem compatível com as chaves estrangeiras. O condutor das carrinhas aponta para as pessoas.
      tx.update(carrinhas).set({ condutorId: null }).run();
      tx.delete(alteracoes).run();
      tx.delete(lotes).run();
      // M2: os períodos apontam para as pessoas; os problemas para as casas e os veículos.
      tx.delete(problemas).run();
      tx.delete(indisponibilidades).run();
      tx.delete(pessoas).run();
      tx.delete(obras).run();
      tx.delete(carrinhas).run();
      tx.delete(casas).run();
      tx.delete(locais).run();
      tx.delete(clientes).run();

      for (const b of blocos(entidades.clientes)) tx.insert(clientes).values(b).run();
      for (const b of blocos(entidades.locais)) tx.insert(locais).values(b).run();
      for (const b of blocos(entidades.casas)) tx.insert(casas).values(b).run();
      // As carrinhas entram antes das pessoas: um condutor importado (ainda nenhum) só se liga no fim.
      for (const b of blocos(entidades.carrinhas.map((c) => ({ ...c, condutorId: null })))) {
        tx.insert(carrinhas).values(b).run();
      }
      for (const b of blocos(entidades.obras)) tx.insert(obras).values(b).run();
      for (const b of blocos(entidades.pessoas)) tx.insert(pessoas).values(b).run();
      for (const c of entidades.carrinhas) {
        if (c.condutorId) {
          tx.update(carrinhas).set({ condutorId: c.condutorId }).where(eq(carrinhas.id, c.id)).run();
        }
      }

      const lote = tx
        .insert(lotes)
        .values({
          autor: 'importacao',
          tipo: 'importacao',
          estado: 'aplicado',
          criadoEm: agora,
          efetivoEm: agora,
          comentario: opcoes.comentario,
        })
        .returning({ id: lotes.id })
        .get();
      return lote.id;
    },
    { behavior: 'immediate' },
  );
}
