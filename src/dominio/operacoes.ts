// Operações de edição: o que o modo de edição produz e o servidor grava.
// O browser aplica-as ao estado para mostrar a simulação; o servidor volta a validá-las e grava-as
// num lote com histórico. Funções puras, iguais nos dois lados.

import { formatarMatricula } from './matricula';
import type { Carrinha, Estado, Id, Pessoa } from './tipos';

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

/** Definir (ou tirar) o condutor de uma carrinha. O condutor tem de ir nessa carrinha. */
export interface OperacaoCondutor {
  tipo: 'condutor';
  carrinhaId: Id;
  /** Condutor quando a mudança foi feita (null = sem condutor). */
  de: Id | null;
  para: Id | null;
}

/**
 * Onde dorme uma carrinha: "casa:<id>", "local:<id>" (ex.: um estacionamento) ou null = por definir
 * (aí o mapa usa a sugestão: a casa da maioria dos passageiros).
 */
export type ChaveDormida = string;

/** Mudar onde dorme uma carrinha. */
export interface OperacaoDormida {
  tipo: 'dormida';
  carrinhaId: Id;
  de: ChaveDormida | null;
  para: ChaveDormida | null;
}

export type Operacao = OperacaoMover | OperacaoCondutor | OperacaoDormida;

/** Onde dorme a carrinha, como está gravado (sem contar com a sugestão). */
export function chaveDormida(carrinha: Carrinha): ChaveDormida | null {
  if (carrinha.dormeCasaId) return `casa:${carrinha.dormeCasaId}`;
  if (carrinha.dormeLocalId) return `local:${carrinha.dormeLocalId}`;
  return null;
}

/** Lê uma chave de dormida; null se for inválida. */
export function lerChaveDormida(chave: ChaveDormida): { tipo: 'casa' | 'local'; id: Id } | null {
  const i = chave.indexOf(':');
  const tipo = chave.slice(0, i);
  const id = chave.slice(i + 1);
  if (i <= 0 || !id || (tipo !== 'casa' && tipo !== 'local')) return null;
  return { tipo, id };
}

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

/**
 * Operações para levar as pessoas até ao alvo. Quem já lá está (ou não existe) fica de fora.
 * Quem sai da carrinha que conduz deixa de ser o condutor dela (vai junto uma operação de condutor).
 */
export function operacoesParaAlvo(estado: Estado, pessoaIds: readonly Id[], alvo: Alvo): Operacao[] {
  const campo = campoDoAlvo(alvo);
  const para = valorDoAlvo(alvo);
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const carrinhas = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const ops: Operacao[] = [];
  for (const id of new Set(pessoaIds)) {
    const p = pessoas.get(id);
    if (!p || p[campo] === para) continue;
    ops.push({ tipo: 'mover', pessoaId: id, campo, de: p[campo], para });
    const conduzia = campo === 'carrinhaId' && p.carrinhaId ? carrinhas.get(p.carrinhaId) : undefined;
    if (conduzia && conduzia.condutorId === id) {
      ops.push({ tipo: 'condutor', carrinhaId: conduzia.id, de: id, para: null });
    }
  }
  return ops;
}

/** Operação para a carrinha passar a dormir em `para` (null = por definir); null se já for assim. */
export function operacaoDormida(estado: Estado, carrinhaId: Id, para: ChaveDormida | null): Operacao | null {
  const carrinha = estado.carrinhas.find((c) => c.id === carrinhaId);
  if (!carrinha) return null;
  const de = chaveDormida(carrinha);
  return de === para ? null : { tipo: 'dormida', carrinhaId, de, para };
}

/** Operação para pôr `pessoaId` (ou ninguém) a conduzir a carrinha; null se já for assim. */
export function operacaoCondutor(estado: Estado, carrinhaId: Id, pessoaId: Id | null): Operacao | null {
  const carrinha = estado.carrinhas.find((c) => c.id === carrinhaId);
  if (!carrinha || carrinha.condutorId === pessoaId) return null;
  return { tipo: 'condutor', carrinhaId, de: carrinha.condutorId, para: pessoaId };
}

function aplicarUma(p: Pessoa, op: OperacaoMover): Pessoa {
  const nova: Pessoa = { ...p, [op.campo]: op.para };
  // Mudar alguém de casa/carrinha à mão confirma a nova situação.
  if (op.campo === 'casaId') nova.casaAConfirmar = false;
  if (op.campo === 'carrinhaId') nova.carrinhaAConfirmar = false;
  return nova;
}

/** Aplica as operações por ordem, sem alterar o estado recebido. Operações de pessoas/carrinhas que não existem são ignoradas. */
export function aplicarOperacoes(estado: Estado, ops: readonly Operacao[]): Estado {
  if (ops.length === 0) return estado;
  const porPessoa = new Map<Id, OperacaoMover[]>();
  const condutores = new Map<Id, Id | null>();
  const dormidas = new Map<Id, ChaveDormida | null>();
  for (const op of ops) {
    if (op.tipo === 'condutor') {
      condutores.set(op.carrinhaId, op.para);
      continue;
    }
    if (op.tipo === 'dormida') {
      dormidas.set(op.carrinhaId, op.para);
      continue;
    }
    const lista = porPessoa.get(op.pessoaId);
    if (lista) lista.push(op);
    else porPessoa.set(op.pessoaId, [op]);
  }
  return {
    ...estado,
    pessoas:
      porPessoa.size === 0
        ? estado.pessoas
        : estado.pessoas.map((p) => {
            const lista = porPessoa.get(p.id);
            return lista ? lista.reduce(aplicarUma, p) : p;
          }),
    carrinhas:
      condutores.size === 0 && dormidas.size === 0
        ? estado.carrinhas
        : estado.carrinhas.map((c): Carrinha => {
            let nova = c;
            const condutorId = condutores.get(c.id);
            if (condutorId !== undefined) nova = { ...nova, condutorId };
            const dormida = dormidas.get(c.id);
            if (dormida !== undefined) {
              const lida = dormida === null ? null : lerChaveDormida(dormida);
              nova = {
                ...nova,
                dormeCasaId: lida?.tipo === 'casa' ? lida.id : null,
                dormeLocalId: lida?.tipo === 'local' ? lida.id : null,
              };
            }
            return nova;
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
    const chave =
      op.tipo === 'condutor'
        ? `c\u0000${op.carrinhaId}`
        : op.tipo === 'dormida'
          ? `d\u0000${op.carrinhaId}`
          : `p\u0000${op.pessoaId}\u0000${op.campo}`;
    const anterior = juntas.get(chave);
    juntas.set(chave, anterior ? { ...anterior, para: op.para } : { ...op });
  }
  return [...juntas.values()].filter((op) => op.de !== op.para);
}

/** `esperado` = o que a operação esperava encontrar (`de`); `atual` = o que lá está agora. */
export type Conflito =
  | { tipo: 'mover'; pessoaId: Id; campo: CampoMovivel; esperado: Id | null; atual: Id | null }
  | { tipo: 'condutor'; carrinhaId: Id; esperado: Id | null; atual: Id | null }
  | { tipo: 'dormida'; carrinhaId: Id; esperado: ChaveDormida | null; atual: ChaveDormida | null };

/** Operações cujo `de` já não corresponde ao estado (alguém mudou entretanto). */
export function encontrarConflitos(estado: Estado, ops: readonly Operacao[]): Conflito[] {
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const carrinhas = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const conflitos: Conflito[] = [];
  for (const op of ops) {
    if (op.tipo === 'dormida') {
      const c = carrinhas.get(op.carrinhaId);
      if (c && chaveDormida(c) !== op.de) {
        conflitos.push({
          tipo: 'dormida',
          carrinhaId: op.carrinhaId,
          esperado: op.de,
          atual: chaveDormida(c),
        });
      }
      continue;
    }
    if (op.tipo === 'condutor') {
      const c = carrinhas.get(op.carrinhaId);
      if (c && c.condutorId !== op.de) {
        conflitos.push({ tipo: 'condutor', carrinhaId: op.carrinhaId, esperado: op.de, atual: c.condutorId });
      }
      continue;
    }
    const p = pessoas.get(op.pessoaId);
    if (!p) continue;
    if (p[op.campo] !== op.de) {
      conflitos.push({
        tipo: 'mover',
        pessoaId: op.pessoaId,
        campo: op.campo,
        esperado: op.de,
        atual: p[op.campo],
      });
    }
  }
  return conflitos;
}

/**
 * Erros de referência (pessoa, carrinha ou destino que não existem, pessoa inativa) e a regra do condutor:
 * no fim das operações, o condutor de cada carrinha mexida tem de ir nela. Lista vazia = válido.
 */
export function validarOperacoes(estado: Estado, ops: readonly Operacao[]): string[] {
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const carrinhas = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const existe: Record<CampoMovivel, Set<Id>> = {
    casaId: new Set(estado.casas.map((c) => c.id)),
    carrinhaId: new Set(estado.carrinhas.map((c) => c.id)),
    obraId: new Set(estado.obras.map((o) => o.id)),
  };
  const erros: string[] = [];
  const carrinhasMexidas = new Set<Id>();
  const casas = new Set(estado.casas.map((c) => c.id));
  const locais = new Set(estado.locais.map((l) => l.id));
  for (const op of ops) {
    if (op.tipo === 'dormida') {
      if (!carrinhas.has(op.carrinhaId)) erros.push(`A carrinha ${op.carrinhaId} não existe.`);
      if (op.para !== null) {
        const lida = lerChaveDormida(op.para);
        const existe = lida && (lida.tipo === 'casa' ? casas.has(lida.id) : locais.has(lida.id));
        if (!existe) erros.push(`O sítio onde dormir "${op.para}" não existe.`);
      }
      continue;
    }
    if (op.tipo === 'condutor') {
      if (!carrinhas.has(op.carrinhaId)) {
        erros.push(`A carrinha ${op.carrinhaId} não existe.`);
        continue;
      }
      carrinhasMexidas.add(op.carrinhaId);
      if (op.para !== null) {
        const c = pessoas.get(op.para);
        if (!c) erros.push(`A pessoa ${op.para} não existe.`);
        else if (!c.ativa) erros.push(`${c.nomeCurto} não está ativa.`);
      }
      continue;
    }
    if (op.campo === 'carrinhaId') {
      if (op.de) carrinhasMexidas.add(op.de);
      if (op.para) carrinhasMexidas.add(op.para);
    }
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
  if (erros.length > 0 || carrinhasMexidas.size === 0) return erros;
  const final = aplicarOperacoes(estado, ops);
  const pessoasFinal = new Map(final.pessoas.map((p) => [p.id, p]));
  for (const c of final.carrinhas) {
    if (!carrinhasMexidas.has(c.id) || c.condutorId === null) continue;
    const condutor = pessoasFinal.get(c.condutorId);
    if (!condutor || condutor.carrinhaId !== c.id) {
      erros.push(
        `${condutor?.nomeCurto ?? c.condutorId} não vai na carrinha ${formatarMatricula(c.matricula)}: não pode ser o condutor.`,
      );
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
    if (valor === null) return 'Sem transporte da empresa';
    const carrinha = estado.carrinhas.find((c) => c.id === valor);
    return carrinha ? formatarMatricula(carrinha.matricula) : valor;
  }
  return valor === null ? 'sem obra' : (estado.obras.find((o) => o.id === valor)?.nome ?? valor);
}

function nomePessoa(estado: Estado, id: Id | null): string {
  if (id === null) return 'sem condutor';
  return estado.pessoas.find((p) => p.id === id)?.nomeCurto ?? id;
}

/** Nome do sítio onde a carrinha dorme ("por definir" quando não está definido). */
export function nomeDaDormida(estado: Estado, chave: ChaveDormida | null): string {
  if (chave === null) return 'por definir';
  const lida = lerChaveDormida(chave);
  if (!lida) return chave;
  if (lida.tipo === 'casa') return estado.casas.find((c) => c.id === lida.id)?.nome ?? lida.id;
  return estado.locais.find((l) => l.id === lida.id)?.nome ?? lida.id;
}

/**
 * Ex.: "Ana Exemplo — casa: Casa A → Casa B"; "ZZ 1001 — condutor: sem condutor → Ana Exemplo";
 * "ZZ 1001 — onde dorme: por definir → Casa A".
 */
export function descreverOperacao(estado: Estado, op: Operacao): string {
  if (op.tipo === 'dormida') {
    const matricula = estado.carrinhas.find((c) => c.id === op.carrinhaId)?.matricula;
    const carrinha = matricula ? formatarMatricula(matricula) : op.carrinhaId;
    return `${carrinha} — onde dorme: ${nomeDaDormida(estado, op.de)} → ${nomeDaDormida(estado, op.para)}`;
  }
  if (op.tipo === 'condutor') {
    const matricula = estado.carrinhas.find((c) => c.id === op.carrinhaId)?.matricula;
    const carrinha = matricula ? formatarMatricula(matricula) : op.carrinhaId;
    return `${carrinha} — condutor: ${nomePessoa(estado, op.de)} → ${nomePessoa(estado, op.para)}`;
  }
  const nome = estado.pessoas.find((p) => p.id === op.pessoaId)?.nomeCurto ?? op.pessoaId;
  return `${nome} — ${NOME_CAMPO[op.campo]}: ${nomeDoValor(estado, op.campo, op.de)} → ${nomeDoValor(estado, op.campo, op.para)}`;
}
