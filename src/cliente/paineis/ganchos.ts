// Ganchos React partilhados pelos painéis.

import { type RefObject, useEffect, useSyncExternalStore } from 'react';

/** O mesmo ponto de quebra que o `md:` do Tailwind. */
const CONSULTA_ECRA_LARGO = '(min-width: 48rem)';

function subscreverEcra(avisar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_ECRA_LARGO);
  consulta.addEventListener('change', avisar);
  return () => consulta.removeEventListener('change', avisar);
}

/** Verdadeiro no PC (md+), falso no telemóvel. */
export function useEcraLargo(): boolean {
  return useSyncExternalStore(
    subscreverEcra,
    () => window.matchMedia(CONSULTA_ECRA_LARGO).matches,
    () => true,
  );
}

// Altura da legenda (px), medida pela própria legenda, para o painel de foco não a tapar.
let alturaLegenda = 0;
const ouvintesLegenda = new Set<() => void>();

function publicarAlturaLegenda(altura: number): void {
  if (altura === alturaLegenda) return;
  alturaLegenda = altura;
  for (const avisar of ouvintesLegenda) avisar();
}

function subscreverLegenda(avisar: () => void): () => void {
  ouvintesLegenda.add(avisar);
  return () => {
    ouvintesLegenda.delete(avisar);
  };
}

/** Ref (callback) da legenda: mede-a sempre que muda de tamanho (abrir/fechar, redimensionar). */
export function medirLegenda(elemento: HTMLElement | null): (() => void) | undefined {
  if (!elemento) return undefined;
  const observador = new ResizeObserver(() => publicarAlturaLegenda(elemento.offsetHeight));
  observador.observe(elemento);
  return () => {
    observador.disconnect();
    publicarAlturaLegenda(0);
  };
}

/** Altura atual da legenda em px (0 se não estiver no ecrã). */
export function useAlturaLegenda(): number {
  return useSyncExternalStore(
    subscreverLegenda,
    () => alturaLegenda,
    () => 0,
  );
}

/**
 * Fecha um popover com Esc ou com um clique fora do contentor (botão + popover).
 * Escuta na fase de captura e marca o Esc como tratado (preventDefault), para o painel de foco
 * não fechar ao mesmo tempo. `fechar` deve ser estável (useCallback).
 */
export function useFecharFora(
  aberto: boolean,
  contentor: RefObject<HTMLElement | null>,
  fechar: () => void,
): void {
  useEffect(() => {
    if (!aberto) return;
    const aoPremir = (e: PointerEvent) => {
      if (e.target instanceof Node && contentor.current?.contains(e.target)) return;
      fechar();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      fechar();
    };
    document.addEventListener('pointerdown', aoPremir, true);
    window.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.removeEventListener('pointerdown', aoPremir, true);
      window.removeEventListener('keydown', aoTeclar, true);
    };
  }, [aberto, contentor, fechar]);
}
