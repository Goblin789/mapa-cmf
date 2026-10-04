// Legenda dos clientes, sobre o canto inferior esquerdo do mapa: uma lista com o nome e o nº de pessoas de
// cada cliente; no telemóvel fica recolhida atrás de um botão. Carregar num cliente deixa só esse cliente
// aceso (os cartões e o NomeChip apagam os outros); "Todos" volta a acender tudo. Mede a altura (a ficha do
// mapa acaba por cima dela). O Quadro tem os seus próprios filtros de clientes (04/10/2026), por isso a
// antiga legenda da barra do Quadro saiu.

import { useId, useState } from 'react';
import type { Cliente, Id } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { clientesPorOrdem, contagemDoCliente } from './agrupar';
import { FOCO_VISIVEL, Z_SOBRE_MAPA } from './classes';
import { medirLegenda } from './ganchos';
import { MarcaCliente } from './pecas';
import { comPlural } from './textos';

/** Clientes por ordem, o aceso (se houver) e as contagens. */
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

/** Lista de clientes (nome e nº de pessoas) e "Todos". */
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

export function Legenda() {
  const dados = useClientesLegenda();
  const [aberta, setAberta] = useState(false);
  const idConteudo = useId();
  if (!dados) return null;
  const { clienteAceso } = dados;

  return (
    <section
      ref={medirLegenda}
      data-legenda-mapa
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
