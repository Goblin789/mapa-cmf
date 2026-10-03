// Leitura de células das folhas (unknown[][]): texto, números, coordenadas A1 e identificadores.

import { normalizarTexto } from '../dominio/pesquisa';

/** Texto aparado de uma célula, sem mexer nos espaços do meio; vazio → null. Números passam a texto. */
export function textoBruto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim() || null;
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  if (typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return null;
}

/** Texto de uma célula com os espaços repetidos reduzidos a um; vazio → null. */
export function textoCelula(valor: unknown): string | null {
  return textoBruto(valor)?.replace(/\s+/g, ' ') ?? null;
}

/** Número de uma célula (só se for mesmo um número); senão null. */
export function numeroCelula(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** Valor na linha e coluna (base 0), ou undefined fora da folha. */
export function valorEm(linhas: unknown[][], linha: number, coluna: number): unknown {
  return linhas[linha]?.[coluna];
}

/** "A" → 0, "B" → 1, "AA" → 26. */
export function indiceColuna(letras: string): number {
  let n = 0;
  for (const c of letras.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** 0 → "A", 26 → "AA". */
export function letrasColuna(indice: number): string {
  let s = '';
  for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Referência A1 a partir de linha e coluna base 0: (2, 1) → "B3". */
export function referencia(linha: number, coluna: number): string {
  return `${letrasColuna(coluna)}${linha + 1}`;
}

/** Chave para comparar nomes: sem acentos, minúsculas, espaços normalizados. */
export function chaveNome(s: string): string {
  return normalizarTexto(s);
}

/** Nº normalizado: sem espaços, mantendo o sufixo ("900- 372_2" → "900-372_2"); vazio → null. */
export function normalizarNumero(original: string | null): string | null {
  if (original === null) return null;
  return original.replace(/\s+/g, '') || null;
}

/** Slug sem acentos: letras, algarismos e "_"; o resto vira "-". */
export function slug(s: string): string {
  return normalizarTexto(s)
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Devolve `base` ou `base-2`, `base-3`… o primeiro que ainda não está em `usados` (e reserva-o). */
export function garantirUnico(base: string, usados: Set<string>): string {
  let id = base;
  for (let i = 2; usados.has(id); i++) id = `${base}-${i}`;
  usados.add(id);
  return id;
}

/** Id estável da pessoa: do Nº normalizado quando existe ("p-900-017_3"), senão do nome curto. */
export function idPessoaBase(numero: string | null, nomeCurto: string): string {
  return `p-${slug(numero ?? nomeCurto) || 'sem-nome'}`;
}
