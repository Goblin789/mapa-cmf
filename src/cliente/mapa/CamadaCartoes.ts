// Camada do Leaflet onde o React desenha os cartões (via createPortal no `contentor`).
// Não usa marcadores: tem um pane próprio e guarda a "vista" (zoom, origem dos píxeis, tamanho) que o
// React lê com useSyncExternalStore. A vista só muda no fim de um zoom, num viewreset ou num resize;
// deslocar o mapa não muda nada (o pane anda com o mapa).
//
// Cliques: o Leaflet ouve no contentor nativo do mapa, antes do React (que ouve na raiz da página).
// Por isso não se pode parar a propagação aqui (o React deixava de receber o clique). Em vez disso:
// - o Mapa ignora o clique no fundo quando o alvo está dentro deste contentor (ver `contem`);
// - depois de arrastar o mapa a partir de um cartão, o clique que o browser ainda gera é parado
//   aqui, na fase de captura (não chega ao React nem ao Leaflet); o Enter/Espaço do teclado passa
//   sempre (ver cliques.ts);
// - o duplo clique num cartão não chega ao mapa (não faz zoom).
// O mousedown e a roda continuam a chegar ao mapa: arrastar a partir de um cartão desloca o mapa e a
// roda por cima dos cartões faz zoom.

import * as L from 'leaflet';
import { eCliqueDeArrastar } from './cliques';

export interface VistaMapa {
  zoom: number;
  /** Origem dos píxeis do Leaflet: o ponto do mundo que fica no canto (0, 0) do plano das camadas. */
  origem: { x: number; y: number };
  /** Tamanho do mapa no ecrã. */
  largura: number;
  altura: number;
  /** Há um zoom em curso (animação, pinça ou voo): os cartões escondem-se até acabar. */
  aAnimar: boolean;
}

export const PANE_CARTOES = 'cartoes';
const Z_INDEX_PANE = '450';

export class CamadaCartoes extends L.Layer {
  readonly contentor: HTMLDivElement;
  private vista: VistaMapa | null = null;
  private readonly ouvintes = new Set<() => void>();

  constructor() {
    super();
    // leaflet-zoom-hide: o próprio Leaflet esconde-o durante a animação de zoom (antes do 1.º render).
    this.contentor = L.DomUtil.create('div', 'leaflet-zoom-hide');
    this.contentor.style.position = 'absolute';
    this.contentor.style.left = '0';
    this.contentor.style.top = '0';
  }

  override onAdd(mapa: L.Map): this {
    const pane = mapa.getPane(PANE_CARTOES) ?? mapa.createPane(PANE_CARTOES);
    pane.style.zIndex = Z_INDEX_PANE;
    pane.appendChild(this.contentor);
    this.contentor.addEventListener('click', this.aoClicarCaptura, true);
    L.DomEvent.on(this.contentor, 'dblclick', L.DomEvent.stopPropagation);
    this.atualizar(false);
    return this;
  }

  override onRemove(): this {
    this.contentor.removeEventListener('click', this.aoClicarCaptura, true);
    L.DomEvent.off(this.contentor, 'dblclick', L.DomEvent.stopPropagation);
    this.contentor.remove();
    this.vista = null;
    this.avisar();
    return this;
  }

  override getEvents() {
    return {
      zoomstart: this.aoComecarZoom,
      zoomend: this.aoMudarVista,
      moveend: this.aoMudarVista,
      viewreset: this.aoMudarVista,
      resize: this.aoMudarVista,
    };
  }

  /** O elemento (ex.: alvo de um clique) está dentro de um cartão. */
  contem(elemento: EventTarget | null): boolean {
    return elemento instanceof Node && this.contentor.contains(elemento);
  }

  // Para o useSyncExternalStore: funções estáveis (não dependem de `this` na chamada).
  readonly subscrever = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  };

  readonly obterVista = (): VistaMapa | null => this.vista;

  private aoComecarZoom() {
    if (this.vista && !this.vista.aAnimar) {
      this.vista = { ...this.vista, aAnimar: true };
      this.avisar();
    }
  }

  private aoMudarVista() {
    this.atualizar(false);
  }

  private readonly aoClicarCaptura = (e: MouseEvent) => {
    // Clique que fecha um arrastamento do mapa: não é um clique num cartão.
    // (O Map.Drag tem moved(), mas os tipos do Leaflet só conhecem o Handler genérico.)
    const arrastar = this._map?.dragging as (L.Handler & { moved?: () => boolean }) | undefined;
    if (eCliqueDeArrastar(e.detail, arrastar?.moved?.() ?? false)) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  private atualizar(aAnimar: boolean) {
    const mapa = this._map;
    if (!mapa) return;
    const origem = mapa.getPixelOrigin();
    const tamanho = mapa.getSize();
    const nova: VistaMapa = {
      zoom: mapa.getZoom(),
      origem: { x: origem.x, y: origem.y },
      largura: tamanho.x,
      altura: tamanho.y,
      aAnimar,
    };
    const v = this.vista;
    if (
      v &&
      v.zoom === nova.zoom &&
      v.origem.x === nova.origem.x &&
      v.origem.y === nova.origem.y &&
      v.largura === nova.largura &&
      v.altura === nova.altura &&
      v.aAnimar === nova.aAnimar
    ) {
      return;
    }
    this.vista = nova;
    this.avisar();
  }

  private avisar() {
    for (const ouvinte of this.ouvintes) ouvinte();
  }
}
