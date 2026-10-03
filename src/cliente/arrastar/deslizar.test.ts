import { describe, expect, it } from 'vitest';
import {
  ACIMA_DO_DEDO_PX,
  AFASTAMENTO_RATO_PX,
  MARGEM_DESLIZE_PX,
  podeDeslizar,
  posicaoFantasma,
  VELOCIDADE_MAXIMA_PX,
  velocidadeBorda,
} from './deslizar';

describe('velocidadeBorda', () => {
  it('parado no meio, a subir perto do topo, a descer perto do fundo', () => {
    expect(velocidadeBorda(300, 0, 600)).toBe(0);
    expect(velocidadeBorda(10, 0, 600)).toBeLessThan(0);
    expect(velocidadeBorda(590, 0, 600)).toBeGreaterThan(0);
  });

  it('mais depressa quanto mais perto da borda, até ao máximo', () => {
    const longe = velocidadeBorda(600 - MARGEM_DESLIZE_PX + 5, 0, 600);
    const perto = velocidadeBorda(598, 0, 600);
    expect(perto).toBeGreaterThan(longe);
    expect(velocidadeBorda(600, 0, 600)).toBe(VELOCIDADE_MAXIMA_PX);
    expect(velocidadeBorda(0, 0, 600)).toBe(-VELOCIDADE_MAXIMA_PX);
    expect(velocidadeBorda(-50, 0, 600)).toBe(-VELOCIDADE_MAXIMA_PX);
  });

  it('dentro da faixa anda sempre pelo menos 1 px', () => {
    expect(velocidadeBorda(MARGEM_DESLIZE_PX - 0.1, 0, 600)).toBe(-1);
  });

  it('em contentores pequenos a faixa é um quarto do tamanho', () => {
    expect(velocidadeBorda(50, 0, 100)).toBe(0);
    expect(velocidadeBorda(20, 0, 100)).toBeLessThan(0);
    expect(velocidadeBorda(30, 0, 100)).toBe(0);
  });

  it('contentor sem tamanho: 0', () => {
    expect(velocidadeBorda(5, 10, 10)).toBe(0);
  });
});

describe('podeDeslizar', () => {
  it('não desliza para cima no topo nem para baixo no fim', () => {
    expect(podeDeslizar(0, 300, 1000, -5)).toBe(false);
    expect(podeDeslizar(10, 300, 1000, -5)).toBe(true);
    expect(podeDeslizar(700, 300, 1000, 5)).toBe(false);
    expect(podeDeslizar(600, 300, 1000, 5)).toBe(true);
    expect(podeDeslizar(600, 300, 1000, 0)).toBe(false);
  });
});

describe('posicaoFantasma', () => {
  it('rato: em baixo à direita do ponteiro', () => {
    expect(posicaoFantasma(100, 100, 120, 40, 'rato', 1000, 800)).toEqual({
      x: 100 + AFASTAMENTO_RATO_PX,
      y: 100 + AFASTAMENTO_RATO_PX,
    });
  });

  it('rato perto da borda direita e do fundo: passa para o outro lado', () => {
    expect(posicaoFantasma(950, 790, 120, 40, 'rato', 1000, 800)).toEqual({
      x: 950 - AFASTAMENTO_RATO_PX - 120,
      y: 790 - AFASTAMENTO_RATO_PX - 40,
    });
  });

  it('toque: centrado e acima do dedo', () => {
    expect(posicaoFantasma(200, 500, 100, 40, 'toque', 400, 800)).toEqual({
      x: 150,
      y: 500 - ACIMA_DO_DEDO_PX - 40,
    });
  });

  it('toque encostado ao topo: por baixo do dedo; e nunca sai pelos lados', () => {
    expect(posicaoFantasma(10, 30, 100, 40, 'toque', 400, 800)).toEqual({ x: 4, y: 30 + ACIMA_DO_DEDO_PX });
    expect(posicaoFantasma(398, 500, 100, 40, 'toque', 400, 800).x).toBe(400 - 100 - 4);
  });
});
