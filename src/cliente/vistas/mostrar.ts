// "Mostrar" uma pessoa, casa, carrinha ou (M2) obra SEM mudar de vista (docs/vistas-edicao.md). Quem pede (pesquisa
// do cabeçalho, ligações da ficha) chama mostrarElemento: põe o elemento em foco (a ficha abre na vista ativa) e leva a vista
// ativa até lá.
// - Mapa: com noMapa 'ir' (pesquisa) pede ao mapa para ir até lá, como sempre; com 'so-foco'
//   (ligações da ficha) só muda o foco, como sempre. O Mapa fica exatamente como estava.
// - Tabela e Quadro: deixam um pedido (usePedidoMostrar) que a vista ativa atende com useAoMostrar:
//   desliza até ao elemento e realça-o por instantes (revelarElementos).
// Ir ao Mapa é só com o botão explícito "Ver no mapa" (navegar.ts: verNoMapa).
//
// Cada vista marca no DOM o que se pode mostrar com data-elemento="pessoa:<id>" | "casa:<id>" |
// "carrinha:<id>" | "obra:<id>" (chaveElemento; o bloco da obra no Quadro por obras). No Mapa, a obra vai
// para o sítio dela (destinoNoMapa). O realce de instantes é o atributo data-realce (CSS em estilos.css).
// Ao deslizar, o elemento fica fora da ficha da vista (data-ficha="vista"): por cima dela no telemóvel
// (onde a ficha ocupa a parte de baixo) e, no PC, por cima ou por baixo dela quando lhe fica atrás.

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { type Foco, useLoja } from '../estado/loja';
import { destinoNoMapa, ZOOM_DESTINO } from '../paineis/fichas';
import { useVista } from './vista';

/** Pessoa, casa, carrinha ou obra que se quer mostrar. */
export type ElementoVista = NonNullable<Foco>;

/** Atributo que marca, numa vista, o sítio de um elemento (o valor é chaveElemento). */
export const ATRIBUTO_ELEMENTO = 'data-elemento';
/** Posto por revelarElementos durante DURACAO_REALCE_MS: o elemento acende (ver estilos.css). */
export const ATRIBUTO_REALCE = 'data-realce';
export const DURACAO_REALCE_MS = 1600;

/** "pessoa:<id>", "casa:<id>", "carrinha:<id>", "obra:<id>". */
export function chaveElemento(elemento: ElementoVista): string {
  return `${elemento.tipo}:${elemento.id}`;
}

/** Seletor CSS dos elementos com estas chaves (aspas e barras escapadas: funciona sem o CSS.escape). */
export function seletorElementos(chaves: readonly string[]): string {
  return chaves
    .map((c) => `[${ATRIBUTO_ELEMENTO}="${c.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`)
    .join(',');
}

export interface PedidoMostrar {
  elemento: ElementoVista;
  /** Muda a cada pedido, para a vista reagir mesmo que o elemento seja o mesmo. */
  seq: number;
}

export const usePedidoMostrar = create<{
  pedido: PedidoMostrar | null;
  pedir: (elemento: ElementoVista) => void;
}>()((set, get) => ({
  pedido: null,
  pedir: (elemento) => set({ pedido: { elemento, seq: (get().pedido?.seq ?? 0) + 1 } }),
}));

/** No Mapa: 'ir' leva o mapa até lá (pesquisa); 'so-foco' só muda o foco (ligações da ficha). */
export type ComportamentoNoMapa = 'ir' | 'so-foco';

/** Põe o elemento em foco e leva a vista ativa até ele, sem mudar de vista. */
export function mostrarElemento(
  elemento: ElementoVista,
  { noMapa = 'so-foco' }: { noMapa?: ComportamentoNoMapa } = {},
): void {
  const { definirFoco, pedirIrPara, indices, dormidas } = useLoja.getState();
  definirFoco(elemento);
  if (useVista.getState().vista === 'mapa') {
    if (noMapa !== 'ir' || !indices || !dormidas) return;
    const destino = destinoNoMapa(elemento, indices, dormidas);
    if (destino) pedirIrPara(destino.lat, destino.lng, ZOOM_DESTINO);
    return;
  }
  usePedidoMostrar.getState().pedir(elemento);
}

/**
 * Depois de um clique num nome DENTRO da ficha da vista (moradores, passageiros: são NomeChip, que só
 * mudam o foco): se a pessoa ficou em foco, a vista leva-se até ela, como as outras ligações da ficha.
 * Não faz nada no Mapa nem se o clique tirou o foco (ou só mexeu na seleção sem a pôr em foco).
 * Devolve true se deixou o pedido.
 */
export function seguirPessoaEmFoco(pessoaId: string): boolean {
  const { foco } = useLoja.getState();
  if (foco?.tipo !== 'pessoa' || foco.id !== pessoaId) return false;
  if (useVista.getState().vista === 'mapa') return false;
  usePedidoMostrar.getState().pedir(foco);
  return true;
}

/**
 * A vista (Tabela, Quadro) atende os pedidos feitos DEPOIS de montar: `aoMostrar` recebe o elemento
 * (ex.: tira os filtros que o escondem e chama revelarDepoisDeDesenhar). Só a vista ativa está montada.
 */
export function useAoMostrar(aoMostrar: (elemento: ElementoVista) => void): void {
  const atual = useRef(aoMostrar);
  atual.current = aoMostrar;
  useEffect(() => {
    let visto = usePedidoMostrar.getState().pedido?.seq ?? 0;
    return usePedidoMostrar.subscribe((s) => {
      const p = s.pedido;
      if (!p || p.seq === visto) return;
      visto = p.seq;
      atual.current(p.elemento);
    });
  }, []);
}

const temporizadores = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** Atributo da ficha montada numa vista (PainelFoco lugar="vista"): o que se mostra não fica atrás dela. */
export const ATRIBUTO_FICHA = 'data-ficha';

/** Retângulo no ecrã (o que interessa de um DOMRect). */
export interface Retangulo {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Folga entre o elemento e a borda da zona livre (px): não fica colado à ficha nem ao cabeçalho fixo. */
const FOLGA_PX = 16;

/** Abaixo disto (px) a faixa ao lado da ficha não serve: centra-se no contentor, como sem ficha. */
const FAIXA_MINIMA_PX = 64;

/**
 * Quanto deslizar (scrollTop) o contentor para o elemento ficar na parte que a ficha não tapa: a faixa
 * por cima ou por baixo da ficha (a maior), quando a ficha está na mesma coluna que o elemento. Ao centro
 * da faixa se couber; se não, com o topo no topo da faixa (vê-se o título do bloco).
 * null = não há ficha no caminho ou a faixa é pequena demais: basta centrá-lo no contentor.
 */
export function deslocamentoForaDaFicha(
  elemento: Retangulo,
  contentor: Retangulo,
  ficha: Retangulo | null,
): number | null {
  if (!ficha || ficha.left >= elemento.right || ficha.right <= elemento.left) return null;
  const acima = { top: contentor.top, bottom: Math.max(contentor.top, ficha.top) };
  const abaixo = { top: Math.min(contentor.bottom, ficha.bottom), bottom: contentor.bottom };
  const faixa = acima.bottom - acima.top >= abaixo.bottom - abaixo.top ? acima : abaixo;
  const alturaFaixa = faixa.bottom - faixa.top;
  if (alturaFaixa < FAIXA_MINIMA_PX) return null;
  const altura = elemento.bottom - elemento.top;
  if (alturaFaixa < altura + 2 * FOLGA_PX) return Math.round(elemento.top - (faixa.top + FOLGA_PX));
  return Math.round((elemento.top + elemento.bottom) / 2 - (faixa.top + faixa.bottom) / 2);
}

/** O primeiro antepassado que desliza na vertical (o contentor da vista). */
function contentorQueDesliza(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Leva o elemento ao centro do que se vê, sem ficar atrás da ficha da vista. */
function deslizarAte(el: HTMLElement, suave: boolean): void {
  const comportamento: ScrollBehavior = suave ? 'smooth' : 'auto';
  const contentor = contentorQueDesliza(el);
  const ficha = document.querySelector<HTMLElement>(`[${ATRIBUTO_FICHA}="vista"]`);
  // (Uma ficha escondida tem o retângulo vazio: não está no caminho.)
  // Uma linha da Tabela vai de ponta a ponta e cruzava sempre a ficha (no PC, à direita): conta a 1.ª
  // célula (presa à esquerda, com o nome), que é o que interessa ver; no telemóvel a ficha ocupa a largura
  // toda e a linha continua a ir para cima dela.
  const referencia = el instanceof HTMLTableRowElement ? (el.cells[0] ?? el) : el;
  const delta =
    contentor && ficha
      ? deslocamentoForaDaFicha(
          referencia.getBoundingClientRect(),
          contentor.getBoundingClientRect(),
          ficha.getBoundingClientRect(),
        )
      : null;
  if (contentor && delta !== null) {
    contentor.scrollBy({ top: delta, behavior: comportamento });
    return;
  }
  referencia.scrollIntoView({ block: 'center', inline: 'nearest', behavior: comportamento });
}

/**
 * Desliza até ao primeiro elemento com uma destas chaves (ao centro, fora da ficha) e realça-os a todos
 * por instantes. Sem movimento suave com prefers-reduced-motion. Devolve false se nenhum estiver no ecrã
 * (ex.: escondido por um filtro).
 * O realce é logo; o deslizar espera dois fotogramas: quem chama acabou de pôr o elemento em foco, e só
 * depois de o React desenhar é que a ficha (e o espaço que a vista lhe guarda) tem o tamanho certo.
 */
export function revelarElementos(raiz: ParentNode, chaves: readonly string[]): boolean {
  if (chaves.length === 0) return false;
  const seletor = seletorElementos(chaves);
  const elementos = [...raiz.querySelectorAll<HTMLElement>(seletor)];
  const [primeiro] = elementos;
  if (!primeiro) return false;
  const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      // Se o React trocou o elemento entretanto, procura-se outra vez.
      const alvo = primeiro.isConnected ? primeiro : raiz.querySelector<HTMLElement>(seletor);
      if (alvo) deslizarAte(alvo, !reduzir);
    }),
  );
  for (const el of elementos) {
    const anterior = temporizadores.get(el);
    if (anterior !== undefined) clearTimeout(anterior);
    // Tirar e voltar a pôr recomeça a animação (o offsetWidth obriga o browser a reparar).
    el.removeAttribute(ATRIBUTO_REALCE);
    void el.offsetWidth;
    el.setAttribute(ATRIBUTO_REALCE, '');
    temporizadores.set(
      el,
      setTimeout(() => {
        el.removeAttribute(ATRIBUTO_REALCE);
        temporizadores.delete(el);
      }, DURACAO_REALCE_MS),
    );
  }
  return true;
}

/** revelarElementos depois de o React desenhar (ex.: a seguir a limpar os filtros). */
export function revelarDepoisDeDesenhar(raiz: () => ParentNode | null, chaves: readonly string[]): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const r = raiz();
      if (r) revelarElementos(r, chaves);
    }),
  );
}
