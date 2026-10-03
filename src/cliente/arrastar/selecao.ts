// Regras da seleção no modo de edição, sem DOM.

import type { Id } from '../../dominio/tipos';
import type { ModoSelecao } from '../estado/loja';

/** Ctrl/⌘+clique junta ou tira da seleção; Shift+clique escolhe um intervalo; clique simples substitui. */
export function modoDoClique(teclas: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): ModoSelecao {
  if (teclas.ctrlKey || teclas.metaKey) return 'alternar';
  if (teclas.shiftKey) return 'intervalo';
  return 'substituir';
}

/**
 * Quem vai no arrasto: arrastar um nome selecionado leva toda a seleção (com esse à frente);
 * arrastar um que não está selecionado leva só esse.
 */
export function idsAArrastar(pessoaId: Id, selecao: ReadonlySet<Id>): Id[] {
  if (!selecao.has(pessoaId)) return [pessoaId];
  return [pessoaId, ...[...selecao].filter((id) => id !== pessoaId)];
}
