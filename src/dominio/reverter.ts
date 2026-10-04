// Reverter uma gravação a partir do Histórico (M2, docs/m2.md, "Reverter"). Funções puras.
// "Reverter" num lote NÃO grava nada: calcula as operações inversas das alterações desse lote e põe-nas no
// RASCUNHO (um passo; a loja entra no modo de edição). Só fica gravado com Guardar, como tudo o resto.
// Cada operação inversa leva como `de` o valor que o lote deixou (`depois`): se entretanto mudou, essa
// alteração já não se pode reverter e aparece em `impossiveis`, com o motivo.
//
// CONTRATO DO M2: as assinaturas estão fechadas; `planearReversao` é do módulo base.

import type { AlteracaoHistorico, EntradaHistorico } from './api';
import type { Operacao } from './operacoes';
import type { Estado } from './tipos';

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
 * As operações que desfazem as alterações de um lote, sobre o estado VISÍVEL (o do servidor com o rascunho
 * que já houver): linhas pela ordem inversa; 'pessoa' casaId/carrinhaId/obraId → 'mover'; CAMPO_CONDUTOR →
 * 'condutor'; CAMPO_DORMIDA → 'dormida'; um campo de CAMPOS_EDITAVEIS → 'campo'; CAMPO_REGISTO → 'registo'
 * (criar ↔ apagar). As marcas "a confirmar" que um 'mover' limpou não voltam (a reversão é uma escolha à mão).
 * Linhas que não são do programa (ex.: a cor de um cliente, a ordem) → impossíveis.
 * Recebe TODAS as linhas do lote (o servidor nunca tira linhas; juntar "latitude" e "longitude" numa frase é
 * só da apresentação, no browser), senão o pino de uma obra voltava só metade.
 * Inversas que dão erro e se podem separar vão para `impossiveis` com o motivo, em vez de bloquearem o lote
 * inteiro: a criação de uma pessoa ("uma pessoa nova não se apaga: usa Saiu da empresa"), um registo que já
 * não está no Estado; e, com erros de validarOperacoes, tira-se uma a uma (pela ordem) a inversa cuja saída faz
 * diminuir os erros, até não haver erros ou nada melhorar. Só o que sobra fica em `erros` (bloqueia).
 * CONTRATO DO M2: implementação mínima (não reverte nada); a regra é do módulo base.
 */
export function planearReversao(estado: Estado, alteracoes: readonly AlteracaoGravada[]): PlanoReversao {
  void estado;
  return {
    operacoes: [],
    impossiveis: alteracoes.map((a) => ({
      descricao: a.descricao ?? `${a.entidade} ${a.entidadeId} — ${a.campo}`,
      motivo: 'ainda não se pode reverter (M2 em construção)',
    })),
    erros: [],
  };
}
