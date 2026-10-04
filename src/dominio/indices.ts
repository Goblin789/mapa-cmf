// Índices calculados a partir do estado: quem mora em cada casa, quem vai em cada carrinha, etc.
// Só contam pessoas ativas. As listas vêm ordenadas por nome curto.
// M2: com `hoje` (AAAA-MM-DD no Luxemburgo), também quem está indisponível nesse dia e quantos lugares estão
// ocupados em cada carrinha sem contar com eles (a lotação da carrinha); e os problemas abertos por casa e
// por carrinha. Sem `hoje` (servidor, importação), ninguém está indisponível.

import { indisponiveisEm } from './indisponibilidade';
import { problemasAbertosPorAlvo } from './problemas';
import type {
  Carrinha,
  Casa,
  Cliente,
  Estado,
  Id,
  Indisponibilidade,
  Local,
  Obra,
  Pessoa,
  Problema,
} from './tipos';

export interface Indices {
  clientes: Map<Id, Cliente>;
  locais: Map<Id, Local>;
  casas: Map<Id, Casa>;
  carrinhas: Map<Id, Carrinha>;
  obras: Map<Id, Obra>;
  pessoas: Map<Id, Pessoa>;
  /** Pessoas ativas por casa. Todas as casas têm entrada (lista vazia se não tiver ninguém). */
  moradores: Map<Id, Pessoa[]>;
  /** Pessoas ativas por carrinha, com o condutor em primeiro. Todas as carrinhas têm entrada. */
  passageiros: Map<Id, Pessoa[]>;
  /** Pessoas ativas por obra. Todas as obras têm entrada. */
  trabalhadores: Map<Id, Pessoa[]>;
  /** Pessoas ativas sem casa ("Fora das casas CMF"). */
  foraDasCasas: Pessoa[];
  /** Pessoas ativas sem carrinha ("Sem transporte da empresa"). */
  semTransporte: Pessoa[];
  /** Casas por local, ordenadas por `ordem`. */
  casasPorLocal: Map<Id, Casa[]>;
  /** M2: o dia usado para as indisponibilidades (null = ninguém indisponível). */
  hoje: string | null;
  /** M2: pessoas ativas indisponíveis em `hoje` → o período que inclui esse dia. */
  indisponiveis: Map<Id, Indisponibilidade>;
  /**
   * M2: lugares ocupados em cada carrinha = passageiros que NÃO estão indisponíveis hoje (a lotação da
   * carrinha; ocupacao.ts, ocupacaoDaCarrinha). Todas as carrinhas têm entrada. Na casa a cama não se liberta:
   * os moradores contam sempre (moradores.get(id).length).
   */
  ocupadosCarrinha: Map<Id, number>;
  /** M2: problemas abertos por "casa:<id>" / "carrinha:<id>" (problemas.ts, chaveAlvoProblema). */
  problemasAbertos: Map<string, Problema[]>;
}

/** O que indexar precisa (a importação monta o estado sem indisponibilidades nem problemas). */
export type EstadoParaIndexar = Omit<Estado, 'indisponibilidades' | 'problemas'> &
  Partial<Pick<Estado, 'indisponibilidades' | 'problemas'>>;

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

/**
 * @param hoje M2: dia (AAAA-MM-DD, no Luxemburgo) para as indisponibilidades; sem ele ninguém está
 *   indisponível. O servidor e a importação não precisam. CONTRATO DO M2: em src/cliente (fora dos testes)
 *   passa-se SEMPRE, explicitamente, `loja.hoje` (ou null de propósito): um teste
 *   (src/cliente/regras-m2.test.ts) recusa `indexar(x)` sem o 2.º argumento, para a lotação das carrinhas
 *   ser a mesma em todo o lado.
 */
export function indexar(estado: EstadoParaIndexar, hoje: string | null = null): Indices {
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
  for (const carrinha of estado.carrinhas) {
    const lista = passageiros.get(carrinha.id);
    const i = carrinha.condutorId && lista ? lista.findIndex((p) => p.id === carrinha.condutorId) : -1;
    if (lista && i > 0) lista.unshift(...lista.splice(i, 1));
  }

  const casasPorLocal = new Map<Id, Casa[]>();
  for (const casa of [...estado.casas].sort((a, b) => a.ordem - b.ordem)) {
    const lista = casasPorLocal.get(casa.localId);
    if (lista) lista.push(casa);
    else casasPorLocal.set(casa.localId, [casa]);
  }

  const periodos = { pessoas: estado.pessoas, indisponibilidades: estado.indisponibilidades ?? [] };
  const indisponiveis = hoje === null ? new Map<Id, Indisponibilidade>() : indisponiveisEm(periodos, hoje);
  const ocupadosCarrinha = new Map<Id, number>();
  for (const [carrinhaId, lista] of passageiros) {
    ocupadosCarrinha.set(carrinhaId, lista.filter((p) => !indisponiveis.has(p.id)).length);
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
    hoje,
    indisponiveis,
    ocupadosCarrinha,
    problemasAbertos: problemasAbertosPorAlvo({ problemas: estado.problemas ?? [] }),
  };
}
