import { describe, expect, it } from 'vitest';
import { LARGURA_ESTREITA, LIMITES_NIVEL, type NivelDetalhe, nivelDetalhe } from './niveis';

const ORDEM: NivelDetalhe[] = ['resumo', 'lugares', 'nomes'];

describe('nivelDetalhe', () => {
  it('resumo afastado, lugares a meio, nomes perto', () => {
    expect(nivelDetalhe(9)).toBe('resumo');
    expect(nivelDetalhe(9.75)).toBe('resumo');
    expect(nivelDetalhe(LIMITES_NIVEL.lugares)).toBe('lugares');
    expect(nivelDetalhe(11)).toBe('lugares');
    expect(nivelDetalhe(LIMITES_NIVEL.nomes - 0.25)).toBe('lugares');
    expect(nivelDetalhe(LIMITES_NIVEL.nomes)).toBe('nomes');
    expect(nivelDetalhe(17)).toBe('nomes');
  });

  it('nunca perde detalhe ao aproximar', () => {
    for (const largura of [375, 1600]) {
      let anterior = 0;
      for (let z = 9; z <= 17; z += 0.25) {
        const atual = ORDEM.indexOf(nivelDetalhe(z, largura));
        expect(atual).toBeGreaterThanOrEqual(anterior);
        anterior = atual;
      }
    }
  });

  it('num ecrã estreito os limites sobem meio zoom', () => {
    expect(nivelDetalhe(LIMITES_NIVEL.lugares, LARGURA_ESTREITA - 1)).toBe('resumo');
    expect(nivelDetalhe(LIMITES_NIVEL.lugares + 0.5, LARGURA_ESTREITA - 1)).toBe('lugares');
    expect(nivelDetalhe(LIMITES_NIVEL.nomes, 375)).toBe('lugares');
    expect(nivelDetalhe(LIMITES_NIVEL.lugares, LARGURA_ESTREITA)).toBe('lugares');
  });
});
