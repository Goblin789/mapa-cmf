// Preferências da lista lateral lembradas no browser (localStorage): a vista e se está alargada.
// O localStorage pode não existir ou recusar (modo privado, quota): nunca deixa a lista partir.

import { ehVista, type Vista } from './seccoes';

const CHAVE = 'mapa-cmf:lista';

export interface Preferencias {
  vista: Vista;
  alargado: boolean;
}

export const PREFERENCIAS_INICIAIS: Preferencias = { vista: 'casas', alargado: false };

/** Lê o texto guardado; o que faltar ou vier estragado fica com o valor inicial. */
export function lerPreferencias(texto: string | null): Preferencias {
  if (!texto) return PREFERENCIAS_INICIAIS;
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return PREFERENCIAS_INICIAIS;
  }
  if (typeof dados !== 'object' || dados === null) return PREFERENCIAS_INICIAIS;
  const { vista, alargado } = dados as Record<string, unknown>;
  return {
    vista: ehVista(vista) ? vista : PREFERENCIAS_INICIAIS.vista,
    alargado: typeof alargado === 'boolean' ? alargado : PREFERENCIAS_INICIAIS.alargado,
  };
}

export function carregarPreferencias(): Preferencias {
  try {
    return lerPreferencias(window.localStorage.getItem(CHAVE));
  } catch {
    return PREFERENCIAS_INICIAIS;
  }
}

export function guardarPreferencias(p: Preferencias): void {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // Sem localStorage: fica só para esta visita.
  }
}
