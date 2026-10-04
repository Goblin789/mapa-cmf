// Vista Quadro: o que se acende para mostrar uma pessoa, casa ou carrinha (pedidos de vistas/mostrar.ts e
// o foco da ficha) e que blocos têm alterações por guardar. Funções puras.
//
// Uma casa no Quadro por carrinhas não tem bloco (nem uma carrinha no Quadro por casas): acendem-se os
// nomes de quem lá mora (ou de quem lá vai), que é o que interessa ver. Sem ninguém, acende-se a ligação
// que o rodapé mostra: a casa onde a carrinha dorme, ou as carrinhas que dormem na casa. Se nem isso
// houver, a vista não tem nada para acender e diz porquê num aviso curto (avisoSemNadaNoQuadro).

import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import type { Operacao } from '../../dominio/operacoes';
import type { Id } from '../../dominio/tipos';
import { sitioTemAlteracoes } from '../edicao/resumo';
import { ROTULO_TIPO_VEICULO } from '../paineis/textos';
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
 * Aviso curto quando se pede para mostrar uma casa (no Quadro por carrinhas) ou uma carrinha (no Quadro
 * por casas) e não há nada no Quadro a que chegar (chavesNoQuadro vazio): sem isto, a ficha abria e a
 * vista ficava parada, sem sinal nenhum. null quando há o que acender, num elemento que tem bloco neste
 * agrupamento (está sempre lá), numa pessoa ou num elemento que não existe. O agrupamento não muda.
 */
export function avisoSemNadaNoQuadro(
  elemento: ElementoVista,
  agrupamento: Agrupamento,
  ind: Indices,
  dormidas: ReadonlyMap<Id, Dormida>,
): string | null {
  if (chavesNoQuadro(elemento, agrupamento, ind, dormidas).length > 0) return null;
  if (elemento.tipo === 'casa' && agrupamento === 'carrinhas') {
    const casa = ind.casas.get(elemento.id);
    return casa ? `${casa.nome}: ninguém mora lá e nenhuma carrinha dorme lá.` : null;
  }
  if (elemento.tipo === 'carrinha' && agrupamento === 'casas') {
    const carrinha = ind.carrinhas.get(elemento.id);
    if (!carrinha) return null;
    const nela = carrinha.tipo === 'carro' ? 'nele' : 'nela';
    return `${ROTULO_TIPO_VEICULO[carrinha.tipo]} ${formatarMatricula(carrinha.matricula)}: ninguém vai ${nela} e não dorme em nenhuma casa.`;
  }
  return null;
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

/**
 * O filtro do Quadro (clientes, obras) esconde tudo o que se ia acender: há chaves e são todas de pessoas
 * que não passam (os blocos das casas e carrinhas ficam sempre, mesmo recolhidos). Quem pediu para mostrar
 * limpa então o filtro, como a Tabela faz com os dela. Com alguma à vista, acende-se essa e o filtro fica.
 */
export function filtroEscondeTudo(chaves: readonly string[], passa: (pessoaId: Id) => boolean): boolean {
  const prefixo = 'pessoa:';
  return chaves.length > 0 && chaves.every((c) => c.startsWith(prefixo) && !passa(c.slice(prefixo.length)));
}

/**
 * No modo de edição, quem está selecionado e o filtro do Quadro passa a esconder sai da seleção: senão ia
 * no arrasto (o motor leva a seleção toda) sem se ver. `null` quando ninguém sai; senão a seleção que fica
 * (pela mesma ordem) e o aviso curto a mostrar.
 */
export function selecaoSemEscondidos(
  selecao: ReadonlySet<Id>,
  passa: (pessoaId: Id) => boolean,
): { fica: Id[]; aviso: string } | null {
  const fica = [...selecao].filter(passa);
  const saem = selecao.size - fica.length;
  if (saem === 0) return null;
  const aviso =
    saem === 1
      ? '1 pessoa escondida pelo filtro saiu da seleção.'
      : `${saem} pessoas escondidas pelo filtro saíram da seleção.`;
  return { fica, aviso };
}
