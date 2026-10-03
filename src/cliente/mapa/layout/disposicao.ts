// Disposição de todos os cartões no mapa para um zoom: os locais muito perto uns dos outros juntam-se
// num só bloco (as duas ruas de Himeling, a ~360 m), cada bloco é arrumado (arrumacao.ts), escalado
// (escala.ts) e colocado agarrado ao seu local (colisoes.ts). No resumo, cada bloco é uma pastilha.
// Tudo em píxeis do mundo (projecao.ts): não muda ao deslocar o mapa, só com o zoom ou os dados.

import { colocarBlocos, type FormaBloco, MARGEM_COLISAO, PINO } from './colisoes';
import {
  type Arrumacao,
  caixaDoLocal,
  type ElementoCartao,
  type LocalAArrumar,
  opcoesDeArrumacao,
  pontuacao,
} from './arrumacao';
import { ESCALA_MINIMA, escalaCartoes, type ModoMapa, modoMapa } from './escala';
import { type Retangulo, pontoMaisProximo, type Segmento, uniao } from './geometria';
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

/** Locais a menos do que isto (px no ecrã) juntam-se num só bloco. */
export const DISTANCIA_JUNTAR = 24;
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
}

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
  /** Chaves "grupo:<localId>" abertas à mão no resumo. */
  expandidos?: ReadonlySet<string>;
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

/** Rótulo por cima dos cartões: quando o nome não está numa casa (várias casas, ou só carrinhas). */
export function rotuloDoLocal(grupo: GrupoNoMapa): string | null {
  if (grupo.casas.length === 1) return null;
  if (grupo.casas.length === 0 && grupo.carrinhas.length === 0) return null;
  return nomeRotulo(grupo.nome);
}

export function localAArrumar(grupo: GrupoNoMapa): LocalAArrumar {
  return {
    localId: grupo.localId,
    rotulo: rotuloDoLocal(grupo),
    casas: grupo.casas.map(
      (c): ElementoCartao => ({ chave: chaveCasa(c.id), geometria: geometriaCasa(c.nLugares) }),
    ),
    carrinhas: grupo.carrinhas.map(
      (c): ElementoCartao => ({ chave: chaveCarrinha(c.id), geometria: geometriaCarrinha(c.nLugares) }),
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

/** O cartão que representa o local no mapa (onde chega o pino): a primeira casa, senão a primeira carrinha. */
export function chavePrincipal(g: GrupoNoMapa): string | null {
  const casa = g.casas[0];
  if (casa) return chaveCasa(casa.id);
  const carrinha = g.carrinhas[0];
  if (carrinha) return chaveCarrinha(carrinha.id);
  const obra = g.obras[0];
  return obra ? chaveObra(obra.id) : null;
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
 * A região onde os blocos devem ficar: o tamanho do mapa no ecrã (menos uma folga), centrado nos
 * locais. Só existe enquanto os locais cabem no mapa (vista de conjunto); a partir daí cada bloco fica
 * simplesmente junto do seu local.
 */
export function regiaoDosLocais(
  pontos: readonly Ponto[],
  mapa: { largura: number; altura: number } | null,
): Retangulo | null {
  const caixa = uniao(pontos.map((p) => ({ x: p.x, y: p.y, largura: 0, altura: 0 })));
  if (!caixa || !mapa || !Number.isFinite(mapa.largura) || !Number.isFinite(mapa.altura)) return null;
  const largura = mapa.largura - 2 * FOLGA_BORDA;
  const altura = mapa.altura - 2 * FOLGA_BORDA;
  if (caixa.largura > largura || caixa.altura > altura) return null;
  return {
    x: Math.round(caixa.x + caixa.largura / 2 - largura / 2),
    y: Math.round(caixa.y + caixa.altura / 2 - altura / 2),
    largura: Math.round(largura),
    altura: Math.round(altura),
  };
}

const escalar = (r: Retangulo, s: number, x0: number, y0: number): Retangulo => ({
  x: x0 + r.x * s,
  y: y0 + r.y * s,
  largura: r.largura * s,
  altura: r.altura * s,
});

export function disporMapa(grupos: readonly GrupoNoMapa[], opcoes: OpcoesDisposicao): Disposicao {
  const { zoom } = opcoes;
  const largura = opcoes.larguraMapa ?? Number.POSITIVE_INFINITY;
  const expandidos = opcoes.expandidos ?? new Set<string>();
  const modo = modoMapa(zoom, largura);
  const escala = escalaCartoes(zoom, largura);
  const pontos = grupos.map((g) => projetarArredondado(g.lat, g.lng, zoom));
  const juntos = juntarProximos(grupos, pontos);

  type Medido = Omit<GrupoDispostoBase, 'x' | 'y' | 'deslocado' | 'largura' | 'altura'> &
    (
      | { modo: 'resumo'; geometria: GeometriaResumo }
      | { modo: 'completo'; opcoes: Arrumacao[] }
    );
  const medidos: Medido[] = juntos.map((indices) => {
    const locais = indices.map((i) => grupos[i] as GrupoNoMapa);
    const pts = indices.map((i) => pontos[i] as Ponto);
    const chave = chaveGrupo((locais[0] as GrupoNoMapa).localId);
    const aberto = locais.some((g) => expandidos.has(chaveGrupo(g.localId)));
    if (modo === 'resumo' && !aberto) {
      return {
        chave,
        locais,
        pontos: pts,
        escala: 1,
        modo: 'resumo',
        geometria: geometriaResumo(partesResumo(locais)),
      };
    }
    return {
      chave,
      locais,
      pontos: pts,
      escala: modo === 'resumo' ? ESCALA_MINIMA : escala,
      modo: 'completo',
      opcoes: opcoesDeArrumacao(locais.map(localAArrumar)),
    };
  });

  const formasDe = (m: Medido): FormaBloco[] => {
    if (m.modo === 'resumo') return [{ largura: m.geometria.largura, altura: m.geometria.altura }];
    const s = m.escala;
    const melhor = pontuacao(m.opcoes[0] as Arrumacao);
    return m.opcoes.map((a) => ({
      largura: Math.ceil(a.largura * s),
      altura: Math.ceil(a.altura * s),
      custoExtra: melhor > 0 ? (pontuacao(a) / melhor - 1) * CUSTO_FORMA : 0,
      // Cada ponto conta até ao seu cartão principal (a casa); num bloco com várias ruas, até à sua rua.
      partes: m.locais.map((local) => {
        const r =
          m.locais.length > 1
            ? caixaDoLocal(a, local.localId, chavesDoLocal(local))
            : (() => {
                const c = a.cartoes.find((x) => x.chave === chavePrincipal(local));
                return c ? { x: c.x, y: c.y, largura: c.geometria.largura, altura: c.geometria.altura } : null;
              })();
        const base = r ?? { x: 0, y: 0, largura: a.largura, altura: a.altura };
        return { x: base.x * s, y: base.y * s, largura: base.largura * s, altura: base.altura * s };
      }),
    }));
  };

  const colocadas = colocarBlocos(
    medidos.map((m) => ({ chave: m.chave, pontos: m.pontos, formas: formasDe(m) })),
    {
      margem: MARGEM_COLISAO,
      pino: PINO,
      regiao: regiaoDosLocais(pontos, opcoes.alturaMapa ? { largura, altura: opcoes.alturaMapa } : null),
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
    const arrumacao = m.opcoes[c.forma] ?? (m.opcoes[0] as Arrumacao);
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

/**
 * Onde chega o pino do local i do bloco (mundo): o seu cartão principal (a casa); num bloco com
 * várias ruas, o cartão dessa rua mais perto do ponto; no resumo, a pastilha.
 */
export function retanguloDoLocal(d: Disposicao, g: GrupoDisposto, i: number): Retangulo {
  const local = g.locais[i];
  const ponto = g.pontos[i];
  const inteiro = { x: g.x, y: g.y, largura: g.largura, altura: g.altura };
  if (g.modo !== 'completo' || !local || !ponto) return inteiro;
  if (g.locais.length === 1) {
    const chave = chavePrincipal(local);
    return (chave ? d.cartoes.get(chave)?.retangulo : undefined) ?? inteiro;
  }
  let melhor: Retangulo = inteiro;
  let melhorD = Number.POSITIVE_INFINITY;
  for (const chave of chavesDoLocal(local)) {
    const r = d.cartoes.get(chave)?.retangulo;
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

export interface LinhaChamada extends Segmento {
  chave: string;
  /** Mais comprida do que o pino: o bloco teve de se afastar. */
  longa: boolean;
}

/** Do ponto de cada local ao seu cartão principal (o "pino" e as linhas de chamada). */
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
