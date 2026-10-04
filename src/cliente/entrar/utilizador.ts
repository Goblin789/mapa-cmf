// Como mostrar quem entrou no botão do cabeçalho (iniciais, primeiro nome) e o aviso antes de sair.
// Funções puras.

import { comPlural } from '../paineis/textos';

/** Primeira letra de uma palavra, em maiúscula (com acentos: "élio" → "É"). */
function primeiraLetra(palavra: string): string {
  // Array.from separa por carateres (pontos de código), não por unidades UTF-16.
  return (Array.from(palavra)[0] ?? '').toLocaleUpperCase('pt-PT');
}

/** Palavras com pelo menos uma letra ("Ana  da Silva" → Ana, da, Silva; "-" e "(…)" não contam). */
function palavras(texto: string): string[] {
  return texto
    .split(/\s+/)
    .map((p) => p.replace(/^[^\p{L}]+/u, ''))
    .filter((p) => /\p{L}/u.test(p));
}

/**
 * Iniciais para o círculo do botão: a primeira letra do primeiro e do último nome ("Ana da Silva" → "AS").
 * Só um nome: uma letra. Sem nome: a primeira letra do e-mail. Sem nada: "?".
 */
export function iniciais(nome: string, email: string | null = null): string {
  const p = palavras(nome);
  const primeira = p[0];
  const ultima = p.at(-1);
  if (primeira && ultima && p.length > 1) return `${primeiraLetra(primeira)}${primeiraLetra(ultima)}`;
  if (primeira) return primeiraLetra(primeira);
  const local = palavras(email?.split('@')[0]?.replace(/[._-]+/g, ' ') ?? '');
  return local[0] ? primeiraLetra(local[0]) : '?';
}

/** "Ana da Silva" → "Ana". Sem nome: "". */
export function primeiroNome(nome: string): string {
  return palavras(nome)[0] ?? '';
}

/** "Tens 3 alterações por guardar. Se saíres, perdem-se." (com uma só: "perde-se"). */
export function textoSairComPendentes(n: number): string {
  const perder = n === 1 ? 'perde-se' : 'perdem-se';
  return `Tens ${comPlural(n, 'alteração', 'alterações')} por guardar. Se saíres, ${perder}.`;
}
