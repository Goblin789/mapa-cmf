// O mapa no modo de edição:
// - enquanto se arrasta um nome (motor em arrastar/), o mapa não se desloca nem faz zoom com o dedo ou
//   duplo clique, e desliza sozinho quando o ponteiro chega perto da borda (um arrasto no Quadro ou na
//   Tabela, com o mapa escondido, não lhe toca);
// - Shift+arrastar no fundo do mapa desenha uma caixa e seleciona os nomes que ela toca
//   (o boxZoom do Leaflet está desligado). Fora do modo de edição não faz nada.
// - M2: clique direito (ou toque longo: o Chrome do Android dá um "contextmenu"; no Safari do iPhone é o
//   tapHold do Leaflet que o simula) no fundo do mapa abre um menu pequeno, "Nova obra aqui" (useMenuNovaObra).
//   Só no modo de edição, fora da reunião, nunca num cartão nem a meio de um arrasto, e só dentro da região
//   do mapa (REGIAO_MAPA). Fora disto o clique direito fica o do browser.

import type * as L from 'leaflet';
import { type RefObject, useCallback, useEffect, useState } from 'react';
import { dentroDaRegiao } from '../../dominio/campos';
import { velocidadeBorda } from '../arrastar/deslizar';
import { registarOuvintesArrasto } from '../arrastar/ouvintes';
import { arredondarCoordenada } from '../comum/morada';
import { useLoja } from '../estado/loja';
import { useVista } from '../vistas/vista';
import type { CamadaCartoes } from './CamadaCartoes';
import { eCaixa, idsNaCaixa, retanguloEntre } from './caixaSelecao';

/** Faixa junto à borda do mapa (px) onde ele começa a deslizar durante um arrasto. */
const MARGEM_BORDA = 40;
/** Velocidade máxima do deslize (px por quadro). */
const VELOCIDADE_BORDA = 14;

interface Instancia {
  mapa: L.Map;
  camada: CamadaCartoes;
}

function dentro(x: number, y: number, r: DOMRect): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** Liga o mapa ao motor de arrastar: trava o deslocamento e desliza perto da borda. */
export function useArrastoNoMapa(instancia: Instancia | null) {
  useEffect(() => {
    if (!instancia) return;
    const { mapa } = instancia;
    let ponteiro: { x: number; y: number } | null = null;
    let quadro = 0;
    let travado = false;
    // Fora do Mapa (Tabela, Quadro) o mapa continua montado mas escondido e inerte (o App põe-lhe inert):
    // um arrasto na vista não o pode deslocar nem travar.
    const escondido = () => mapa.getContainer().closest('[inert]') !== null;

    const deslizar = () => {
      quadro = 0;
      if (!ponteiro || escondido()) return;
      const r = mapa.getContainer().getBoundingClientRect();
      if (!dentro(ponteiro.x, ponteiro.y, r)) return;
      const vx = velocidadeBorda(ponteiro.x, r.left, r.right, MARGEM_BORDA, VELOCIDADE_BORDA);
      const vy = velocidadeBorda(ponteiro.y, r.top, r.bottom, MARGEM_BORDA, VELOCIDADE_BORDA);
      if (vx === 0 && vy === 0) return;
      mapa.panBy([vx, vy], { animate: false });
      quadro = requestAnimationFrame(deslizar);
    };

    const travar = (travado: boolean) => {
      for (const h of [mapa.dragging, mapa.touchZoom, mapa.doubleClickZoom]) {
        if (travado) h.disable();
        else h.enable();
      }
    };

    const retirar = registarOuvintesArrasto({
      aoComecar: () => {
        if (escondido()) return;
        travado = true;
        travar(true);
      },
      aoMover: (x, y) => {
        if (escondido()) return;
        ponteiro = { x, y };
        if (!quadro) quadro = requestAnimationFrame(deslizar);
      },
      aoTerminar: () => {
        ponteiro = null;
        cancelAnimationFrame(quadro);
        quadro = 0;
        // Só destrava o que travou (um arrasto que começou noutra vista não lhe tocou).
        if (travado) travar(false);
        travado = false;
      },
    });
    return () => {
      retirar();
      cancelAnimationFrame(quadro);
    };
  }, [instancia]);
}

/** Shift+arrastar no fundo do mapa (modo de edição): caixa de seleção. */
export function useCaixaSelecao(instancia: Instancia | null, refCaixa: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!instancia) return;
    const { mapa, camada } = instancia;
    const contentor = mapa.getContainer();
    let inicio: { x: number; y: number } | null = null;
    let ponteiroId = -1;
    let ignorarClique = false;

    const desenhar = (fim: { x: number; y: number } | null) => {
      const caixa = refCaixa.current;
      if (!caixa) return;
      if (!inicio || !fim) {
        caixa.style.display = 'none';
        return;
      }
      const base = contentor.getBoundingClientRect();
      const r = retanguloEntre(inicio, fim);
      caixa.style.display = 'block';
      caixa.style.left = `${r.x - base.left}px`;
      caixa.style.top = `${r.y - base.top}px`;
      caixa.style.width = `${r.largura}px`;
      caixa.style.height = `${r.altura}px`;
    };

    const aoMover = (e: PointerEvent) => {
      if (e.pointerId !== ponteiroId) return;
      desenhar({ x: e.clientX, y: e.clientY });
    };

    const terminar = (e: PointerEvent, selecionar: boolean) => {
      if (e.pointerId !== ponteiroId || !inicio) return;
      const r = retanguloEntre(inicio, { x: e.clientX, y: e.clientY });
      inicio = null;
      ponteiroId = -1;
      desenhar(null);
      window.removeEventListener('pointermove', aoMover, true);
      window.removeEventListener('pointerup', aoLargar, true);
      window.removeEventListener('pointercancel', aoCancelar, true);
      if (!selecionar || !eCaixa(r)) return;
      ignorarClique = true;
      const elementos = [...camada.contentor.querySelectorAll<HTMLElement>('[data-pessoa-id]')].map((el) => {
        const b = el.getBoundingClientRect();
        return {
          id: el.dataset.pessoaId as string,
          retangulo: { x: b.left, y: b.top, largura: b.width, altura: b.height },
        };
      });
      useLoja.getState().definirSelecao(idsNaCaixa(r, elementos));
    };
    const aoLargar = (e: PointerEvent) => terminar(e, true);
    const aoCancelar = (e: PointerEvent) => terminar(e, false);

    const aoPremir = (e: PointerEvent) => {
      ignorarClique = false;
      if (!e.shiftKey || e.button !== 0 || !useLoja.getState().modoEdicao) return;
      const alvo = e.target as Element | null;
      // Só no fundo do mapa: nem nos cartões nem nos controlos do Leaflet.
      if (camada.contem(alvo) || alvo?.closest?.('.leaflet-control')) return;
      // Cancelar o pointerdown impede o mousedown que faria o Leaflet deslocar o mapa.
      e.preventDefault();
      e.stopPropagation();
      inicio = { x: e.clientX, y: e.clientY };
      ponteiroId = e.pointerId;
      desenhar(inicio);
      window.addEventListener('pointermove', aoMover, true);
      window.addEventListener('pointerup', aoLargar, true);
      window.addEventListener('pointercancel', aoCancelar, true);
    };

    // O clique que fecha a caixa não é um clique no fundo do mapa (não tira o foco).
    const aoClicar = (e: MouseEvent) => {
      if (!ignorarClique) return;
      ignorarClique = false;
      e.stopPropagation();
    };

    contentor.addEventListener('pointerdown', aoPremir, true);
    contentor.addEventListener('click', aoClicar, true);
    return () => {
      contentor.removeEventListener('pointerdown', aoPremir, true);
      contentor.removeEventListener('click', aoClicar, true);
      window.removeEventListener('pointermove', aoMover, true);
      window.removeEventListener('pointerup', aoLargar, true);
      window.removeEventListener('pointercancel', aoCancelar, true);
    };
  }, [instancia, refCaixa]);
}

/** O menu "Nova obra aqui": onde abre (píxeis dentro do mapa) e o ponto do mapa. */
export interface MenuNovaObra {
  x: number;
  y: number;
  lat: number;
  lng: number;
}

/**
 * Se o clique direito (ou toque longo) no mapa deve oferecer "Nova obra aqui": modo de edição, fora da
 * reunião, mapa visível, nada a ser arrastado, no fundo (não num cartão nem num controlo) e dentro de
 * REGIAO_MAPA. Pura, para se testar.
 */
export function ofereceNovaObra(c: {
  modoEdicao: boolean;
  reuniao: boolean;
  escondido: boolean;
  aArrastar: boolean;
  noFundo: boolean;
  lat: number;
  lng: number;
}): boolean {
  return (
    c.modoEdicao && !c.reuniao && !c.escondido && !c.aArrastar && c.noFundo && dentroDaRegiao(c.lat, c.lng)
  );
}

/**
 * Clique direito / toque longo no fundo do mapa (modo de edição): o menu "Nova obra aqui". Devolve o menu
 * aberto (ou null) e a função que o fecha. Fecha sozinho quando o mapa mexe, com um clique no mapa, ao sair
 * do modo de edição e ao entrar na reunião.
 */
export function useMenuNovaObra(instancia: Instancia | null): [MenuNovaObra | null, () => void] {
  const [menu, setMenu] = useState<MenuNovaObra | null>(null);
  const fechar = useCallback(() => setMenu(null), []);
  useEffect(() => {
    if (!instancia) return;
    const { mapa, camada } = instancia;
    const contentor = mapa.getContainer();
    let aArrastar = false;
    const retirar = registarOuvintesArrasto({
      aoComecar: () => {
        aArrastar = true;
        setMenu(null);
      },
      aoTerminar: () => {
        aArrastar = false;
      },
    });
    const aoMenu = (e: MouseEvent) => {
      const alvo = e.target instanceof Element ? e.target : null;
      const latlng = mapa.mouseEventToLatLng(e);
      const oferece = ofereceNovaObra({
        modoEdicao: useLoja.getState().modoEdicao,
        reuniao: useVista.getState().reuniao,
        escondido: contentor.closest('[inert]') !== null,
        aArrastar,
        noFundo: !camada.contem(alvo) && !alvo?.closest('.leaflet-control'),
        lat: latlng.lat,
        lng: latlng.lng,
      });
      if (!oferece) {
        setMenu(null);
        return;
      }
      e.preventDefault();
      const ponto = mapa.mouseEventToContainerPoint(e);
      setMenu({
        x: ponto.x,
        y: ponto.y,
        lat: arredondarCoordenada(latlng.lat),
        lng: arredondarCoordenada(latlng.lng),
      });
    };
    const fecharMenu = () => setMenu(null);
    contentor.addEventListener('contextmenu', aoMenu);
    mapa.on('movestart zoomstart click', fecharMenu);
    const desligar = useLoja.subscribe((s, antes) => {
      if (antes.modoEdicao && !s.modoEdicao) setMenu(null);
    });
    const desligarVista = useVista.subscribe((s) => {
      if (s.reuniao || s.vista !== 'mapa') setMenu(null);
    });
    return () => {
      retirar();
      desligar();
      desligarVista();
      contentor.removeEventListener('contextmenu', aoMenu);
      mapa.off('movestart zoomstart click', fecharMenu);
    };
  }, [instancia]);
  return [menu, fechar];
}
