// Avisos do tempo real que o <AvisoTempoReal/> mostra: "X gravou N alterações." (empilhados, no máximo
// MAX_AVISOS) e "Sem ligação em tempo real…". Cada aviso some sozinho (ver AvisoTempoReal.tsx).

import { create } from 'zustand';
import { type AvisoLote, juntarAviso } from './decisoes';

export interface LojaAvisosTempoReal {
  avisos: readonly AvisoLote[];
  /** Mais de 30 s sem ligação ao tempo real. */
  semLigacao: boolean;
  avisar: (texto: string) => void;
  retirar: (id: number) => void;
  definirSemLigacao: (sem: boolean) => void;
}

let proximoId = 0;

export const useAvisosTempoReal = create<LojaAvisosTempoReal>()((set, get) => ({
  avisos: [],
  semLigacao: false,
  avisar: (texto) => {
    proximoId += 1;
    set({ avisos: juntarAviso(get().avisos, { id: proximoId, texto }) });
  },
  retirar: (id) => set({ avisos: get().avisos.filter((a) => a.id !== id) }),
  definirSemLigacao: (semLigacao) => {
    if (get().semLigacao !== semLigacao) set({ semLigacao });
  },
}));
