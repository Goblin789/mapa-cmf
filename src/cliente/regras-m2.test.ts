// Regras do M2 que valem para todo o código do browser e que um teste de cada função não apanha
// (CONTRATO DO M2, docs/m2.md). Lê os ficheiros de src/cliente (fora dos testes) e procura chamadas proibidas.
// - `indexar(estado)` sem o `hoje`: os índices ficavam sem indisponíveis e a lotação das carrinhas deixava
//   de ser a mesma em todo o lado (o Mapa diz 8/9 e o Guardar 9/9). Passa-se `loja.hoje` (ou null de
//   propósito, ex. em dados fictícios).

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PASTA = fileURLToPath(new URL('.', import.meta.url));

function ficheirosDoCliente(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(pasta, e.name);
    if (e.isDirectory()) return ficheirosDoCliente(caminho);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [caminho] : [];
  });
}

/** Os argumentos de cada chamada `nome(...)` no texto (separados pelas vírgulas do nível de cima). */
function chamadas(texto: string, nome: string): string[][] {
  const resultado: string[][] = [];
  const procura = new RegExp(`(?<![\\w.])${nome}\\(`, 'g');
  for (const m of texto.matchAll(procura)) {
    let nivel = 0;
    let atual = '';
    const args: string[] = [];
    for (let i = m.index + m[0].length; i < texto.length; i++) {
      const c = texto[i] as string;
      if (nivel === 0 && c === ')') break;
      if (nivel === 0 && c === ',') {
        args.push(atual.trim());
        atual = '';
        continue;
      }
      if ('([{'.includes(c)) nivel++;
      if (')]}'.includes(c)) nivel--;
      atual += c;
    }
    if (atual.trim() !== '') args.push(atual.trim());
    resultado.push(args);
  }
  return resultado;
}

describe('regras do M2 no código do browser', () => {
  it('indexar(...) leva sempre o hoje (loja.hoje ou null de propósito)', () => {
    const sem: string[] = [];
    for (const ficheiro of ficheirosDoCliente(PASTA)) {
      const texto = readFileSync(ficheiro, 'utf8');
      for (const args of chamadas(texto, 'indexar')) {
        if (args.length < 2) sem.push(`${relative(PASTA, ficheiro)}: indexar(${args.join(', ')})`);
      }
    }
    expect(sem).toEqual([]);
  });

  it('o leitor de chamadas conta os argumentos do nível de cima', () => {
    expect(chamadas('a; indexar(f(x, y)); indexar(e, s.hoje)', 'indexar')).toEqual([
      ['f(x, y)'],
      ['e', 's.hoje'],
    ]);
    expect(chamadas('reindexar(x); o.indexar(y)', 'indexar')).toEqual([]);
  });
});
