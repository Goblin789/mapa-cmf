// A migração 0004 (M2: indisponibilidades, problemas e lotes.reverte) numa BD criada até à 0003, com dados
// fictícios: aplica-se sem perder linhas. BD temporária.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migracoesPendentes } from './copias/migracoes';
import { inserirDadosFicticios } from './dados-de-teste';
import * as esquema from './db/esquema';
import { abrirBd, type Bd } from './db/ligacao';
import { carregarEstado } from './estado';

const MIGRACOES = resolve(dirname(fileURLToPath(import.meta.url)), 'db', 'migracoes');
const TABELAS = ['clientes', 'locais', 'casas', 'carrinhas', 'obras', 'pessoas', 'lotes', 'alteracoes'];

let pasta: string;

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'mapa-cmf-0004-'));
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
});

/** Uma pasta de migrações só até à 0003 (as mesmas, sem a 0004). */
function migracoesAte0003(): string {
  const destino = join(pasta, 'migracoes');
  mkdirSync(join(destino, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(MIGRACOES, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  const ate = journal.entries.filter((e) => /^000[0-3]_/.test(e.tag));
  expect(ate.map((e) => e.tag.slice(0, 4))).toEqual(['0000', '0001', '0002', '0003']);
  for (const e of ate) {
    copyFileSync(join(MIGRACOES, `${e.tag}.sql`), join(destino, `${e.tag}.sql`));
    const n = e.tag.slice(0, 4);
    copyFileSync(join(MIGRACOES, 'meta', `${n}_snapshot.json`), join(destino, 'meta', `${n}_snapshot.json`));
  }
  writeFileSync(join(destino, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: ate }));
  return destino;
}

function contar(cliente: Database.Database): Record<string, number> {
  return Object.fromEntries(
    TABELAS.map((t) => [t, (cliente.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]),
  );
}

describe('migração 0004', () => {
  it('uma BD até à 0003, com dados, migra para a 0004 sem perder linhas', () => {
    const caminho = join(pasta, 'mapa.db');
    const sqlite = new Database(caminho);
    sqlite.pragma('foreign_keys = ON');
    const antiga = drizzle(sqlite, { schema: esquema }) as unknown as Bd;
    migrate(antiga, { migrationsFolder: migracoesAte0003() });
    inserirDadosFicticios(antiga);
    // Lotes e alterações à mão: a tabela `lotes` da 0003 ainda não tem a coluna `reverte`.
    sqlite
      .prepare(
        "INSERT INTO lotes (autor, criado_em, efetivo_em, estado, tipo, comentario) VALUES ('local', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z', 'aplicado', 'mudanca', 'Fictício')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO alteracoes (lote_id, entidade, entidade_id, campo, antes, depois) VALUES (1, 'pessoa', 'p-ze', 'casaId', 'null', '\"casa-monte\"')",
      )
      .run();
    const antes = contar(sqlite);
    sqlite.close();
    expect(antes.pessoas).toBeGreaterThan(0);
    expect(migracoesPendentes(caminho)).toEqual(['0004_m2_indisponivel_problemas']);

    const bd = abrirBd(caminho);
    try {
      expect(contar(bd.$client)).toEqual(antes);
      expect(migracoesPendentes(caminho)).toEqual([]);
      const estado = carregarEstado(bd);
      expect(estado.indisponibilidades).toEqual([]);
      expect(estado.problemas).toEqual([]);
      expect(bd.select().from(esquema.lotes).all()[0]).toMatchObject({
        comentario: 'Fictício',
        reverte: null,
      });
      // As tabelas novas funcionam (com as FK e a regra de um só alvo).
      bd.insert(esquema.indisponibilidades)
        .values({ id: 'indisp-00000001', pessoaId: 'p-ze', inicio: '2026-10-05' })
        .run();
      expect(() =>
        bd
          .insert(esquema.problemas)
          .values({ id: 'problema-0001', texto: 'x', abertoEm: '2026-10-05' })
          .run(),
      ).toThrow(/CHECK constraint failed/);
      expect(() =>
        bd
          .insert(esquema.indisponibilidades)
          .values({ id: 'indisp-00000002', pessoaId: 'p-nao-existe', inicio: '2026-10-05' })
          .run(),
      ).toThrow(/FOREIGN KEY/);
    } finally {
      bd.$client.close();
    }
  });

  it('o SQL da 0004 só cria as tabelas novas e a coluna (não toca nos dados)', () => {
    const sql = readFileSync(join(MIGRACOES, '0004_m2_indisponivel_problemas.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE `indisponibilidades`');
    expect(sql).toContain('CREATE TABLE `problemas`');
    expect(sql).toContain('ALTER TABLE `lotes` ADD `reverte` text');
    expect(sql).not.toMatch(/motivo/i);
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|UPDATE `|INSERT INTO/);
  });
});
