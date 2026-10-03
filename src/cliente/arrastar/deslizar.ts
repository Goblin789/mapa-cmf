// Contas puras do arrastar: deslizar sozinho perto da borda de um contentor com scroll e
// posição do fantasma (perto do ponteiro, por cima do dedo no telemóvel, sempre dentro do ecrã).

import type { Ponteiro } from './maquina';

/** Faixa junto à borda (px) onde o contentor começa a deslizar. */
export const MARGEM_DESLIZE_PX = 48;
/** Velocidade máxima (px por quadro, ~60 por segundo). */
export const VELOCIDADE_MAXIMA_PX = 18;

/**
 * Velocidade de deslize num eixo: negativa perto do início (cima/esquerda), positiva perto do fim,
 * 0 no meio. Cresce à medida que o ponteiro se aproxima da borda (pelo menos 1 px por quadro).
 * Em contentores pequenos a faixa encolhe para um quarto do tamanho.
 */
export function velocidadeBorda(
  posicao: number,
  inicio: number,
  fim: number,
  margem = MARGEM_DESLIZE_PX,
  maximo = VELOCIDADE_MAXIMA_PX,
): number {
  const tamanho = fim - inicio;
  if (tamanho <= 0) return 0;
  const faixa = Math.min(margem, tamanho / 4);
  if (faixa <= 0) return 0;
  const velocidade = (fracao: number) => Math.max(1, Math.round(maximo * Math.min(1, fracao)));
  if (posicao < inicio + faixa) return -velocidade((inicio + faixa - posicao) / faixa);
  if (posicao > fim - faixa) return velocidade((posicao - (fim - faixa)) / faixa);
  return 0;
}

/** Se o contentor ainda pode deslizar nesse sentido (não está já no princípio ou no fim). */
export function podeDeslizar(deslocado: number, visivel: number, total: number, velocidade: number): boolean {
  if (velocidade < 0) return deslocado > 0;
  if (velocidade > 0) return deslocado + visivel < total - 1;
  return false;
}

/** Distância entre o fantasma e o ponteiro (rato) e entre o fantasma e o dedo (toque). */
export const AFASTAMENTO_RATO_PX = 14;
export const ACIMA_DO_DEDO_PX = 40;
const MARGEM_ECRA_PX = 4;

/**
 * Canto superior esquerdo do fantasma. Rato: em baixo à direita do ponteiro (ou do outro lado, se não
 * couber). Toque: centrado e ACIMA_DO_DEDO_PX acima do dedo, para o dedo não o tapar (por baixo, se o
 * dedo estiver encostado ao topo). Nunca sai do ecrã.
 */
export function posicaoFantasma(
  x: number,
  y: number,
  largura: number,
  altura: number,
  ponteiro: Ponteiro,
  larguraJanela: number,
  alturaJanela: number,
): { x: number; y: number } {
  let gx: number;
  let gy: number;
  if (ponteiro === 'toque') {
    gx = x - largura / 2;
    gy = y - ACIMA_DO_DEDO_PX - altura;
    if (gy < MARGEM_ECRA_PX) gy = y + ACIMA_DO_DEDO_PX;
  } else {
    gx = x + AFASTAMENTO_RATO_PX;
    gy = y + AFASTAMENTO_RATO_PX;
    if (gx + largura > larguraJanela - MARGEM_ECRA_PX) gx = x - AFASTAMENTO_RATO_PX - largura;
    if (gy + altura > alturaJanela - MARGEM_ECRA_PX) gy = y - AFASTAMENTO_RATO_PX - altura;
  }
  const limitar = (v: number, max: number) => Math.max(MARGEM_ECRA_PX, Math.min(v, max - MARGEM_ECRA_PX));
  return {
    x: Math.round(limitar(gx, larguraJanela - largura)),
    y: Math.round(limitar(gy, alturaJanela - altura)),
  };
}
