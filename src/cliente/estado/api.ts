// Pedidos do browser à API. Todos passam por `pedirApi`: num 401 (sem sessão) marca a sessão como
// terminada (o Portao mostra o ecrã de entrada) e lança ErroSessao, para quem chamou não continuar.

import type {
  AlteracaoHistorico,
  ConflitoServidor,
  EntradaHistorico,
  PedidoGuardar,
  RespostaGuardar,
} from '../../dominio/api';
import type { Estado } from '../../dominio/tipos';
import { useSessao } from '../entrar/sessao';

export type { AlteracaoHistorico, ConflitoServidor, EntradaHistorico, PedidoGuardar, RespostaGuardar };

/**
 * Não há sessão (HTTP 401): nunca se entrou, a sessão expirou ou terminou noutro separador. O Portao mostra
 * o ecrã de entrada. Todos os pedidos à API lançam isto num 401 (ver `pedirApi`).
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

/**
 * fetch para a API. Num 401 marca a sessão como terminada e lança ErroSessao; as outras respostas
 * (também os erros) voltam para quem chamou as tratar. Sem rede, o fetch lança o erro dele.
 * Os pedidos novos à API (vistas, tempo real…) devem passar por aqui.
 */
export async function pedirApi(caminho: string, init?: RequestInit): Promise<Response> {
  const resposta = await fetch(caminho, init);
  if (resposta.status === 401) {
    useSessao.getState().marcarFora();
    throw new ErroSessao();
  }
  return resposta;
}

export async function obterEstado(): Promise<Estado> {
  const resposta = await pedirApi('/api/estado', { headers: { accept: 'application/json' } });
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status} ao pedir o estado.`);
  return (await resposta.json()) as Estado;
}

/** POST /api/lotes — grava as operações num lote, tudo ou nada. */
export async function guardarLote(pedido: PedidoGuardar): Promise<RespostaGuardar> {
  const resposta = await pedirApi('/api/lotes', {
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
  const resposta = await pedirApi(`/api/historico?limite=${limite}`, {
    headers: { accept: 'application/json' },
  });
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status} ao pedir o histórico.`);
  return (await resposta.json()) as EntradaHistorico[];
}
