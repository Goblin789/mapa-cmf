// Retângulos e segmentos: o mínimo para colisões, linhas de chamada e linhas de foco.

import type { Ponto } from './projecao';

export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface Segmento {
  de: Ponto;
  para: Ponto;
}

/** Os interiores sobrepõem-se (encostar não conta). Com margem, têm de ficar a pelo menos `margem` px. */
export function sobrepoem(a: Retangulo, b: Retangulo, margem = 0): boolean {
  return (
    a.x < b.x + b.largura + margem &&
    b.x < a.x + a.largura + margem &&
    a.y < b.y + b.altura + margem &&
    b.y < a.y + a.altura + margem
  );
}

export function centro(r: Retangulo): Ponto {
  return { x: r.x + r.largura / 2, y: r.y + r.altura / 2 };
}

export function contem(r: Retangulo, p: Ponto): boolean {
  return p.x >= r.x && p.x <= r.x + r.largura && p.y >= r.y && p.y <= r.y + r.altura;
}

export function deslocar(r: Retangulo, dx: number, dy: number): Retangulo {
  return { x: r.x + dx, y: r.y + dy, largura: r.largura, altura: r.altura };
}

/** Ponto do retângulo (borda ou interior) mais perto de `p`. */
export function pontoMaisProximo(r: Retangulo, p: Ponto): Ponto {
  return {
    x: Math.min(Math.max(p.x, r.x), r.x + r.largura),
    y: Math.min(Math.max(p.y, r.y), r.y + r.altura),
  };
}

export function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Onde a semirreta do centro de `r` em direção a `alvo` sai do retângulo. */
export function pontoNaBorda(r: Retangulo, alvo: Ponto): Ponto {
  const c = centro(r);
  const dx = alvo.x - c.x;
  const dy = alvo.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const meiaL = r.largura / 2;
  const meiaA = r.altura / 2;
  const t = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : meiaL / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : meiaA / Math.abs(dy),
  );
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Segmento entre as bordas de dois retângulos, na linha dos centros. null se se sobrepõem. */
export function segmentoEntre(a: Retangulo, b: Retangulo): Segmento | null {
  if (sobrepoem(a, b)) return null;
  return { de: pontoNaBorda(a, centro(b)), para: pontoNaBorda(b, centro(a)) };
}

/** Menor retângulo que contém todos (null se a lista estiver vazia). */
export function uniao(lista: readonly Retangulo[]): Retangulo | null {
  if (lista.length === 0) return null;
  let x1 = Number.POSITIVE_INFINITY;
  let y1 = Number.POSITIVE_INFINITY;
  let x2 = Number.NEGATIVE_INFINITY;
  let y2 = Number.NEGATIVE_INFINITY;
  for (const r of lista) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.largura);
    y2 = Math.max(y2, r.y + r.altura);
  }
  return { x: x1, y: y1, largura: x2 - x1, altura: y2 - y1 };
}
