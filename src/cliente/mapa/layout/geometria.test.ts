import { describe, expect, it } from 'vitest';
import { centro, contem, pontoMaisProximo, pontoNaBorda, segmentoEntre, sobrepoem, uniao } from './geometria';

const r = (x: number, y: number, largura: number, altura: number) => ({ x, y, largura, altura });

describe('sobrepoem', () => {
  it('encostar não é sobrepor', () => {
    expect(sobrepoem(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false);
    expect(sobrepoem(r(0, 0, 10, 10), r(0, 10, 10, 10))).toBe(false);
    expect(sobrepoem(r(0, 0, 10, 10), r(9, 9, 10, 10))).toBe(true);
  });

  it('com margem, têm de ficar afastados pelo menos a margem', () => {
    expect(sobrepoem(r(0, 0, 10, 10), r(15, 0, 10, 10), 8)).toBe(true);
    expect(sobrepoem(r(0, 0, 10, 10), r(18, 0, 10, 10), 8)).toBe(false);
    // Na diagonal basta afastar num dos eixos.
    expect(sobrepoem(r(0, 0, 10, 10), r(18, 5, 10, 10), 8)).toBe(false);
  });
});

describe('pontos e segmentos', () => {
  it('ponto mais próximo e contém', () => {
    expect(pontoMaisProximo(r(0, 0, 10, 10), { x: 20, y: 5 })).toEqual({ x: 10, y: 5 });
    expect(pontoMaisProximo(r(0, 0, 10, 10), { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
    expect(contem(r(0, 0, 10, 10), { x: 10, y: 0 })).toBe(true);
    expect(contem(r(0, 0, 10, 10), { x: 11, y: 0 })).toBe(false);
  });

  it('ponto na borda na direção do alvo', () => {
    const q = r(0, 0, 20, 10);
    expect(pontoNaBorda(q, { x: 100, y: 5 })).toEqual({ x: 20, y: 5 });
    expect(pontoNaBorda(q, { x: 10, y: -50 })).toEqual({ x: 10, y: 0 });
    expect(pontoNaBorda(q, centro(q))).toEqual(centro(q));
  });

  it('segmento entre bordas, ou nada se se sobrepõem', () => {
    expect(segmentoEntre(r(0, 0, 10, 10), r(30, 0, 10, 10))).toEqual({
      de: { x: 10, y: 5 },
      para: { x: 30, y: 5 },
    });
    expect(segmentoEntre(r(0, 0, 10, 10), r(5, 5, 10, 10))).toBeNull();
  });

  it('união', () => {
    expect(uniao([])).toBeNull();
    expect(uniao([r(0, 0, 10, 10), r(20, -5, 5, 5)])).toEqual(r(0, -5, 25, 15));
  });
});
