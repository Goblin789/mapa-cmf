// Migrações por aplicar numa BD que ainda não está aberta. Usa a mesma regra do migrador do Drizzle: aplica-se
// cada migração do _journal.json cujo `when` é posterior ao maior `created_at` da tabela __drizzle_migrations
// (todas, se a tabela não existir).

import { existsSync, readFileSync } from 'node:fs';
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

/**
 * As migrações aplicam-se só no arranque do servidor, que faz antes a cópia de segurança (no PC, a cópia
 * simples em copias/, ao lado da BD: servidor/copias/preparar.ts). Os scripts que abrem a BD (sincronizar,
 * importar, sessoes) nunca migram uma BD que já existe: recusam com esta frase.
 */
export const TEXTO_FALTAM_MIGRACOES =
  'Faltam as migrações mais recentes: arranque o servidor uma vez (npm run dev), que faz uma cópia da base de dados e as aplica, e volte a correr.';

/**
 * Para os scripts, antes do abrirBd (que migra sem cópia): null se a BD não existe (uma BD nova não tem
 * nada a perder) ou já tem as migrações todas; senão, a frase a mostrar (quais faltam + o que fazer).
 */
export function recusaPorMigracoesPendentes(caminhoBd: string, journal = lerJournal()): string | null {
  if (!existsSync(caminhoBd)) return null;
  const pendentes = migracoesPendentes(caminhoBd, journal);
  if (pendentes.length === 0) return null;
  const quais =
    pendentes.length === 1 ? '1 migração por aplicar' : `${pendentes.length} migrações por aplicar`;
  return `A base de dados tem ${quais} (${pendentes.join(', ')}): não se fez nada. ${TEXTO_FALTAM_MIGRACOES}`;
}
