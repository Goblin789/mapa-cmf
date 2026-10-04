// Tempo real: quando alguém grava um lote, os outros browsers ficam a saber logo (Server-Sent Events).
// Um só processo (o Render corre uma instância), por isso basta uma lista de ligações em memória.
//
// Protocolo de GET /api/eventos (text/event-stream):
// - ao ligar: "retry: 5000" e um evento "versao" com {"versao":N} (o browser compara com a sua);
// - a cada lote gravado: um evento "lote" com um EventoLote (src/dominio/api.ts);
// - de 25 em 25 s: um comentário ": sinal", para os proxies não cortarem a ligação parada, no mesmo bloco
//   que um evento "sinal" (sem dados que interessem). O browser não vê comentários; o evento serve-lhe
//   para dar por uma ligação que morreu sem aviso (servidor que caiu atrás de um proxy que não fecha a
//   ligação, rede do telemóvel): sem notícias há mais de 75 s, volta a ligar (tempoReal/ligacao.ts).
//
// Cada ligação é um ReadableStream onde se põe o texto (o enqueue não espera pelo browser, por isso um
// browser lento nunca atrasa os outros). Uma ligação sai da lista quando o browser fecha (o pedido é
// abortado ou o stream cancelado), quando escrever falha, ou quando o browser deixa de ler e o que está
// por enviar passa de MAXIMO_POR_ENVIAR.

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

/** Quanto tempo o browser espera antes de voltar a ligar, se a ligação cair (ms). */
export const ESPERA_RELIGAR_MS = 5000;

/** Sinal de vida: o comentário (para os proxies) e o evento "sinal" (para o browser), num só bloco. */
export const SINAL = ': sinal\nevent: sinal\ndata: {}\n\n';

/** Bytes por enviar acima dos quais se desiste de um browser que deixou de ler (uns 400 lotes). */
export const MAXIMO_POR_ENVIAR = 64 * 1024;

const INTERVALO_SINAL_MS = 25_000;
const MAX_LIGACOES = 50;

const codificador = new TextEncoder();

/** Um evento SSE com os dados em JSON (o JSON.stringify nunca tem mudanças de linha). */
export function formatarEvento(nome: 'versao' | 'lote', dados: unknown): string {
  return `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`;
}

interface Ligacao {
  controlador: ReadableStreamDefaultController<Uint8Array>;
  terminada: boolean;
  /** Tira o ouvinte do abort do pedido. */
  largarPedido: () => void;
}

export function criarCanalEventos(opcoes: OpcoesCanal = {}): CanalEventos {
  const intervaloSinal = opcoes.intervaloSinalMs ?? INTERVALO_SINAL_MS;
  const maxLigacoes = opcoes.maxLigacoes ?? MAX_LIGACOES;
  const abertas = new Set<Ligacao>();
  let temporizadorSinal: ReturnType<typeof setInterval> | null = null;
  let fechado = false;

  function pararSinal(): void {
    if (temporizadorSinal === null) return;
    clearInterval(temporizadorSinal);
    temporizadorSinal = null;
  }

  /** Um só temporizador para todas as ligações; só corre enquanto houver alguma. */
  function iniciarSinal(): void {
    if (temporizadorSinal !== null) return;
    temporizadorSinal = setInterval(() => {
      for (const ligacao of [...abertas]) enviar(ligacao, SINAL);
    }, intervaloSinal);
    // O canal nunca impede o processo de terminar.
    temporizadorSinal.unref?.();
  }

  /**
   * Tira a ligação da lista. 'fechar' termina o stream depois de enviar o que falta (encerrar o
   * servidor, browser que já fechou); 'cortar' deita fora o que falta e corta a ligação com um erro
   * (browser que deixou de ler: a ligação TCP é destruída em vez de ficar à espera dele).
   */
  function terminar(ligacao: Ligacao, modo: 'fechar' | 'cortar'): void {
    if (ligacao.terminada) return;
    ligacao.terminada = true;
    abertas.delete(ligacao);
    ligacao.largarPedido();
    try {
      if (modo === 'fechar') ligacao.controlador.close();
      else ligacao.controlador.error(new Error('Ligação de tempo real cortada.'));
    } catch {
      // O stream já estava fechado ou cancelado pelo browser.
    }
    if (abertas.size === 0) pararSinal();
  }

  /** Põe o texto na ligação. Nunca lança: se não der, a ligação é retirada. */
  function enviar(ligacao: Ligacao, texto: string): void {
    if (ligacao.terminada) return;
    // Com highWaterMark 0 e o tamanho em bytes, desiredSize = -(bytes ainda por enviar ao browser).
    const livre = ligacao.controlador.desiredSize;
    if (livre !== null && -livre > MAXIMO_POR_ENVIAR) {
      terminar(ligacao, 'cortar');
      return;
    }
    try {
      ligacao.controlador.enqueue(codificador.encode(texto));
    } catch {
      terminar(ligacao, 'cortar');
    }
  }

  return {
    publicar(evento) {
      try {
        if (fechado || abertas.size === 0) return;
        const texto = formatarEvento('lote', evento);
        for (const ligacao of [...abertas]) enviar(ligacao, texto);
      } catch (erro) {
        console.error('Tempo real: não foi possível publicar o lote.', erro);
      }
    },

    responder(c, versaoAtual) {
      if (fechado) return c.json({ erro: 'O servidor está a encerrar. Volta a ligar daqui a pouco.' }, 503);
      if (abertas.size >= maxLigacoes) {
        c.header('Retry-After', '30');
        return c.json({ erro: 'Há demasiadas ligações em tempo real abertas. Tenta daqui a pouco.' }, 503);
      }

      const sinalPedido = c.req.raw.signal;
      let ligacao: Ligacao | null = null;
      // O browser já se foi: basta fechar (um erro no stream ia parar aos registos do servidor).
      const aoAbortar = () => {
        if (ligacao) terminar(ligacao, 'fechar');
      };

      const corpo = new ReadableStream<Uint8Array>(
        {
          // Corre logo, dentro do construtor.
          start(controlador) {
            ligacao = {
              controlador,
              terminada: false,
              largarPedido: () => sinalPedido.removeEventListener('abort', aoAbortar),
            };
            abertas.add(ligacao);
            iniciarSinal();
            enviar(
              ligacao,
              `retry: ${ESPERA_RELIGAR_MS}\n\n${formatarEvento('versao', { versao: versaoAtual })}`,
            );
          },
          // O browser fechou (o @hono/node-server cancela o stream quando a ligação cai).
          cancel() {
            if (ligacao) terminar(ligacao, 'fechar');
          },
        },
        // A fila mede-se em bytes: é ela que diz quanto o browser tem por ler.
        { highWaterMark: 0, size: (pedaco) => pedaco.byteLength },
      );

      if (sinalPedido.aborted) aoAbortar();
      else sinalPedido.addEventListener('abort', aoAbortar, { once: true });

      return c.body(corpo, 200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        // O nginx e outros proxies não podem juntar os eventos para os mandar mais tarde.
        'X-Accel-Buffering': 'no',
      });
    },

    ligacoes: () => abertas.size,

    fechar() {
      fechado = true;
      pararSinal();
      for (const ligacao of [...abertas]) terminar(ligacao, 'fechar');
    },
  };
}
