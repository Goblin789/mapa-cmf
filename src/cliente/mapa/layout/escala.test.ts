import { describe, expect, it } from 'vitest';
import {
  ESCALA_MAXIMA,
  ESCALA_MINIMA,
  escalaCartoes,
  FAIXA_COMPACTO,
  LARGURA_ESTREITA,
  modoMapa,
  ZOOM_COMPLETO,
  zoomCompleto,
} from './escala';

describe('modoMapa', () => {
  it('num ecrã largo: resumo, depois compacto (meio zoom), depois completo', () => {
    expect(modoMapa(ZOOM_COMPLETO - FAIXA_COMPACTO - 0.25)).toBe('resumo');
    expect(modoMapa(ZOOM_COMPLETO - FAIXA_COMPACTO)).toBe('compacto');
    expect(modoMapa(ZOOM_COMPLETO - 0.25)).toBe('compacto');
    expect(modoMapa(ZOOM_COMPLETO)).toBe('completo');
    expect(modoMapa(16)).toBe('completo');
  });

  it('num telemóvel, os nomes só aparecem meio zoom mais perto', () => {
    const estreito = LARGURA_ESTREITA - 1;
    expect(zoomCompleto(estreito)).toBe(ZOOM_COMPLETO + 0.5);
    expect(modoMapa(ZOOM_COMPLETO, estreito)).toBe('compacto');
    expect(modoMapa(ZOOM_COMPLETO + 0.5, estreito)).toBe('completo');
  });
});

describe('escalaCartoes', () => {
  it('nunca abaixo da escala mínima (nomes com 9 px) nem acima da máxima', () => {
    for (let z = 9; z <= 17; z += 0.25) {
      const s = escalaCartoes(z);
      expect(s).toBeGreaterThanOrEqual(ESCALA_MINIMA);
      expect(s).toBeLessThanOrEqual(ESCALA_MAXIMA);
    }
    expect(10 * ESCALA_MINIMA).toBeGreaterThanOrEqual(9);
  });

  it('pequena na vista de conjunto e a crescer devagar ao aproximar', () => {
    expect(escalaCartoes(ZOOM_COMPLETO)).toBe(ESCALA_MINIMA);
    expect(escalaCartoes(ZOOM_COMPLETO + 1)).toBe(ESCALA_MINIMA);
    expect(escalaCartoes(ZOOM_COMPLETO + 2)).toBeGreaterThan(ESCALA_MINIMA);
    expect(escalaCartoes(ZOOM_COMPLETO + 2)).toBeLessThan(escalaCartoes(ZOOM_COMPLETO + 3));
    expect(escalaCartoes(17)).toBe(ESCALA_MAXIMA);
  });
});
