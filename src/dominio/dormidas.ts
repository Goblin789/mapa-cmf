// Onde dorme cada carrinha. Enquanto não estiver definido, sugere-se a casa onde mora
// a maioria dos passageiros (para o Rafael confirmar).

import type { Indices } from './indices';
import type { Estado, Id } from './tipos';

export type ConfiancaDormida = 'definida' | 'sugerida' | 'desconhecida';

export interface Dormida {
  carrinhaId: Id;
  /** Casa onde dorme (definida ou sugerida). */
  casaId: Id | null;
  /** Local no mapa onde a carrinha aparece; null se desconhecido. */
  localId: Id | null;
  confianca: ConfiancaDormida;
}

export function dormidasDasCarrinhas(estado: Estado, ind: Indices): Map<Id, Dormida> {
  const resultado = new Map<Id, Dormida>();
  for (const carrinha of estado.carrinhas) {
    if (carrinha.dormeCasaId) {
      const casa = ind.casas.get(carrinha.dormeCasaId);
      resultado.set(carrinha.id, {
        carrinhaId: carrinha.id,
        casaId: carrinha.dormeCasaId,
        localId: casa?.localId ?? null,
        confianca: 'definida',
      });
      continue;
    }
    if (carrinha.dormeLocalId) {
      resultado.set(carrinha.id, {
        carrinhaId: carrinha.id,
        casaId: null,
        localId: carrinha.dormeLocalId,
        confianca: 'definida',
      });
      continue;
    }

    const votos = new Map<Id, number>();
    for (const p of ind.passageiros.get(carrinha.id) ?? []) {
      if (p.casaId && ind.casas.has(p.casaId)) votos.set(p.casaId, (votos.get(p.casaId) ?? 0) + 1);
    }
    let melhor: Id | null = null;
    let melhorVotos = 0;
    for (const [casaId, n] of votos) {
      const ordem = ind.casas.get(casaId)?.ordem ?? Number.POSITIVE_INFINITY;
      const ordemMelhor = melhor ? (ind.casas.get(melhor)?.ordem ?? Number.POSITIVE_INFINITY) : 0;
      if (n > melhorVotos || (n === melhorVotos && ordem < ordemMelhor)) {
        melhor = casaId;
        melhorVotos = n;
      }
    }
    resultado.set(carrinha.id, {
      carrinhaId: carrinha.id,
      casaId: melhor,
      localId: melhor ? (ind.casas.get(melhor)?.localId ?? null) : null,
      confianca: melhor ? 'sugerida' : 'desconhecida',
    });
  }
  return resultado;
}
