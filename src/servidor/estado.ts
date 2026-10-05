// Monta o Estado (contrato com o browser) a partir da base de dados.
// A conversão e a ordenação são funções puras; só `carregarEstado` lê a base de dados.

import { count, getTableColumns, gte, isNull, max, or, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { EntidadeCriavel, RegistosEditaveis } from '../dominio/campos';
import { dataNoLuxemburgo, somarDias } from '../dominio/datas';
import { compararPessoas } from '../dominio/indices';
import type {
  Carrinha,
  Casa,
  Cliente,
  Estado,
  Indisponibilidade,
  Local,
  Obra,
  Pessoa,
  Problema,
} from '../dominio/tipos';
import * as esquema from './db/esquema';
import type { Bd } from './db/ligacao';

/** Linhas tal como saem das tabelas. */
export interface LinhasBd {
  clientes: (typeof esquema.clientes.$inferSelect)[];
  locais: (typeof esquema.locais.$inferSelect)[];
  casas: (typeof esquema.casas.$inferSelect)[];
  carrinhas: (typeof esquema.carrinhas.$inferSelect)[];
  obras: (typeof esquema.obras.$inferSelect)[];
  pessoas: (typeof esquema.pessoas.$inferSelect)[];
  indisponibilidades: (typeof esquema.indisponibilidades.$inferSelect)[];
  problemas: (typeof esquema.problemas.$inferSelect)[];
}

/**
 * Dias que os períodos que já acabaram e os problemas resolvidos continuam no Estado do GET /api/estado
 * (minimização: o browser só precisa dos recentes). O gravarLote lê tudo (completo).
 */
export const DIAS_RECENTES = 30;

const comparadorTextos = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });

/** Comparação simples e estável (independente da língua), para ids. */
function compararIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Por `ordem`; em caso de empate, pelo texto e depois pelo id (para a ordem nunca variar). */
function porOrdem<T extends { id: string; ordem: number }>(texto: (x: T) => string) {
  return (a: T, b: T) =>
    a.ordem - b.ordem || comparadorTextos.compare(texto(a), texto(b)) || compararIds(a.id, b.id);
}

/** Booleano que pode vir como 0/1 do SQLite. */
function booleano(valor: unknown): boolean {
  return Boolean(valor);
}

function booleanoOuNulo(valor: unknown): boolean | null {
  return valor === null || valor === undefined ? null : Boolean(valor);
}

/** Lista de textos guardada em JSON. Qualquer outra coisa (null, objeto, números) é ignorada. */
export function listaDeTextos(valor: unknown): string[] {
  let lista = valor;
  if (typeof lista === 'string') {
    try {
      lista = JSON.parse(lista);
    } catch {
      return [];
    }
  }
  return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
}

function paraCliente(l: LinhasBd['clientes'][number]): Cliente {
  return { id: l.id, nome: l.nome, cor: l.cor, sigla: l.sigla, interno: booleano(l.interno), ordem: l.ordem };
}

function paraLocal(l: LinhasBd['locais'][number]): Local {
  return {
    id: l.id,
    tipo: l.tipo,
    nome: l.nome,
    morada: l.morada,
    pais: l.pais,
    lat: l.lat ?? null,
    lng: l.lng ?? null,
    raioM: l.raioM,
  };
}

function paraCasa(l: LinhasBd['casas'][number]): Casa {
  return {
    id: l.id,
    nome: l.nome,
    localId: l.localId,
    apartamento: l.apartamento ?? null,
    lotacao: l.lotacao,
    maxContrato: l.maxContrato ?? null,
    tolerado: l.tolerado ?? null,
    notaContrato: l.notaContrato ?? null,
    senhorio: l.senhorio ?? null,
    equipamento: l.equipamento ?? null,
    sempreCheia: booleano(l.sempreCheia),
    ordem: l.ordem,
  };
}

function paraCarrinha(l: LinhasBd['carrinhas'][number]): Carrinha {
  return {
    id: l.id,
    matricula: l.matricula,
    tipo: l.tipo === 'carro' ? 'carro' : 'carrinha',
    marca: l.marca ?? null,
    matriculasAlternativas: listaDeTextos(l.matriculasAlternativas),
    modelo: l.modelo ?? null,
    lugares: l.lugares,
    dormeCasaId: l.dormeCasaId ?? null,
    dormeLocalId: l.dormeLocalId ?? null,
    temporaria: booleano(l.temporaria),
    condutorId: l.condutorId ?? null,
    nota: l.nota ?? null,
    ordem: l.ordem,
  };
}

function paraObra(l: LinhasBd['obras'][number]): Obra {
  return {
    id: l.id,
    nome: l.nome,
    clienteId: l.clienteId,
    localId: l.localId,
    estacionamentoLocalId: l.estacionamentoLocalId ?? null,
    origem: l.origem,
  };
}

function paraPessoa(l: LinhasBd['pessoas'][number]): Pessoa {
  return {
    id: l.id,
    numero: l.numero ?? null,
    numeroOriginal: l.numeroOriginal ?? null,
    apelidos: l.apelidos,
    nome: l.nome,
    nomeCurto: l.nomeCurto,
    nomesAlternativos: listaDeTextos(l.nomesAlternativos),
    clienteId: l.clienteId,
    obraId: l.obraId ?? null,
    casaId: l.casaId ?? null,
    carrinhaId: l.carrinhaId ?? null,
    casaAConfirmar: booleano(l.casaAConfirmar),
    carrinhaAConfirmar: booleano(l.carrinhaAConfirmar),
    telefone: l.telefone ?? null,
    temCarta: booleanoOuNulo(l.temCarta),
    cartaValidade: l.cartaValidade ?? null,
    ativa: booleano(l.ativa),
  };
}

function paraIndisponibilidade(l: LinhasBd['indisponibilidades'][number]): Indisponibilidade {
  return { id: l.id, pessoaId: l.pessoaId, inicio: l.inicio, fim: l.fim ?? null };
}

function paraProblema(l: LinhasBd['problemas'][number]): Problema {
  return {
    id: l.id,
    casaId: l.casaId ?? null,
    carrinhaId: l.carrinhaId ?? null,
    texto: l.texto,
    abertoEm: l.abertoEm,
    resolvidoEm: l.resolvidoEm ?? null,
  };
}

/** Períodos por pessoa e início (e id, para a ordem nunca variar). */
function compararPeriodos(a: Indisponibilidade, b: Indisponibilidade): number {
  return compararIds(a.pessoaId, b.pessoaId) || compararIds(a.inicio, b.inicio) || compararIds(a.id, b.id);
}

/** Problemas abertos primeiro; depois os abertos mais recentemente primeiro (e o id). */
function compararProblemas(a: Problema, b: Problema): number {
  const abertoA = a.resolvidoEm === null ? 0 : 1;
  const abertoB = b.resolvidoEm === null ? 0 : 1;
  return abertoA - abertoB || compararIds(b.abertoEm, a.abertoEm) || compararIds(a.id, b.id);
}

/**
 * Um registo criado ou apagado no programa na forma do Estado (as mesmas chaves, pela mesma ordem, que o
 * lerEstado devolve), para o `@registo` gravado em `alteracoes` (o reverter e os conflitos comparam-no).
 */
export function registoNaFormaDoEstado<E extends EntidadeCriavel>(
  entidade: E,
  registo: RegistosEditaveis[E],
): RegistosEditaveis[E] {
  const r = registo as unknown as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  const opcional = <T>(v: T | undefined) => (v === undefined ? null : v);
  switch (entidade) {
    case 'pessoa': {
      const linha = {
        ...(r as unknown as Pessoa),
        nomesAlternativos: Array.isArray(r.nomesAlternativos) ? r.nomesAlternativos : [],
      } as LinhasBd['pessoas'][number];
      return paraPessoa(linha) as RegistosEditaveis[E];
    }
    case 'casa':
      return paraCasa(r as unknown as LinhasBd['casas'][number]) as RegistosEditaveis[E];
    case 'obra':
      return paraObra(r as unknown as LinhasBd['obras'][number]) as RegistosEditaveis[E];
    case 'local':
      return paraLocal(r as unknown as LinhasBd['locais'][number]) as RegistosEditaveis[E];
    case 'indisponibilidade':
      return paraIndisponibilidade({
        id: texto(r.id),
        pessoaId: texto(r.pessoaId),
        inicio: texto(r.inicio),
        fim: opcional(r.fim as string | null | undefined),
      }) as RegistosEditaveis[E];
    case 'problema':
      return paraProblema(r as unknown as LinhasBd['problemas'][number]) as RegistosEditaveis[E];
  }
  return registo;
}

/** Converte as linhas para os tipos do domínio e ordena-as. Função pura. */
export function montarEstado(linhas: LinhasBd, versao: number, geradoEm: string): Estado {
  return {
    versao,
    geradoEm,
    clientes: linhas.clientes.map(paraCliente).sort(porOrdem((c) => c.nome)),
    locais: linhas.locais.map(paraLocal).sort((a, b) => compararIds(a.id, b.id)),
    casas: linhas.casas.map(paraCasa).sort(porOrdem((c) => c.nome)),
    carrinhas: linhas.carrinhas.map(paraCarrinha).sort(porOrdem((c) => c.matricula)),
    obras: linhas.obras.map(paraObra).sort((a, b) => compararIds(a.id, b.id)),
    pessoas: linhas.pessoas.map(paraPessoa).sort((a, b) => compararPessoas(a, b) || compararIds(a.id, b.id)),
    indisponibilidades: linhas.indisponibilidades.map(paraIndisponibilidade).sort(compararPeriodos),
    problemas: linhas.problemas.map(paraProblema).sort(compararProblemas),
  };
}

/** A base de dados ou uma transação aberta nela. */
export type Leitor = Pick<Bd, 'select'>;

/** Versão do estado: o maior id de lote (0 se ainda não houver lotes). */
export function lerVersao(bd: Leitor): number {
  const linha = bd
    .select({ versao: max(esquema.lotes.id) })
    .from(esquema.lotes)
    .get();
  return linha?.versao ?? 0;
}

export function contarPessoas(bd: Leitor): number {
  return bd.select({ n: count() }).from(esquema.pessoas).get()?.n ?? 0;
}

/**
 * Coluna JSON lida como texto e convertida por `listaDeTextos`. Com o modo 'json' do Drizzle,
 * um só valor que não fosse JSON válido rebentava a leitura e o mapa ficava sem estado nenhum.
 */
function colunaLista(coluna: AnySQLiteColumn) {
  return sql`${coluna}`.mapWith(listaDeTextos);
}

export interface OpcoesLerEstado {
  /**
   * true = todos os períodos e problemas (o gravarLote: conflitos, sobreposições e validação contam com os
   * antigos). Sem isto, só os períodos sem fim ou com fim nos últimos DIAS_RECENTES dias (ou no futuro) e os
   * problemas abertos ou resolvidos nesses dias (o GET /api/estado e o estado depois de gravar).
   */
  completo?: boolean;
}

/**
 * Lê todas as tabelas sem abrir transação: para usar dentro de uma já aberta (a gravação de um lote
 * lê e escreve na mesma transação). "Hoje" é o dia de `agora` no Luxemburgo.
 */
export function lerEstado(tx: Leitor, agora: Date, opcoes: OpcoesLerEstado = {}): Estado {
  const desde = somarDias(dataNoLuxemburgo(agora), -DIAS_RECENTES);
  const periodos = tx.select().from(esquema.indisponibilidades);
  const problemas = tx.select().from(esquema.problemas);
  const linhas: LinhasBd = {
    clientes: tx.select().from(esquema.clientes).all(),
    locais: tx.select().from(esquema.locais).all(),
    casas: tx.select().from(esquema.casas).all(),
    carrinhas: tx
      .select({
        ...getTableColumns(esquema.carrinhas),
        matriculasAlternativas: colunaLista(esquema.carrinhas.matriculasAlternativas),
      })
      .from(esquema.carrinhas)
      .all(),
    obras: tx.select().from(esquema.obras).all(),
    pessoas: tx
      .select({
        ...getTableColumns(esquema.pessoas),
        nomesAlternativos: colunaLista(esquema.pessoas.nomesAlternativos),
      })
      .from(esquema.pessoas)
      .all(),
    indisponibilidades: opcoes.completo
      ? periodos.all()
      : periodos
          .where(or(isNull(esquema.indisponibilidades.fim), gte(esquema.indisponibilidades.fim, desde)))
          .all(),
    problemas: opcoes.completo
      ? problemas.all()
      : problemas
          .where(or(isNull(esquema.problemas.resolvidoEm), gte(esquema.problemas.resolvidoEm, desde)))
          .all(),
  };
  return montarEstado(linhas, lerVersao(tx), agora.toISOString());
}

/** Lê todas as tabelas numa só transação (leitura coerente mesmo que a importação esteja a gravar). */
export function carregarEstado(bd: Bd, agora: Date = new Date(), opcoes: OpcoesLerEstado = {}): Estado {
  return bd.transaction((tx) => lerEstado(tx, agora, opcoes));
}
