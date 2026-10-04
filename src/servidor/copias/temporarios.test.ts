import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { comPastaTemporaria, limparRestos } from './temporarios';

describe('pastas temporárias com a BD decifrada', () => {
  let base: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'mapa-cmf-copias-temporarios-'));
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('a pasta apaga-se no fim, tanto se o trabalho correr bem como se falhar', async () => {
    let usada = '';
    await comPastaTemporaria('mapa-cmf-verificar-', async (pasta) => {
      usada = pasta;
      writeFileSync(join(pasta, 'verificar.db'), 'dados');
    });
    expect(usada).not.toBe('');
    expect(existsSync(usada)).toBe(false);

    await expect(
      comPastaTemporaria('mapa-cmf-instantaneo-', async (pasta) => {
        usada = pasta;
        throw new Error('falhou');
      }),
    ).rejects.toThrow('falhou');
    expect(existsSync(usada)).toBe(false);
  });

  it('limpa os restos abandonados (mais de 1 h) e deixa os recentes e as outras pastas', () => {
    const criar = (nome: string, horas: number) => {
      const pasta = join(base, nome);
      mkdirSync(pasta);
      writeFileSync(join(pasta, 'x.db'), 'dados');
      const data = new Date(Date.now() - horas * 3_600_000);
      utimesSync(pasta, data, data);
      return pasta;
    };
    const velhoInstantaneo = criar('mapa-cmf-instantaneo-abc', 2);
    const velhoVerificar = criar('mapa-cmf-verificar-def', 30);
    const recente = criar('mapa-cmf-verificar-ghi', 0.1);
    const outra = criar('outra-coisa-xyz', 48);

    expect(limparRestos(base).sort()).toEqual(['mapa-cmf-instantaneo-abc', 'mapa-cmf-verificar-def']);
    expect(existsSync(velhoInstantaneo)).toBe(false);
    expect(existsSync(velhoVerificar)).toBe(false);
    expect(existsSync(recente)).toBe(true);
    expect(existsSync(outra)).toBe(true);
  });
});
