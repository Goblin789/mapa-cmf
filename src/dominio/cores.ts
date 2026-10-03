// Cores: a cor de cada pessoa vem sempre do cliente (o da obra, ou o da pessoa enquanto não tem obra).
// Nada disto se guarda na base de dados.

import type { Id, Obra, Pessoa } from './tipos';

function canalLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa WCAG de uma cor #RRGGBB. */
export function luminancia(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Cor inválida: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => canalLinear(Number.parseInt(x as string, 16)));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

/** Contraste WCAG entre duas cores (1 a 21). */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texto preto ou branco, o que tiver mais contraste com o fundo. */
export function corTexto(fundo: string): '#000000' | '#ffffff' {
  return contraste(fundo, '#000000') >= contraste(fundo, '#ffffff') ? '#000000' : '#ffffff';
}

/** Cliente que dá a cor à pessoa: o da obra, se tiver obra; senão o da própria pessoa. */
export function clienteEfetivoId(pessoa: Pessoa, obras: Map<Id, Obra>): Id {
  const obra = pessoa.obraId ? obras.get(pessoa.obraId) : undefined;
  return obra ? obra.clienteId : pessoa.clienteId;
}
