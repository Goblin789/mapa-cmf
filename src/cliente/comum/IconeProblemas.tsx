// Ícone com o número de problemas abertos de uma casa ou carrinha (M2, docs/m2.md, "Problemas"): no
// cartão do Mapa, no bloco do Quadro, na secção da lista lateral e no título da ficha. Sem problemas
// abertos não mostra nada. Discreto (âmbar), com o texto para leitores de ecrã ("2 problemas por resolver")
// e a lista no title.
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele). As outras vistas só o
// montam: <IconeProblemas alvo={{ tipo: 'casa', id }} tamanho="mapa" />.

import type { AlvoProblema } from '../../dominio/problemas';

export function IconeProblemas({
  alvo,
  tamanho = 'normal',
}: {
  alvo: AlvoProblema;
  /** 'mapa' = cartões do mapa (letra de 10 px); 'normal' = Quadro, lista, ficha. */
  tamanho?: 'mapa' | 'normal';
}) {
  void alvo;
  void tamanho;
  return null;
}
