import { describe, expect, it } from 'vitest';
import { alturaMaximaPainelFoco } from './classes';

describe('alturaMaximaPainelFoco', () => {
  it('sem legenda no ecrã: o mapa todo menos as margens', () => {
    expect(alturaMaximaPainelFoco(0)).toBe('calc(100% - 1.5rem)');
  });

  it('com legenda: acaba 8 px acima dela, nunca abaixo de 10 rem nem acima do mapa', () => {
    // Legenda de 262 px no PC (medida no browser): a ficha de uma casa tapava-lhe 61 px a 1280×720.
    expect(alturaMaximaPainelFoco(262)).toBe(
      'min(calc(100% - 1.5rem), max(10rem, calc(100% - 1.5rem - 270px)))',
    );
  });

  it('arredonda a altura medida para cima (o ResizeObserver dá frações)', () => {
    expect(alturaMaximaPainelFoco(36.4)).toContain('- 45px');
  });
});
