// Medidas da vista inicial, para os testes e para afinar o layout: quanto do mapa os cartões tapam,
// quão longe ficam do seu local e se há sobreposições. Puras (sem DOM).

import { distanciaAoRetangulo, MARGEM_COLISAO } from './colisoes';
import {
  chavesDoLocal,
  type Disposicao,
  disporMapa,
  retanguloDoLocal,
  retangulosDesenhados,
} from './disposicao';
import { enquadrarTudo, type Margens } from './enquadramento';
import { type Retangulo, sobrepoem } from './geometria';
import type { GrupoNoMapa } from './grupos';
import { projetar } from './projecao';

export interface Metricas {
  zoom: number;
  cabe: boolean;
  modo: Disposicao['modo'];
  escala: number;
  /** Fração do mapa (0–1) tapada por cartões (pastilhas, casas, carrinhas, obras e rótulos). */
  cobertura: number;
  /** Para cada local: distância do ponto ao cartão mais próximo desse local (o pino). */
  pinos: Map<string, number>;
  /** Para cada cartão: distância do ponto do seu local ao cartão. */
  afastamentos: Map<string, number>;
  /** Pares de blocos sobrepostos (com a margem) ou de cartões sobrepostos dentro de um bloco. */
  sobreposicoes: string[];
  /** Blocos que tapam o ponto de outro local. */
  pontosTapados: string[];
  disposicao: Disposicao;
}

/** Área (px) da união dos retângulos dentro da janela, por rasterização (1 px). */
export function areaCoberta(rets: readonly Retangulo[], janela: Retangulo): number {
  const L = Math.max(0, Math.round(janela.largura));
  const A = Math.max(0, Math.round(janela.altura));
  const grelha = new Uint8Array(L * A);
  for (const r of rets) {
    const x0 = Math.max(0, Math.floor(r.x - janela.x));
    const y0 = Math.max(0, Math.floor(r.y - janela.y));
    const x1 = Math.min(L, Math.ceil(r.x - janela.x + r.largura));
    const y1 = Math.min(A, Math.ceil(r.y - janela.y + r.altura));
    for (let y = y0; y < y1; y++) grelha.fill(1, y * L + x0, y * L + Math.max(x0, x1));
  }
  let n = 0;
  for (const v of grelha) n += v;
  return n;
}

export interface OpcoesMetricas {
  largura: number;
  altura: number;
  margem: number | Margens;
  zoomMinimo?: number;
  zoomMaximo?: number;
  passo?: number;
}

/** Enquadra como o Mapa faz e mede o resultado. */
export function medirVistaInicial(grupos: readonly GrupoNoMapa[], o: OpcoesMetricas): Metricas | null {
  const e = enquadrarTudo(grupos, {
    largura: o.largura,
    altura: o.altura,
    margem: o.margem,
    zoomMinimo: o.zoomMinimo ?? 9,
    zoomMaximo: o.zoomMaximo ?? 14,
    passo: o.passo ?? 0.25,
  });
  if (!e) return null;
  const d = disporMapa(grupos, { zoom: e.zoom, larguraMapa: o.largura, alturaMapa: o.altura });
  const c = projetar(e.centro.lat, e.centro.lng, e.zoom);
  const janela = { x: c.x - o.largura / 2, y: c.y - o.altura / 2, largura: o.largura, altura: o.altura };
  const cobertura = areaCoberta(retangulosDesenhados(d), janela) / (o.largura * o.altura);

  const pinos = new Map<string, number>();
  const afastamentos = new Map<string, number>();
  for (const g of d.grupos) {
    g.locais.forEach((local, i) => {
      const ponto = g.pontos[i];
      if (!ponto) return;
      pinos.set(local.localId, distanciaAoRetangulo(ponto, retanguloDoLocal(d, g, i)));
      if (g.modo !== 'completo') return;
      for (const chave of chavesDoLocal(local)) {
        const cartao = d.cartoes.get(chave);
        if (cartao) afastamentos.set(chave, distanciaAoRetangulo(ponto, cartao.retangulo));
      }
    });
  }

  const sobreposicoes: string[] = [];
  const blocos = d.grupos;
  for (let i = 0; i < blocos.length; i++) {
    const a = blocos[i] as (typeof blocos)[number];
    for (let j = i + 1; j < blocos.length; j++) {
      const b = blocos[j] as (typeof blocos)[number];
      if (sobrepoem(a, b, MARGEM_COLISAO - 1)) sobreposicoes.push(`${a.chave} × ${b.chave}`);
    }
  }
  const cartoes = [...d.cartoes.values()].filter((c) => c.lugares !== null);
  for (let i = 0; i < cartoes.length; i++) {
    for (let j = i + 1; j < cartoes.length; j++) {
      const a = cartoes[i] as (typeof cartoes)[number];
      const b = cartoes[j] as (typeof cartoes)[number];
      if (sobrepoem(a.retangulo, b.retangulo)) sobreposicoes.push(`${a.chave} × ${b.chave}`);
    }
  }

  const pontosTapados: string[] = [];
  for (const g of blocos) {
    for (const h of blocos) {
      if (g === h) continue;
      for (const p of h.pontos) {
        if (distanciaAoRetangulo(p, g) === 0) pontosTapados.push(`${g.chave} tapa ${h.chave}`);
      }
    }
  }

  return {
    zoom: e.zoom,
    cabe: e.cabe,
    modo: d.modo,
    escala: d.escala,
    cobertura,
    pinos,
    afastamentos,
    sobreposicoes,
    pontosTapados,
    disposicao: d,
  };
}
