// Geometria interna dos cartões, calculada (não medida no DOM).
// Os componentes desenham com estas posições exatas; assim as colisões e as linhas de foco usam
// os mesmos números que o ecrã, sem medir nada depois de renderizar (sem saltos nem ciclos de medição).
// O tamanho de um cartão depende só do nível e do número de lugares a desenhar
// (lotação/lugares, ou os ocupados se houver gente a mais), nunca de quem lá está.

import type { Retangulo } from './geometria';
import type { NivelCartao } from './niveis';

/** Quadradinho de um lugar (nível "lugares"). */
export const QUADRADO = 12;
const PASSO_QUADRADO = 15;

/** Nome de uma pessoa (nível "nomes"). */
export const CHIP = { largura: 128, altura: 21 } as const;
const PASSO_CHIP_X = 132;
const PASSO_CHIP_Y = 24;

const CASA = {
  lugares: { largura: 120, telhado: 12, borda: 2, margem: 4, cabecalho: 16, aviso: 14, folga: 2, fundo: 5 },
  nomes: { largura: 276, telhado: 14, borda: 2, margem: 6, cabecalho: 18, aviso: 15, folga: 3, fundo: 6 },
} as const;

const CARRINHA = {
  lugares: {
    largura: 96,
    borda: 2,
    topo: 5,
    placa: 15,
    parabrisas: 6,
    recuoParabrisas: 12,
    folga: 4,
    fundo: 6,
  },
  nomes: {
    largura: 276,
    borda: 2,
    topo: 6,
    placa: 18,
    parabrisas: 7,
    recuoParabrisas: 20,
    folga: 4,
    fundo: 4,
  },
} as const;

/** Marca "onde dorme: sugerido": um canto ao lado da última fila (lugares) ou uma fila atrás (nomes). */
const MARCA_CANTO = 12;
const MARCA_FILA = 14;

const RESUMO = { largura: 176, margem: 6, topo: 4, nome: 16, linha: 14, folga: 2, fundo: 5 } as const;

export const GRUPO = {
  margem: 6,
  folga: 6,
  cabecalho: 22,
  rotulo: 14,
  larguraMinima: 150,
  larguraMaxima: { lugares: 504, nomes: 840 },
} as const;

export interface GeometriaCasa {
  tipo: 'casa';
  nivel: NivelCartao;
  largura: number;
  altura: number;
  telhado: Retangulo;
  /** Caixa com contorno (por baixo do telhado). */
  corpo: Retangulo;
  cabecalho: Retangulo;
  aviso: Retangulo | null;
  /** Um retângulo por lugar desenhado, pela ordem dos moradores. */
  lugares: Retangulo[];
}

export interface GeometriaCarrinha {
  tipo: 'carrinha';
  nivel: NivelCartao;
  largura: number;
  altura: number;
  /** Fila da frente: placa com a matrícula e pastilha da lotação. */
  placa: Retangulo;
  parabrisas: Retangulo;
  lugares: Retangulo[];
  /** Onde vai a marca "onde dorme: sugerido" (canto atrás à direita, ou fila atrás nos nomes). */
  marca: Retangulo;
}

export type GeometriaCartao = GeometriaCasa | GeometriaCarrinha;

/** Lugares a desenhar: a lotação, ou mais se houver gente a mais (esses ficam marcados). */
export function lugaresADesenhar(capacidade: number, ocupados: number): number {
  return Math.max(0, capacidade, ocupados);
}

/** Lugares por fila numa carrinha vista de cima: frente com 2 (ou 3 nas grandes), depois filas de até 3. */
export function filasCarrinha(n: number): number[] {
  if (n <= 0) return [];
  if (n <= 3) return [n];
  const frente = n >= 8 ? 3 : 2;
  const resto = n - frente;
  const nFilas = Math.ceil(resto / 3);
  const base = Math.floor(resto / nFilas);
  const filas = new Array<number>(nFilas).fill(base);
  // Os lugares que sobram vão para as filas de trás (o banco corrido).
  for (let i = nFilas - 1, extra = resto % nFilas; extra > 0; i--, extra--) filas[i] = base + 1;
  return [frente, ...filas];
}

/** Grelha de nomes em 2 colunas (nível "nomes"). */
function grelhaChips(n: number, x0: number, y0: number): { lugares: Retangulo[]; fim: number } {
  const lugares: Retangulo[] = [];
  for (let i = 0; i < n; i++) {
    lugares.push({
      x: x0 + (i % 2) * PASSO_CHIP_X,
      y: y0 + Math.floor(i / 2) * PASSO_CHIP_Y,
      largura: CHIP.largura,
      altura: CHIP.altura,
    });
  }
  const filas = Math.ceil(n / 2);
  return { lugares, fim: filas > 0 ? y0 + (filas - 1) * PASSO_CHIP_Y + CHIP.altura : y0 };
}

const COLUNAS_CASA_LUGARES = 7;

export function geometriaCasa(nivel: NivelCartao, nLugares: number, comAviso: boolean): GeometriaCasa {
  const m = CASA[nivel];
  const largura = m.largura;
  const corpoY = m.telhado - 1;
  const xConteudo = m.borda + m.margem;
  const larguraConteudo = largura - 2 * xConteudo;
  let y = corpoY + m.borda + m.folga;
  const cabecalho = { x: xConteudo, y, largura: larguraConteudo, altura: m.cabecalho };
  y += m.cabecalho + m.folga;
  let aviso: Retangulo | null = null;
  if (comAviso) {
    aviso = { x: xConteudo, y, largura: larguraConteudo, altura: m.aviso };
    y += m.aviso + m.folga;
  }

  let lugares: Retangulo[];
  let fim: number;
  if (nivel === 'lugares') {
    const larguraGrelha = COLUNAS_CASA_LUGARES * PASSO_QUADRADO - (PASSO_QUADRADO - QUADRADO);
    const x0 = xConteudo + Math.floor((larguraConteudo - larguraGrelha) / 2);
    lugares = [];
    for (let i = 0; i < nLugares; i++) {
      lugares.push({
        x: x0 + (i % COLUNAS_CASA_LUGARES) * PASSO_QUADRADO,
        y: y + Math.floor(i / COLUNAS_CASA_LUGARES) * PASSO_QUADRADO,
        largura: QUADRADO,
        altura: QUADRADO,
      });
    }
    const filas = Math.ceil(nLugares / COLUNAS_CASA_LUGARES);
    fim = filas > 0 ? y + (filas - 1) * PASSO_QUADRADO + QUADRADO : y;
  } else {
    ({ lugares, fim } = grelhaChips(nLugares, xConteudo, y));
  }

  const altura = fim + m.fundo + m.borda;
  return {
    tipo: 'casa',
    nivel,
    largura,
    altura,
    telhado: { x: 0, y: 0, largura, altura: m.telhado },
    corpo: { x: 0, y: corpoY, largura, altura: altura - corpoY },
    cabecalho,
    aviso,
    lugares,
  };
}

export function geometriaCarrinha(nivel: NivelCartao, nLugares: number): GeometriaCarrinha {
  const m = CARRINHA[nivel];
  const largura = m.largura;
  const xConteudo = m.borda + 4;
  const larguraConteudo = largura - 2 * xConteudo;
  const placa = { x: xConteudo, y: m.topo, largura: larguraConteudo, altura: m.placa };
  const parabrisas = {
    x: m.recuoParabrisas,
    y: placa.y + placa.altura + 3,
    largura: largura - 2 * m.recuoParabrisas,
    altura: m.parabrisas,
  };
  const y0 = parabrisas.y + parabrisas.altura + m.folga;

  if (nivel === 'lugares') {
    const lugares: Retangulo[] = [];
    let y = y0;
    for (const k of filasCarrinha(nLugares)) {
      const larguraFila = k * PASSO_QUADRADO - (PASSO_QUADRADO - QUADRADO);
      const x0 = Math.floor((largura - larguraFila) / 2);
      for (let j = 0; j < k; j++) {
        lugares.push({ x: x0 + j * PASSO_QUADRADO, y, largura: QUADRADO, altura: QUADRADO });
      }
      y += PASSO_QUADRADO;
    }
    const fim = lugares.length > 0 ? y - (PASSO_QUADRADO - QUADRADO) : y0 + QUADRADO;
    // As filas têm no máximo 3 lugares ao centro: o canto de trás à direita fica livre.
    const marca = {
      x: largura - m.borda - 3 - MARCA_CANTO,
      y: fim - MARCA_CANTO,
      largura: MARCA_CANTO,
      altura: MARCA_CANTO,
    };
    return { tipo: 'carrinha', nivel, largura, altura: fim + m.fundo, placa, parabrisas, lugares, marca };
  }

  const { lugares, fim } = grelhaChips(nLugares, m.borda + 6, y0);
  const marca = { x: xConteudo, y: fim + 3, largura: larguraConteudo, altura: MARCA_FILA };
  return {
    tipo: 'carrinha',
    nivel,
    largura,
    altura: marca.y + marca.altura + m.fundo,
    placa,
    parabrisas,
    lugares,
    marca,
  };
}

export interface GeometriaResumo {
  largura: number;
  altura: number;
  nome: Retangulo;
  linhaCasas: Retangulo | null;
  linhaCarrinhas: Retangulo | null;
}

/** Pastilha de um grupo no nível "resumo". */
export function geometriaResumo(temCasas: boolean, temCarrinhas: boolean): GeometriaResumo {
  const m = RESUMO;
  const largura = m.largura;
  const larguraLinha = largura - 2 * m.margem;
  let y = m.topo;
  const nome = { x: m.margem, y, largura: larguraLinha, altura: m.nome };
  y += m.nome + m.folga;
  let linhaCasas: Retangulo | null = null;
  if (temCasas) {
    linhaCasas = { x: m.margem, y, largura: larguraLinha, altura: m.linha };
    y += m.linha + m.folga;
  }
  let linhaCarrinhas: Retangulo | null = null;
  if (temCarrinhas) {
    linhaCarrinhas = { x: m.margem, y, largura: larguraLinha, altura: m.linha };
    y += m.linha + m.folga;
  }
  return { largura, altura: y - m.folga + m.fundo, nome, linhaCasas, linhaCarrinhas };
}

export interface ElementoGrupo {
  chave: string;
  geometria: GeometriaCartao;
}

export interface FilhoGrupo extends ElementoGrupo {
  /** Posição dentro do grupo. */
  x: number;
  y: number;
}

export interface GeometriaGrupo {
  largura: number;
  altura: number;
  cabecalho: Retangulo;
  /** Rótulo "Carrinhas que dormem aqui" (só se houver carrinhas). */
  rotuloCarrinhas: Retangulo | null;
  filhos: FilhoGrupo[];
}

interface Prateleiras {
  posicoes: { x: number; y: number }[];
  largura: number;
  altura: number;
}

/** Arruma da esquerda para a direita e muda de fila quando passa a largura máxima. Mantém a ordem. */
export function prateleiras(
  itens: readonly { largura: number; altura: number }[],
  larguraMaxima: number,
  folga: number,
): Prateleiras {
  const posicoes: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let alturaFila = 0;
  let largura = 0;
  for (const item of itens) {
    if (x > 0 && x + item.largura > larguraMaxima) {
      y += alturaFila + folga;
      x = 0;
      alturaFila = 0;
    }
    posicoes.push({ x, y });
    largura = Math.max(largura, x + item.largura);
    alturaFila = Math.max(alturaFila, item.altura);
    x += item.largura + folga;
  }
  return { posicoes, largura, altura: itens.length > 0 ? y + alturaFila : 0 };
}

/** Cartão de grupo: cabeçalho, casas e, por baixo, as carrinhas que lá dormem. */
export function geometriaGrupo(
  casas: readonly ElementoGrupo[],
  carrinhas: readonly ElementoGrupo[],
): GeometriaGrupo {
  const g = GRUPO;
  const algumNomes = [...casas, ...carrinhas].some((e) => e.geometria.nivel === 'nomes');
  const larguraMaxima = algumNomes ? g.larguraMaxima.nomes : g.larguraMaxima.lugares;
  const blocoCasas = prateleiras(
    casas.map((e) => e.geometria),
    larguraMaxima,
    g.folga,
  );
  const blocoCarrinhas = prateleiras(
    carrinhas.map((e) => e.geometria),
    larguraMaxima,
    g.folga,
  );

  const largura = Math.max(
    g.larguraMinima,
    Math.max(blocoCasas.largura, blocoCarrinhas.largura) + 2 * g.margem,
  );
  const filhos: FilhoGrupo[] = [];
  let y = g.cabecalho;
  casas.forEach((e, i) => {
    const p = blocoCasas.posicoes[i] as { x: number; y: number };
    filhos.push({ ...e, x: g.margem + p.x, y: y + p.y });
  });
  if (casas.length > 0) y += blocoCasas.altura + g.folga;

  let rotuloCarrinhas: Retangulo | null = null;
  if (carrinhas.length > 0) {
    rotuloCarrinhas = { x: g.margem, y, largura: largura - 2 * g.margem, altura: g.rotulo };
    y += g.rotulo + 2;
    carrinhas.forEach((e, i) => {
      const p = blocoCarrinhas.posicoes[i] as { x: number; y: number };
      filhos.push({ ...e, x: g.margem + p.x, y: y + p.y });
    });
    y += blocoCarrinhas.altura + g.folga;
  }

  return {
    largura,
    altura: y - g.folga + g.margem,
    cabecalho: { x: g.margem, y: 2, largura: largura - 2 * g.margem, altura: g.cabecalho - 4 },
    rotuloCarrinhas,
    filhos,
  };
}
