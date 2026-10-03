// Atalhos do modo de edição: Ctrl/⌘+Z desfaz, Ctrl+Y e Ctrl/⌘+Shift+Z refazem, Esc limpa a seleção.
// Só no modo de edição, fora de campos de texto (aí o Ctrl+Z é do campo) e sem diálogos abertos.

export type AcaoAtalho = 'desfazer' | 'refazer' | 'limpar-selecao';

export interface ContextoAtalho {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** O foco está num campo onde se escreve. */
  emCampoEditavel: boolean;
  modoEdicao: boolean;
  dialogoAberto: boolean;
  temSelecao: boolean;
}

export function acaoDoAtalho(c: ContextoAtalho): AcaoAtalho | null {
  if (!c.modoEdicao || c.dialogoAberto || c.emCampoEditavel || c.altKey) return null;
  const tecla = c.key.toLowerCase();
  const comando = c.ctrlKey || c.metaKey;
  if (comando && tecla === 'z') return c.shiftKey ? 'refazer' : 'desfazer';
  // ⌘+Y no Mac abre o histórico do browser: só o Ctrl+Y refaz.
  if (c.ctrlKey && !c.metaKey && !c.shiftKey && tecla === 'y') return 'refazer';
  if (tecla === 'escape' && !comando && !c.shiftKey && c.temSelecao) return 'limpar-selecao';
  return null;
}
