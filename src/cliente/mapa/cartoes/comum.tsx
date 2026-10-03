// Peças pequenas partilhadas pelos cartões do mapa.

import type { Retangulo } from '../layout/geometria';

export type Destaque = 'foco' | 'relacionado' | null;

export function posicao(r: Retangulo) {
  return { left: r.x, top: r.y, width: r.largura, height: r.altura };
}

/** Contorno das formas (casa, carrinha) conforme o realce do foco. */
export function tracoDestaque(destaque: Destaque): { cor: string; largura: number; tracejado?: string } {
  if (destaque === 'foco') return { cor: '#0f172a', largura: 2.5 };
  if (destaque === 'relacionado') return { cor: '#0f172a', largura: 1.75, tracejado: '4 2.5' };
  return { cor: '#475569', largura: 1 };
}

/**
 * Realce do foco à volta de um elemento retangular (obra, pastilha): contorno escuro (o próprio) ou
 * tracejado (o que está ligado a ele). Só para elementos que NÃO recebem o foco do teclado: no mousedown,
 * o Leaflet põe `outline-style: none` inline no botão clicado (DomUtil.preventOutline).
 */
export function classeDestaque(destaque: Destaque): string {
  if (destaque === 'foco') return 'outline-[2.5px] outline-offset-1 outline-slate-900';
  if (destaque === 'relacionado') return 'outline-2 outline-offset-1 outline-dashed outline-slate-700';
  return '';
}

/** Foco do teclado num botão do mapa: um anel (box-shadow), que o Leaflet não apaga. */
export const CLASSE_FOCO_TECLADO =
  'focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-1';

/** Classe que liga o CSS dos nomes no mapa (estilos.css: mais justos do que na lista). */
export const CLASSE_NOMES_MAPA = 'nomes-mapa';
