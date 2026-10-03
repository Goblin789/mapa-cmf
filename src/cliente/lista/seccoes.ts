// Lista lateral organizada como as folhas do Michael: uma secção por casa, por carrinha, por obra ou
// por cliente, com os nomes por baixo. Funções puras: agrupar, filtrar e ordenar.

import { clienteEfetivoId } from '../../dominio/cores';
import { compararPessoas, type Indices } from '../../dominio/indices';
import type { Alvo } from '../../dominio/operacoes';
import { compactar, normalizarTexto } from '../../dominio/pesquisa';
import type { Estado, Id, Pessoa } from '../../dominio/tipos';
import { clientesPorOrdem } from '../paineis/agrupar';
import { ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from '../paineis/textos';

export type Vista = 'casas' | 'carrinhas' | 'obras' | 'clientes';

export const VISTAS: readonly { id: Vista; rotulo: string }[] = [
  { id: 'casas', rotulo: 'Casas' },
  { id: 'carrinhas', rotulo: 'Carrinhas' },
  { id: 'obras', rotulo: 'Obras' },
  { id: 'clientes', rotulo: 'Clientes' },
];

export function ehVista(valor: unknown): valor is Vista {
  return VISTAS.some((v) => v.id === valor);
}

export const ROTULO_SEM_OBRA_SECCAO = 'Sem obra';
export const ROTULO_CLIENTE_DESCONHECIDO = 'Cliente desconhecido';

// --- Filtros ------------------------------------------------------------------------------------

export interface Filtros {
  /** Clientes escolhidos (o da cor da pessoa); vazio = todos. */
  clientes: ReadonlySet<Id>;
  /** Só quem tem algo por confirmar (a casa, a carrinha, ou qualquer das duas, conforme a vista). */
  soAConfirmar: boolean;
  /** Parte do nome (ou do Nº), sem acentos nem maiúsculas. */
  texto: string;
}

export const SEM_FILTROS: Filtros = { clientes: new Set(), soAConfirmar: false, texto: '' };

export function filtrosAtivos(f: Filtros): boolean {
  return f.clientes.size > 0 || f.soAConfirmar || normalizarTexto(f.texto) !== '';
}

/** O que conta como "a confirmar" em cada vista: nas casas a casa, nas carrinhas a carrinha. */
export function aConfirmarNaVista(p: Pessoa, vista: Vista): boolean {
  if (vista === 'casas') return p.casaAConfirmar;
  if (vista === 'carrinhas') return p.carrinhaAConfirmar;
  return p.casaAConfirmar || p.carrinhaAConfirmar;
}

function correspondeAoTexto(p: Pessoa, termo: string, termoCompacto: string): boolean {
  const nomes = [p.nomeCurto, `${p.nome} ${p.apelidos}`, ...p.nomesAlternativos];
  if (nomes.some((n) => normalizarTexto(n).includes(termo))) return true;
  return p.numero !== null && termoCompacto.length >= 2 && compactar(p.numero).includes(termoCompacto);
}

/** Devolve a função que diz se uma pessoa passa os filtros (preparada uma vez, usada em todas). */
export function criarFiltro(f: Filtros, vista: Vista, ind: Pick<Indices, 'obras'>): (p: Pessoa) => boolean {
  const termo = normalizarTexto(f.texto);
  const termoCompacto = compactar(f.texto);
  return (p) => {
    if (f.clientes.size > 0 && !f.clientes.has(clienteEfetivoId(p, ind.obras))) return false;
    if (f.soAConfirmar && !aConfirmarNaVista(p, vista)) return false;
    return termo === '' || correspondeAoTexto(p, termo, termoCompacto);
  };
}

// --- Ordem ----------------------------------------------------------------------------------------

/** Pela ordem dos clientes (as cores ficam juntas, como no Excel) e depois pelo nome. */
export function ordenarPorClienteENome(
  pessoas: readonly Pessoa[],
  ind: Pick<Indices, 'clientes' | 'obras'>,
): Pessoa[] {
  const ordemCliente = (p: Pessoa) =>
    ind.clientes.get(clienteEfetivoId(p, ind.obras))?.ordem ?? Number.MAX_SAFE_INTEGER;
  return [...pessoas].sort((a, b) => ordemCliente(a) - ordemCliente(b) || compararPessoas(a, b));
}

// --- Secções --------------------------------------------------------------------------------------

export type TipoSeccao = 'casa' | 'fora' | 'carrinha' | 'sem-transporte' | 'obra' | 'sem-obra' | 'cliente';

export interface Seccao {
  /** Única na vista: "casa:<id>", "fora", "cliente:<id>"… */
  chave: string;
  tipo: TipoSeccao;
  /** Id da casa, carrinha, obra ou cliente; null nos grupos especiais. */
  id: Id | null;
  /** Onde se larga no modo de edição; null nas secções por cliente (o cliente vem da obra). */
  alvo: Alvo | null;
  titulo: string;
  /** Casas da mesma morada ficam juntas, com o nome da morada por cima. */
  grupo: { chave: string; titulo: string } | null;
  /** Pessoas que passam os filtros, já ordenadas. */
  pessoas: Pessoa[];
  /** Pessoas ativas na secção, sem filtros (é o que conta para a lotação). */
  total: number;
  /** Lugares (lotação da casa, lugares da carrinha); null onde não há lugares. */
  lugares: number | null;
  /** Secção grande sem lugares: os nomes vão por cliente, com um subtítulo por cliente. */
  porCliente: boolean;
}

function criarSeccao(
  base: Omit<Seccao, 'pessoas' | 'total' | 'grupo' | 'porCliente'> &
    Partial<Pick<Seccao, 'grupo' | 'porCliente'>>,
  todas: readonly Pessoa[],
  filtro: (p: Pessoa) => boolean,
  ind: Indices,
): Seccao {
  return {
    grupo: null,
    porCliente: false,
    ...base,
    pessoas: ordenarPorClienteENome(todas.filter(filtro), ind),
    total: todas.length,
  };
}

function seccoesCasas(estado: Estado, ind: Indices, filtro: (p: Pessoa) => boolean): Seccao[] {
  const resultado: Seccao[] = [];
  const moradasVistas = new Set<Id>();
  // Pela ordem das casas; as da mesma morada entram todas juntas, no lugar da primeira.
  for (const primeira of [...estado.casas].sort((a, b) => a.ordem - b.ordem)) {
    if (moradasVistas.has(primeira.localId)) continue;
    moradasVistas.add(primeira.localId);
    const daMorada = ind.casasPorLocal.get(primeira.localId) ?? [primeira];
    const local = ind.locais.get(primeira.localId);
    const grupo =
      daMorada.length > 1
        ? { chave: `morada:${primeira.localId}`, titulo: local?.nome ?? 'Mesma morada' }
        : null;
    for (const casa of daMorada) {
      resultado.push(
        criarSeccao(
          {
            chave: `casa:${casa.id}`,
            tipo: 'casa',
            id: casa.id,
            alvo: { tipo: 'casa', id: casa.id },
            titulo: casa.nome,
            lugares: casa.lotacao,
            grupo,
          },
          ind.moradores.get(casa.id) ?? [],
          filtro,
          ind,
        ),
      );
    }
  }
  resultado.push(
    criarSeccao(
      {
        chave: 'fora',
        tipo: 'fora',
        id: null,
        alvo: { tipo: 'fora' },
        titulo: ROTULO_FORA_DAS_CASAS,
        lugares: null,
        porCliente: true,
      },
      ind.foraDasCasas,
      filtro,
      ind,
    ),
  );
  return resultado;
}

function seccoesCarrinhas(estado: Estado, ind: Indices, filtro: (p: Pessoa) => boolean): Seccao[] {
  const resultado = [...estado.carrinhas]
    .sort((a, b) => a.ordem - b.ordem || a.matricula.localeCompare(b.matricula))
    .map((carrinha) =>
      criarSeccao(
        {
          chave: `carrinha:${carrinha.id}`,
          tipo: 'carrinha',
          id: carrinha.id,
          alvo: { tipo: 'carrinha', id: carrinha.id },
          titulo: carrinha.matricula,
          lugares: carrinha.lugares,
        },
        ind.passageiros.get(carrinha.id) ?? [],
        filtro,
        ind,
      ),
    );
  resultado.push(
    criarSeccao(
      {
        chave: 'sem-transporte',
        tipo: 'sem-transporte',
        id: null,
        alvo: { tipo: 'sem-transporte' },
        titulo: ROTULO_SEM_TRANSPORTE,
        lugares: null,
        porCliente: true,
      },
      ind.semTransporte,
      filtro,
      ind,
    ),
  );
  return resultado;
}

function seccoesObras(estado: Estado, ind: Indices, filtro: (p: Pessoa) => boolean): Seccao[] {
  const ordemCliente = (id: Id) => ind.clientes.get(id)?.ordem ?? Number.MAX_SAFE_INTEGER;
  const resultado = [...estado.obras]
    .sort(
      (a, b) => ordemCliente(a.clienteId) - ordemCliente(b.clienteId) || a.nome.localeCompare(b.nome, 'pt'),
    )
    .map((obra) =>
      criarSeccao(
        {
          chave: `obra:${obra.id}`,
          tipo: 'obra',
          id: obra.id,
          alvo: { tipo: 'obra', id: obra.id },
          titulo: obra.nome,
          lugares: null,
        },
        ind.trabalhadores.get(obra.id) ?? [],
        filtro,
        ind,
      ),
    );
  const semObra = estado.pessoas.filter((p) => p.ativa && !(p.obraId && ind.obras.has(p.obraId)));
  resultado.push(
    criarSeccao(
      {
        chave: 'sem-obra',
        tipo: 'sem-obra',
        id: null,
        alvo: { tipo: 'sem-obra' },
        titulo: ROTULO_SEM_OBRA_SECCAO,
        lugares: null,
        porCliente: true,
      },
      semObra,
      filtro,
      ind,
    ),
  );
  return resultado;
}

function seccoesClientes(estado: Estado, ind: Indices, filtro: (p: Pessoa) => boolean): Seccao[] {
  const porCliente = new Map<Id, Pessoa[]>();
  for (const p of estado.pessoas) {
    if (!p.ativa) continue;
    const id = clienteEfetivoId(p, ind.obras);
    const lista = porCliente.get(id);
    if (lista) lista.push(p);
    else porCliente.set(id, [p]);
  }
  const resultado = clientesPorOrdem(estado.clientes).map((cliente) =>
    criarSeccao(
      {
        chave: `cliente:${cliente.id}`,
        tipo: 'cliente',
        id: cliente.id,
        alvo: null,
        titulo: cliente.nome,
        lugares: null,
      },
      porCliente.get(cliente.id) ?? [],
      filtro,
      ind,
    ),
  );
  // Pessoas cujo cliente não existe (não devia acontecer, mas não desaparecem).
  const desconhecidas = [...porCliente].filter(([id]) => !ind.clientes.has(id)).flatMap(([, lista]) => lista);
  if (desconhecidas.length > 0) {
    resultado.push(
      criarSeccao(
        {
          chave: 'cliente:?',
          tipo: 'cliente',
          id: null,
          alvo: null,
          titulo: ROTULO_CLIENTE_DESCONHECIDO,
          lugares: null,
        },
        desconhecidas,
        filtro,
        ind,
      ),
    );
  }
  return resultado;
}

/** As secções de uma vista, com os filtros aplicados aos nomes (as secções ficam todas). */
export function seccoesDaVista(vista: Vista, estado: Estado, ind: Indices, filtros: Filtros): Seccao[] {
  const filtro = criarFiltro(filtros, vista, ind);
  switch (vista) {
    case 'casas':
      return seccoesCasas(estado, ind, filtro);
    case 'carrinhas':
      return seccoesCarrinhas(estado, ind, filtro);
    case 'obras':
      return seccoesObras(estado, ind, filtro);
    case 'clientes':
      return seccoesClientes(estado, ind, filtro);
  }
}

/**
 * Secções a mostrar. Sem filtros, todas. Com filtros, só as que têm alguém, exceto no modo de edição:
 * aí as outras ficam (só com o cabeçalho) porque são sítios onde se pode largar.
 */
export interface SeccaoVisivel {
  seccao: Seccao;
  soCabecalho: boolean;
}

export function seccoesVisiveis(
  seccoes: readonly Seccao[],
  comFiltros: boolean,
  modoEdicao: boolean,
): SeccaoVisivel[] {
  return seccoes.flatMap((seccao): SeccaoVisivel[] => {
    if (!comFiltros || seccao.pessoas.length > 0) return [{ seccao, soCabecalho: false }];
    return modoEdicao && seccao.alvo ? [{ seccao, soCabecalho: true }] : [];
  });
}

/** Lugares vazios a desenhar (tracejados). Com filtros não se desenham: a lista não está completa. */
export function lugaresVazios(seccao: Seccao, comFiltros: boolean): number {
  if (comFiltros || seccao.lugares === null) return 0;
  return Math.max(0, seccao.lugares - seccao.total);
}

export interface Bloco<T> {
  chave: string;
  /** Nome da morada partilhada; null para as casas sozinhas e para as outras vistas. */
  titulo: string | null;
  itens: T[];
}

/** Junta itens seguidos do mesmo grupo (as casas da mesma morada) num bloco; os sem grupo também. */
export function juntarEmBlocos<T>(itens: readonly T[], grupoDe: (item: T) => Seccao['grupo']): Bloco<T>[] {
  const blocos: Bloco<T>[] = [];
  let grupoAnterior: string | null = null;
  for (const item of itens) {
    const grupo = grupoDe(item);
    const chaveGrupo = grupo?.chave ?? null;
    const ultimo = blocos.at(-1);
    if (ultimo && chaveGrupo === grupoAnterior) ultimo.itens.push(item);
    else {
      // O índice garante chaves únicas mesmo que um grupo volte a aparecer mais à frente.
      blocos.push({
        chave: `${chaveGrupo ?? 'soltas'}#${blocos.length}`,
        titulo: grupo?.titulo ?? null,
        itens: [item],
      });
    }
    grupoAnterior = chaveGrupo;
  }
  return blocos;
}

/** Chave da secção onde a pessoa aparece nesta vista (para abrir a secção quando ela entra em foco). */
export function seccaoDaPessoa(seccoes: readonly Seccao[], pessoaId: Id): string | null {
  return seccoes.find((s) => s.pessoas.some((p) => p.id === pessoaId))?.chave ?? null;
}
