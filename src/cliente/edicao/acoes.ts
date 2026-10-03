// Ações do modo de edição usadas pela barra, pelos atalhos e pelos diálogos: chamam a loja e deixam
// um aviso curto a dizer o que aconteceu (também lido pelos leitores de ecrã).

import { type Alvo, operacaoCondutor, operacoesParaAlvo } from '../../dominio/operacoes';
import type { Id } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { comPlural } from '../paineis/textos';
import { resumirPasso } from './resumo';
import { useUiEdicao } from './ui';

function avisar(texto: string): void {
  useUiEdicao.getState().avisar(texto);
}

export function desfazerComAviso(): void {
  const { passos, estado, desfazer } = useLoja.getState();
  const ultimo = passos.at(-1);
  if (!ultimo || !estado) return;
  desfazer();
  avisar(`Desfeito: ${resumirPasso(estado, ultimo)}`);
}

export function refazerComAviso(): void {
  const { passosDesfeitos, estado, refazer } = useLoja.getState();
  const proximo = passosDesfeitos.at(-1);
  if (!proximo || !estado) return;
  refazer();
  avisar(`Refeito: ${resumirPasso(estado, proximo)}`);
}

/** Leva as pessoas até ao alvo (um passo do rascunho). Devolve quantas mudaram. */
export function moverComAviso(pessoaIds: readonly Id[], alvo: Alvo): number {
  const { estado, moverPara } = useLoja.getState();
  if (!estado) return 0;
  const passo = operacoesParaAlvo(estado, pessoaIds, alvo);
  const n = moverPara(pessoaIds, alvo);
  if (n > 0) avisar(`${resumirPasso(estado, passo)}. Ctrl+Z desfaz.`);
  else avisar(pessoaIds.length === 1 ? 'Nada mudou: já lá estava.' : 'Nada mudou: já lá estavam.');
  return n;
}

/**
 * Põe `pessoaId` a conduzir a carrinha (null = tira o condutor), como um passo do rascunho.
 * Só a quem vai na carrinha (quem chama garante-o). Devolve se mudou alguma coisa.
 */
export function definirCondutorComAviso(carrinhaId: Id, pessoaId: Id | null): boolean {
  const { estado, modoEdicao, aplicar } = useLoja.getState();
  if (!estado || !modoEdicao) return false;
  const op = operacaoCondutor(estado, carrinhaId, pessoaId);
  if (!op) return false;
  aplicar([op]);
  avisar(`${resumirPasso(estado, [op])}. Ctrl+Z desfaz.`);
  return true;
}

export function limparSelecaoComAviso(): void {
  const { selecao, limparSelecao } = useLoja.getState();
  if (selecao.size === 0) return;
  limparSelecao();
  avisar('Seleção limpa.');
}

/** Cancelar: com alterações por guardar pede confirmação; sem alterações sai logo. */
export function pedirCancelar(): void {
  const { pendentes, cancelarEdicao } = useLoja.getState();
  if (pendentes.length > 0) {
    useUiEdicao.getState().abrirDialogo({ tipo: 'cancelar' });
    return;
  }
  cancelarEdicao();
  avisar('Saíste do modo de edição.');
}

/** Depois de confirmar: deita fora o rascunho e volta tudo ao que estava. */
export function deitarForaAlteracoes(): void {
  const { pendentes, cancelarEdicao } = useLoja.getState();
  const n = pendentes.length;
  cancelarEdicao();
  useUiEdicao.getState().fecharDialogo();
  avisar(`${comPlural(n, 'alteração deitada', 'alterações deitadas')} fora. Está tudo como estava.`);
}

export function entrarEdicaoComAviso(): void {
  useLoja.getState().entrarEdicao();
  avisar('Modo de edição: as mudanças só ficam gravadas quando carregares em Guardar.');
}
