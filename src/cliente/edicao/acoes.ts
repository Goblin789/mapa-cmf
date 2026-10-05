// Ações do modo de edição usadas pela barra, pelos atalhos e pelos diálogos: chamam a loja e deixam
// um aviso curto a dizer o que aconteceu (também lido pelos leitores de ecrã).

import {
  type Alvo,
  type ChaveDormida,
  descreverOperacao,
  type Operacao,
  operacaoCondutor,
  operacaoDormida,
  operacaoSemEfeito,
  operacoesParaAlvo,
} from '../../dominio/operacoes';
import type { Estado, Id } from '../../dominio/tipos';
import { reversoesDoRascunho, useLoja } from '../estado/loja';
import { comPlural } from '../paineis/textos';
import { operacaoConfirmarSugestao, operacoesConfirmarSugestoes } from './ondeDorme';
import { resumirPasso } from './resumo';
import { abrirSaida, useUiEdicao } from './ui';

function avisar(texto: string): void {
  useUiEdicao.getState().avisar(texto);
}

export function desfazerComAviso(): void {
  const { passos, estado, desfazer } = useLoja.getState();
  const ultimo = passos.at(-1);
  if (!ultimo || !estado) return;
  // Um passo de "Reverter" diz "Reversão: N alterações" (antes de desfazer: depois já não está no rascunho).
  const reversao = reversoesDoRascunho().some((r) => r.passo === passos.length - 1);
  desfazer();
  avisar(`Desfeito: ${resumirPasso(estado, ultimo, { reversao })}`);
}

export function refazerComAviso(): void {
  const { passosDesfeitos, estado, refazer } = useLoja.getState();
  const proximo = passosDesfeitos.at(-1);
  if (!proximo || !estado) return;
  refazer();
  const reversao = reversoesDoRascunho().some((r) => r.passo === useLoja.getState().passos.length - 1);
  avisar(`Refeito: ${resumirPasso(estado, proximo, { reversao })}`);
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

/** Muda onde dorme a carrinha (null = por definir), como um passo do rascunho. Devolve se mudou. */
export function mudarDormidaComAviso(carrinhaId: Id, para: ChaveDormida | null): boolean {
  const { estado, modoEdicao, aplicar } = useLoja.getState();
  if (!estado || !modoEdicao) return false;
  const op = operacaoDormida(estado, carrinhaId, para);
  if (!op) {
    avisar('Nada mudou: já dormia aí.');
    return false;
  }
  aplicar([op]);
  avisar(`${resumirPasso(estado, [op])}. Ctrl+Z desfaz.`);
  return true;
}

/** A carrinha passa a dormir na casa sugerida (um passo do rascunho). Devolve se mudou. */
export function confirmarSugestaoComAviso(carrinhaId: Id): boolean {
  const { estado, dormidas, modoEdicao, aplicar } = useLoja.getState();
  if (!estado || !dormidas || !modoEdicao) return false;
  const op = operacaoConfirmarSugestao(estado, dormidas, carrinhaId);
  if (!op) return false;
  aplicar([op]);
  avisar(`Sugestão confirmada: ${resumirPasso(estado, [op])}. Ctrl+Z desfaz.`);
  return true;
}

/** Todas as carrinhas com onde dormir sugerido passam a tê-lo definido, num só passo. Devolve quantas. */
export function confirmarTodasSugestoesComAviso(): number {
  const { estado, dormidas, modoEdicao, aplicar } = useLoja.getState();
  if (!estado || !dormidas || !modoEdicao) return 0;
  const ops = operacoesConfirmarSugestoes(estado, dormidas);
  if (ops.length === 0) return 0;
  aplicar(ops);
  avisar(
    `Onde dormem: ${comPlural(ops.length, 'sugestão confirmada', 'sugestões confirmadas')}. Ctrl+Z desfaz tudo de uma vez.`,
  );
  return ops.length;
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

/**
 * Frase curta de um passo com fichas (M2): "Casa Um — lotação: 8 → 9"; vários campos do mesmo registo
 * "Ana T. — carta: sim → não, carta válida até: 01/02/2027 → —"; de registos diferentes "3 alterações". Um
 * passo só com mudanças de pessoas, condutor ou onde dorme fica como sempre (resumirPasso). `estado` = o de
 * antes do passo (os nomes de antes).
 */
export function resumoDoPasso(estado: Estado, passo: readonly Operacao[]): string {
  const fichas = passo.filter((op) => op.tipo === 'campo' || op.tipo === 'registo');
  if (fichas.length === 0) return resumirPasso(estado, passo);
  const frases = fichas.map((op) => {
    const frase = descreverOperacao(estado, op);
    const i = frase.indexOf(' — ');
    return i < 0 ? { quem: '', o: frase } : { quem: frase.slice(0, i), o: frase.slice(i + 3) };
  });
  const [primeira] = frases;
  if (!primeira) return 'nada';
  if (frases.length === passo.length && frases.every((f) => f.quem === primeira.quem)) {
    // Sem repetir frases iguais (a lat e a lng do pino dão as duas "pino mudado de sítio").
    const partes = [...new Set(frases.map((f) => f.o))];
    return primeira.quem ? `${primeira.quem} — ${partes.join(', ')}` : primeira.o;
  }
  return comPlural(passo.length, 'alteração', 'alterações');
}

/**
 * M2: junta as operações ao rascunho como UM passo (Ctrl+Z desfaz tudo de uma vez) e avisa com `texto`
 * (por omissão, resumoDoPasso) e "Ctrl+Z desfaz.". Tira as que não mudam nada; sem nenhuma, avisa "Nada
 * mudou." Só no modo de edição. Devolve se mudou alguma coisa.
 */
export function aplicarComAviso(ops: readonly Operacao[], texto?: string): boolean {
  const { estado, modoEdicao, aplicar } = useLoja.getState();
  if (!estado || !modoEdicao) return false;
  const passo = ops.filter((op) => !operacaoSemEfeito(op));
  if (passo.length === 0) {
    avisar('Nada mudou.');
    return false;
  }
  aplicar(passo);
  avisar(`${texto ?? resumoDoPasso(estado, passo)}. Ctrl+Z desfaz.`);
  return true;
}

export function entrarEdicaoComAviso(): void {
  useLoja.getState().entrarEdicao();
  avisar('Modo de edição: as mudanças só ficam gravadas quando carregares em Guardar.');
}

/**
 * "Voltou à empresa…" de quem saiu (a linha da Tabela com "Mostrar quem saiu"): o DialogoSaida só abre no
 * modo de edição, por isso fora dele entra-se primeiro (como os "Mudar…" da ficha).
 */
export function abrirVoltouAEmpresa(pessoaId: Id): void {
  if (!useLoja.getState().modoEdicao) entrarEdicaoComAviso();
  abrirSaida(pessoaId);
}
