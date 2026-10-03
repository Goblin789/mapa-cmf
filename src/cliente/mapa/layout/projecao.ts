// Projeção Web Mercator (EPSG:3857), igual à do Leaflet, em "píxeis do mundo" para um zoom.
// Assim o layout dos cartões calcula-se sem o Leaflet (testável em Node) e não depende do
// deslocamento do mapa: o ecrã só subtrai a origem dos píxeis (map.getPixelOrigin()).

export interface Ponto {
  x: number;
  y: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const TAMANHO_MOSAICO = 256;
const LAT_MAXIMA = 85.0511287798;

/** Largura do mundo em píxeis para um zoom (pode ser fracionário). */
export function escalaZoom(zoom: number): number {
  return TAMANHO_MOSAICO * 2 ** zoom;
}

/** Igual a map.project(latlng, zoom) do Leaflet (sem arredondar). */
export function projetar(lat: number, lng: number, zoom: number): Ponto {
  const escala = escalaZoom(zoom);
  const latLimitada = Math.max(Math.min(LAT_MAXIMA, lat), -LAT_MAXIMA);
  const seno = Math.sin((latLimitada * Math.PI) / 180);
  return {
    x: escala * (0.5 + lng / 360),
    y: escala * (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)),
  };
}

/** Inversa de `projetar`. */
export function desprojetar(p: Ponto, zoom: number): LatLng {
  const escala = escalaZoom(zoom);
  const lng = (p.x / escala - 0.5) * 360;
  const n = (0.5 - p.y / escala) * 2 * Math.PI;
  const lat = ((2 * Math.atan(Math.exp(n)) - Math.PI / 2) * 180) / Math.PI;
  return { lat, lng };
}

/** Ponto do mundo arredondado ao píxel, como o Leaflet faz em latLngToLayerPoint. */
export function projetarArredondado(lat: number, lng: number, zoom: number): Ponto {
  const p = projetar(lat, lng, zoom);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}
