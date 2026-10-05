// Vista ativa (Mapa, Tabela ou Quadro) e modo reunião, refletidos no hash do URL para sobreviverem ao F5
// e se poderem abrir diretamente: sem hash = Mapa, #tabela, #quadro; #reuniao = reunião com o Quadro e
// #reuniao-mapa = reunião com o Mapa (a reunião só mostra o Quadro ou o Mapa).
// Mudar de vista cria uma entrada no histórico do browser (o "Voltar" regressa à anterior); alternar
// dentro da reunião não (substitui a entrada atual). O botão "Reunião" acrescenta uma entrada marcada
// (MARCA_REUNIAO no history.state); sair da reunião volta atrás nessa entrada, para não ficarem duas
// entradas iguais seguidas. Entrando pelo endereço (#reuniao), sair substitui a entrada.
// O agrupamento do Quadro (por casas, por carrinhas ou por obras) fica lembrado no browser (localStorage).

import { useEffect } from 'react';
import { create } from 'zustand';

export type Vista = 'mapa' | 'tabela' | 'quadro';

export const VISTAS: readonly { id: Vista; rotulo: string; titulo: string }[] = [
  { id: 'mapa', rotulo: 'Mapa', titulo: 'Mapa com a lista lateral' },
  { id: 'tabela', rotulo: 'Tabela', titulo: 'Tabela: uma linha por pessoa, com ordenação e filtros' },
  {
    id: 'quadro',
    rotulo: 'Quadro',
    titulo: 'Quadro: casas, carrinhas ou obras em colunas, como as folhas do Michael',
  },
];

/** Na reunião só há o Quadro (por omissão) e o Mapa. */
export const VISTAS_REUNIAO: readonly Vista[] = ['quadro', 'mapa'];

/** Como o Quadro junta as pessoas: por casa, por carrinha ou por obra. */
export type Agrupamento = 'casas' | 'carrinhas' | 'obras';

export const AGRUPAMENTOS: readonly Agrupamento[] = ['casas', 'carrinhas', 'obras'];

export interface EstadoVista {
  vista: Vista;
  reuniao: boolean;
}

export const ESTADO_INICIAL: EstadoVista = { vista: 'mapa', reuniao: false };

/** Na reunião não há Tabela: passa a Quadro. */
export function normalizarEstado(e: EstadoVista): EstadoVista {
  return e.reuniao && !VISTAS_REUNIAO.includes(e.vista) ? { vista: 'quadro', reuniao: true } : e;
}

/** Lê o hash do URL ("#tabela", "#Quadro", "#reuniao-mapa"…). O que não se reconhece é o Mapa. */
export function lerHash(hash: string): EstadoVista {
  let texto = hash.replace(/^#/, '');
  try {
    texto = decodeURIComponent(texto);
  } catch {
    // Um "%" solto: fica o texto como veio.
  }
  switch (texto.trim().toLowerCase()) {
    case 'tabela':
      return { vista: 'tabela', reuniao: false };
    case 'quadro':
      return { vista: 'quadro', reuniao: false };
    case 'reuniao':
    case 'reunião':
    case 'reuniao-quadro':
      return { vista: 'quadro', reuniao: true };
    case 'reuniao-mapa':
    case 'reunião-mapa':
      return { vista: 'mapa', reuniao: true };
    default:
      return ESTADO_INICIAL;
  }
}

/** O hash que corresponde ao estado ('' para o Mapa fora da reunião). */
export function hashDe(e: EstadoVista): string {
  const { vista, reuniao } = normalizarEstado(e);
  if (reuniao) return vista === 'mapa' ? '#reuniao-mapa' : '#reuniao';
  return vista === 'mapa' ? '' : `#${vista}`;
}

// --- Agrupamento do Quadro, lembrado no browser ---------------------------------------------------

const CHAVE_AGRUPAMENTO = 'mapa-cmf:quadro';

/** O agrupamento guardado; o que não se reconhece (ou nada) é 'casas'. */
export function lerAgrupamento(texto: string | null): Agrupamento {
  return AGRUPAMENTOS.find((a) => a === texto) ?? 'casas';
}

function carregarAgrupamento(): Agrupamento {
  try {
    return lerAgrupamento(window.localStorage.getItem(CHAVE_AGRUPAMENTO));
  } catch {
    return 'casas';
  }
}

function guardarAgrupamento(a: Agrupamento): void {
  try {
    window.localStorage.setItem(CHAVE_AGRUPAMENTO, a);
  } catch {
    // Sem localStorage: fica só para esta visita.
  }
}

// --- URL ------------------------------------------------------------------------------------------

const temJanela = typeof window !== 'undefined';

/** Marca, no history.state, a entrada que o botão "Reunião" acrescentou. */
export const MARCA_REUNIAO = 'mapaCmfReuniao';

/** A entrada atual do histórico foi acrescentada pelo botão "Reunião" (a anterior é a vista de onde se veio). */
export function entradaDaReuniao(estadoHistorico: unknown): boolean {
  return (
    typeof estadoHistorico === 'object' &&
    estadoHistorico !== null &&
    (estadoHistorico as Record<string, unknown>)[MARCA_REUNIAO] === true
  );
}

/** O history.state com ou sem a marca da reunião (o resto, de quem mais o use, fica como está). */
export function comMarcaReuniao(estadoHistorico: unknown, marcar: boolean): unknown {
  const base =
    typeof estadoHistorico === 'object' && estadoHistorico !== null
      ? { ...(estadoHistorico as Record<string, unknown>) }
      : null;
  if (marcar) return { ...(base ?? {}), [MARCA_REUNIAO]: true };
  if (!base || !(MARCA_REUNIAO in base)) return estadoHistorico;
  delete base[MARCA_REUNIAO];
  return base;
}

/**
 * Escreve o estado no URL (mantém o caminho e a query, ex.: ?erro-entrada=…). 'acrescentar-reuniao'
 * acrescenta a entrada marcada da reunião; as outras entradas acrescentadas nunca levam a marca.
 */
function escreverUrl(e: EstadoVista, modo: 'acrescentar' | 'acrescentar-reuniao' | 'substituir'): void {
  if (!temJanela) return;
  const hash = hashDe(e);
  if (hash === window.location.hash) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  const { history } = window;
  if (modo === 'substituir') history.replaceState(history.state, '', url);
  else history.pushState(comMarcaReuniao(history.state, modo === 'acrescentar-reuniao'), '', url);
}

/**
 * Sai da reunião no URL: se a entrada foi acrescentada pelo botão, volta atrás (a anterior já tem a vista
 * de onde se veio; o popstate que vem a seguir não muda nada); senão, substitui-a.
 */
function sairNoUrl(e: EstadoVista): void {
  if (!temJanela) return;
  if (entradaDaReuniao(window.history.state)) window.history.back();
  else escreverUrl(e, 'substituir');
}

// --- Loja -----------------------------------------------------------------------------------------

interface LojaVista extends EstadoVista {
  /** Vista onde se estava antes da reunião: é para lá que se volta ao sair. */
  vistaAntesDaReuniao: Vista;
  /** A reunião pediu o ecrã inteiro e o browser deu-o (sair do ecrã inteiro termina a reunião). */
  emEcraInteiro: boolean;
  agrupamento: Agrupamento;
  mudarVista: (vista: Vista) => void;
  definirAgrupamento: (agrupamento: Agrupamento) => void;
  /** Entra na reunião com o Quadro. Quem chama verifica primeiro se pode (ver reuniao.ts). */
  entrarReuniao: () => void;
  sairReuniao: () => void;
  definirEcraInteiro: (emEcraInteiro: boolean) => void;
  /** Põe o estado de acordo com o hash (Voltar/Avançar do browser, hash escrito à mão). */
  aplicarHash: (hash: string) => void;
}

const inicial = temJanela ? lerHash(window.location.hash) : ESTADO_INICIAL;

export const useVista = create<LojaVista>()((set, get) => ({
  ...inicial,
  vistaAntesDaReuniao: 'mapa',
  emEcraInteiro: false,
  agrupamento: temJanela ? carregarAgrupamento() : 'casas',

  mudarVista: (vista) => {
    const { reuniao } = get();
    const novo = normalizarEstado({ vista, reuniao });
    if (novo.vista === get().vista) return;
    set({ vista: novo.vista });
    escreverUrl(novo, reuniao ? 'substituir' : 'acrescentar');
  },
  definirAgrupamento: (agrupamento) => {
    set({ agrupamento });
    guardarAgrupamento(agrupamento);
  },
  entrarReuniao: () => {
    const { reuniao, vista } = get();
    if (reuniao) return;
    set({ reuniao: true, vista: 'quadro', vistaAntesDaReuniao: vista });
    escreverUrl({ vista: 'quadro', reuniao: true }, 'acrescentar-reuniao');
  },
  sairReuniao: () => {
    const { reuniao, vistaAntesDaReuniao } = get();
    if (!reuniao) return;
    set({ reuniao: false, vista: vistaAntesDaReuniao, emEcraInteiro: false });
    sairNoUrl({ vista: vistaAntesDaReuniao, reuniao: false });
  },
  definirEcraInteiro: (emEcraInteiro) => set({ emEcraInteiro }),
  aplicarHash: (hash) => {
    const e = lerHash(hash);
    const { reuniao, vista } = get();
    if (e.reuniao === reuniao && e.vista === vista) return;
    set({
      ...e,
      // Entrar na reunião pelo endereço: ao sair (ou se for recusada) volta-se à vista onde se estava.
      ...(e.reuniao && !reuniao ? { vistaAntesDaReuniao: vista } : {}),
      ...(!e.reuniao ? { emEcraInteiro: false } : {}),
    });
  },
}));

/** Acompanha o Voltar/Avançar do browser e o hash escrito à mão. Usar uma vez (App). */
export function useSincronizarVista(): void {
  useEffect(() => {
    const aoMudar = () => useVista.getState().aplicarHash(window.location.hash);
    window.addEventListener('popstate', aoMudar);
    window.addEventListener('hashchange', aoMudar);
    return () => {
      window.removeEventListener('popstate', aoMudar);
      window.removeEventListener('hashchange', aoMudar);
    };
  }, []);
}
