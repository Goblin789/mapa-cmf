// Colocação dos blocos de cartões no mapa: cada bloco fica AGARRADO ao seu local, com um pino curto
// (o ponto exato da morada fica à vista, a PINO px do bloco), e nenhum bloco se sobrepõe a outro nem
// tapa o ponto de outro local. Determinística, em três regras:
// 1. Gulosa: os maiores primeiro (desempate pela chave). Cada bloco vai para a posição livre de menor
//    custo, experimentando as formas que tiver (arrumações diferentes dos mesmos cartões).
//    Custo = distância de cada ponto à sua parte do bloco (PINO quando está encostado: por cima, por
//    baixo ou ao lado) + uma pequena preferência por ficar por cima e centrado + o que sai da região
//    dos locais (para o conjunto caber no ecrã com o zoom mais alto possível) + o custo da forma.
//    A procura é exata: a zona proibida para o canto de um bloco é uma união de retângulos (blocos já
//    colocados alargados pela margem, pontos dos locais); o melhor ponto livre tem cada coordenada na
//    posição centrada, encostada a uma dessas zonas ou à borda da região, por isso basta testar essa
//    grelha de candidatos por ordem de custo. Há sempre uma posição livre (fora de tudo).
// 2. Os pontos dos locais são obstáculos: o próprio (a PINO px) e os dos outros blocos.
// 3. Reparação: quem ficou longe do seu local passa para o início da ordem, se isso baixar o custo total.
// Tudo em píxeis inteiros, para os encostos serem exatos.

import { type Retangulo, sobrepoem } from './geometria';
import type { Ponto } from './projecao';

/** Espaço mínimo entre dois blocos, em píxeis. */
export const MARGEM_COLISAO = 6;
/** Distância entre o ponto do local e o seu bloco (o "pino"). */
export const PINO = 7;
/** Raio à volta do ponto de cada local que nenhum outro bloco pode tapar. */
export const RAIO_PONTOS = 6;

/** Preferências (em píxeis de distância): por cima e centrado é o melhor. */
const CUSTO_POR_BAIXO = 2;
const CUSTO_DE_LADO = 3;
const CUSTO_DESCENTRADO = 0.01;
/** Quanto custa cada píxel do bloco fora da região (o mapa no ecrã): obriga a baixar o zoom. */
const PESO_FORA = 0.5;

export interface OpcoesColocacao {
  margem?: number;
  pino?: number;
  raioPontos?: number;
  /** Região onde os blocos devem ficar (o mapa no ecrã); sair dela custa pesoFora por píxel. */
  regiao?: Retangulo | null;
  pesoFora?: number;
}

/** Uma arrumação possível do bloco. */
export interface FormaBloco {
  largura: number;
  altura: number;
  /**
   * A parte do bloco que pertence a cada ponto (relativa ao canto do bloco), pela ordem dos pontos:
   * o cartão principal do local (a casa), ou, num bloco com duas ruas, os cartões dessa rua. A distância
   * conta-se de cada ponto à sua parte: o pino chega mesmo à casa (não a uma carrinha nem a um canto
   * vazio do bloco) e cada rua fica junto do seu ponto. Por omissão, o bloco inteiro.
   */
  partes?: readonly Retangulo[];
  /** Custo (px) de usar esta forma em vez da preferida. */
  custoExtra?: number;
}

export interface CaixaAColocar {
  chave: string;
  /** Pontos dos locais deste bloco (um, ou vários locais juntos). */
  pontos: readonly Ponto[];
  /** Formas possíveis, a preferida primeiro (pelo menos uma). */
  formas: readonly FormaBloco[];
}

export interface CaixaColocada extends Retangulo {
  chave: string;
  /** Pontos arredondados ao píxel. */
  pontos: Ponto[];
  /** Índice da forma escolhida. */
  forma: number;
  /** Maior distância de um ponto à sua parte do bloco. */
  afastamento: number;
  /** Ficou mais longe do que o pino: desenha-se uma linha de chamada. */
  deslocada: boolean;
}

/** Um retângulo onde o bloco não pode entrar, com a distância mínima a guardar. */
interface Obstaculo {
  r: Retangulo;
  margem: number;
}

function livre(r: Retangulo, obstaculos: readonly Obstaculo[]) {
  for (const o of obstaculos) if (sobrepoem(r, o.r, o.margem)) return false;
  return true;
}

/** Distância de um ponto a um retângulo (0 se estiver dentro). */
export function distanciaAoRetangulo(p: Ponto, r: Retangulo): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.largura));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.altura));
  return Math.hypot(dx, dy);
}

/** Quanto do retângulo sai da região (soma do que passa de cada lado). */
function fora(r: Retangulo, regiao: Retangulo | null): number {
  if (!regiao) return 0;
  return (
    Math.max(0, regiao.x - r.x) +
    Math.max(0, r.x + r.largura - (regiao.x + regiao.largura)) +
    Math.max(0, regiao.y - r.y) +
    Math.max(0, r.y + r.altura - (regiao.y + regiao.altura))
  );
}

interface Parametros {
  margem: number;
  pino: number;
  raio: number;
  regiao: Retangulo | null;
  pesoFora: number;
}

interface Forma {
  largura: number;
  altura: number;
  partes: readonly Retangulo[];
  custoExtra: number;
}

interface Item {
  chave: string;
  indice: number;
  pontos: Ponto[];
  formas: Forma[];
  /** Centro dos pontos (arredondado). */
  ref: Ponto;
}

/** Distâncias de cada ponto à sua parte do bloco (ou ao bloco, se a forma não tiver partes). */
function distancias(r: Retangulo, item: Item, forma: Forma): number[] {
  return item.pontos.map((pt, i) => {
    const c = forma.partes[i];
    return distanciaAoRetangulo(pt, c ? { ...c, x: r.x + c.x, y: r.y + c.y } : r);
  });
}

function custo(r: Retangulo, item: Item, forma: Forma, p: Parametros): number {
  const { ref } = item;
  const ds = distancias(r, item, forma);
  const d = ds.reduce((t, x) => t + x, 0) / Math.max(1, ds.length);
  const porBaixo = r.y >= ref.y ? CUSTO_POR_BAIXO : 0;
  const deLado = r.y < ref.y && r.y + r.altura > ref.y ? CUSTO_DE_LADO : 0;
  const descentrado = Math.abs(r.x + r.largura / 2 - ref.x) * CUSTO_DESCENTRADO;
  return d + porBaixo + deLado + descentrado + p.pesoFora * fora(r, p.regiao) + forma.custoExtra;
}

interface Candidato {
  r: Retangulo;
  forma: number;
  c: number;
}

/** Candidatos de uma forma: cada coordenada centrada, junto de uma parte, ou encostada a um obstáculo. */
function candidatosDaForma(
  item: Item,
  k: number,
  obstaculos: readonly Obstaculo[],
  p: Parametros,
): Candidato[] {
  const forma = item.formas[k] as Forma;
  const { largura, altura } = forma;
  const { ref } = item;
  const xs = new Set<number>([ref.x - Math.floor(largura / 2)]);
  const ys = new Set<number>([ref.y - Math.floor(altura / 2)]);
  // Cada ponto junto da sua parte: centrado nela ou encostado às suas bordas.
  item.pontos.forEach((pt, i) => {
    const c = forma.partes[i];
    if (!c) return;
    for (const dx of [c.largura / 2, 0, c.largura]) xs.add(Math.round(pt.x - c.x - dx));
    for (const dy of [c.altura / 2, 0, c.altura]) ys.add(Math.round(pt.y - c.y - dy));
  });
  for (const { r, margem } of obstaculos) {
    xs.add(r.x - margem - largura);
    xs.add(r.x + r.largura + margem);
    ys.add(r.y - margem - altura);
    ys.add(r.y + r.altura + margem);
  }
  if (p.regiao) {
    xs.add(p.regiao.x);
    xs.add(p.regiao.x + p.regiao.largura - largura);
    ys.add(p.regiao.y);
    ys.add(p.regiao.y + p.regiao.altura - altura);
  }
  const candidatos: Candidato[] = [];
  for (const x of xs) {
    for (const y of ys) {
      const r = { x, y, largura, altura };
      candidatos.push({ r, forma: k, c: custo(r, item, forma, p) });
    }
  }
  return candidatos;
}

function melhorPosicao(item: Item, obstaculos: readonly Obstaculo[], p: Parametros): Candidato {
  const candidatos = item.formas.flatMap((_, k) => candidatosDaForma(item, k, obstaculos, p));
  candidatos.sort((a, b) => a.c - b.c || a.forma - b.forma || a.r.y - b.r.y || a.r.x - b.r.x);
  for (const c of candidatos) if (livre(c.r, obstaculos)) return c;
  // Nunca devia chegar aqui; por segurança, à direita de tudo.
  const forma = item.formas[0] as Forma;
  const direita = Math.max(...obstaculos.map((o) => o.r.x + o.r.largura + o.margem));
  const r = { x: direita, y: item.ref.y - Math.floor(forma.altura / 2), largura: forma.largura, altura: forma.altura };
  return { r, forma: 0, c: custo(r, item, forma, p) };
}

function compararTexto(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function quadrado(p: Ponto, raio: number): Retangulo {
  return { x: p.x - raio, y: p.y - raio, largura: 2 * raio, altura: 2 * raio };
}

interface Resultado {
  caixas: CaixaColocada[];
  custo: number;
}

/** Coloca os blocos um a um, por esta ordem. */
function colocarPorOrdem(itens: readonly Item[], ordem: readonly number[], p: Parametros): Resultado {
  const colocadas: Obstaculo[] = [];
  const caixas = new Array<CaixaColocada>(itens.length);
  let total = 0;
  for (const i of ordem) {
    const item = itens[i] as Item;
    // O próprio ponto fica a pino px do bloco; os dos outros ficam à vista.
    const pontos: Obstaculo[] = item.pontos.map((pt) => ({ r: quadrado(pt, p.pino), margem: 0 }));
    for (const outro of itens) {
      if (outro.indice === i) continue;
      for (const pt of outro.pontos) {
        if (item.pontos.some((q) => q.x === pt.x && q.y === pt.y)) continue;
        pontos.push({ r: quadrado(pt, p.raio), margem: 0 });
      }
    }
    const escolhido = melhorPosicao(item, [...colocadas, ...pontos], p);
    const { r } = escolhido;
    colocadas.push({ r, margem: p.margem });
    total += escolhido.c;
    const afastamento = Math.max(...distancias(r, item, item.formas[escolhido.forma] as Forma));
    caixas[i] = {
      ...r,
      chave: item.chave,
      pontos: item.pontos,
      forma: escolhido.forma,
      afastamento,
      deslocada: afastamento > p.pino + 1,
    };
  }
  return { caixas, custo: total };
}

/** Um bloco a mais do que isto do seu local é candidato a ser colocado mais cedo. */
const AFASTAMENTO_A_REPARAR = 24;
const MAXIMO_REPARACOES = 6;

/**
 * Devolve os blocos pela mesma ordem da entrada, já colocados.
 * Primeiro os maiores; depois tenta reparar: o bloco que ficou mais longe do seu local passa para o
 * início da ordem e fica a nova disposição se o custo total baixar.
 */
export function colocarBlocos(caixas: readonly CaixaAColocar[], opcoes: OpcoesColocacao = {}): CaixaColocada[] {
  const p: Parametros = {
    margem: opcoes.margem ?? MARGEM_COLISAO,
    pino: opcoes.pino ?? PINO,
    raio: opcoes.raioPontos ?? RAIO_PONTOS,
    regiao: opcoes.regiao ?? null,
    pesoFora: opcoes.pesoFora ?? PESO_FORA,
  };
  const itens: Item[] = caixas.map((caixa, indice) => {
    const pontos = caixa.pontos.map((pt) => ({ x: Math.round(pt.x), y: Math.round(pt.y) }));
    const n = Math.max(1, pontos.length);
    const ref = {
      x: Math.round(pontos.reduce((t, pt) => t + pt.x, 0) / n),
      y: Math.round(pontos.reduce((t, pt) => t + pt.y, 0) / n),
    };
    const formas = caixa.formas.map((f) => ({
      largura: Math.round(f.largura),
      altura: Math.round(f.altura),
      partes: (f.partes ?? []).map((r) => ({
        x: Math.round(r.x),
        y: Math.round(r.y),
        largura: Math.round(r.largura),
        altura: Math.round(r.altura),
      })),
      custoExtra: f.custoExtra ?? 0,
    }));
    if (formas.length === 0) throw new Error(`O bloco ${caixa.chave} não tem formas.`);
    return { chave: caixa.chave, indice, pontos, formas, ref };
  });
  const area = (it: Item) => (it.formas[0] as Forma).largura * (it.formas[0] as Forma).altura;
  let ordem = [...itens]
    .sort((a, b) => area(b) - area(a) || compararTexto(a.chave, b.chave))
    .map((it) => it.indice);

  let melhor = colocarPorOrdem(itens, ordem, p);
  const promovidos = new Set<number>();
  for (let n = 0; n < MAXIMO_REPARACOES; n++) {
    let pior = -1;
    let piorAfastamento = AFASTAMENTO_A_REPARAR;
    melhor.caixas.forEach((c, i) => {
      if (!promovidos.has(i) && c.afastamento > piorAfastamento) {
        pior = i;
        piorAfastamento = c.afastamento;
      }
    });
    if (pior < 0) break;
    promovidos.add(pior);
    const novaOrdem = [pior, ...ordem.filter((i) => i !== pior)];
    const tentativa = colocarPorOrdem(itens, novaOrdem, p);
    if (tentativa.custo < melhor.custo) {
      melhor = tentativa;
      ordem = novaOrdem;
    }
  }
  return melhor.caixas;
}
