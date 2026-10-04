// Legenda dos clientes. Carregar num cliente deixa só esse cliente aceso (o NomeChip e o NomeVista apagam
// os outros); "Todos" volta a acender tudo. Dois lugares (docs/vistas-edicao.md):
// - 'mapa': sobre o canto inferior esquerdo do mapa, uma lista com o nome e o nº de pessoas de cada
//   cliente; no telemóvel fica recolhida atrás de um botão. Só esta mede a altura (a ficha do mapa acaba
//   por cima dela).
// - 'barra': dentro da barra de uma vista (Quadro). No PC uma linha compacta ("Clientes", uma marca por
//   cliente e "Todos" quando há um aceso); no telemóvel um botão "Clientes ▾" que abre a mesma lista do
//   mapa num popover (fecha ao carregar fora, com Esc ou quando a página desliza).

import { type RefObject, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Cliente, Id } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { clientesPorOrdem, contagemDoCliente } from './agrupar';
import { FOCO_VISIVEL, Z_POPOVER, Z_SOBRE_MAPA } from './classes';
import { medirLegenda, useFecharFora } from './ganchos';
import { MarcaCliente } from './pecas';
import { deslocamentoPopover } from './teclado';
import { comPlural } from './textos';

const LARGURA_POPOVER_PX = 240;

export function Legenda({ lugar = 'mapa' }: { lugar?: 'mapa' | 'barra' }) {
  return lugar === 'mapa' ? <LegendaMapa /> : <LegendaBarra />;
}

/** Clientes por ordem, o aceso (se houver) e as contagens: o mesmo nos dois lugares. */
function useClientesLegenda() {
  const estado = useLoja((s) => s.estado);
  const contadores = useLoja((s) => s.contadores);
  const destacado = useLoja((s) => s.clienteDestacado);
  const alternar = useLoja((s) => s.alternarClienteDestacado);
  if (!estado || !contadores) return null;
  const clientes = clientesPorOrdem(estado.clientes);
  return {
    clientes,
    destacado,
    alternar,
    clienteAceso: destacado ? (clientes.find((c) => c.id === destacado) ?? null) : null,
    n: (id: Id) => contagemDoCliente(contadores.pessoasPorCliente, id),
  };
}

function tituloCliente(c: Cliente, n: number, aceso: boolean): string {
  return aceso ? 'Voltar a mostrar todos' : `Mostrar só ${c.nome} (${comPlural(n, 'pessoa', 'pessoas')})`;
}

/** Lista de clientes (nome e nº de pessoas) e "Todos": a do mapa e a do popover da barra. */
function ListaClientes({ dados }: { dados: NonNullable<ReturnType<typeof useClientesLegenda>> }) {
  const { clientes, destacado, alternar, n } = dados;
  return (
    <>
      <ul className="flex flex-col gap-px">
        {clientes.map((c) => {
          const aceso = destacado === c.id;
          const apagado = destacado !== null && !aceso;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={aceso}
                title={tituloCliente(c, n(c.id), aceso)}
                onClick={() => alternar(c.id)}
                className={`flex w-full min-w-44 items-center gap-2 rounded border px-1.5 py-1 text-left ${FOCO_VISIVEL} ${
                  aceso
                    ? 'border-slate-900 bg-slate-100 font-semibold'
                    : 'border-transparent hover:bg-slate-100'
                } ${apagado ? 'opacity-50' : ''}`}
              >
                <MarcaCliente cliente={c} />
                <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                <span className="tabular-nums text-slate-700">{n(c.id)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        aria-pressed={destacado === null}
        title="Mostrar todos os clientes"
        onClick={() => {
          if (destacado) alternar(destacado);
        }}
        className={`mt-1 w-full rounded border px-1.5 py-1 text-center ${FOCO_VISIVEL} ${
          destacado === null
            ? 'border-slate-900 bg-slate-100 font-semibold'
            : 'border-slate-300 font-medium hover:bg-slate-100'
        }`}
      >
        Todos
      </button>
    </>
  );
}

function LegendaMapa() {
  const dados = useClientesLegenda();
  const [aberta, setAberta] = useState(false);
  const idConteudo = useId();
  if (!dados) return null;
  const { clienteAceso } = dados;

  return (
    <section
      ref={medirLegenda}
      aria-label="Legenda dos clientes"
      className={`absolute bottom-3 left-3 ${Z_SOBRE_MAPA} max-h-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-slate-300 bg-white/95 p-1.5 text-xs shadow-md`}
    >
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={idConteudo}
        onClick={() => setAberta(!aberta)}
        className={`flex items-center gap-1.5 rounded px-1.5 py-1 font-semibold md:hidden ${FOCO_VISIVEL}`}
      >
        Clientes
        {clienteAceso && (
          <>
            <MarcaCliente cliente={clienteAceso} />
            <span className="sr-only">(só {clienteAceso.nome} aceso)</span>
          </>
        )}
        <span aria-hidden="true" className="text-[10px] text-slate-500">
          {aberta ? '▾' : '▴'}
        </span>
      </button>
      <div id={idConteudo} className={aberta ? 'mt-1 md:mt-0' : 'hidden md:block'}>
        <h2 className="hidden px-1.5 pb-1 text-[11px] font-semibold tracking-wide text-slate-600 uppercase md:block">
          Clientes
        </h2>
        <ListaClientes dados={dados} />
      </div>
    </section>
  );
}

/**
 * Fecha também quando a página ou a vista desliza (o popover é fixo: ficava a flutuar fora do sítio).
 * Deslizar dentro do `contentor` (o próprio popover) não fecha. Também nos contadores compactos.
 */
export function useFecharAoDeslizar(
  aberto: boolean,
  contentor: RefObject<HTMLElement | null>,
  fechar: () => void,
) {
  useEffect(() => {
    if (!aberto) return;
    const aoDeslizar = (e: Event) => {
      if (e.target instanceof Node && contentor.current?.contains(e.target)) return;
      fechar();
    };
    window.addEventListener('scroll', aoDeslizar, true);
    window.addEventListener('resize', fechar);
    return () => {
      window.removeEventListener('scroll', aoDeslizar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [aberto, contentor, fechar]);
}

function LegendaBarra() {
  const dados = useClientesLegenda();
  const [aberta, setAberta] = useState(false);
  const [posicao, setPosicao] = useState({ top: 0, left: 0 });
  const contentor = useRef<HTMLElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const idPopover = useId();
  const fechar = useCallback(() => {
    if (popover.current?.contains(document.activeElement)) botao.current?.focus();
    setAberta(false);
  }, []);
  useFecharFora(aberta, contentor, fechar);
  useFecharAoDeslizar(aberta, contentor, fechar);
  if (!dados) return null;
  const { clientes, destacado, alternar, clienteAceso, n } = dados;

  return (
    <section ref={contentor} aria-label="Legenda dos clientes" className="relative min-w-0 text-xs">
      {/* Telemóvel: botão que abre a lista num popover. Fixo (e não absoluto) para a barra da vista o
          poder recortar ou deslizar sem o esconder. */}
      <button
        ref={botao}
        type="button"
        aria-expanded={aberta}
        aria-controls={idPopover}
        onClick={() => {
          if (!aberta) {
            const r = botao.current?.getBoundingClientRect();
            if (r)
              setPosicao({
                top: r.bottom + 4,
                left: r.left + deslocamentoPopover(r.left, LARGURA_POPOVER_PX, window.innerWidth),
              });
          }
          setAberta(!aberta);
        }}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 font-semibold md:hidden ${FOCO_VISIVEL} ${
          aberta ? 'border-slate-900 bg-slate-100' : 'border-slate-300 bg-white hover:bg-slate-50'
        }`}
      >
        Clientes
        {clienteAceso && (
          <>
            <MarcaCliente cliente={clienteAceso} />
            <span className="sr-only">(só {clienteAceso.nome} aceso)</span>
          </>
        )}
        <span aria-hidden="true" className="text-[10px] text-slate-500">
          {aberta ? '▴' : '▾'}
        </span>
      </button>
      <div
        ref={popover}
        id={idPopover}
        hidden={!aberta}
        style={{ top: posicao.top, left: posicao.left, width: LARGURA_POPOVER_PX }}
        className={`fixed ${Z_POPOVER} max-h-[60svh] overflow-y-auto rounded-md border border-slate-300 bg-white p-1.5 shadow-lg md:hidden`}
      >
        <ListaClientes dados={dados} />
      </div>

      {/* PC: uma linha compacta com a marca (sigla) de cada cliente. */}
      <div className="hidden flex-wrap items-center gap-1 md:flex">
        <span className="mr-0.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">
          Clientes
        </span>
        <ul className="flex flex-wrap items-center gap-1">
          {clientes.map((c) => {
            const aceso = destacado === c.id;
            const apagado = destacado !== null && !aceso;
            return (
              <li key={c.id} className="flex">
                <button
                  type="button"
                  aria-pressed={aceso}
                  aria-label={`${c.nome} (${comPlural(n(c.id), 'pessoa', 'pessoas')})`}
                  title={tituloCliente(c, n(c.id), aceso)}
                  onClick={() => alternar(c.id)}
                  className={`grid h-7 place-items-center rounded border px-1 ${FOCO_VISIVEL} ${
                    aceso
                      ? 'border-slate-900 bg-slate-100 ring-1 ring-slate-900'
                      : 'border-transparent hover:bg-slate-100'
                  } ${apagado ? 'opacity-40 hover:opacity-100' : ''}`}
                >
                  <MarcaCliente cliente={c} />
                </button>
              </li>
            );
          })}
        </ul>
        {clienteAceso && (
          <button
            type="button"
            title="Mostrar todos os clientes"
            onClick={() => alternar(clienteAceso.id)}
            className={`h-7 rounded border border-slate-300 bg-white px-2 font-medium hover:bg-slate-100 ${FOCO_VISIVEL}`}
          >
            Todos
          </button>
        )}
      </div>
    </section>
  );
}
