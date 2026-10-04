// Comutadores das vistas: Mapa | Tabela | Quadro (cabeçalho), Quadro | Mapa (reunião), Casas | Carrinhas |
// Obras (Quadro) e o botão "Reunião". Botões segmentados com aria-pressed num <fieldset> com legenda, como o
// "Ver por" da lista lateral. Cada opção tem ícone e texto.

import type { ComponentType } from 'react';
import { IconeCarrinha, IconeCasa, IconeObra } from '../lista/icones';
import { FOCO_VISIVEL } from '../paineis/classes';
import { IconeMapa, IconeQuadro, IconeReuniao, IconeTabela } from './icones';
import { pedirReuniao } from './modoReuniao';
import { type Agrupamento, useVista, VISTAS, type Vista } from './vista';

interface Opcao<T extends string> {
  id: T;
  rotulo: string;
  titulo?: string;
  Icone: ComponentType<{ className?: string }>;
}

function Segmentado<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  className = '',
  classeBotao = '',
  classeIcone = '',
}: {
  /** Nome do grupo para os leitores de ecrã ("Vista", "Quadro por"). */
  rotulo: string;
  opcoes: readonly Opcao<T>[];
  valor: T;
  aoMudar: (id: T) => void;
  className?: string;
  /** Classes extra de cada botão (ex.: tamanho do texto). */
  classeBotao?: string;
  /** Classes extra de cada ícone (ex.: esconder onde falta espaço). */
  classeIcone?: string;
}) {
  return (
    <fieldset className={`flex min-w-0 rounded-md bg-slate-100 p-0.5 ${className}`}>
      <legend className="sr-only">{rotulo}</legend>
      {opcoes.map(({ id, rotulo: texto, titulo, Icone }) => {
        const ativa = id === valor;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={ativa}
            title={titulo}
            onClick={() => aoMudar(id)}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 whitespace-nowrap transition-colors',
              FOCO_VISIVEL,
              ativa
                ? 'bg-white font-semibold text-slate-900 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900',
              classeBotao,
            ].join(' ')}
          >
            <Icone className={`size-4 shrink-0 ${classeIcone}`} />
            {texto}
          </button>
        );
      })}
    </fieldset>
  );
}

const ICONE_VISTA: Record<Vista, ComponentType<{ className?: string }>> = {
  mapa: IconeMapa,
  tabela: IconeTabela,
  quadro: IconeQuadro,
};

const OPCOES_VISTA: readonly Opcao<Vista>[] = VISTAS.map((v) => ({ ...v, Icone: ICONE_VISTA[v.id] }));

/** Mapa | Tabela | Quadro, no cabeçalho. */
export function Comutador({ className = '' }: { className?: string }) {
  const vista = useVista((s) => s.vista);
  const mudarVista = useVista((s) => s.mudarVista);
  return (
    <Segmentado
      rotulo="Vista"
      opcoes={OPCOES_VISTA}
      valor={vista}
      aoMudar={mudarVista}
      className={className}
      classeBotao="h-7 text-sm"
    />
  );
}

/** Quadro | Mapa, no cabeçalho da reunião. */
export function ComutadorReuniao() {
  const vista = useVista((s) => s.vista);
  const mudarVista = useVista((s) => s.mudarVista);
  const opcoes = OPCOES_VISTA.filter((o) => o.id !== 'tabela').sort((a, b) =>
    a.id === 'quadro' ? -1 : b.id === 'quadro' ? 1 : 0,
  );
  return (
    <Segmentado
      rotulo="Vista da reunião"
      opcoes={opcoes}
      valor={vista}
      aoMudar={mudarVista}
      classeBotao="h-8 text-base"
    />
  );
}

const OPCOES_AGRUPAMENTO: readonly Opcao<Agrupamento>[] = [
  { id: 'casas', rotulo: 'Casas', titulo: 'Uma coluna por casa, com quem lá mora', Icone: IconeCasa },
  {
    id: 'carrinhas',
    rotulo: 'Carrinhas',
    titulo: 'Uma coluna por carrinha, com quem lá vai (o condutor primeiro)',
    Icone: IconeCarrinha,
  },
  // Ao lado das casas e das carrinhas, e não num filtro à parte (pedido do Rafael, 04/10/2026).
  { id: 'obras', rotulo: 'Obras', titulo: 'Uma coluna por obra, com quem lá trabalha', Icone: IconeObra },
];

/**
 * Casas | Carrinhas | Obras, no Quadro. Só o texto onde as três opções com ícone não cabiam: no telemóvel
 * (a barra do Quadro passava a três linhas) e no cabeçalho da reunião de 1280 a 1919 px (os
 * filtros, ao lado da hora, passavam a mais uma linha).
 */
export function AlternadorAgrupamento({ grande = false }: { grande?: boolean }) {
  const agrupamento = useVista((s) => s.agrupamento);
  const definirAgrupamento = useVista((s) => s.definirAgrupamento);
  return (
    <Segmentado
      rotulo="Quadro por"
      opcoes={OPCOES_AGRUPAMENTO}
      valor={agrupamento}
      aoMudar={definirAgrupamento}
      classeBotao={grande ? 'h-8 text-base' : 'h-7 text-sm'}
      classeIcone={grande ? 'xl:max-[120rem]:hidden' : 'max-sm:hidden'}
    />
  );
}

/** "Reunião": o Quadro em ecrã inteiro, só para ver. `className` traz o display (ex.: "hidden md:inline-flex"). */
export function BotaoReuniao({ className = 'inline-flex' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={pedirReuniao}
      title="Modo reunião: o Quadro em ecrã inteiro, só para ver (Esc para sair)"
      className={`h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium whitespace-nowrap text-slate-800 hover:bg-slate-50 ${FOCO_VISIVEL} ${className}`}
    >
      <IconeReuniao />
      Reunião
    </button>
  );
}
