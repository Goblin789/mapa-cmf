// Disposição de todos os cartões no mapa para um zoom: tamanho de cada grupo (conforme o nível e os
// cartões abertos à mão), âncora no local real e posição final sem sobreposições.
// Tudo em píxeis do mundo (projecao.ts): não muda ao deslocar o mapa, só com o zoom ou os dados.

import { MARGEM_COLISAO, resolverColisoes } from './colisoes';
import { contem, deslocar, pontoMaisProximo, type Retangulo, type Segmento } from './geometria';
import { chaveCarrinha, chaveCasa, chaveGrupo, type GrupoNoMapa } from './grupos';
import {
  type ElementoGrupo,
  type GeometriaGrupo,
  type GeometriaResumo,
  geometriaCarrinha,
  geometriaCasa,
  geometriaGrupo,
  geometriaResumo,
} from './medidas';
import type { NivelCartao, NivelDetalhe } from './niveis';
import { type Ponto, projetarArredondado } from './projecao';

interface GrupoDispostoBase {
  chave: string;
  grupo: GrupoNoMapa;
  /** Local real, em píxeis do mundo. */
  ancora: Ponto;
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** Ficou longe da âncora: desenha-se uma linha de chamada. */
  deslocado: boolean;
}

export type GrupoDisposto = GrupoDispostoBase &
  ({ modo: 'resumo'; geometria: GeometriaResumo } | { modo: 'cartao'; geometria: GeometriaGrupo });

/** Onde ficou cada cartão (casa, carrinha ou grupo), em píxeis do mundo. */
export interface CartaoNoMapa {
  chave: string;
  chaveGrupo: string;
  retangulo: Retangulo;
  /** Lugares desenhados (null quando o cartão está dentro de uma pastilha de resumo). */
  lugares: Retangulo[] | null;
}

export interface Disposicao {
  zoom: number;
  nivel: NivelDetalhe;
  grupos: GrupoDisposto[];
  cartoes: ReadonlyMap<string, CartaoNoMapa>;
}

export interface OpcoesDisposicao {
  zoom: number;
  nivel: NivelDetalhe;
  /** Chaves "grupo:<localId>", "casa:<id>" ou "carrinha:<id>" abertas à mão. */
  expandidos: ReadonlySet<string>;
  margem?: number;
  pesoVertical?: number;
  raioAncoras?: number;
}

/** Nenhum cartão tapa o ponto do local real de outro (raio em px à volta do ponto). */
export const RAIO_ANCORAS = 7;

/** Os ecrãs são mais largos do que altos: afastar 2 px para o lado custa o mesmo que 1 px na vertical. */
export const PESO_VERTICAL = 2;

/** Nível de um cartão de casa/carrinha: os nomes aparecem com zoom alto ou se o cartão (ou o grupo) foi aberto. */
export function nivelDoCartao(
  nivel: NivelDetalhe,
  expandidos: ReadonlySet<string>,
  chaveDoGrupo: string,
  chaveDoCartao: string,
): NivelCartao {
  return nivel === 'nomes' || expandidos.has(chaveDoGrupo) || expandidos.has(chaveDoCartao)
    ? 'nomes'
    : 'lugares';
}

type Medida = { modo: 'resumo'; geometria: GeometriaResumo } | { modo: 'cartao'; geometria: GeometriaGrupo };

/** No resumo, um grupo só se abre num cartão se ele (ou uma casa/carrinha dele) tiver sido aberto à mão. */
export function medirGrupo(grupo: GrupoNoMapa, nivel: NivelDetalhe, expandidos: ReadonlySet<string>): Medida {
  const cg = chaveGrupo(grupo.localId);
  const chavesCasas = grupo.casas.map((c) => chaveCasa(c.id));
  const chavesCarrinhas = grupo.carrinhas.map((c) => chaveCarrinha(c.id));
  const algumAberto =
    expandidos.has(cg) || [...chavesCasas, ...chavesCarrinhas].some((k) => expandidos.has(k));
  if (nivel === 'resumo' && !algumAberto) {
    return { modo: 'resumo', geometria: geometriaResumo(grupo.casas.length > 0, grupo.carrinhas.length > 0) };
  }
  const casas: ElementoGrupo[] = grupo.casas.map((c, i) => {
    const chave = chavesCasas[i] as string;
    return {
      chave,
      geometria: geometriaCasa(nivelDoCartao(nivel, expandidos, cg, chave), c.nLugares, c.comAviso),
    };
  });
  const carrinhas: ElementoGrupo[] = grupo.carrinhas.map((c, i) => {
    const chave = chavesCarrinhas[i] as string;
    return { chave, geometria: geometriaCarrinha(nivelDoCartao(nivel, expandidos, cg, chave), c.nLugares) };
  });
  return { modo: 'cartao', geometria: geometriaGrupo(casas, carrinhas) };
}

export function disporMapa(grupos: readonly GrupoNoMapa[], opcoes: OpcoesDisposicao): Disposicao {
  const { zoom, nivel, expandidos } = opcoes;
  const medidas = grupos.map((g) => medirGrupo(g, nivel, expandidos));
  const ancoras = grupos.map((g) => projetarArredondado(g.lat, g.lng, zoom));
  const colocadas = resolverColisoes(
    grupos.map((g, i) => {
      const m = medidas[i] as Medida;
      return {
        chave: chaveGrupo(g.localId),
        ancora: ancoras[i] as Ponto,
        largura: m.geometria.largura,
        altura: m.geometria.altura,
      };
    }),
    {
      margem: opcoes.margem ?? MARGEM_COLISAO,
      pesoVertical: opcoes.pesoVertical ?? PESO_VERTICAL,
      raioAncoras: opcoes.raioAncoras ?? RAIO_ANCORAS,
    },
  );

  const dispostos: GrupoDisposto[] = [];
  const cartoes = new Map<string, CartaoNoMapa>();
  grupos.forEach((grupo, i) => {
    const m = medidas[i] as Medida;
    const c = colocadas[i];
    if (!c) return;
    const cg = c.chave;
    const base: GrupoDispostoBase = {
      chave: cg,
      grupo,
      ancora: c.ancora,
      x: c.x,
      y: c.y,
      largura: c.largura,
      altura: c.altura,
      deslocado: c.deslocada,
    };
    const retanguloGrupo = { x: c.x, y: c.y, largura: c.largura, altura: c.altura };
    cartoes.set(cg, { chave: cg, chaveGrupo: cg, retangulo: retanguloGrupo, lugares: null });

    if (m.modo === 'resumo') {
      dispostos.push({ ...base, modo: 'resumo', geometria: m.geometria });
      // No resumo, as casas e carrinhas apontam para a pastilha do grupo.
      for (const casa of grupo.casas) {
        const chave = chaveCasa(casa.id);
        cartoes.set(chave, { chave, chaveGrupo: cg, retangulo: retanguloGrupo, lugares: null });
      }
      for (const carrinha of grupo.carrinhas) {
        const chave = chaveCarrinha(carrinha.id);
        cartoes.set(chave, { chave, chaveGrupo: cg, retangulo: retanguloGrupo, lugares: null });
      }
      return;
    }

    dispostos.push({ ...base, modo: 'cartao', geometria: m.geometria });
    for (const filho of m.geometria.filhos) {
      const dx = c.x + filho.x;
      const dy = c.y + filho.y;
      cartoes.set(filho.chave, {
        chave: filho.chave,
        chaveGrupo: cg,
        retangulo: { x: dx, y: dy, largura: filho.geometria.largura, altura: filho.geometria.altura },
        lugares: filho.geometria.lugares.map((l) => deslocar(l, dx, dy)),
      });
    }
  });

  return { zoom, nivel, grupos: dispostos, cartoes };
}

export interface LinhaChamada extends Segmento {
  chave: string;
}

/** Linha do local real até ao cartão, para cada grupo que teve de sair de cima do seu local. */
export function linhasChamada(d: Disposicao): LinhaChamada[] {
  const linhas: LinhaChamada[] = [];
  for (const g of d.grupos) {
    const r = { x: g.x, y: g.y, largura: g.largura, altura: g.altura };
    if (contem(r, g.ancora)) continue;
    linhas.push({ chave: g.chave, de: g.ancora, para: pontoMaisProximo(r, g.ancora) });
  }
  return linhas;
}
