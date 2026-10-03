import type * as L from 'leaflet';
import { describe, expect, it } from 'vitest';
import { continuaAutomatica, type VistaAutomatica } from './vistaAutomatica';

/** Um mapa a fingir: zoom, tamanho e onde fica o centro guardado (em píxeis do contentor). */
function mapaFalso(
  zoom: number,
  tamanho: { x: number; y: number },
  centroGuardadoEm: { x: number; y: number },
) {
  return {
    getZoom: () => zoom,
    getSize: () => tamanho,
    latLngToContainerPoint: () => centroGuardadoEm,
  } as unknown as L.Map;
}

const CENTRO = { lat: 49.6, lng: 6.1 } as L.LatLng;

describe('continuaAutomatica', () => {
  it('um mapa nunca enquadrado (ex.: criado escondido, sem largura) ainda pode ser enquadrado', () => {
    const mapa = mapaFalso(10, { x: 913, y: 631 }, { x: 0, y: 0 });
    expect(continuaAutomatica(null, mapa)).toBe(true);
    // Vista de outro mapa (o StrictMode monta duas vezes): para este, nunca houve enquadramento.
    const outro = mapaFalso(10, { x: 913, y: 631 }, { x: 0, y: 0 });
    expect(continuaAutomatica({ mapa: outro, zoom: 10, centro: CENTRO }, mapa)).toBe(true);
  });

  it('com o mesmo zoom e o centro no meio do mapa, o utilizador ainda não mexeu', () => {
    const mapa = mapaFalso(11, { x: 1568, y: 1029 }, { x: 784, y: 515 });
    const v: VistaAutomatica = { mapa, zoom: 11, centro: CENTRO };
    expect(continuaAutomatica(v, mapa)).toBe(true);
  });

  it('depois de um zoom ou de deslocar o mapa, já não é automático', () => {
    const v = (mapa: L.Map): VistaAutomatica => ({ mapa, zoom: 11, centro: CENTRO });
    const comZoom = mapaFalso(11.5, { x: 1568, y: 1029 }, { x: 784, y: 515 });
    expect(continuaAutomatica(v(comZoom), comZoom)).toBe(false);
    const deslocado = mapaFalso(11, { x: 1568, y: 1029 }, { x: 700, y: 515 });
    expect(continuaAutomatica(v(deslocado), deslocado)).toBe(false);
  });
});
