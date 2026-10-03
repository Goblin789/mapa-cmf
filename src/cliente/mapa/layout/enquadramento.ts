// Vista inicial: o zoom mais alto em que todos os cartões (já arrumados) cabem no mapa.
// Como o tamanho dos cartões depende do nível de detalhe, experimenta-se zoom a zoom, de cima para baixo.

import { disporMapa } from './disposicao';
import { centro, type Retangulo, uniao } from './geometria';
import { chaveGrupo, type GrupoNoMapa } from './grupos';
import { type NivelDetalhe, nivelDetalhe } from './niveis';
import { desprojetar, type LatLng } from './projecao';

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

/** Retângulo de tudo o que se desenha (cartões e locais reais), em píxeis do mundo. */
export function caixaDeTudo(
  grupos: readonly GrupoNoMapa[],
  zoom: number,
  largura: number,
  expandidos: ReadonlySet<string>,
): Retangulo | null {
  const d = disporMapa(grupos, { zoom, nivel: nivelDetalhe(zoom, largura), expandidos });
  const rets: Retangulo[] = [];
  for (const g of d.grupos) {
    rets.push({ x: g.x, y: g.y, largura: g.largura, altura: g.altura });
    rets.push({ x: g.ancora.x, y: g.ancora.y, largura: 0, altura: 0 });
  }
  return uniao(rets);
}

export function enquadrarTudo(grupos: readonly GrupoNoMapa[], o: OpcoesEnquadramento): Enquadramento | null {
  if (grupos.length === 0 || o.largura <= 0 || o.altura <= 0) return null;
  const m = margens(o.margem);
  const livreL = o.largura - m.esquerda - m.direita;
  const livreA = o.altura - m.cima - m.baixo;
  const expandidos = o.expandidos ?? new Set<string>();
  const passos = Math.max(0, Math.round((o.zoomMaximo - o.zoomMinimo) / o.passo));
  let ultimo: Enquadramento | null = null;
  for (let k = 0; k <= passos; k++) {
    const zoom = o.zoomMaximo - k * o.passo;
    const caixa = caixaDeTudo(grupos, zoom, o.largura, expandidos);
    if (!caixa) return null;
    const cabe = caixa.largura <= livreL && caixa.altura <= livreA;
    // O centro da caixa fica no centro do espaço livre: o centro do mapa desloca-se em conformidade.
    const c = centro(caixa);
    const centroMapa = { x: c.x + (m.direita - m.esquerda) / 2, y: c.y + (m.baixo - m.cima) / 2 };
    ultimo = { zoom, centro: desprojetar(centroMapa, zoom), cabe };
    if (cabe) return ultimo;
  }
  return ultimo;
}

const TOLERANCIA_GRAUS = 1e-7;

/**
 * Para onde voar quando se pede para ir a um ponto: se o ponto é um local com cartão, o centro
 * do cartão nesse zoom (o cartão pode ter sido afastado do local); senão, o próprio ponto.
 */
export function centroParaIrPara(
  grupos: readonly GrupoNoMapa[],
  destino: LatLng,
  zoom: number,
  nivel: NivelDetalhe,
  expandidos: ReadonlySet<string>,
): LatLng {
  const grupo = grupos.find(
    (g) =>
      Math.abs(g.lat - destino.lat) < TOLERANCIA_GRAUS && Math.abs(g.lng - destino.lng) < TOLERANCIA_GRAUS,
  );
  if (!grupo) return destino;
  const d = disporMapa(grupos, { zoom, nivel, expandidos });
  const g = d.grupos.find((x) => x.chave === chaveGrupo(grupo.localId));
  if (!g) return destino;
  return desprojetar(centro({ x: g.x, y: g.y, largura: g.largura, altura: g.altura }), zoom);
}
