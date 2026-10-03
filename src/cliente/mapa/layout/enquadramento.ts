// Vista inicial: o zoom mais alto em que todos os cartões (já arrumados) cabem no mapa.
// Como o tamanho dos cartões depende do zoom (escala e resumo), experimenta-se zoom a zoom, de cima para baixo.

import { disporMapa, linhasChamada } from './disposicao';
import type { ModoMapa } from './escala';
import { centro, type Retangulo, uniao } from './geometria';
import type { GrupoNoMapa } from './grupos';
import { desprojetar, type LatLng, projetar } from './projecao';

export interface Margens {
  cima: number;
  baixo: number;
  esquerda: number;
  direita: number;
}

export interface OpcoesEnquadramento {
  /** Tamanho do mapa no ecrã, em píxeis. */
  largura: number;
  altura: number;
  zoomMinimo: number;
  zoomMaximo: number;
  /** Passo entre zooms experimentados (o zoomSnap do mapa). */
  passo: number;
  /** Espaço livre à volta, em píxeis (igual nos 4 lados ou um por lado). */
  margem: number | Margens;
  expandidos?: ReadonlySet<string>;
}

export interface Enquadramento {
  zoom: number;
  /** Centro do mapa (fica a meio do espaço livre entre as margens). */
  centro: LatLng;
  /** Tudo cabe no ecrã (senão fica o zoom mínimo). */
  cabe: boolean;
}

function margens(m: number | Margens): Margens {
  return typeof m === 'number' ? { cima: m, baixo: m, esquerda: m, direita: m } : m;
}

/** Pinos mais compridos do que isto (px) contam como "longe do local": tenta-se um zoom mais baixo. */
export const PINO_ACEITAVEL = 72;
/** Quanto se pode descer de zoom (abaixo do primeiro que cabe) à procura de pinos curtos. */
const DESCIDA_MAXIMA = 0.75;

interface Medida {
  caixa: Retangulo | null;
  modo: ModoMapa;
  /** O pino mais comprido (do ponto de um local ao cartão mais próximo desse local). */
  pinoMaximo: number;
}

function medir(
  grupos: readonly GrupoNoMapa[],
  zoom: number,
  largura: number,
  expandidos: ReadonlySet<string>,
  altura?: number,
): Medida {
  const d = disporMapa(grupos, { zoom, larguraMapa: largura, alturaMapa: altura, expandidos });
  const rets: Retangulo[] = [];
  for (const g of d.grupos) {
    rets.push({ x: g.x, y: g.y, largura: g.largura, altura: g.altura });
    for (const p of g.pontos) rets.push({ x: p.x, y: p.y, largura: 0, altura: 0 });
  }
  const pinos = linhasChamada(d).map((l) => Math.hypot(l.para.x - l.de.x, l.para.y - l.de.y));
  return { caixa: uniao(rets), modo: d.modo, pinoMaximo: Math.max(0, ...pinos) };
}

/** Retângulo de tudo o que se desenha (cartões e locais reais), em píxeis do mundo. */
export function caixaDeTudo(
  grupos: readonly GrupoNoMapa[],
  zoom: number,
  largura: number,
  expandidos: ReadonlySet<string>,
  altura?: number,
): Retangulo | null {
  return medir(grupos, zoom, largura, expandidos, altura).caixa;
}

/**
 * O zoom mais alto em que tudo cabe. Se nesse zoom algum bloco ficar longe do seu local (pino maior
 * do que PINO_ACEITAVEL), experimenta até DESCIDA_MAXIMA abaixo (sem passar ao resumo) e fica com o
 * primeiro que tenha os pinos curtos; se nenhum tiver, com o que tiver o pino mais curto.
 */
export function enquadrarTudo(grupos: readonly GrupoNoMapa[], o: OpcoesEnquadramento): Enquadramento | null {
  if (grupos.length === 0 || o.largura <= 0 || o.altura <= 0) return null;
  const m = margens(o.margem);
  const livreL = o.largura - m.esquerda - m.direita;
  const livreA = o.altura - m.cima - m.baixo;
  const expandidos = o.expandidos ?? new Set<string>();
  const passos = Math.max(0, Math.round((o.zoomMaximo - o.zoomMinimo) / o.passo));
  const enquadramento = (zoom: number, caixa: Retangulo, cabe: boolean): Enquadramento => {
    // O centro da caixa fica no centro do espaço livre: o centro do mapa desloca-se em conformidade.
    const c = centro(caixa);
    const centroMapa = { x: c.x + (m.direita - m.esquerda) / 2, y: c.y + (m.baixo - m.cima) / 2 };
    return { zoom, centro: desprojetar(centroMapa, zoom), cabe };
  };
  let ultimo: Enquadramento | null = null;
  let primeiroQueCabe: { zoom: number; modo: ModoMapa } | null = null;
  let melhor: { e: Enquadramento; pino: number } | null = null;
  for (let k = 0; k <= passos; k++) {
    const zoom = o.zoomMaximo - k * o.passo;
    if (primeiroQueCabe && primeiroQueCabe.zoom - zoom > DESCIDA_MAXIMA + 1e-9) break;
    // Se nem os pontos dos locais cabem, os cartões também não: escusa de os arrumar.
    if (k < passos && !primeiroQueCabe) {
      const pontos = uniao(
        grupos.map((g) => {
          const p = projetar(g.lat, g.lng, zoom);
          return { x: p.x, y: p.y, largura: 0, altura: 0 };
        }),
      );
      if (pontos && (pontos.largura > livreL || pontos.altura > livreA)) continue;
    }
    const medida = medir(grupos, zoom, o.largura, expandidos, o.altura);
    if (!medida.caixa) return null;
    const cabe = medida.caixa.largura <= livreL && medida.caixa.altura <= livreA;
    ultimo = enquadramento(zoom, medida.caixa, cabe);
    if (!cabe) continue;
    if (primeiroQueCabe && medida.modo !== primeiroQueCabe.modo) break;
    if (medida.pinoMaximo <= PINO_ACEITAVEL) return ultimo;
    primeiroQueCabe ??= { zoom, modo: medida.modo };
    if (!melhor || medida.pinoMaximo < melhor.pino) melhor = { e: ultimo, pino: medida.pinoMaximo };
  }
  return melhor?.e ?? ultimo;
}

const TOLERANCIA_GRAUS = 1e-7;

/**
 * Para onde voar quando se pede para ir a um ponto: se o ponto é um local com cartões, o centro
 * do bloco nesse zoom (o bloco fica ao lado do local); senão, o próprio ponto.
 */
export function centroParaIrPara(
  grupos: readonly GrupoNoMapa[],
  destino: LatLng,
  zoom: number,
  mapa: { largura: number; altura: number },
  expandidos: ReadonlySet<string>,
): LatLng {
  const grupo = grupos.find(
    (g) =>
      Math.abs(g.lat - destino.lat) < TOLERANCIA_GRAUS && Math.abs(g.lng - destino.lng) < TOLERANCIA_GRAUS,
  );
  if (!grupo) return destino;
  const d = disporMapa(grupos, { zoom, larguraMapa: mapa.largura, alturaMapa: mapa.altura, expandidos });
  const g = d.grupos.find((x) => x.locais.some((l) => l.localId === grupo.localId));
  if (!g) return destino;
  // Centro do bloco e do ponto juntos: vê-se o bloco e o sítio exato.
  const caixa = uniao([
    { x: g.x, y: g.y, largura: g.largura, altura: g.altura },
    ...g.pontos.map((p) => ({ x: p.x, y: p.y, largura: 0, altura: 0 })),
  ]);
  return desprojetar(centro(caixa ?? { x: g.x, y: g.y, largura: g.largura, altura: g.altura }), zoom);
}

