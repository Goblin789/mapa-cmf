// Caixa de seleção do modo de edição (Shift+arrastar no fundo do mapa): contas sem DOM.

import type { Retangulo } from './layout/geometria';
import type { Ponto } from './layout/projecao';

/** Abaixo disto (px) não é uma caixa, é um clique. */
export const TAMANHO_MINIMO_CAIXA = 4;

/** Retângulo entre dois cantos quaisquer. */
export function retanguloEntre(a: Ponto, b: Ponto): Retangulo {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    largura: Math.abs(a.x - b.x),
    altura: Math.abs(a.y - b.y),
  };
}

export function eCaixa(r: Retangulo): boolean {
  return r.largura >= TAMANHO_MINIMO_CAIXA || r.altura >= TAMANHO_MINIMO_CAIXA;
}

/** Os dois retângulos têm alguma parte em comum (encostar conta). */
export function intersectam(a: Retangulo, b: Retangulo): boolean {
  return a.x <= b.x + b.largura && b.x <= a.x + a.largura && a.y <= b.y + b.altura && b.y <= a.y + a.altura;
}

/** Ids dos elementos cujo retângulo a caixa toca, sem repetir, pela ordem em que aparecem. */
export function idsNaCaixa(
  caixa: Retangulo,
  elementos: readonly { id: string; retangulo: Retangulo }[],
): string[] {
  const ids: string[] = [];
  const vistos = new Set<string>();
  for (const e of elementos) {
    if (vistos.has(e.id) || !intersectam(caixa, e.retangulo)) continue;
    vistos.add(e.id);
    ids.push(e.id);
  }
  return ids;
}
