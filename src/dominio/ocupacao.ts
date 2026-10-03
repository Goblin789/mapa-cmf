// Ocupação de casas e carrinhas, e avisos de contrato. Tudo calculado, nunca guardado.

import type { Carrinha, Casa } from './tipos';

/** verde = há lugares livres; laranja = cheio; vermelho = gente a mais. */
export type NivelLotacao = 'livre' | 'cheio' | 'excesso';

export function nivelLotacao(ocupados: number, lugares: number): NivelLotacao {
  if (ocupados > lugares) return 'excesso';
  if (ocupados === lugares) return 'cheio';
  return 'livre';
}

/**
 * Compara os lugares usados da casa (lotação = moradores + vagas, ou os moradores se forem mais)
 * com o máximo do contrato e o tolerado.
 */
export type AvisoContrato = 'sem_limite' | 'dentro' | 'acima_maximo' | 'acima_tolerado';

export function avisoContrato(casa: Casa, ocupados: number): AvisoContrato {
  if (casa.maxContrato === null) return 'sem_limite';
  const usados = Math.max(casa.lotacao, ocupados);
  if (usados <= casa.maxContrato) return 'dentro';
  if (casa.tolerado !== null && usados > casa.tolerado) return 'acima_tolerado';
  return 'acima_maximo';
}

export interface OcupacaoCasa {
  ocupados: number;
  lotacao: number;
  livres: number;
  nivel: NivelLotacao;
  aviso: AvisoContrato;
  /** Lugares usados comparados com o contrato: max(lotação, ocupados). */
  usados: number;
}

export function ocupacaoCasa(casa: Casa, ocupados: number): OcupacaoCasa {
  return {
    ocupados,
    lotacao: casa.lotacao,
    livres: Math.max(0, casa.lotacao - ocupados),
    nivel: nivelLotacao(ocupados, casa.lotacao),
    aviso: avisoContrato(casa, ocupados),
    usados: Math.max(casa.lotacao, ocupados),
  };
}

export interface OcupacaoCarrinha {
  ocupados: number;
  lugares: number;
  livres: number;
  nivel: NivelLotacao;
}

export function ocupacaoCarrinha(carrinha: Carrinha, ocupados: number): OcupacaoCarrinha {
  return {
    ocupados,
    lugares: carrinha.lugares,
    livres: Math.max(0, carrinha.lugares - ocupados),
    nivel: nivelLotacao(ocupados, carrinha.lugares),
  };
}
