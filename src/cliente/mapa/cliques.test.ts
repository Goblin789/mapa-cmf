import { describe, expect, it } from 'vitest';
import { eCliqueDeArrastar } from './cliques';

describe('eCliqueDeArrastar', () => {
  it('o clique do rato que fecha um arrastamento do mapa não conta como clique no cartão', () => {
    expect(eCliqueDeArrastar(1, true)).toBe(true);
  });

  it('sem arrastamento, o clique chega ao cartão', () => {
    expect(eCliqueDeArrastar(1, false)).toBe(false);
    expect(eCliqueDeArrastar(2, false)).toBe(false);
  });

  it('Enter/Espaço (detail 0) passa mesmo que o último arrastamento ainda esteja "lembrado" pelo Leaflet', () => {
    // O Leaflet só põe moved() a false no mousedown seguinte: sem esta regra, depois de arrastar o
    // mapa, nenhum cartão se podia ativar pelo teclado até se carregar outra vez no rato.
    expect(eCliqueDeArrastar(0, true)).toBe(false);
  });
});
