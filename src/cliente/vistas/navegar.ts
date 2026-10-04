// "Ver no mapa" a partir da Tabela e do Quadro: muda para o Mapa, põe a pessoa (casa, carrinha) em foco
// e leva o mapa até lá, como a pesquisa do cabeçalho.

import { useEffect, useRef } from 'react';
import { type Foco, useLoja } from '../estado/loja';
import { destinoNoMapa, ZOOM_DESTINO } from '../paineis/fichas';
import { useVista } from './vista';

/** Mostra o nome da pessoa na lista lateral (no PC; no telemóvel a lista fica por baixo do mapa). */
function mostrarNaLista(pessoaId: string): void {
  if (!window.matchMedia('(min-width: 768px)').matches) return;
  const chip = document.querySelector(`[data-caixas-laterais] [data-pessoa-id="${CSS.escape(pessoaId)}"]`);
  chip?.scrollIntoView({ block: 'center' });
}

export function verNoMapa(foco: NonNullable<Foco>): void {
  const { indices, dormidas, definirFoco, pedirIrPara } = useLoja.getState();
  definirFoco(foco);
  useVista.getState().mudarVista('mapa');
  const destino = indices && dormidas ? destinoNoMapa(foco, indices, dormidas) : null;
  if (destino) pedirIrPara(destino.lat, destino.lng, ZOOM_DESTINO);
  // Espera que a lista abra a secção da pessoa (reage ao foco) antes de a procurar.
  if (foco.tipo === 'pessoa')
    requestAnimationFrame(() => requestAnimationFrame(() => mostrarNaLista(foco.id)));
}

/**
 * Quem pede para levar o mapa a algum lado (ex.: uma casa no popover dos contadores) quer vê-lo: fora do
 * Mapa, muda para lá (na reunião, para o Mapa da reunião). Usar uma vez (App).
 */
export function useIrParaMostraMapa(): void {
  const seq = useLoja((s) => s.irPara?.seq ?? 0);
  const visto = useRef(seq);
  useEffect(() => {
    if (seq === visto.current) return;
    visto.current = seq;
    const { vista, mudarVista } = useVista.getState();
    if (vista !== 'mapa') mudarVista('mapa');
  }, [seq]);
}
