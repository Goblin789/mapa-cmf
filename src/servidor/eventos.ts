// Tempo real: quando alguém grava um lote, os outros browsers ficam a saber logo (Server-Sent Events).
// Um só processo (o Render corre uma instância), por isso basta uma lista de ligações em memória.
//
// Protocolo de GET /api/eventos (text/event-stream):
// - ao ligar: "retry: 5000" e um evento "versao" com {"versao":N} (o browser compara com a sua);
// - a cada lote gravado: um evento "lote" com um EventoLote (src/dominio/api.ts);
// - de 25 em 25 s: um comentário ": sinal", para os proxies não cortarem a ligação parada.
//
// CONTRATO DO M1 — implementação por fazer (peça "tempo real").

import type { Context } from 'hono';
import type { EventoLote } from '../dominio/api';

export interface OpcoesCanal {
  /** Intervalo do sinal de vida, em ms. Omissão: 25 000. */
  intervaloSinalMs?: number;
  /** Máximo de ligações abertas ao mesmo tempo (todos os browsers). Acima disto: 503. Omissão: 50. */
  maxLigacoes?: number;
}

export interface CanalEventos {
  /** Envia o evento a todas as ligações abertas. Nunca lança (uma ligação morta é só retirada). */
  publicar(evento: EventoLote): void;
  /** Resposta de GET /api/eventos (quem chama já verificou a sessão). */
  responder(c: Context, versaoAtual: number): Response | Promise<Response>;
  /** Ligações abertas agora. */
  ligacoes(): number;
  /** Fecha todas as ligações e pára os sinais (ao encerrar o servidor). */
  fechar(): void;
}

export function criarCanalEventos(_opcoes: OpcoesCanal = {}): CanalEventos {
  return {
    publicar: () => {},
    responder: (c) => c.json({ erro: 'Tempo real ainda não disponível.' }, 503),
    ligacoes: () => 0,
    fechar: () => {},
  };
}
