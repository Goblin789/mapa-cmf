// Textos do histórico de gravações: data e hora no Luxemburgo, tipo e estado do lote. Funções puras.

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
