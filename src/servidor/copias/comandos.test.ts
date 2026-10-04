import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inserirDadosFicticios, inserirLotes } from '../dados-de-teste';
import { abrirBd } from '../db/ligacao';
import { type ComandoCopias, executarComandoCopias, lerArgumentosCopias } from './comandos';

describe('lerArgumentosCopias', () => {
  it('lê os comandos', () => {
    expect(lerArgumentosCopias([])).toEqual({ comando: { tipo: 'ajuda' } });
    expect(lerArgumentosCopias(['chave'])).toEqual({ comando: { tipo: 'chave' } });
    expect(lerArgumentosCopias(['fazer'])).toEqual({ comando: { tipo: 'fazer', bd: null, motivo: 'pc' } });
    expect(lerArgumentosCopias(['fazer', '--bd', 'x.db', '--motivo', 'manual'])).toEqual({
      comando: { tipo: 'fazer', bd: 'x.db', motivo: 'manual' },
    });
    expect(lerArgumentosCopias(['verificar', 'ultima'])).toEqual({
      comando: { tipo: 'verificar', qual: 'ultima' },
    });
    expect(lerArgumentosCopias(['restaurar', 'ultima', '--para', 'r.db', '--substituir'])).toEqual({
      comando: { tipo: 'restaurar', qual: 'ultima', para: 'r.db', substituir: true },
    });
  });

  it('recusa o que não conhece (nunca adivinha)', () => {
    const erros = [
      ['apagar'],
      ['fazer', '--db', 'x'],
      ['fazer', '--bd'],
      ['fazer', '--motivo', 'hora-extra'],
      ['listar', 'a'],
      ['verificar'],
      ['restaurar', 'ultima'],
      ['restaurar', 'ultima', '--para', 'x', '--bd', 'y'],
    ];
    for (const args of erros) expect(lerArgumentosCopias(args), args.join(' ')).toHaveProperty('erro');
  });
});

describe('executarComandoCopias (destino pasta)', () => {
  let pasta: string;
  let env: NodeJS.ProcessEnv;
  let linhas: string[];
  let erros: string[];
  const saida = { info: (t: string) => linhas.push(t), erro: (t: string) => erros.push(t) };
  const correr = (comando: ComandoCopias) => executarComandoCopias(comando, env, saida);

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'mapa-cmf-copias-comandos-'));
    env = {
      COPIAS_DESTINO: `pasta:${join(pasta, 'destino')}`,
      COPIAS_CHAVE: randomBytes(32).toString('base64'),
      BD: join(pasta, 'mapa.db'),
    };
    linhas = [];
    erros = [];
    const bd = abrirBd(join(pasta, 'mapa.db'));
    inserirDadosFicticios(bd);
    inserirLotes(bd, 2);
    bd.$client.close();
  });
  afterEach(() => rmSync(pasta, { recursive: true, force: true }));

  it('chave: 32 bytes em base64, com instruções', async () => {
    expect(await correr({ tipo: 'chave' })).toBe(0);
    expect(Buffer.from(linhas[0] as string, 'base64')).toHaveLength(32);
    expect(linhas[1]).toContain('gestor de palavras-passe');
  });

  it('fazer → listar → verificar → restaurar', async () => {
    expect(await correr({ tipo: 'fazer', bd: null, motivo: 'pc' })).toBe(0);
    expect(linhas.at(-1)).toMatch(/^Cópia feita: mapa-.*-pc\.db\.gz\.enc/);

    expect(await correr({ tipo: 'listar' })).toBe(0);
    expect(linhas.at(-1)).toBe('1 cópia(s) em pasta (datas na hora do Luxemburgo).');

    expect(await correr({ tipo: 'verificar', qual: 'ultima' })).toBe(0);
    expect(linhas.at(-1)).toMatch(
      /decifrada e íntegra \(\d+ pessoas, 2 lotes, versão 2, \d+ migrações aplicadas\)/,
    );

    const para = join(pasta, 'restaurada.db');
    expect(await correr({ tipo: 'restaurar', qual: 'ultima', para, substituir: false })).toBe(0);
    expect(existsSync(para)).toBe(true);
    // Outra vez sem --substituir: recusa.
    expect(await correr({ tipo: 'restaurar', qual: 'ultima', para, substituir: false })).toBe(1);
    expect(erros.at(-1)).toContain('não a substituo');
    expect(await correr({ tipo: 'restaurar', qual: 'ultima', para, substituir: true })).toBe(0);
    expect(readdirSync(pasta).filter((n) => n.startsWith('restaurada.db.antes-restauro-'))).toHaveLength(1);
    expect(erros).toHaveLength(1);
  });

  it('sem configuração ou com a chave errada → erro claro, sem segredos', async () => {
    expect(await executarComandoCopias({ tipo: 'listar' }, {}, saida)).toBe(1);
    expect(erros.at(-1)).toContain('As cópias não estão configuradas');

    expect(await correr({ tipo: 'fazer', bd: null, motivo: 'pc' })).toBe(0);
    const outraChave = randomBytes(32).toString('base64');
    env.COPIAS_CHAVE = outraChave;
    expect(await correr({ tipo: 'verificar', qual: 'ultima' })).toBe(1);
    expect(erros.at(-1)).toBe('Erro: A cópia está danificada ou a chave não é a certa.');
    expect([...linhas, ...erros].join('\n')).not.toContain(outraChave);
  });

  it('fazer sem BD → erro', async () => {
    expect(await correr({ tipo: 'fazer', bd: join(pasta, 'nao-existe.db'), motivo: 'pc' })).toBe(1);
    expect(erros.at(-1)).toContain('Não existe nenhuma base de dados');
  });

  it('verificar uma cópia de uma BD vazia avisa', async () => {
    const vazia = join(pasta, 'vazia.db');
    abrirBd(vazia).$client.close();
    expect(await correr({ tipo: 'fazer', bd: vazia, motivo: 'pc' })).toBe(0);
    expect(await correr({ tipo: 'verificar', qual: 'ultima' })).toBe(0);
    expect(linhas.at(-1)).toContain('(0 pessoas, 0 lotes');
    expect(erros.at(-1)).toContain('não tem nenhuma pessoa');
  });
});
