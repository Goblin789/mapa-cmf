// Quem tem a sessão iniciada (GET /api/auth/eu). O Portao decide o que mostrar a partir daqui.
//
// CONTRATO DO M1 — implementação por fazer (peça "login").

import { create } from 'zustand';
import type { Utilizador } from '../../dominio/api';

export type EstadoSessao = 'a-verificar' | 'dentro' | 'fora';

export interface LojaSessao {
  estado: EstadoSessao;
  utilizador: Utilizador | null;
  /** Pergunta ao servidor quem está dentro. */
  verificar: () => Promise<void>;
  /** Marca a sessão como terminada (ex.: um pedido devolveu 401): o Portao mostra o ecrã de entrada. */
  marcarFora: () => void;
}

export const useSessao = create<LojaSessao>()((set) => ({
  estado: 'dentro',
  utilizador: { chave: 'local', nome: 'Este computador', email: null, modo: 'local' },
  verificar: async () => {},
  marcarFora: () => set({ estado: 'fora', utilizador: null }),
}));
