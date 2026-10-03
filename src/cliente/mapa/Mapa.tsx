// Mapa do ecrã principal (M0: só leitura). Leaflet puro, criado uma vez (com limpeza correta para o
// StrictMode, que monta duas vezes). Os cartões são uma camada própria (CamadaCartoes) desenhada pelo
// React com createPortal; as posições vêm das funções puras de layout/.

import * as L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLoja } from '../estado/loja';
import { CamadaCartoes } from './CamadaCartoes';
import { CartoesNoMapa } from './CartoesNoMapa';
import { DocaCarrinhas } from './DocaCarrinhas';
import { centroParaIrPara, enquadrarTudo, type Margens } from './layout/enquadramento';
import { type GrupoNoMapa, montarModelo } from './layout/grupos';
import { LARGURA_ESTREITA, nivelDetalhe } from './layout/niveis';
import { useVistaMapa } from './useVistaMapa';

/** Só o Luxemburgo e arredores (França, Bélgica, Alemanha). */
const LIMITES: L.LatLngBoundsLiteral = [
  [49.15, 5.3],
  [50.35, 6.95],
];
const ZOOM_MINIMO = 9;
const ZOOM_MAXIMO = 17;
/** A vista inicial nunca aproxima mais do que isto, mesmo que caiba. */
const ZOOM_MAXIMO_INICIAL = 14;
const PASSO_ZOOM = 0.25;
const CENTRO_OMISSAO: L.LatLngTuple = [49.65, 6.13];
const ZOOM_OMISSAO = 10;

const URL_MOSAICOS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUICAO = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Espaço livre à volta na vista inicial (em cima fica o título da doca). */
function margensIniciais(largura: number): Margens {
  return largura < LARGURA_ESTREITA
    ? { cima: 40, baixo: 8, esquerda: 8, direita: 8 }
    : { cima: 40, baixo: 16, esquerda: 16, direita: 16 };
}

/** Enquadra todos os cartões (já arrumados) no mapa. Devolve false se não houver nada para enquadrar. */
function aplicarVistaInicial(mapa: L.Map, grupos: readonly GrupoNoMapa[]): boolean {
  const tamanho = mapa.getSize();
  const e = enquadrarTudo(grupos, {
    largura: tamanho.x,
    altura: tamanho.y,
    zoomMinimo: ZOOM_MINIMO,
    zoomMaximo: ZOOM_MAXIMO_INICIAL,
    passo: PASSO_ZOOM,
    margem: margensIniciais(tamanho.x),
  });
  if (!e) return false;
  mapa.setView([e.centro.lat, e.centro.lng], e.zoom, { animate: false });
  return true;
}

function modeloAtual() {
  const { estado, indices, dormidas } = useLoja.getState();
  return estado && indices && dormidas ? montarModelo(estado, indices, dormidas) : null;
}

interface Instancia {
  mapa: L.Map;
  camada: CamadaCartoes;
}

export function Mapa() {
  const refElemento = useRef<HTMLDivElement>(null);
  const [instancia, setInstancia] = useState<Instancia | null>(null);
  /** O mapa (instância) que já recebeu a vista inicial com os dados. */
  const enquadradoPara = useRef<L.Map | null>(null);

  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const dormidas = useLoja((s) => s.dormidas);
  const irPara = useLoja((s) => s.irPara);
  const ultimoIrPara = useRef(irPara?.seq ?? 0);

  const modelo = useMemo(
    () => (estado && indices && dormidas ? montarModelo(estado, indices, dormidas) : null),
    [estado, indices, dormidas],
  );
  const vista = useVistaMapa(instancia?.camada ?? null);

  // Criar o mapa uma vez (e destruí-lo ao desmontar).
  useEffect(() => {
    const elemento = refElemento.current;
    if (!elemento) return;

    const mapa = L.map(elemento, {
      zoomControl: false,
      boxZoom: false, // Shift+arrastar fica para a caixa de seleção (M2).
      minZoom: ZOOM_MINIMO,
      maxZoom: ZOOM_MAXIMO,
      maxBounds: LIMITES,
      maxBoundsViscosity: 1,
      zoomSnap: PASSO_ZOOM,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
    });
    L.tileLayer(URL_MOSAICOS, {
      attribution: ATRIBUICAO,
      maxNativeZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(mapa);
    L.control
      .zoom({ position: 'bottomright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' })
      .addTo(mapa);
    mapa.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

    const m = modeloAtual();
    if (m && aplicarVistaInicial(mapa, m.grupos)) enquadradoPara.current = mapa;
    else mapa.setView(CENTRO_OMISSAO, ZOOM_OMISSAO, { animate: false });

    const camada = new CamadaCartoes().addTo(mapa);

    // Clicar no fundo do mapa tira o foco (os cliques nos cartões não contam).
    mapa.on('click', (e: L.LeafletMouseEvent) => {
      if (camada.contem(e.originalEvent.target)) return;
      useLoja.getState().definirFoco(null);
    });

    // O <main> pode mudar de tamanho sem a janela mudar (painéis à volta).
    let pedido = 0;
    const observador = new ResizeObserver(() => {
      cancelAnimationFrame(pedido);
      pedido = requestAnimationFrame(() => mapa.invalidateSize({ debounceMoveend: true }));
    });
    observador.observe(elemento);

    setInstancia({ mapa, camada });
    return () => {
      cancelAnimationFrame(pedido);
      observador.disconnect();
      mapa.remove();
      setInstancia(null);
    };
  }, []);

  // Se os dados só chegarem depois de o mapa existir, enquadra-os uma vez.
  useEffect(() => {
    if (!instancia || !modelo || enquadradoPara.current === instancia.mapa) return;
    if (aplicarVistaInicial(instancia.mapa, modelo.grupos)) enquadradoPara.current = instancia.mapa;
  }, [instancia, modelo]);

  // Pedidos de "ir para" (pesquisa, painéis): voa até lá. Se o ponto for um local com cartão,
  // centra no cartão (que pode estar afastado do local).
  useEffect(() => {
    if (!instancia || !irPara || irPara.seq === ultimoIrPara.current) return;
    ultimoIrPara.current = irPara.seq;
    const { mapa } = instancia;
    const zoom = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, irPara.zoom ?? mapa.getZoom()));
    const largura = mapa.getSize().x;
    const destino = modelo
      ? centroParaIrPara(
          modelo.grupos,
          { lat: irPara.lat, lng: irPara.lng },
          zoom,
          nivelDetalhe(zoom, largura),
          useLoja.getState().expandidos,
        )
      : { lat: irPara.lat, lng: irPara.lng };
    mapa.flyTo([destino.lat, destino.lng], zoom, { duration: 0.8 });
  }, [instancia, irPara, modelo]);

  const nivel = vista ? nivelDetalhe(vista.zoom, vista.largura) : 'lugares';

  return (
    <>
      {/* isolate: os z-index do Leaflet (até 1000) ficam cá dentro; os painéis por cima do mapa não têm de os vencer. */}
      <div ref={refElemento} className="mapa-fundo-cinzento absolute inset-0 isolate" />
      {instancia &&
        modelo &&
        createPortal(<CartoesNoMapa camada={instancia.camada} modelo={modelo} />, instancia.camada.contentor)}
      {modelo && <DocaCarrinhas modelo={modelo} nivel={nivel} />}
    </>
  );
}
