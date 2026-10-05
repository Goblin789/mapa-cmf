// Reverter uma gravação a partir do Histórico (M2, docs/m2.md, "Reverter"). Funções puras.
// "Reverter" num lote NÃO grava nada: calcula as operações inversas das alterações desse lote e põe-nas no
// RASCUNHO (um passo; a loja entra no modo de edição). Só fica gravado com Guardar, como tudo o resto.
// Cada operação inversa leva como `de` o valor que o lote deixou (`depois`): se entretanto mudou, essa
// alteração já não se pode reverter e aparece em `impossiveis`, com o motivo.
//
// CONTRATO DO M2: as assinaturas estão fechadas.

import type { AlteracaoHistorico, EntradaHistorico } from './api';
import {
  ENTIDADES_CRIAVEIS,
  type EntidadeEditavel,
  eCampoEditavel,
  eEntidadeEditavel,
  encontrarRegisto,
  type ValorCampo,
} from './campos';
import {
  CAMPO_CONDUTOR,
  CAMPO_DORMIDA,
  CAMPO_REGISTO,
  type CampoMovivel,
  chaveDormida,
  compactarOperacoes,
  descreverOperacao,
  nomeDaDormida,
  nomeDoValor,
  type Operacao,
  type OperacaoRegisto,
  validarOperacoes,
  valoresIguais,
  valorLegivel,
} from './operacoes';
import type { Estado, Id } from './tipos';

/** Uma linha da tabela `alteracoes` (valores em JSON; null = não existia). */
export type AlteracaoGravada = Pick<
  AlteracaoHistorico,
  'entidade' | 'entidadeId' | 'campo' | 'antes' | 'depois'
> &
  Partial<Pick<AlteracaoHistorico, 'descricao'>>;

/** Uma alteração do lote que não se pode reverter (frase do histórico + porquê). */
export interface ImpossivelReverter {
  /** A frase do histórico (ex.: "Ana T. — casa: Casa Um → Casa Dois"). */
  descricao: string;
  /** Ex.: "entretanto mudou: agora está em Casa Três"; "não se reverte no programa (dados iniciais)". */
  motivo: string;
}

export interface PlanoReversao {
  /** Operações inversas, já compactadas, a pôr no rascunho como um só passo ([] = nada a reverter). */
  operacoes: Operacao[];
  /** O que fica de fora porque mudou entretanto (ou não se reverte no programa). */
  impossiveis: ImpossivelReverter[];
  /**
   * Erros de validarOperacoes das `operacoes` sobre o estado (ex.: a obra a apagar tem agora pessoas):
   * com erros, o diálogo explica e não deixa pôr no rascunho.
   */
  erros: string[];
}

/** Autores cujos lotes não se revertem no programa (a importação e os dados iniciais). */
export const AUTORES_SEM_REVERTER: readonly string[] = ['importacao', 'dados-iniciais'];

/** O lote mostra "Reverter": gravado no programa (não pela importação nem pelos dados iniciais) e aplicado. */
export function podeReverter(entrada: Pick<EntradaHistorico, 'autor' | 'estado' | 'tipo'>): boolean {
  return (
    entrada.estado === 'aplicado' &&
    entrada.tipo !== 'importacao' &&
    !AUTORES_SEM_REVERTER.includes(entrada.autor)
  );
}

/**
 * Quem reverteu cada lote, contando só as reversões que ainda estão em vigor: uma reversão que foi ela
 * própria revertida deixa de contar, e o lote que ela revertia volta a estar em vigor (pode reverter-se
 * outra vez). Ex.: 9 reverte 8 e 10 reverte 9 → 8 não está revertido; 9 está, por 10.
 * O revertedor tem sempre um nº maior do que o que reverte, por isso basta ir do mais recente para trás.
 * @param lotes os lotes com `reverte` (qualquer ordem; os outros não interessam).
 * @returns lote revertido → os lotes em vigor que o reverteram (por ordem); quem não está não foi revertido.
 */
export function revertidosEmVigor(
  lotes: readonly { id: number; reverte: readonly number[] }[],
): Map<number, number[]> {
  const revertidoPor = new Map<number, number[]>();
  for (const lote of [...lotes].sort((a, b) => b.id - a.id)) {
    // Os que reverteram este já foram vistos (têm nº maior): se algum está em vigor, este não conta.
    if (revertidoPor.has(lote.id)) continue;
    for (const id of new Set(lote.reverte)) {
      if (id < lote.id) revertidoPor.set(id, [lote.id, ...(revertidoPor.get(id) ?? [])]);
    }
  }
  return revertidoPor;
}

/** Valor guardado em JSON (texto que não é JSON, que não devia acontecer, fica como está). */
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

const CAMPOS_MOVIVEIS: ReadonlySet<string> = new Set<CampoMovivel>(['casaId', 'carrinhaId', 'obraId']);

/**
 * A operação que uma linha de `alteracoes` gravou (a frase do histórico e a inversa partem dela): 'mover',
 * 'condutor', 'dormida', 'campo' (um campo de CAMPOS_EDITAVEIS) ou 'registo' (CAMPO_REGISTO). null quando a
 * linha não é de uma operação do programa (ex.: a cor de um cliente, a ordem, um registo dos dados iniciais).
 */
export function operacaoDaAlteracao(linha: AlteracaoGravada): Operacao | null {
  const antes = lerJson(linha.antes);
  const depois = lerJson(linha.depois);
  if (linha.entidade === 'pessoa' && CAMPOS_MOVIVEIS.has(linha.campo)) {
    return {
      tipo: 'mover',
      pessoaId: linha.entidadeId,
      campo: linha.campo as CampoMovivel,
      de: comoId(antes),
      para: comoId(depois),
    };
  }
  if (linha.entidade === 'carrinha' && linha.campo === CAMPO_CONDUTOR) {
    return { tipo: 'condutor', carrinhaId: linha.entidadeId, de: comoId(antes), para: comoId(depois) };
  }
  if (linha.entidade === 'carrinha' && linha.campo === CAMPO_DORMIDA) {
    return { tipo: 'dormida', carrinhaId: linha.entidadeId, de: comoId(antes), para: comoId(depois) };
  }
  const objeto = (v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null);
  if (linha.campo === CAMPO_REGISTO) {
    if (!(ENTIDADES_CRIAVEIS as readonly string[]).includes(linha.entidade)) return null;
    const de = objeto(antes);
    const para = objeto(depois);
    if ((de === null) === (para === null)) return null;
    return { tipo: 'registo', entidade: linha.entidade, id: linha.entidadeId, de, para } as OperacaoRegisto;
  }
  if (!eEntidadeEditavel(linha.entidade) || !eCampoEditavel(linha.entidade, linha.campo)) return null;
  // Uma linha de um registo que entrou ou saiu pelos dados iniciais (antes ou depois sem valor) não é um 'campo'.
  if (linha.antes === null || linha.depois === null) return null;
  return {
    tipo: 'campo',
    entidade: linha.entidade,
    id: linha.entidadeId,
    campo: linha.campo,
    de: antes as ValorCampo,
    para: depois as ValorCampo,
  };
}

/** Porque é que um registo já não está no Estado (os períodos e os problemas antigos não vêm no Estado). */
function motivoAusente(entidade: EntidadeEditavel): string {
  return entidade === 'indisponibilidade' || entidade === 'problema'
    ? 'já não aparece no mapa (acabou há mais de 30 dias)'
    : 'já não existe';
}

/** A operação inversa de `feita` sobre o estado, ou o motivo por que já não se pode reverter. */
function inversa(estado: Estado, feita: Operacao): { op: Operacao } | { motivo: string } {
  switch (feita.tipo) {
    case 'mover': {
      const p = estado.pessoas.find((x) => x.id === feita.pessoaId);
      if (!p) return { motivo: 'já não existe' };
      const atual = p[feita.campo];
      if (atual !== feita.para) {
        return { motivo: `entretanto mudou: agora está em ${nomeDoValor(estado, feita.campo, atual)}` };
      }
      return { op: { ...feita, de: feita.para, para: feita.de } };
    }
    case 'condutor': {
      const c = estado.carrinhas.find((x) => x.id === feita.carrinhaId);
      if (!c) return { motivo: 'já não existe' };
      if (c.condutorId !== feita.para) {
        const agora =
          c.condutorId === null
            ? 'não tem condutor'
            : `o condutor é ${estado.pessoas.find((x) => x.id === c.condutorId)?.nomeCurto ?? c.condutorId}`;
        return { motivo: `entretanto mudou: agora ${agora}` };
      }
      return { op: { ...feita, de: feita.para, para: feita.de } };
    }
    case 'dormida': {
      const c = estado.carrinhas.find((x) => x.id === feita.carrinhaId);
      if (!c) return { motivo: 'já não existe' };
      const atual = chaveDormida(c);
      if (atual !== feita.para) {
        const agora = atual === null ? 'está por definir' : `dorme em ${nomeDaDormida(estado, atual)}`;
        return { motivo: `entretanto mudou: agora ${agora}` };
      }
      return { op: { ...feita, de: feita.para, para: feita.de } };
    }
    case 'campo': {
      const registo = encontrarRegisto(estado, feita.entidade, feita.id) as
        | Record<string, ValorCampo>
        | undefined;
      if (!registo) return { motivo: motivoAusente(feita.entidade) };
      const atual = registo[feita.campo] ?? null;
      if (!valoresIguais(atual, feita.para)) {
        return {
          motivo: `entretanto mudou: agora é ${valorLegivel(estado, feita.entidade, feita.campo, atual)}`,
        };
      }
      return { op: { ...feita, de: feita.para, para: feita.de } };
    }
    case 'registo': {
      const atual = encontrarRegisto(estado, feita.entidade, feita.id);
      if (feita.de === null) {
        if (feita.entidade === 'pessoa') {
          return { motivo: 'uma pessoa nova não se apaga: usa Saiu da empresa' };
        }
        if (!atual) return { motivo: motivoAusente(feita.entidade) };
        if (!valoresIguais(atual, feita.para)) return { motivo: 'entretanto mudou (foi editado depois)' };
        return { op: { ...feita, de: atual, para: null } as OperacaoRegisto };
      }
      if (atual) return { motivo: 'já existe outra vez' };
      return { op: { ...feita, de: null, para: feita.de } as OperacaoRegisto };
    }
  }
}

/**
 * As operações que desfazem as alterações de um lote, sobre o estado VISÍVEL (o do servidor com o rascunho
 * que já houver): linhas pela ordem inversa; 'pessoa' casaId/carrinhaId/obraId → 'mover'; CAMPO_CONDUTOR →
 * 'condutor'; CAMPO_DORMIDA → 'dormida'; um campo de CAMPOS_EDITAVEIS → 'campo'; CAMPO_REGISTO → 'registo'
 * (criar ↔ apagar). Cada inversa tem `de` = o `depois` da linha: se o valor atual já não é esse, a linha vai
 * para `impossiveis` ("entretanto mudou: agora está em Casa Três"). As marcas "a confirmar" (casaAConfirmar,
 * carrinhaAConfirmar) ignoram-se: as que um 'mover' limpou não voltam (a reversão é uma escolha à mão).
 * Linhas que não são do programa (ex.: a cor de um cliente, a ordem) → impossíveis.
 * Recebe TODAS as linhas do lote (o servidor nunca tira linhas; juntar "latitude" e "longitude" numa frase é
 * só da apresentação, no browser), senão o pino de uma obra voltava só metade.
 * Inversas que dão erro e se podem separar vão para `impossiveis` com o motivo, em vez de bloquearem o lote
 * inteiro: a criação de uma pessoa ("uma pessoa nova não se apaga: usa Saiu da empresa"), um registo que já
 * não está no Estado; e, com erros de validarOperacoes, tira-se uma a uma (pela ordem) a inversa cuja saída faz
 * diminuir os erros (o motivo é a frase do erro que desaparece), até não haver erros ou nada melhorar. Só o
 * que sobra fica em `erros` (bloqueia).
 */
export function planearReversao(estado: Estado, alteracoes: readonly AlteracaoGravada[]): PlanoReversao {
  const impossiveis: ImpossivelReverter[] = [];
  let candidatas: { op: Operacao; descricao: string }[] = [];
  // Um registo criado no lote como ficou no fim do lote: com os 'campo' do mesmo lote (ex.: um problema aberto
  // e resolvido no mesmo Guardar). É com isto que se vê se "foi editado depois".
  const operacoes = alteracoes.map(operacaoDaAlteracao);
  const noFimDoLote = new Map<string, Record<string, unknown>>();
  for (const op of operacoes) {
    if (op?.tipo === 'registo' && op.de === null && op.para !== null) {
      noFimDoLote.set(`${op.entidade}\u0000${op.id}`, { ...op.para });
    } else if (op?.tipo === 'campo') {
      const criado = noFimDoLote.get(`${op.entidade}\u0000${op.id}`);
      if (criado) criado[op.campo] = op.para;
    }
  }
  for (const [i, linha] of [...alteracoes.entries()].reverse()) {
    const marca = linha.campo === 'casaAConfirmar' || linha.campo === 'carrinhaAConfirmar';
    if (linha.entidade === 'pessoa' && marca) continue;
    let feita = operacoes[i] ?? null;
    if (feita?.tipo === 'registo' && feita.de === null) {
      const fim = noFimDoLote.get(`${feita.entidade}\u0000${feita.id}`);
      if (fim) feita = { ...feita, para: fim } as unknown as Operacao;
    }
    const descricao =
      linha.descricao ??
      (feita ? descreverOperacao(estado, feita) : `${linha.entidade} ${linha.entidadeId} — ${linha.campo}`);
    if (!feita) {
      impossiveis.push({ descricao, motivo: 'não se reverte no programa' });
      continue;
    }
    const r = inversa(estado, feita);
    if ('motivo' in r) impossiveis.push({ descricao, motivo: r.motivo });
    else candidatas.push({ op: r.op, descricao });
  }

  const validar = (lista: readonly { op: Operacao }[]) =>
    validarOperacoes(estado, compactarOperacoes(lista.map((c) => c.op)));
  let erros = validar(candidatas);
  while (erros.length > 0) {
    let melhorou = false;
    for (const [i, candidata] of candidatas.entries()) {
      const sem = candidatas.filter((_, j) => j !== i);
      const errosSem = validar(sem);
      if (errosSem.length >= erros.length) continue;
      const resolvido = erros.find((e) => !errosSem.includes(e)) ?? erros[0] ?? '';
      impossiveis.push({ descricao: candidata.descricao, motivo: resolvido });
      candidatas = sem;
      erros = errosSem;
      melhorou = true;
      break;
    }
    if (!melhorou) break;
  }
  return { operacoes: compactarOperacoes(candidatas.map((c) => c.op)), impossiveis, erros };
}
