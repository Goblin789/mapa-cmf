// Condições do git para publicar. O Render constrói o main do GitHub, não o que está neste PC: só se publica
// quando o PC está no main, sem alterações por gravar e igual ao origin/main — assim o que se verificou
// aqui é exatamente o que vai para o ar.

export const RAMO_PUBLICACAO = 'main';

/** Quantos ficheiros alterados se mostram (o resto resume-se). */
const MAX_FICHEIROS = 8;

/**
 * Problemas do ramo atual e da árvore de trabalho. `alteracoes` é a saída de `git status --porcelain`
 * (inclui ficheiros novos ainda fora do git: no GitHub não estariam).
 */
export function problemasRamoEArvore(ramo: string, alteracoes: string): string[] {
  const problemas: string[] = [];
  if (ramo !== RAMO_PUBLICACAO) {
    problemas.push(
      ramo === 'HEAD'
        ? `Não estás em nenhum ramo (HEAD solto): volta ao ${RAMO_PUBLICACAO} com "git switch ${RAMO_PUBLICACAO}".`
        : `Estás no ramo "${ramo}": só se publica o ${RAMO_PUBLICACAO} ("git switch ${RAMO_PUBLICACAO}").`,
    );
  }
  const linhas = alteracoes.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhas.length > 0) {
    const mostradas = linhas.slice(0, MAX_FICHEIROS).map((l) => `    ${l}`);
    if (linhas.length > MAX_FICHEIROS) mostradas.push(`    … e mais ${linhas.length - MAX_FICHEIROS}`);
    problemas.push(
      `Há ${linhas.length === 1 ? '1 alteração' : `${linhas.length} alterações`} por gravar no git ` +
        `(o Render só vê o que está no GitHub). Grava-as (commit + push) ou desfá-las primeiro:\n${mostradas.join('\n')}`,
    );
  }
  return problemas;
}

/** Lê a saída de `git rev-list --left-right --count main...origin/main` ("2\t0"). */
export function lerContagem(texto: string): { aFrente: number; atras: number } | null {
  const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(texto);
  if (!m) return null;
  return { aFrente: Number(m[1]), atras: Number(m[2]) };
}

/** Problemas da comparação entre o main deste PC e o do GitHub. */
export function problemasSincronizacao(aFrente: number, atras: number): string[] {
  const problemas: string[] = [];
  if (aFrente > 0) {
    problemas.push(
      `O main deste PC tem ${aFrente === 1 ? '1 commit' : `${aFrente} commits`} que ainda não ` +
        `${aFrente === 1 ? 'foi' : 'foram'} para o GitHub: envia com "git push" primeiro.`,
    );
  }
  if (atras > 0) {
    problemas.push(
      `O GitHub tem ${atras === 1 ? '1 commit' : `${atras} commits`} no main que não ` +
        `${atras === 1 ? 'está' : 'estão'} neste PC: traz com "git pull" e volta a verificar.`,
    );
  }
  return problemas;
}
