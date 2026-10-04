// Mapa do ecrã principal. Leaflet puro, criado uma vez (com limpeza correta para o StrictMode, que
// monta duas vezes). Os cartões são uma camada própria (CamadaCartoes) desenhada pelo React com
// createPortal; as posições vêm das funções puras de layout/ (calculadas aqui, para o zoom e o tamanho
// atuais, com as camadas ligadas e o rascunho do modo de edição já aplicado ao estado).
// No canto superior direito: as camadas (Casas, Carrinhas, Obras) e a doca das carrinhas sem local.
// M2: o mapa não deixa ir para fora de REGIAO_MAPA (a mesma região onde se podem pôr pinos) e, no modo de
// edição, o clique direito (ou toque longo) no fundo abre "Nova obra aqui" (interacoesEdicao.ts).

import * as L from 'leaflet';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REGIAO_MAPA } from '../../dominio/campos';
import { abrirObra } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { IconeObra } from '../lista/icones';
import { FOCO_VISIVEL } from '../paineis/classes';
import { CamadaCartoes } from './CamadaCartoes';
import { CartoesNoMapa } from './CartoesNoMapa';
import { ControloCamadas } from './ControloCamadas';
import { DocaCarrinhas } from './DocaCarrinhas';
import { type MenuNovaObra, useArrastoNoMapa, useCaixaSelecao, useMenuNovaObra } from './interacoesEdicao';
import { type Disposicao, disporMapa } from './layout/disposicao';
import { centroParaIrPara, enquadrarTudo, type Margens } from './layout/enquadramento';
import { LARGURA_ESTREITA } from './layout/escala';
import { type GrupoNoMapa, montarModelo } from './layout/grupos';
import { useVistaMapa } from './useVistaMapa';
import { continuaAutomatica, type VistaAutomatica } from './vistaAutomatica';

/**
 * Só o Luxemburgo e arredores (França, Bélgica, Alemanha): REGIAO_MAPA, a mesma região onde se podem pôr
 * pinos (o mini-mapa da morada usa-a também). Nunca se cria um pino onde o mapa não deixa ir.
 */
export const LIMITES: L.LatLngBoundsLiteral = [
  [REGIAO_MAPA.sul, REGIAO_MAPA.oeste],
  [REGIAO_MAPA.norte, REGIAO_MAPA.leste],
];
const ZOOM_MINIMO = 9;
const ZOOM_MAXIMO = 17;
/** A vista inicial nunca aproxima mais do que isto, mesmo que caiba. */
const ZOOM_MAXIMO_INICIAL = 14;
const PASSO_ZOOM = 0.25;
const CENTRO_OMISSAO: L.LatLngTuple = [49.65, 6.13];
const ZOOM_OMISSAO = 10;

export const URL_MOSAICOS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ATRIBUICAO = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Espaço livre à volta na vista inicial (em cima à direita ficam as camadas). */
function margensIniciais(largura: number): Margens {
  return largura < LARGURA_ESTREITA
    ? { cima: 44, baixo: 8, esquerda: 8, direita: 8 }
    : { cima: 14, baixo: 12, esquerda: 12, direita: 12 };
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
  const { estado, indices, dormidas, camadas } = useLoja.getState();
  return estado && indices && dormidas ? montarModelo(estado, indices, dormidas, camadas) : null;
}

interface Instancia {
  mapa: L.Map;
  camada: CamadaCartoes;
}

export function Mapa() {
  const refElemento = useRef<HTMLDivElement>(null);
  const refCaixa = useRef<HTMLDivElement>(null);
  const [instancia, setInstancia] = useState<Instancia | null>(null);
  const vistaAutomatica = useRef<VistaAutomatica | null>(null);

  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const dormidas = useLoja((s) => s.dormidas);
  const camadas = useLoja((s) => s.camadas);
  const expandidos = useLoja((s) => s.expandidos);
  const irPara = useLoja((s) => s.irPara);
  const ultimoIrPara = useRef(irPara?.seq ?? 0);

  const modelo = useMemo(
    () => (estado && indices && dormidas ? montarModelo(estado, indices, dormidas, camadas) : null),
    [estado, indices, dormidas, camadas],
  );
  const vista = useVistaMapa(instancia?.camada ?? null);
  const zoom = vista?.zoom ?? null;
  const largura = vista?.largura ?? 0;
  const altura = vista?.altura ?? 0;
  const modoEdicao = useLoja((s) => s.modoEdicao);
  // A disposição que está no ecrã.
  const noEcra = useRef<Disposicao | null>(null);
  const disposicao = useMemo(() => {
    if (!modelo || zoom === null) return null;
    // No modo de edição, os blocos que não mudaram ficam onde estavam (no mesmo zoom): nem a barra da
    // edição (o mapa fica mais baixo) nem largar alguém numa casa cheia (a casa cresce uma linha) fazem
    // saltar o resto do mapa. Fora dele (e ao guardar ou cancelar), a disposição é a normal.
    const anterior = modoEdicao ? noEcra.current : null;
    return disporMapa(modelo.grupos, {
      zoom,
      larguraMapa: largura,
      alturaMapa: altura,
      expandidos,
      anterior,
    });
  }, [modelo, zoom, largura, altura, expandidos, modoEdicao]);
  useEffect(() => {
    noEcra.current = disposicao;
  }, [disposicao]);

  const enquadrar = (mapa: L.Map, grupos: readonly GrupoNoMapa[]): boolean => {
    if (!aplicarVistaInicial(mapa, grupos)) return false;
    vistaAutomatica.current = { mapa, zoom: mapa.getZoom(), centro: mapa.getCenter() };
    return true;
  };
  const refEnquadrar = useRef(enquadrar);
  refEnquadrar.current = enquadrar;

  // Criar o mapa uma vez (e destruí-lo ao desmontar).
  useEffect(() => {
    const elemento = refElemento.current;
    if (!elemento) return;

    const mapa = L.map(elemento, {
      zoomControl: false,
      boxZoom: false, // Shift+arrastar é a caixa de seleção do modo de edição.
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
    if (!m || !refEnquadrar.current(mapa, m.grupos))
      mapa.setView(CENTRO_OMISSAO, ZOOM_OMISSAO, { animate: false });

    const camada = new CamadaCartoes().addTo(mapa);

    // Clicar no fundo do mapa tira o foco (os cliques nos cartões não contam).
    mapa.on('click', (e: L.LeafletMouseEvent) => {
      if (camada.contem(e.originalEvent.target)) return;
      useLoja.getState().definirFoco(null);
    });

    // O <main> pode mudar de tamanho sem a janela mudar (painéis à volta). Se a vista ainda é a do
    // enquadramento automático (ou o mapa nasceu sem tamanho e nunca foi enquadrado), volta a enquadrar
    // para o novo tamanho.
    let pedido = 0;
    const observador = new ResizeObserver(() => {
      cancelAnimationFrame(pedido);
      pedido = requestAnimationFrame(() => {
        const automatica = continuaAutomatica(vistaAutomatica.current, mapa);
        mapa.invalidateSize({ debounceMoveend: true });
        const m = automatica ? modeloAtual() : null;
        if (m) refEnquadrar.current(mapa, m.grupos);
      });
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

  // Se os dados só chegarem depois de o mapa existir, enquadra-os uma vez. Ao ligar/desligar camadas,
  // volta a enquadrar se o utilizador ainda não mexeu no mapa desde o último enquadramento.
  const temModelo = modelo !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: só reage aos dados chegarem e às camadas.
  useEffect(() => {
    if (!instancia || !temModelo) return;
    const m = modeloAtual();
    if (!m) return;
    if (continuaAutomatica(vistaAutomatica.current, instancia.mapa))
      refEnquadrar.current(instancia.mapa, m.grupos);
  }, [instancia, temModelo, camadas]);

  // Pedidos de "ir para" (pesquisa, painéis): voa até lá. Se o ponto for um local com cartões, centra
  // no bloco e no ponto (o bloco fica ao lado do local).
  useEffect(() => {
    if (!instancia || !irPara || irPara.seq === ultimoIrPara.current) return;
    ultimoIrPara.current = irPara.seq;
    const { mapa } = instancia;
    const z = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, irPara.zoom ?? mapa.getZoom()));
    const tamanho = mapa.getSize();
    const destino = modelo
      ? centroParaIrPara(
          modelo.grupos,
          { lat: irPara.lat, lng: irPara.lng },
          z,
          { largura: tamanho.x, altura: tamanho.y },
          useLoja.getState().expandidos,
        )
      : { lat: irPara.lat, lng: irPara.lng };
    mapa.flyTo([destino.lat, destino.lng], z, { duration: 0.8 });
  }, [instancia, irPara, modelo]);

  useArrastoNoMapa(instancia);
  useCaixaSelecao(instancia, refCaixa);
  const [menuNovaObra, fecharMenuNovaObra] = useMenuNovaObra(instancia);

  return (
    <>
      {/* isolate: os z-index do Leaflet (até 1000) ficam cá dentro; os painéis por cima do mapa não têm de os vencer. */}
      <div ref={refElemento} className="mapa-fundo-cinzento absolute inset-0 isolate" />
      <div
        ref={refCaixa}
        aria-hidden="true"
        className="pointer-events-none absolute z-10 hidden rounded-sm border-2 border-blue-600 bg-blue-500/10"
      />
      {menuNovaObra && (
        <MenuNovaObraAqui
          menu={menuNovaObra}
          largura={largura}
          altura={altura}
          aoFechar={fecharMenuNovaObra}
        />
      )}
      {instancia &&
        createPortal(
          <CartoesNoMapa camada={instancia.camada} disposicao={disposicao} />,
          instancia.camada.contentor,
        )}
      <div className="pointer-events-none absolute top-2 right-2 bottom-24 z-10 flex max-w-[calc(100%-1rem)] flex-col items-end gap-2">
        <div className="pointer-events-auto">
          <ControloCamadas />
        </div>
        {modelo && (
          <div className="pointer-events-auto flex min-h-0 max-w-full flex-col">
            <DocaCarrinhas modelo={modelo} />
          </div>
        )}
      </div>
    </>
  );
}

/** Largura e altura (px) do menu "Nova obra aqui", para não sair do mapa. */
const LARGURA_MENU = 176;
const ALTURA_MENU = 44;

/**
 * Menu pequeno do clique direito / toque longo no fundo do mapa (modo de edição): "Nova obra aqui" abre o
 * diálogo da obra nova com o pino nesse ponto. Esc, sair dele (Tab, clicar fora) ou mexer no mapa fecham-no.
 */
function MenuNovaObraAqui({
  menu,
  largura,
  altura,
  aoFechar,
}: {
  menu: MenuNovaObra;
  largura: number;
  altura: number;
  aoFechar: () => void;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    botao.current?.focus();
  }, []);
  const x = Math.max(4, Math.min(menu.x, (largura || menu.x + LARGURA_MENU) - LARGURA_MENU - 4));
  const y = Math.max(4, Math.min(menu.y, (altura || menu.y + ALTURA_MENU) - ALTURA_MENU - 4));
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    aoFechar();
  };
  return (
    <div
      role="menu"
      aria-label="Neste sítio do mapa"
      onKeyDown={aoTeclar}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) aoFechar();
      }}
      className="absolute z-20 rounded-md border border-slate-300 bg-white p-1 shadow-lg"
      style={{ left: x, top: y, width: LARGURA_MENU }}
    >
      <button
        ref={botao}
        type="button"
        role="menuitem"
        onClick={() => {
          aoFechar();
          abrirObra(null, { lat: menu.lat, lng: menu.lng });
        }}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-slate-900 hover:bg-slate-100 ${FOCO_VISIVEL}`}
      >
        <IconeObra className="size-4 text-amber-700" />
        Nova obra aqui
      </button>
    </div>
  );
}
