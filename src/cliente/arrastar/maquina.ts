// Máquina de estados do arrastar, sem DOM: decide quando "carregar num nome" passa a arrastar,
// quando é só um clique e quando se cancela. O motor (motor.ts) liga-a aos eventos do browser.
//
// Rato: arrasta depois de andar LIMIAR_RATO_PX com o botão em baixo; levantar antes disso é um clique.
// Toque: o dedo continua a deslocar o mapa e a lista; só um toque longo (TOQUE_LONGO_MS parado, com
// TOLERANCIA_TOQUE_PX de folga) "levanta" o nome. Mexer antes disso ou pôr outro dedo cancela.

import type { Id } from '../../dominio/tipos';

/** Distância (px) que o rato tem de andar com o botão em baixo para começar a arrastar. */
export const LIMIAR_RATO_PX = 5;
/** Tempo (ms) que o dedo tem de ficar parado num nome para o levantar. */
export const TOQUE_LONGO_MS = 350;
/** Quanto o dedo pode mexer (px) durante o toque longo sem o cancelar. */
export const TOLERANCIA_TOQUE_PX = 8;

/** Caneta conta como rato (tem botão e precisão). */
export type Ponteiro = 'rato' | 'toque';

export type EstadoArrasto =
  | { fase: 'inativo' }
  | {
      fase: 'pendente';
      ponteiro: Ponteiro;
      pointerId: number;
      pessoaId: Id;
      /** Onde e quando carregou. */
      x0: number;
      y0: number;
      t0: number;
      /** Última posição conhecida. */
      x: number;
      y: number;
    }
  | { fase: 'aArrastar'; ponteiro: Ponteiro; pointerId: number; pessoaId: Id; x: number; y: number };

export type EventoArrasto =
  | { tipo: 'baixar'; ponteiro: Ponteiro; pointerId: number; pessoaId: Id; x: number; y: number; t: number }
  /** Outro ponteiro carregou (ex.: um segundo dedo). */
  | { tipo: 'baixarOutro'; pointerId: number }
  | { tipo: 'mover'; pointerId: number; x: number; y: number }
  /** Passou tempo (temporizador do toque longo). */
  | { tipo: 'tempo'; t: number }
  | { tipo: 'levantar'; pointerId: number; x: number; y: number }
  /** Esc, pointercancel, a janela perdeu o foco, saiu-se do modo de edição… */
  | { tipo: 'cancelar' };

/** O que o motor tem de fazer depois da transição. */
export type Efeito = 'comecar' | 'mover' | 'largar' | 'cancelar' | null;

export const INATIVO: EstadoArrasto = { fase: 'inativo' };

export interface Transicao {
  estado: EstadoArrasto;
  efeito: Efeito;
}

function distancia(x0: number, y0: number, x: number, y: number): number {
  return Math.hypot(x - x0, y - y0);
}

const nada = (estado: EstadoArrasto): Transicao => ({ estado, efeito: null });

type Pendente = Extract<EstadoArrasto, { fase: 'pendente' }>;
type AArrastar = Extract<EstadoArrasto, { fase: 'aArrastar' }>;

function comecar(estado: Pendente, x: number, y: number): Transicao {
  const { ponteiro, pointerId, pessoaId } = estado;
  return { estado: { fase: 'aArrastar', ponteiro, pointerId, pessoaId, x, y }, efeito: 'comecar' };
}

function dePendente(estado: Pendente, evento: EventoArrasto): Transicao {
  switch (evento.tipo) {
    case 'mover': {
      if (evento.pointerId !== estado.pointerId) return nada(estado);
      const d = distancia(estado.x0, estado.y0, evento.x, evento.y);
      if (estado.ponteiro === 'toque') {
        // O dedo mexeu-se antes do toque longo: é um deslocamento do mapa ou da lista.
        return d > TOLERANCIA_TOQUE_PX ? nada(INATIVO) : nada({ ...estado, x: evento.x, y: evento.y });
      }
      return d < LIMIAR_RATO_PX
        ? nada({ ...estado, x: evento.x, y: evento.y })
        : comecar(estado, evento.x, evento.y);
    }
    case 'tempo':
      if (estado.ponteiro !== 'toque' || evento.t - estado.t0 < TOQUE_LONGO_MS) return nada(estado);
      return comecar(estado, estado.x, estado.y);
    case 'levantar':
      // Levantou sem arrastar: é um clique (tratado pelo próprio nome).
      return evento.pointerId === estado.pointerId ? nada(INATIVO) : nada(estado);
    default:
      // baixar, baixarOutro, cancelar
      return nada(INATIVO);
  }
}

function deArrastar(estado: AArrastar, evento: EventoArrasto): Transicao {
  switch (evento.tipo) {
    case 'mover':
      if (evento.pointerId !== estado.pointerId) return nada(estado);
      return { estado: { ...estado, x: evento.x, y: evento.y }, efeito: 'mover' };
    case 'levantar':
      if (evento.pointerId !== estado.pointerId) return nada(estado);
      return { estado: INATIVO, efeito: 'largar' };
    case 'tempo':
      return nada(estado);
    default:
      // baixar, baixarOutro, cancelar
      return { estado: INATIVO, efeito: 'cancelar' };
  }
}

/** Função pura: estado + evento → novo estado e o efeito a executar. */
export function transitar(estado: EstadoArrasto, evento: EventoArrasto): Transicao {
  if (estado.fase === 'pendente') return dePendente(estado, evento);
  if (estado.fase === 'aArrastar') return deArrastar(estado, evento);
  if (evento.tipo !== 'baixar') return nada(estado);
  return nada({
    fase: 'pendente',
    ponteiro: evento.ponteiro,
    pointerId: evento.pointerId,
    pessoaId: evento.pessoaId,
    x0: evento.x,
    y0: evento.y,
    t0: evento.t,
    x: evento.x,
    y: evento.y,
  });
}
