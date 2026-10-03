import type { Conflito, Operacao } from '../../dominio/operacoes';
import type { Estado } from '../../dominio/tipos';

export async function obterEstado(): Promise<Estado> {
  const resposta = await fetch('/api/estado', { headers: { accept: 'application/json' } });
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status} ao pedir o estado.`);
  return (await resposta.json()) as Estado;
}

export interface PedidoGuardar {
  /** Versão do estado sobre a qual as alterações foram feitas (informativa; os conflitos vêm do `de`). */
  versaoBase: number;
  operacoes: Operacao[];
  comentario?: string;
}

export interface RespostaGuardar {
  loteId: number;
  versao: number;
}

/** Conflito devolvido pelo servidor, já com a frase pronta a mostrar. */
export interface ConflitoServidor extends Conflito {
  descricao: string;
}

/** O servidor recusou porque alguém mudou entretanto as mesmas pessoas (HTTP 409). Nada foi gravado. */
export class ErroConflito extends Error {
  constructor(readonly conflitos: ConflitoServidor[]) {
    super('Alguém mudou entretanto algumas destas pessoas. Nada foi gravado.');
  }
}

/** POST /api/lotes — grava as operações num lote, tudo ou nada. */
export async function guardarLote(pedido: PedidoGuardar): Promise<RespostaGuardar> {
  const resposta = await fetch('/api/lotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(pedido),
  });
  const corpo = (await resposta.json().catch(() => ({}))) as {
    erro?: string;
    erros?: string[];
    conflitos?: ConflitoServidor[];
  } & Partial<RespostaGuardar>;
  if (resposta.status === 409 && corpo.conflitos) throw new ErroConflito(corpo.conflitos);
  if (!resposta.ok) {
    const detalhe = corpo.erros?.length ? ` ${corpo.erros.join(' ')}` : '';
    throw new Error(`${corpo.erro ?? `O servidor respondeu ${resposta.status}.`}${detalhe}`);
  }
  return { loteId: corpo.loteId as number, versao: corpo.versao as number };
}

export interface AlteracaoHistorico {
  entidade: string;
  entidadeId: string;
  campo: string;
  /** Valores em JSON, como estão na base de dados (null = não existia). */
  antes: string | null;
  depois: string | null;
  /** Frase pronta a mostrar (ex.: "Rui Reis — casa: Casa 1 Puttelange → Steinsel"). */
  descricao: string;
}

export interface EntradaHistorico {
  loteId: number;
  autor: string;
  criadoEm: string;
  efetivoEm: string;
  tipo: string;
  estado: string;
  comentario: string | null;
  alteracoes: AlteracaoHistorico[];
}

/** GET /api/historico — lotes mais recentes primeiro. */
export async function obterHistorico(limite = 50): Promise<EntradaHistorico[]> {
  const resposta = await fetch(`/api/historico?limite=${limite}`, {
    headers: { accept: 'application/json' },
  });
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status} ao pedir o histórico.`);
  return (await resposta.json()) as EntradaHistorico[];
}
