// Para onde vai o foco quando se entra ou sai do modo de edição. O botão que o tinha (Editar, Cancelar,
// Guardar…, Deitar fora) desaparece com a mudança: sem isto o foco caía no <body> e quem usa o teclado
// voltava ao início da página. Funções puras.

/** barra = a barra âmbar (entrou no modo de edição); editar = o botão Editar do cabeçalho (saiu). */
export type DecisaoFoco = 'barra' | 'editar' | 'esperar' | 'nada';

export interface ContextoFoco {
  /** O modo mudou e o foco ainda não foi tratado. */
  porTratar: boolean;
  modoEdicao: boolean;
  /** Há um diálogo do modo de edição aberto: ao fechar, ele devolve o foco a quem o abriu (se ainda existir). */
  dialogoAberto: boolean;
  /** O foco está no <body>, em lado nenhum, ou num elemento que já saiu da página. */
  focoPerdido: boolean;
}

export function decidirFoco(c: ContextoFoco): DecisaoFoco {
  if (!c.porTratar) return 'nada';
  if (c.dialogoAberto) return 'esperar';
  // Alguém já pôs o foco num sítio que existe (ex.: o diálogo devolveu-o): fica onde está.
  if (!c.focoPerdido) return 'nada';
  return c.modoEdicao ? 'barra' : 'editar';
}

export function focoPerdido(ativo: { isConnected: boolean } | null, corpo: unknown): boolean {
  return ativo === null || ativo === corpo || !ativo.isConnected;
}
