// Ficha arrastável (PainelFoco no PC): onde fica, até onde pode ir e o que se lembra (localStorage).
// Funções puras; o gancho useJanelaArrastavel.ts mede o DOM e chama-as.
//
// - A ficha move-se dentro da área onde está posta (o <main> do mapa, a área de conteúdo da Tabela e do
//   Quadro), nunca sai dela e fica sempre a MARGEM_JANELA_PX das bordas (nem tapa a barra da vista nem a
//   barra de edição, que estão fora da área).
// - Guarda-se a distância à borda da esquerda ou da direita (a que estiver mais perto) e a distância ao
//   topo: uma ficha posta à direita continua à direita quando a janela muda de largura. O que já não cabe
//   fica preso às bordas, mas o que se guardou não muda: quando volta a haver espaço, volta ao sítio.
// - Arrastar para baixo encolhe a ficha (desliza por dentro) até ALTURA_MINIMA_JANELA_PX; daí para baixo
//   já não desce. Assim até uma ficha da altura toda se pode pôr mais abaixo.
// - Pode haver um retângulo a evitar (no mapa, a legenda dos clientes, no canto inferior esquerdo): com a
//   ficha por cima dele na horizontal e o topo acima dele, a ficha acaba antes dele, como na origem. Só o
//   tapa quando o próprio utilizador põe o topo da ficha na faixa dele (ou não há espaço para a mínima).

/** Largura e altura (px). */
export interface Tamanho {
  largura: number;
  altura: number;
}

/** Canto superior esquerdo da ficha dentro da área (px). */
export interface Canto {
  x: number;
  y: number;
}

/** Um retângulo dentro da área (px): o canto superior esquerdo e o tamanho. */
export interface Retangulo extends Canto, Tamanho {}

/** O que se guarda: a borda de lado mais perto, a distância a ela e a distância ao topo (px). */
export interface PosicaoJanela {
  borda: 'esquerda' | 'direita';
  distancia: number;
  topo: number;
}

/** Onde se desenha a ficha: o canto (já dentro da área) e a altura máxima (px). */
export interface Colocacao extends Canto {
  alturaMaxima: number;
}

/** Folga mínima entre a ficha e as bordas da área (px). */
export const MARGEM_JANELA_PX = 8;

/** Altura até onde a ficha encolhe quando se puxa para baixo (12 rem). */
export const ALTURA_MINIMA_JANELA_PX = 192;

/** Quanto anda com as setas do teclado (px); com Shift, PASSO_GRANDE_PX. */
export const PASSO_TECLADO_PX = 16;
export const PASSO_GRANDE_PX = 64;

/** Distância (px) que o ponteiro tem de andar para começar a arrastar (um clique não mexe a ficha). */
export const LIMIAR_ARRASTO_PX = 4;

/** Onde a ficha aparece (o mesmo que LugarFicha do PainelFoco): cada lugar lembra-se da sua posição. */
export type LugarJanela = 'mapa' | 'vista';

export const CHAVE_POSICAO: Record<LugarJanela, string> = {
  mapa: 'mapa-cmf:ficha-mapa',
  vista: 'mapa-cmf:ficha-vista',
};

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), Math.max(minimo, maximo));
}

/** A posição a guardar para uma ficha com este canto: mede-se a partir da borda de lado mais perto. */
export function ancorar(canto: Canto, largura: number, area: Tamanho): PosicaoJanela {
  const direita = area.largura - canto.x - largura;
  const topo = Math.round(Math.max(0, canto.y));
  return direita < canto.x
    ? { borda: 'direita', distancia: Math.round(Math.max(0, direita)), topo }
    : { borda: 'esquerda', distancia: Math.round(Math.max(0, canto.x)), topo };
}

/** O canto que a posição guardada pede nesta área (pode cair fora: quem desenha usa `colocar`). */
export function cantoDaPosicao(posicao: PosicaoJanela, largura: number, area: Tamanho): Canto {
  const x = posicao.borda === 'esquerda' ? posicao.distancia : area.largura - largura - posicao.distancia;
  return { x, y: posicao.topo };
}

/**
 * Onde desenhar a ficha que se quer com o canto em `desejado`: dentro da área, a MARGEM_JANELA_PX das
 * bordas. A altura máxima é o que fica da área por baixo do canto (mas nunca menos do que
 * ALTURA_MINIMA_JANELA_PX, se a área der); se mesmo assim não couber, a ficha sobe.
 * Com `evitar` (ex.: a legenda do mapa) por baixo da ficha, na mesma faixa horizontal, a altura máxima
 * acaba a `margem` do topo dele (também nunca menos do que a mínima).
 * @param janela a largura da ficha e a altura que ela teria sem limite (todo o conteúdo à vista).
 */
export function colocar(
  desejado: Canto,
  janela: Tamanho,
  area: Tamanho,
  evitar: Retangulo | null = null,
  margem = MARGEM_JANELA_PX,
): Colocacao {
  const alturaUtil = Math.max(0, area.altura - 2 * margem);
  const minima = Math.min(ALTURA_MINIMA_JANELA_PX, alturaUtil);
  const x = Math.round(limitar(desejado.x, margem, area.largura - janela.largura - margem));
  const yDesejado = limitar(desejado.y, margem, area.altura - margem);
  let alturaMaxima = Math.min(alturaUtil, Math.max(area.altura - yDesejado - margem, minima));
  if (evitar && evitar.largura > 0 && evitar.altura > 0) {
    const porCima = x < evitar.x + evitar.largura && x + janela.largura > evitar.x && yDesejado < evitar.y;
    if (porCima) alturaMaxima = Math.min(alturaMaxima, Math.max(evitar.y - margem - yDesejado, minima));
  }
  const altura = Math.min(janela.altura, alturaMaxima);
  return {
    x,
    y: Math.round(limitar(yDesejado, margem, area.altura - altura - margem)),
    alturaMaxima: Math.floor(alturaMaxima),
  };
}

/** O canto depois de arrastar o ponteiro de `inicio` até `agora`, a partir de `cantoInicial`. */
export function cantoArrastado(cantoInicial: Canto, inicio: Canto, agora: Canto): Canto {
  return { x: cantoInicial.x + agora.x - inicio.x, y: cantoInicial.y + agora.y - inicio.y };
}

/** Já andou o bastante para ser um arrasto (e não um clique ou um duplo clique)? */
export function passouLimiar(inicio: Canto, agora: Canto): boolean {
  return Math.hypot(agora.x - inicio.x, agora.y - inicio.y) >= LIMIAR_ARRASTO_PX;
}

const DESLOCAMENTO_TECLA: Record<string, Canto> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** O canto depois de uma seta do teclado (null se a tecla não é uma seta). */
export function cantoComTecla(canto: Canto, tecla: string, grande: boolean): Canto | null {
  const d = DESLOCAMENTO_TECLA[tecla];
  if (!d) return null;
  const passo = grande ? PASSO_GRANDE_PX : PASSO_TECLADO_PX;
  return { x: canto.x + d.x * passo, y: canto.y + d.y * passo };
}

/** Lê a posição guardada; o que vier estragado conta como "na posição de origem" (null). */
export function lerPosicao(texto: string | null): PosicaoJanela | null {
  if (!texto) return null;
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof dados !== 'object' || dados === null) return null;
  const { borda, distancia, topo } = dados as Record<string, unknown>;
  const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if ((borda !== 'esquerda' && borda !== 'direita') || !numero(distancia) || !numero(topo)) return null;
  return { borda, distancia, topo };
}

/** O que o localStorage tem de saber fazer (para os testes). */
export interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

function armazenamentoDoBrowser(): Armazenamento | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** A posição lembrada neste browser para este lugar (null = origem, também sem localStorage). */
export function carregarPosicao(
  lugar: LugarJanela,
  armazenamento: Armazenamento | null = armazenamentoDoBrowser(),
): PosicaoJanela | null {
  try {
    return lerPosicao(armazenamento?.getItem(CHAVE_POSICAO[lugar]) ?? null);
  } catch {
    return null;
  }
}

/** Lembra a posição (null = esquece: volta à origem). Sem localStorage fica só para esta visita. */
export function guardarPosicao(
  lugar: LugarJanela,
  posicao: PosicaoJanela | null,
  armazenamento: Armazenamento | null = armazenamentoDoBrowser(),
): void {
  try {
    if (posicao) armazenamento?.setItem(CHAVE_POSICAO[lugar], JSON.stringify(posicao));
    else armazenamento?.removeItem(CHAVE_POSICAO[lugar]);
  } catch {
    // Sem localStorage (modo privado, quota): fica só para esta visita.
  }
}
