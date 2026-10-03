// Classes Tailwind dos botões e marcas do modo de edição.

import { FOCO_VISIVEL } from '../paineis/classes';

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md border text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45';

/** Ação principal (Guardar). */
export const BOTAO_PRIMARIO = `${BASE} ${FOCO_VISIVEL} border-slate-900 bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700 disabled:hover:bg-slate-900`;

/** Ações normais (Voltar, Cancelar). */
export const BOTAO_SECUNDARIO = `${BASE} ${FOCO_VISIVEL} border-slate-300 bg-white px-3 py-1.5 text-slate-800 hover:bg-slate-50 disabled:hover:bg-white`;

/** Ação que deita coisas fora. */
export const BOTAO_PERIGO = `${BASE} ${FOCO_VISIVEL} border-red-700 bg-red-700 px-3 py-1.5 text-white hover:bg-red-800`;

const BASE_BARRA = `${BASE} ${FOCO_VISIVEL} h-8 px-2 sm:px-2.5`;

/** Botões da barra âmbar do modo de edição (mais baixos). */
export const BOTAO_BARRA = `${BASE_BARRA} border-amber-300 bg-white text-amber-950 hover:bg-amber-50 disabled:hover:bg-white`;

/** Guardar…, na barra. */
export const BOTAO_BARRA_PRIMARIO = `${BASE_BARRA} border-slate-900 bg-slate-900 text-white hover:bg-slate-700 disabled:hover:bg-slate-900`;

/** Botões pequenos dentro do painel de foco. */
export const BOTAO_PEQUENO = `${BASE} ${FOCO_VISIVEL} border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-50`;

/** Marca "alterado — por guardar" (âmbar, com um ponto além da cor). */
export const MARCA_ALTERADO =
  'inline-flex shrink-0 items-center gap-1 rounded border border-amber-400 bg-amber-100 px-1.5 text-[11px] leading-4 font-semibold text-amber-900';
