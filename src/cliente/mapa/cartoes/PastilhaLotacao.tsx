// Pastilha "ocupados/lugares" com a cor e o símbolo da lotação (nunca só a cor).
// É a única coisa do cartão com a cor do nível: o resto da casa/carrinha fica neutro.

import type { NivelLotacao } from '../../../dominio/ocupacao';
import { ESTILO_NIVEL } from '../../comum/lotacao';

interface Props {
  ocupados: number;
  lugares: number;
  nivel: NivelLotacao;
}

export function PastilhaLotacao({ ocupados, lugares, nivel }: Props) {
  const estilo = ESTILO_NIVEL[nivel];
  return (
    <span
      className={[
        'inline-flex h-3 shrink-0 items-center gap-px rounded-full px-1 text-[10px] font-bold tabular-nums leading-none',
        estilo.pastilha,
      ].join(' ')}
      title={`${ocupados} de ${lugares} lugares ocupados · ${estilo.rotulo}`}
    >
      {ocupados}/{lugares}
      <span aria-hidden="true" className="text-[8px]">
        {estilo.simbolo}
      </span>
      <span className="sr-only"> ({estilo.rotulo})</span>
    </span>
  );
}
