// Disposição de todos os cartões no mapa para um zoom: cada local é um bloco (as suas casas, as
// carrinhas que lá dormem e as obras), arrumado (arrumacao.ts), escalado (escala.ts) e colocado agarrado
// ao seu local (colisoes.ts). Locais vizinhos (a menos de 500 m, como as duas ruas de Himeling) ficam
// lado a lado: o de oeste todo à esquerda dos pontos, o de leste todo à direita (vizinhancas).
// No modo compacto as carrinhas aparecem sem os nomes; no resumo, cada local (ou locais muito perto
// uns dos outros) é uma pastilha.
// Tudo em píxeis do mundo (projecao.ts): não muda ao deslocar o mapa, só com o zoom ou os dados.

import type { Id } from '../../../dominio/tipos';
import {
  type Arrumacao,
  caixaDoLocal,
  type ElementoCartao,
  type LadoDoPonto,
  type LocalAArrumar,
  opcoesDeArrumacao,
  pontuacao,
  rotulosJuntoDosPontos,
} from './arrumacao';
import { colocarBlocos, type FormaBloco, type LadoBloco, MARGEM_COLISAO, PINO } from './colisoes';
import { ESCALA_MINIMA, escalaCartoes, type ModoMapa, modoMapa } from './escala';
import { pontoMaisProximo, type Retangulo, type Segmento, uniao } from './geometria';
import { chaveCarrinha, chaveCasa, chaveGrupo, chaveObra, type GrupoNoMapa } from './grupos';
import {
  type GeometriaResumo,
  geometriaCarrinha,
  geometriaCasa,
  geometriaObra,
  geometriaResumo,
} from './medidas';
import { type Ponto, projetarArredondado } from './projecao';
import { nomeRotulo } from './textos';

/** No resumo, locais a menos do que isto (px no ecrã) juntam-se numa só pastilha. */
export const DISTANCIA_JUNTAR = 24;
/** Locais a menos do que isto (metros no terreno) são vizinhos e ficam lado a lado (Himeling: 360 m). */
export const DISTANCIA_VIZINHOS_M = 500;
/** Quantas arrumações de cada bloco se experimentam ao colocá-lo no mapa. */
const ARRUMACOES_A_EXPERIMENTAR = 6;
/** Custo (px) de usar uma arrumação com o dobro da pontuação da melhor (ver arrumacao.ts). */
const CUSTO_FORMA = 40;

interface GrupoDispostoBase {
  /** "grupo:<localId>" do primeiro local (o mais a norte). */
  chave: string;
  /** Locais deste bloco, de norte para sul. */
  locais: GrupoNoMapa[];
  /** Ponto de cada local (píxeis do mundo), pela mesma ordem. */
  pontos: Ponto[];
  /** Posição e tamanho no mundo (já escalados). */
  x: number;
  y: number;
  largura: number;
  altura: number;
  escala: number;
  /** Ficou longe dos seus locais (mais do que o pino). */
  deslocado: boolean;
  /**
   * Chaves "grupo:<localId>" que abrem este bloco à mão (no resumo ou no compacto): as dos seus locais,
   * as dos locais vizinhos e as dos que estavam na mesma pastilha. Abrem e fecham juntos.
   */
  chavesAbertura: string[];
}

/** Um bloco é uma pastilha ('resumo') ou um conjunto de cartões ('completo', também no modo compacto). */
export type GrupoDisposto = GrupoDispostoBase &
  ({ modo: 'resumo'; geometria: GeometriaResumo } | { modo: 'completo'; arrumacao: Arrumacao });

/** Onde ficou cada cartão (casa, carrinha, obra ou bloco), em píxeis do mundo. */
export interface CartaoNoMapa {
  chave: string;
  chaveGrupo: string;
  retangulo: Retangulo;
  /** Lugares desenhados (null quando o cartão está dentro de uma pastilha de resumo). */
  lugares: Retangulo[] | null;
}

export interface Disposicao {
  zoom: number;
  modo: ModoMapa;
  escala: number;
  grupos: GrupoDisposto[];
  cartoes: ReadonlyMap<string, CartaoNoMapa>;
}

export interface OpcoesDisposicao {
  zoom: number;
  /** Largura do mapa no ecrã (num telemóvel os nomes aparecem mais tarde). */
  larguraMapa?: number;
  /** Altura do mapa no ecrã (com a largura, dá a proporção da região onde os blocos devem ficar). */
  alturaMapa?: number;
  /** Chaves "grupo:<localId>" abertas à mão no resumo (ou no compacto: com as carrinhas inteiras). */
  expandidos?: ReadonlySet<string>;
  /**
   * A disposição que está no ecrã (modo de edição): no mesmo zoom, os blocos cuja arrumação não mudou
   * ficam onde estavam e só os outros procuram sítio. Sem isto, refazia-se a colocação toda e muitos
   * cartões mudavam de sítio ao largar alguém numa casa cheia (cresce uma linha) ou quando a barra da
   * edição aparece (o mapa fica mais baixo).
   */
  anterior?: Disposicao | null;
}

/** Junta os locais cujos pontos estão a menos de `distancia` px (em cadeia), de norte para sul. */
export function juntarProximos(
  grupos: readonly GrupoNoMapa[],
  pontos: readonly Ponto[],
  distancia = DISTANCIA_JUNTAR,
): number[][] {
  const pai = grupos.map((_, i) => i);
  const raiz = (i: number): number => {
    while (pai[i] !== i) i = pai[i] = pai[pai[i] as number] as number;
    return i;
  };
  for (let i = 0; i < pontos.length; i++) {
    for (let j = i + 1; j < pontos.length; j++) {
      const a = pontos[i] as Ponto;
      const b = pontos[j] as Ponto;
      if (Math.hypot(a.x - b.x, a.y - b.y) < distancia) pai[raiz(j)] = raiz(i);
    }
  }
  const juntos = new Map<number, number[]>();
  grupos.forEach((_, i) => {
    const r = raiz(i);
    const lista = juntos.get(r);
    if (lista) lista.push(i);
    else juntos.set(r, [i]);
  });
  const porNorte = (a: number, b: number) =>
    (pontos[a] as Ponto).y - (pontos[b] as Ponto).y || (pontos[a] as Ponto).x - (pontos[b] as Ponto).x;
  return [...juntos.values()].map((l) => l.sort(porNorte)).sort((a, b) => porNorte(a[0] ?? 0, b[0] ?? 0));
}

/** Distância no terreno (m) entre dois locais (aproximação plana: bastam umas centenas de metros). */
export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const RAIO_TERRA = 6371000;
  const rad = Math.PI / 180;
  const dx = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad) * RAIO_TERRA;
  const dy = (b.lat - a.lat) * rad * RAIO_TERRA;
  return Math.hypot(dx, dy);
}

export interface Vizinhanca {
  /** Os outros locais do mesmo conjunto de vizinhos. */
  vizinhos: Id[];
  /** Lado onde fica o bloco do local, à força (null para os do meio, com mais de dois vizinhos). */
  lado: LadoBloco | null;
}

/**
 * Locais vizinhos ficam lado a lado: locais a menos de DISTANCIA_VIZINHOS_M uns dos outros (em cadeia;
 * ex.: as duas ruas de Himeling) têm cada um o seu bloco, o mais a oeste todo à esquerda dos pontos e o
 * mais a leste todo à direita, cada um à altura do seu ponto (colisoes.ts). É assim em qualquer zoom e
 * com quaisquer camadas: nunca um por cima e o outro por baixo, mesmo que um esteja mais a norte.
 * Empate na longitude: o mais a norte fica à esquerda. `pontos` em píxeis do mundo, pela ordem dos grupos.
 */
export function vizinhancas(
  grupos: readonly GrupoNoMapa[],
  pontos: readonly Ponto[],
  pino = PINO,
): Map<Id, Vizinhanca> {
  const pai = grupos.map((_, i) => i);
  const raiz = (i: number): number => {
    while (pai[i] !== i) i = pai[i] = pai[pai[i] as number] as number;
    return i;
  };
  for (let i = 0; i < grupos.length; i++) {
    for (let j = i + 1; j < grupos.length; j++) {
      if (distanciaMetros(grupos[i] as GrupoNoMapa, grupos[j] as GrupoNoMapa) < DISTANCIA_VIZINHOS_M)
        pai[raiz(j)] = raiz(i);
    }
  }
  const conjuntos = new Map<number, number[]>();
  grupos.forEach((_, i) => {
    const lista = conjuntos.get(raiz(i));
    if (lista) lista.push(i);
    else conjuntos.set(raiz(i), [i]);
  });
  const resultado = new Map<Id, Vizinhanca>();
  const g = (i: number) => grupos[i] as GrupoNoMapa;
  for (const indices of conjuntos.values()) {
    if (indices.length < 2) continue;
    indices.sort((a, b) => g(a).lng - g(b).lng || g(b).lat - g(a).lat);
    const xs = indices.map((i) => (pontos[i] as Ponto).x);
    const pontas = [indices[0], indices[indices.length - 1]] as [number, number];
    indices.forEach((i, k) => {
      const lado: LadoDoPonto | null = k === 0 ? 'esquerda' : k === indices.length - 1 ? 'direita' : null;
      resultado.set(g(i).localId, {
        vizinhos: indices.filter((j) => j !== i).map((j) => g(j).localId),
        lado: lado && {
          lado,
          x: lado === 'esquerda' ? Math.min(...xs) - pino : Math.max(...xs) + pino,
          // O bloco da outra ponta (o do outro lado): os dois ficam virados para o mesmo lado.
          par: chaveGrupo(g(lado === 'esquerda' ? pontas[1] : pontas[0]).localId),
        },
      });
    });
  }
  return resultado;
}

/** Rótulo por cima dos cartões: quando o nome não está numa casa (várias casas, ou só carrinhas). */
export function rotuloDoLocal(grupo: GrupoNoMapa): string | null {
  if (grupo.casas.length === 1) return null;
  if (grupo.casas.length === 0 && grupo.carrinhas.length === 0) return null;
  return nomeRotulo(grupo.nome);
}

/**
 * Os cartões de um local para arrumar. `carrinhasCompactas`: sem os nomes (modo compacto). `lado`: o
 * bloco fica todo desse lado do ponto (locais vizinhos).
 */
export function localAArrumar(
  grupo: GrupoNoMapa,
  carrinhasCompactas = false,
  lado: LadoDoPonto | null = null,
): LocalAArrumar {
  return {
    localId: grupo.localId,
    rotulo: rotuloDoLocal(grupo),
    lado,
    casas: grupo.casas.map(
      (c): ElementoCartao => ({ chave: chaveCasa(c.id), geometria: geometriaCasa(c.nLugares) }),
    ),
    carrinhas: grupo.carrinhas.map(
      (c): ElementoCartao => ({
        chave: chaveCarrinha(c.id),
        geometria: geometriaCarrinha(c.nLugares, carrinhasCompactas, c.tipo),
      }),
    ),
    obras: grupo.obras.map(
      (o): ElementoCartao => ({ chave: chaveObra(o.id), geometria: geometriaObra(o.nPessoas) }),
    ),
  };
}

/** Quantos tipos (casas, carrinhas, obras) aparecem na pastilha de resumo. */
export function partesResumo(locais: readonly GrupoNoMapa[]): number {
  const tem = (f: (g: GrupoNoMapa) => number) => locais.some((g) => f(g) > 0);
  return [tem((g) => g.casas.length), tem((g) => g.carrinhas.length), tem((g) => g.obras.length)].filter(
    Boolean,
  ).length;
}

/** Os cartões onde chega o pino do local: as casas; sem casas, as carrinhas; senão, as obras. */
export function chavesPrincipais(g: GrupoNoMapa): Set<string> {
  if (g.casas.length > 0) return new Set(g.casas.map((c) => chaveCasa(c.id)));
  if (g.carrinhas.length > 0) return new Set(g.carrinhas.map((c) => chaveCarrinha(c.id)));
  return new Set(g.obras.map((o) => chaveObra(o.id)));
}

/** Chaves dos cartões de um local (para as linhas de chamada e as métricas). */
export function chavesDoLocal(g: GrupoNoMapa): Set<string> {
  return new Set([
    ...g.casas.map((c) => chaveCasa(c.id)),
    ...g.carrinhas.map((c) => chaveCarrinha(c.id)),
    ...g.obras.map((o) => chaveObra(o.id)),
  ]);
}

/** Folga entre os blocos e a borda do mapa na vista de conjunto. */
export const FOLGA_BORDA = 16;

/**
 * Tamanho máximo do conjunto na vista de conjunto: o mapa no ecrã, menos uma folga. Só existe enquanto
 * os pontos dos locais cabem no mapa; mais perto, cada bloco fica simplesmente junto do seu local.
 */
export function limiteDoEcra(
  pontos: readonly Ponto[],
  mapa: { largura: number; altura: number } | null,
): { largura: number; altura: number } | null {
  const caixa = uniao(pontos.map((p) => ({ x: p.x, y: p.y, largura: 0, altura: 0 })));
  if (!caixa || !mapa || !Number.isFinite(mapa.largura) || !Number.isFinite(mapa.altura)) return null;
  const largura = mapa.largura - 2 * FOLGA_BORDA;
  const altura = mapa.altura - 2 * FOLGA_BORDA;
  if (caixa.largura > largura || caixa.altura > altura) return null;
  return { largura, altura };
}

const escalar = (r: Retangulo, s: number, x0: number, y0: number): Retangulo => ({
  x: x0 + r.x * s,
  y: y0 + r.y * s,
  largura: r.largura * s,
  altura: r.altura * s,
});

/**
 * Onde conta o rótulo do local ao procurar sítio para o bloco (píxeis base): onde a arrumação o pôs (à
 * esquerda da faixa) ou, num bloco com lado, na ponta da faixa do lado do ponto, que é onde vai acabar
 * (rotulosJuntoDosPontos).
 */
function rotuloParaColocar(a: Arrumacao, localId: Id, lado: LadoBloco | null): Retangulo | undefined {
  const r = a.rotulos.find((x) => x.localId === localId);
  if (!r) return undefined;
  if (lado?.lado !== 'esquerda') return r.retangulo;
  return { ...r.retangulo, x: r.faixa.x + r.faixa.largura - r.retangulo.largura };
}

/** Disposições já calculadas para estes grupos (o enquadramento e o mapa pedem as mesmas). */
const memoria = new WeakMap<readonly GrupoNoMapa[], Map<string, Disposicao>>();
const MAXIMO_EM_MEMORIA = 48;

/**
 * A disposição dos grupos para um zoom (calculada uma vez por grupos, zoom, tamanho e abertos). Com uma
 * disposição anterior não se guarda: depende do que estava no ecrã.
 */
export function disporMapa(grupos: readonly GrupoNoMapa[], opcoes: OpcoesDisposicao): Disposicao {
  if (opcoes.anterior) return calcularDisposicao(grupos, opcoes);
  const chave = [
    opcoes.zoom,
    opcoes.larguraMapa ?? '-',
    opcoes.alturaMapa ?? '-',
    [...(opcoes.expandidos ?? [])].sort().join(','),
  ].join('|');
  let porChave = memoria.get(grupos);
  if (!porChave) {
    porChave = new Map();
    memoria.set(grupos, porChave);
  }
  const guardada = porChave.get(chave);
  if (guardada) return guardada;
  const d = calcularDisposicao(grupos, opcoes);
  if (porChave.size >= MAXIMO_EM_MEMORIA) porChave.clear();
  porChave.set(chave, d);
  return d;
}

/** Um bloco já arrumado (as arrumações possíveis), antes de se saber onde fica. */
type Medido = Omit<GrupoDispostoBase, 'x' | 'y' | 'deslocado' | 'largura' | 'altura'> & {
  /** Lado obrigatório do bloco (locais vizinhos), ou null. */
  lado: LadoBloco | null;
} & ({ modo: 'resumo'; geometria: GeometriaResumo } | { modo: 'completo'; opcoes: Arrumacao[] });

/** As chaves que abrem o bloco destes locais: as deles e as dos seus vizinhos. */
function chavesDeAbertura(locais: readonly GrupoNoMapa[], viz: ReadonlyMap<Id, Vizinhanca>): string[] {
  const ids = locais.flatMap((l) => [l.localId, ...(viz.get(l.localId)?.vizinhos ?? [])]);
  return [...new Set(ids)].map(chaveGrupo);
}

/** Os blocos de um zoom, arrumados mas ainda sem sítio (barato: não faz a colocação). */
function medirBlocos(grupos: readonly GrupoNoMapa[], opcoes: OpcoesDisposicao) {
  const { zoom } = opcoes;
  const largura = opcoes.larguraMapa ?? Number.POSITIVE_INFINITY;
  const expandidos = opcoes.expandidos ?? new Set<string>();
  const modo = modoMapa(zoom, largura);
  const escala = escalaCartoes(zoom, largura);
  const pontos = grupos.map((g) => projetarArredondado(g.lat, g.lng, zoom));
  const viz = vizinhancas(grupos, pontos);
  // Só as pastilhas do resumo juntam locais perto uns dos outros; com cartões, cada local tem o seu bloco.
  const juntos = juntarProximos(grupos, pontos, modo === 'resumo' ? DISTANCIA_JUNTAR : 0);
  const medidos: Medido[] = juntos.flatMap((indices): Medido[] => {
    const locais = indices.map((i) => grupos[i] as GrupoNoMapa);
    const chavesAbertura = chavesDeAbertura(locais, viz);
    const aberto = chavesAbertura.some((k) => expandidos.has(k));
    if (modo === 'resumo' && !aberto) {
      return [
        {
          chave: chaveGrupo((locais[0] as GrupoNoMapa).localId),
          locais,
          pontos: indices.map((i) => pontos[i] as Ponto),
          escala: 1,
          chavesAbertura,
          lado: null,
          modo: 'resumo',
          geometria: geometriaResumo(partesResumo(locais)),
        },
      ];
    }
    const compactas = modo === 'compacto' && !aberto;
    // Locais vizinhos ficam cada um no seu bloco, do seu lado, mesmo abertos à mão no resumo (onde eram
    // uma só pastilha).
    const separar = locais.length > 1 && locais.some((l) => viz.get(l.localId)?.lado);
    return (separar ? indices.map((i) => [i]) : [indices]).map((ids): Medido => {
      const ls = ids.map((i) => grupos[i] as GrupoNoMapa);
      const lado = ls.length === 1 ? (viz.get((ls[0] as GrupoNoMapa).localId)?.lado ?? null) : null;
      return {
        chave: chaveGrupo((ls[0] as GrupoNoMapa).localId),
        locais: ls,
        pontos: ids.map((i) => pontos[i] as Ponto),
        escala: modo === 'resumo' ? ESCALA_MINIMA : escala,
        chavesAbertura,
        lado,
        modo: 'completo',
        // Com rótulo há o dobro das arrumações (rótulo em cima ou em baixo).
        opcoes: opcoesDeArrumacao(
          ls.map((l) => localAArrumar(l, compactas, lado?.lado ?? null)),
          ARRUMACOES_A_EXPERIMENTAR * (ls.some((l) => rotuloDoLocal(l)) ? 2 : 1),
        ),
      };
    });
  });
  return { modo, escala, pontos, medidos };
}

/**
 * Área (px²) que os cartões vão tapar neste zoom, sem os colocar: é igual em todas as arrumações
 * (os mesmos cartões e rótulos). Serve para o enquadramento saltar zooms que tapariam o mapa.
 */
export function areaPrevista(grupos: readonly GrupoNoMapa[], opcoes: OpcoesDisposicao): number {
  let area = 0;
  for (const m of medirBlocos(grupos, opcoes).medidos) {
    if (m.modo === 'resumo') {
      area += m.geometria.largura * m.geometria.altura;
      continue;
    }
    const a = m.opcoes[0] as Arrumacao;
    const base =
      a.cartoes.reduce((t, c) => t + c.geometria.largura * c.geometria.altura, 0) +
      a.rotulos.reduce((t, r) => t + r.retangulo.largura * r.retangulo.altura, 0);
    area += base * m.escala * m.escala;
  }
  return area;
}

/** As duas arrumações põem os mesmos cartões, do mesmo tamanho, nos mesmos sítios. */
function mesmaArrumacao(a: Arrumacao, b: Arrumacao): boolean {
  return (
    a.largura === b.largura &&
    a.altura === b.altura &&
    a.cartoes.length === b.cartoes.length &&
    a.cartoes.every((c, i) => {
      const d = b.cartoes[i];
      return (
        d !== undefined &&
        d.chave === c.chave &&
        d.x === c.x &&
        d.y === c.y &&
        d.geometria.largura === c.geometria.largura &&
        d.geometria.altura === c.geometria.altura
      );
    })
  );
}

/** Os blocos que já estavam no ecrã com a mesma arrumação: onde estavam e com que forma (índice). */
function fixosDe(medidos: readonly Medido[], anterior: Disposicao) {
  const antes = new Map(anterior.grupos.map((g) => [g.chave, g]));
  const fixos = new Map<string, { x: number; y: number; forma: number }>();
  for (const m of medidos) {
    const g = antes.get(m.chave);
    if (!g) continue;
    if (m.modo === 'resumo' && g.modo === 'resumo') {
      if (g.geometria.largura === m.geometria.largura && g.geometria.altura === m.geometria.altura)
        fixos.set(m.chave, { x: g.x, y: g.y, forma: 0 });
    } else if (m.modo === 'completo' && g.modo === 'completo' && g.escala === m.escala) {
      const forma = m.opcoes.findIndex((a) => mesmaArrumacao(a, g.arrumacao));
      if (forma >= 0) fixos.set(m.chave, { x: g.x, y: g.y, forma });
    }
  }
  return fixos;
}

function calcularDisposicao(grupos: readonly GrupoNoMapa[], opcoes: OpcoesDisposicao): Disposicao {
  const { zoom } = opcoes;
  const largura = opcoes.larguraMapa ?? Number.POSITIVE_INFINITY;
  const { modo, escala, pontos, medidos } = medirBlocos(grupos, opcoes);

  const formasDe = (m: Medido): FormaBloco[] => {
    if (m.modo === 'resumo') return [{ largura: m.geometria.largura, altura: m.geometria.altura }];
    const s = m.escala;
    const melhor = pontuacao(m.opcoes[0] as Arrumacao);
    return m.opcoes.map((a) => ({
      largura: Math.ceil(a.largura * s),
      altura: Math.ceil(a.altura * s),
      custoExtra: melhor > 0 ? (pontuacao(a) / melhor - 1) * CUSTO_FORMA : 0,
      // Cada ponto conta até ao seu cartão principal mais perto (uma casa) ou ao seu rótulo (o nome do
      // sítio); num bloco com vários locais, até aos cartões desse local. O rótulo conta onde a arrumação
      // o pôs; depois de colocado o bloco só pode chegar mais perto do ponto (rotulosJuntoDosPontos).
      // Num bloco com lado (locais vizinhos), o pino chega ao rótulo, que fica na ponta de dentro da faixa:
      // os nomes das duas ruas ficam entre os dois blocos, junto dos pontos.
      partes: m.locais.map((local) => {
        const rotulo = rotuloParaColocar(a, local.localId, m.lado);
        const rets =
          m.locais.length > 1
            ? [caixaDoLocal(a, local.localId, chavesDoLocal(local))].filter((r): r is Retangulo => r !== null)
            : m.lado && rotulo
              ? [rotulo]
              : [
                  ...a.cartoes
                    .filter((x) => chavesPrincipais(local).has(x.chave))
                    .map((c) => ({
                      x: c.x,
                      y: c.y,
                      largura: c.geometria.largura,
                      altura: c.geometria.altura,
                    })),
                  ...(rotulo ? [rotulo] : []),
                ];
        return rets.map((r) => escalar(r, s, 0, 0));
      }),
      rotulos: m.locais.map((local) => {
        const r = rotuloParaColocar(a, local.localId, m.lado);
        return r ? escalar(r, s, 0, 0) : null;
      }),
    }));
  };

  const anterior = opcoes.anterior;
  const colocadas = colocarBlocos(
    medidos.map((m) => ({ chave: m.chave, pontos: m.pontos, formas: formasDe(m), lado: m.lado })),
    {
      margem: MARGEM_COLISAO,
      pino: PINO,
      ecra: limiteDoEcra(pontos, opcoes.alturaMapa ? { largura, altura: opcoes.alturaMapa } : null),
      fixos: anterior && anterior.zoom === zoom && anterior.modo === modo ? fixosDe(medidos, anterior) : null,
    },
  );

  const dispostos: GrupoDisposto[] = [];
  const cartoes = new Map<string, CartaoNoMapa>();
  medidos.forEach((m, i) => {
    const c = colocadas[i];
    if (!c) return;
    const base = {
      chave: m.chave,
      locais: m.locais,
      pontos: m.pontos,
      x: c.x,
      y: c.y,
      largura: c.largura,
      altura: c.altura,
      escala: m.escala,
      deslocado: c.deslocada,
      chavesAbertura: m.chavesAbertura,
    };
    const retanguloGrupo = { x: c.x, y: c.y, largura: c.largura, altura: c.altura };
    cartoes.set(m.chave, { chave: m.chave, chaveGrupo: m.chave, retangulo: retanguloGrupo, lugares: null });
    if (m.modo === 'resumo') {
      dispostos.push({ ...base, modo: 'resumo', geometria: m.geometria });
      // No resumo, as casas, carrinhas e obras apontam para a pastilha.
      for (const local of m.locais) {
        for (const chave of chavesDoLocal(local)) {
          cartoes.set(chave, { chave, chaveGrupo: m.chave, retangulo: retanguloGrupo, lugares: null });
        }
      }
      return;
    }
    // Com o bloco no sítio, o rótulo de cada local desliza na sua faixa para junto do seu ponto (sem isto
    // ficava sempre à esquerda: num bloco a oeste do ponto, o nome do sítio aparecia a 10–20 km dele).
    // Os pontos vão em píxeis base do bloco.
    const pontosBase = new Map(
      m.locais.map((l, k) => {
        const p = m.pontos[k] as Ponto;
        return [l.localId, { x: (p.x - c.x) / m.escala, y: (p.y - c.y) / m.escala }] as const;
      }),
    );
    const arrumacao = rotulosJuntoDosPontos(m.opcoes[c.forma] ?? (m.opcoes[0] as Arrumacao), pontosBase);
    dispostos.push({ ...base, modo: 'completo', arrumacao });
    for (const cartao of arrumacao.cartoes) {
      cartoes.set(cartao.chave, {
        chave: cartao.chave,
        chaveGrupo: m.chave,
        retangulo: escalar(
          { x: cartao.x, y: cartao.y, largura: cartao.geometria.largura, altura: cartao.geometria.altura },
          m.escala,
          c.x,
          c.y,
        ),
        lugares: cartao.geometria.lugares.map((l) =>
          escalar({ ...l, x: l.x + cartao.x, y: l.y + cartao.y }, m.escala, c.x, c.y),
        ),
      });
    }
  });

  return { zoom, modo, escala, grupos: dispostos, cartoes };
}

/** Rótulo do local no bloco, em píxeis do mundo (null se não tiver). */
export function rotuloNoMapa(g: GrupoDisposto, localId: string): Retangulo | null {
  if (g.modo !== 'completo') return null;
  const r = g.arrumacao.rotulos.find((x) => x.localId === localId)?.retangulo;
  return r ? escalar(r, g.escala, g.x, g.y) : null;
}

/**
 * Onde chega o pino do local i do bloco (mundo): o cartão principal (casa; sem casas, carrinha) ou o
 * rótulo do local, o que estiver mais perto do ponto; num bloco com vários locais, o cartão desse local
 * mais perto; no resumo, a pastilha.
 */
export function retanguloDoLocal(d: Disposicao, g: GrupoDisposto, i: number): Retangulo {
  const local = g.locais[i];
  const ponto = g.pontos[i];
  const inteiro = { x: g.x, y: g.y, largura: g.largura, altura: g.altura };
  if (g.modo !== 'completo' || !local || !ponto) return inteiro;
  let melhor: Retangulo = inteiro;
  let melhorD = Number.POSITIVE_INFINITY;
  const candidatos = (g.locais.length === 1 ? [...chavesPrincipais(local)] : [...chavesDoLocal(local)])
    .map((chave) => d.cartoes.get(chave)?.retangulo)
    .concat(g.locais.length === 1 ? [rotuloNoMapa(g, local.localId) ?? undefined] : []);
  for (const r of candidatos) {
    if (!r) continue;
    const p = pontoMaisProximo(r, ponto);
    const dist = Math.hypot(p.x - ponto.x, p.y - ponto.y);
    if (dist < melhorD) {
      melhor = r;
      melhorD = dist;
    }
  }
  return melhor;
}

/** Retângulos que tapam o mapa: pastilhas e, nos blocos completos, cada cartão e cada rótulo. */
export function retangulosDesenhados(d: Disposicao): Retangulo[] {
  const rets: Retangulo[] = [];
  for (const g of d.grupos) {
    if (g.modo === 'resumo') {
      rets.push({ x: g.x, y: g.y, largura: g.largura, altura: g.altura });
      continue;
    }
    const s = g.escala;
    for (const c of g.arrumacao.cartoes) {
      rets.push({
        x: g.x + c.x * s,
        y: g.y + c.y * s,
        largura: c.geometria.largura * s,
        altura: c.geometria.altura * s,
      });
    }
    for (const r of g.arrumacao.rotulos) {
      rets.push({
        x: g.x + r.retangulo.x * s,
        y: g.y + r.retangulo.y * s,
        largura: r.retangulo.largura * s,
        altura: r.retangulo.altura * s,
      });
    }
  }
  return rets;
}

/** Área (px²) tapada pelos cartões: os retângulos desenhados não se sobrepõem, por isso basta somar. */
export function areaDesenhada(d: Disposicao): number {
  return retangulosDesenhados(d).reduce((t, r) => t + r.largura * r.altura, 0);
}

export interface LinhaChamada extends Segmento {
  chave: string;
  /** Mais comprida do que o pino: o bloco teve de se afastar. */
  longa: boolean;
}

/** Do ponto de cada local ao cartão principal mais perto (o "pino" e as linhas de chamada). */
export function linhasChamada(d: Disposicao): LinhaChamada[] {
  const linhas: LinhaChamada[] = [];
  for (const g of d.grupos) {
    g.locais.forEach((local, i) => {
      const ponto = g.pontos[i] as Ponto;
      const para = pontoMaisProximo(retanguloDoLocal(d, g, i), ponto);
      const comprimento = Math.hypot(para.x - ponto.x, para.y - ponto.y);
      linhas.push({ chave: `pino:${local.localId}`, de: ponto, para, longa: comprimento > PINO + 2 });
    });
  }
  return linhas;
}
