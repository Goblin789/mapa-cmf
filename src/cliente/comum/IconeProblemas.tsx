// Ícone com o número de problemas abertos de uma casa ou carrinha (M2, docs/m2.md, "Problemas"): no
// cartão do Mapa, no bloco do Quadro, na secção da lista lateral e no título da ficha. Sem problemas
// abertos não mostra nada. Discreto (âmbar), com o texto para leitores de ecrã ("2 problemas por resolver")
// e a lista no title. Não é clicável (o clique é de quem está à volta: o cartão, o bloco, a secção).
// 'normal' mede-se em em (o Quadro escala a letra na reunião); 'mapa' tem 12 px de alto, como a linha de
// estado dos cartões.
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele). As outras vistas só o
// montam: <IconeProblemas alvo={{ tipo: 'casa', id }} tamanho="mapa" />.

import { type AlvoProblema, chaveAlvoProblema } from '../../dominio/problemas';
import type { Problema } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';

const NENHUM: readonly Problema[] = [];

/** Os problemas abertos da casa/carrinha (Indices.problemasAbertos). */
export function useProblemasAbertos(alvo: AlvoProblema): readonly Problema[] {
  return useLoja((s) => s.indices?.problemasAbertos.get(chaveAlvoProblema(alvo)) ?? NENHUM);
}

/** "1 problema por resolver" / "2 problemas por resolver". */
export function textoProblemasAbertos(n: number): string {
  return n === 1 ? '1 problema por resolver' : `${n} problemas por resolver`;
}

/** Para o title e as descrições dos cartões: "2 problemas por resolver: Pneu furado; Porta não fecha". */
export function descricaoProblemas(problemas: readonly Pick<Problema, 'texto'>[]): string {
  if (problemas.length === 0) return '';
  return `${textoProblemasAbertos(problemas.length)}: ${problemas.map((p) => p.texto).join('; ')}`;
}

/** Triângulo de aviso (contorno), do tamanho da letra. */
function IconeAviso() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-[1em] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <path d="M6 1.4 11 10.4H1z" />
      <path d="M6 4.6v2.6" strokeLinecap="round" />
      <circle cx="6" cy="8.7" r="0.45" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconeProblemas({
  alvo,
  tamanho = 'normal',
}: {
  alvo: AlvoProblema;
  /** 'mapa' = cartões do mapa (letra de 10 px); 'normal' = Quadro, lista, ficha. */
  tamanho?: 'mapa' | 'normal';
}) {
  const problemas = useProblemasAbertos(alvo);
  if (problemas.length === 0) return null;
  return (
    <span
      data-problemas={problemas.length}
      title={descricaoProblemas(problemas)}
      className={[
        'inline-flex shrink-0 items-center border border-amber-400 bg-amber-50 font-semibold whitespace-nowrap text-amber-900 tabular-nums',
        tamanho === 'mapa'
          ? 'h-3 gap-px rounded-sm px-0.5 text-[9px] leading-none'
          : 'gap-[0.2em] rounded-[0.25em] px-[0.3em] text-[0.85em] leading-[1.45]',
      ].join(' ')}
    >
      <IconeAviso />
      <span aria-hidden="true">{problemas.length}</span>
      <span className="sr-only">{textoProblemasAbertos(problemas.length)}</span>
    </span>
  );
}
