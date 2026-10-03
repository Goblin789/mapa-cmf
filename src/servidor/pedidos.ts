// Validação do que chega do browser: corpo de POST /api/lotes e parâmetros de GET /api/historico.
// Funções puras (não sabem nada de HTTP nem da base de dados).

import { z } from 'zod';
import type { Operacao } from '../dominio/operacoes';

export const MAX_OPERACOES = 500;
export const MAX_COMENTARIO = 500;
export const LIMITE_HISTORICO = { omissao: 50, maximo: 200 } as const;
/** Erros devolvidos de uma vez (500 operações mal feitas não dão 500 frases). */
const MAX_ERROS = 10;

/** Mensagens do zod em português europeu. */
const mensagensPt = z.locales.pt().localeError;

const id = z.string().min(1).max(200);

const operacaoMover = z.object({
  tipo: z.literal('mover'),
  pessoaId: id,
  campo: z.enum(['casaId', 'carrinhaId', 'obraId']),
  de: id.nullable(),
  para: id.nullable(),
});

/** Definir (para = pessoa) ou tirar (para = null) o condutor de uma carrinha. */
const operacaoCondutor = z.object({
  tipo: z.literal('condutor'),
  carrinhaId: id,
  de: id.nullable(),
  para: id.nullable(),
});

const operacao = z.discriminatedUnion('tipo', [operacaoMover, operacaoCondutor]);

const pedidoGuardar = z.object({
  /**
   * Os conflitos detetam-se pelo `de` de cada operação; a versão só serve para os que a regra do condutor
   * esconde (ver conflitosDoCondutor em lotes.ts).
   */
  versaoBase: z.number().int().nonnegative(),
  operacoes: z
    .array(operacao)
    .min(1, { error: 'Não há operações para gravar.' })
    .max(MAX_OPERACOES, { error: `No máximo ${MAX_OPERACOES} operações de cada vez.` }),
  comentario: z
    .string()
    .max(MAX_COMENTARIO, { error: `O comentário tem no máximo ${MAX_COMENTARIO} caracteres.` })
    .nullish(),
});

export interface PedidoGuardarValido {
  versaoBase: number;
  operacoes: Operacao[];
  /** Sem espaços nas pontas; vazio passa a null. */
  comentario: string | null;
}

export type Lido<T> = { ok: true; valor: T } | { ok: false; erros: string[] };

/** "operacoes[2].campo" a partir do caminho do zod. */
function caminho(partes: readonly PropertyKey[]): string {
  let texto = '';
  for (const p of partes) texto += typeof p === 'number' ? `[${p}]` : `${texto ? '.' : ''}${String(p)}`;
  return texto;
}

/** Tira os repetidos e fica com os primeiros 10, mais uma linha com quantos faltam. */
export function limitarErros(erros: readonly string[]): string[] {
  const unicos = [...new Set(erros)];
  const resto = unicos.length - MAX_ERROS;
  return resto > 0 ? [...unicos.slice(0, MAX_ERROS), `… e mais ${resto}.`] : unicos;
}

export function lerPedidoGuardar(corpo: unknown): Lido<PedidoGuardarValido> {
  const r = pedidoGuardar.safeParse(corpo, { error: mensagensPt });
  if (!r.success) {
    const erros = r.error.issues.map((i) => (i.path.length ? `${caminho(i.path)}: ${i.message}` : i.message));
    return { ok: false, erros: limitarErros(erros) };
  }
  const comentario = r.data.comentario?.trim() || null;
  return { ok: true, valor: { versaoBase: r.data.versaoBase, operacoes: r.data.operacoes, comentario } };
}

/**
 * `?limite=` do histórico: inteiro maior do que zero; sem ele, 50. Acima de 200 fica 200 (quem pede mais
 * recebe os 200 mais recentes em vez de um erro). Qualquer outra coisa é null (inválido).
 */
export function lerLimiteHistorico(texto: string | undefined): number | null {
  if (texto === undefined) return LIMITE_HISTORICO.omissao;
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  return n >= 1 ? Math.min(n, LIMITE_HISTORICO.maximo) : null;
}

/** Content-Type é JSON (aceita parâmetros, ex.: "application/json; charset=utf-8"). */
export function eJson(tipo: string | undefined): boolean {
  return tipo?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

/** Nomes do próprio PC. Enquanto não há login, só páginas abertas nele podem gravar. */
const ANFITRIOES_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Cabeçalho Origin de uma página do próprio PC (http/https, qualquer porta). "null" e lixo não contam. */
export function origemLocal(origem: string): boolean {
  try {
    const url = new URL(origem);
    return (url.protocol === 'http:' || url.protocol === 'https:') && ANFITRIOES_LOCAIS.has(url.hostname);
  } catch {
    return false;
  }
}
