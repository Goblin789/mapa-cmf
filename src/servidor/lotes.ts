// Gravação das edições num lote com histórico (POST /api/lotes) e leitura do histórico (GET /api/historico).
// As regras (compactar, validar, conflitos, aplicar) são as de src/dominio/operacoes.ts, as mesmas que o
// browser usa na simulação; aqui só se acrescenta a gravação atómica. As frases são funções puras.

import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { AlteracaoHistorico, ConflitoServidor, EntradaHistorico } from '../cliente/estado/api';
import {
  aplicarOperacoes,
  type CampoMovivel,
  type Conflito,
  compactarOperacoes,
  descreverOperacao,
  encontrarConflitos,
  nomeDoValor,
  type Operacao,
  validarOperacoes,
} from '../dominio/operacoes';
import type { Estado, Id, Pessoa } from '../dominio/tipos';
import * as esquema from './db/esquema';
import type { Bd } from './db/ligacao';
import { lerEstado, lerVersao } from './estado';
import { limitarErros } from './pedidos';

/** Campos da pessoa que uma gravação pode mudar, pela ordem em que ficam no histórico. */
const CAMPOS_GRAVADOS = ['casaId', 'casaAConfirmar', 'carrinhaId', 'carrinhaAConfirmar', 'obraId'] as const;
type CampoGravado = (typeof CAMPOS_GRAVADOS)[number];

const CAMPOS_MOVIVEIS: ReadonlySet<string> = new Set<CampoMovivel>(['casaId', 'carrinhaId', 'obraId']);

const NOME_CAMPO: Record<CampoMovivel, string> = { casaId: 'casa', carrinhaId: 'carrinha', obraId: 'obra' };

/** Como se diz "onde está" quando o valor é null. */
const SEM_VALOR: Record<CampoMovivel, string> = {
  casaId: 'fora das casas CMF',
  carrinhaId: 'sem transporte da empresa',
  obraId: 'sem obra',
};

const NOME_MARCA: Record<string, string> = {
  casaAConfirmar: 'casa a confirmar',
  carrinhaAConfirmar: 'carrinha a confirmar',
};

/** Linhas por INSERT (fica longe do limite de variáveis do SQLite). */
const POR_INSERT = 100;

/** Uma mudança de um campo de uma pessoa, tal como fica na tabela `alteracoes`. */
export interface AlteracaoPessoa {
  pessoaId: Id;
  campo: CampoGravado;
  antes: Pessoa[CampoGravado];
  depois: Pessoa[CampoGravado];
}

/**
 * Campos que mudam ao aplicar as operações (com `aplicarOperacoes`, a mesma função da simulação),
 * pessoa a pessoa pela ordem das operações. Inclui as marcas "a confirmar" que a mudança limpa.
 */
export function alteracoesDasOperacoes(estado: Estado, ops: readonly Operacao[]): AlteracaoPessoa[] {
  const antes = new Map(estado.pessoas.map((p) => [p.id, p]));
  const depois = new Map(aplicarOperacoes(estado, ops).pessoas.map((p) => [p.id, p]));
  const resultado: AlteracaoPessoa[] = [];
  for (const pessoaId of new Set(ops.map((op) => op.pessoaId))) {
    const a = antes.get(pessoaId);
    const d = depois.get(pessoaId);
    if (!a || !d) continue;
    for (const campo of CAMPOS_GRAVADOS) {
      if (a[campo] !== d[campo]) resultado.push({ pessoaId, campo, antes: a[campo], depois: d[campo] });
    }
  }
  return resultado;
}

function nomeDaPessoa(estado: Estado, id: Id): string {
  return estado.pessoas.find((p) => p.id === id)?.nomeCurto ?? id;
}

/** Ex.: "Ana T. — carrinha: esperavas ZZ1002, mas agora está em ZZ1001 (alguém mudou entretanto)". */
export function descreverConflito(estado: Estado, conflito: Conflito): string {
  const { campo, esperado, atual } = conflito;
  const agora = atual === null ? SEM_VALOR[campo] : `em ${nomeDoValor(estado, campo, atual)}`;
  return (
    `${nomeDaPessoa(estado, conflito.pessoaId)} — ${NOME_CAMPO[campo]}: ` +
    `esperavas ${nomeDoValor(estado, campo, esperado)}, mas agora está ${agora} (alguém mudou entretanto)`
  );
}

/** Valor guardado em JSON. Texto que não é JSON (não devia acontecer) fica tal como está. */
function lerJson(texto: string | null): unknown {
  if (texto === null) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

function comoId(valor: unknown): Id | null {
  if (valor === null || valor === undefined) return null;
  return typeof valor === 'string' ? valor : JSON.stringify(valor);
}

function simOuNao(valor: unknown): string {
  if (valor === true) return 'sim';
  if (valor === false) return 'não';
  return valor === null || valor === undefined ? '—' : JSON.stringify(valor);
}

interface LinhaAlteracao {
  entidade: string;
  entidadeId: string;
  campo: string;
  antes: string | null;
  depois: string | null;
}

/**
 * Frase legível de uma alteração, com os nomes ATUAIS (casa, carrinha, obra, pessoa).
 * Ex.: "Gil N. — casa: Fora das casas CMF → Casa Três"; "Gil N. — casa a confirmar: sim → não".
 */
export function descreverAlteracao(estado: Estado, a: LinhaAlteracao): string {
  if (a.entidade === 'pessoa' && CAMPOS_MOVIVEIS.has(a.campo)) {
    return descreverOperacao(estado, {
      tipo: 'mover',
      pessoaId: a.entidadeId,
      campo: a.campo as CampoMovivel,
      de: comoId(lerJson(a.antes)),
      para: comoId(lerJson(a.depois)),
    });
  }
  const marca = NOME_MARCA[a.campo];
  if (a.entidade === 'pessoa' && marca) {
    const nome = nomeDaPessoa(estado, a.entidadeId);
    return `${nome} — ${marca}: ${simOuNao(lerJson(a.antes))} → ${simOuNao(lerJson(a.depois))}`;
  }
  return `${a.entidade} ${a.entidadeId} — ${a.campo}: ${a.antes ?? '—'} → ${a.depois ?? '—'}`;
}

export interface PedidoLote {
  /** Tal como vieram do browser (são compactadas aqui). */
  operacoes: readonly Operacao[];
  comentario: string | null;
  autor: string;
  agora: Date;
}

export type ResultadoGravacao =
  | { tipo: 'gravado'; loteId: number; versao: number; alteracoes: number }
  /** As operações anulam-se umas às outras (ex.: A → B → A): não se grava nada. */
  | { tipo: 'vazio' }
  | { tipo: 'invalido'; erros: string[] }
  /** Alguém mudou entretanto as mesmas pessoas: não se grava nada. */
  | { tipo: 'conflito'; conflitos: ConflitoServidor[] };

function blocos<T>(lista: T[]): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += POR_INSERT) r.push(lista.slice(i, i + POR_INSERT));
  return r;
}

/**
 * Grava as operações num lote, tudo ou nada. Verificação e escrita correm na mesma transação
 * (IMMEDIATE: o bloqueio de escrita é pedido logo ao abrir, por isso ninguém grava pelo meio,
 * nem outro processo como a importação).
 */
export function gravarLote(bd: Bd, pedido: PedidoLote): ResultadoGravacao {
  return bd.transaction(
    (tx): ResultadoGravacao => {
      const estado = lerEstado(tx, pedido.agora);
      const ops = compactarOperacoes(pedido.operacoes);
      if (ops.length === 0) return { tipo: 'vazio' };

      const erros = validarOperacoes(estado, ops);
      if (erros.length > 0) return { tipo: 'invalido', erros: limitarErros(erros) };

      const conflitos = encontrarConflitos(estado, ops);
      if (conflitos.length > 0) {
        return {
          tipo: 'conflito',
          conflitos: conflitos.map((c) => ({ ...c, descricao: descreverConflito(estado, c) })),
        };
      }

      const alteracoes = alteracoesDasOperacoes(estado, ops);
      const quando = pedido.agora.toISOString();
      const { id: loteId } = tx
        .insert(esquema.lotes)
        .values({
          autor: pedido.autor,
          tipo: 'mudanca',
          estado: 'aplicado',
          criadoEm: quando,
          efetivoEm: quando,
          comentario: pedido.comentario,
        })
        .returning({ id: esquema.lotes.id })
        .get();

      // Uma atualização por pessoa, só com os campos que mudam.
      const porPessoa = new Map<Id, Partial<Pick<Pessoa, CampoGravado>>>();
      for (const a of alteracoes) {
        const valores = porPessoa.get(a.pessoaId) ?? {};
        Object.assign(valores, { [a.campo]: a.depois });
        porPessoa.set(a.pessoaId, valores);
      }
      for (const [id, valores] of porPessoa) {
        tx.update(esquema.pessoas).set(valores).where(eq(esquema.pessoas.id, id)).run();
      }

      const linhas = alteracoes.map((a) => ({
        loteId,
        entidade: 'pessoa',
        entidadeId: a.pessoaId,
        campo: a.campo,
        antes: JSON.stringify(a.antes),
        depois: JSON.stringify(a.depois),
      }));
      for (const b of blocos(linhas)) tx.insert(esquema.alteracoes).values(b).run();

      return { tipo: 'gravado', loteId, versao: lerVersao(tx), alteracoes: alteracoes.length };
    },
    { behavior: 'immediate' },
  );
}

/** Os `limite` lotes mais recentes (o mais recente primeiro), cada um com as suas alterações por ordem. */
export function lerHistorico(bd: Bd, limite: number, agora: Date = new Date()): EntradaHistorico[] {
  return bd.transaction((tx) => {
    const lotes = tx.select().from(esquema.lotes).orderBy(desc(esquema.lotes.id)).limit(limite).all();
    if (lotes.length === 0) return [];
    const estado = lerEstado(tx, agora);
    const linhas = tx
      .select()
      .from(esquema.alteracoes)
      .where(
        inArray(
          esquema.alteracoes.loteId,
          lotes.map((l) => l.id),
        ),
      )
      .orderBy(asc(esquema.alteracoes.id))
      .all();

    const porLote = new Map<number, AlteracaoHistorico[]>();
    for (const l of linhas) {
      const alteracao: AlteracaoHistorico = {
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        campo: l.campo,
        antes: l.antes,
        depois: l.depois,
        descricao: descreverAlteracao(estado, l),
      };
      const lista = porLote.get(l.loteId);
      if (lista) lista.push(alteracao);
      else porLote.set(l.loteId, [alteracao]);
    }

    return lotes.map((l) => ({
      loteId: l.id,
      autor: l.autor,
      criadoEm: l.criadoEm,
      efetivoEm: l.efetivoEm,
      tipo: l.tipo,
      estado: l.estado,
      comentario: l.comentario ?? null,
      alteracoes: porLote.get(l.id) ?? [],
    }));
  });
}
