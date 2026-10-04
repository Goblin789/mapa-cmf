// Vista Quadro: o que se acende para mostrar uma pessoa, casa, carrinha ou obra (pedidos de vistas/mostrar.ts
// e o foco da ficha) e que blocos têm alterações por guardar. Funções puras.
//
// Uma casa no Quadro por carrinhas não tem bloco (nem uma carrinha no Quadro por casas): acendem-se os
// nomes de quem lá mora (ou de quem lá vai), que é o que interessa ver. Sem ninguém, acende-se a ligação
// que o rodapé mostra: a casa onde a carrinha dorme, ou as carrinhas que dormem na casa. Se nem isso
// houver, a vista não tem nada para acender e diz porquê num aviso curto (avisoSemNadaNoQuadro).
// M2 (obras): a obra só tem bloco no Quadro por obras; nos outros acendem-se as pessoas dela. No Quadro por
// obras, as casas e as carrinhas não têm bloco: acendem-se os moradores ou os passageiros.

import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import type { Operacao } from '../../dominio/operacoes';
import type { Estado, Id } from '../../dominio/tipos';
import { sitioTemAlteracoes } from '../edicao/resumo';
import { ROTULO_TIPO_VEICULO } from '../paineis/textos';
import type { BlocoQuadro } from './agrupamentoQuadro';
import { chaveElemento, type ElementoVista } from './mostrar';
import type { Agrupamento } from './vista';

const chavesPessoas = (pessoas: readonly { id: Id }[]): string[] =>
  pessoas.map((p) => chaveElemento({ tipo: 'pessoa', id: p.id }));

/**
 * Chaves (data-elemento) a acender no Quadro para mostrar o elemento: a pessoa (se ativa), o bloco da
 * casa, da carrinha ou da obra ou, quando não tem bloco neste agrupamento, os moradores, os passageiros ou
 * quem lá trabalha. No Quadro por carrinhas, uma casa sem moradores acende as carrinhas que lá dormem; no
 * Quadro por casas, uma carrinha vazia acende a casa onde dorme (definida ou sugerida). Vazio se o
 * elemento não existir ou não houver nada a que chegar.
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
      if (agrupamento !== 'carrinhas') return [];
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
      if (agrupamento !== 'casas') return [];
      const casaId = dormidas.get(elemento.id)?.casaId ?? null;
      return casaId !== null && ind.casas.has(casaId) ? [chaveElemento({ tipo: 'casa', id: casaId })] : [];
    }
    case 'obra': {
      // M2: no Quadro por obras, o bloco da obra (está sempre lá); nos outros, quem trabalha nela.
      if (!ind.obras.has(elemento.id)) return [];
      if (agrupamento === 'obras') return [chaveElemento(elemento)];
      return chavesPessoas(ind.trabalhadores.get(elemento.id) ?? []);
    }
  }
}

/**
 * Aviso curto quando se pede para mostrar um elemento sem bloco neste agrupamento e não há nada no Quadro a
 * que chegar (chavesNoQuadro vazio): uma casa sem ninguém (no Quadro por carrinhas, também sem carrinhas a
 * dormir lá), uma carrinha sem ninguém (no Quadro por casas, também sem casa onde dorme) ou uma obra sem
 * ninguém fora do Quadro por obras. Sem isto, a ficha abria e a vista ficava parada, sem sinal nenhum. null
 * quando há o que acender, num elemento que tem bloco neste agrupamento (está sempre lá), numa pessoa ou
 * num elemento que não existe. O agrupamento não muda.
 */
export function avisoSemNadaNoQuadro(
  elemento: ElementoVista,
  agrupamento: Agrupamento,
  ind: Indices,
  dormidas: ReadonlyMap<Id, Dormida>,
): string | null {
  if (chavesNoQuadro(elemento, agrupamento, ind, dormidas).length > 0) return null;
  if (elemento.tipo === 'casa' && agrupamento !== 'casas') {
    const casa = ind.casas.get(elemento.id);
    if (!casa) return null;
    return agrupamento === 'carrinhas'
      ? `${casa.nome}: ninguém mora lá e nenhuma carrinha dorme lá.`
      : `${casa.nome}: ninguém mora lá.`;
  }
  if (elemento.tipo === 'carrinha' && agrupamento !== 'carrinhas') {
    const carrinha = ind.carrinhas.get(elemento.id);
    if (!carrinha) return null;
    const nela = carrinha.tipo === 'carro' ? 'nele' : 'nela';
    const nome = `${ROTULO_TIPO_VEICULO[carrinha.tipo]} ${formatarMatricula(carrinha.matricula)}`;
    return agrupamento === 'casas'
      ? `${nome}: ninguém vai ${nela} e não dorme em nenhuma casa.`
      : `${nome}: ninguém vai ${nela}.`;
  }
  if (elemento.tipo === 'obra' && agrupamento !== 'obras') {
    const obra = ind.obras.get(elemento.id);
    return obra ? `${obra.nome}: ninguém trabalha nesta obra.` : null;
  }
  return null;
}

/**
 * Pessoas a realçar levemente enquanto a casa, carrinha ou obra em foco não tem bloco neste agrupamento
 * (casa no Quadro por carrinhas ou por obras, carrinha no Quadro por casas ou por obras, obra no Quadro por
 * casas ou por carrinhas). Vazio nos outros casos: aí o bloco tem o anel.
 */
export function pessoasDoFocoSemBloco(
  foco: ElementoVista | null,
  agrupamento: Agrupamento,
  ind: Indices,
): ReadonlySet<Id> {
  const ids = (lista: readonly { id: Id }[] | undefined) => new Set((lista ?? []).map((p) => p.id));
  if (foco?.tipo === 'casa' && agrupamento !== 'casas') return ids(ind.moradores.get(foco.id));
  if (foco?.tipo === 'carrinha' && agrupamento !== 'carrinhas') return ids(ind.passageiros.get(foco.id));
  if (foco?.tipo === 'obra' && agrupamento !== 'obras') return ids(ind.trabalhadores.get(foco.id));
  return new Set();
}

/**
 * A obra tem alterações por guardar (bloco do Quadro, ficha): as do sitioTemAlteracoes (entra ou sai alguém,
 * a ficha dela, a morada) e também a morada ou o pino do ESTACIONAMENTO dela (outro local).
 */
export function obraTemAlteracoes(
  pendentes: readonly Operacao[],
  obraId: Id,
  estadoVisivel: Pick<Estado, 'problemas' | 'casas' | 'obras'> | null,
): boolean {
  if (sitioTemAlteracoes(pendentes, 'obraId', obraId, estadoVisivel)) return true;
  const estacionamento = estadoVisivel?.obras.find((o) => o.id === obraId)?.estacionamentoLocalId ?? null;
  return (
    estacionamento !== null &&
    pendentes.some((op) => op.tipo === 'campo' && op.entidade === 'local' && op.id === estacionamento)
  );
}

/**
 * O bloco tem alterações por guardar: numa casa, carrinha ou obra, entra ou sai alguém (numa carrinha
 * também o condutor ou onde dorme) e, no M2, a ficha dela, a morada e os problemas (sitioTemAlteracoes, que
 * precisa do estado VISÍVEL para as operações 'campo' de um problema ou de um local); em "Fora das casas
 * CMF", "Sem transporte" ou "Sem obra", entra ou sai alguém do grupo.
 */
export function blocoTemAlteracoes(
  pendentes: readonly Operacao[],
  bloco: Pick<BlocoQuadro, 'tipo' | 'id'>,
  estadoVisivel: Pick<Estado, 'problemas' | 'casas' | 'obras'> | null,
): boolean {
  switch (bloco.tipo) {
    case 'casa':
      return bloco.id !== null && sitioTemAlteracoes(pendentes, 'casaId', bloco.id, estadoVisivel);
    case 'carrinha':
      return bloco.id !== null && sitioTemAlteracoes(pendentes, 'carrinhaId', bloco.id, estadoVisivel);
    case 'obra':
      return bloco.id !== null && obraTemAlteracoes(pendentes, bloco.id, estadoVisivel);
    case 'fora':
    case 'sem-transporte':
    case 'sem-obra': {
      const campo = bloco.tipo === 'fora' ? 'casaId' : bloco.tipo === 'sem-obra' ? 'obraId' : 'carrinhaId';
      return pendentes.some(
        (op) => op.tipo === 'mover' && op.campo === campo && (op.de === null || op.para === null),
      );
    }
  }
}

/**
 * O filtro do Quadro (clientes, obras) esconde tudo o que se ia acender: há chaves e são todas de pessoas
 * que não passam (os blocos das casas, carrinhas e obras ficam sempre, mesmo recolhidos). Quem pediu para
 * mostrar limpa então o filtro, como a Tabela faz com os dela. Com alguma à vista, acende-se essa e o filtro
 * fica.
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
