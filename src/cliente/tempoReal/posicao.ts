// Onde pôr a pilha de avisos do tempo real sem tapar a legenda, o painel de foco, os controlos do mapa
// (camadas, carrinhas sem local, zoom, atribuição do OpenStreetMap) nem o aviso curto do modo de edição.
// Função pura sobre retângulos medidos no ecrã (o AvisoTempoReal mede-os).
//
// A largura é sempre a mesma (a do mapa menos as margens, até LARGURA_AVISOS): assim a altura da pilha
// não depende do sítio escolhido e a posição não fica a saltar entre dois sítios. Começa em baixo, ao
// centro do mapa; se alguma coisa estiver nessa faixa, desvia-se para o lado se houver espaço livre que
// chegue, senão sobe para cima dela e tenta outra vez. Nunca sobe acima do cabeçalho nem da barra de
// edição: sem sítio livre, fica em baixo (os avisos são passageiros).

export interface Retangulo {
  esquerda: number;
  topo: number;
  direita: number;
  fundo: number;
}

export interface EntradaPosicao {
  /** Altura da janela (px). */
  alturaJanela: number;
  /** Faixa horizontal onde os avisos podem ficar: o mapa (no telemóvel ocupa a largura toda). */
  faixa: { esquerda: number; direita: number };
  /** O que não se pode tapar (só o que está à vista). */
  obstaculos: readonly Retangulo[];
  /** Altura da pilha de avisos (px). */
  altura: number;
  /** Não se sobe acima disto (fundo do cabeçalho ou da barra de edição à vista, px desde o topo). */
  topoMinimo: number;
}

export interface Posicao {
  /** px desde a esquerda da janela. */
  esquerda: number;
  largura: number;
  /** px desde o fundo da janela. */
  fundo: number;
}

/** Espaço entre os avisos e as margens ou os obstáculos (px). */
export const MARGEM_AVISOS = 12;
/** Largura da pilha, se o mapa tiver espaço para ela (px). */
export const LARGURA_AVISOS = 384;

/** Tentativas de subir (cada uma passa por cima de um nível de obstáculos). */
const MAX_SUBIDAS = 6;

/** Maior intervalo livre dentro de [inicio, fim], descontando os obstáculos (com margem à volta). */
export function maiorIntervaloLivre(
  inicio: number,
  fim: number,
  ocupados: readonly { esquerda: number; direita: number }[],
  margem = MARGEM_AVISOS,
): { esquerda: number; direita: number } {
  const ordenados = [...ocupados].sort((a, b) => a.esquerda - b.esquerda);
  let melhor = { esquerda: inicio, direita: inicio };
  let cursor = inicio;
  for (const o of ordenados) {
    const ate = Math.min(o.esquerda - margem, fim);
    if (ate - cursor > melhor.direita - melhor.esquerda) melhor = { esquerda: cursor, direita: ate };
    cursor = Math.max(cursor, o.direita + margem);
  }
  if (fim - cursor > melhor.direita - melhor.esquerda) melhor = { esquerda: cursor, direita: fim };
  return melhor;
}

export function posicaoAvisos(e: EntradaPosicao): Posicao {
  const inicio = e.faixa.esquerda + MARGEM_AVISOS;
  const fim = e.faixa.direita - MARGEM_AVISOS;
  const largura = Math.round(Math.max(0, Math.min(LARGURA_AVISOS, fim - inicio)));
  const centrada = Math.round((e.faixa.esquerda + e.faixa.direita - largura) / 2);

  let fundo = MARGEM_AVISOS;
  for (let i = 0; i <= MAX_SUBIDAS; i++) {
    const baixo = e.alturaJanela - fundo;
    const cima = baixo - e.altura;
    if (cima < e.topoMinimo) break;
    const naFaixa = e.obstaculos.filter(
      (o) => o.topo < baixo && o.fundo > cima && o.direita > inicio && o.esquerda < fim,
    );
    const livre = maiorIntervaloLivre(inicio, fim, naFaixa);
    if (livre.direita - livre.esquerda >= largura) {
      // O mais perto possível do centro do mapa, dentro do espaço livre.
      const esquerda = Math.max(livre.esquerda, Math.min(centrada, livre.direita - largura));
      return { esquerda: Math.round(esquerda), largura, fundo: Math.round(fundo) };
    }
    // Sobe o mínimo: para cima do obstáculo mais baixo desta faixa (os mais altos ficam para a seguinte).
    const topo = Math.max(...naFaixa.map((o) => o.topo));
    fundo = e.alturaJanela - topo + MARGEM_AVISOS;
  }
  return { esquerda: centrada, largura, fundo: MARGEM_AVISOS };
}
