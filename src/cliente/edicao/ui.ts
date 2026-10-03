// Estado da interface do modo de edição que não é do rascunho: que diálogo está aberto e o aviso
// curto que aparece depois de uma ação ("Desfeito: …", "Alterações guardadas."). O rascunho vive em
// estado/loja.ts; aqui só se decide o que se mostra.

import { create } from 'zustand';
import type { Id } from '../../dominio/tipos';
import type { TipoDestino } from './destinos';

export type DialogoEdicao =
  | { tipo: 'guardar' }
  | { tipo: 'cancelar' }
  | { tipo: 'historico' }
  /** `filtro` = só casas/carrinhas/obras (aberto a partir do painel de foco); null = tudo. */
  | { tipo: 'mover'; pessoaIds: Id[]; filtro: TipoDestino | null }
  /** "Onde dorme a …": escolher a casa ou o local onde a carrinha dorme. */
  | { tipo: 'dormida'; carrinhaId: Id }
  /** Pede confirmação antes de confirmar as sugestões de onde dormem todas as carrinhas. */
  | { tipo: 'confirmar-sugestoes' };

export interface AvisoCurto {
  texto: string;
  /** Muda a cada aviso, para o temporizador recomeçar mesmo com o mesmo texto. */
  seq: number;
}

interface UiEdicao {
  dialogo: DialogoEdicao | null;
  abrirDialogo: (dialogo: DialogoEdicao) => void;
  fecharDialogo: () => void;
  aviso: AvisoCurto | null;
  avisar: (texto: string) => void;
  limparAviso: () => void;
}

export const useUiEdicao = create<UiEdicao>()((set, get) => ({
  dialogo: null,
  abrirDialogo: (dialogo) => set({ dialogo }),
  fecharDialogo: () => set({ dialogo: null }),
  aviso: null,
  avisar: (texto) => set({ aviso: { texto, seq: (get().aviso?.seq ?? 0) + 1 } }),
  limparAviso: () => set({ aviso: null }),
}));

/** Abre o "Mover para…" (atalho para os painéis). */
export function abrirMoverPara(pessoaIds: readonly Id[], filtro: TipoDestino | null = null): void {
  useUiEdicao.getState().abrirDialogo({ tipo: 'mover', pessoaIds: [...pessoaIds], filtro });
}

/** Abre o "Onde dorme a …" de uma carrinha. */
export function abrirDormida(carrinhaId: Id): void {
  useUiEdicao.getState().abrirDialogo({ tipo: 'dormida', carrinhaId });
}

/** Há algum diálogo aberto (deste módulo ou de outro, com o elemento <dialog>)? */
export function haDialogoAberto(): boolean {
  return useUiEdicao.getState().dialogo !== null || document.querySelector('dialog[open]') !== null;
}
