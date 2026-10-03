// Operações de edição: o que o modo de edição produz e o servidor grava.
// O browser aplica-as ao estado para mostrar a simulação; o servidor volta a validá-las e grava-as
// num lote com histórico. Funções puras, iguais nos dois lados.

import type { Estado, Id, Pessoa } from './tipos';

export type CampoMovivel = 'casaId' | 'carrinhaId' | 'obraId';

/** Mudar uma pessoa de casa, de carrinha ou de obra. `de` serve para detetar conflitos ao gravar. */
export interface OperacaoMover {
  tipo: 'mover';
  pessoaId: Id;
  campo: CampoMovivel;
  /** Valor que a pessoa tinha quando a mudança foi feita (null = Fora das casas / Sem transporte / sem obra). */
  de: Id | null;
  para: Id | null;
}

export type Operacao = OperacaoMover;

/** Sítio onde se larga uma ou mais pessoas. */
export type Alvo =
  | { tipo: 'casa'; id: Id }
  | { tipo: 'fora' }
  | { tipo: 'carrinha'; id: Id }
  | { tipo: 'sem-transporte' }
  | { tipo: 'obra'; id: Id }
  | { tipo: 'sem-obra' };

export function campoDoAlvo(alvo: Alvo): CampoMovivel {
  switch (alvo.tipo) {
    case 'casa':
    case 'fora':
      return 'casaId';
    case 'carrinha':
    case 'sem-transporte':
      return 'carrinhaId';
    case 'obra':
    case 'sem-obra':
      return 'obraId';
  }
}

export function valorDoAlvo(alvo: Alvo): Id | null {
  return alvo.tipo === 'casa' || alvo.tipo === 'carrinha' || alvo.tipo === 'obra' ? alvo.id : null;
}

/** Texto estável para pôr num atributo HTML (`data-alvo`): "casa:<id>", "fora", "carrinha:<id>", … */
export function chaveAlvo(alvo: Alvo): string {
  return alvo.tipo === 'casa' || alvo.tipo === 'carrinha' || alvo.tipo === 'obra'
    ? `${alvo.tipo}:${alvo.id}`
    : alvo.tipo;
}

export function lerChaveAlvo(chave: string): Alvo | null {
  if (chave === 'fora' || chave === 'sem-transporte' || chave === 'sem-obra') return { tipo: chave };
  const i = chave.indexOf(':');
  if (i <= 0) return null;
  const tipo = chave.slice(0, i);
  const id = chave.slice(i + 1);
  if (!id) return null;
  if (tipo === 'casa' || tipo === 'carrinha' || tipo === 'obra') return { tipo, id };
  return null;
}

/** Operações para levar as pessoas até ao alvo. Quem já lá está (ou não existe) fica de fora. */
export function operacoesParaAlvo(estado: Estado, pessoaIds: readonly Id[], alvo: Alvo): Operacao[] {
  const campo = campoDoAlvo(alvo);
  const para = valorDoAlvo(alvo);
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const ops: Operacao[] = [];
  for (const id of new Set(pessoaIds)) {
    const p = pessoas.get(id);
    if (!p || p[campo] === para) continue;
    ops.push({ tipo: 'mover', pessoaId: id, campo, de: p[campo], para });
  }
  return ops;
}

function aplicarUma(p: Pessoa, op: Operacao): Pessoa {
  const nova: Pessoa = { ...p, [op.campo]: op.para };
  // Mudar alguém de casa/carrinha à mão confirma a nova situação.
  if (op.campo === 'casaId') nova.casaAConfirmar = false;
  if (op.campo === 'carrinhaId') nova.carrinhaAConfirmar = false;
  return nova;
}

/** Aplica as operações por ordem, sem alterar o estado recebido. Operações de pessoas que não existem são ignoradas. */
export function aplicarOperacoes(estado: Estado, ops: readonly Operacao[]): Estado {
  if (ops.length === 0) return estado;
  const porPessoa = new Map<Id, Operacao[]>();
  for (const op of ops) {
    const lista = porPessoa.get(op.pessoaId);
    if (lista) lista.push(op);
    else porPessoa.set(op.pessoaId, [op]);
  }
  return {
    ...estado,
    pessoas: estado.pessoas.map((p) => {
      const lista = porPessoa.get(p.id);
      return lista ? lista.reduce(aplicarUma, p) : p;
    }),
  };
}

/**
 * Junta os movimentos da mesma pessoa no mesmo campo num só (o `de` do primeiro, o `para` do último)
 * e tira os que acabam onde começaram. Mantém a ordem da primeira ocorrência.
 */
export function compactarOperacoes(ops: readonly Operacao[]): Operacao[] {
  const juntas = new Map<string, Operacao>();
  for (const op of ops) {
    const chave = `${op.pessoaId}\u0000${op.campo}`;
    const anterior = juntas.get(chave);
    juntas.set(chave, anterior ? { ...anterior, para: op.para } : { ...op });
  }
  return [...juntas.values()].filter((op) => op.de !== op.para);
}

export interface Conflito {
  pessoaId: Id;
  campo: CampoMovivel;
  /** O que a operação esperava encontrar (`de`). */
  esperado: Id | null;
  /** O que lá está agora. */
  atual: Id | null;
}

/** Operações cujo `de` já não corresponde ao estado (alguém mudou a pessoa entretanto). */
export function encontrarConflitos(estado: Estado, ops: readonly Operacao[]): Conflito[] {
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const conflitos: Conflito[] = [];
  for (const op of ops) {
    const p = pessoas.get(op.pessoaId);
    if (!p) continue;
    if (p[op.campo] !== op.de) {
      conflitos.push({ pessoaId: op.pessoaId, campo: op.campo, esperado: op.de, atual: p[op.campo] });
    }
  }
  return conflitos;
}

/** Erros de referência (pessoa ou destino que não existem, pessoa inativa). Lista vazia = válido. */
export function validarOperacoes(estado: Estado, ops: readonly Operacao[]): string[] {
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const existe: Record<CampoMovivel, Set<Id>> = {
    casaId: new Set(estado.casas.map((c) => c.id)),
    carrinhaId: new Set(estado.carrinhas.map((c) => c.id)),
    obraId: new Set(estado.obras.map((o) => o.id)),
  };
  const erros: string[] = [];
  for (const op of ops) {
    const p = pessoas.get(op.pessoaId);
    if (!p) {
      erros.push(`A pessoa ${op.pessoaId} não existe.`);
      continue;
    }
    if (!p.ativa) erros.push(`${p.nomeCurto} não está ativa.`);
    if (op.para !== null && !existe[op.campo].has(op.para)) {
      erros.push(`${p.nomeCurto}: o destino ${op.para} não existe.`);
    }
  }
  return erros;
}

const NOME_CAMPO: Record<CampoMovivel, string> = { casaId: 'casa', carrinhaId: 'carrinha', obraId: 'obra' };

export function nomeDoValor(estado: Estado, campo: CampoMovivel, valor: Id | null): string {
  if (campo === 'casaId') {
    return valor === null ? 'Fora das casas CMF' : (estado.casas.find((c) => c.id === valor)?.nome ?? valor);
  }
  if (campo === 'carrinhaId') {
    return valor === null
      ? 'Sem transporte da empresa'
      : (estado.carrinhas.find((c) => c.id === valor)?.matricula ?? valor);
  }
  return valor === null ? 'sem obra' : (estado.obras.find((o) => o.id === valor)?.nome ?? valor);
}

/** Ex.: "Rui Reis — casa: Casa 1 Puttelange → Steinsel". */
export function descreverOperacao(estado: Estado, op: Operacao): string {
  const nome = estado.pessoas.find((p) => p.id === op.pessoaId)?.nomeCurto ?? op.pessoaId;
  return `${nome} — ${NOME_CAMPO[op.campo]}: ${nomeDoValor(estado, op.campo, op.de)} → ${nomeDoValor(estado, op.campo, op.para)}`;
}
