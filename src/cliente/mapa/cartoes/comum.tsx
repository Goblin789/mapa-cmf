// Peças pequenas partilhadas pelos cartões do mapa.

import type { Retangulo } from '../layout/geometria';

export type Destaque = 'foco' | 'relacionado' | null;

export function posicao(r: Retangulo) {
  return { left: r.x, top: r.y, width: r.largura, height: r.altura };
}

/**
 * Realce do foco: contorno escuro (o próprio) ou tracejado (o que está ligado a ele).
 * Só para elementos que NÃO recebem o foco do teclado (a div à volta do cartão): no mousedown, o Leaflet
 * põe `outline-style: none` inline no botão clicado (DomUtil.preventOutline) e o contorno desaparecia.
 */
export function classeDestaque(destaque: Destaque): string {
  if (destaque === 'foco') return 'outline-[3px] outline-offset-2 outline-slate-900';
  if (destaque === 'relacionado') return 'outline-2 outline-offset-2 outline-dashed outline-slate-700';
  return '';
}

/** Realce da pessoa em foco num botão (quadradinho): um anel (box-shadow), que o Leaflet não apaga. */
export const CLASSE_FOCO_BOTAO = 'ring-2 ring-slate-900 ring-offset-1';

/** Seta de abrir/fechar. */
export function Seta({ aberta }: { aberta: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden="true"
      className="shrink-0 text-slate-500"
      style={{ transform: aberta ? 'rotate(90deg)' : undefined }}
    >
      <path d="M2 1 L6 4 L2 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
