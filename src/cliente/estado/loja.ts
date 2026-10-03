// Estado do browser (Zustand): dados vindos do servidor + estado da interface.
//
// Modo de edição: nada se pode mudar fora dele. Lá dentro, cada mudança é um "passo" do rascunho
// (Ctrl+Z desfaz o passo inteiro). O que se vê (`estado`, `indices`, `contadores`, `dormidas`) é
// SEMPRE o estado do servidor com o rascunho aplicado — é isso que faz a simulação "e se".
// Só "Guardar" envia o rascunho ao servidor; "Cancelar" deita-o fora e volta tudo ao que estava.

import { create } from 'zustand';
import { type Contadores, calcularContadores } from '../../dominio/contadores';
import { type Dormida, dormidasDasCarrinhas } from '../../dominio/dormidas';
import { type Indices, indexar } from '../../dominio/indices';
import {
  type Alvo,
  aplicarOperacoes,
  compactarOperacoes,
  type Operacao,
  operacoesParaAlvo,
} from '../../dominio/operacoes';
import type { Estado, Id } from '../../dominio/tipos';
import { type ConflitoServidor, ErroConflito, guardarLote, obterEstado } from './api';

export type Foco = { tipo: 'pessoa' | 'casa' | 'carrinha'; id: Id } | null;

export interface PedidoIrPara {
  lat: number;
  lng: number;
  zoom: number | null;
  /** Muda a cada pedido, para o mapa reagir mesmo que o destino seja o mesmo. */
  seq: number;
}

/** substituir = clique; alternar = Ctrl/⌘+clique; intervalo = Shift+clique. */
export type ModoSelecao = 'substituir' | 'alternar' | 'intervalo';

/** Camadas do mapa que se podem ligar e desligar. */
export type Camada = 'casas' | 'carrinhas' | 'obras';

interface Derivados {
  estado: Estado;
  indices: Indices;
  contadores: Contadores;
  dormidas: Map<Id, Dormida>;
}

function derivar(estado: Estado): Derivados {
  const indices = indexar(estado);
  return {
    estado,
    indices,
    contadores: calcularContadores(estado, indices),
    dormidas: dormidasDasCarrinhas(estado, indices),
  };
}

export interface Loja {
  /** Estado tal como está gravado no servidor. */
  estadoServidor: Estado | null;
  /** Contadores do estado gravado (para mostrar a diferença durante a edição). */
  contadoresServidor: Contadores | null;
  /** Estado VISÍVEL: o do servidor com o rascunho aplicado. É este que os componentes mostram. */
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
  definirClienteDestacado: (id: Id | null) => void;

  /** Pessoa, casa ou carrinha em foco (mostra a ligação casa → carrinha → obra). */
  foco: Foco;
  definirFoco: (foco: Foco) => void;

  /** Cartões abertos à mão. Chave: "casa:<id>", "carrinha:<id>", "grupo:<localId>". */
  expandidos: ReadonlySet<string>;
  alternarExpandido: (chave: string) => void;

  irPara: PedidoIrPara | null;
  pedirIrPara: (lat: number, lng: number, zoom?: number) => void;

  /** Camadas visíveis no mapa. */
  camadas: Readonly<Record<Camada, boolean>>;
  alternarCamada: (camada: Camada) => void;

  // --- Modo de edição -------------------------------------------------------------------------
  modoEdicao: boolean;
  /** Passos do rascunho, por ordem. Cada passo é uma ação do utilizador (ex.: largar 3 pessoas). */
  passos: Operacao[][];
  /** Passos desfeitos, para Refazer. */
  passosDesfeitos: Operacao[][];
  /** Alterações por guardar, já compactadas (o que se mostra na lista e se envia ao servidor). */
  pendentes: Operacao[];
  entrarEdicao: () => void;
  /** Sai do modo de edição e deita fora o rascunho, sem perguntar (quem chama pede confirmação). */
  cancelarEdicao: () => void;
  /** Junta um passo ao rascunho. Ignorado fora do modo de edição ou se não mudar nada. */
  aplicar: (ops: Operacao[]) => void;
  /** Leva as pessoas até ao alvo (um passo). Devolve quantas mudaram. */
  moverPara: (pessoaIds: readonly Id[], alvo: Alvo) => number;
  desfazer: () => void;
  refazer: () => void;
  aGuardar: boolean;
  erroGuardar: string | null;
  /** Conflitos devolvidos pelo servidor na última tentativa de guardar (nada foi gravado). */
  conflitos: ConflitoServidor[] | null;
  /** Envia o rascunho. Se correr bem, recarrega o estado e sai do modo de edição. */
  guardar: (comentario?: string) => Promise<boolean>;

  /** Pessoas selecionadas (só no modo de edição). */
  selecao: ReadonlySet<Id>;
  /** Última pessoa clicada sem Shift: ponto de partida do Shift+clique. */
  ancoraSelecao: Id | null;
  /** `ordem` = ids pela ordem em que aparecem na lista onde se clicou (para o Shift+clique). */
  selecionar: (id: Id, modo: ModoSelecao, ordem?: readonly Id[]) => void;
  definirSelecao: (ids: readonly Id[]) => void;
  limparSelecao: () => void;
}

export const useLoja = create<Loja>()((set, get) => {
  /** Recalcula o estado visível a partir do estado do servidor e dos passos do rascunho. */
  function recalcular(passos: Operacao[][], estadoServidor = get().estadoServidor) {
    if (!estadoServidor) return {};
    const pendentes = compactarOperacoes(passos.flat());
    return { passos, pendentes, ...derivar(aplicarOperacoes(estadoServidor, passos.flat())) };
  }

  return {
    estadoServidor: null,
    contadoresServidor: null,
    estado: null,
    indices: null,
    contadores: null,
    dormidas: null,
    erro: null,
    aCarregar: false,
    carregar: async () => {
      set({ aCarregar: true, erro: null });
      try {
        const estadoServidor = await obterEstado();
        const servidor = derivar(estadoServidor);
        set({
          estadoServidor,
          contadoresServidor: servidor.contadores,
          ...recalcular(get().passos, estadoServidor),
          aCarregar: false,
        });
      } catch (e) {
        set({ erro: e instanceof Error ? e.message : String(e), aCarregar: false });
      }
    },

    clienteDestacado: null,
    alternarClienteDestacado: (id) => set({ clienteDestacado: get().clienteDestacado === id ? null : id }),
    definirClienteDestacado: (id) => set({ clienteDestacado: id }),

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

    camadas: { casas: true, carrinhas: true, obras: true },
    alternarCamada: (camada) => set({ camadas: { ...get().camadas, [camada]: !get().camadas[camada] } }),

    modoEdicao: false,
    passos: [],
    passosDesfeitos: [],
    pendentes: [],
    entrarEdicao: () =>
      set({ modoEdicao: true, erroGuardar: null, conflitos: null, selecao: new Set(), ancoraSelecao: null }),
    cancelarEdicao: () =>
      set({
        modoEdicao: false,
        passosDesfeitos: [],
        erroGuardar: null,
        conflitos: null,
        selecao: new Set(),
        ancoraSelecao: null,
        ...recalcular([]),
      }),
    aplicar: (ops) => {
      if (!get().modoEdicao || ops.length === 0) return;
      const passo = ops.filter((op) => op.de !== op.para);
      if (passo.length === 0) return;
      set({
        passosDesfeitos: [],
        conflitos: null,
        erroGuardar: null,
        ...recalcular([...get().passos, passo]),
      });
    },
    moverPara: (pessoaIds, alvo) => {
      const { estado, modoEdicao } = get();
      if (!estado || !modoEdicao) return 0;
      const ops = operacoesParaAlvo(estado, pessoaIds, alvo);
      get().aplicar(ops);
      return ops.length;
    },
    desfazer: () => {
      const { passos, passosDesfeitos, modoEdicao } = get();
      const ultimo = passos.at(-1);
      if (!modoEdicao || !ultimo) return;
      set({ passosDesfeitos: [...passosDesfeitos, ultimo], ...recalcular(passos.slice(0, -1)) });
    },
    refazer: () => {
      const { passos, passosDesfeitos, modoEdicao } = get();
      const proximo = passosDesfeitos.at(-1);
      if (!modoEdicao || !proximo) return;
      set({ passosDesfeitos: passosDesfeitos.slice(0, -1), ...recalcular([...passos, proximo]) });
    },
    aGuardar: false,
    erroGuardar: null,
    conflitos: null,
    guardar: async (comentario) => {
      const { pendentes, estadoServidor, aGuardar } = get();
      if (aGuardar || !estadoServidor) return false;
      if (pendentes.length === 0) {
        get().cancelarEdicao();
        return true;
      }
      set({ aGuardar: true, erroGuardar: null, conflitos: null });
      try {
        await guardarLote({ versaoBase: estadoServidor.versao, operacoes: pendentes, comentario });
        set({
          modoEdicao: false,
          passos: [],
          passosDesfeitos: [],
          pendentes: [],
          selecao: new Set(),
          ancoraSelecao: null,
        });
        await get().carregar();
        set({ aGuardar: false });
        return true;
      } catch (e) {
        if (e instanceof ErroConflito)
          set({ conflitos: e.conflitos, erroGuardar: e.message, aGuardar: false });
        else set({ erroGuardar: e instanceof Error ? e.message : String(e), aGuardar: false });
        return false;
      }
    },

    selecao: new Set(),
    ancoraSelecao: null,
    selecionar: (id, modo, ordem) => {
      const { selecao, ancoraSelecao } = get();
      if (modo === 'alternar') {
        const nova = new Set(selecao);
        if (nova.has(id)) nova.delete(id);
        else nova.add(id);
        set({ selecao: nova, ancoraSelecao: id });
        return;
      }
      if (modo === 'intervalo' && ordem && ancoraSelecao) {
        const a = ordem.indexOf(ancoraSelecao);
        const b = ordem.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [inicio, fim] = a <= b ? [a, b] : [b, a];
          set({ selecao: new Set(ordem.slice(inicio, fim + 1)) });
          return;
        }
      }
      set({ selecao: new Set([id]), ancoraSelecao: id });
    },
    definirSelecao: (ids) => set({ selecao: new Set(ids) }),
    limparSelecao: () => set({ selecao: new Set(), ancoraSelecao: null }),
  };
});
