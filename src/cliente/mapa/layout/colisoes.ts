// Colocação dos cartões sem sobreposições, o mais perto possível da sua âncora (o local real).
// Determinística, em três regras:
// 1. Gulosa: os maiores primeiro (desempate pela chave); cada cartão vai para a posição livre mais
//    próxima da ideal (centrado na âncora). A posição livre mais próxima é exata: a zona proibida para
//    o canto de um cartão é uma união de retângulos abertos (cartões já colocados, alargados pela
//    margem); o ponto livre mais perto da posição ideal tem cada coordenada igual à ideal ou encostada
//    à borda de uma dessas zonas, por isso basta testar a grelha {x ideal + bordas} × {y ideal + bordas}
//    por ordem de distância. Há sempre uma posição livre (à direita de tudo).
//    A distância pode pesar mais na vertical (os ecrãs são mais largos do que altos): com peso 2,
//    subir 100 px "custa" o mesmo que ir 200 px para o lado. Continua exato (cada eixo à parte).
// 2. Opcional: nenhum cartão tapa o ponto do local real de outro (o ponto entra como obstáculo).
// 3. Reparação: quem ficou longe do seu local passa para o início da ordem, se isso melhorar.
// Tudo em píxeis inteiros, para os encostos serem exatos.

import { type Retangulo, sobrepoem, uniao } from './geometria';
import type { Ponto } from './projecao';

/** Espaço mínimo entre dois cartões, em píxeis. */
export const MARGEM_COLISAO = 8;

export interface OpcoesColisoes {
  /** Espaço mínimo entre cartões (px). */
  margem?: number;
  /** Quanto pesa um píxel de deslocamento vertical face a um horizontal. */
  pesoVertical?: number;
  /** Raio à volta do local real dos OUTROS cartões que nenhum cartão pode tapar (0 = pode tapar). */
  raioAncoras?: number;
}

export interface CaixaAColocar {
  chave: string;
  ancora: Ponto;
  largura: number;
  altura: number;
}

export interface CaixaColocada extends Retangulo {
  chave: string;
  /** Âncora arredondada ao píxel. */
  ancora: Ponto;
  /** Saiu da posição ideal (centrada na âncora). */
  deslocada: boolean;
}

/** Um retângulo onde o cartão não pode entrar, com a distância mínima a guardar. */
interface Obstaculo {
  r: Retangulo;
  margem: number;
}

function livre(x: number, y: number, largura: number, altura: number, obstaculos: readonly Obstaculo[]) {
  const r = { x, y, largura, altura };
  for (const o of obstaculos) if (sobrepoem(r, o.r, o.margem)) return false;
  return true;
}

function melhorPosicao(
  ideal: Ponto,
  largura: number,
  altura: number,
  obstaculos: readonly Obstaculo[],
  pesoVertical: number,
): Ponto {
  if (livre(ideal.x, ideal.y, largura, altura, obstaculos)) return ideal;

  const xs = new Set<number>([ideal.x]);
  const ys = new Set<number>([ideal.y]);
  for (const { r, margem } of obstaculos) {
    xs.add(r.x - margem - largura);
    xs.add(r.x + r.largura + margem);
    ys.add(r.y - margem - altura);
    ys.add(r.y + r.altura + margem);
  }
  const candidatos: { x: number; y: number; d: number }[] = [];
  for (const x of xs) {
    for (const y of ys)
      candidatos.push({ x, y, d: (x - ideal.x) ** 2 + (pesoVertical * (y - ideal.y)) ** 2 });
  }
  candidatos.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  for (const c of candidatos) {
    if (livre(c.x, c.y, largura, altura, obstaculos)) return { x: c.x, y: c.y };
  }
  // Nunca devia chegar aqui; por segurança, à direita de tudo.
  const direita = Math.max(...obstaculos.map((o) => o.r.x + o.r.largura + o.margem));
  return { x: direita, y: ideal.y };
}

function compararTexto(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

interface Item {
  caixa: CaixaAColocar;
  indice: number;
  largura: number;
  altura: number;
  ancora: Ponto;
}

/** Distância do local real ao cartão (0 se o cartão está por cima do local). */
function afastamento(c: CaixaColocada): number {
  const dx = Math.max(c.x - c.ancora.x, 0, c.ancora.x - (c.x + c.largura));
  const dy = Math.max(c.y - c.ancora.y, 0, c.ancora.y - (c.y + c.altura));
  return Math.hypot(dx, dy);
}

/** Coloca os cartões um a um, por esta ordem. */
function colocarPorOrdem(
  itens: readonly Item[],
  ordem: readonly number[],
  margem: number,
  pesoVertical: number,
  raio: number,
): CaixaColocada[] {
  const colocadas: Obstaculo[] = [];
  const resultado = new Array<CaixaColocada>(itens.length);
  for (const i of ordem) {
    const { caixa, largura, altura, ancora } = itens[i] as Item;
    const ideal = { x: ancora.x - Math.floor(largura / 2), y: ancora.y - Math.floor(altura / 2) };
    // Os locais reais dos outros cartões ficam à vista (exceto os que coincidem com o deste).
    const pontos: Obstaculo[] = [];
    if (raio > 0) {
      for (const outro of itens) {
        const a = outro.ancora;
        if (outro.indice === i || (a.x === ancora.x && a.y === ancora.y)) continue;
        pontos.push({ r: { x: a.x - raio, y: a.y - raio, largura: 2 * raio, altura: 2 * raio }, margem: 0 });
      }
    }
    const pos = melhorPosicao(ideal, largura, altura, [...colocadas, ...pontos], pesoVertical);
    const r = { x: pos.x, y: pos.y, largura, altura };
    colocadas.push({ r, margem });
    resultado[i] = { ...r, chave: caixa.chave, ancora, deslocada: pos.x !== ideal.x || pos.y !== ideal.y };
  }
  return resultado;
}

const custo = (lista: readonly CaixaColocada[]) => lista.reduce((t, c) => t + afastamento(c), 0);

/** Caixa de tudo (cartões e locais): uma reparação quase não a pode aumentar (o enquadramento piorava). */
function caixaTotal(lista: readonly CaixaColocada[]) {
  return uniao(lista.flatMap((c) => [c, { x: c.ancora.x, y: c.ancora.y, largura: 0, altura: 0 }]));
}

/** Um cartão a mais do que isto do seu local é candidato a ser colocado mais cedo. */
const AFASTAMENTO_A_REPARAR = 40;
const MAXIMO_REPARACOES = 8;
/** Quanto pode crescer a caixa de tudo com uma reparação (10%). */
const CRESCIMENTO_TOLERADO = 1.1;

/**
 * Devolve as caixas pela mesma ordem da entrada, já colocadas.
 * Primeiro coloca os maiores; depois tenta reparar: o cartão que ficou mais longe do seu local passa
 * para o início da ordem e fica a nova disposição se a soma das distâncias aos locais diminuir sem
 * aumentar a caixa de tudo mais de 10% (senão o enquadramento inicial podia piorar).
 */
export function resolverColisoes(
  caixas: readonly CaixaAColocar[],
  opcoes: OpcoesColisoes = {},
): CaixaColocada[] {
  const margem = opcoes.margem ?? MARGEM_COLISAO;
  const pesoVertical = opcoes.pesoVertical ?? 1;
  const raio = opcoes.raioAncoras ?? 0;
  const itens: Item[] = caixas.map((caixa, indice) => ({
    caixa,
    indice,
    largura: Math.round(caixa.largura),
    altura: Math.round(caixa.altura),
    ancora: { x: Math.round(caixa.ancora.x), y: Math.round(caixa.ancora.y) },
  }));
  let ordem = [...itens]
    .sort(
      (a, b) =>
        b.largura * b.altura - a.largura * a.altura ||
        compararTexto(a.caixa.chave, b.caixa.chave) ||
        a.indice - b.indice,
    )
    .map((it) => it.indice);

  let melhor = colocarPorOrdem(itens, ordem, margem, pesoVertical, raio);
  let melhorCusto = custo(melhor);
  const caixaInicial = caixaTotal(melhor);
  const promovidos = new Set<number>();
  for (let n = 0; n < MAXIMO_REPARACOES; n++) {
    let pior = -1;
    let piorAfastamento = AFASTAMENTO_A_REPARAR;
    melhor.forEach((c, i) => {
      const a = afastamento(c);
      if (!promovidos.has(i) && a > piorAfastamento) {
        pior = i;
        piorAfastamento = a;
      }
    });
    if (pior < 0) break;
    promovidos.add(pior);
    const novaOrdem = [pior, ...ordem.filter((i) => i !== pior)];
    const tentativa = colocarPorOrdem(itens, novaOrdem, margem, pesoVertical, raio);
    const custoTentativa = custo(tentativa);
    const caixa = caixaTotal(tentativa);
    const naoCresce =
      !caixa ||
      !caixaInicial ||
      (caixa.largura <= caixaInicial.largura * CRESCIMENTO_TOLERADO &&
        caixa.altura <= caixaInicial.altura * CRESCIMENTO_TOLERADO);
    if (custoTentativa < melhorCusto && naoCresce) {
      melhor = tentativa;
      melhorCusto = custoTentativa;
      ordem = novaOrdem;
    }
  }
  return melhor;
}
