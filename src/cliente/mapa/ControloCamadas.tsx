// Ligar e desligar as camadas do mapa (canto superior direito): Casas, Carrinhas e Obras.
// Desligar as casas deixa as carrinhas no sítio onde dormem e as obras; desligar as carrinhas e as obras
// deixa só as casas. O layout e o enquadramento recalculam-se com o que fica.

import type { ReactNode } from 'react';
import { type Camada, useLoja } from '../estado/loja';
import { IconeCarrinha, IconeCasa, IconeObra } from './cartoes/Icones';

const CAMADAS: readonly { camada: Camada; rotulo: string; icone: ReactNode }[] = [
  { camada: 'casas', rotulo: 'Casas', icone: <IconeCasa tamanho={13} /> },
  { camada: 'carrinhas', rotulo: 'Carrinhas', icone: <IconeCarrinha tamanho={13} /> },
  { camada: 'obras', rotulo: 'Obras', icone: <IconeObra tamanho={13} /> },
];

export function ControloCamadas() {
  const camadas = useLoja((s) => s.camadas);
  const alternarCamada = useLoja((s) => s.alternarCamada);
  // O estado VISÍVEL (com o rascunho): as obras criadas (ou apagadas) no modo de edição já contam.
  const estado = useLoja((s) => s.estado);
  const quantos: Record<Camada, number> = {
    casas: estado?.casas.length ?? 0,
    carrinhas: estado?.carrinhas.length ?? 0,
    obras: estado?.obras.length ?? 0,
  };

  return (
    <fieldset className="flex overflow-hidden rounded-lg border border-slate-300 bg-white/95 p-0.5 shadow-md">
      <legend className="sr-only">Camadas do mapa</legend>
      {CAMADAS.map(({ camada, rotulo, icone }) => {
        const ligada = camadas[camada];
        return (
          <button
            key={camada}
            type="button"
            aria-pressed={ligada}
            title={`${ligada ? 'Esconder' : 'Mostrar'} ${rotulo.toLowerCase()} no mapa`}
            onClick={() => alternarCamada(camada)}
            className={[
              'flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700',
              ligada ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
            ].join(' ')}
          >
            {icone}
            <span className={ligada ? '' : 'line-through decoration-slate-400'}>{rotulo}</span>
            <span className={['tabular-nums', ligada ? 'text-slate-300' : 'text-slate-400'].join(' ')}>
              {quantos[camada]}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
