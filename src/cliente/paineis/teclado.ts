// Teclado e posicionamento: decisões puras usadas pela pesquisa e pelos popovers.

/** O mínimo de um elemento que interessa para saber se se está a escrever nele. */
export interface AlvoTeclado {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

const INPUTS_SEM_TEXTO = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** Verdadeiro se o elemento recebe texto (aí o "/" pertence a quem escreve). */
export function ehCampoEditavel(alvo: AlvoTeclado | null | undefined): boolean {
  if (!alvo) return false;
  if (alvo.isContentEditable) return true;
  const tag = alvo.tagName?.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !INPUTS_SEM_TEXTO.has((alvo.type || 'text').toLowerCase());
  return false;
}

export interface TeclaPremida {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** O foco está num campo onde se escreve. */
  emCampoEditavel: boolean;
}

/** "/" (fora de campos de texto) e Ctrl+K / ⌘K (em qualquer sítio) vão para a pesquisa. */
export function ehAtalhoPesquisa(t: TeclaPremida): boolean {
  if (t.altKey) return false;
  if (t.ctrlKey || t.metaKey) return t.key.toLowerCase() === 'k';
  return t.key === '/' && !t.emCampoEditavel;
}

/** Próximo resultado ativo com ↑/↓, a dar a volta nas pontas. -1 = nenhum. */
export function moverAtivo(atual: number, total: number, direcao: 1 | -1): number {
  if (total <= 0) return -1;
  if (atual < 0 || atual >= total) return direcao === 1 ? 0 : total - 1;
  return (atual + direcao + total) % total;
}

/**
 * Deslocamento (px) do popover em relação à esquerda do botão, para caber no ecrã: alinhado com o botão;
 * se sair pela direita, encosta à margem direita; nunca sai pela esquerda (telemóveis de 320–360 px).
 */
export function deslocamentoPopover(
  esquerda: number,
  largura: number,
  larguraJanela: number,
  margem = 8,
): number {
  const excesso = esquerda + largura + margem - larguraJanela;
  return Math.max(excesso > 0 ? -excesso : 0, margem - esquerda);
}
