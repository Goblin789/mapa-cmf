// Tamanho dos cartões conforme o zoom.
// - Completo: casas e carrinhas com os nomes, desenhadas à escala `escalaCartoes(zoom)`: mais pequenas
//   na vista de conjunto, crescem (devagar) ao aproximar. Nunca abaixo de ESCALA_MINIMA, para os nomes
//   se lerem (letra de 10 px × 0,9 = 9 px).
// - Resumo: abaixo de ZOOM_COMPLETO (ou num ecrã estreito, meio zoom acima) cada local é uma pastilha
//   com o nome e "ocupados/lugares"; carregar nela abre o local com os nomes.

export type ModoMapa = 'resumo' | 'completo';

/** Abaixo desta escala os nomes ficam com menos de 9 px. */
export const ESCALA_MINIMA = 0.9;
export const ESCALA_MAXIMA = 1.3;
/** Zoom a partir do qual se mostram os nomes (num ecrã largo). */
export const ZOOM_COMPLETO = 10.5;
/** Quanto crescem os cartões por nível de zoom (×2^0,3 ≈ +23 %); o mapa cresce ×2. */
const CRESCIMENTO = 0.3;
/** A escala só começa a crescer um zoom depois de aparecerem os nomes. */
const PATAMAR = 1;

/** Abaixo desta largura do mapa (telemóvel), os nomes só aparecem meio zoom mais perto. */
export const LARGURA_ESTREITA = 640;
const AJUSTE_ESTREITO = 0.5;

/** Zoom a partir do qual se mostram os nomes, para esta largura do mapa. */
export function zoomCompleto(larguraMapa: number = Number.POSITIVE_INFINITY): number {
  return ZOOM_COMPLETO + (larguraMapa < LARGURA_ESTREITA ? AJUSTE_ESTREITO : 0);
}

export function modoMapa(zoom: number, larguraMapa: number = Number.POSITIVE_INFINITY): ModoMapa {
  return zoom >= zoomCompleto(larguraMapa) - 1e-9 ? 'completo' : 'resumo';
}

/** Escala dos cartões completos (também dos que se abrem à mão no resumo). */
export function escalaCartoes(zoom: number, larguraMapa: number = Number.POSITIVE_INFINITY): number {
  const s = ESCALA_MINIMA * 2 ** (Math.max(0, zoom - zoomCompleto(larguraMapa) - PATAMAR) * CRESCIMENTO);
  return Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, Math.round(s * 1000) / 1000));
}
