// "Ver no mapa": o ÚNICO caminho da Tabela e do Quadro para o Mapa (o botão explícito da ficha e, na Tabela,
// o de cada linha, a seguir ao nome). Muda para o Mapa, põe a pessoa (casa, carrinha) em foco e leva o mapa até
// lá, como a pesquisa do cabeçalho.
// Tudo o resto (pesquisa, ligações da ficha, cliques nas vistas) mostra sem mudar de vista:
// ver vistas/mostrar.ts.

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
