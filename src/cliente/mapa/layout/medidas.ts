// Geometria interna dos cartões, calculada (não medida no DOM), em píxeis "base" (escala 1).
// No mapa, cada grupo desenha-se com transform: scale(escala) (escala.ts): o layout multiplica estas
// medidas pela escala e as colisões, as linhas de foco e o ecrã usam os mesmos números, sem medir nada
// depois de renderizar (sem saltos nem ciclos de medição).
// O tamanho de uma casa ou carrinha depende só dos lugares a desenhar (lotação/lugares, ou os ocupados
// se houver gente a mais), nunca de quem lá está. A obra cresce com o número de pessoas.
// Os carros (tipo 'carro') usam a mesma geometria com outras medidas: mais curtos e arredondados, com
// capô, para-brisas e vidro de trás.

import type { TipoVeiculo } from '../../../dominio/tipos';
import type { Retangulo } from './geometria';

/** Célula de um nome (NomeChip compacto): largura, altura e passo entre linhas. */
export const NOME = { largura: 84, altura: 12, passo: 13, entreColunas: 2 } as const;

/** Linha de estado (pastilha da lotação, marca "sugerido"). */
const LINHA_ESTADO = 12;

const CASA = {
  /** Beiral: quanto o telhado sai para cada lado do corpo. */
  beiral: 5,
  telhado: 20,
  borda: 1,
  margem: 3,
  folga: 1,
} as const;

const CARRINHA = {
  /** Quanto as rodas saem da carroçaria para cada lado. */
  roda: 3,
  /** Comprimento das rodas (no sentido do comprimento da carrinha); na compacta, um pouco mais curtas. */
  comprimentoRoda: 16,
  comprimentoRodaCompacta: 11,
  /** Distância das rodas à frente e à traseira da carroçaria. */
  recuoRoda: 6,
  borda: 1,
  lado: 4,
  topo: 3,
  placa: 14,
  parabrisas: 7,
  folga: 2,
  fundo: 2,
} as const;

/**
 * Carro visto de cima: o mesmo esquema da carrinha (matrícula, para-brisas, um nome por linha, traseira),
 * mas com o nariz e a traseira mais redondos, o capô (onde vai a matrícula), os vidros à volta do
 * tejadilho (para-brisas, vidros laterais finos e vidro de trás) e rodas mais curtas. Para os mesmos
 * lugares fica mais curto do que a carrinha.
 */
const CARRO = {
  roda: 3,
  comprimentoRoda: 12,
  comprimentoRodaCompacta: 10,
  /**
   * Distância das rodas ao nariz e à traseira: ficam onde os lados já são direitos (os cantos são muito
   * redondos), com o capô e a bagageira a sair para lá delas, como num carro.
   */
  recuoRodas: 13,
  recuoRodasCompacto: 8,
  borda: 1,
  lado: 4,
  topo: 2,
  placa: 14,
  /** Capô entre a matrícula e o para-brisas. */
  capo: 2,
  parabrisas: 5,
  folga: 1,
  /** Os vidros (para-brisas, laterais e de trás) começam a esta distância do lado da carroçaria. */
  margemVidros: 1.5,
  vidroTraseiro: 3,
  /** A linha de estado fica mais para dentro, por causa da traseira arredondada. */
  recolhaEstado: 4,
  fundo: 1,
} as const;

const OBRA = { borda: 1, lado: 4, faixa: 4, cabecalho: 14, folga: 2, fundo: 3, larguraMinima: 124 } as const;

/** Uma obra com mais pessoas do que isto passa a duas colunas. */
export const OBRA_MAX_UMA_COLUNA = 8;

export interface GeometriaCasa {
  tipo: 'casa';
  largura: number;
  altura: number;
  /** Caixa do telhado (triângulo com beirais), em cima. */
  telhado: Retangulo;
  /** Paredes (por baixo do telhado). */
  corpo: Retangulo;
  /** Onde se escreve o nome da casa, dentro do frontão. */
  frontao: Retangulo;
  /** Linha de estado: a pastilha da lotação à direita. */
  estado: Retangulo;
  /** Um retângulo por lugar desenhado (duas colunas), pela ordem dos moradores. */
  lugares: Retangulo[];
}

export interface GeometriaCarrinha {
  tipo: 'carrinha';
  /** Carrinha ou carro: muda a silhueta e as medidas (o carro é mais curto e arredondado). */
  veiculo: TipoVeiculo;
  /** Sem os nomes (modo compacto): só a matrícula e a lotação. */
  compacta: boolean;
  largura: number;
  altura: number;
  /** Carroçaria (sem as rodas). */
  corpo: Retangulo;
  /** Faixa da frente onde vai a matrícula (centrada). */
  placa: Retangulo;
  parabrisas: Retangulo;
  /** Quatro rodas, de fora da carroçaria: frente esquerda, frente direita, trás esquerda, trás direita. */
  rodas: [Retangulo, Retangulo, Retangulo, Retangulo];
  /** Vidro de trás (só nos carros). */
  vidroTraseiro: Retangulo | null;
  /** Um lugar por linha. */
  lugares: Retangulo[];
  /**
   * Marca "sugerido" à esquerda, pastilha da lotação à direita: na traseira (no carro inteiro, depois do
   * vidro de trás; no carro compacto, no tejadilho, antes do vidro de trás).
   */
  estado: Retangulo;
}

export interface GeometriaObra {
  tipo: 'obra';
  largura: number;
  altura: number;
  /** Faixa fina com a cor do cliente, em cima. */
  faixa: Retangulo;
  /** Ícone e nome da obra. */
  cabecalho: Retangulo;
  lugares: Retangulo[];
}

export type GeometriaCartao = GeometriaCasa | GeometriaCarrinha | GeometriaObra;

/** Lugares a desenhar: a lotação, ou mais se houver gente a mais (esses ficam marcados). */
export function lugaresADesenhar(capacidade: number, ocupados: number): number {
  return Math.max(0, capacidade, ocupados);
}

/** Grelha de nomes com `colunas` colunas, a partir de (x0, y0). */
function grelhaNomes(
  n: number,
  colunas: number,
  x0: number,
  y0: number,
  largura: number = NOME.largura,
): Retangulo[] {
  const lugares: Retangulo[] = [];
  for (let i = 0; i < n; i++) {
    lugares.push({
      x: x0 + (i % colunas) * (largura + NOME.entreColunas),
      y: y0 + Math.floor(i / colunas) * NOME.passo,
      largura,
      altura: NOME.altura,
    });
  }
  return lugares;
}

/** Altura de `linhas` linhas de nomes (pelo menos uma, para o cartão nunca ficar sem corpo). */
function alturaLinhas(linhas: number): number {
  return Math.max(1, linhas) * NOME.passo - (NOME.passo - NOME.altura);
}

const larguraColunas = (colunas: number) => colunas * NOME.largura + (colunas - 1) * NOME.entreColunas;

/** Casa vista de frente: telhado de duas águas com beirais e chaminé, nomes em duas colunas. */
export function geometriaCasa(nLugares: number): GeometriaCasa {
  const m = CASA;
  const larguraCorpo = 2 * (m.borda + m.margem) + larguraColunas(2);
  const largura = larguraCorpo + 2 * m.beiral;
  const xConteudo = m.beiral + m.borda + m.margem;
  const larguraConteudo = larguraCorpo - 2 * (m.borda + m.margem);
  const estado = { x: xConteudo, y: m.telhado + m.folga, largura: larguraConteudo, altura: LINHA_ESTADO };
  const y0 = estado.y + estado.altura + m.folga;
  const linhas = Math.ceil(nLugares / 2);
  const altura = y0 + alturaLinhas(linhas) + m.margem + m.borda;
  // O nome fica na parte larga do frontão (o triângulo estreita para cima).
  const larguraFrontao = Math.round(largura * 0.44);
  return {
    tipo: 'casa',
    largura,
    altura,
    telhado: { x: 0, y: 0, largura, altura: m.telhado },
    corpo: { x: m.beiral, y: m.telhado, largura: larguraCorpo, altura: altura - m.telhado },
    frontao: {
      x: Math.round((largura - larguraFrontao) / 2),
      y: m.telhado - 13,
      largura: larguraFrontao,
      altura: 12,
    },
    estado,
    lugares: grelhaNomes(nLugares, 2, xConteudo, y0),
  };
}

/** Largura da carroçaria da carrinha compacta: o que a matrícula precisa. */
const CORPO_COMPACTA = 76;

/**
 * Carrinha vista de cima, frente para cima: matrícula, para-brisas, um lugar por linha, traseira, e as
 * quatro rodas a sair um pouco dos lados (compridas, como se veem de cima).
 * Compacta (modo compacto do mapa): mais estreita, sem os lugares, só a matrícula e a lotação.
 */
export function geometriaCarrinha(
  nLugares: number,
  compacta = false,
  veiculo: TipoVeiculo = 'carrinha',
): GeometriaCarrinha {
  if (veiculo === 'carro') return geometriaCarro(nLugares, compacta);
  const m = CARRINHA;
  const larguraCorpo = compacta ? CORPO_COMPACTA : 2 * (m.borda + m.lado) + NOME.largura;
  const largura = larguraCorpo + 2 * m.roda;
  const placa = { x: m.roda + 6, y: m.topo, largura: larguraCorpo - 12, altura: m.placa };
  const parabrisas = {
    x: m.roda + 4,
    y: placa.y + placa.altura + 2,
    largura: larguraCorpo - 8,
    altura: m.parabrisas,
  };
  const y0 = parabrisas.y + parabrisas.altura + m.folga;
  const xNomes = m.roda + m.borda + m.lado;
  const estado = {
    x: xNomes,
    y: compacta ? y0 + 1 : y0 + alturaLinhas(nLugares) + 1,
    largura: larguraCorpo - 2 * (m.borda + m.lado),
    altura: LINHA_ESTADO,
  };
  const altura = estado.y + estado.altura + m.fundo + (compacta ? 1 : 0);
  // Cada roda entra 2 px por baixo da carroçaria (só se vê o que sai para o lado).
  const comprimento = compacta ? m.comprimentoRodaCompacta : m.comprimentoRoda;
  const roda = (x: number, y: number) => ({ x, y, largura: m.roda + 2, altura: comprimento });
  const xDireita = largura - m.roda - 2;
  const yTras = altura - m.recuoRoda - comprimento;
  return {
    tipo: 'carrinha',
    veiculo: 'carrinha',
    compacta,
    largura,
    altura,
    corpo: { x: m.roda, y: 0, largura: larguraCorpo, altura },
    placa,
    parabrisas,
    rodas: [roda(0, m.recuoRoda), roda(xDireita, m.recuoRoda), roda(0, yTras), roda(xDireita, yTras)],
    vidroTraseiro: null,
    lugares: compacta ? [] : grelhaNomes(nLugares, 1, xNomes, y0),
    estado,
  };
}

/**
 * Carro visto de cima, frente para cima: capô com a matrícula, para-brisas, um lugar por linha, vidro de
 * trás e a bagageira com a lotação. Compacto: sem os lugares; a lotação vai no tejadilho, antes do vidro
 * de trás. Mesma largura da carrinha (os nomes são iguais), mas mais curto.
 */
function geometriaCarro(nLugares: number, compacta: boolean): GeometriaCarrinha {
  const m = CARRO;
  const larguraCorpo = compacta ? CORPO_COMPACTA : 2 * (m.borda + m.lado) + NOME.largura;
  const largura = larguraCorpo + 2 * m.roda;
  const placa = { x: m.roda + 6, y: m.topo, largura: larguraCorpo - 12, altura: m.placa };
  const parabrisas = {
    x: m.roda + m.margemVidros,
    y: placa.y + placa.altura + m.capo,
    largura: larguraCorpo - 2 * m.margemVidros,
    altura: m.parabrisas,
  };
  const y0 = parabrisas.y + parabrisas.altura + m.folga;
  const xNomes = m.roda + m.borda + m.lado;
  const larguraNomes = larguraCorpo - 2 * (m.borda + m.lado);
  const estadoEm = (y: number) => ({
    x: xNomes + m.recolhaEstado,
    y,
    largura: larguraNomes - 2 * m.recolhaEstado,
    altura: LINHA_ESTADO,
  });
  const vidroEm = (y: number) => ({
    x: m.roda + m.margemVidros,
    y,
    largura: larguraCorpo - 2 * m.margemVidros,
    altura: m.vidroTraseiro,
  });
  let estado: Retangulo;
  let vidroTraseiro: Retangulo;
  let altura: number;
  if (compacta) {
    estado = estadoEm(y0);
    vidroTraseiro = vidroEm(estado.y + estado.altura + 1);
    altura = vidroTraseiro.y + vidroTraseiro.altura + 3;
  } else {
    vidroTraseiro = vidroEm(y0 + alturaLinhas(nLugares) + 1);
    estado = estadoEm(vidroTraseiro.y + vidroTraseiro.altura + 1);
    altura = estado.y + estado.altura + m.fundo;
  }
  const comprimento = compacta ? m.comprimentoRodaCompacta : m.comprimentoRoda;
  const roda = (x: number, y: number) => ({ x, y, largura: m.roda + 2, altura: comprimento });
  const xDireita = largura - m.roda - 2;
  const recuo = compacta ? m.recuoRodasCompacto : m.recuoRodas;
  const yTras = altura - recuo - comprimento;
  return {
    tipo: 'carrinha',
    veiculo: 'carro',
    compacta,
    largura,
    altura,
    corpo: { x: m.roda, y: 0, largura: larguraCorpo, altura },
    placa,
    parabrisas,
    rodas: [roda(0, recuo), roda(xDireita, recuo), roda(0, yTras), roda(xDireita, yTras)],
    vidroTraseiro,
    lugares: compacta ? [] : grelhaNomes(nLugares, 1, xNomes, y0),
    estado,
  };
}

/** Obra: faixa da cor do cliente, ícone e nome, e as pessoas em lista (duas colunas se forem muitas). */
export function geometriaObra(nPessoas: number): GeometriaObra {
  const m = OBRA;
  const colunas = nPessoas > OBRA_MAX_UMA_COLUNA ? 2 : 1;
  // Uma coluna é estreita para o nome da obra: o cartão tem uma largura mínima e os nomes esticam.
  const larguraConteudo = Math.max(larguraColunas(colunas), m.larguraMinima);
  const larguraNome = colunas === 1 ? larguraConteudo : NOME.largura;
  const largura = 2 * (m.borda + m.lado) + larguraConteudo;
  const cabecalho = {
    x: m.borda + m.lado,
    y: m.faixa + m.folga,
    largura: largura - 2 * (m.borda + m.lado),
    altura: m.cabecalho,
  };
  const y0 = cabecalho.y + cabecalho.altura + m.folga;
  const altura = y0 + alturaLinhas(Math.ceil(nPessoas / colunas)) + m.fundo + m.borda;
  return {
    tipo: 'obra',
    largura,
    altura,
    faixa: { x: 0, y: 0, largura, altura: m.faixa },
    cabecalho,
    lugares: grelhaNomes(nPessoas, colunas, m.borda + m.lado, y0, larguraNome),
  };
}

const RESUMO = { margem: 5, topo: 3, nome: 12, folga: 2, linha: 13, fundo: 3 } as const;
/** Largura de cada parte da linha do resumo: ícone + pastilha "31/32 ●". */
const PARTE_RESUMO = 58;

export interface GeometriaResumo {
  largura: number;
  altura: number;
  nome: Retangulo;
  /** Linha com uma parte por tipo presente (casas, carrinhas, obras). */
  linha: Retangulo;
}

/** Pastilha de um local afastado: nome e, numa linha, ícone + ocupados/lugares de cada tipo. */
export function geometriaResumo(partes: number): GeometriaResumo {
  const m = RESUMO;
  const larguraLinha = Math.max(1, partes) * PARTE_RESUMO;
  const largura = larguraLinha + 2 * m.margem;
  const nome = { x: m.margem, y: m.topo, largura: larguraLinha, altura: m.nome };
  const linha = { x: m.margem, y: nome.y + nome.altura + m.folga, largura: larguraLinha, altura: m.linha };
  return { largura, altura: linha.y + linha.altura + m.fundo, nome, linha };
}
