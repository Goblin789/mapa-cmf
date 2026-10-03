// Abre a base de dados SQLite e aplica as migrações pendentes.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as esquema from './esquema';

export type Bd = BetterSQLite3Database<typeof esquema> & { $client: Database.Database };

const PASTA_MIGRACOES = resolve(dirname(fileURLToPath(import.meta.url)), 'migracoes');

/** Abre (ou cria) a base de dados em `caminho` e aplica as migrações. ':memory:' para testes. */
export function abrirBd(caminho: string): Bd {
  if (caminho !== ':memory:') mkdirSync(dirname(resolve(caminho)), { recursive: true });
  const sqlite = new Database(caminho);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const bd = drizzle(sqlite, { schema: esquema });
  migrate(bd, { migrationsFolder: PASTA_MIGRACOES });
  return bd;
}
