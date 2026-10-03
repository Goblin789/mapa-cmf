// Pastilha "ocupados/lugares" com a cor e o símbolo da lotação (nunca só a cor).

import type { NivelLotacao } from '../../../dominio/ocupacao';
import { ESTILO_NIVEL } from '../../comum/lotacao';

interface Props {
  ocupados: number;
  lugares: number;
  nivel: NivelLotacao;
  grande?: boolean;
}

export function PastilhaLotacao({ ocupados, lugares, nivel, grande = false }: Props) {
  const estilo = ESTILO_NIVEL[nivel];
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center gap-0.5 rounded-full font-semibold tabular-nums leading-none',
        grande ? 'h-4 px-1.5 text-[11px]' : 'h-3.5 px-1 text-[10px]',
        estilo.pastilha,
      ].join(' ')}
      title={`${ocupados} de ${lugares} lugares ocupados · ${estilo.rotulo}`}
    >
      {ocupados}/{lugares}
      <span aria-hidden="true">{estilo.simbolo}</span>
    </span>
  );
}
