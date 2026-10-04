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

/** M2: o que faz uma tecla num menu (role="menu", ex.: o "Novo…" da barra de edição). */
export type AcaoTeclaMenu = { tipo: 'focar'; indice: number } | { tipo: 'fechar'; devolverFoco: boolean };

/**
 * Teclas de um menu com `n` itens e o foco no item `atual`: setas para cima e para baixo (dão a volta),
 * Home e End; Esc fecha e devolve o foco ao botão do menu; Tab fecha e deixa o foco seguir. null = a tecla não
 * é do menu (Enter e Espaço ficam para o próprio item).
 */
export function teclaNoMenu(tecla: string, atual: number, n: number): AcaoTeclaMenu | null {
  if (n <= 0) return tecla === 'Escape' ? { tipo: 'fechar', devolverFoco: true } : null;
  switch (tecla) {
    case 'ArrowDown':
      return { tipo: 'focar', indice: (atual + 1) % n };
    case 'ArrowUp':
      return { tipo: 'focar', indice: (atual - 1 + n) % n };
    case 'Home':
      return { tipo: 'focar', indice: 0 };
    case 'End':
      return { tipo: 'focar', indice: n - 1 };
    case 'Escape':
      return { tipo: 'fechar', devolverFoco: true };
    case 'Tab':
      return { tipo: 'fechar', devolverFoco: false };
    default:
      return null;
  }
}

/** M2: no botão de um menu fechado, as setas abrem-no já com o foco no 1.º (↓) ou no último (↑) item. */
export function teclaNoBotaoMenu(tecla: string, n: number): number | null {
  if (tecla === 'ArrowDown') return 0;
  if (tecla === 'ArrowUp') return Math.max(0, n - 1);
  return null;
}
