// Barra da lista lateral: "ver por" (Casas, Carrinhas, Obras, Clientes), filtros (nome, a confirmar,
// clientes), abrir/recolher tudo e alargar o painel.

import type { ReactNode } from 'react';
import type { Cliente, Id } from '../../dominio/tipos';
import { FOCO_VISIVEL } from '../paineis/classes';
import { IconeLargura, IconeLupa, IconeRecolher } from './icones';
import { type Filtros, VISTAS, type Vista } from './seccoes';

interface Props {
  vista: Vista;
  aoMudarVista: (vista: Vista) => void;
  filtros: Filtros;
  aoMudarFiltros: (filtros: Filtros) => void;
  comFiltros: boolean;
  clientes: Cliente[];
  /** Pessoas mostradas e total (para "12 de 136"). */
  mostradas: number;
  total: number;
  todasRecolhidas: boolean;
  aoAlternarTudo: () => void;
  /** null = não se pode alargar (telemóvel). */
  alargado: boolean | null;
  aoAlternarAlargado: () => void;
  modoEdicao: boolean;
}

function BotaoBarra({
  children,
  onClick,
  titulo,
  premido,
}: {
  children: ReactNode;
  onClick: () => void;
  titulo: string;
  premido?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-pressed={premido}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${FOCO_VISIVEL}`}
    >
      {children}
    </button>
  );
}

export function BarraLista({
  vista,
  aoMudarVista,
  filtros,
  aoMudarFiltros,
  comFiltros,
  clientes,
  mostradas,
  total,
  todasRecolhidas,
  aoAlternarTudo,
  alargado,
  aoAlternarAlargado,
  modoEdicao,
}: Props) {
  const alternarCliente = (id: Id) => {
    const clientesNovos = new Set(filtros.clientes);
    if (clientesNovos.has(id)) clientesNovos.delete(id);
    else clientesNovos.add(id);
    aoMudarFiltros({ ...filtros, clientes: clientesNovos });
  };

  return (
    <div className="space-y-2 border-b border-slate-200 bg-white px-3 pt-2.5 pb-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Pessoas</h2>
        <span className="text-xs text-slate-500 tabular-nums">
          {comFiltros ? `${mostradas} de ${total}` : total}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <BotaoBarra
            onClick={aoAlternarTudo}
            titulo={todasRecolhidas ? 'Abrir todas as secções' : 'Recolher todas as secções'}
          >
            <IconeRecolher recolher={!todasRecolhidas} className="size-3.5" />
            {todasRecolhidas ? 'Abrir tudo' : 'Recolher tudo'}
          </BotaoBarra>
          {alargado !== null && (
            <BotaoBarra
              onClick={aoAlternarAlargado}
              titulo={
                alargado ? 'Voltar à largura normal' : 'Alargar o painel e mostrar as secções em colunas'
              }
              premido={alargado}
            >
              <IconeLargura alargar={!alargado} className="size-3.5" />
              {alargado ? 'Estreitar' : 'Alargar'}
            </BotaoBarra>
          )}
        </div>
      </div>

      <fieldset className="flex max-w-xl min-w-0 rounded-md bg-slate-100 p-0.5">
        <legend className="sr-only">Ver por</legend>
        {VISTAS.map((v) => {
          const ativa = v.id === vista;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={ativa}
              onClick={() => aoMudarVista(v.id)}
              className={[
                'flex-1 rounded px-2 py-1 text-xs transition-colors',
                FOCO_VISIVEL,
                ativa
                  ? 'bg-white font-semibold text-slate-900 shadow-xs ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900',
              ].join(' ')}
            >
              {v.rotulo}
            </button>
          );
        })}
      </fieldset>

      <div className="flex max-w-xl items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Filtrar por nome ou Nº</span>
          <IconeLupa className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filtros.texto}
            onChange={(e) => aoMudarFiltros({ ...filtros, texto: e.target.value })}
            placeholder="Filtrar por nome"
            autoComplete="off"
            className="w-full rounded-md border border-slate-300 bg-white py-1 pr-2 pl-7 text-xs placeholder:text-slate-400 focus-visible:border-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700"
          />
        </label>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={filtros.soAConfirmar}
            onChange={(e) => aoMudarFiltros({ ...filtros, soAConfirmar: e.target.checked })}
            className="size-3.5 accent-slate-800"
          />
          Só a confirmar
        </label>
      </div>

      <fieldset className="flex min-w-0 flex-wrap items-center gap-1">
        <legend className="sr-only">Filtrar por cliente</legend>
        {clientes.map((c) => {
          const ativo = filtros.clientes.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => alternarCliente(c.id)}
              title={c.nome}
              aria-label={`${c.nome} (${c.sigla})`}
              className={[
                'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-4 font-semibold',
                FOCO_VISIVEL,
                ativo
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm border border-black/20"
                style={{ backgroundColor: c.cor }}
              />
              {c.sigla}
            </button>
          );
        })}
        {comFiltros && (
          <button
            type="button"
            onClick={() => aoMudarFiltros({ clientes: new Set(), soAConfirmar: false, texto: '' })}
            className={`ml-auto rounded px-1 text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900 ${FOCO_VISIVEL}`}
          >
            Limpar filtros
          </button>
        )}
      </fieldset>

      {modoEdicao && (
        <p className="rounded bg-blue-50 px-2 py-1 text-[11px] leading-snug text-blue-900">
          <span className="pointer-coarse:hidden">
            Arraste um nome para outra casa, carrinha ou obra (aqui ou no mapa). Ctrl+clique e Shift+clique
            escolhem vários.
          </span>
          <span className="hidden pointer-coarse:inline">
            Toque longo num nome para o levantar e arraste-o para outra casa, carrinha ou obra.
          </span>
        </p>
      )}
    </div>
  );
}
