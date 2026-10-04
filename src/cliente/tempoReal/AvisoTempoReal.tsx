// Avisos do tempo real, em baixo sobre o mapa, num sítio que não tape a legenda, o painel de foco, os
// controlos do mapa nem o aviso curto do modo de edição (ver posicao.ts):
// - "Michael Exemplo gravou 3 alterações." — empilhados (no máximo 3), somem ao fim de 8 s (o tempo pára
//   enquanto o rato ou o foco estão lá, e com a página escondida: quem estava noutro separador ou com o
//   telemóvel bloqueado ainda o vê ao voltar), com botão para fechar;
// - "Recuperámos N alterações que não chegaram a ser guardadas…" (ou que outro separador ficou com elas) —
//   fica até se fechar, guardar ou cancelar;
// - "Sem ligação em tempo real. A tentar outra vez…" — discreto, some quando a ligação volta.
// Uma só região role="status" aria-live="polite", sempre presente (os leitores de ecrã só anunciam o que
// muda dentro de uma região que já existia).

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { useAvisosTempoReal } from './avisos';
import { DURACAO_AVISO_MS } from './decisoes';
import { type Posicao, posicaoAvisos, type Retangulo } from './posicao';

/**
 * De quanto em quanto tempo se volta a medir enquanto há avisos à vista e a página está visível (um painel
 * pode abrir sozinho). Depois de um clique ou de uma tecla mede-se logo a seguir.
 */
const MEDIR_CADA_MS = 1000;

function paginaVisivel(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/** A página está à vista (false noutro separador, minimizada, ou com o ecrã do telemóvel bloqueado). */
function usePaginaVisivel(): boolean {
  const [visivel, setVisivel] = useState(paginaVisivel);
  useEffect(() => {
    const atualizar = () => setVisivel(paginaVisivel());
    document.addEventListener('visibilitychange', atualizar);
    return () => document.removeEventListener('visibilitychange', atualizar);
  }, []);
  return visivel;
}

function IconeFechar() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** Duas setas em círculo: os dados mudaram. */
function IconeAtualizado() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 6.5A5 5 0 0 0 4 4.2L2.8 5.5" />
      <path d="M2.8 2.8v2.7h2.7" />
      <path d="M3 9.5a5 5 0 0 0 9 2.3l1.2-1.3" />
      <path d="M13.2 13.2v-2.7h-2.7" />
    </svg>
  );
}

const CARTAO =
  'pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border py-1.5 pr-1 pl-3 text-sm leading-snug text-[#1C1C1B] shadow-lg sm:py-2 sm:pr-1.5';

const BOTAO_FECHAR = `-my-0.5 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded text-[var(--cmf-cinzento)] hover:bg-black/5 hover:text-[#1C1C1B] ${FOCO_VISIVEL}`;

function BotaoFechar({ aoFechar }: { aoFechar: () => void }) {
  return (
    <button type="button" onClick={aoFechar} className={BOTAO_FECHAR} title="Fechar aviso">
      <IconeFechar />
      <span className="sr-only">Fechar aviso</span>
    </button>
  );
}

/**
 * Um aviso "X gravou N alterações.": some sozinho, mas não enquanto o rato ou o foco estão nele nem com a
 * página escondida (ao voltar, conta outra vez do início).
 */
function AvisoLote({ id, texto }: { id: number; texto: string }) {
  const retirar = useAvisosTempoReal((s) => s.retirar);
  const [parado, setParado] = useState(false);
  const visivel = usePaginaVisivel();
  useEffect(() => {
    if (parado || !visivel) return;
    const t = window.setTimeout(() => retirar(id), DURACAO_AVISO_MS);
    return () => window.clearTimeout(t);
  }, [id, parado, visivel, retirar]);
  return (
    <li
      className={`${CARTAO} border-[var(--cmf-linha)] bg-white`}
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setParado(false);
      }}
    >
      <span className="mt-0.5 text-[var(--cmf-laranja-texto)]">
        <IconeAtualizado />
      </span>
      <p className="min-w-0 flex-1 py-px">{texto}</p>
      <BotaoFechar aoFechar={() => retirar(id)} />
    </li>
  );
}

/** "Recuperámos N alterações…" (ou "…recuperadas noutro separador"): fica até se fechar, guardar ou cancelar. */
function AvisoRascunho({ texto }: { texto: string }) {
  const dispensar = useLoja((s) => s.dispensarAvisoRascunho);
  return (
    <li className={`${CARTAO} border-[var(--cmf-laranja-texto)] bg-[#FFF4E5]`}>
      <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--cmf-laranja)]" />
      <p className="min-w-0 flex-1 py-px font-medium">{texto}</p>
      <BotaoFechar aoFechar={dispensar} />
    </li>
  );
}

function retangulo(el: Element): Retangulo | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= window.innerHeight) return null;
  return { esquerda: r.left, topo: r.top, direita: r.right, fundo: r.bottom };
}

/** Mede o ecrã e calcula onde a pilha fica. */
function medir(pilha: HTMLElement): Posicao {
  const mapa = document.querySelector('main');
  const elementos: Element[] = [];
  if (mapa) {
    // Legenda e painel de foco; camadas e carrinhas sem local (dentro da coluna do canto superior
    // direito, que é toda ela transparente aos cliques); zoom e atribuição do Leaflet.
    elementos.push(
      ...mapa.querySelectorAll(
        ':scope > section, :scope > div.pointer-events-none > .pointer-events-auto, .leaflet-control',
      ),
    );
  }
  // Outros avisos à vista (o aviso curto do modo de edição), menos estes.
  for (const el of document.querySelectorAll('[role="status"]')) {
    if (!pilha.contains(el) && !el.classList.contains('sr-only')) elementos.push(el);
  }
  const obstaculos = elementos.map(retangulo).filter((r): r is Retangulo => r !== null);

  let topoMinimo = 0;
  for (const el of document.querySelectorAll('header, [data-barra-edicao]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > topoMinimo) topoMinimo = r.bottom;
  }

  const largura = document.documentElement.clientWidth;
  const r = mapa?.getBoundingClientRect();
  const faixa =
    r && r.width > 0
      ? { esquerda: Math.max(0, r.left), direita: Math.min(largura, r.right) }
      : { esquerda: 0, direita: largura };

  return posicaoAvisos({
    alturaJanela: window.innerHeight,
    faixa,
    obstaculos,
    altura: pilha.offsetHeight,
    topoMinimo,
  });
}

function iguais(a: Posicao | null, b: Posicao): boolean {
  return a !== null && a.esquerda === b.esquerda && a.largura === b.largura && a.fundo === b.fundo;
}

/**
 * Posição da pilha enquanto há avisos: mede logo (antes de pintar), ao rolar, ao redimensionar, a seguir a
 * um clique ou a uma tecla (podem abrir a ficha ou a legenda) e de segundo a segundo. Com a página escondida
 * não mede (um "Sem ligação" de uma hora não gasta a bateria do telemóvel); ao voltar mede logo.
 */
function usePosicao(pilha: RefObject<HTMLElement | null>, conteudo: string): Posicao | null {
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  useLayoutEffect(() => {
    if (!conteudo) return;
    const atualizar = () => {
      if (!pilha.current || !paginaVisivel()) return;
      const nova = medir(pilha.current);
      setPosicao((antiga) => (iguais(antiga, nova) ? antiga : nova));
    };
    let pedido: number | null = null;
    const noProximoQuadro = () => {
      if (pedido !== null) return;
      pedido = window.requestAnimationFrame(() => {
        pedido = null;
        atualizar();
      });
    };
    atualizar();
    const temporizador = window.setInterval(atualizar, MEDIR_CADA_MS);
    const opcoes = { passive: true, capture: true } as const;
    window.addEventListener('resize', atualizar);
    window.addEventListener('scroll', atualizar, opcoes);
    window.addEventListener('pointerup', noProximoQuadro, opcoes);
    window.addEventListener('keyup', noProximoQuadro, opcoes);
    document.addEventListener('visibilitychange', atualizar);
    return () => {
      window.clearInterval(temporizador);
      if (pedido !== null) window.cancelAnimationFrame(pedido);
      window.removeEventListener('resize', atualizar);
      window.removeEventListener('scroll', atualizar, { capture: true });
      window.removeEventListener('pointerup', noProximoQuadro, { capture: true });
      window.removeEventListener('keyup', noProximoQuadro, { capture: true });
      document.removeEventListener('visibilitychange', atualizar);
    };
  }, [pilha, conteudo]);
  return posicao;
}

export function AvisoTempoReal() {
  const avisos = useAvisosTempoReal((s) => s.avisos);
  const semLigacao = useAvisosTempoReal((s) => s.semLigacao);
  const rascunho = useLoja((s) => s.avisoRascunhoRecuperado);
  const pilha = useRef<HTMLDivElement>(null);
  // Muda sempre que o que se mostra muda (e a altura da pilha com ele); vazio = nada à vista.
  const conteudo = [
    ...(rascunho ? [rascunho] : []),
    ...avisos.map((a) => String(a.id)),
    ...(semLigacao ? ['sem-ligacao'] : []),
  ].join('|');
  const posicao = usePosicao(pilha, conteudo);

  return (
    <div
      ref={pilha}
      role="status"
      aria-live="polite"
      // Por baixo dos popovers do cabeçalho (1100), por cima do mapa, do contorno e da barra de edição.
      className="pointer-events-none fixed z-[1090] flex flex-col items-center gap-2"
      style={
        posicao
          ? {
              left: posicao.esquerda,
              width: posicao.largura,
              bottom: `calc(${posicao.fundo}px + env(safe-area-inset-bottom, 0px))`,
            }
          : { left: 12, right: 12, bottom: 12 }
      }
    >
      {(rascunho || avisos.length > 0) && (
        <ul className="flex w-full flex-col gap-2">
          {rascunho && <AvisoRascunho texto={rascunho} />}
          {avisos.map((a) => (
            <AvisoLote key={a.id} id={a.id} texto={a.texto} />
          ))}
        </ul>
      )}
      {semLigacao && (
        <p className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-[var(--cmf-linha)] bg-white/95 px-3 py-1 text-xs text-[#1C1C1B] shadow-sm">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse bg-[var(--cmf-laranja)]"
          />
          Sem ligação em tempo real. A tentar outra vez…
        </p>
      )}
    </div>
  );
}
