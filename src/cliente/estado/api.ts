import type {
  AlteracaoHistorico,
  ConflitoServidor,
  EntradaHistorico,
  PedidoGuardar,
  RespostaGuardar,
} from '../../dominio/api';
import type { Estado } from '../../dominio/tipos';

export type { AlteracaoHistorico, ConflitoServidor, EntradaHistorico, PedidoGuardar, RespostaGuardar };

export async function obterEstado(): Promise<Estado> {
  const resposta = await fetch('/api/estado', { headers: { accept: 'application/json' } });
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status} ao pedir o estado.`);
  return (await resposta.json()) as Estado;
}

/**
 * Não há sessão (HTTP 401): nunca se entrou, a sessão expirou ou terminou noutro separador. O Portao mostra
 * o ecrã de entrada. CONTRATO DO M1: todos os pedidos à API lançam isto num 401.
 */
export class ErroSessao extends Error {
  constructor() {
    super('A sessão terminou. Entra outra vez com a conta Microsoft.');
  }
}

/** O servidor recusou porque alguém mudou entretanto as mesmas pessoas (HTTP 409). Nada foi gravado. */
export class ErroConflito extends Error {
  constructor(readonly conflitos: ConflitoServidor[]) {
    super('Alguém mudou entretanto algumas destas pessoas ou carrinhas. Nada foi gravado.');
  }
}

/** O servidor recusou o pedido (ex.: 400 = as mudanças já não fazem sentido no estado atual). */
export class ErroServidor extends Error {
  constructor(
    readonly estado: number,
    mensagem: string,
  ) {
    super(mensagem);
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
    throw new ErroServidor(
      resposta.status,
      `${corpo.erro ?? `O servidor respondeu ${resposta.status}.`}${detalhe}`,
    );
  }
  return { loteId: corpo.loteId as number, versao: corpo.versao as number };
}

/** GET /api/historico — lotes mais recentes primeiro. */
export async function obterHistorico(limite = 50): Promise<EntradaHistorico[]> {
  const resposta = await fetch(`/api/historico?limite=${limite}`, {
    headers: { accept: 'application/json' },
  });
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status} ao pedir o histórico.`);
  return (await resposta.json()) as EntradaHistorico[];
}
