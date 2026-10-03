// Colocação dos blocos de cartões no mapa: cada bloco fica AGARRADO ao seu local, com um pino curto
// (o ponto exato da morada fica à vista, a PINO px de uma casa do bloco), e nenhum bloco se sobrepõe a
// outro nem tapa o ponto de outro local. Determinística:
// 1. Custo de um bloco numa posição = distância do ponto à casa (ou ao rótulo com o nome do local)
//    mais perto (PINO quando está encostado: por cima, por baixo ou ao lado) + o afastamento entre o
//    ponto e o centro do bloco (um bloco pendurado para um lado afasta os cartões do sítio real) + o
//    rótulo longe do ponto + uma pequena preferência por ficar por cima + ficar do lado de um ponto
//    vizinho (dois pontos quase no mesmo sítio do ecrã: cada bloco do seu lado) + o custo da forma
//    (arrumações diferentes dos mesmos cartões). O que se minimiza é a soma desses custos mais o que a
//    caixa de tudo (pontos e blocos) passa do tamanho do ecrã.
//    Um bloco com `lado` (locais vizinhos lado a lado, ex.: as duas ruas de Himeling) só pode ficar desse
//    lado de uma vertical e à altura do seu ponto: nunca um vizinho por cima e o outro por baixo. E fica
//    virado como o bloco do outro lado, se já estiver posto (os dois a descer dos pontos, ou a subir).
//    Fica encostado ao seu ponto sempre que houver sítio, mesmo que o conjunto passe mais do ecrã, e os
//    dois do par põem-se juntos, na orientação em que ficam os dois encostados (colocarPorOrdem, porPar):
//    afastados, outro bloco metia-se entre os dois vizinhos.
// 2. Gulosa: os blocos põem-se um a um, cada um na posição livre de menor custo. A procura é exata: a
//    zona proibida para o canto de um bloco é uma união de retângulos (blocos já postos alargados pela
//    margem, pontos dos locais); o melhor ponto livre tem cada coordenada centrada, alinhada com uma
//    casa, encostada a um obstáculo ou no limite do ecrã, por isso basta testar essa grelha de
//    candidatos por ordem de custo. Há sempre uma posição livre (fora de tudo).
// 3. Antecipação: ocupar o sítio ideal (o que teria sozinho) de um bloco que ainda falta pôr custa;
//    assim um bloco grande não cerca o ponto de um pequeno.
// 4. Experimentam-se três ordens (os maiores primeiro, de norte para sul, de sul para norte) e fica a
//    melhor; depois, melhoria local: o bloco que custa mais sai com os vizinhos e voltam a pôr-se.
// 5. Com blocos fixos (modo de edição: a disposição anterior), esses ficam onde estavam e só os outros
//    procuram sítio, à volta deles (o mapa não salta quando uma casa cresce uma linha).
// Tudo em píxeis inteiros, para os encostos serem exatos.

import { type Retangulo, sobrepoem, uniao } from './geometria';
import type { Ponto } from './projecao';

/** Espaço mínimo entre dois blocos, em píxeis. */
export const MARGEM_COLISAO = 6;
/** Distância entre o ponto do local e o seu bloco (o "pino"). */
export const PINO = 7;
/** Raio à volta do ponto de cada local que nenhum outro bloco pode tapar. */
export const RAIO_PONTOS = 6;

/** Preferências (em píxeis de distância): por cima é o melhor. */
const CUSTO_POR_BAIXO = 2;
const CUSTO_DE_LADO = 3;
/** Custo por píxel entre o ponto e o centro do bloco. */
const PESO_DISPERSAO = 0.1;
/** Custo por píxel que o conjunto passa do tamanho do ecrã (obriga a baixar o zoom). */
const PESO_FORA = 2;
/** Custo por píxel entre o ponto e o rótulo do local (o nome fica junto do sítio). */
const PESO_ROTULO = 0.05;
/** Dois pontos a menos do que isto (px) são vizinhos: cada bloco fica do seu lado. */
const DISTANCIA_VIZINHO = 40;
/**
 * Custo de um bloco ficar do lado do ponto vizinho: com dois pontos quase no mesmo sítio do ecrã, o bloco
 * de cada um fica do lado oposto ao outro, em vez de se trocarem. Não conta para os blocos com `lado`
 * (esses já têm o lado certo à força).
 */
const CUSTO_LADO_DO_VIZINHO = 15;

export interface OpcoesColocacao {
  margem?: number;
  pino?: number;
  raioPontos?: number;
  /**
   * Tamanho máximo do conjunto (o mapa no ecrã, menos as folgas): cada píxel que a caixa de tudo
   * (pontos e blocos) passa dele custa pesoFora. null = sem limite (o conjunto já não cabe no ecrã).
   */
  ecra?: { largura: number; altura: number } | null;
  pesoFora?: number;
  pesoDispersao?: number;
  /**
   * Blocos que ficam exatamente onde estavam (canto e forma), por chave: só os outros (os que mudaram de
   * tamanho, os novos) procuram sítio, à volta deles. É o modo de edição: largar alguém numa casa cheia
   * faz crescer essa casa, e o resto do mapa não deve saltar. Um bloco fixo que tape o ponto de um bloco
   * que não estava lá antes volta a procurar sítio.
   */
  fixos?: ReadonlyMap<string, { x: number; y: number; forma: number }> | null;
}

/** Uma arrumação possível do bloco. */
export interface FormaBloco {
  largura: number;
  altura: number;
  /**
   * As partes do bloco que pertencem a cada ponto (relativas ao canto do bloco), pela ordem dos
   * pontos: os cartões principais do local (as casas) e o rótulo com o nome do local. A distância
   * conta-se de cada ponto à parte mais perto: o pino chega mesmo a uma casa ou ao nome (não a uma
   * carrinha nem a um canto vazio do bloco). Sem partes, conta o bloco inteiro.
   */
  partes?: readonly (readonly Retangulo[])[];
  /**
   * O rótulo (nome do local) de cada ponto, se houver: prefere-se o rótulo junto do ponto, como num
   * mapa (desempata, por exemplo, entre o rótulo em cima ou em baixo do bloco).
   */
  rotulos?: readonly (Retangulo | null)[];
  /** Custo (px) de usar esta forma em vez da preferida. */
  custoExtra?: number;
}

/**
 * Lado obrigatório de um bloco: 'esquerda' = o bloco acaba antes da vertical `x`; 'direita' = começa
 * depois dela. Além disso, os pontos do bloco ficam à altura dele: na linha do rótulo, se tiver um (o nome
 * do sítio mesmo ao lado do ponto), ou entre o topo e o fundo.
 */
export interface LadoBloco {
  lado: 'esquerda' | 'direita';
  x: number;
  /** Chave do bloco do outro lado: os dois ficam virados para o mesmo lado (a descer ou a subir). */
  par?: string | null;
}

export interface CaixaAColocar {
  chave: string;
  /** Pontos dos locais deste bloco (um, ou vários locais juntos). */
  pontos: readonly Ponto[];
  /** Formas possíveis, a preferida primeiro (pelo menos uma). */
  formas: readonly FormaBloco[];
  /** Locais vizinhos lado a lado (ex.: as duas ruas de Himeling): o lado do bloco, à força. */
  lado?: LadoBloco | null;
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

interface Parametros {
  margem: number;
  pino: number;
  raio: number;
  ecra: { largura: number; altura: number } | null;
  pesoFora: number;
  pesoDispersao: number;
}

/** Quanto a caixa passa do tamanho do ecrã (largura + altura a mais). */
function excesso(caixa: Retangulo | null, p: Parametros): number {
  if (!caixa || !p.ecra) return 0;
  return Math.max(0, caixa.largura - p.ecra.largura) + Math.max(0, caixa.altura - p.ecra.altura);
}

interface Forma {
  largura: number;
  altura: number;
  partes: readonly (readonly Retangulo[])[];
  rotulos: readonly (Retangulo | null)[];
  custoExtra: number;
}

interface Item {
  chave: string;
  indice: number;
  pontos: Ponto[];
  formas: Forma[];
  /** Centro dos pontos (arredondado). */
  ref: Ponto;
  /** O ponto de outro bloco muito perto deste no ecrã, se houver (só para os blocos sem `lado`). */
  vizinho: Ponto | null;
  lado: LadoBloco | null;
  /** Índice do bloco do outro lado (`lado.par`), se houver. */
  par: number | null;
}

/**
 * Para onde fica virado o bloco: a descer do ponto (1, com o rótulo em cima), a subir (-1, com o rótulo em
 * baixo) ou, sem rótulo, centrado no ponto (0) ou para o lado onde está o centro.
 */
function orientacao(item: Item, forma: Forma, y: number): number {
  const rotulo = forma.rotulos.find((r) => r !== null);
  if (rotulo) return rotulo.y + rotulo.altura / 2 < forma.altura / 2 ? 1 : -1;
  const d = y + forma.altura / 2 - item.ref.y;
  return Math.abs(d) < forma.altura / 6 ? 0 : Math.sign(d);
}

/**
 * O bloco com o canto em (x, y) está do seu lado (se tiver um) e à altura dos seus pontos: com rótulo, o
 * ponto fica à altura do rótulo (o nome do sítio mesmo ao lado do ponto); sem rótulo, à altura do bloco.
 */
function noLado(item: Item, forma: Forma, x: number, y: number): boolean {
  const { lado } = item;
  if (!lado) return true;
  if (lado.lado === 'esquerda' ? x + forma.largura > lado.x : x < lado.x) return false;
  return item.pontos.every((pt, i) => {
    const r = forma.rotulos[i] ?? { y: 0, altura: forma.altura };
    return pt.y >= y + r.y && pt.y <= y + r.y + r.altura;
  });
}

/** Distância de um ponto ao retângulo (x, y, largura, altura), sem criar objetos. */
function distanciaXY(px: number, py: number, x: number, y: number, largura: number, altura: number): number {
  const dx = Math.max(x - px, 0, px - (x + largura));
  const dy = Math.max(y - py, 0, py - (y + altura));
  return Math.hypot(dx, dy);
}

/** Distância do ponto i à parte mais perto do bloco (ou ao bloco, se não tiver partes). */
function distanciaDoPonto(item: Item, forma: Forma, i: number, x: number, y: number): number {
  const pt = item.pontos[i] as Ponto;
  const partes = forma.partes[i];
  if (!partes || partes.length === 0) return distanciaXY(pt.x, pt.y, x, y, forma.largura, forma.altura);
  let d = Number.POSITIVE_INFINITY;
  for (const c of partes) d = Math.min(d, distanciaXY(pt.x, pt.y, x + c.x, y + c.y, c.largura, c.altura));
  return d;
}

/** Todos os pontos do bloco com o canto em (x, y) ficam à distância do pino (o bloco encostado a eles). */
function encostado(item: Item, forma: Forma, x: number, y: number, p: Parametros): boolean {
  for (let i = 0; i < item.pontos.length; i++)
    if (distanciaDoPonto(item, forma, i, x, y) > p.pino + 1) return false;
  return true;
}

/** O que já está colocado: a caixa de tudo (pontos e blocos) e quanto ela passa do ecrã. */
interface Conjunto {
  caixa: Retangulo | null;
  excesso: number;
  /**
   * Onde ficariam os blocos que ainda faltam pôr, se estivessem sozinhos. Ocupar esses sítios custa
   * (PESO_RESERVA por sítio inteiro): um bloco grande não cerca o ponto de um pequeno que vem depois.
   */
  reservas?: readonly Retangulo[];
  /**
   * Orientação do bloco do outro lado (`lado.par`), se já estiver posto: este fica virado para o mesmo
   * lado (os dois a descer dos pontos, ou os dois a subir; nunca em diagonal).
   */
  orientacaoDoPar?: number;
}

/** Custo de ocupar por inteiro o sítio ideal de um bloco que ainda falta pôr. */
const PESO_RESERVA = 80;

function sobreposicao(x: number, y: number, largura: number, altura: number, r: Retangulo): number {
  const l = Math.min(x + largura, r.x + r.largura) - Math.max(x, r.x);
  const a = Math.min(y + altura, r.y + r.altura) - Math.max(y, r.y);
  return l > 0 && a > 0 ? l * a : 0;
}

/** Custo próprio de um bloco com o canto em (x, y) (sem o que o conjunto passa do ecrã). */
function custoProprio(x: number, y: number, item: Item, forma: Forma, p: Parametros): number {
  const { ref } = item;
  const { largura, altura } = forma;
  let d = 0;
  for (let i = 0; i < item.pontos.length; i++) d += distanciaDoPonto(item, forma, i, x, y);
  d /= Math.max(1, item.pontos.length);
  // Um bloco com lado está sempre de lado: nem por cima nem por baixo contam.
  const porBaixo = !item.lado && y >= ref.y ? CUSTO_POR_BAIXO : 0;
  const deLado = !item.lado && y < ref.y && y + altura > ref.y ? CUSTO_DE_LADO : 0;
  const disperso = Math.hypot(x + largura / 2 - ref.x, y + altura / 2 - ref.y) * p.pesoDispersao;
  let rotulo = 0;
  forma.rotulos.forEach((r, i) => {
    const pt = item.pontos[i];
    if (r && pt) rotulo += PESO_ROTULO * distanciaXY(pt.x, pt.y, x + r.x, y + r.y, r.largura, r.altura);
  });
  let ladoErrado = 0;
  if (item.vizinho) {
    const vx = item.vizinho.x - ref.x;
    const vy = item.vizinho.y - ref.y;
    if ((x + largura / 2 - ref.x) * vx + (y + altura / 2 - ref.y) * vy > 0)
      ladoErrado = CUSTO_LADO_DO_VIZINHO;
  }
  return d + porBaixo + deLado + disperso + rotulo + ladoErrado + forma.custoExtra;
}

/** O que custa juntar o bloco ao conjunto: o custo próprio e o que o conjunto passa a ter a mais. */
function custo(x: number, y: number, item: Item, forma: Forma, conjunto: Conjunto, p: Parametros): number {
  let fora = 0;
  const c = conjunto.caixa;
  if (c && p.ecra) {
    const largura = Math.max(c.x + c.largura, x + forma.largura) - Math.min(c.x, x);
    const altura = Math.max(c.y + c.altura, y + forma.altura) - Math.min(c.y, y);
    const novo = Math.max(0, largura - p.ecra.largura) + Math.max(0, altura - p.ecra.altura);
    fora = p.pesoFora * (novo - conjunto.excesso);
  }
  let reserva = 0;
  for (const r of conjunto.reservas ?? []) {
    reserva += (PESO_RESERVA * sobreposicao(x, y, forma.largura, forma.altura, r)) / (r.largura * r.altura);
  }
  return custoProprio(x, y, item, forma, p) + fora + reserva;
}

interface Candidato {
  r: Retangulo;
  forma: number;
  c: number;
}

/**
 * Coordenadas candidatas de uma forma: cada uma centrada no ponto, junto de uma parte, encostada a
 * um obstáculo ou no limite em que o conjunto ainda cabe no ecrã.
 */
function coordenadas(
  item: Item,
  forma: Forma,
  geradores: readonly Obstaculo[],
  conjunto: Conjunto,
  p: Parametros,
): { xs: number[]; ys: number[] } {
  const { largura, altura } = forma;
  const { ref } = item;
  const xs = new Set<number>([ref.x - Math.floor(largura / 2)]);
  const ys = new Set<number>([ref.y - Math.floor(altura / 2)]);
  // Cada ponto junto de cada uma das suas partes: centrado nela ou encostado às suas bordas.
  item.pontos.forEach((pt, i) => {
    for (const c of forma.partes[i] ?? []) {
      for (const dx of [c.largura / 2, 0, c.largura]) xs.add(Math.round(pt.x - c.x - dx));
      for (const dy of [c.altura / 2, 0, c.altura]) ys.add(Math.round(pt.y - c.y - dy));
    }
  });
  for (const { r, margem } of geradores) {
    xs.add(r.x - margem - largura);
    xs.add(r.x + r.largura + margem);
    ys.add(r.y - margem - altura);
    ys.add(r.y + r.altura + margem);
  }
  const c = conjunto.caixa;
  if (c && p.ecra) {
    xs.add(Math.round(c.x + c.largura - p.ecra.largura));
    xs.add(Math.round(c.x + p.ecra.largura - largura));
    ys.add(Math.round(c.y + c.altura - p.ecra.altura));
    ys.add(Math.round(c.y + p.ecra.altura - altura));
  }
  // Encostado à vertical do seu lado.
  if (item.lado) xs.add(item.lado.lado === 'esquerda' ? item.lado.x - largura : item.lado.x);
  return { xs: [...xs], ys: [...ys] };
}

/** Os índices cabem nos 20 bits de baixo da chave de ordenação (custo em milésimos nos de cima). */
const BITS_INDICE = 2 ** 20;

/**
 * A posição livre de menor custo. Os candidatos ordenam-se por uma chave numérica (custo e ordem de
 * criação) num Float64Array, muito mais rápido do que ordenar objetos; empates pela ordem de criação.
 */
function melhorPosicao(
  item: Item,
  obstaculos: readonly Obstaculo[],
  conjunto: Conjunto,
  p: Parametros,
): Candidato {
  const encontrada = procurarPosicao(item, obstaculos, conjunto, p, false);
  if (encontrada) return encontrada;
  // Nunca devia chegar aqui; por segurança, fora de tudo (do seu lado, se tiver um).
  const forma = item.formas[0] as Forma;
  const r = {
    x:
      item.lado?.lado === 'esquerda'
        ? Math.min(item.lado.x, ...obstaculos.map((o) => o.r.x - o.margem)) - forma.largura
        : Math.max(item.lado?.x ?? 0, ...obstaculos.map((o) => o.r.x + o.r.largura + o.margem)),
    y: item.ref.y - Math.floor(forma.altura / 2),
    largura: forma.largura,
    altura: forma.altura,
  };
  return { r, forma: 0, c: custo(r.x, r.y, item, forma, conjunto, p) };
}

/**
 * A procura de melhorPosicao. `soEncostado`: só posições com o bloco encostado aos seus pontos (null se
 * não houver nenhuma livre).
 */
function procurarPosicao(
  item: Item,
  obstaculos: readonly Obstaculo[],
  conjunto: Conjunto,
  p: Parametros,
  soEncostado: boolean,
): Candidato | null {
  // Primeiro só com os obstáculos perto do ponto (as posições longe custam mais do que qualquer
  // posição livre perto); se nenhuma servir, com todos.
  const alcance = Math.max(...item.formas.map((f) => f.largura + f.altura)) + 4 * p.pino;
  const perto = obstaculos.filter((o) => distanciaAoRetangulo(item.ref, o.r) < alcance + o.margem);
  for (const geradores of perto.length < obstaculos.length ? [perto, obstaculos] : [obstaculos]) {
    const grelhas = item.formas.map((f) => coordenadas(item, f, geradores, conjunto, p));
    const total = grelhas.reduce((t, g) => t + g.xs.length * g.ys.length, 0);
    const cx = new Float64Array(total);
    const cy = new Float64Array(total);
    const cf = new Uint16Array(total);
    const chaves = new Float64Array(total);
    let n = 0;
    grelhas.forEach((g, k) => {
      const forma = item.formas[k] as Forma;
      for (const x of g.xs) {
        for (const y of g.ys) {
          const valor = Math.max(0, Math.round(custo(x, y, item, forma, conjunto, p) * 1000));
          cx[n] = x;
          cy[n] = y;
          cf[n] = k;
          chaves[n] = valor * BITS_INDICE + n;
          n++;
        }
      }
    });
    chaves.sort();
    // Um bloco com lado (locais vizinhos) fica encostado ao seu ponto sempre que houver sítio livre, mesmo
    // que o conjunto passe mais do ecrã: afastado para o lado, outro bloco metia-se entre os dois vizinhos
    // e o nome da rua ficava longe do ponto (ex.: só carrinhas, um passo de zoom acima da vista inicial).
    const passagens = soEncostado ? [true] : item.lado ? [true, false] : [false];
    for (const encostar of passagens) {
      for (const chave of chaves) {
        const i = chave % BITS_INDICE;
        const forma = item.formas[cf[i] as number] as Forma;
        const r = { x: cx[i] as number, y: cy[i] as number, largura: forma.largura, altura: forma.altura };
        if (encostar && !encostado(item, forma, r.x, r.y, p)) continue;
        const virado =
          !conjunto.orientacaoDoPar || orientacao(item, forma, r.y) * conjunto.orientacaoDoPar >= 0;
        if (virado && noLado(item, forma, r.x, r.y) && livre(r, obstaculos))
          return { r, forma: cf[i] as number, c: custo(r.x, r.y, item, forma, conjunto, p) };
      }
    }
  }
  return null;
}

function compararTexto(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function quadrado(p: Ponto, raio: number): Retangulo {
  return { x: p.x - raio, y: p.y - raio, largura: 2 * raio, altura: 2 * raio };
}

/** Onde ficou cada bloco (índice da entrada). */
interface Colocacao {
  r: Retangulo;
  forma: number;
  /** Custo próprio (sem o excesso do conjunto). */
  custo: number;
}

/** Caixa dos pontos de todos os locais: aparecem sempre, por isso a caixa de tudo começa por eles. */
function caixaDosPontos(itens: readonly Item[], p: Parametros): Retangulo[] {
  const caixa = uniao(itens.flatMap((it) => it.pontos.map((pt) => quadrado(pt, p.raio))));
  return caixa ? [caixa] : [];
}

/** O que se quer minimizar: os custos próprios mais o que a caixa de tudo passa do ecrã. */
function objetivo(itens: readonly Item[], cols: readonly Colocacao[], p: Parametros): number {
  const caixa = uniao([...caixaDosPontos(itens, p), ...cols.map((c) => c.r)]);
  return cols.reduce((t, c) => t + c.custo, 0) + p.pesoFora * excesso(caixa, p);
}

/** Pontos que o bloco i não pode tapar: o próprio (fica a pino px) e os dos outros (ficam à vista). */
function pontosObstaculo(itens: readonly Item[], i: number, p: Parametros): Obstaculo[] {
  const item = itens[i] as Item;
  const pontos: Obstaculo[] = item.pontos.map((pt) => ({ r: quadrado(pt, p.pino), margem: 0 }));
  for (const outro of itens) {
    if (outro.indice === i) continue;
    for (const pt of outro.pontos) {
      if (item.pontos.some((q) => q.x === pt.x && q.y === pt.y)) continue;
      pontos.push({ r: quadrado(pt, p.raio), margem: 0 });
    }
  }
  return pontos;
}

/**
 * Os blocos da opção `fixos` que podem mesmo ficar onde estavam (com uma forma que existe, sem tapar o
 * ponto de nenhum bloco nem se sobrepor a outro fixo); os outros ficam undefined e procuram sítio.
 */
function blocosFixos(
  itens: readonly Item[],
  fixos: ReadonlyMap<string, { x: number; y: number; forma: number }> | null,
  p: Parametros,
): (Colocacao | undefined)[] {
  if (!fixos || fixos.size === 0) return [];
  const cols = itens.map((item): Colocacao | undefined => {
    const f = fixos.get(item.chave);
    const forma = f ? item.formas[f.forma] : undefined;
    if (!f || !forma) return undefined;
    const r = { x: Math.round(f.x), y: Math.round(f.y), largura: forma.largura, altura: forma.altura };
    return { r, forma: f.forma, custo: custoProprio(r.x, r.y, item, forma, p) };
  });
  return cols.map((c, i) => {
    const item = itens[i] as Item;
    if (!c || !noLado(item, item.formas[c.forma] as Forma, c.r.x, c.r.y)) return undefined;
    const outros = cols.flatMap((o, j) => (o && j !== i ? [{ r: o.r, margem: p.margem }] : []));
    return livre(c.r, [...pontosObstaculo(itens, i, p), ...outros]) ? c : undefined;
  });
}

/** Coloca, por esta ordem, os blocos que ainda não têm sítio; os de `fixas` ficam onde estão. */
function colocarPorOrdem(
  itens: readonly Item[],
  ordem: readonly number[],
  p: Parametros,
  fixas: readonly (Colocacao | undefined)[] = [],
  ideais: readonly (Retangulo | undefined)[] = [],
): Colocacao[] {
  const cols: (Colocacao | undefined)[] = itens.map((_, i) => fixas[i]);
  const colocadas: Obstaculo[] = cols.flatMap((c) => (c ? [{ r: c.r, margem: p.margem }] : []));
  let caixa = uniao([...caixaDosPontos(itens, p), ...colocadas.map((o) => o.r)]);
  // Os sítios ideais dos que ainda faltam, tirando estes (os já postos e os fixos não contam).
  const reservasSem = (...fora: number[]) =>
    ordem.filter((j) => !fora.includes(j) && !cols[j] && ideais[j]).map((j) => ideais[j] as Retangulo);
  const conjuntoAtual = (reservas: readonly Retangulo[], orientacaoDoPar: number): Conjunto => ({
    caixa,
    excesso: excesso(caixa, p),
    reservas,
    orientacaoDoPar,
  });
  const por = (i: number, escolhido: Candidato) => {
    const { r } = escolhido;
    colocadas.push({ r, margem: p.margem });
    caixa = caixa ? uniao([caixa, r]) : r;
    const item = itens[i] as Item;
    const forma = item.formas[escolhido.forma] as Forma;
    cols[i] = { r, forma: escolhido.forma, custo: custoProprio(r.x, r.y, item, forma, p) };
  };
  /**
   * Os dois blocos de locais vizinhos (lado a lado) põem-se juntos: os dois a descer dos pontos ou os dois a
   * subir, cada um encostado ao seu ponto, na orientação mais barata. Um a um, o primeiro escolhia a
   * orientação sozinho e o segundo podia já não ter sítio junto do seu ponto nessa orientação (ficava
   * afastado, com outro bloco no meio). Devolve false se em nenhuma orientação os dois ficarem encostados.
   */
  const porPar = (a: number, b: number): boolean => {
    let melhor: [Candidato, Candidato] | null = null;
    for (const orientacaoDoPar of [1, -1]) {
      const reservas = reservasSem(a, b);
      const ca = procurarPosicao(
        itens[a] as Item,
        [...colocadas, ...pontosObstaculo(itens, a, p)],
        conjuntoAtual(reservas, orientacaoDoPar),
        p,
        true,
      );
      if (!ca) continue;
      const caixaComA = caixa ? uniao([caixa, ca.r]) : ca.r;
      const cb = procurarPosicao(
        itens[b] as Item,
        [...colocadas, { r: ca.r, margem: p.margem }, ...pontosObstaculo(itens, b, p)],
        { caixa: caixaComA, excesso: excesso(caixaComA, p), reservas, orientacaoDoPar },
        p,
        true,
      );
      if (cb && (!melhor || ca.c + cb.c < melhor[0].c + melhor[1].c)) melhor = [ca, cb];
    }
    if (!melhor) return false;
    por(a, melhor[0]);
    por(b, melhor[1]);
    return true;
  };
  for (const i of ordem) {
    if (cols[i]) continue;
    const item = itens[i] as Item;
    const j = item.par;
    if (item.lado && j !== null && !cols[j] && (itens[j] as Item).lado && porPar(i, j)) continue;
    const par = j !== null ? (itens[j] as Item) : undefined;
    const doPar = j !== null ? cols[j] : undefined;
    const orientacaoDoPar = par && doPar ? orientacao(par, par.formas[doPar.forma] as Forma, doPar.r.y) : 0;
    por(
      i,
      melhorPosicao(
        item,
        [...colocadas, ...pontosObstaculo(itens, i, p)],
        conjuntoAtual(reservasSem(i), orientacaoDoPar),
        p,
      ),
    );
  }
  return cols as Colocacao[];
}

/** Um bloco que custe mais do que isto (px) tenta arrumar-se melhor com os vizinhos. */
const CUSTO_A_MELHORAR = 30;
const MAXIMO_MELHORIAS = 8;

/**
 * Melhoria local ("tirar e voltar a pôr"): o bloco que custa mais sai com os vizinhos (os blocos perto
 * do seu ponto) e voltam todos a pôr-se, ele primeiro. Fica assim se o objetivo baixar. Resolve o caso
 * de um bloco pequeno cujo ponto ficou cercado por blocos grandes que se podiam ter arrumado de outra
 * maneira.
 */
function melhorar(
  itens: readonly Item[],
  inicial: Colocacao[],
  p: Parametros,
  ideais: readonly (Retangulo | undefined)[],
): Colocacao[] {
  let cols = inicial;
  let atual = objetivo(itens, cols, p);
  const tentados = new Set<number>();
  for (let n = 0; n < MAXIMO_MELHORIAS; n++) {
    let pior = -1;
    cols.forEach((c, i) => {
      if (tentados.has(i) || c.custo <= CUSTO_A_MELHORAR) return;
      const atualPior = cols[pior];
      if (
        !atualPior ||
        c.custo > atualPior.custo ||
        (c.custo === atualPior.custo &&
          compararTexto((itens[i] as Item).chave, (itens[pior] as Item).chave) < 0)
      ) {
        pior = i;
      }
    });
    if (pior < 0) break;
    tentados.add(pior);
    const item = itens[pior] as Item;
    const forma0 = item.formas[0] as Forma;
    const raio = Math.max(forma0.largura, forma0.altura) + 4 * p.pino;
    const vizinhos = cols
      .map((c, i) => ({ i, d: distanciaAoRetangulo(item.ref, c.r) }))
      .filter(({ i, d }) => i !== pior && d < raio)
      .sort((a, b) => a.d - b.d || compararTexto((itens[a.i] as Item).chave, (itens[b.i] as Item).chave))
      .map(({ i }) => i);
    const tirados = new Set([pior, ...vizinhos]);
    const fixas = cols.map((c, i) => (tirados.has(i) ? undefined : c));
    const tentativa = colocarPorOrdem(itens, [pior, ...vizinhos], p, fixas, ideais);
    const valor = objetivo(itens, tentativa, p);
    if (valor < atual - 1e-6) {
      cols = tentativa;
      atual = valor;
    }
  }
  return cols;
}

/** Devolve os blocos pela mesma ordem da entrada, já colocados. */
export function colocarBlocos(
  caixas: readonly CaixaAColocar[],
  opcoes: OpcoesColocacao = {},
): CaixaColocada[] {
  const p: Parametros = {
    margem: opcoes.margem ?? MARGEM_COLISAO,
    pino: opcoes.pino ?? PINO,
    raio: opcoes.raioPontos ?? RAIO_PONTOS,
    ecra: opcoes.ecra ?? null,
    pesoFora: opcoes.pesoFora ?? PESO_FORA,
    pesoDispersao: opcoes.pesoDispersao ?? PESO_DISPERSAO,
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
      partes: (f.partes ?? []).map((lista) =>
        lista.map((r) => ({
          x: Math.round(r.x),
          y: Math.round(r.y),
          largura: Math.round(r.largura),
          altura: Math.round(r.altura),
        })),
      ),
      rotulos: (f.rotulos ?? []).map((r) =>
        r
          ? {
              x: Math.round(r.x),
              y: Math.round(r.y),
              largura: Math.round(r.largura),
              altura: Math.round(r.altura),
            }
          : null,
      ),
      custoExtra: f.custoExtra ?? 0,
    }));
    if (formas.length === 0) throw new Error(`O bloco ${caixa.chave} não tem formas.`);
    const lado = caixa.lado
      ? { lado: caixa.lado.lado, x: Math.round(caixa.lado.x), par: caixa.lado.par ?? null }
      : null;
    return {
      chave: caixa.chave,
      indice,
      pontos,
      formas,
      ref,
      vizinho: null as Ponto | null,
      lado,
      par: null,
    };
  });
  if (itens.length === 0) return [];
  const porChave = new Map(itens.map((it) => [it.chave, it.indice]));
  for (const item of itens) {
    const par = item.lado?.par ? porChave.get(item.lado.par) : undefined;
    item.par = par ?? null;
  }
  for (const item of itens) {
    if (item.lado) continue;
    let melhor = DISTANCIA_VIZINHO;
    for (const outro of itens) {
      if (outro === item) continue;
      const d = Math.hypot(outro.ref.x - item.ref.x, outro.ref.y - item.ref.y);
      if (d > 0 && d < melhor) {
        melhor = d;
        item.vizinho = outro.ref;
      }
    }
  }

  const area = (it: Item) => (it.formas[0] as Forma).largura * (it.formas[0] as Forma).altura;
  const desempate = (a: Item, b: Item) => area(b) - area(a) || compararTexto(a.chave, b.chave);
  const ordens = [
    (a: Item, b: Item) => desempate(a, b),
    (a: Item, b: Item) => a.ref.y - b.ref.y || desempate(a, b),
    (a: Item, b: Item) => b.ref.y - a.ref.y || desempate(a, b),
  ].map((f) => [...itens].sort(f).map((it) => it.indice));

  const fixas = blocosFixos(itens, opcoes.fixos ?? null, p);
  // O sítio de cada bloco se estivesse sozinho (só com os pontos à volta); os fixos não precisam.
  const caixaPontos = uniao(caixaDosPontos(itens, p));
  const ideais = itens.map((item, i) =>
    fixas[i]
      ? undefined
      : melhorPosicao(
          item,
          pontosObstaculo(itens, i, p),
          { caixa: caixaPontos, excesso: excesso(caixaPontos, p) },
          p,
        ).r,
  );
  let colocadas: Colocacao[];
  if (fixas.some(Boolean)) {
    // Só os que não ficam fixos procuram sítio, dos maiores para os mais pequenos; sem a melhoria local,
    // que mexeria nos fixos.
    colocadas = colocarPorOrdem(itens, ordens[0] as number[], p, fixas, ideais);
  } else {
    let melhor: Colocacao[] = [];
    let melhorValor = Number.POSITIVE_INFINITY;
    for (const ordem of ordens) {
      const cols = colocarPorOrdem(itens, ordem, p, [], ideais);
      const valor = objetivo(itens, cols, p);
      if (valor < melhorValor) {
        melhor = cols;
        melhorValor = valor;
      }
    }
    colocadas = melhorar(itens, melhor, p, ideais);
  }

  return colocadas.map((c, i) => {
    const item = itens[i] as Item;
    const forma = item.formas[c.forma] as Forma;
    const afastamento = Math.max(
      ...item.pontos.map((_, k) => distanciaDoPonto(item, forma, k, c.r.x, c.r.y)),
    );
    return {
      ...c.r,
      chave: item.chave,
      pontos: item.pontos,
      forma: c.forma,
      afastamento,
      deslocada: afastamento > p.pino + 1,
    };
  });
}
