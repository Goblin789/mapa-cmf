// "Quem vem para esta obra e de onde" (ficha da obra, M2, docs/m2.md "Obras"): as pessoas da obra agrupadas
// pela casa onde moram (pela ordem das casas; "Sem casa" no fim), cada uma com a carrinha em que vai, e as
// carrinhas que lá chegam com quantas pessoas da obra. Funções puras.

import type { Indices } from '../../dominio/indices';
import { compararPessoas } from '../../dominio/indices';
import type { Carrinha, Casa, Id, Pessoa } from '../../dominio/tipos';

export interface PessoaDaObra {
  pessoa: Pessoa;
  /** A carrinha em que vai (null = sem transporte da empresa). */
  carrinha: Carrinha | null;
}

export interface GrupoCasaObra {
  /** null = sem casa ("Fora das casas CMF"). */
  casa: Casa | null;
  pessoas: PessoaDaObra[];
}

/** As pessoas da obra por casa (a ordem das casas; sem casa no fim) e, em cada casa, pelo nome. */
export function quemVemParaAObra(
  obraId: Id,
  ind: Pick<Indices, 'trabalhadores' | 'casas' | 'carrinhas'>,
): GrupoCasaObra[] {
  const porCasa = new Map<Id | null, PessoaDaObra[]>();
  for (const pessoa of ind.trabalhadores.get(obraId) ?? []) {
    const casaId = pessoa.casaId && ind.casas.has(pessoa.casaId) ? pessoa.casaId : null;
    const carrinha = pessoa.carrinhaId ? (ind.carrinhas.get(pessoa.carrinhaId) ?? null) : null;
    const lista = porCasa.get(casaId);
    const item = { pessoa, carrinha };
    if (lista) lista.push(item);
    else porCasa.set(casaId, [item]);
  }
  const grupos = [...porCasa].map(([casaId, pessoas]) => ({
    casa: casaId ? (ind.casas.get(casaId) ?? null) : null,
    pessoas: pessoas.sort((a, b) => compararPessoas(a.pessoa, b.pessoa)),
  }));
  return grupos.sort((a, b) =>
    a.casa === null
      ? 1
      : b.casa === null
        ? -1
        : a.casa.ordem - b.casa.ordem || a.casa.nome.localeCompare(b.casa.nome, 'pt'),
  );
}

export interface CarrinhaDaObra {
  carrinha: Carrinha;
  /** Pessoas da obra que vão nela. */
  n: number;
}

/** As carrinhas que levam gente para a obra (mais pessoas primeiro) e quantas pessoas vão sem transporte. */
export function carrinhasDaObra(grupos: readonly GrupoCasaObra[]): {
  carrinhas: CarrinhaDaObra[];
  semTransporte: number;
} {
  const contagem = new Map<Id, CarrinhaDaObra>();
  let semTransporte = 0;
  for (const { carrinha } of grupos.flatMap((g) => g.pessoas)) {
    if (!carrinha) {
      semTransporte++;
      continue;
    }
    const c = contagem.get(carrinha.id);
    if (c) c.n++;
    else contagem.set(carrinha.id, { carrinha, n: 1 });
  }
  const carrinhas = [...contagem.values()].sort((a, b) => b.n - a.n || a.carrinha.ordem - b.carrinha.ordem);
  return { carrinhas, semTransporte };
}
