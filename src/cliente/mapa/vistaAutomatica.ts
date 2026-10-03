// Enquadramento automático: enquanto o utilizador não mexer no mapa, a vista acompanha os dados, as
// camadas e o tamanho do mapa (o Mapa volta a enquadrar tudo). Sem o Leaflet (testável em Node).

import type * as L from 'leaflet';

/** Vista posta pelo último enquadramento automático. */
export interface VistaAutomatica {
  mapa: L.Map;
  zoom: number;
  centro: L.LatLng;
}

type MapaParaVista = Pick<L.Map, 'getZoom' | 'getSize' | 'latLngToContainerPoint'>;

/**
 * O mapa ainda mostra a vista automática (o utilizador não fez zoom nem o deslocou), por isso pode voltar
 * a enquadrar-se sozinho. Um mapa que nunca chegou a ser enquadrado também pode: por exemplo, criado
 * num separador ou painel escondido (largura 0), em que o enquadramento falhou e ficou a vista por
 * omissão; quando ganhar tamanho, tem de ser enquadrado.
 */
export function continuaAutomatica(v: VistaAutomatica | null, mapa: MapaParaVista): boolean {
  if (!v || v.mapa !== mapa) return true;
  if (v.zoom !== mapa.getZoom()) return false;
  const p = mapa.latLngToContainerPoint(v.centro);
  const t = mapa.getSize();
  return Math.abs(p.x - t.x / 2) <= 2 && Math.abs(p.y - t.y / 2) <= 2;
}
