import { describe, expect, it } from 'vitest';
import { type Retangulo, sobrepoem } from './geometria';
import {
  CHIP,
  type ElementoGrupo,
  filasCarrinha,
  GRUPO,
  geometriaCarrinha,
  geometriaCasa,
  geometriaGrupo,
  geometriaResumo,
  lugaresADesenhar,
  prateleiras,
  QUADRADO,
} from './medidas';
import type { NivelCartao } from './niveis';

const NIVEIS: NivelCartao[] = ['lugares', 'nomes'];

function dentro(interior: Retangulo, exterior: { largura: number; altura: number }) {
  return (
    interior.x >= 0 &&
    interior.y >= 0 &&
    interior.x + interior.largura <= exterior.largura &&
    interior.y + interior.altura <= exterior.altura
  );
}

function semSobreposicoes(lista: readonly Retangulo[]) {
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      if (sobrepoem(lista[i] as Retangulo, lista[j] as Retangulo)) return false;
    }
  }
  return true;
}

describe('filasCarrinha', () => {
  it('distribui os lugares em filas de até 3, sem perder nenhum', () => {
    for (let n = 0; n <= 20; n++) {
      const filas = filasCarrinha(n);
      expect(filas.reduce((a, b) => a + b, 0)).toBe(n);
      for (const k of filas) {
        expect(k).toBeGreaterThanOrEqual(1);
        expect(k).toBeLessThanOrEqual(3);
      }
    }
  });

  it('carrinhas habituais', () => {
    expect(filasCarrinha(5)).toEqual([2, 3]);
    expect(filasCarrinha(7)).toEqual([2, 2, 3]);
    expect(filasCarrinha(9)).toEqual([3, 3, 3]);
  });
});

describe('lugaresADesenhar', () => {
  it('a lotação, ou os ocupados quando há gente a mais', () => {
    expect(lugaresADesenhar(8, 3)).toBe(8);
    expect(lugaresADesenhar(8, 8)).toBe(8);
    expect(lugaresADesenhar(8, 10)).toBe(10);
  });
});

describe('geometria das casas', () => {
  it('lugares dentro do cartão, sem se sobreporem, pela ordem', () => {
    for (const nivel of NIVEIS) {
      for (let n = 0; n <= 14; n++) {
        for (const comAviso of [false, true]) {
          const g = geometriaCasa(nivel, n, comAviso);
          expect(g.lugares).toHaveLength(n);
          for (const l of g.lugares) expect(dentro(l, g)).toBe(true);
          expect(semSobreposicoes(g.lugares)).toBe(true);
          expect(dentro(g.cabecalho, g)).toBe(true);
          if (g.aviso) {
            expect(dentro(g.aviso, g)).toBe(true);
            expect(sobrepoem(g.aviso, g.cabecalho)).toBe(false);
          }
          for (const l of g.lugares) {
            expect(sobrepoem(l, g.cabecalho)).toBe(false);
            if (g.aviso) expect(sobrepoem(l, g.aviso)).toBe(false);
            expect(l.y).toBeGreaterThanOrEqual(g.corpo.y);
          }
        }
      }
    }
  });

  it('o tamanho depende só do nível, dos lugares e do aviso, e é inteiro', () => {
    const a = geometriaCasa('lugares', 10, false);
    expect(geometriaCasa('lugares', 10, false)).toEqual(a);
    for (const v of [a.largura, a.altura, ...a.lugares.flatMap((l) => [l.x, l.y])]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(geometriaCasa('lugares', 10, true).altura).toBeGreaterThan(a.altura);
    expect(geometriaCasa('nomes', 10, false).largura).toBeGreaterThan(a.largura);
  });

  it('todas as casas do mesmo nível têm a mesma largura', () => {
    for (const nivel of NIVEIS) {
      const larguras = new Set([2, 4, 8, 12].map((n) => geometriaCasa(nivel, n, false).largura));
      expect(larguras.size).toBe(1);
    }
  });

  it('nos lugares desenha quadradinhos; nos nomes, espaço para um nome', () => {
    expect(geometriaCasa('lugares', 3, false).lugares[0]?.largura).toBe(QUADRADO);
    expect(geometriaCasa('nomes', 3, false).lugares[0]?.largura).toBe(CHIP.largura);
  });
});

describe('geometria das carrinhas', () => {
  it('lugares dentro do cartão, por baixo do para-brisas, sem se sobreporem nem à marca', () => {
    for (const nivel of NIVEIS) {
      for (let n = 0; n <= 15; n++) {
        const g = geometriaCarrinha(nivel, n);
        expect(g.lugares).toHaveLength(n);
        expect(semSobreposicoes([...g.lugares, g.marca])).toBe(true);
        for (const l of [...g.lugares, g.placa, g.parabrisas, g.marca]) expect(dentro(l, g)).toBe(true);
        for (const l of g.lugares) expect(l.y).toBeGreaterThanOrEqual(g.parabrisas.y + g.parabrisas.altura);
        // A marca fica atrás: ao nível da última fila (lugares) ou depois dela (nomes).
        const fim = Math.max(...g.lugares.map((l) => l.y + l.altura), 0);
        expect(g.marca.y + g.marca.altura).toBeGreaterThanOrEqual(fim);
      }
    }
  });

  it('a placa (matrícula) fica à frente, por cima de tudo', () => {
    const g = geometriaCarrinha('lugares', 9);
    expect(g.placa.y).toBeLessThan(g.parabrisas.y);
    expect(Math.min(...g.lugares.map((l) => l.y))).toBeGreaterThan(g.placa.y);
  });

  it('mais lugares nunca encolhem o cartão', () => {
    for (const nivel of NIVEIS) {
      for (let n = 1; n <= 15; n++) {
        expect(geometriaCarrinha(nivel, n).altura).toBeGreaterThanOrEqual(
          geometriaCarrinha(nivel, n - 1).altura,
        );
      }
    }
  });
});

describe('pastilha de resumo', () => {
  it('uma linha por tipo presente', () => {
    const ambos = geometriaResumo(true, true);
    const soCasas = geometriaResumo(true, false);
    expect(ambos.linhaCasas && ambos.linhaCarrinhas).toBeTruthy();
    expect(soCasas.linhaCarrinhas).toBeNull();
    expect(soCasas.altura).toBeLessThan(ambos.altura);
    for (const l of [ambos.nome, ambos.linhaCasas, ambos.linhaCarrinhas])
      expect(dentro(l as Retangulo, ambos)).toBe(true);
  });
});

describe('prateleiras', () => {
  it('muda de fila quando passa a largura máxima e mantém a ordem', () => {
    const p = prateleiras(
      [
        { largura: 100, altura: 10 },
        { largura: 100, altura: 30 },
        { largura: 100, altura: 20 },
      ],
      210,
      5,
    );
    expect(p.posicoes).toEqual([
      { x: 0, y: 0 },
      { x: 105, y: 0 },
      { x: 0, y: 35 },
    ]);
    expect(p.largura).toBe(205);
    expect(p.altura).toBe(55);
  });

  it('um item mais largo do que o máximo fica sozinho na fila', () => {
    const p = prateleiras(
      [
        { largura: 300, altura: 10 },
        { largura: 50, altura: 10 },
      ],
      200,
      5,
    );
    expect(p.posicoes[1]).toEqual({ x: 0, y: 15 });
  });
});

describe('geometria do grupo', () => {
  const casas = (nivel: NivelCartao): ElementoGrupo[] =>
    [10, 8, 8, 6].map((n, i) => ({ chave: `casa:${i}`, geometria: geometriaCasa(nivel, n, i > 1) }));
  const carrinhas = (nivel: NivelCartao, k: number): ElementoGrupo[] =>
    Array.from({ length: k }, (_, i) => ({
      chave: `carrinha:${i}`,
      geometria: geometriaCarrinha(nivel, i % 2 ? 5 : 9),
    }));

  it('casas em cima, carrinhas por baixo, tudo dentro e sem sobreposições', () => {
    for (const nivel of NIVEIS) {
      for (const k of [0, 1, 7, 13]) {
        const g = geometriaGrupo(casas(nivel), carrinhas(nivel, k));
        const rets = g.filhos.map((f) => ({
          x: f.x,
          y: f.y,
          largura: f.geometria.largura,
          altura: f.geometria.altura,
        }));
        expect(semSobreposicoes(rets)).toBe(true);
        for (const ret of rets) expect(dentro(ret, g)).toBe(true);
        for (const ret of rets) expect(sobrepoem(ret, g.cabecalho)).toBe(false);
        const fimCasas = Math.max(...rets.slice(0, 4).map((x) => x.y + x.altura));
        for (const ret of rets.slice(4)) expect(ret.y).toBeGreaterThan(fimCasas);
        if (k > 0 && g.rotuloCarrinhas) {
          expect(g.rotuloCarrinhas.y).toBeGreaterThanOrEqual(fimCasas);
          for (const ret of rets.slice(4)) expect(sobrepoem(ret, g.rotuloCarrinhas)).toBe(false);
        } else {
          expect(g.rotuloCarrinhas).toBeNull();
        }
        expect(g.largura).toBeLessThanOrEqual(GRUPO.larguraMaxima[nivel] + 2 * GRUPO.margem);
      }
    }
  });

  it('um grupo só com carrinhas (ex.: estacionamento)', () => {
    const g = geometriaGrupo([], carrinhas('lugares', 3));
    expect(g.filhos).toHaveLength(3);
    expect(g.rotuloCarrinhas).not.toBeNull();
    expect(g.largura).toBeGreaterThanOrEqual(GRUPO.larguraMinima);
  });
});
