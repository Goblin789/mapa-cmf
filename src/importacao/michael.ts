// Leitura do ficheiro do Michael: só serve para cruzar com a lista mestra, nunca é fonte.
//
// Disposição confirmada nos ficheiros reais a 03/10/2026 (linhas e colunas como no Excel):
// - "CMF Sarl-CASAS APÓS CONGÉ": linha 3 = casas em B..P, nomes por baixo, linha 17 = contagens.
//   Bloco "FORA CASAS CMF" (título em R2) com nomes em R..T. Lista à parte de pessoas sem casa
//   (a salmão) em F24:F31, sem título.
// - "CMF Sarl - EMPRESAS": linha 3 = clientes em B..H, nomes por baixo, linha 64 = totais.
// - "CMF Sarl - VIATURAS": linha 3 = matrículas em B..Y, nomes por baixo, linha 14 = contagens.
//   Bloco "SEM TRANSPORTE DA EMPRESA!" (título em B19) com nomes em B20:G25 e contagens na linha 26.
// As colunas e a linha das contagens detetam-se (param no primeiro cabeçalho vazio e no primeiro número);
// só a linha dos cabeçalhos e o início da lista a salmão são fixos.

import { chaveNome, indiceColuna, numeroCelula, referencia, textoCelula, valorEm } from './celulas';
import type { DadosMichael, ErroImportacao, GrupoMichael } from './tipos';

/** Linha 3 do Excel. */
const LINHA_CABECALHOS = 2;
/** Coluna B. */
const PRIMEIRA_COLUNA = 1;
/** Lista a salmão: de F24 para baixo, até à primeira célula vazia. */
const SEM_CASA = { linha: 23, coluna: indiceColuna('F') };

function aviso(mensagem: string, onde?: string): ErroImportacao {
  return { bloqueante: false, mensagem, onde };
}

/** Primeira linha a partir de `desde` com um número numa das colunas (a linha das contagens). */
export function linhaContagens(linhas: unknown[][], desde: number, colunas: number[]): number | null {
  for (let i = desde; i < linhas.length; i++) {
    if (colunas.some((j) => numeroCelula(valorEm(linhas, i, j)) !== null)) return i;
  }
  return null;
}

/** Nomes (texto) de uma coluna entre as linhas `de` (inclusive) e `ate` (exclusive). */
function nomesColuna(linhas: unknown[][], coluna: number, de: number, ate: number): string[] {
  const nomes: string[] = [];
  for (let i = de; i < ate; i++) {
    const v = valorEm(linhas, i, coluna);
    const t = typeof v === 'string' ? textoCelula(v) : null;
    if (t) nomes.push(t);
  }
  return nomes;
}

/** Soma dos números de uma linha nas colunas dadas; null se não houver nenhum. */
function somaLinha(linhas: unknown[][], linha: number | null, colunas: number[]): number | null {
  if (linha === null) return null;
  const numeros = colunas.map((j) => numeroCelula(valorEm(linhas, linha, j))).filter((n) => n !== null);
  return numeros.length > 0 ? numeros.reduce((a, b) => a + b, 0) : null;
}

/**
 * Grelha com um cabeçalho por coluna (casas, clientes, matrículas): uma coluna por grupo, da `colunaInicial`
 * até ao primeiro cabeçalho vazio; nomes por baixo até à linha das contagens.
 */
export function lerGrelha(
  linhas: unknown[][],
  linhaCabecalho = LINHA_CABECALHOS,
  colunaInicial = PRIMEIRA_COLUNA,
): GrupoMichael[] {
  const colunas: number[] = [];
  for (let j = colunaInicial; textoCelula(valorEm(linhas, linhaCabecalho, j)) !== null; j++) colunas.push(j);
  const contagens = linhaContagens(linhas, linhaCabecalho + 1, colunas);
  const fim = contagens ?? linhas.length;
  return colunas.map((j) => ({
    rotulo: textoCelula(valorEm(linhas, linhaCabecalho, j)) ?? '',
    celula: referencia(linhaCabecalho, j),
    nomes: nomesColuna(linhas, j, linhaCabecalho + 1, fim),
    contagem: contagens === null ? null : numeroCelula(valorEm(linhas, contagens, j)),
  }));
}

/** Procura a primeira célula cujo texto normalizado começa por `prefixo`. */
export function encontrarCelula(
  linhas: unknown[][],
  prefixo: string,
): { linha: number; coluna: number } | null {
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i] ?? [];
    for (let j = 0; j < linha.length; j++) {
      const t = textoCelula(linha[j]);
      if (t && chaveNome(t).startsWith(prefixo)) return { linha: i, coluna: j };
    }
  }
  return null;
}

/**
 * Bloco com um título por cima ("FORA CASAS CMF", "SEM TRANSPORTE DA EMPRESA!"): nomes em várias colunas
 * a partir da do título, até à linha das contagens. Junta tudo num só grupo.
 */
export function lerBlocoComTitulo(linhas: unknown[][], prefixoTitulo: string): GrupoMichael | null {
  const titulo = encontrarCelula(linhas, prefixoTitulo);
  if (!titulo) return null;
  const de = titulo.linha + 1;
  const contagens = linhaContagens(linhas, de, [titulo.coluna]);
  const fim = contagens ?? linhas.length;
  const colunas: number[] = [];
  for (let j = titulo.coluna; nomesColuna(linhas, j, de, fim).length > 0; j++) colunas.push(j);
  return {
    rotulo: textoCelula(valorEm(linhas, titulo.linha, titulo.coluna)) ?? '',
    celula: referencia(titulo.linha, titulo.coluna),
    nomes: colunas.flatMap((j) => nomesColuna(linhas, j, de, fim)),
    contagem: somaLinha(linhas, contagens, colunas),
  };
}

/** Lista a salmão (pessoas sem casa) da folha das casas: de F24 para baixo até à primeira célula vazia. */
export function lerSemCasa(linhas: unknown[][]): GrupoMichael | null {
  const nomes: string[] = [];
  for (let i = SEM_CASA.linha; ; i++) {
    const v = valorEm(linhas, i, SEM_CASA.coluna);
    const t = typeof v === 'string' ? textoCelula(v) : null;
    if (!t) break;
    nomes.push(t);
  }
  if (nomes.length === 0) return null;
  return {
    rotulo: 'Sem casa (lista à parte, a salmão)',
    celula: referencia(SEM_CASA.linha, SEM_CASA.coluna),
    nomes,
    contagem: null,
  };
}

/** Folha cujo nome contém a palavra dada (sem acentos nem maiúsculas). */
function encontrarFolha(folhas: Map<string, unknown[][]>, palavra: string): [string, unknown[][]] | null {
  for (const [nome, linhas] of folhas) if (chaveNome(nome).includes(palavra)) return [nome, linhas];
  return null;
}

export function lerMichael(folhas: Map<string, unknown[][]>): DadosMichael {
  const avisos: ErroImportacao[] = [];
  const resultado: DadosMichael = {
    casas: [],
    foraDasCasas: null,
    semCasa: null,
    empresas: [],
    viaturas: [],
    semTransporte: null,
    folhas: { casas: null, empresas: null, viaturas: null },
    avisos,
  };

  const casas = encontrarFolha(folhas, 'casas');
  if (casas) {
    const [nome, linhas] = casas;
    resultado.folhas.casas = nome;
    resultado.casas = lerGrelha(linhas);
    resultado.foraDasCasas = lerBlocoComTitulo(linhas, 'fora casas');
    resultado.semCasa = lerSemCasa(linhas);
    if (resultado.casas.length === 0) avisos.push(aviso('Não encontrei as casas na linha 3.', nome));
    if (!resultado.foraDasCasas) avisos.push(aviso('Não encontrei o bloco "FORA CASAS CMF".', nome));
    if (!resultado.semCasa)
      avisos.push(aviso('Não encontrei a lista à parte de pessoas sem casa (F24).', nome));
  } else {
    avisos.push(aviso('Não encontrei a folha das casas no ficheiro do Michael.'));
  }

  const empresas = encontrarFolha(folhas, 'empresas');
  if (empresas) {
    const [nome, linhas] = empresas;
    resultado.folhas.empresas = nome;
    resultado.empresas = lerGrelha(linhas);
    if (resultado.empresas.length === 0) avisos.push(aviso('Não encontrei os clientes na linha 3.', nome));
  } else {
    avisos.push(aviso('Não encontrei a folha das empresas no ficheiro do Michael.'));
  }

  const viaturas = encontrarFolha(folhas, 'viaturas');
  if (viaturas) {
    const [nome, linhas] = viaturas;
    resultado.folhas.viaturas = nome;
    resultado.viaturas = lerGrelha(linhas);
    resultado.semTransporte = lerBlocoComTitulo(linhas, 'sem transporte');
    if (resultado.viaturas.length === 0) avisos.push(aviso('Não encontrei as matrículas na linha 3.', nome));
    if (!resultado.semTransporte)
      avisos.push(aviso('Não encontrei o bloco "SEM TRANSPORTE DA EMPRESA!".', nome));
  } else {
    avisos.push(aviso('Não encontrei a folha das viaturas no ficheiro do Michael.'));
  }

  return resultado;
}
