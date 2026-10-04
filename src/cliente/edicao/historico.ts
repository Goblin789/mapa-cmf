// Textos do histórico de gravações: data e hora no Luxemburgo, tipo e estado do lote. Funções puras.
// M2: frases seguidas iguais juntas (só ao mostrar), etiquetas "Reverte…"/"Revertida" e o que o diálogo
// "Reverter" mostra (prepararReversao).

import type { EntradaHistorico } from '../../dominio/api';
import { chaveOperacao, descreverOperacao, type Operacao } from '../../dominio/operacoes';
import { type ImpossivelReverter, planearReversao, podeReverter } from '../../dominio/reverter';
import type { Estado } from '../../dominio/tipos';
import type { ReversaoPendente } from '../tempoReal/rascunhoPendente';
import { contarAlteracoes } from './resumo';

const FUSO = 'Europe/Luxembourg';

const formatoDataHora = new Intl.DateTimeFormat('pt-PT', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "2026-10-03T15:01:00Z" → "03/10/2026, 17:01" (hora do Luxemburgo). Texto inválido passa como veio. */
export function formatarDataHora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  const partes = Object.fromEntries(formatoDataHora.formatToParts(data).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month}/${partes.year}, ${partes.hour}:${partes.minute}`;
}

const TIPOS: Record<string, string> = {
  importacao: 'Importação',
  mudanca: 'Mudança',
  correcao: 'Correção',
  ficha: 'Ficha',
};

export function rotuloTipoLote(tipo: string): string {
  return Object.hasOwn(TIPOS, tipo) ? (TIPOS[tipo] as string) : tipo;
}

/** Só os estados que merecem nota (agendado, cancelado, falhou): um lote aplicado é o normal. */
export function notaEstadoLote(estado: string): string | null {
  return estado === 'aplicado' ? null : estado;
}

// Recurso para quando o servidor não manda o nome (autorNome vazio): os autores que não são pessoas.
const AUTORES: Record<string, string> = {
  importacao: 'Importação dos Excel',
  // No modo local (PC sem login) o servidor grava os lotes com o autor "local".
  local: 'Este computador',
  // Sincronização dos dados iniciais (npm run sincronizar): frota, cores, casas, locais.
  'dados-iniciais': 'Dados iniciais',
};

/** Autor a mostrar a partir da chave ("importacao" e "local" não são pessoas; um e-mail fica como veio). */
export function rotuloAutor(autor: string): string {
  // Object.hasOwn: um autor como "constructor" não pode apanhar o protótipo.
  return Object.hasOwn(AUTORES, autor) ? (AUTORES[autor] as string) : autor;
}

/**
 * Quem gravou: o nome que o servidor resolveu (autorNome, ex.: "Michael Exemplo"). Se vier vazio
 * (servidor antigo, utilizador que já não existe), o rótulo da chave.
 */
export function nomeDoAutor(entrada: { autor: string; autorNome?: string | null }): string {
  return entrada.autorNome?.trim() || rotuloAutor(entrada.autor);
}

/**
 * Dica (title) com a chave do autor quando ela diz mais do que o nome (o e-mail de quem gravou).
 * null quando a chave não é um e-mail ou já é o que se mostra.
 */
export function dicaDoAutor(entrada: { autor: string; autorNome?: string | null }): string | null {
  return entrada.autor.includes('@') && nomeDoAutor(entrada) !== entrada.autor ? entrada.autor : null;
}

/** "Ana — casa: Casa Um → Casa Dois" → { quem: "Ana", oque: "casa: Casa Um → Casa Dois" }. */
export function partirDescricao(descricao: string): { quem: string | null; oque: string } {
  const i = descricao.indexOf(' — ');
  return i > 0
    ? { quem: descricao.slice(0, i), oque: descricao.slice(i + 3) }
    : { quem: null, oque: descricao };
}

/** Quantas entradas pedir de cada vez. */
export const PASSO_HISTORICO = 20;

/** O servidor não devolve mais do que isto de uma vez (GET /api/historico?limite=…, de 1 a 200). */
export const MAXIMO_HISTORICO = 200;

/** Se o servidor devolveu tantas como se pediu, pode haver mais (até ao máximo que ele aceita). */
export function podeHaverMais(recebidas: number, pedidas: number): boolean {
  return recebidas >= pedidas && pedidas < MAXIMO_HISTORICO;
}

/** Próximo limite a pedir em "Carregar mais", sem passar o máximo do servidor. */
export function proximoLimite(atual: number): number {
  return Math.min(atual + PASSO_HISTORICO, MAXIMO_HISTORICO);
}

/** Quantas descrições mostrar de um lote antes de "Mostrar todas". */
export const DESCRICOES_VISIVEIS = 8;

// --- M2: frases juntas, etiquetas de reversão e o diálogo "Reverter" (docs/m2.md, "Reverter") ----------------

const formatoDiaHora = new Intl.DateTimeFormat('pt-PT', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "2026-10-03T15:01:00Z" → "03/10 17:01" (hora do Luxemburgo, sem o ano). Texto inválido passa como veio. */
export function formatarDiaHoraCurto(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  const partes = Object.fromEntries(formatoDiaHora.formatToParts(data).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month} ${partes.hour}:${partes.minute}`;
}

/** Uma frase do histórico a mostrar e quantas linhas seguidas do lote a deram. */
export interface FraseHistorico {
  descricao: string;
  /** Linhas seguidas com a mesma frase (ex.: a latitude e a longitude de um pino dão 2). */
  linhas: number;
}

/**
 * As frases de um lote para MOSTRAR: as seguidas iguais juntam-se numa (a linha da latitude e a da longitude
 * dão duas vezes "Obra X — pino mudado de sítio"). Só da apresentação: o Reverter recebe sempre todas as
 * linhas do lote (entrada.alteracoes), senão o pino voltava só metade.
 */
export function juntarFrasesIguais(alteracoes: readonly { descricao: string }[]): FraseHistorico[] {
  const frases: FraseHistorico[] = [];
  for (const a of alteracoes) {
    const ultima = frases.at(-1);
    if (ultima && ultima.descricao === a.descricao) ultima.linhas += 1;
    else frases.push({ descricao: a.descricao, linhas: 1 });
  }
  return frases;
}

export type LoteParaEtiqueta = Pick<EntradaHistorico, 'loteId' | 'criadoEm' | 'autor' | 'autorNome'>;

// As gravações que o Histórico já mostrou nesta sessão (data e autor): o Histórico nunca mostra o número de
// um lote, por isso o Reverter e o Guardar falam delas pela data e pelo autor ("a gravação de 05/10 00:17
// (Ana Exemplo)"). Só depois de recarregar a página, sem o Histórico aberto, se cai no "nº 12".
const gravacoesVistas = new Map<number, LoteParaEtiqueta>();

/** Junta às gravações conhecidas as da lista do Histórico (ou a que se vai reverter). */
export function lembrarGravacoes(entradas: readonly LoteParaEtiqueta[]): void {
  for (const e of entradas) {
    gravacoesVistas.set(e.loteId, {
      loteId: e.loteId,
      criadoEm: e.criadoEm,
      autor: e.autor,
      autorNome: e.autorNome,
    });
  }
}

/** As gravações conhecidas nesta sessão (cópia), para nomeDaGravacao. */
export function gravacoesConhecidas(): LoteParaEtiqueta[] {
  return [...gravacoesVistas.values()];
}

/** "a gravação de 03/10 17:01 (Ana Exemplo)" se o lote estiver na lista carregada; senão "a gravação nº 12". */
export function nomeDaGravacao(loteId: number, carregadas: readonly LoteParaEtiqueta[]): string {
  const lote = carregadas.find((e) => e.loteId === loteId);
  if (!lote) return `a gravação nº ${loteId}`;
  return `a gravação de ${formatarDiaHoraCurto(lote.criadoEm)} (${nomeDoAutor(lote)})`;
}

/** "a, b e c". */
function juntarComE(nomes: readonly string[]): string {
  return nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

/**
 * Os lotes cuja reversão vai MESMO no Guardar: com o passo no rascunho e alguma operação ainda nos pendentes
 * (compactados). A mesma regra da loja (lotesAEnviar, docs/m2.md): se a reversão foi toda anulada por outras
 * mudanças (ex.: a pessoa voltou a ir para onde estava), o lote não vai, e a reversão já não "está no rascunho".
 */
export function lotesDaReversaoAEnviar(
  reversoes: readonly ReversaoPendente[],
  pendentes: readonly Operacao[],
): number[] {
  const chaves = new Set(pendentes.map(chaveOperacao));
  return [...new Set(reversoes.filter((r) => r.chaves.some((c) => chaves.has(c))).map((r) => r.loteId))];
}

/**
 * A nota do Guardar: "Inclui a reversão da gravação de 05/10 00:02 (Ana Exemplo)." (várias: "… e da gravação
 * nº 12."). null sem reversões.
 */
export function notaReversaoNoGuardar(
  loteIds: readonly number[],
  carregadas: readonly LoteParaEtiqueta[],
): string | null {
  if (loteIds.length === 0) return null;
  const nomes = loteIds.map((id) => nomeDaGravacao(id, carregadas).replace(/^a /, 'da '));
  return `Inclui a reversão ${juntarComE(nomes)}.`;
}

/**
 * Etiqueta de um lote que reverteu outros (entrada.reverte): "Reverte a gravação de 03/10 17:01 (Ana
 * Exemplo)", com a data e o autor de cada lote revertido que esteja na lista carregada (senão "nº 12").
 * null quando não reverte nenhum.
 */
export function etiquetaReverte(
  entrada: Pick<EntradaHistorico, 'reverte'>,
  carregadas: readonly LoteParaEtiqueta[],
): string | null {
  const ids = entrada.reverte ?? [];
  if (ids.length === 0) return null;
  return `Reverte ${juntarComE(ids.map((id) => nomeDaGravacao(id, carregadas)))}`;
}

/**
 * Um lote que foi revertido (entrada.revertidoPor): a etiqueta "Revertida" e a dica com a gravação que o
 * reverteu ("Revertida pela gravação de 04/10 09:12 (Rui Exemplo)" ou "pela gravação nº 12"). null quando ninguém o reverteu.
 */
export function etiquetaRevertida(
  entrada: Pick<EntradaHistorico, 'revertidoPor'>,
  carregadas: readonly LoteParaEtiqueta[],
): { texto: string; dica: string } | null {
  const ids = entrada.revertidoPor ?? [];
  if (ids.length === 0) return null;
  // "a gravação …" → "pela gravação …".
  const nomes = ids.map((id) => nomeDaGravacao(id, carregadas).replace(/^a /, 'pela '));
  return { texto: 'Revertida', dica: `Revertida ${juntarComE(nomes)}` };
}

/** O lote mostra o botão "Reverter…": gravado no programa e aplicado (podeReverter), e fora da reunião. */
export function mostraReverter(
  entrada: Pick<EntradaHistorico, 'autor' | 'estado' | 'tipo'>,
  reuniao: boolean,
): boolean {
  return !reuniao && podeReverter(entrada);
}

/** O que o diálogo "Reverter" mostra (funções puras; o componente só desenha). */
export interface VistaReversao {
  /** As operações a pôr no rascunho como UM passo (loja.iniciarReversao). */
  operacoes: Operacao[];
  /** "Vai voltar atrás": a frase de cada operação (seguidas iguais juntas, como no histórico). */
  voltaAtras: FraseHistorico[];
  /** Quantas alterações anunciar (contarAlteracoes: o pino conta uma vez, como na lista e na barra). */
  nAlteracoes: number;
  /** "Já não se pode reverter": a frase do histórico e porquê. */
  impossiveis: ImpossivelReverter[];
  /** Erros que bloqueiam (só os que não se separam). */
  erros: string[];
  /** Pode ir para o rascunho: há operações e nenhum erro (e a reversão ainda não está no rascunho). */
  podePorNoRascunho: boolean;
  /** Porque é que não há nada para pôr no rascunho (null quando há). */
  explicacao: string | null;
}

/**
 * Planeia a reversão de um lote sobre o estado VISÍVEL (o gravado com o rascunho que já houver) com TODAS
 * as linhas do lote (planearReversao) e prepara o que o diálogo mostra. `jaNoRascunho` = a reversão do lote
 * ainda vai no Guardar (lotesDaReversaoAEnviar): pôr outra vez não faz sentido. Se ela foi toda anulada por
 * mudanças depois dela, já não conta como estando no rascunho.
 */
export function prepararReversao(
  estadoVisivel: Estado,
  entrada: Pick<EntradaHistorico, 'alteracoes' | 'loteId'>,
  jaNoRascunho = false,
): VistaReversao {
  const plano = planearReversao(estadoVisivel, entrada.alteracoes);
  const voltaAtras = juntarFrasesIguais(
    plano.operacoes.map((op) => ({ descricao: descreverOperacao(estadoVisivel, op) })),
  );
  let explicacao: string | null = null;
  if (jaNoRascunho) {
    explicacao =
      'A reversão desta gravação já está no rascunho. Carrega em Guardar para a gravar; Ctrl+Z desfaz.';
  } else if (plano.erros.length > 0) {
    explicacao = 'Não se pode pôr no rascunho: o que voltava atrás não fica válido (ver os erros).';
  } else if (plano.operacoes.length === 0) {
    explicacao =
      entrada.alteracoes.length === 0
        ? 'Esta gravação não tem alterações registadas: não há nada para reverter.'
        : 'Não há nada para reverter: tudo o que esta gravação mudou já mudou entretanto ou não se reverte no programa (ver porquê).';
  }
  return {
    operacoes: plano.operacoes,
    voltaAtras,
    nAlteracoes: contarAlteracoes(plano.operacoes),
    impossiveis: plano.impossiveis,
    erros: plano.erros,
    podePorNoRascunho: explicacao === null,
    explicacao,
  };
}

/** O aviso depois de pôr a reversão no rascunho. */
export function avisoReversaoNoRascunho(n: number): string {
  return `Reversão no rascunho: ${n} ${n === 1 ? 'alteração' : 'alterações'}. Guardar para gravar; Ctrl+Z desfaz.`;
}
