// O rascunho (alterações por guardar) quando a sessão termina a meio do trabalho.
//
// A app fica montada e o rascunho continua em memória, mas a entrada abre num separador NOVO e, no
// telemóvel, o browser pode descartar este entretanto (e fechá-lo no seletor de separadores nem dispara
// o beforeunload). Por isso, mal a sessão termina, o rascunho vai também para o localStorage, com o mesmo
// registo que o Guardar usa quando dá 401 (estado/loja.ts e tempoReal/rascunhoPendente.ts): marcado como
// deste separador, que vai dizendo que continua aberto. Se a página fechar, o primeiro carregamento
// depois de entrar recupera-o; se este separador voltar com a sessão, a loja apaga o registo (o rascunho
// em memória é que conta). Fica em nome de quem tinha a sessão: outra conta não o recupera.
//
// Se depois entrar OUTRA conta e se escolher continuar com ela, o rascunho sai desta página mas o registo
// fica no browser, largado (sem separador), para quando o dono voltar a entrar.

import { type Loja, reversoesDoRascunho, SEPARADOR, useLoja } from '../estado/loja';
import {
  type Armazenamento,
  armazenamentoLocal,
  guardarRascunhoPendente,
  INTERVALO_VIVO_MS,
  largar,
  marcarVivo,
  type RascunhoPendente,
  type ReversaoPendente,
} from '../tempoReal/rascunhoPendente';

/**
 * - 'sem-rascunho': não havia alterações por guardar;
 * - 'guardado': também está no localStorage (sobrevive a fechar a página);
 * - 'so-em-memoria': o browser não deixou guardar (modo privado, cheio): só existe nesta página.
 */
export type ProtecaoRascunho = 'sem-rascunho' | 'guardado' | 'so-em-memoria';

type LojaRascunho = Pick<Loja, 'modoEdicao' | 'passos' | 'pendentes' | 'estadoServidor' | 'cancelarEdicao'>;

export interface DependenciasRascunho {
  loja?: LojaRascunho;
  armazenamento?: Armazenamento | null;
  agora?: number;
  separador?: string;
  /** As reversões do rascunho (por omissão, as da loja: `reversoesDoRascunho()`). */
  reversoes?: readonly ReversaoPendente[];
}

/**
 * O registo a guardar para o rascunho da loja; null se não há alterações por guardar. Leva as reversões
 * dos passos que ainda estão no rascunho (M2), para o rascunho recuperado voltar com o `reverte` e o lote
 * aparecer depois como "Revertida". O mesmo registo que a loja escreve depois de um Guardar com 401.
 */
export function registoDoRascunho(
  loja: Omit<LojaRascunho, 'cancelarEdicao'>,
  autor: string | null,
  agora: number,
  separador: string,
  reversoes: readonly ReversaoPendente[] = [],
): RascunhoPendente | null {
  if (!loja.modoEdicao || loja.pendentes.length === 0 || !loja.estadoServidor) return null;
  const doRascunho = reversoes
    .filter((r) => r.passo < loja.passos.length)
    .map((r) => ({ ...r, chaves: [...r.chaves] }));
  return {
    passos: loja.passos,
    versaoBase: loja.estadoServidor.versao,
    data: new Date(agora).toISOString(),
    autor,
    separador,
    vivoEm: agora,
    ...(doRascunho.length > 0 ? { reversoes: doRascunho } : {}),
  };
}

let temporizadorVivo: ReturnType<typeof setInterval> | null = null;

function pararVivo(): void {
  if (temporizadorVivo === null) return;
  clearInterval(temporizadorVivo);
  temporizadorVivo = null;
}

/**
 * Vai dizendo que este separador continua aberto, para o separador novo (onde se entra) não ficar com
 * uma cópia do mesmo rascunho. Pára sozinho quando o registo deixa de ser deste separador (gravado,
 * cancelado, recuperado, largado). A loja faz o mesmo depois de um Guardar com 401: são idempotentes.
 */
function manterVivo(armazenamento: Armazenamento | null, separador: string): void {
  pararVivo();
  temporizadorVivo = setInterval(() => {
    if (!marcarVivo(armazenamento, separador, Date.now())) pararVivo();
  }, INTERVALO_VIVO_MS);
}

/** A sessão terminou: guarda já o rascunho no localStorage, em nome de `autor` (quem tinha a sessão). */
export function protegerRascunho(autor: string | null, deps: DependenciasRascunho = {}): ProtecaoRascunho {
  const {
    loja = useLoja.getState(),
    armazenamento = armazenamentoLocal(),
    agora = Date.now(),
    separador = SEPARADOR,
    reversoes = reversoesDoRascunho(),
  } = deps;
  const registo = registoDoRascunho(loja, autor, agora, separador, reversoes);
  if (!registo) return 'sem-rascunho';
  if (!guardarRascunhoPendente(armazenamento, registo)) return 'so-em-memoria';
  manterVivo(armazenamento, separador);
  return 'guardado';
}

/**
 * Entrou outra conta e continua-se com ela: o rascunho (da conta anterior) sai desta página, mas o
 * registo no localStorage fica largado, para o dono o recuperar quando voltar a entrar neste browser.
 * Sem registo (o browser não deixou guardar), as alterações perdem-se: o aviso já o disse.
 */
export function porDeParteRascunhoDaContaAnterior(deps: DependenciasRascunho = {}): void {
  const { loja = useLoja.getState(), armazenamento = armazenamentoLocal(), separador = SEPARADOR } = deps;
  pararVivo();
  // Largado (sem separador): o cancelarEdicao só apaga o registo se for deste separador.
  largar(armazenamento, separador);
  loja.cancelarEdicao();
}
