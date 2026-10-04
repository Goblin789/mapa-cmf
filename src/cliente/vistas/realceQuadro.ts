// Vista Quadro: o que se acende para mostrar uma pessoa, casa ou carrinha (pedidos de vistas/mostrar.ts e
// o foco da ficha) e que blocos têm alterações por guardar. Funções puras.
//
// Uma casa no Quadro por carrinhas não tem bloco (nem uma carrinha no Quadro por casas): acendem-se os
// nomes de quem lá mora (ou de quem lá vai), que é o que interessa ver. Sem ninguém, acende-se a ligação
// que o rodapé mostra: a casa onde a carrinha dorme, ou as carrinhas que dormem na casa.

import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import type { Operacao } from '../../dominio/operacoes';
import type { Id } from '../../dominio/tipos';
import { sitioTemAlteracoes } from '../edicao/resumo';
import type { BlocoQuadro } from './agrupamentoQuadro';
import { chaveElemento, type ElementoVista } from './mostrar';
import type { Agrupamento } from './vista';

const chavesPessoas = (pessoas: readonly { id: Id }[]): string[] =>
  pessoas.map((p) => chaveElemento({ tipo: 'pessoa', id: p.id }));

/**
 * Chaves (data-elemento) a acender no Quadro para mostrar o elemento: a pessoa (se ativa), o bloco da
 * casa ou da carrinha ou, quando não tem bloco neste agrupamento, os moradores ou os passageiros. Se não
 * há ninguém (ex.: uma carrinha vazia no Quadro por casas), o bloco da ligação: a casa onde a carrinha
 * dorme (definida ou sugerida) ou as carrinhas que dormem na casa. Vazio se o elemento não existir ou
 * não houver nada a que chegar.
 */
export function chavesNoQuadro(
  elemento: ElementoVista,
  agrupamento: Agrupamento,
  ind: Indices,
  dormidas: ReadonlyMap<Id, Dormida>,
): string[] {
  switch (elemento.tipo) {
    case 'pessoa':
      return ind.pessoas.get(elemento.id)?.ativa ? [chaveElemento(elemento)] : [];
    case 'casa': {
      if (!ind.casas.has(elemento.id)) return [];
      if (agrupamento === 'casas') return [chaveElemento(elemento)];
      const moradores = ind.moradores.get(elemento.id) ?? [];
      if (moradores.length > 0) return chavesPessoas(moradores);
      const chaves: string[] = [];
      for (const d of dormidas.values()) {
        if (d.casaId === elemento.id && ind.carrinhas.has(d.carrinhaId)) {
          chaves.push(chaveElemento({ tipo: 'carrinha', id: d.carrinhaId }));
        }
      }
      return chaves;
    }
    case 'carrinha': {
      if (!ind.carrinhas.has(elemento.id)) return [];
      if (agrupamento === 'carrinhas') return [chaveElemento(elemento)];
      const passageiros = ind.passageiros.get(elemento.id) ?? [];
      if (passageiros.length > 0) return chavesPessoas(passageiros);
      const casaId = dormidas.get(elemento.id)?.casaId ?? null;
      return casaId !== null && ind.casas.has(casaId) ? [chaveElemento({ tipo: 'casa', id: casaId })] : [];
    }
  }
}

/**
 * Pessoas a realçar levemente enquanto a casa ou carrinha em foco não tem bloco neste agrupamento (casa no
 * Quadro por carrinhas, carrinha no Quadro por casas). Vazio nos outros casos: aí o bloco tem o anel.
 */
export function pessoasDoFocoSemBloco(
  foco: ElementoVista | null,
  agrupamento: Agrupamento,
  ind: Indices,
): ReadonlySet<Id> {
  if (foco?.tipo === 'casa' && agrupamento === 'carrinhas') {
    return new Set((ind.moradores.get(foco.id) ?? []).map((p) => p.id));
  }
  if (foco?.tipo === 'carrinha' && agrupamento === 'casas') {
    return new Set((ind.passageiros.get(foco.id) ?? []).map((p) => p.id));
  }
  return new Set();
}

/**
 * O bloco tem alterações por guardar: numa casa ou carrinha, entra ou sai alguém (numa carrinha também o
 * condutor ou onde dorme); em "Fora das casas CMF" ou "Sem transporte", entra ou sai alguém do grupo.
 */
export function blocoTemAlteracoes(
  pendentes: readonly Operacao[],
  bloco: Pick<BlocoQuadro, 'tipo' | 'id'>,
): boolean {
  switch (bloco.tipo) {
    case 'casa':
      return bloco.id !== null && sitioTemAlteracoes(pendentes, 'casaId', bloco.id);
    case 'carrinha':
      return bloco.id !== null && sitioTemAlteracoes(pendentes, 'carrinhaId', bloco.id);
    case 'fora':
    case 'sem-transporte': {
      const campo = bloco.tipo === 'fora' ? 'casaId' : 'carrinhaId';
      return pendentes.some(
        (op) => op.tipo === 'mover' && op.campo === campo && (op.de === null || op.para === null),
      );
    }
  }
}
