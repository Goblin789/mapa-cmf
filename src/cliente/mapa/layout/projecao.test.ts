import { describe, expect, it } from 'vitest';
import { desprojetar, escalaZoom, projetar, projetarArredondado } from './projecao';

describe('projetar', () => {
  it('põe (0, 0) no centro do mundo', () => {
    expect(projetar(0, 0, 0)).toEqual({ x: 128, y: 128 });
    expect(projetar(0, 0, 3)).toEqual({ x: 1024, y: 1024 });
  });

  it('cobre o mundo de -180 a 180 graus', () => {
    expect(projetar(0, -180, 2).x).toBeCloseTo(0, 9);
    expect(projetar(0, 180, 2).x).toBeCloseTo(escalaZoom(2), 9);
  });

  it('dá o mesmo valor que o Leaflet (EPSG:3857) para o Luxemburgo', () => {
    // Como no Leaflet 1.9.4: SphericalMercator (R = 6378137) e a transformação 0,5/(πR) do EPSG3857.
    const R = 6378137;
    const seno = Math.sin((49.6116 * Math.PI) / 180);
    const mx = (R * 6.1319 * Math.PI) / 180;
    const my = (R * Math.log((1 + seno) / (1 - seno))) / 2;
    const k = 0.5 / (Math.PI * R);
    const escala = 256 * 2 ** 10;
    const p = projetar(49.6116, 6.1319, 10);
    expect(p.x).toBeCloseTo(escala * (k * mx + 0.5), 6);
    expect(p.y).toBeCloseTo(escala * (-k * my + 0.5), 6);
    expect(p.x).toBeCloseTo(135537.11, 1);
    expect(p.y).toBeCloseTo(89343.0, 1);
  });

  it('o norte fica em cima (y menor)', () => {
    expect(projetar(50, 6, 10).y).toBeLessThan(projetar(49, 6, 10).y);
  });

  it('dobra as distâncias a cada zoom', () => {
    const a = projetar(49.5, 6.0, 10);
    const b = projetar(49.5, 6.0, 11);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
  });

  it('desprojetar é a inversa', () => {
    for (const zoom of [9, 10.25, 14]) {
      const { lat, lng } = desprojetar(projetar(49.492, 6.2424, zoom), zoom);
      expect(lat).toBeCloseTo(49.492, 9);
      expect(lng).toBeCloseTo(6.2424, 9);
    }
  });

  it('arredonda ao píxel como o latLngToLayerPoint', () => {
    const p = projetarArredondado(49.6116, 6.1319, 10);
    expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
  });
});
