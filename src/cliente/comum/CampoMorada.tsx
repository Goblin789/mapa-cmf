// Morada e posição de um local (M2, docs/m2.md, "Obras" e "Geocodificação"): o país, o campo da morada,
// "Procurar" (geocodificarMorada, no servidor) com a lista de resultados, e um mini-mapa (Leaflet, ~200 px)
// onde se clica ou arrasta o pino; clicar pede a morada ao servidor (geocodificarPosicao). Funciona em
// todas as vistas (o mini-mapa está dentro do diálogo: nunca muda de vista). Serve a obra nova, o
// estacionamento e a morada de uma casa (ficha da casa).
// CONTRATO DO M2: o módulo Obras implementa (este ficheiro é dele); o módulo Fichas usa-o na ficha da casa.
//
// - Procurar: lista de resultados para escolher (o pino vai para lá; é também o caminho do teclado). Um
//   resultado com confiança abaixo de 0,8 pede para confirmar o pino. O erro do servidor (ex.: o serviço de
//   moradas não está ligado, 503) aparece com role=alert; o mini-mapa continua a servir.
// - Mini-mapa: os mosaicos do mapa grande, limitado a REGIAO_MAPA (maxBounds). Clicar ou arrastar o pino
//   muda a posição e pede a morada desse ponto: entra sozinha só se o campo estiver vazio (ou com a última
//   que o próprio campo lá pôs); senão fica como sugestão, com "Usar esta morada" (regras em morada.ts).
// - Fora da região do mapa não se põe o pino (aviso curto).
// - `moradaDoPinoAoAbrir` (obra nova vinda do "Nova obra aqui" do mapa): abre com pino e sem morada, por isso
//   pede logo a morada e o país desse ponto, como um clique no mini-mapa. Sem a resposta do serviço, o aviso
//   diz para confirmar o país (fica o que estava, o Luxemburgo por omissão).
// - `centroInicial` (ex.: o pino da obra, no estacionamento): sem pino, o mini-mapa abre ali, perto da rua,
//   e não no Luxemburgo inteiro.

import * as L from 'leaflet';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import type { ResultadoGeocodificacao } from '../../dominio/api';
import { dentroDaRegiao, LIMITES } from '../../dominio/campos';
import type { Pais } from '../../dominio/tipos';
import { BOTAO_PEQUENO } from '../edicao/classes';
import { geocodificarMorada, geocodificarPosicao } from '../estado/api';
import { ATRIBUICAO, LIMITES as LIMITES_MAPA, URL_MOSAICOS } from '../mapa/Mapa';
import { FOCO_VISIVEL } from '../paineis/classes';
import {
  arredondarCoordenada,
  limparMorada,
  moradaEntraSemPerguntar,
  NOMES_PAIS,
  pedirMoradaAoAbrir,
  precisaConfirmarPino,
  textoPosicao,
  type ValorMorada,
  vistaInicialMiniMapa,
  ZOOM_MINI_MAPA,
} from './morada';

export type { ValorMorada } from './morada';

const ZOOM_COM_PINO = ZOOM_MINI_MAPA.comPino;
/** Sem a morada do ponto o país não se sabe: fica o que estava, e diz-se para o confirmar. */
const CONFIRMA_PAIS = 'Confirma o país.';

/** O pino: uma gota escura com um ponto branco (divIcon: sem as imagens do Leaflet). */
const ICONE_PINO = L.divIcon({
  className: '',
  html: '<svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 33C13 33 2 20.5 2 12.5a11 11 0 0 1 22 0C24 20.5 13 33 13 33Z" fill="#0f172a" stroke="#ffffff" stroke-width="2"/><circle cx="13" cy="12.5" r="4.2" fill="#ffffff"/></svg>',
  iconSize: [26, 34],
  iconAnchor: [13, 33],
});

const ERRO_FORA_DA_REGIAO =
  'Esse sítio fica fora da região do mapa: escolhe um ponto no Luxemburgo ou à volta.';

function mensagemDoErro(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'O serviço de moradas não respondeu.';
}

export function CampoMorada({
  valor,
  aoMudar,
  rotulo = 'Morada',
  moradaDoPinoAoAbrir = false,
  centroInicial = null,
}: {
  valor: ValorMorada;
  aoMudar: (valor: ValorMorada) => void;
  rotulo?: string;
  /** Abre com pino e sem morada: pede logo a morada e o país desse ponto. */
  moradaDoPinoAoAbrir?: boolean;
  /** Sem pino, o mini-mapa abre aqui (ex.: o pino da obra, para o estacionamento). */
  centroInicial?: { lat: number; lng: number } | null;
}) {
  const idMorada = useId();
  const idPais = useId();
  const idAjuda = useId();
  const refMapa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const pino = useRef<L.Marker | null>(null);
  // O valor mais recente e quem avisar, para os ouvintes do Leaflet e as respostas que chegam depois.
  const atual = useRef(valor);
  atual.current = valor;
  const avisar = useRef(aoMudar);
  avisar.current = aoMudar;
  /** A última morada que o próprio campo escreveu (resultado escolhido ou morada do ponto). */
  const ultimaAutomatica = useRef<string | null>(null);
  /** Só conta a resposta do último pedido da morada de um ponto. */
  const pedidoInverso = useRef(0);
  /** Só ao montar: o mini-mapa cria-se uma vez. */
  const abertura = useRef({ moradaDoPinoAoAbrir, centroInicial });

  const [resultados, setResultados] = useState<ResultadoGeocodificacao[] | null>(null);
  const [aProcurar, setAProcurar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<ResultadoGeocodificacao | null>(null);
  const [confirmarPino, setConfirmarPino] = useState(false);

  /** Põe o pino (clique ou arrasto no mini-mapa) e pede a morada desse ponto. */
  const porPinoNoMapa = (lat: number, lng: number) => {
    if (!dentroDaRegiao(lat, lng)) {
      setAviso(ERRO_FORA_DA_REGIAO);
      // Arrastado para fora: volta ao sítio onde estava.
      const { lat: la, lng: ln } = atual.current;
      if (pino.current && la !== null && ln !== null) pino.current.setLatLng([la, ln]);
      return;
    }
    const novo = { ...atual.current, lat: arredondarCoordenada(lat), lng: arredondarCoordenada(lng) };
    setAviso(null);
    setConfirmarPino(false);
    setSugestao(null);
    // O sítio foi escolhido no mapa: a lista da procura já não interessa.
    setResultados(null);
    avisar.current(novo);
    pedirMoradaDoPonto(novo.lat, novo.lng);
  };
  const refPorPino = useRef(porPinoNoMapa);
  refPorPino.current = porPinoNoMapa;
  const refPedirMorada = useRef<(lat: number, lng: number) => void>(() => {});

  const pedirMoradaDoPonto = (lat: number, lng: number) => {
    const seq = ++pedidoInverso.current;
    geocodificarPosicao(lat, lng).then(
      (r) => {
        if (seq !== pedidoInverso.current) return;
        if (!r) {
          setAviso(
            `O serviço de moradas não conhece uma morada para este sítio: escreve-a, se quiseres. ${CONFIRMA_PAIS}`,
          );
          return;
        }
        const v = atual.current;
        if (moradaEntraSemPerguntar(v.morada, ultimaAutomatica.current)) {
          const morada = limparMorada(r.rotulo);
          ultimaAutomatica.current = morada;
          avisar.current({ ...v, morada, pais: r.pais });
        } else if (limparMorada(r.rotulo) !== limparMorada(v.morada)) {
          setSugestao(r);
        }
      },
      (e: unknown) => {
        if (seq !== pedidoInverso.current) return;
        // Sem a morada do ponto o pino fica na mesma: só se diz porquê, sem alarme.
        setAviso(`Sem morada para este sítio: ${mensagemDoErro(e)} ${CONFIRMA_PAIS}`);
      },
    );
  };

  refPedirMorada.current = pedirMoradaDoPonto;

  // Aberto com o pino já posto e sem morada (o "Nova obra aqui" do mapa): a morada e o país desse ponto.
  // Uma vez só (o modo estrito do React corre os efeitos duas vezes: cada pedido é um pedido ao serviço).
  const jaPediu = useRef(false);
  useEffect(() => {
    const v = atual.current;
    if (jaPediu.current || !pedirMoradaAoAbrir(v, abertura.current.moradaDoPinoAoAbrir)) return;
    jaPediu.current = true;
    refPedirMorada.current(v.lat, v.lng);
  }, []);

  // O mini-mapa: criado uma vez (o diálogo já está aberto quando os efeitos correm).
  useEffect(() => {
    const el = refMapa.current;
    if (!el) return;
    const m = L.map(el, {
      maxBounds: LIMITES_MAPA,
      maxBoundsViscosity: 1,
      minZoom: 8,
      maxZoom: 18,
      zoomSnap: 0.5,
      attributionControl: true,
      zoomControl: true,
    });
    L.tileLayer(URL_MOSAICOS, {
      attribution: ATRIBUICAO,
      maxNativeZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    const inicio = vistaInicialMiniMapa(atual.current, abertura.current.centroInicial);
    m.setView(inicio.centro, inicio.zoom, { animate: false });
    m.on('click', (e: L.LeafletMouseEvent) => refPorPino.current(e.latlng.lat, e.latlng.lng));
    mapa.current = m;
    // O diálogo pode ainda estar a ganhar tamanho: volta a medir quando o elemento muda.
    const observador = new ResizeObserver(() => m.invalidateSize({ debounceMoveend: true }));
    observador.observe(el);
    return () => {
      observador.disconnect();
      pino.current = null;
      mapa.current = null;
      m.remove();
    };
  }, []);

  // O pino segue o valor (resultado escolhido, pino arrastado, valor vindo de fora).
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const { lat, lng } = valor;
    if (lat === null || lng === null) {
      pino.current?.remove();
      pino.current = null;
      return;
    }
    if (pino.current) {
      const p = pino.current.getLatLng();
      if (p.lat !== lat || p.lng !== lng) pino.current.setLatLng([lat, lng]);
    } else {
      const novo = L.marker([lat, lng], {
        icon: ICONE_PINO,
        draggable: true,
        keyboard: false,
        title: 'Pino: arrasta para acertar o sítio',
        autoPan: true,
      }).addTo(m);
      novo.on('dragend', () => {
        const p = novo.getLatLng();
        refPorPino.current(p.lat, p.lng);
      });
      pino.current = novo;
    }
    if (!m.getBounds().pad(-0.1).contains([lat, lng])) {
      m.setView([lat, lng], Math.max(m.getZoom(), ZOOM_COM_PINO - 2), { animate: false });
    }
  }, [valor]);

  const procurar = async () => {
    const morada = limparMorada(valor.morada);
    setErro(null);
    setAviso(null);
    setSugestao(null);
    if (morada.length < 3) {
      setErro('Escreve a morada (rua, número e localidade) antes de procurar.');
      return;
    }
    setAProcurar(true);
    pedidoInverso.current++;
    try {
      const lista = await geocodificarMorada(morada, valor.pais);
      setResultados(lista);
    } catch (e) {
      setResultados(null);
      setErro(mensagemDoErro(e));
    } finally {
      setAProcurar(false);
    }
  };

  const escolher = (r: ResultadoGeocodificacao) => {
    if (!dentroDaRegiao(r.lat, r.lng)) {
      setErro(ERRO_FORA_DA_REGIAO);
      return;
    }
    const morada = limparMorada(r.rotulo);
    ultimaAutomatica.current = morada;
    setResultados(null);
    setErro(null);
    setAviso(null);
    setSugestao(null);
    setConfirmarPino(precisaConfirmarPino(r.confianca));
    avisar.current({
      morada,
      pais: r.pais,
      lat: arredondarCoordenada(r.lat),
      lng: arredondarCoordenada(r.lng),
    });
    mapa.current?.setView([r.lat, r.lng], ZOOM_COM_PINO, { animate: false });
  };

  const aoTeclarMorada = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // Enter procura (e não submete o formulário do diálogo).
    e.preventDefault();
    void procurar();
  };

  const comPino = valor.lat !== null && valor.lng !== null;
  return (
    <fieldset className="min-w-0 rounded-md border border-slate-200 p-2.5 text-sm">
      <legend className="px-1 text-xs font-semibold text-slate-700">{rotulo}</legend>
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={idPais} className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-600">País</span>
          <select
            id={idPais}
            value={valor.pais}
            onChange={(e) => {
              setResultados(null);
              aoMudar({ ...valor, pais: e.target.value as Pais });
            }}
            className={`h-9 rounded-md border border-slate-300 bg-white px-2 text-base sm:text-sm ${FOCO_VISIVEL}`}
          >
            {NOMES_PAIS.map(({ pais, nome }) => (
              <option key={pais} value={pais}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={idMorada} className="flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5">
          <span className="text-xs text-slate-600">Morada</span>
          <input
            id={idMorada}
            type="text"
            value={valor.morada}
            maxLength={LIMITES.textoLongo}
            autoComplete="off"
            aria-describedby={idAjuda}
            placeholder="Rua, número, código postal e localidade"
            onChange={(e) => aoMudar({ ...valor, morada: e.target.value })}
            onKeyDown={aoTeclarMorada}
            className={`h-9 w-full min-w-0 rounded-md border border-slate-300 px-2 text-base sm:text-sm ${FOCO_VISIVEL}`}
          />
        </label>
        <button
          type="button"
          onClick={() => void procurar()}
          disabled={aProcurar}
          className={`${BOTAO_PEQUENO} h-9 disabled:opacity-60`}
        >
          {aProcurar ? 'A procurar…' : 'Procurar'}
        </button>
      </div>

      {erro && (
        <p
          role="alert"
          className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-900"
        >
          {erro}
        </p>
      )}
      {resultados && (
        <div className="mt-2">
          <p role="status" className="text-xs text-slate-600">
            {resultados.length === 0
              ? 'Não se encontrou esta morada. Escolhe o sítio no mini-mapa.'
              : resultados.length === 1
                ? '1 resultado: escolhe-o para pôr o pino lá.'
                : `${resultados.length} resultados: escolhe o certo para pôr o pino lá.`}
          </p>
          {resultados.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {resultados.map((r) => (
                <li key={`${r.fonte}:${r.lat},${r.lng}:${r.rotulo}`}>
                  <button
                    type="button"
                    onClick={() => escolher(r)}
                    className={`w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-left hover:bg-slate-50 ${FOCO_VISIVEL}`}
                  >
                    <span className="block text-sm text-slate-900">{r.rotulo}</span>
                    <span className="block text-[11px] text-slate-500">
                      {r.fonte}
                      {precisaConfirmarPino(r.confianca) ? ' · aproximado' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        ref={refMapa}
        role="application"
        aria-label={`Mini-mapa de ${rotulo.toLowerCase()}: clica para pôr o pino, ou arrasta-o`}
        className="mapa-fundo-cinzento isolate mt-2 h-[200px] w-full overflow-hidden rounded-md border border-slate-300"
      />
      <p id={idAjuda} className="mt-1 text-xs text-slate-600">
        {comPino ? (
          <>
            Pino em {textoPosicao(valor.lat as number, valor.lng as number)}. Clica noutro sítio ou arrasta-o
            para acertar.
          </>
        ) : (
          'Sem pino: procura a morada ou clica no mini-mapa, no sítio certo.'
        )}
      </p>
      {confirmarPino && comPino && (
        <p
          role="status"
          className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900"
        >
          O resultado é aproximado: confirma o pino no mini-mapa (arrasta-o para o sítio certo, se for
          preciso).
        </p>
      )}
      {aviso && (
        <p role="status" className="mt-1 text-xs text-slate-700">
          {aviso}
        </p>
      )}
      {sugestao && (
        <div className="mt-1 flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-950">
          <span className="min-w-0 flex-1">
            Morada deste sítio: <strong className="font-semibold">{sugestao.rotulo}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              const morada = limparMorada(sugestao.rotulo);
              ultimaAutomatica.current = morada;
              setSugestao(null);
              aoMudar({ ...valor, morada, pais: sugestao.pais });
            }}
            className={BOTAO_PEQUENO}
          >
            Usar esta morada
          </button>
          <button type="button" onClick={() => setSugestao(null)} className={BOTAO_PEQUENO}>
            Manter a minha
          </button>
        </div>
      )}
    </fieldset>
  );
}
