import { describe, expect, it } from 'vitest';
import { eCaixa, idsNaCaixa, intersectam, retanguloEntre, TAMANHO_MINIMO_CAIXA } from './caixaSelecao';

describe('caixa de seleção', () => {
  it('o retângulo entre dois cantos quaisquer', () => {
    expect(retanguloEntre({ x: 50, y: 10 }, { x: 20, y: 40 })).toEqual({
      x: 20,
      y: 10,
      largura: 30,
      altura: 30,
    });
  });

  it('abaixo do tamanho mínimo é um clique, não uma caixa', () => {
    expect(eCaixa({ x: 0, y: 0, largura: TAMANHO_MINIMO_CAIXA - 1, altura: 2 })).toBe(false);
    expect(eCaixa({ x: 0, y: 0, largura: 2, altura: TAMANHO_MINIMO_CAIXA })).toBe(true);
  });

  it('basta tocar (encostar conta)', () => {
    const a = { x: 0, y: 0, largura: 10, altura: 10 };
    expect(intersectam(a, { x: 10, y: 5, largura: 5, altura: 5 })).toBe(true);
    expect(intersectam(a, { x: 11, y: 5, largura: 5, altura: 5 })).toBe(false);
  });

  it('devolve os nomes tocados pela caixa, sem repetir, pela ordem em que aparecem', () => {
    const caixa = { x: 0, y: 0, largura: 100, altura: 20 };
    const elementos = [
      { id: 'b', retangulo: { x: 90, y: 15, largura: 40, altura: 12 } },
      { id: 'a', retangulo: { x: 0, y: 0, largura: 40, altura: 12 } },
      { id: 'fora', retangulo: { x: 0, y: 40, largura: 40, altura: 12 } },
      // O mesmo nome noutro sítio (ex.: na lista e no mapa) só conta uma vez.
      { id: 'a', retangulo: { x: 50, y: 0, largura: 40, altura: 12 } },
    ];
    expect(idsNaCaixa(caixa, elementos)).toEqual(['b', 'a']);
  });
});
