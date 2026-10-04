// Regras do tempo real no browser, sem DOM: ler os eventos do servidor, decidir se é preciso recarregar o
// estado e que aviso mostrar. O useTempoReal só liga estas funções ao EventSource e à loja.

import type { EventoLote } from '../../dominio/api';

/** Quanto tempo sem ligação antes de aparecer "Sem ligação em tempo real…" (ms). */
export const SEM_LIGACAO_APOS_MS = 30_000;
/** Quanto tempo fica à vista um aviso "X gravou N alterações." (ms). */
export const DURACAO_AVISO_MS = 8000;
/** Avisos empilhados ao mesmo tempo, no máximo (os mais antigos saem primeiro). */
export const MAX_AVISOS = 3;

/** Lê o evento "versao" ({"versao":N}). null se não fizer sentido. */
export function lerEventoVersao(dados: unknown): number | null {
  const objeto = lerJson(dados);
  const versao = objeto?.versao;
  return eInteiroNaoNegativo(versao) ? versao : null;
}

/** Lê o evento "lote" (um EventoLote). null se faltar alguma coisa. */
export function lerEventoLote(dados: unknown): EventoLote | null {
  const o = lerJson(dados);
  if (!o) return null;
  const { versao, loteId, autor, autorNome, alteracoes } = o;
  if (!eInteiroNaoNegativo(versao) || !eInteiroNaoNegativo(loteId) || !eInteiroNaoNegativo(alteracoes)) {
    return null;
  }
  if (typeof autor !== 'string' || typeof autorNome !== 'string') return null;
  return { versao, loteId, autor, autorNome, alteracoes };
}

function lerJson(dados: unknown): Record<string, unknown> | null {
  if (typeof dados !== 'string') return null;
  try {
    const valor: unknown = JSON.parse(dados);
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function eInteiroNaoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

/**
 * "Michael Exemplo gravou 3 alterações." Com rascunho por guardar, acrescenta que ele continua por cima
 * (o que a pessoa vê é o estado novo com as mudanças dela aplicadas).
 */
export function textoAvisoLote(
  evento: Pick<EventoLote, 'autorNome' | 'alteracoes'>,
  comRascunho: boolean,
): string {
  const quem = evento.autorNome.trim() || 'Alguém';
  const n = evento.alteracoes;
  const oQue = n <= 0 ? 'alterações' : `${n} ${n === 1 ? 'alteração' : 'alterações'}`;
  return `${quem} gravou ${oQue}.${comRascunho ? ' O teu rascunho continua por cima.' : ''}`;
}

/** O que o browser sabe dele próprio quando chega um evento. */
export interface ContextoLoja {
  /** Versão do estado do servidor que a loja tem (null = ainda não carregou). */
  versaoLocal: number | null;
  /** Está a carregar o estado (pedido em curso). */
  aCarregar: boolean;
  /** Este separador está a gravar (o evento do próprio lote pode chegar antes da resposta do POST). */
  aGuardar: boolean;
  /** Há um rascunho por guardar (modo de edição com alterações). */
  comRascunho: boolean;
  /** Lotes gravados por este separador. */
  lotesDesteSeparador: ReadonlySet<number>;
}

/**
 * Evento "versao" (chega a cada ligação): recarrega se o servidor tem uma versão DIFERENTE da da loja.
 * Mais recente é o normal (alguém gravou enquanto a ligação esteve em baixo); mais antiga quer dizer que
 * a base de dados foi restaurada de uma cópia (docs/recuperar.md) e o que se vê já não existe no servidor.
 * 'esperar' = a loja ainda não tem estado e está a carregar: decide-se quando o pedido acabar (evita pedir
 * o estado duas vezes ao abrir a página).
 */
export function decidirVersao(versao: number, contexto: Pick<ContextoLoja, 'versaoLocal' | 'aCarregar'>) {
  if (contexto.versaoLocal === null) return contexto.aCarregar ? 'esperar' : 'recarregar';
  return versao !== contexto.versaoLocal ? 'recarregar' : 'nada';
}

export type DecisaoLote =
  /** Este separador está a gravar: o lote pode ser o dele. Decide-se quando a gravação acabar. */
  { tipo: 'adiar' } | { tipo: 'seguir'; recarregar: boolean; aviso: string | null };

/**
 * Evento "lote". Os lotes deste separador não recarregam nem avisam (a loja já tem o estado gravado).
 * Compara-se o loteId e não o autor: no modo local todos são 'local' e a mesma pessoa pode ter o mapa
 * aberto no PC e no telemóvel.
 * Recarrega se a versão do lote não é a da loja: mais recente é o normal; mais antiga só acontece depois de
 * um restauro (a numeração recomeçou) ou se um pedido do estado se adiantou ao evento (aí é um pedido a
 * mais, sem mal nenhum).
 */
export function decidirLote(evento: EventoLote, contexto: ContextoLoja): DecisaoLote {
  if (contexto.lotesDesteSeparador.has(evento.loteId))
    return { tipo: 'seguir', recarregar: false, aviso: null };
  if (contexto.aGuardar) return { tipo: 'adiar' };
  const recarregar = contexto.versaoLocal === null || evento.versao !== contexto.versaoLocal;
  return { tipo: 'seguir', recarregar, aviso: textoAvisoLote(evento, contexto.comRascunho) };
}

/**
 * Espera antes de reabrir uma ligação que o browser deu por perdida (resposta que não é 200: servidor a
 * reiniciar, 503 por excesso de ligações, proxy em baixo). 5 s, 10 s, 20 s e depois de 30 em 30 s.
 */
export function esperaParaReabrir(tentativa: number): number {
  return Math.min(5000 * 2 ** Math.max(0, tentativa), 30_000);
}

/**
 * Junta pedidos seguidos de recarregar num só: se já está a carregar, volta a carregar UMA vez no fim
 * (o pedido em curso pode ter saído antes da gravação que motivou o novo). A promessa devolvida acaba
 * quando já não há nada por carregar.
 */
export function criarRecarregador(carregar: () => Promise<void>): () => Promise<void> {
  let emCurso: Promise<void> | null = null;
  let outraVez = false;
  return () => {
    if (emCurso) {
      outraVez = true;
      return emCurso;
    }
    emCurso = (async () => {
      try {
        do {
          outraVez = false;
          try {
            await carregar();
          } catch {
            // A loja guarda o erro; o tempo real só volta a pedir no próximo evento.
          }
        } while (outraVez);
      } finally {
        emCurso = null;
      }
    })();
    return emCurso;
  };
}

export interface AvisoLote {
  id: number;
  texto: string;
}

/** Junta um aviso à pilha; acima de `maximo`, saem os mais antigos. O mais recente fica no fim. */
export function juntarAviso(avisos: readonly AvisoLote[], novo: AvisoLote, maximo = MAX_AVISOS): AvisoLote[] {
  return [...avisos, novo].slice(-maximo);
}
