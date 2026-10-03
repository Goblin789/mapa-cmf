// Gravação das edições num lote com histórico (POST /api/lotes) e leitura do histórico (GET /api/historico).
// As regras (compactar, validar, conflitos, aplicar) são as de src/dominio/operacoes.ts, as mesmas que o
// browser usa na simulação; aqui só se acrescenta a gravação atómica. As frases são funções puras.
// Um lote pode mudar pessoas (casa, carrinha, obra), o condutor das carrinhas e onde elas dormem: cada
// campo que muda fica numa linha de `alteracoes` (entidade 'pessoa' ou 'carrinha').

import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import type { AlteracaoHistorico, ConflitoServidor, EntradaHistorico } from '../dominio/api';
import {
  aplicarOperacoes,
  type CampoMovivel,
  type ChaveDormida,
  type Conflito,
  chaveDormida,
  compactarOperacoes,
  descreverOperacao,
  encontrarConflitos,
  lerChaveDormida,
  nomeDaDormida,
  nomeDoValor,
  type Operacao,
  validarOperacoes,
} from '../dominio/operacoes';
import type { Carrinha, Estado, Id, Pessoa } from '../dominio/tipos';
import { descreverAlteracaoDosDados } from '../importacao/sincronizar';
import * as esquema from './db/esquema';
import type { Bd } from './db/ligacao';
import { type Leitor, lerEstado, lerVersao } from './estado';
import { limitarErros } from './pedidos';

/** Campos da pessoa que uma gravação pode mudar, pela ordem em que ficam no histórico. */
const CAMPOS_GRAVADOS = ['casaId', 'casaAConfirmar', 'carrinhaId', 'carrinhaAConfirmar', 'obraId'] as const;
type CampoGravado = (typeof CAMPOS_GRAVADOS)[number];

const CAMPOS_MOVIVEIS: ReadonlySet<string> = new Set<CampoMovivel>(['casaId', 'carrinhaId', 'obraId']);

const NOME_CAMPO: Record<CampoMovivel, string> = { casaId: 'casa', carrinhaId: 'carrinha', obraId: 'obra' };

/** Como se diz "onde está" quando o valor é null. */
const SEM_VALOR: Record<CampoMovivel, string> = {
  casaId: 'fora das casas CMF',
  carrinhaId: 'sem transporte da empresa',
  obraId: 'sem obra',
};

/** Campo do condutor na tabela `alteracoes` (entidade 'carrinha'). */
export const CAMPO_CONDUTOR = 'condutorId';

/**
 * Campo de onde dorme a carrinha na tabela `alteracoes` (entidade 'carrinha'). O antes e o depois são a
 * chave em JSON ("casa:<id>", "local:<id>" ou null = por definir), não as duas colunas da tabela.
 */
export const CAMPO_DORMIDA = 'dormida';

const NOME_MARCA: Record<string, string> = {
  casaAConfirmar: 'casa a confirmar',
  carrinhaAConfirmar: 'carrinha a confirmar',
};

/** Linhas por INSERT (fica longe do limite de variáveis do SQLite). */
const POR_INSERT = 100;

/** Uma mudança de um campo de uma pessoa, tal como fica na tabela `alteracoes`. */
export interface AlteracaoPessoa {
  pessoaId: Id;
  campo: CampoGravado;
  antes: Pessoa[CampoGravado];
  depois: Pessoa[CampoGravado];
}

/** Uma mudança do condutor de uma carrinha (entidade 'carrinha', campo 'condutorId'). */
export interface AlteracaoCondutor {
  carrinhaId: Id;
  antes: Carrinha['condutorId'];
  depois: Carrinha['condutorId'];
}

/** Uma mudança de onde dorme uma carrinha (entidade 'carrinha', campo 'dormida'). */
export interface AlteracaoDormida {
  carrinhaId: Id;
  antes: ChaveDormida | null;
  depois: ChaveDormida | null;
}

/**
 * Campos que mudam ao aplicar as operações (com `aplicarOperacoes`, a mesma função da simulação),
 * pessoa a pessoa pela ordem das operações. Inclui as marcas "a confirmar" que a mudança limpa.
 */
export function alteracoesDasOperacoes(estado: Estado, ops: readonly Operacao[]): AlteracaoPessoa[] {
  const antes = new Map(estado.pessoas.map((p) => [p.id, p]));
  const depois = new Map(aplicarOperacoes(estado, ops).pessoas.map((p) => [p.id, p]));
  const resultado: AlteracaoPessoa[] = [];
  const pessoaIds = new Set(ops.flatMap((op) => (op.tipo === 'mover' ? [op.pessoaId] : [])));
  for (const pessoaId of pessoaIds) {
    const a = antes.get(pessoaId);
    const d = depois.get(pessoaId);
    if (!a || !d) continue;
    for (const campo of CAMPOS_GRAVADOS) {
      if (a[campo] !== d[campo]) resultado.push({ pessoaId, campo, antes: a[campo], depois: d[campo] });
    }
  }
  return resultado;
}

/** Condutores que mudam ao aplicar as operações, carrinha a carrinha pela ordem das operações. */
export function alteracoesDeCondutor(estado: Estado, ops: readonly Operacao[]): AlteracaoCondutor[] {
  const antes = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const depois = new Map(aplicarOperacoes(estado, ops).carrinhas.map((c) => [c.id, c]));
  const resultado: AlteracaoCondutor[] = [];
  const carrinhaIds = new Set(ops.flatMap((op) => (op.tipo === 'condutor' ? [op.carrinhaId] : [])));
  for (const carrinhaId of carrinhaIds) {
    const a = antes.get(carrinhaId);
    const d = depois.get(carrinhaId);
    if (!a || !d || a.condutorId === d.condutorId) continue;
    resultado.push({ carrinhaId, antes: a.condutorId, depois: d.condutorId });
  }
  return resultado;
}

/** Onde dormem as carrinhas cujo sítio muda ao aplicar as operações, pela ordem das operações. */
export function alteracoesDeDormida(estado: Estado, ops: readonly Operacao[]): AlteracaoDormida[] {
  const antes = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const depois = new Map(aplicarOperacoes(estado, ops).carrinhas.map((c) => [c.id, c]));
  const resultado: AlteracaoDormida[] = [];
  const carrinhaIds = new Set(ops.flatMap((op) => (op.tipo === 'dormida' ? [op.carrinhaId] : [])));
  for (const carrinhaId of carrinhaIds) {
    const a = antes.get(carrinhaId);
    const d = depois.get(carrinhaId);
    if (!a || !d) continue;
    const chaveAntes = chaveDormida(a);
    const chaveDepois = chaveDormida(d);
    if (chaveAntes !== chaveDepois) resultado.push({ carrinhaId, antes: chaveAntes, depois: chaveDepois });
  }
  return resultado;
}

/** Colunas da tabela `carrinhas` para uma chave de onde dorme (uma delas ou nenhuma). */
export function colunasDaDormida(chave: ChaveDormida | null): Pick<Carrinha, 'dormeCasaId' | 'dormeLocalId'> {
  const lida = chave === null ? null : lerChaveDormida(chave);
  return {
    dormeCasaId: lida?.tipo === 'casa' ? lida.id : null,
    dormeLocalId: lida?.tipo === 'local' ? lida.id : null,
  };
}

function nomeDaPessoa(estado: Estado, id: Id): string {
  return estado.pessoas.find((p) => p.id === id)?.nomeCurto ?? id;
}

/**
 * Ex.: "Ana T. — carrinha: esperavas ZZ 1002, mas agora está em ZZ 1001 (alguém mudou entretanto)";
 * "ZZ 1001 — condutor: esperavas Ana T., mas agora é Rui S. (alguém mudou entretanto)";
 * "ZZ 1001 — onde dorme: esperavas Casa Um, mas agora dorme em Parque (alguém mudou entretanto)".
 */
export function descreverConflito(estado: Estado, conflito: Conflito): string {
  if (conflito.tipo === 'dormida') {
    const carrinha = nomeDoValor(estado, 'carrinhaId', conflito.carrinhaId);
    const esperado =
      conflito.esperado === null ? 'que estivesse por definir' : nomeDaDormida(estado, conflito.esperado);
    const agora =
      conflito.atual === null ? 'está por definir' : `dorme em ${nomeDaDormida(estado, conflito.atual)}`;
    return `${carrinha} — onde dorme: esperavas ${esperado}, mas agora ${agora} (alguém mudou entretanto)`;
  }
  if (conflito.tipo === 'condutor') {
    const carrinha = nomeDoValor(estado, 'carrinhaId', conflito.carrinhaId);
    const esperado =
      conflito.esperado === null ? 'que não tivesse condutor' : nomeDaPessoa(estado, conflito.esperado);
    const agora = conflito.atual === null ? 'não tem condutor' : `é ${nomeDaPessoa(estado, conflito.atual)}`;
    return `${carrinha} — condutor: esperavas ${esperado}, mas agora ${agora} (alguém mudou entretanto)`;
  }
  const { campo, esperado, atual } = conflito;
  const agora = atual === null ? SEM_VALOR[campo] : `em ${nomeDoValor(estado, campo, atual)}`;
  return (
    `${nomeDaPessoa(estado, conflito.pessoaId)} — ${NOME_CAMPO[campo]}: ` +
    `esperavas ${nomeDoValor(estado, campo, esperado)}, mas agora está ${agora} (alguém mudou entretanto)`
  );
}

/** Valor guardado em JSON. Texto que não é JSON (não devia acontecer) fica tal como está. */
function lerJson(texto: string | null): unknown {
  if (texto === null) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

function comoId(valor: unknown): Id | null {
  if (valor === null || valor === undefined) return null;
  return typeof valor === 'string' ? valor : JSON.stringify(valor);
}

function simOuNao(valor: unknown): string {
  if (valor === true) return 'sim';
  if (valor === false) return 'não';
  return valor === null || valor === undefined ? '—' : JSON.stringify(valor);
}

interface LinhaAlteracao {
  entidade: string;
  entidadeId: string;
  campo: string;
  antes: string | null;
  depois: string | null;
}

/**
 * Frase legível de uma alteração, com os nomes ATUAIS (casa, carrinha, obra, pessoa).
 * Ex.: "Gil N. — casa: Fora das casas CMF → Casa Três"; "Gil N. — casa a confirmar: sim → não";
 * "ZZ 1001 — condutor: sem condutor → Gil N."; "ZZ 1001 — onde dorme: por definir → Casa Três".
 */
export function descreverAlteracao(estado: Estado, a: LinhaAlteracao): string {
  if (a.entidade === 'carrinha' && a.campo === CAMPO_DORMIDA) {
    return descreverOperacao(estado, {
      tipo: 'dormida',
      carrinhaId: a.entidadeId,
      de: comoId(lerJson(a.antes)),
      para: comoId(lerJson(a.depois)),
    });
  }
  if (a.entidade === 'carrinha' && a.campo === CAMPO_CONDUTOR) {
    return descreverOperacao(estado, {
      tipo: 'condutor',
      carrinhaId: a.entidadeId,
      de: comoId(lerJson(a.antes)),
      para: comoId(lerJson(a.depois)),
    });
  }
  if (a.entidade === 'pessoa' && CAMPOS_MOVIVEIS.has(a.campo)) {
    return descreverOperacao(estado, {
      tipo: 'mover',
      pessoaId: a.entidadeId,
      campo: a.campo as CampoMovivel,
      de: comoId(lerJson(a.antes)),
      para: comoId(lerJson(a.depois)),
    });
  }
  // Clientes, casas, veículos e locais mudados pela sincronização dos dados iniciais.
  const dosDados = descreverAlteracaoDosDados(estado, a);
  if (dosDados) return dosDados;
  const marca = NOME_MARCA[a.campo];
  if (a.entidade === 'pessoa' && marca) {
    const nome = nomeDaPessoa(estado, a.entidadeId);
    return `${nome} — ${marca}: ${simOuNao(lerJson(a.antes))} → ${simOuNao(lerJson(a.depois))}`;
  }
  return `${a.entidade} ${a.entidadeId} — ${a.campo}: ${a.antes ?? '—'} → ${a.depois ?? '—'}`;
}

export interface PedidoLote {
  /** Tal como vieram do browser (são compactadas aqui). */
  operacoes: readonly Operacao[];
  comentario: string | null;
  autor: string;
  agora: Date;
  /**
   * Versão sobre a qual o rascunho foi feito. Só serve para os conflitos escondidos pela regra do
   * condutor (ver conflitosDoCondutor); os outros vêm do `de` de cada operação.
   */
  versaoBase?: number;
}

/**
 * Valor de um campo na versão `versao`: o `antes` da primeira alteração desse campo gravada depois dela.
 * undefined se o campo não mudou depois dessa versão.
 */
function valorNaVersao(
  tx: Leitor,
  versao: number,
  entidade: string,
  entidadeId: Id,
  campo: string,
): Id | null | undefined {
  const linha = tx
    .select({ antes: esquema.alteracoes.antes })
    .from(esquema.alteracoes)
    .where(
      and(
        gt(esquema.alteracoes.loteId, versao),
        eq(esquema.alteracoes.entidade, entidade),
        eq(esquema.alteracoes.entidadeId, entidadeId),
        eq(esquema.alteracoes.campo, campo),
      ),
    )
    .orderBy(asc(esquema.alteracoes.id))
    .limit(1)
    .get();
  return linha ? comoId(lerJson(linha.antes)) : undefined;
}

/**
 * Conflitos que o `de` das operações não mostra, por causa da regra do condutor. O browser junta sozinho a
 * operação que tira o condutor a quem sai da carrinha que conduz, e só deixa escolher o condutor entre os
 * passageiros; por isso, num rascunho feito sobre a versão `versaoBase`:
 * - tirar alguém da carrinha sem mexer no condutor dela quer dizer que, nessa versão, não era o condutor.
 *   Se entretanto passou a ser, é um conflito do condutor (antes dava 400: "X não vai na carrinha…");
 * - escolher um condutor sem o mudar de carrinha quer dizer que, nessa versão, ia nessa carrinha. Se
 *   entretanto mudou de carrinha, é um conflito da carrinha dessa pessoa.
 * O que o rascunho via vem do histórico (`alteracoes` dos lotes depois de `versaoBase`). Quando o histórico
 * não mostra nenhuma mudança (ex.: um pedido feito à mão sobre a versão atual), fica o erro de validação.
 */
export function conflitosDoCondutor(
  tx: Leitor,
  estado: Estado,
  ops: readonly Operacao[],
  versaoBase: number,
): Conflito[] {
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const carrinhas = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const condutorMexido = new Set<Id>();
  const carrinhaMexida = new Set<Id>();
  for (const op of ops) {
    if (op.tipo === 'condutor') condutorMexido.add(op.carrinhaId);
    else if (op.tipo === 'mover' && op.campo === 'carrinhaId') carrinhaMexida.add(op.pessoaId);
  }
  const conflitos: Conflito[] = [];
  for (const op of ops) {
    if (op.tipo === 'mover') {
      if (op.campo !== 'carrinhaId' || op.de === null || condutorMexido.has(op.de)) continue;
      const atual = carrinhas.get(op.de)?.condutorId ?? null;
      if (atual !== op.pessoaId) continue;
      const esperado = valorNaVersao(tx, versaoBase, 'carrinha', op.de, CAMPO_CONDUTOR);
      if (esperado !== undefined && esperado !== atual) {
        conflitos.push({ tipo: 'condutor', carrinhaId: op.de, esperado, atual });
      }
      continue;
    }
    // Onde dorme não depende de quem vai na carrinha: os conflitos vêm só do `de`.
    if (op.tipo !== 'condutor') continue;
    if (op.para === null || carrinhaMexida.has(op.para)) continue;
    const atual = pessoas.get(op.para)?.carrinhaId;
    if (atual === undefined || atual === op.carrinhaId) continue;
    const antes = valorNaVersao(tx, versaoBase, 'pessoa', op.para, 'carrinhaId');
    if (antes === op.carrinhaId) {
      conflitos.push({
        tipo: 'mover',
        pessoaId: op.para,
        campo: 'carrinhaId',
        esperado: op.carrinhaId,
        atual,
      });
    }
  }
  return conflitos;
}

export type ResultadoGravacao =
  | { tipo: 'gravado'; loteId: number; versao: number; alteracoes: number }
  /** As operações anulam-se umas às outras (ex.: A → B → A): não se grava nada. */
  | { tipo: 'vazio' }
  | { tipo: 'invalido'; erros: string[] }
  /**
   * Alguém mudou entretanto as mesmas pessoas (ou o condutor das mesmas carrinhas, ou onde elas dormem):
   * não se grava nada.
   */
  | { tipo: 'conflito'; conflitos: ConflitoServidor[] };

function blocos<T>(lista: T[]): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += POR_INSERT) r.push(lista.slice(i, i + POR_INSERT));
  return r;
}

/**
 * Grava as operações num lote, tudo ou nada. Verificação e escrita correm na mesma transação
 * (IMMEDIATE: o bloqueio de escrita é pedido logo ao abrir, por isso ninguém grava pelo meio,
 * nem outro processo como a importação).
 *
 * Os conflitos vêm antes da validação: se alguém mudou entretanto as mesmas pessoas ou carrinhas, a
 * resposta certa é "recarrega" (409), mesmo que o rascunho, sobre o estado novo, também deixasse de ser
 * válido (ex.: o condutor escolhido já não vai naquela carrinha). Com `versaoBase`, contam também os
 * conflitos escondidos pela regra do condutor (conflitosDoCondutor).
 */
export function gravarLote(bd: Bd, pedido: PedidoLote): ResultadoGravacao {
  return bd.transaction(
    (tx): ResultadoGravacao => {
      const estado = lerEstado(tx, pedido.agora);
      const ops = compactarOperacoes(pedido.operacoes);
      if (ops.length === 0) return { tipo: 'vazio' };

      const conflitos = [
        ...encontrarConflitos(estado, ops),
        ...(pedido.versaoBase === undefined ? [] : conflitosDoCondutor(tx, estado, ops, pedido.versaoBase)),
      ];
      if (conflitos.length > 0) {
        return {
          tipo: 'conflito',
          conflitos: conflitos.map((c) => ({ ...c, descricao: descreverConflito(estado, c) })),
        };
      }

      const erros = validarOperacoes(estado, ops);
      if (erros.length > 0) return { tipo: 'invalido', erros: limitarErros(erros) };

      const alteracoes = alteracoesDasOperacoes(estado, ops);
      const condutores = alteracoesDeCondutor(estado, ops);
      const dormidas = alteracoesDeDormida(estado, ops);
      const quando = pedido.agora.toISOString();
      const { id: loteId } = tx
        .insert(esquema.lotes)
        .values({
          autor: pedido.autor,
          tipo: 'mudanca',
          estado: 'aplicado',
          criadoEm: quando,
          efetivoEm: quando,
          comentario: pedido.comentario,
        })
        .returning({ id: esquema.lotes.id })
        .get();

      // Uma atualização por pessoa, só com os campos que mudam.
      const porPessoa = new Map<Id, Partial<Pick<Pessoa, CampoGravado>>>();
      for (const a of alteracoes) {
        const valores = porPessoa.get(a.pessoaId) ?? {};
        Object.assign(valores, { [a.campo]: a.depois });
        porPessoa.set(a.pessoaId, valores);
      }
      for (const [id, valores] of porPessoa) {
        tx.update(esquema.pessoas).set(valores).where(eq(esquema.pessoas.id, id)).run();
      }
      for (const c of condutores) {
        tx.update(esquema.carrinhas)
          .set({ condutorId: c.depois })
          .where(eq(esquema.carrinhas.id, c.carrinhaId))
          .run();
      }
      for (const d of dormidas) {
        tx.update(esquema.carrinhas)
          .set(colunasDaDormida(d.depois))
          .where(eq(esquema.carrinhas.id, d.carrinhaId))
          .run();
      }

      const linhas = [
        ...alteracoes.map((a) => ({
          loteId,
          entidade: 'pessoa',
          entidadeId: a.pessoaId,
          campo: a.campo,
          antes: JSON.stringify(a.antes),
          depois: JSON.stringify(a.depois),
        })),
        ...condutores.map((c) => ({
          loteId,
          entidade: 'carrinha',
          entidadeId: c.carrinhaId,
          campo: CAMPO_CONDUTOR,
          antes: JSON.stringify(c.antes),
          depois: JSON.stringify(c.depois),
        })),
        ...dormidas.map((d) => ({
          loteId,
          entidade: 'carrinha',
          entidadeId: d.carrinhaId,
          campo: CAMPO_DORMIDA,
          antes: JSON.stringify(d.antes),
          depois: JSON.stringify(d.depois),
        })),
      ];
      for (const b of blocos(linhas)) tx.insert(esquema.alteracoes).values(b).run();

      return { tipo: 'gravado', loteId, versao: lerVersao(tx), alteracoes: linhas.length };
    },
    { behavior: 'immediate' },
  );
}

/** Os `limite` lotes mais recentes (o mais recente primeiro), cada um com as suas alterações por ordem. */
export function lerHistorico(bd: Bd, limite: number, agora: Date = new Date()): EntradaHistorico[] {
  return bd.transaction((tx) => {
    const lotes = tx.select().from(esquema.lotes).orderBy(desc(esquema.lotes.id)).limit(limite).all();
    if (lotes.length === 0) return [];
    const estado = lerEstado(tx, agora);
    const linhas = tx
      .select()
      .from(esquema.alteracoes)
      .where(
        inArray(
          esquema.alteracoes.loteId,
          lotes.map((l) => l.id),
        ),
      )
      .orderBy(asc(esquema.alteracoes.id))
      .all();

    const porLote = new Map<number, AlteracaoHistorico[]>();
    for (const l of linhas) {
      const alteracao: AlteracaoHistorico = {
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        campo: l.campo,
        antes: l.antes,
        depois: l.depois,
        descricao: descreverAlteracao(estado, l),
      };
      const lista = porLote.get(l.loteId);
      if (lista) lista.push(alteracao);
      else porLote.set(l.loteId, [alteracao]);
    }

    return lotes.map((l) => ({
      loteId: l.id,
      autor: l.autor,
      criadoEm: l.criadoEm,
      efetivoEm: l.efetivoEm,
      tipo: l.tipo,
      estado: l.estado,
      comentario: l.comentario ?? null,
      alteracoes: porLote.get(l.id) ?? [],
    }));
  });
}
