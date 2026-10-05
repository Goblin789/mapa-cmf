// Gravação das edições num lote com histórico (POST /api/lotes) e leitura do histórico (GET /api/historico).
// As regras (compactar, validar, conflitos, aplicar) são as de src/dominio/operacoes.ts, as mesmas que o
// browser usa na simulação; aqui só se acrescenta a gravação atómica. As frases são funções puras.
// Um lote pode mudar pessoas (casa, carrinha, obra), o condutor das carrinhas e onde elas dormem e, no M2,
// os campos das fichas ('campo') e criar/apagar registos ('registo': pessoas novas, casas e obras e os seus
// locais, períodos de indisponibilidade, problemas): cada campo que muda fica numa linha de `alteracoes`; um registo
// criado ou apagado fica numa só linha (CAMPO_REGISTO) com o registo inteiro em JSON.

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { AlteracaoHistorico, ConflitoServidor, EntradaHistorico } from '../dominio/api';
import {
  casaCriadaNoPrograma,
  type EntidadeApagavel,
  type EntidadeCriavel,
  type EntidadeEditavel,
  eCampoEditavel,
  eEntidadeEditavel,
  encontrarRegisto,
  ROTULO_CAMPO,
} from '../dominio/campos';
import { formatarDiaHoraCurto } from '../dominio/datas';
import {
  aplicarOperacoes,
  CAMPO_CONDUTOR,
  CAMPO_DORMIDA,
  CAMPO_REGISTO,
  type CampoMovivel,
  type ChaveDormida,
  type Conflito,
  chaveDormida,
  chaveOperacao,
  compactarOperacoes,
  descreverOperacao,
  encontrarConflitos,
  lerChaveDormida,
  nomeDaDormida,
  nomeDeRegisto,
  nomeDoValor,
  type Operacao,
  validarOperacoes,
  valorLegivel,
} from '../dominio/operacoes';
import { operacaoDaAlteracao, podeReverter, revertidosEmVigor } from '../dominio/reverter';
import type { Carrinha, Estado, Id, Pessoa } from '../dominio/tipos';
import { descreverAlteracaoDosDados } from '../importacao/sincronizar';
import * as esquema from './db/esquema';
import type { Bd } from './db/ligacao';
import { type Leitor, lerEstado, lerVersao, registoNaFormaDoEstado } from './estado';
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

/**
 * Campo do condutor (CAMPO_CONDUTOR) e de onde dorme a carrinha (CAMPO_DORMIDA: a chave "casa:<id>",
 * "local:<id>" ou null em JSON, não as duas colunas da tabela) na tabela `alteracoes` (entidade 'carrinha').
 * Vêm do domínio; continuam a sair daqui para quem já os importava.
 */
export { CAMPO_CONDUTOR, CAMPO_DORMIDA };

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

/** O registo de que se fala quando já não se sabe o nome. */
const ARTIGO_REGISTO: Readonly<Record<EntidadeEditavel, string>> = {
  pessoa: 'A pessoa',
  casa: 'A casa',
  carrinha: 'A carrinha',
  obra: 'A obra',
  local: 'A morada',
  indisponibilidade: 'O período de indisponibilidade',
  problema: 'O problema',
};

/**
 * O que vai entre parênteses no fim da frase de um conflito: quem gravou por último e quando ("Michael
 * Exemplo, 05/10 09:12", de `autoriaDoConflito`); sem isso, "alguém mudou entretanto" (ou apagou, ou criou).
 */
function entretanto(autoria: string | null | undefined, acao: string): string {
  return autoria ? `(${autoria})` : `(alguém ${acao} entretanto)`;
}

/**
 * Ex.: "Ana T. — carrinha: esperavas ZZ 1002, mas agora está em ZZ 1001 (alguém mudou entretanto)";
 * "Casa Um — lotação: esperavas 8, mas agora é 10 (alguém mudou entretanto)";
 * "Obra X — já não existe (alguém apagou entretanto)";
 * "ZZ 1001 — condutor: esperavas Ana T., mas agora é Rui S. (alguém mudou entretanto)";
 * "ZZ 1001 — onde dorme: esperavas Casa Um, mas agora dorme em Parque (alguém mudou entretanto)".
 * Com `autoria` (quem gravou por último essa coisa e quando, autoriaDoConflito), o parêntese diz quem foi:
 * "Casa Um — lotação: esperavas 8, mas agora é 10 (Michael Exemplo, 05/10 09:12)".
 */
export function descreverConflito(estado: Estado, conflito: Conflito, autoria?: string | null): string {
  const mudou = entretanto(autoria, 'mudou');
  if (conflito.tipo === 'dormida') {
    const carrinha = nomeDoValor(estado, 'carrinhaId', conflito.carrinhaId);
    const esperado =
      conflito.esperado === null ? 'que estivesse por definir' : nomeDaDormida(estado, conflito.esperado);
    const agora =
      conflito.atual === null ? 'está por definir' : `dorme em ${nomeDaDormida(estado, conflito.atual)}`;
    return `${carrinha} — onde dorme: esperavas ${esperado}, mas agora ${agora} ${mudou}`;
  }
  if (conflito.tipo === 'condutor') {
    const carrinha = nomeDoValor(estado, 'carrinhaId', conflito.carrinhaId);
    const esperado =
      conflito.esperado === null ? 'que não tivesse condutor' : nomeDaPessoa(estado, conflito.esperado);
    const agora = conflito.atual === null ? 'não tem condutor' : `é ${nomeDaPessoa(estado, conflito.atual)}`;
    return `${carrinha} — condutor: esperavas ${esperado}, mas agora ${agora} ${mudou}`;
  }
  if (conflito.tipo === 'campo') {
    const { entidade, campo } = conflito;
    const registo = encontrarRegisto(estado, entidade, conflito.id);
    if (!conflito.existe || !registo) {
      return `${ARTIGO_REGISTO[entidade]} que estavas a mudar já não existe ${entretanto(autoria, 'apagou')}`;
    }
    const quem = nomeDeRegisto(estado, entidade, registo as unknown as Record<string, unknown>);
    const rotulo = (ROTULO_CAMPO[entidade] as Record<string, string>)[campo] ?? campo;
    const valor = (v: typeof conflito.atual) => valorLegivel(estado, entidade, campo, v);
    return `${quem} — ${rotulo}: esperavas ${valor(conflito.esperado)}, mas agora é ${valor(conflito.atual)} ${mudou}`;
  }
  if (conflito.tipo === 'registo') {
    const registo = (conflito.atual ?? conflito.esperado) as unknown as Record<string, unknown> | null;
    const quem = registo
      ? nomeDeRegisto(estado, conflito.entidade, registo)
      : ARTIGO_REGISTO[conflito.entidade];
    if (conflito.esperado === null) return `${quem} — já existe ${entretanto(autoria, 'o criou')}`;
    if (conflito.atual === null) return `${quem} — já não existe ${entretanto(autoria, 'apagou')}`;
    return autoria
      ? `${quem} — mudou entretanto (${autoria}): não se apaga sem veres o que mudou`
      : `${quem} — alguém mudou entretanto (não se apaga sem veres o que mudou)`;
  }
  const { campo, esperado, atual } = conflito;
  const agora = atual === null ? SEM_VALOR[campo] : `em ${nomeDoValor(estado, campo, atual)}`;
  return (
    `${nomeDaPessoa(estado, conflito.pessoaId)} — ${NOME_CAMPO[campo]}: ` +
    `esperavas ${nomeDoValor(estado, campo, esperado)}, mas agora está ${agora} ${mudou}`
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
 * Frase legível de uma alteração, com os nomes ATUAIS (casa, carrinha, obra, pessoa), a mesma do domínio
 * (descreverOperacao sobre a operação que a linha gravou, operacaoDaAlteracao).
 * Ex.: "Gil N. — casa: Fora das casas CMF → Casa Três"; "Gil N. — casa confirmada";
 * "ZZ 1001 — condutor: sem condutor → Gil N."; "ZZ 1001 — onde dorme: por definir → Casa Três";
 * "Casa Um — lotação: 8 → 9"; "Obra Nova — criada (Costantini, Rue X)"; "Ana T. — indisponível de …".
 */
export function descreverAlteracao(estado: Estado, a: LinhaAlteracao): string {
  // M2: registos criados/apagados e campos das fichas com os dois valores (do programa ou da sincronização).
  const doPrograma =
    a.campo === CAMPO_REGISTO ||
    (a.antes !== null &&
      a.depois !== null &&
      eEntidadeEditavel(a.entidade) &&
      eCampoEditavel(a.entidade, a.campo));
  if (doPrograma) {
    const op = operacaoDaAlteracao(a);
    if (op && (op.tipo === 'campo' || op.tipo === 'registo')) return descreverOperacao(estado, op);
  }
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
   * M2: lotes que este reverte (PedidoGuardar.reverte). Cada um tem de existir e passar no podeReverter;
   * fica em lotes.reverte (o Histórico diz "Reverte a gravação…" e, no revertido, "Revertida").
   */
  reverte?: readonly number[];
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
  /** `alteracoes`: linhas gravadas em `alteracoes`; `operacoes`: operações depois de compactar. */
  | { tipo: 'gravado'; loteId: number; versao: number; alteracoes: number; operacoes: number }
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

type Transacao = Parameters<Parameters<Bd['transaction']>[0]>[0];

/** A tabela de cada entidade das fichas (as colunas têm os nomes dos campos do domínio). */
const TABELAS = {
  pessoa: esquema.pessoas,
  casa: esquema.casas,
  carrinha: esquema.carrinhas,
  obra: esquema.obras,
  local: esquema.locais,
  indisponibilidade: esquema.indisponibilidades,
  problema: esquema.problemas,
} as const satisfies Record<EntidadeEditavel, unknown>;

/**
 * Campos com valor único na base de dados. Quando mudam, gravam-se em dois passos (um valor provisório, depois
 * o final), como na sincronização: uma troca entre dois registos (ex.: dois nomes no mapa) não colide.
 */
const CAMPOS_UNICOS_FICHAS: Readonly<Partial<Record<EntidadeEditavel, readonly string[]>>> = {
  pessoa: ['nomeCurto', 'numero'],
  casa: ['nome'],
  carrinha: ['matricula'],
};

/** Inserts com os locais antes das casas e das obras e as pessoas antes dos períodos; deletes ao contrário. */
const ORDEM_INSERTS: readonly EntidadeCriavel[] = [
  'local',
  'casa',
  'obra',
  'pessoa',
  'indisponibilidade',
  'problema',
];
const ORDEM_DELETES: readonly EntidadeApagavel[] = ['problema', 'indisponibilidade', 'obra', 'casa', 'local'];

/** Separador dos valores provisórios (nunca aparece num valor escrito à mão). */
const SEPARADOR_PROVISORIO = String.fromCharCode(1);

/** O valor provisório de um campo único de um registo (diferente para cada registo e campo). */
function valorProvisorio(entidade: EntidadeEditavel, id: Id, campo: string): string {
  return [SEPARADOR_PROVISORIO, 'ficha', entidade, id, campo].join(SEPARADOR_PROVISORIO);
}

/** A tabela (com o tipo de uma qualquer: as colunas usadas são as do registo, que batem certo). */
function tabelaDe(entidade: EntidadeEditavel): typeof esquema.pessoas {
  return TABELAS[entidade] as unknown as typeof esquema.pessoas;
}

function atualizarRegisto(
  tx: Transacao,
  entidade: EntidadeEditavel,
  id: Id,
  valores: Record<string, unknown>,
): void {
  const tabela = tabelaDe(entidade);
  tx.update(tabela)
    .set(valores as Partial<typeof esquema.pessoas.$inferInsert>)
    .where(eq(tabela.id, id))
    .run();
}

/**
 * O lote que se quer reverter existe, passa no podeReverter (autor, tipo, estado) e o pedido desfaz pelo
 * menos uma linha dele: a inversa de uma operação tem a mesma chave (chaveOperacao) que a operação gravada.
 * Sem isto, um pedido feito à mão marcava como "Revertida" uma gravação que não voltou atrás.
 */
function podeSerRevertido(tx: Leitor, loteId: number, chaves: ReadonlySet<string>): boolean {
  const lote = tx
    .select({ autor: esquema.lotes.autor, tipo: esquema.lotes.tipo, estado: esquema.lotes.estado })
    .from(esquema.lotes)
    .where(eq(esquema.lotes.id, loteId))
    .get();
  if (lote === undefined || !podeReverter(lote)) return false;
  return tx
    .select({
      entidade: esquema.alteracoes.entidade,
      entidadeId: esquema.alteracoes.entidadeId,
      campo: esquema.alteracoes.campo,
      antes: esquema.alteracoes.antes,
      depois: esquema.alteracoes.depois,
    })
    .from(esquema.alteracoes)
    .where(eq(esquema.alteracoes.loteId, loteId))
    .all()
    .some((linha) => {
      const op = operacaoDaAlteracao(linha);
      return op !== null && chaves.has(chaveOperacao(op));
    });
}

/**
 * Quem gravou por último a coisa de um conflito e quando, como no Histórico: "Michael Exemplo, 05/10 09:12"
 * (o nome é o `autorNome`). Procura a última linha de `alteracoes` (de um lote aplicado) desse campo; nos
 * registos criados/apagados (e num registo que já não existe), a última linha desse registo. null se não
 * houver nenhuma (ex.: um valor que veio da importação sem linhas).
 */
export function autoriaDoConflito(tx: Leitor, conflito: Conflito): string | null {
  const alvo: { entidade: string; id: Id; campo: string | null } =
    conflito.tipo === 'mover'
      ? { entidade: 'pessoa', id: conflito.pessoaId, campo: conflito.campo }
      : conflito.tipo === 'condutor'
        ? { entidade: 'carrinha', id: conflito.carrinhaId, campo: CAMPO_CONDUTOR }
        : conflito.tipo === 'dormida'
          ? { entidade: 'carrinha', id: conflito.carrinhaId, campo: CAMPO_DORMIDA }
          : conflito.tipo === 'campo' && conflito.existe
            ? { entidade: conflito.entidade, id: conflito.id, campo: conflito.campo }
            : { entidade: conflito.entidade, id: conflito.id, campo: null };
  const ultima = tx
    .select({ autor: esquema.lotes.autor, criadoEm: esquema.lotes.criadoEm })
    .from(esquema.alteracoes)
    .innerJoin(esquema.lotes, eq(esquema.lotes.id, esquema.alteracoes.loteId))
    .where(
      and(
        eq(esquema.alteracoes.entidade, alvo.entidade),
        eq(esquema.alteracoes.entidadeId, alvo.id),
        alvo.campo === null ? undefined : eq(esquema.alteracoes.campo, alvo.campo),
        eq(esquema.lotes.estado, 'aplicado'),
      ),
    )
    .orderBy(desc(esquema.alteracoes.id))
    .limit(1)
    .get();
  if (!ultima) return null;
  const utilizador = tx
    .select({ nome: esquema.utilizadores.nome })
    .from(esquema.utilizadores)
    .where(eq(esquema.utilizadores.email, ultima.autor))
    .get();
  const nomes = new Map(utilizador ? [[ultima.autor, utilizador.nome]] : []);
  return `${nomeDoAutor(ultima.autor, nomes)}, ${formatarDiaHoraCurto(ultima.criadoEm)}`;
}

/**
 * Quem reverteu cada lote, só com as reversões em vigor (revertidosEmVigor): uma reversão revertida a seguir
 * deixa de contar e o lote que ela revertia pode reverter-se outra vez. Lê-se de todos os lotes com
 * `reverte` (são poucos).
 */
function revertidoPorEmVigor(tx: Leitor): Map<number, number[]> {
  return revertidosEmVigor(
    tx
      .select({ id: esquema.lotes.id, reverte: esquema.lotes.reverte })
      .from(esquema.lotes)
      .where(isNotNull(esquema.lotes.reverte))
      .all()
      .map((l) => ({ id: l.id, reverte: listaDeLotes(l.reverte) })),
  );
}

/**
 * Grava as operações num lote, tudo ou nada. Verificação e escrita correm na mesma transação
 * (IMMEDIATE: o bloqueio de escrita é pedido logo ao abrir, por isso ninguém grava pelo meio,
 * nem outro processo como a importação). O estado lê-se COMPLETO (com os períodos e os problemas antigos):
 * conflitos, sobreposições e validação contam com eles.
 *
 * Antes de tudo, um lote de `reverte` que já foi revertido é recusado (400, "A gravação nº N já foi
 * revertida."): o pedido foi feito sobre um Histórico velho, e a frase diz mais do que os conflitos que as
 * inversas dariam. Só conta uma reversão em vigor: se ela própria foi revertida, o lote volta a reverter-se.
 *
 * Os conflitos vêm antes da validação: se alguém mudou entretanto as mesmas coisas, a
 * resposta certa é "recarrega" (409), mesmo que o rascunho, sobre o estado novo, também deixasse de ser
 * válido (ex.: o condutor escolhido já não vai naquela carrinha). Com `versaoBase`, contam também os
 * conflitos escondidos pela regra do condutor (conflitosDoCondutor); as frases dizem o nome das casas e obras
 * apagadas entretanto (comApagadasParaFrases). A validação junta ao validarOperacoes o id das casas novas
 * (errosIdsDeCasas). Depois, cada lote de `reverte` tem de
 * existir, de se poder reverter (podeReverter) e de ter alguma linha que o pedido desfaz; um lote que ainda
 * não existe (o próprio) nunca passa.
 *
 * As FK só se verificam no COMMIT (PRAGMA defer_foreign_keys) e, mesmo assim, escreve-se pelas fases do
 * domínio, nunca pela ordem do pedido: 1) inserts (locais antes das obras, pessoas antes dos períodos);
 * 2) 'campo' (os campos únicos em dois passos; os dos registos novos entram provisórios na fase 1); 3) mover, condutor e onde dorme; 4) deletes (problemas e
 * períodos, depois as obras, depois as casas, depois os locais). Uma casa apagada leva antes os problemas
 * resolvidos dela que o pedido não trouxe (os antigos não chegam ao browser; o validarOperacoes já recusou os
 * por resolver), cada um com a sua linha CAMPO_REGISTO, como os do sincronizar. Uma linha de `alteracoes` por campo mudado; 'registo' numa só
 * linha (CAMPO_REGISTO) com o registo inteiro na forma do Estado. O lote é 'ficha' se só tiver 'campo' e
 * 'registo'; senão 'mudanca'.
 */
export function gravarLote(bd: Bd, pedido: PedidoLote): ResultadoGravacao {
  return bd.transaction(
    (tx): ResultadoGravacao => {
      // Só vale até ao fim desta transação (o SQLite repõe-no no COMMIT/ROLLBACK).
      tx.run(sql`PRAGMA defer_foreign_keys = ON`);
      const estado = lerEstado(tx, pedido.agora, { completo: true });
      const ops = compactarOperacoes(pedido.operacoes);
      if (ops.length === 0) return { tipo: 'vazio' };

      const reverte = [...new Set(pedido.reverte ?? [])];
      if (reverte.length > 0) {
        const revertidos = revertidoPorEmVigor(tx);
        const jaRevertidos = reverte.filter((id) => revertidos.has(id));
        if (jaRevertidos.length > 0) {
          return {
            tipo: 'invalido',
            erros: jaRevertidos.map((id) => `A gravação nº ${id} já foi revertida.`),
          };
        }
      }

      const conflitos = [
        ...encontrarConflitos(estado, ops),
        ...(pedido.versaoBase === undefined ? [] : conflitosDoCondutor(tx, estado, ops, pedido.versaoBase)),
      ];
      if (conflitos.length > 0) {
        // As frases com o nome das casas e obras apagadas entretanto (e não "uma casa apagada").
        const paraFrases = comApagadasParaFrases(tx, estado);
        return {
          tipo: 'conflito',
          conflitos: conflitos.map((c) => ({
            ...c,
            descricao: descreverConflito(paraFrases, c, autoriaDoConflito(tx, c)),
          })),
        };
      }

      const erros = [...validarOperacoes(estado, ops), ...errosIdsDeCasas(tx, ops)];
      if (erros.length > 0) return { tipo: 'invalido', erros: limitarErros(erros) };

      const chaves = new Set(ops.map(chaveOperacao));
      const naoRevertiveis = reverte.filter((id) => !podeSerRevertido(tx, id, chaves));
      if (naoRevertiveis.length > 0) {
        return {
          tipo: 'invalido',
          erros: naoRevertiveis.map((id) => `A gravação nº ${id} não se pode reverter.`),
        };
      }

      const soFichas = ops.every((op) => op.tipo === 'campo' || op.tipo === 'registo');
      const quando = pedido.agora.toISOString();
      const { id: loteId } = tx
        .insert(esquema.lotes)
        .values({
          autor: pedido.autor,
          tipo: soFichas ? 'ficha' : 'mudanca',
          estado: 'aplicado',
          criadoEm: quando,
          efetivoEm: quando,
          comentario: pedido.comentario,
          reverte: reverte.length > 0 ? JSON.stringify(reverte) : null,
        })
        .returning({ id: esquema.lotes.id })
        .get();
      const linhas: (LinhaAlteracao & { loteId: number })[] = [];
      const linha = (entidade: string, entidadeId: Id, campo: string, antes: unknown, depois: unknown) =>
        linhas.push({
          loteId,
          entidade,
          entidadeId,
          campo,
          antes: antes === undefined ? null : JSON.stringify(antes),
          depois: depois === undefined ? null : JSON.stringify(depois),
        });

      // 1. Registos novos. Os campos únicos entram num valor provisório e acertam-se na fase 2: o valor final
      // pode ser um que outro registo só larga nos 'campo' deste lote (ex.: renomear a Élia e criar outra
      // pessoa com o nome antigo dela). A restrição UNIQUE não espera pelo COMMIT, como as FK.
      const unicosDosNovos: { entidade: EntidadeEditavel; id: Id; valores: Record<string, unknown> }[] = [];
      for (const entidade of ORDEM_INSERTS) {
        for (const op of ops) {
          if (op.tipo !== 'registo' || op.entidade !== entidade || op.de !== null || op.para === null)
            continue;
          const registo = registoNaFormaDoEstado(entidade, op.para);
          const valores = registo as unknown as Record<string, unknown>;
          const unicos = (CAMPOS_UNICOS_FICHAS[entidade] ?? []).filter((c) => valores[c] != null);
          tx.insert(tabelaDe(entidade))
            .values({
              ...valores,
              ...Object.fromEntries(unicos.map((c) => [c, valorProvisorio(entidade, op.id, c)])),
            } as unknown as typeof esquema.pessoas.$inferInsert)
            .run();
          if (unicos.length > 0) {
            unicosDosNovos.push({
              entidade,
              id: op.id,
              valores: Object.fromEntries(unicos.map((c) => [c, valores[c]])),
            });
          }
          linha(entidade, op.id, CAMPO_REGISTO, undefined, registo);
        }
      }

      // 2. Campos das fichas: uma atualização por registo; os únicos que mudam primeiro num valor provisório.
      // Os únicos dos registos novos ficam com o valor final depois de os outros largarem os deles.
      const porRegisto = new Map<
        string,
        { entidade: EntidadeEditavel; id: Id; valores: Record<string, unknown> }
      >();
      for (const op of ops) {
        if (op.tipo !== 'campo') continue;
        const chave = `${op.entidade}${SEPARADOR_PROVISORIO}${op.id}`;
        const atual = porRegisto.get(chave) ?? { entidade: op.entidade, id: op.id, valores: {} };
        atual.valores[op.campo] = op.para;
        porRegisto.set(chave, atual);
        linha(op.entidade, op.id, op.campo, op.de, op.para);
      }
      for (const { entidade, id, valores } of porRegisto.values()) {
        const unicos = (CAMPOS_UNICOS_FICHAS[entidade] ?? []).filter((c) => Object.hasOwn(valores, c));
        if (unicos.length === 0) continue;
        atualizarRegisto(
          tx,
          entidade,
          id,
          Object.fromEntries(unicos.map((c) => [c, valorProvisorio(entidade, id, c)])),
        );
      }
      for (const { entidade, id, valores } of unicosDosNovos) atualizarRegisto(tx, entidade, id, valores);
      for (const { entidade, id, valores } of porRegisto.values())
        atualizarRegisto(tx, entidade, id, valores);

      // 3. Mover, condutor e onde dorme, a partir do estado com os registos novos e os campos já mudados (uma
      // pessoa nova tem de ir para a casa no mesmo lote).
      const intermedio = aplicarOperacoes(
        estado,
        ops.filter((op) => op.tipo === 'campo' || (op.tipo === 'registo' && op.de === null)),
      );
      const alteracoes = alteracoesDasOperacoes(intermedio, ops);
      const condutores = alteracoesDeCondutor(intermedio, ops);
      const dormidas = alteracoesDeDormida(intermedio, ops);
      // Uma atualização por pessoa, só com os campos que mudam.
      const porPessoa = new Map<Id, Partial<Pick<Pessoa, CampoGravado>>>();
      for (const a of alteracoes) {
        const valores = porPessoa.get(a.pessoaId) ?? {};
        Object.assign(valores, { [a.campo]: a.depois });
        porPessoa.set(a.pessoaId, valores);
        linha('pessoa', a.pessoaId, a.campo, a.antes, a.depois);
      }
      for (const [id, valores] of porPessoa) {
        tx.update(esquema.pessoas).set(valores).where(eq(esquema.pessoas.id, id)).run();
      }
      for (const c of condutores) {
        tx.update(esquema.carrinhas)
          .set({ condutorId: c.depois })
          .where(eq(esquema.carrinhas.id, c.carrinhaId))
          .run();
        linha('carrinha', c.carrinhaId, CAMPO_CONDUTOR, c.antes, c.depois);
      }
      for (const d of dormidas) {
        tx.update(esquema.carrinhas)
          .set(colunasDaDormida(d.depois))
          .where(eq(esquema.carrinhas.id, d.carrinhaId))
          .run();
        linha('carrinha', d.carrinhaId, CAMPO_DORMIDA, d.antes, d.depois);
      }

      // 4. Registos apagados (já ninguém aponta para eles): problemas e períodos, obras, casas, locais.
      const problemasApagados = new Set(
        ops.flatMap((op) =>
          op.tipo === 'registo' && op.entidade === 'problema' && op.para === null ? [op.id] : [],
        ),
      );
      const problemasNoFim = new Map(aplicarOperacoes(estado, ops).problemas.map((p) => [p.id, p]));
      for (const entidade of ORDEM_DELETES) {
        for (const op of ops) {
          if (op.tipo !== 'registo' || op.entidade !== entidade || op.para !== null || op.de === null)
            continue;
          if (entidade === 'casa') {
            // Os problemas resolvidos da casa que o pedido não apagou (chave estrangeira).
            for (const p of estado.problemas) {
              if (p.casaId !== op.id || problemasApagados.has(p.id)) continue;
              tx.delete(esquema.problemas).where(eq(esquema.problemas.id, p.id)).run();
              const comoFicou = problemasNoFim.get(p.id) ?? p;
              linha(
                'problema',
                p.id,
                CAMPO_REGISTO,
                registoNaFormaDoEstado('problema', comoFicou),
                undefined,
              );
            }
          }
          const atual = encontrarRegisto(estado, entidade, op.id) ?? op.de;
          const tabela = tabelaDe(entidade);
          tx.delete(tabela).where(eq(tabela.id, op.id)).run();
          linha(entidade, op.id, CAMPO_REGISTO, registoNaFormaDoEstado(entidade, atual as never), undefined);
        }
      }

      for (const b of blocos(linhas)) tx.insert(esquema.alteracoes).values(b).run();

      return {
        tipo: 'gravado',
        loteId,
        versao: lerVersao(tx),
        alteracoes: linhas.length,
        operacoes: ops.length,
      };
    },
    { behavior: 'immediate' },
  );
}

/**
 * Nomes dos autores que não são pessoas (os mesmos rótulos que o browser usa em edicao/historico.ts).
 * 'local' é o servidor no PC sem login.
 */
export const ROTULOS_AUTORES: Readonly<Record<string, string>> = {
  local: 'Este computador',
  importacao: 'Importação dos Excel',
  'dados-iniciais': 'Dados iniciais',
};

/**
 * Nome a mostrar de um autor (`lotes.autor`): o nome do utilizador com esse e-mail, o rótulo de um autor
 * fixo, ou a própria chave (ex.: alguém que nunca entrou nesta base de dados).
 */
export function nomeDoAutor(autor: string, nomesPorEmail: ReadonlyMap<string, string>): string {
  // Object.hasOwn: um autor como "constructor" não pode apanhar o protótipo.
  if (Object.hasOwn(ROTULOS_AUTORES, autor)) return ROTULOS_AUTORES[autor] as string;
  return nomesPorEmail.get(autor) ?? autor;
}

/** A lista do Estado de cada entidade que se cria ou apaga no programa. */
const LISTA_DO_ESTADO = {
  pessoa: 'pessoas',
  casa: 'casas',
  obra: 'obras',
  local: 'locais',
  indisponibilidade: 'indisponibilidades',
  problema: 'problemas',
} as const satisfies Record<EntidadeCriavel, keyof Estado>;

/**
 * O estado com os registos que as linhas CAMPO_REGISTO mostram e que já lá não estão (apagados entretanto),
 * só para as frases: "Ana T. — obra: Obra Nova → sem obra" em vez do id da obra apagada.
 */
function comRegistosDoHistorico(estado: Estado, linhas: readonly LinhaAlteracao[]): Estado {
  let resultado = estado;
  for (const l of linhas) {
    if (l.campo !== CAMPO_REGISTO || !Object.hasOwn(LISTA_DO_ESTADO, l.entidade)) continue;
    const registo = lerJson(l.antes ?? l.depois);
    if (
      registo === null ||
      typeof registo !== 'object' ||
      (registo as { id?: unknown }).id !== l.entidadeId
    ) {
      continue;
    }
    const lista = LISTA_DO_ESTADO[l.entidade as EntidadeCriavel];
    const atuais = resultado[lista] as readonly { id: string }[];
    if (atuais.some((r) => r.id === l.entidadeId)) continue;
    resultado = { ...resultado, [lista]: [...atuais, registo] };
  }
  return resultado;
}

/**
 * Uma casa nova tem o id gerado pelo programa ("casa-<UUID>", casaCriadaNoPrograma). Outro id (o validarRegisto
 * aceita os dos dados iniciais, "eischen") só serve para voltar a pôr uma casa apagada no programa (o Reverter
 * de "Casa X — apagada"), ou seja, se há a linha CAMPO_REGISTO desse apagar. Senão o sincronizar tratava a casa
 * como uma dos dados iniciais que saiu de casas.json.
 */
function errosIdsDeCasas(tx: Leitor, ops: readonly Operacao[]): string[] {
  const erros: string[] = [];
  for (const op of ops) {
    if (op.tipo !== 'registo' || op.entidade !== 'casa' || op.de !== null || op.para === null) continue;
    if (casaCriadaNoPrograma({ id: op.id })) continue;
    const apagada = tx
      .select({ id: esquema.alteracoes.id })
      .from(esquema.alteracoes)
      .where(
        and(
          eq(esquema.alteracoes.entidade, 'casa'),
          eq(esquema.alteracoes.entidadeId, op.id),
          eq(esquema.alteracoes.campo, CAMPO_REGISTO),
          isNotNull(esquema.alteracoes.antes),
          isNull(esquema.alteracoes.depois),
        ),
      )
      .limit(1)
      .get();
    if (apagada) continue;
    const nome = typeof op.para.nome === 'string' && op.para.nome !== '' ? op.para.nome : 'A casa';
    erros.push(
      `${nome} — identificador inválido: uma casa nova tem o identificador gerado pelo programa ("casa-…").`,
    );
  }
  return erros;
}

/**
 * Só para as frases dos conflitos: o estado com as casas e obras apagadas no programa (a linha CAMPO_REGISTO
 * do apagar tem o registo inteiro), com "(apagada)" a seguir ao nome. Ex.: "Ana T. — casa: esperavas Casa
 * Ensaio (apagada), mas agora está fora das casas CMF (Michael Exemplo, 05/10 09:57)". Nunca para validar.
 */
function comApagadasParaFrases(tx: Leitor, estado: Estado): Estado {
  const linhas = tx
    .select({
      entidade: esquema.alteracoes.entidade,
      entidadeId: esquema.alteracoes.entidadeId,
      campo: esquema.alteracoes.campo,
      antes: esquema.alteracoes.antes,
      depois: esquema.alteracoes.depois,
    })
    .from(esquema.alteracoes)
    .where(
      and(
        eq(esquema.alteracoes.campo, CAMPO_REGISTO),
        inArray(esquema.alteracoes.entidade, ['casa', 'obra']),
        isNotNull(esquema.alteracoes.antes),
        isNull(esquema.alteracoes.depois),
      ),
    )
    .orderBy(desc(esquema.alteracoes.id))
    .all();
  const marcadas = linhas.map((l) => {
    const registo = lerJson(l.antes);
    if (registo === null || typeof registo !== 'object') return l;
    const nome = (registo as { nome?: unknown }).nome;
    if (typeof nome !== 'string') return l;
    return { ...l, antes: JSON.stringify({ ...registo, nome: `${nome} (apagada)` }) };
  });
  return comRegistosDoHistorico(estado, marcadas);
}

/** Lista de ids de lotes guardada em JSON (lotes.reverte); qualquer outra coisa é []. */
function listaDeLotes(texto: string | null): number[] {
  const valor = lerJson(texto);
  return Array.isArray(valor) ? valor.filter((x): x is number => Number.isInteger(x)) : [];
}

/**
 * Os `limite` lotes mais recentes (o mais recente primeiro), cada um com TODAS as suas alterações por ordem
 * (o browser junta as frases seguidas iguais; o Reverter precisa de todas, ex.: a lat e a lng), os lotes que
 * reverte e os que o reverteram.
 */
export function lerHistorico(bd: Bd, limite: number, agora: Date = new Date()): EntradaHistorico[] {
  return bd.transaction((tx) => {
    const lotes = tx.select().from(esquema.lotes).orderBy(desc(esquema.lotes.id)).limit(limite).all();
    if (lotes.length === 0) return [];
    // Completo: as frases dos períodos e problemas antigos também têm o nome da pessoa/casa.
    const estado = lerEstado(tx, agora, { completo: true });
    // Quem reverteu quem (só as reversões em vigor): lê-se de todos os lotes (são poucos os que revertem).
    const revertidoPor = revertidoPorEmVigor(tx);
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

    // Os registos que já não existem (ex.: uma obra apagada) continuam com nome nas frases destes lotes.
    const comApagados = comRegistosDoHistorico(estado, linhas);
    const porLote = new Map<number, AlteracaoHistorico[]>();
    for (const l of linhas) {
      const alteracao: AlteracaoHistorico = {
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        campo: l.campo,
        antes: l.antes,
        depois: l.depois,
        descricao: descreverAlteracao(comApagados, l),
      };
      const lista = porLote.get(l.loteId);
      if (lista) lista.push(alteracao);
      else porLote.set(l.loteId, [alteracao]);
    }

    const emails = [...new Set(lotes.map((l) => l.autor))];
    const nomes = new Map(
      tx
        .select({ email: esquema.utilizadores.email, nome: esquema.utilizadores.nome })
        .from(esquema.utilizadores)
        .where(inArray(esquema.utilizadores.email, emails))
        .all()
        .map((u) => [u.email, u.nome]),
    );

    return lotes.map((l) => ({
      loteId: l.id,
      autor: l.autor,
      autorNome: nomeDoAutor(l.autor, nomes),
      criadoEm: l.criadoEm,
      efetivoEm: l.efetivoEm,
      tipo: l.tipo,
      estado: l.estado,
      comentario: l.comentario ?? null,
      alteracoes: porLote.get(l.id) ?? [],
      reverte: listaDeLotes(l.reverte),
      revertidoPor: revertidoPor.get(l.id) ?? [],
    }));
  });
}
