// Classes Tailwind repetidas nos painéis.

/** Contorno visível quando o elemento recebe o foco pelo teclado. */
export const FOCO_VISIVEL =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';

/** Sobreposições dentro do mapa: acima dos painéis e controlos do Leaflet (que vão até 1000). */
export const Z_SOBRE_MAPA = 'z-[1000]';

/** Popovers e listas do cabeçalho: por cima de tudo o que está no mapa. */
export const Z_POPOVER = 'z-[1100]';

/** Espaço entre o fundo do painel de foco e o topo da legenda (px). */
const FOLGA_LEGENDA_PX = 8;

/**
 * Altura máxima do painel de foco (canto superior esquerdo): o mapa menos as margens de 0,75 rem
 * e a altura da legenda (canto inferior esquerdo), para a ficha não a tapar. Nunca menos de 10 rem:
 * num mapa muito baixo, ou com a legenda aberta no telemóvel, a ficha passa por cima dela.
 */
export function alturaMaximaPainelFoco(alturaLegendaPx: number): string {
  if (alturaLegendaPx <= 0) return 'calc(100% - 1.5rem)';
  const semLegenda = `calc(100% - 1.5rem - ${Math.ceil(alturaLegendaPx) + FOLGA_LEGENDA_PX}px)`;
  return `min(calc(100% - 1.5rem), max(10rem, ${semLegenda}))`;
}
