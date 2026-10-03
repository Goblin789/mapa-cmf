// Estado do browser (Zustand): dados vindos do servidor + estado da interface.
// No M0 é só leitura; o rascunho de alterações (desfazer/confirmar) chega no M2.

import { create } from 'zustand';
import { type Contadores, calcularContadores } from '../../dominio/contadores';
import { type Dormida, dormidasDasCarrinhas } from '../../dominio/dormidas';
import { type Indices, indexar } from '../../dominio/indices';
import type { Estado, Id } from '../../dominio/tipos';
import { obterEstado } from './api';

export type Foco = { tipo: 'pessoa' | 'casa' | 'carrinha'; id: Id } | null;

export interface PedidoIrPara {
  lat: number;
  lng: number;
  zoom: number | null;
  /** Muda a cada pedido, para o mapa reagir mesmo que o destino seja o mesmo. */
  seq: number;
}

export interface Loja {
  estado: Estado | null;
  indices: Indices | null;
  contadores: Contadores | null;
  dormidas: Map<Id, Dormida> | null;
  erro: string | null;
  aCarregar: boolean;
  carregar: () => Promise<void>;

  /** Cliente escolhido na legenda: só as pessoas desse cliente ficam acesas. */
  clienteDestacado: Id | null;
  alternarClienteDestacado: (id: Id) => void;

  /** Pessoa, casa ou carrinha em foco (mostra a ligação casa → carrinha → obra). */
  foco: Foco;
  definirFoco: (foco: Foco) => void;

  /** Cartões abertos à mão (mostram os nomes em qualquer zoom). Chave: "casa:<id>", "carrinha:<id>", "grupo:<localId>". */
  expandidos: ReadonlySet<string>;
  alternarExpandido: (chave: string) => void;

  irPara: PedidoIrPara | null;
  pedirIrPara: (lat: number, lng: number, zoom?: number) => void;
}

export const useLoja = create<Loja>()((set, get) => ({
  estado: null,
  indices: null,
  contadores: null,
  dormidas: null,
  erro: null,
  aCarregar: false,
  carregar: async () => {
    set({ aCarregar: true, erro: null });
    try {
      const estado = await obterEstado();
      const indices = indexar(estado);
      set({
        estado,
        indices,
        contadores: calcularContadores(estado, indices),
        dormidas: dormidasDasCarrinhas(estado, indices),
        aCarregar: false,
      });
    } catch (e) {
      set({ erro: e instanceof Error ? e.message : String(e), aCarregar: false });
    }
  },

  clienteDestacado: null,
  alternarClienteDestacado: (id) => set({ clienteDestacado: get().clienteDestacado === id ? null : id }),

  foco: null,
  definirFoco: (foco) => set({ foco }),

  expandidos: new Set(),
  alternarExpandido: (chave) => {
    const novo = new Set(get().expandidos);
    if (novo.has(chave)) novo.delete(chave);
    else novo.add(chave);
    set({ expandidos: novo });
  },

  irPara: null,
  pedirIrPara: (lat, lng, zoom) =>
    set({ irPara: { lat, lng, zoom: zoom ?? null, seq: (get().irPara?.seq ?? 0) + 1 } }),
}));
