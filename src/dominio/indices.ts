// Índices calculados a partir do estado: quem mora em cada casa, quem vai em cada carrinha, etc.
// Só contam pessoas ativas. As listas vêm ordenadas por nome curto.

import type { Carrinha, Casa, Cliente, Estado, Id, Local, Obra, Pessoa } from './tipos';

export interface Indices {
  clientes: Map<Id, Cliente>;
  locais: Map<Id, Local>;
  casas: Map<Id, Casa>;
  carrinhas: Map<Id, Carrinha>;
  obras: Map<Id, Obra>;
  pessoas: Map<Id, Pessoa>;
  /** Pessoas ativas por casa. Todas as casas têm entrada (lista vazia se não tiver ninguém). */
  moradores: Map<Id, Pessoa[]>;
  /** Pessoas ativas por carrinha. Todas as carrinhas têm entrada. */
  passageiros: Map<Id, Pessoa[]>;
  /** Pessoas ativas por obra. Todas as obras têm entrada. */
  trabalhadores: Map<Id, Pessoa[]>;
  /** Pessoas ativas sem casa ("Fora das casas CMF"). */
  foraDasCasas: Pessoa[];
  /** Pessoas ativas sem carrinha ("Sem transporte da empresa"). */
  semTransporte: Pessoa[];
  /** Casas por local, ordenadas por `ordem`. */
  casasPorLocal: Map<Id, Casa[]>;
}

const comparadorNomes = new Intl.Collator('pt', { sensitivity: 'base' });

export function compararPessoas(a: Pessoa, b: Pessoa): number {
  return comparadorNomes.compare(a.nomeCurto, b.nomeCurto);
}

function porId<T extends { id: Id }>(lista: T[]): Map<Id, T> {
  return new Map(lista.map((x) => [x.id, x]));
}

function listasVazias(ids: Id[]): Map<Id, Pessoa[]> {
  return new Map(ids.map((id) => [id, []]));
}

export function indexar(estado: Estado): Indices {
  const moradores = listasVazias(estado.casas.map((c) => c.id));
  const passageiros = listasVazias(estado.carrinhas.map((c) => c.id));
  const trabalhadores = listasVazias(estado.obras.map((o) => o.id));
  const foraDasCasas: Pessoa[] = [];
  const semTransporte: Pessoa[] = [];

  for (const p of estado.pessoas) {
    if (!p.ativa) continue;
    const listaCasa = p.casaId ? moradores.get(p.casaId) : undefined;
    if (listaCasa) listaCasa.push(p);
    else foraDasCasas.push(p);
    const listaCarrinha = p.carrinhaId ? passageiros.get(p.carrinhaId) : undefined;
    if (listaCarrinha) listaCarrinha.push(p);
    else semTransporte.push(p);
    if (p.obraId) trabalhadores.get(p.obraId)?.push(p);
  }
  for (const lista of [...moradores.values(), ...passageiros.values(), ...trabalhadores.values()]) {
    lista.sort(compararPessoas);
  }
  foraDasCasas.sort(compararPessoas);
  semTransporte.sort(compararPessoas);

  const casasPorLocal = new Map<Id, Casa[]>();
  for (const casa of [...estado.casas].sort((a, b) => a.ordem - b.ordem)) {
    const lista = casasPorLocal.get(casa.localId);
    if (lista) lista.push(casa);
    else casasPorLocal.set(casa.localId, [casa]);
  }

  return {
    clientes: porId(estado.clientes),
    locais: porId(estado.locais),
    casas: porId(estado.casas),
    carrinhas: porId(estado.carrinhas),
    obras: porId(estado.obras),
    pessoas: porId(estado.pessoas),
    moradores,
    passageiros,
    trabalhadores,
    foraDasCasas,
    semTransporte,
    casasPorLocal,
  };
}
