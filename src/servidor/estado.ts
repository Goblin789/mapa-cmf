// Monta o Estado (contrato com o browser) a partir da base de dados.
// A conversão e a ordenação são funções puras; só `carregarEstado` lê a base de dados.

import { count, getTableColumns, max, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { compararPessoas } from '../dominio/indices';
import type { Carrinha, Casa, Cliente, Estado, Local, Obra, Pessoa } from '../dominio/tipos';
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
}

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
    ordem: l.ordem,
  };
}

function paraCarrinha(l: LinhasBd['carrinhas'][number]): Carrinha {
  return {
    id: l.id,
    matricula: l.matricula,
    matriculasAlternativas: listaDeTextos(l.matriculasAlternativas),
    modelo: l.modelo ?? null,
    lugares: l.lugares,
    dormeCasaId: l.dormeCasaId ?? null,
    dormeLocalId: l.dormeLocalId ?? null,
    temporaria: booleano(l.temporaria),
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

/**
 * Lê todas as tabelas sem abrir transação: para usar dentro de uma já aberta (a gravação de um lote
 * lê e escreve na mesma transação).
 */
export function lerEstado(tx: Leitor, agora: Date): Estado {
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
  };
  return montarEstado(linhas, lerVersao(tx), agora.toISOString());
}

/** Lê todas as tabelas numa só transação (leitura coerente mesmo que a importação esteja a gravar). */
export function carregarEstado(bd: Bd, agora: Date = new Date()): Estado {
  return bd.transaction((tx) => lerEstado(tx, agora));
}
