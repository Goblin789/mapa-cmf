// Estado da interface do modo de edição que não é do rascunho: que diálogo está aberto e o aviso
// curto que aparece depois de uma ação ("Desfeito: …", "Alterações guardadas."). O rascunho vive em
// estado/loja.ts; aqui só se decide o que se mostra.

import { create } from 'zustand';
import type { EntradaHistorico } from '../../dominio/api';
import type { AlvoProblema } from '../../dominio/problemas';
import type { Id } from '../../dominio/tipos';
import type { TipoDestino } from './destinos';

/** M2: um ponto no mapa (obra nova clicada no mapa). */
export interface PosicaoMapa {
  lat: number;
  lng: number;
}

export type DialogoEdicao =
  | { tipo: 'guardar' }
  | { tipo: 'cancelar' }
  | { tipo: 'historico' }
  /** `filtro` = só casas/carrinhas/obras (aberto a partir do painel de foco); null = tudo. */
  | { tipo: 'mover'; pessoaIds: Id[]; filtro: TipoDestino | null }
  /** "Onde dorme a …": escolher a casa ou o local onde a carrinha dorme. */
  | { tipo: 'dormida'; carrinhaId: Id }
  /** Pede confirmação antes de confirmar as sugestões de onde dormem todas as carrinhas. */
  | { tipo: 'confirmar-sugestoes' }
  // --- M2 (docs/m2.md). Os de edição só abrem no modo de edição: quem os abre entra antes nele. ---
  /** Nova pessoa (módulo Fichas: edicao/DialogoNovaPessoa.tsx). */
  | { tipo: 'nova-pessoa' }
  /** Nova casa (05/10/2026: edicao/DialogoCasa.tsx). */
  | { tipo: 'nova-casa' }
  /** "Saiu da empresa" / "Voltou à empresa" de uma pessoa (módulo Fichas: edicao/DialogoSaida.tsx). */
  | { tipo: 'saida'; pessoaId: Id }
  /**
   * Nova obra (`obraId` null; `posicao` = o ponto clicado no mapa, se veio de lá) ou editar a obra
   * (módulo Obras: edicao/DialogoObra.tsx).
   */
  | { tipo: 'obra'; obraId: Id | null; posicao: PosicaoMapa | null }
  /**
   * Marcar indisponível uma ou mais pessoas (`periodoId` null) ou mudar as datas de um período
   * (módulo Indisponível e problemas: edicao/DialogoIndisponivel.tsx).
   */
  | { tipo: 'indisponivel'; pessoaIds: Id[]; periodoId: Id | null }
  /** Problema novo (`problemaId` null) ou mudar o texto de um (módulo Indisponível e problemas). */
  | { tipo: 'problema'; alvo: AlvoProblema; problemaId: Id | null }
  /**
   * "Reverter" um lote do Histórico: mostra o que volta atrás e o que já não se pode reverter; "Pôr no
   * rascunho" chama loja.iniciarReversao (módulo Histórico: edicao/DialogoReverter.tsx). Abre também fora
   * do modo de edição (só a pré-visualização; pôr no rascunho entra nele).
   */
  | { tipo: 'reverter'; entrada: EntradaHistorico };

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

// --- M2: abrir os diálogos novos (quem chama já está no modo de edição, exceto no Reverter) ---

/** Nova pessoa. */
export function abrirNovaPessoa(): void {
  useUiEdicao.getState().abrirDialogo({ tipo: 'nova-pessoa' });
}

/** Nova casa. */
export function abrirNovaCasa(): void {
  useUiEdicao.getState().abrirDialogo({ tipo: 'nova-casa' });
}

/** "Saiu da empresa" (ou "Voltou à empresa", se a pessoa já não estiver ativa). */
export function abrirSaida(pessoaId: Id): void {
  useUiEdicao.getState().abrirDialogo({ tipo: 'saida', pessoaId });
}

/** Nova obra (obraId null; com a posição clicada no mapa, se houver) ou editar uma obra. */
export function abrirObra(obraId: Id | null, posicao: PosicaoMapa | null = null): void {
  useUiEdicao.getState().abrirDialogo({ tipo: 'obra', obraId, posicao });
}

/** Marcar indisponível (periodoId null) ou mudar as datas de um período. */
export function abrirIndisponivel(pessoaIds: readonly Id[], periodoId: Id | null = null): void {
  useUiEdicao.getState().abrirDialogo({ tipo: 'indisponivel', pessoaIds: [...pessoaIds], periodoId });
}

/** Problema novo (problemaId null) ou mudar o texto de um problema. */
export function abrirProblema(alvo: AlvoProblema, problemaId: Id | null = null): void {
  useUiEdicao.getState().abrirDialogo({ tipo: 'problema', alvo, problemaId });
}

/** "Reverter" um lote do Histórico. */
export function abrirReverter(entrada: EntradaHistorico): void {
  useUiEdicao.getState().abrirDialogo({ tipo: 'reverter', entrada });
}

/** Há algum diálogo aberto (deste módulo ou de outro, com o elemento <dialog>)? */
export function haDialogoAberto(): boolean {
  return useUiEdicao.getState().dialogo !== null || document.querySelector('dialog[open]') !== null;
}
