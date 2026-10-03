// Arrumação dos cartões de um local (ou de locais muito perto, abertos juntos a partir do resumo) num
// bloco compacto, em píxeis base. Regras:
// - as casas em grelha (linhas alinhadas em baixo, como casas na rua), as carrinhas em fila ao lado
//   ou por baixo das casas, as obras a seguir;
// - experimentam-se todas as combinações (colunas de cada grelha, ao lado/por baixo) e fica a que
//   ocupa menos área sem ficar alta e estreita (o espaço vertical é o que mais falta no ecrã);
// - os locais com várias casas (ou só com carrinhas) levam um rótulo com o nome do local por cima (ou
//   por baixo), numa faixa da largura dos cartões; depois de o bloco ter sítio no mapa, o rótulo desliza
//   na faixa até ficar junto do ponto do local (rotulosJuntoDosPontos);
// - um local com um vizinho (as duas ruas de Himeling) fica todo de um lado do ponto (`lado`): as casas
//   numa grelha compacta (4 casas em 2×2) do lado de dentro, junto do ponto, e as carrinhas e as obras
//   por baixo delas ou do lado de fora (arrumacoesDeLado).

import type { Id } from '../../../dominio/tipos';
import { type Retangulo, uniao } from './geometria';
import type { GeometriaCartao } from './medidas';
import type { Ponto } from './projecao';
import { larguraRotulo } from './textos';

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

export type AlinhamentoRotulo = 'esquerda' | 'centro' | 'direita';

export interface RotuloArrumado {
  localId: Id;
  texto: string;
  /** Onde se escreve o nome: a largura estimada do texto (por excesso), dentro da faixa. */
  retangulo: Retangulo;
  /** A linha reservada ao rótulo (a largura dos cartões do local): o rótulo pode deslizar nela. */
  faixa: Retangulo;
  /** O texto encosta ao lado do ponto do local (a largura estimada sobra do outro lado). */
  alinhamento: AlinhamentoRotulo;
}

export interface Arrumacao {
  largura: number;
  altura: number;
  cartoes: CartaoArrumado[];
  rotulos: RotuloArrumado[];
}

/** De que lado do ponto fica o bloco de um local com vizinho (ver disposicao.ts, ladosDosVizinhos). */
export type LadoDoPonto = 'esquerda' | 'direita';

export interface LocalAArrumar {
  localId: Id;
  /** Rótulo por cima dos cartões (null = sem rótulo: o nome já está na casa). */
  rotulo: string | null;
  casas: readonly ElementoCartao[];
  carrinhas: readonly ElementoCartao[];
  obras: readonly ElementoCartao[];
  /**
   * O bloco fica todo deste lado do ponto (locais vizinhos lado a lado): só arrumações com as casas em
   * grelha compacta junto do ponto e o resto por baixo ou do lado de fora.
   */
  lado?: LadoDoPonto | null;
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
      faixa: { ...r.faixa, x: r.faixa.x + dx, y: r.faixa.y + dy },
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
/** Alinhamento na outra direção: em cima/à esquerda ('inicio'), ao meio ou em baixo/à direita ('fim'). */
export type Alinhamento = 'inicio' | 'centro' | 'fim';

function desvio(total: number, tamanho: number, alinhamento: Alinhamento): number {
  if (alinhamento === 'inicio') return 0;
  return alinhamento === 'fim' ? total - tamanho : Math.floor((total - tamanho) / 2);
}

/**
 * Junta dois blocos: lado a lado (por omissão alinhados em baixo) ou um por baixo do outro (por omissão
 * centrados).
 */
export function juntar(
  a: Arrumacao,
  b: Arrumacao,
  direcao: Direcao,
  folga = FOLGA_CARTOES,
  alinhamento: Alinhamento = direcao === 'lado' ? 'fim' : 'centro',
): Arrumacao {
  if (a.cartoes.length === 0 && a.rotulos.length === 0) return b;
  if (b.cartoes.length === 0 && b.rotulos.length === 0) return a;
  if (direcao === 'lado') {
    const altura = Math.max(a.altura, b.altura);
    const pa = deslocar(a, 0, desvio(altura, a.altura, alinhamento));
    const pb = deslocar(b, a.largura + folga, desvio(altura, b.altura, alinhamento));
    return {
      largura: a.largura + folga + b.largura,
      altura,
      cartoes: [...pa.cartoes, ...pb.cartoes],
      rotulos: [...pa.rotulos, ...pb.rotulos],
    };
  }
  const largura = Math.max(a.largura, b.largura);
  const pa = deslocar(a, desvio(largura, a.largura, alinhamento), 0);
  const pb = deslocar(b, desvio(largura, b.largura, alinhamento), a.altura + folga);
  return {
    largura,
    altura: a.altura + folga + b.altura,
    cartoes: [...pa.cartoes, ...pb.cartoes],
    rotulos: [...pa.rotulos, ...pb.rotulos],
  };
}

/**
 * O nome do local por cima dos cartões ou, em alternativa, por baixo: quando o bloco fica por baixo do
 * ponto, o rótulo em baixo deixa as casas encostadas ao ponto (o pino não atravessa o rótulo).
 */
function comRotulo(a: Arrumacao, localId: Id, texto: string | null, embaixo = false): Arrumacao {
  if (!texto) return a;
  const altura = a.altura + ROTULO.altura + ROTULO.folga;
  const deslocada = embaixo ? a : deslocar(a, 0, ROTULO.altura + ROTULO.folga);
  const y = embaixo ? a.altura + ROTULO.folga : 0;
  return {
    ...deslocada,
    altura,
    rotulos: [
      // Só a largura do texto (o pino pode chegar ao rótulo: é o nome do sítio), à esquerda da faixa até
      // se saber onde fica o ponto.
      {
        localId,
        texto,
        retangulo: { x: 0, y, largura: Math.min(a.largura, larguraRotulo(texto)), altura: ROTULO.altura },
        faixa: { x: 0, y, largura: a.largura, altura: ROTULO.altura },
        alinhamento: 'esquerda',
      },
      ...deslocada.rotulos,
    ],
  };
}

/**
 * Leva o rótulo de cada local, dentro da sua faixa, para junto do ponto desse local (`pontos`, em píxeis
 * base relativos ao bloco): centrado na vertical do ponto ou, se o ponto ficar para lá de uma ponta da
 * faixa, encostado a essa ponta, com o texto alinhado desse lado. Assim o nome do sítio fica junto do sítio
 * mesmo quando o bloco está todo para um lado do ponto. A distância do ponto ao rótulo fica igual à
 * distância do ponto à faixa (é o que a colocação dos blocos usa).
 */
export function rotulosJuntoDosPontos(a: Arrumacao, pontos: ReadonlyMap<Id, Ponto>): Arrumacao {
  if (a.rotulos.length === 0) return a;
  return {
    ...a,
    rotulos: a.rotulos.map((r) => {
      const p = pontos.get(r.localId);
      if (!p) return r;
      const { faixa: f } = r;
      const w = r.retangulo.largura;
      const minimo = f.x;
      const maximo = f.x + f.largura - w;
      const x = Math.min(maximo, Math.max(minimo, Math.round(p.x - w / 2)));
      const alinhamento: AlinhamentoRotulo =
        p.x <= f.x + w / 2 ? 'esquerda' : p.x >= f.x + f.largura - w / 2 ? 'direita' : 'centro';
      return { ...r, retangulo: { ...r.retangulo, x }, alinhamento };
    }),
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

/** Ordem dos cartões no DOM (e do Tab): casas, carrinhas, obras, cada tipo pela ordem dada. */
function porTipo(a: Arrumacao): Arrumacao {
  const ordem = { casa: 0, carrinha: 1, obra: 2 } as const;
  const cartoes = a.cartoes
    .map((c, i) => ({ c, i }))
    .sort((x, y) => ordem[x.c.geometria.tipo] - ordem[y.c.geometria.tipo] || x.i - y.i)
    .map(({ c }) => c);
  return { ...a, cartoes };
}

/**
 * Casas e carrinhas juntas, de todas as maneiras: carrinhas ao lado ou por baixo das casas, ou
 * repartidas pelos dois lados (as casas ficam ao meio, junto do ponto, e o bloco fica centrado no
 * local em vez de pendurado para um lado).
 */
function casasECarrinhas(local: LocalAArrumar, casas: Arrumacao): Arrumacao[] {
  const opcoes: Arrumacao[] = [];
  const n = local.carrinhas.length;
  for (const cv of colunasPossiveis(n)) {
    const carrinhas = grelha(local.carrinhas, cv);
    opcoes.push(juntar(casas, carrinhas, 'lado'));
    if (casas.cartoes.length > 0 && n > 0) opcoes.push(juntar(casas, carrinhas, 'baixo'));
  }
  if (casas.cartoes.length > 0 && n >= 2) {
    // A primeira metade à esquerda, o resto à direita (com um número ímpar, a direita leva mais).
    const esquerda = local.carrinhas.slice(0, Math.floor(n / 2));
    const direita = local.carrinhas.slice(Math.floor(n / 2));
    for (const cv of colunasPossiveis(direita.length)) {
      const ge = grelha(esquerda, Math.min(cv, esquerda.length));
      opcoes.push(juntar(juntar(ge, casas, 'lado'), grelha(direita, cv), 'lado'));
    }
  }
  return opcoes;
}

/** Colunas da grelha compacta de `n` cartões: quase quadrada (4 casas em 2×2, 6 em 3×2). */
export function colunasCompactas(n: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(n)));
}

/**
 * Arrumações de um local que fica todo de um lado do ponto (`lado`): as casas em grelha compacta (o lado
 * de dentro fica junto do ponto) e o rótulo encostado às casas, em cima ou em baixo; as carrinhas e as
 * obras do outro lado das casas (por baixo, ou por cima com o rótulo em baixo) ou numa coluna do lado de
 * fora, alinhada com as casas. Nunca nada entre as casas e o ponto, nem entre as casas e o rótulo. Sem
 * casas (só a camada das carrinhas), as carrinhas ficam elas em grelha compacta.
 */
function arrumacoesDeLado(local: LocalAArrumar, lado: LadoDoPonto): Arrumacao[] {
  const casas = grelha(local.casas, colunasCompactas(local.casas.length));
  const resultado: Arrumacao[] = [];
  for (const rotuloEmBaixo of local.rotulo ? [false, true] : [false]) {
    // `resto` do lado oposto ao rótulo (por baixo das casas, ou por cima) ou do lado de fora.
    // Encostados ao lado de dentro (o do ponto) e, por fora, à linha do rótulo.
    const dentro: Alinhamento = lado === 'esquerda' ? 'fim' : 'inicio';
    const linhaDoRotulo: Alinhamento = rotuloEmBaixo ? 'fim' : 'inicio';
    const alem = (a: Arrumacao, resto: Arrumacao) =>
      rotuloEmBaixo
        ? juntar(resto, a, 'baixo', FOLGA_CARTOES, dentro)
        : juntar(a, resto, 'baixo', FOLGA_CARTOES, dentro);
    const porFora = (a: Arrumacao, resto: Arrumacao) =>
      lado === 'esquerda'
        ? juntar(resto, a, 'lado', FOLGA_CARTOES, linhaDoRotulo)
        : juntar(a, resto, 'lado', FOLGA_CARTOES, linhaDoRotulo);
    const comCarrinhas: Arrumacao[] = [];
    const nv = local.carrinhas.length;
    // Sem casas, as carrinhas é que ficam junto do ponto: também em grelha compacta.
    const colunas = casas.cartoes.length > 0 ? colunasPossiveis(nv) : [colunasCompactas(nv)];
    for (const cv of colunas) {
      const carrinhas = grelha(local.carrinhas, cv);
      comCarrinhas.push(alem(casas, carrinhas));
      if (casas.cartoes.length > 0 && nv > 0) comCarrinhas.push(porFora(casas, carrinhas));
    }
    for (const primeiro of comCarrinhas) {
      for (const co of colunasPossiveis(local.obras.length)) {
        const obras = grelha(local.obras, co);
        const blocos =
          obras.cartoes.length === 0 ? [primeiro] : [alem(primeiro, obras), porFora(primeiro, obras)];
        for (const bloco of blocos)
          resultado.push(porTipo(comRotulo(bloco, local.localId, local.rotulo, rotuloEmBaixo)));
        if (obras.cartoes.length === 0) break;
      }
    }
  }
  return resultado;
}

/** Todas as arrumações de um local, da melhor para a pior (sem repetir arrumações iguais). */
export function arrumacoesDoLocal(local: LocalAArrumar): Arrumacao[] {
  const resultado: Arrumacao[] = [];
  if (local.lado) resultado.push(...arrumacoesDeLado(local, local.lado));
  else {
    for (const cc of colunasPossiveis(local.casas.length)) {
      for (const primeiro of casasECarrinhas(local, grelha(local.casas, cc))) {
        for (const co of colunasPossiveis(local.obras.length)) {
          const obras = grelha(local.obras, co);
          for (const d2 of ['lado', 'baixo'] as const) {
            const bloco = juntar(primeiro, obras, d2);
            resultado.push(porTipo(comRotulo(bloco, local.localId, local.rotulo)));
            if (local.rotulo) resultado.push(porTipo(comRotulo(bloco, local.localId, local.rotulo, true)));
            if (obras.cartoes.length === 0) break;
          }
        }
      }
    }
  }
  const vistos = new Set<string>();
  return resultado
    .map((a, i) => ({ a, i, p: pontuacao(a) }))
    .sort((x, y) => x.p - y.p || x.i - y.i)
    .filter(({ a }) => {
      // O mesmo tamanho com a primeira casa noutro sítio é outra arrumação (ex.: casa ao meio).
      const primeiro = a.cartoes[0];
      const chave = `${a.largura}x${a.altura}:${primeiro?.x ?? 0},${primeiro?.y ?? 0}`;
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
