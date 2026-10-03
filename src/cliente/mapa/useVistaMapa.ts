import { useSyncExternalStore } from 'react';
import type { CamadaCartoes, VistaMapa } from './CamadaCartoes';

const semSubscricao = () => () => {};
const semVista = () => null;

/** Zoom, origem dos píxeis e tamanho do mapa; muda só no fim de um zoom, num viewreset ou num resize. */
export function useVistaMapa(camada: CamadaCartoes | null): VistaMapa | null {
  return useSyncExternalStore(
    camada ? camada.subscrever : semSubscricao,
    camada ? camada.obterVista : semVista,
  );
}
