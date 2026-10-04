// Ocupação de casas e carrinhas, e avisos de contrato. Tudo calculado, nunca guardado.

import { formatarDiaMes } from './datas';
import type { Indices } from './indices';
import type { Carrinha, Casa, Id } from './tipos';

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

/** Lugares da casa: a lotação, ou os moradores numa casa que conta sempre como cheia. */
export function lotacaoEfetiva(casa: Casa, ocupados: number): number {
  return casa.sempreCheia ? ocupados : casa.lotacao;
}

export function avisoContrato(casa: Casa, ocupados: number): AvisoContrato {
  if (casa.maxContrato === null) return 'sem_limite';
  const usados = Math.max(lotacaoEfetiva(casa, ocupados), ocupados);
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
  const lotacao = lotacaoEfetiva(casa, ocupados);
  return {
    ocupados,
    lotacao,
    livres: Math.max(0, lotacao - ocupados),
    nivel: nivelLotacao(ocupados, lotacao),
    aviso: avisoContrato(casa, ocupados),
    usados: Math.max(lotacao, ocupados),
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

/**
 * M2: a ocupação da carrinha como o ecrã a mostra: quem está indisponível hoje NÃO conta (o lugar fica
 * livre; Indices.ocupadosCarrinha). Usar esta em vez de `ocupacaoCarrinha(c, passageiros.length)` em todo
 * o lado (cartões, Quadro, Tabela, lista, ficha, Mover para…, previsão do arrastar, avisos ao guardar).
 */
export function ocupacaoDaCarrinha(
  ind: Pick<Indices, 'ocupadosCarrinha'>,
  carrinha: Carrinha,
): OcupacaoCarrinha {
  return ocupacaoCarrinha(carrinha, ind.ocupadosCarrinha.get(carrinha.id) ?? 0);
}

/** M2: um lugar da carrinha que só está livre até alguém voltar (`ate` = o último dia fora; null = sem data). */
export interface LugarTemporario {
  pessoaId: Id;
  ate: string | null;
}

/**
 * M2: os lugares da carrinha que a indisponibilidade liberta HOJE mas que voltam a ser ocupados: os
 * passageiros indisponíveis, o que volta primeiro à frente (sem data no fim). Para o "1 livre até 12/10" do
 * Mover para… e da previsão, e para o aviso ao guardar ("fica com 10/9 quando X voltar, a 13/10").
 */
export function lugaresTemporarios(
  ind: Pick<Indices, 'passageiros' | 'indisponiveis'>,
  carrinhaId: Id,
): LugarTemporario[] {
  const lugares: LugarTemporario[] = [];
  for (const p of ind.passageiros.get(carrinhaId) ?? []) {
    const periodo = ind.indisponiveis.get(p.id);
    if (periodo) lugares.push({ pessoaId: p.id, ate: periodo.fim });
  }
  return lugares.sort((a, b) =>
    a.ate === b.ate ? 0 : a.ate === null ? 1 : b.ate === null ? -1 : a.ate < b.ate ? -1 : 1,
  );
}

/** "1 livre até 12/10", "2 livres até 12/10" (o 1.º a voltar), "1 livre (sem data de regresso)"; null sem nenhum. */
export function textoLugaresTemporarios(lugares: readonly LugarTemporario[]): string | null {
  const primeiro = lugares[0];
  if (!primeiro) return null;
  const n = lugares.length === 1 ? '1 livre' : `${lugares.length} livres`;
  return primeiro.ate === null ? `${n} (sem data de regresso)` : `${n} até ${formatarDiaMes(primeiro.ate)}`;
}

/**
 * M2: a ocupação da casa como o ecrã a mostra. Quem está indisponível continua a contar (a cama não se
 * liberta): é o mesmo que `ocupacaoCasa(casa, moradores.length)`, num só sítio.
 */
export function ocupacaoDaCasa(ind: Pick<Indices, 'moradores'>, casa: Casa): OcupacaoCasa {
  return ocupacaoCasa(casa, ind.moradores.get(casa.id)?.length ?? 0);
}
