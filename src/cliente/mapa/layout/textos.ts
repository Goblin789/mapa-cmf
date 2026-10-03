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

/** "1 casa" / "4 casas". */
export function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
