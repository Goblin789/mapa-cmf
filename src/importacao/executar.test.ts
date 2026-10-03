import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { estaDentro, lerMichaelSeDer } from './executar';

const pasta = mkdtempSync(join(tmpdir(), 'importacao-'));
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

describe('estaDentro (nunca escrever na pasta de origem)', () => {
  const origem = join(pasta, 'MAPA CMF');

  it('deteta ficheiros dentro da pasta, a própria pasta e subpastas', () => {
    expect(estaDentro(join(origem, 'relatorio.html'), origem)).toBe(true);
    expect(estaDentro(join(origem, 'dados', 'mapa.db'), origem)).toBe(true);
    expect(estaDentro(origem, origem)).toBe(true);
    expect(estaDentro(join(origem, 'x.db'), `${origem}/`)).toBe(true);
  });

  it('não confunde pastas com o mesmo prefixo nem pastas vizinhas', () => {
    expect(estaDentro(join(pasta, 'MAPA CMF 2', 'relatorio.html'), origem)).toBe(false);
    expect(estaDentro(join(pasta, 'dados', 'mapa.db'), origem)).toBe(false);
  });

  it('caminhos relativos e com ".." resolvem-se antes de comparar', () => {
    expect(estaDentro(join(origem, 'sub', '..', 'relatorio.html'), origem)).toBe(true);
    expect(estaDentro(join(origem, '..', 'relatorio.html'), origem)).toBe(false);
  });
});

describe('lerMichaelSeDer (o ficheiro do Michael só serve para cruzar)', () => {
  it('ficheiro inexistente → sem cruzamento', async () => {
    const r = await lerMichaelSeDer(join(pasta, 'nao-existe.xlsx'));
    expect(r.folhas).toBeNull();
    expect(r.nota).toContain('Não encontrado');
  });

  it('ficheiro ilegível → sem cruzamento, mas não rebenta a importação', async () => {
    const caminho = join(pasta, 'estragado.xlsx');
    writeFileSync(caminho, 'isto não é um xlsx');
    const r = await lerMichaelSeDer(caminho);
    expect(r.folhas).toBeNull();
    expect(r.nota).toContain('Não foi possível ler');
  });
});
