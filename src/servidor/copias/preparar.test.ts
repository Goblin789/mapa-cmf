// Testes da cópia simples antes de migrar, no PC sem destino de cópias (M2). BDs temporárias, dados fictícios.

import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBd } from '../db/ligacao';
import {
  lerJournal,
  migracoesPendentes,
  recusaPorMigracoesPendentes,
  TEXTO_FALTAM_MIGRACOES,
} from './migracoes';
import { copiaSimplesAntesDeMigrar, prepararBd } from './preparar';

const AGORA = new Date('2026-10-04T19:30:05.000Z');

let pasta: string;

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'mapa-cmf-preparar-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(pasta, { recursive: true, force: true });
});

/** Uma BD "antiga": uma tabela com uma linha e sem migrações aplicadas (todas pendentes). */
function bdAntiga(caminho: string): void {
  const bd = new Database(caminho);
  bd.exec(
    "CREATE TABLE ficticia (id INTEGER PRIMARY KEY, nome TEXT); INSERT INTO ficticia (nome) VALUES ('Ana');",
  );
  bd.close();
}

describe('cópia simples antes de migrar (PC, sem destino de cópias)', () => {
  it('com migrações pendentes, copia para <pasta da BD>/copias com a 1.ª migração e a hora no nome', async () => {
    const caminho = join(pasta, 'mapa.db');
    bdAntiga(caminho);
    const primeira = lerJournal()[0]?.tag;
    await prepararBd(caminho, null, {}, { agora: () => AGORA });
    const copias = readdirSync(join(pasta, 'copias'));
    // 19:30:05 UTC = 21:30:05 no Luxemburgo (verão).
    expect(copias).toEqual([`mapa-antes-${primeira}-2026-10-04-213005.db`]);
    const copia = new Database(join(pasta, 'copias', copias[0] as string), { readonly: true });
    expect(copia.prepare('SELECT nome FROM ficticia').all()).toEqual([{ nome: 'Ana' }]);
    copia.close();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(join(pasta, 'copias')));
  });

  it('sem migrações pendentes não copia nada', async () => {
    const caminho = join(pasta, 'mapa.db');
    abrirBd(caminho).$client.close();
    expect(migracoesPendentes(caminho)).toEqual([]);
    await prepararBd(caminho, null, {}, { agora: () => AGORA });
    expect(existsSync(join(pasta, 'copias'))).toBe(false);
  });

  it('só a 0004 pendente: a cópia diz que é antes dela e a BD migra sem perder nada', async () => {
    const caminho = join(pasta, 'dados.db');
    bdAntiga(caminho);
    const destino = await copiaSimplesAntesDeMigrar(caminho, '0004_m2_indisponivel_problemas', AGORA);
    expect(destino).toBe(
      join(pasta, 'copias', 'dados-antes-0004_m2_indisponivel_problemas-2026-10-04-213005.db'),
    );
    expect(existsSync(destino)).toBe(true);
  });

  it('em produção não copia (lá as cópias são obrigatórias e vão para o destino)', async () => {
    const caminho = join(pasta, 'mapa.db');
    bdAntiga(caminho);
    await prepararBd(caminho, null, {}, { agora: () => AGORA, producao: true });
    expect(existsSync(join(pasta, 'copias'))).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('migra-se sem cópia'));
  });

  it('se a cópia falhar, não se migra (lança)', async () => {
    const caminho = join(pasta, 'mapa.db');
    bdAntiga(caminho);
    // "copias" já existe como ficheiro: não se consegue criar a pasta.
    writeFileSync(join(pasta, 'copias'), 'x');
    const erro = await prepararBd(caminho, null, {}, { agora: () => AGORA }).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain('a cópia antes de migrar falhou');
    expect((erro as Error).message).toContain('O servidor não arranca sem essa cópia.');
  });
});

describe('recusaPorMigracoesPendentes (os scripts nunca migram uma BD que já existe)', () => {
  it('BD com migrações por aplicar: a frase diz quais e manda arrancar o servidor; a BD não migra', () => {
    const caminho = join(pasta, 'mapa.db');
    bdAntiga(caminho);
    const frase = recusaPorMigracoesPendentes(caminho);
    expect(frase).toContain(TEXTO_FALTAM_MIGRACOES);
    expect(frase).toContain(lerJournal()[0]?.tag ?? '?');
    expect(migracoesPendentes(caminho)).toHaveLength(lerJournal().length);
  });

  it('BD em dia ou que ainda não existe: nada a recusar (uma BD nova não tem nada a perder)', () => {
    const caminho = join(pasta, 'mapa.db');
    expect(recusaPorMigracoesPendentes(caminho)).toBeNull();
    expect(existsSync(caminho)).toBe(false);
    abrirBd(caminho).$client.close();
    expect(recusaPorMigracoesPendentes(caminho)).toBeNull();
  });
});
