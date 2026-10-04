// Nomes para mostrar. A lista de pessoal traz muitos apelidos em maiúsculas ("ABEL António Gomes
// ESTEVES", "Cipriano DA SILVA"); a Tabela e o Excel mostram-nos com maiúsculas normais ("Abel António
// Gomes Esteves", "Cipriano da Silva"). Só para mostrar: o nome guardado nunca muda.

/** Partículas que ficam em minúsculas quando não são a 1.ª palavra. */
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** Tem letras e nenhuma minúscula: "SILVA", "D'ALMEIDA", "ANA-RITA" (não "Silva" nem "McDONALD"). */
function emMaiusculas(palavra: string): boolean {
  return palavra !== palavra.toLocaleLowerCase('pt') && palavra === palavra.toLocaleUpperCase('pt');
}

/**
 * "SILVA" → "Silva": maiúscula na 1.ª letra e em cada letra a seguir a algo que não é letra (hífen,
 * apóstrofo, ponto, parênteses): "ANA-RITA" → "Ana-Rita", "O'NEILL" → "O'Neill", "J.P." → "J.P.",
 * "(TINA)" → "(Tina)". Os acentos combinados (\p{M}) contam como parte da letra.
 */
function capitalizar(palavra: string): string {
  return palavra
    .toLocaleLowerCase('pt')
    .replace(
      /(^|[^\p{L}\p{M}])(\p{L})/gu,
      (_, antes: string, letra: string) => antes + letra.toLocaleUpperCase('pt'),
    );
}

/**
 * O nome com maiúsculas normais: as palavras todas em maiúsculas passam a ter só a inicial maiúscula
 * (também as partes a seguir a hífen, apóstrofo, ponto ou parênteses); as outras ficam como estão
 * ("McDONALD"). A partir da 2.ª palavra, da/de/do/das/dos/e ficam sempre em minúsculas, venham em
 * maiúsculas ou só com a inicial ("DA", "Da" → "da"), e o "d'" também ("D'ALMEIDA", "D'Almeida" →
 * "d'Almeida"): as partículas aparecem sempre da mesma maneira. Espaços a mais desaparecem.
 */
export function nomeComMaiusculasNormais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((palavra, i) => {
      const normal = emMaiusculas(palavra) ? capitalizar(palavra) : palavra;
      if (i === 0) return normal;
      const minusculas = normal.toLocaleLowerCase('pt');
      if (PARTICULAS.has(minusculas)) return minusculas;
      // "D'Almeida" (ou com o apóstrofo tipográfico) a meio do nome → "d'Almeida".
      if (/^D['’]\p{Lu}/u.test(normal)) return `d${normal.slice(1)}`;
      return normal;
    })
    .join(' ');
}
