// Migrações por aplicar numa BD que ainda não está aberta. Usa a mesma regra do migrador do Drizzle: aplica-se
// cada migração do _journal.json cujo `when` é posterior ao maior `created_at` da tabela __drizzle_migrations
// (todas, se a tabela não existir).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const JOURNAL = fileURLToPath(new URL('../db/migracoes/meta/_journal.json', import.meta.url));

interface EntradaJournal {
  tag: string;
  when: number;
}

export function lerJournal(caminho = JOURNAL): EntradaJournal[] {
  const journal = JSON.parse(readFileSync(caminho, 'utf8')) as { entries?: EntradaJournal[] };
  return journal.entries ?? [];
}

/** Etiquetas (tags) das migrações que o abrirBd vai aplicar a esta BD. */
export function migracoesPendentes(caminhoBd: string, journal = lerJournal()): string[] {
  const cliente = new Database(caminhoBd, { readonly: true, fileMustExist: true });
  try {
    const tabela = cliente
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
      .get();
    if (!tabela) return journal.map((entrada) => entrada.tag);
    const linha = cliente.prepare('SELECT MAX(created_at) AS ultima FROM __drizzle_migrations').get() as
      | { ultima: number | string | null }
      | undefined;
    const ultima = linha?.ultima === null || linha?.ultima === undefined ? null : Number(linha.ultima);
    return journal
      .filter((entrada) => ultima === null || ultima < entrada.when)
      .map((entrada) => entrada.tag);
  } finally {
    cliente.close();
  }
}
