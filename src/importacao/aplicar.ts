// Gravação da importação na base de dados: apaga tudo e insere de novo, numa única transação.

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
import type { Bd } from '../servidor/db/ligacao';
import type { Entidades } from './tipos';

/** Linhas por INSERT (fica longe do limite de variáveis do SQLite). */
const POR_INSERT = 100;

function blocos<T>(lista: T[]): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += POR_INSERT) r.push(lista.slice(i, i + POR_INSERT));
  return r;
}

/**
 * Substitui o conteúdo da base de dados pelas entidades importadas e regista um lote de importação.
 * Apaga também o histórico (lotes e alterações). Devolve o id do lote.
 */
export function aplicarNaBd(
  bd: Bd,
  entidades: Entidades,
  opcoes: { agora: Date; comentario: string },
): number {
  const agora = opcoes.agora.toISOString();
  return bd.transaction((tx) => {
    // Por ordem compatível com as chaves estrangeiras.
    tx.delete(alteracoes).run();
    tx.delete(lotes).run();
    tx.delete(pessoas).run();
    tx.delete(obras).run();
    tx.delete(carrinhas).run();
    tx.delete(casas).run();
    tx.delete(locais).run();
    tx.delete(clientes).run();

    for (const b of blocos(entidades.clientes)) tx.insert(clientes).values(b).run();
    for (const b of blocos(entidades.locais)) tx.insert(locais).values(b).run();
    for (const b of blocos(entidades.casas)) tx.insert(casas).values(b).run();
    for (const b of blocos(entidades.carrinhas)) tx.insert(carrinhas).values(b).run();
    for (const b of blocos(entidades.obras)) tx.insert(obras).values(b).run();
    for (const b of blocos(entidades.pessoas)) tx.insert(pessoas).values(b).run();

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
  });
}
