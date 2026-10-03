// Textos curtos para os cartões pequenos (o nome completo fica sempre no tooltip).

import { normalizarTexto } from '../../../dominio/pesquisa';

function palavras(texto: string): Set<string> {
  return new Set(
    normalizarTexto(texto)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

/**
 * Nome da casa sem o que já se lê no grupo: tira do fim as palavras que estão no nome ou na morada
 * do local ("Casa 2 Rue de la Forêt" → "Casa 2", "Casa 1 Puttelange" → "Casa 1") e abrevia
 * "Apartamento" ("Apartamento E Puttelange" → "Ap. E"). Nunca fica vazio.
 */
export function nomeCurtoCasa(nomeCasa: string, textoLocal: string): string {
  const doLocal = palavras(textoLocal);
  const partes = nomeCasa.trim().split(/\s+/);
  while (partes.length > 1 && doLocal.has(normalizarTexto(partes[partes.length - 1] as string))) partes.pop();
  return partes.join(' ').replace(/^Apartamento\b/i, 'Ap.');
}

/** Nome de um local para o rótulo no mapa: "Himeling, Rue de la Grotte" → "Himeling · Rue de la Grotte". */
export function nomeRotulo(nomeLocal: string): string {
  return nomeLocal
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * Nome de vários locais juntos (pastilha de resumo): a parte comum antes da vírgula, se houver
 * ("Himeling, Rue de la Grotte" + "Himeling, Rue de la Forêt" → "Himeling"); senão, todos com "·".
 */
export function nomeJunto(nomes: readonly string[]): string {
  if (nomes.length === 1) return nomeRotulo(nomes[0] as string);
  const primeiras = nomes.map((n) => (n.split(',')[0] ?? n).trim());
  const [primeira] = primeiras;
  if (primeira && primeiras.every((p) => p === primeira)) return primeira;
  return primeiras.join(' · ');
}

/**
 * Largura (px base) do rótulo de um local escrito a 10 px em negrito: uma estimativa por excesso
 * (o texto nunca fica cortado; no pior caso sobra um pouco de espaço).
 */
export function larguraRotulo(texto: string): number {
  return Math.ceil(texto.length * 6.2) + 4;
}

/** "1 casa" / "4 casas". */
export function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
