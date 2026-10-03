// Arrumação dos cartões de um local (e de locais vizinhos juntos, como as duas ruas de Himeling) num
// bloco compacto, em píxeis base. Regras:
// - as casas em grelha (linhas alinhadas em baixo, como casas na rua), as carrinhas em fila ao lado
//   ou por baixo das casas, as obras a seguir;
// - experimentam-se todas as combinações (colunas de cada grelha, ao lado/por baixo) e fica a que
//   ocupa menos área sem ficar alta e estreita (o espaço vertical é o que mais falta no ecrã);
// - os locais com várias casas (ou só com carrinhas) levam um rótulo com o nome do local por cima.

import type { Id } from '../../../dominio/tipos';
import { type Retangulo, uniao } from './geometria';
import type { GeometriaCartao } from './medidas';

/** Espaço entre cartões do mesmo bloco. */
export const FOLGA_CARTOES = 4;
/** Espaço entre os blocos de locais diferentes juntos. */
const FOLGA_LOCAIS = 8;
const ROTULO = { altura: 13, folga: 1 } as const;
/** Largura (base) a partir da qual um bloco começa a ser penalizado: tapava muito mapa para os lados. */
const LARGURA_CONFORTAVEL = 900;
/** Proporção (largura/altura) preferida para um bloco. */
const PROPORCAO_IDEAL = 2;
/** Quantas arrumações de cada local entram nas combinações de locais juntos. */
const MELHORES_POR_LOCAL = 6;

export interface ElementoCartao {
  chave: string;
  geometria: GeometriaCartao;
}

export interface CartaoArrumado extends ElementoCartao {
  /** Posição dentro do bloco (píxeis base). */
  x: number;
  y: number;
}

export interface RotuloArrumado {
  localId: Id;
  texto: string;
  retangulo: Retangulo;
}

export interface Arrumacao {
  largura: number;
  altura: number;
  cartoes: CartaoArrumado[];
  rotulos: RotuloArrumado[];
}

export interface LocalAArrumar {
  localId: Id;
  /** Rótulo por cima dos cartões (null = sem rótulo: o nome já está na casa). */
  rotulo: string | null;
  casas: readonly ElementoCartao[];
  carrinhas: readonly ElementoCartao[];
  obras: readonly ElementoCartao[];
}

const VAZIA: Arrumacao = { largura: 0, altura: 0, cartoes: [], rotulos: [] };

function deslocar(a: Arrumacao, dx: number, dy: number): Arrumacao {
  return {
    largura: a.largura,
    altura: a.altura,
    cartoes: a.cartoes.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })),
    rotulos: a.rotulos.map((r) => ({
      ...r,
      retangulo: { ...r.retangulo, x: r.retangulo.x + dx, y: r.retangulo.y + dy },
    })),
  };
}

/** Grelha com `colunas` colunas: cada linha centrada e alinhada em baixo. Mantém a ordem. */
export function grelha(itens: readonly ElementoCartao[], colunas: number): Arrumacao {
  if (itens.length === 0) return VAZIA;
  const linhas: ElementoCartao[][] = [];
  for (let i = 0; i < itens.length; i += colunas) linhas.push(itens.slice(i, i + colunas));
  const larguraLinha = (l: ElementoCartao[]) =>
    l.reduce((t, e) => t + e.geometria.largura, 0) + (l.length - 1) * FOLGA_CARTOES;
  const alturaLinha = (l: ElementoCartao[]) => Math.max(...l.map((e) => e.geometria.altura));
  const largura = Math.max(...linhas.map(larguraLinha));
  const cartoes: CartaoArrumado[] = [];
  let y = 0;
  for (const linha of linhas) {
    const a = alturaLinha(linha);
    let x = Math.floor((largura - larguraLinha(linha)) / 2);
    for (const e of linha) {
      cartoes.push({ ...e, x, y: y + a - e.geometria.altura });
      x += e.geometria.largura + FOLGA_CARTOES;
    }
    y += a + FOLGA_CARTOES;
  }
  return { largura, altura: y - FOLGA_CARTOES, cartoes, rotulos: [] };
}

export type Direcao = 'lado' | 'baixo';

/** Junta dois blocos: lado a lado (alinhados em baixo) ou um por baixo do outro (centrados). */
export function juntar(a: Arrumacao, b: Arrumacao, direcao: Direcao, folga = FOLGA_CARTOES): Arrumacao {
  if (a.cartoes.length === 0 && a.rotulos.length === 0) return b;
  if (b.cartoes.length === 0 && b.rotulos.length === 0) return a;
  if (direcao === 'lado') {
    const altura = Math.max(a.altura, b.altura);
    const pa = deslocar(a, 0, altura - a.altura);
    const pb = deslocar(b, a.largura + folga, altura - b.altura);
    return {
      largura: a.largura + folga + b.largura,
      altura,
      cartoes: [...pa.cartoes, ...pb.cartoes],
      rotulos: [...pa.rotulos, ...pb.rotulos],
    };
  }
  const largura = Math.max(a.largura, b.largura);
  const pa = deslocar(a, Math.floor((largura - a.largura) / 2), 0);
  const pb = deslocar(b, Math.floor((largura - b.largura) / 2), a.altura + folga);
  return {
    largura,
    altura: a.altura + folga + b.altura,
    cartoes: [...pa.cartoes, ...pb.cartoes],
    rotulos: [...pa.rotulos, ...pb.rotulos],
  };
}

function comRotulo(a: Arrumacao, localId: Id, texto: string | null): Arrumacao {
  if (!texto) return a;
  const deslocada = deslocar(a, 0, ROTULO.altura + ROTULO.folga);
  return {
    ...deslocada,
    altura: a.altura + ROTULO.altura + ROTULO.folga,
    rotulos: [
      { localId, texto, retangulo: { x: 0, y: 0, largura: a.largura, altura: ROTULO.altura } },
      ...deslocada.rotulos,
    ],
  };
}

/**
 * Pontuação de uma arrumação (menor = melhor): a área do bloco, mais cara quanto mais a proporção se
 * afasta de 2:1 (o ecrã é mais largo do que alto, e um bloco alto empurra os vizinhos para longe) e
 * quando passa de LARGURA_CONFORTAVEL (tapava o mapa para os lados).
 */
export function pontuacao(a: Pick<Arrumacao, 'largura' | 'altura'>): number {
  const { largura: w, altura: h } = a;
  if (w <= 0 || h <= 0) return 0;
  const proporcao = 1 + 0.35 * Math.abs(Math.log2(w / h / PROPORCAO_IDEAL));
  const largo = 1 + Math.max(0, w - LARGURA_CONFORTAVEL) / LARGURA_CONFORTAVEL;
  return w * h * proporcao * largo;
}

const colunasPossiveis = (n: number) => Array.from({ length: Math.max(1, n) }, (_, i) => i + 1);

/** Todas as arrumações de um local, da melhor para a pior (sem repetir tamanhos iguais). */
export function arrumacoesDoLocal(local: LocalAArrumar): Arrumacao[] {
  const resultado: Arrumacao[] = [];
  for (const cc of colunasPossiveis(local.casas.length)) {
    const casas = grelha(local.casas, cc);
    for (const cv of colunasPossiveis(local.carrinhas.length)) {
      const carrinhas = grelha(local.carrinhas, cv);
      for (const co of colunasPossiveis(local.obras.length)) {
        const obras = grelha(local.obras, co);
        for (const d1 of ['lado', 'baixo'] as const) {
          const primeiro = juntar(casas, carrinhas, d1);
          for (const d2 of ['lado', 'baixo'] as const) {
            resultado.push(comRotulo(juntar(primeiro, obras, d2), local.localId, local.rotulo));
            if (obras.cartoes.length === 0) break;
          }
          if (carrinhas.cartoes.length === 0 || casas.cartoes.length === 0) break;
        }
      }
    }
  }
  const vistos = new Set<string>();
  return resultado
    .map((a, i) => ({ a, i, p: pontuacao(a) }))
    .sort((x, y) => x.p - y.p || x.i - y.i)
    .filter(({ a }) => {
      const chave = `${a.largura}x${a.altura}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .map(({ a }) => a);
}

export function arrumarLocal(local: LocalAArrumar): Arrumacao {
  return arrumacoesDoLocal(local)[0] ?? VAZIA;
}

/**
 * Arrumações possíveis de um ou mais locais muito perto uns dos outros (pela ordem dada, de norte para
 * sul), da melhor para a pior: no máximo `quantas`, e com as duas maneiras de juntar os locais
 * (empilhados ou lado a lado) representadas. O mapa escolhe a que melhor cabe à volta dos pontos.
 */
export function opcoesDeArrumacao(locais: readonly LocalAArrumar[], quantas = 3): Arrumacao[] {
  if (locais.length === 0) return [VAZIA];
  if (locais.length === 1) return arrumacoesDoLocal(locais[0] as LocalAArrumar).slice(0, quantas);
  const opcoes = locais.map((l) => arrumacoesDoLocal(l).slice(0, MELHORES_POR_LOCAL));
  const porDirecao = (['baixo', 'lado'] as const).map((direcao) => {
    // Produto cartesiano das opções de cada local (poucos locais e poucas opções).
    let parciais: Arrumacao[] = [VAZIA];
    for (const lista of opcoes) {
      parciais = parciais.flatMap((p) => lista.map((a) => juntar(p, a, direcao, FOLGA_LOCAIS)));
    }
    return parciais.map((a) => ({ a, p: pontuacao(a) })).sort((x, y) => x.p - y.p);
  });
  const metade = Math.max(1, Math.ceil(quantas / 2));
  return [...(porDirecao[0] ?? []).slice(0, metade), ...(porDirecao[1] ?? []).slice(0, metade)]
    .sort((x, y) => x.p - y.p)
    .slice(0, Math.max(quantas, 2))
    .map(({ a }) => a);
}

/** A melhor arrumação de um ou mais locais juntos. */
export function arrumarLocais(locais: readonly LocalAArrumar[]): Arrumacao {
  return opcoesDeArrumacao(locais, 1)[0] ?? VAZIA;
}

/** Caixa (píxeis base) de um local dentro do bloco: os seus cartões e o seu rótulo. */
export function caixaDoLocal(a: Arrumacao, localId: Id, chaves: ReadonlySet<string>): Retangulo | null {
  return uniao([
    ...a.cartoes
      .filter((c) => chaves.has(c.chave))
      .map((c) => ({ x: c.x, y: c.y, largura: c.geometria.largura, altura: c.geometria.altura })),
    ...a.rotulos.filter((r) => r.localId === localId).map((r) => r.retangulo),
  ]);
}
