import { describe, expect, it } from 'vitest';
import { CLASSE_FOCO_BOTAO, classeDestaque } from './comum';

describe('realce do foco', () => {
  it('num botão do mapa não usa outline (o Leaflet põe outline-style: none no botão clicado)', () => {
    expect(CLASSE_FOCO_BOTAO).not.toMatch(/outline/);
    expect(CLASSE_FOCO_BOTAO).toMatch(/ring/);
  });

  it('à volta do cartão: contorno forte no próprio, tracejado no relacionado, nada sem foco', () => {
    expect(classeDestaque('foco')).toMatch(/outline-\[3px\]/);
    expect(classeDestaque('relacionado')).toMatch(/outline-dashed/);
    expect(classeDestaque(null)).toBe('');
  });
});
