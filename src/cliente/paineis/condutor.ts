// Condutor das carrinhas visto pelos painéis e pela lista: quem conduz, que carrinha conduz cada pessoa
// e que carrinhas levam gente sem ninguém a conduzir. Funções puras sobre os índices (estado visível).

import type { Indices } from '../../dominio/indices';
import type { Carrinha, Pessoa } from '../../dominio/tipos';

/**
 * Carrinha que a pessoa conduz (tem de ir nela); null se não conduz nenhuma. Uma pessoa inativa não conduz,
 * como em condutorDaCarrinha (senão a ficha dela dizia "Condutor da …" e a da carrinha "sem condutor").
 */
export function carrinhaConduzida(p: Pessoa, ind: Pick<Indices, 'carrinhas'>): Carrinha | null {
  const carrinha = p.ativa && p.carrinhaId ? ind.carrinhas.get(p.carrinhaId) : undefined;
  return carrinha && carrinha.condutorId === p.id ? carrinha : null;
}

/** A pessoa é o condutor da carrinha onde vai (leva o volante ao lado do nome, em qualquer lista). */
export function ehCondutor(p: Pessoa, ind: Pick<Indices, 'carrinhas'>): boolean {
  return carrinhaConduzida(p, ind) !== null;
}

/**
 * Condutor da carrinha, se for um dos passageiros (ativos). Um condutor inativo ou que já não vai nela
 * não conta: para quem organiza, a carrinha está sem condutor.
 */
export function condutorDaCarrinha(carrinha: Carrinha, ind: Pick<Indices, 'passageiros'>): Pessoa | null {
  if (carrinha.condutorId === null) return null;
  return ind.passageiros.get(carrinha.id)?.find((p) => p.id === carrinha.condutorId) ?? null;
}

/** Leva passageiros e nenhum deles é o condutor. */
export function semCondutor(carrinha: Carrinha, ind: Pick<Indices, 'passageiros'>): boolean {
  const passageiros = ind.passageiros.get(carrinha.id) ?? [];
  return passageiros.length > 0 && condutorDaCarrinha(carrinha, ind) === null;
}

export const ROTULO_SEM_CONDUTOR = 'sem condutor';
