// Indisponível (férias, falta, baixa) — M2, docs/m2.md. Funções puras.
// Guarda-se SÓ a pessoa e as datas (início e fim, que pode ficar em aberto), nunca o motivo nem texto livre.
// Efeito (calculado, nunca guardado): dentro de um período, a pessoa continua na casa e na carrinha, mas na
// carrinha o lugar fica livre (não conta na lotação: Indices.ocupadosCarrinha); na casa fica marcada sem
// libertar a cama. "Hoje" é o dia no Luxemburgo (datas.ts, dataNoLuxemburgo).
//
// CONTRATO DO M2: as assinaturas estão fechadas (testes em indisponibilidade.test.ts e contrato-m2.test.ts).

import { formatarDiaMes, somarDias } from './datas';
import { novoId, type Operacao, operacaoApagar, operacaoCampo, operacaoCriar } from './operacoes';
import type { Estado, Id, Indisponibilidade } from './tipos';

/** O período inclui o dia (AAAA-MM-DD): início ≤ dia e (sem fim ou dia ≤ fim). */
export function periodoInclui(periodo: Indisponibilidade, dia: string): boolean {
  return periodo.inicio <= dia && (periodo.fim === null || dia <= periodo.fim);
}

/** Dois períodos têm pelo menos um dia em comum. */
export function periodosSobrepoem(a: Indisponibilidade, b: Indisponibilidade): boolean {
  const fimA = a.fim ?? '9999-12-31';
  const fimB = b.fim ?? '9999-12-31';
  return a.inicio <= fimB && b.inicio <= fimA;
}

/** Os períodos da pessoa, pelo início (os mais antigos primeiro). */
export function periodosDaPessoa(
  estado: Pick<Estado, 'indisponibilidades'>,
  pessoaId: Id,
): Indisponibilidade[] {
  return estado.indisponibilidades
    .filter((p) => p.pessoaId === pessoaId)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
}

/** O período da pessoa que inclui o dia, ou null (disponível). */
export function periodoEm(
  estado: Pick<Estado, 'indisponibilidades'>,
  pessoaId: Id,
  dia: string,
): Indisponibilidade | null {
  return estado.indisponibilidades.find((p) => p.pessoaId === pessoaId && periodoInclui(p, dia)) ?? null;
}

/**
 * Quem está indisponível no dia: pessoa → o período que inclui o dia. Só pessoas ativas.
 * É isto que o Indices guarda em `indisponiveis` (indexar com `hoje`).
 */
export function indisponiveisEm(
  estado: Pick<Estado, 'indisponibilidades' | 'pessoas'>,
  dia: string,
): Map<Id, Indisponibilidade> {
  const ativas = new Set(estado.pessoas.filter((p) => p.ativa).map((p) => p.id));
  const resultado = new Map<Id, Indisponibilidade>();
  for (const p of estado.indisponibilidades) {
    if (ativas.has(p.pessoaId) && periodoInclui(p, dia)) resultado.set(p.pessoaId, p);
  }
  return resultado;
}

/** Os períodos da pessoa que ainda não começaram (para a ficha: "Próximos"), pelo início. */
export function periodosFuturos(
  estado: Pick<Estado, 'indisponibilidades'>,
  pessoaId: Id,
  hoje: string,
): Indisponibilidade[] {
  return periodosDaPessoa(estado, pessoaId).filter((p) => p.inicio > hoje);
}

/** Ao lado do nome: "até 12/10" ou "sem data de regresso". */
export function textoAte(periodo: Indisponibilidade): string {
  return periodo.fim === null ? 'sem data de regresso' : `até ${formatarDiaMes(periodo.fim)}`;
}

/** Na ficha: "06/10 a 12/10", "desde 06/10 (sem data de regresso)", "só 06/10". */
export function textoPeriodo(periodo: Indisponibilidade): string {
  const inicio = formatarDiaMes(periodo.inicio);
  if (periodo.fim === null) return `desde ${inicio} (sem data de regresso)`;
  if (periodo.fim === periodo.inicio) return `só ${inicio}`;
  return `${inicio} a ${formatarDiaMes(periodo.fim)}`;
}

/**
 * Operações (um passo) para marcar as pessoas indisponíveis de `inicio` a `fim` (null = sem data de regresso).
 * Um id novo por pessoa. Não verifica sobreposições (validarOperacoes e o diálogo avisam).
 */
export function operacoesMarcarIndisponivel(
  pessoaIds: readonly Id[],
  inicio: string,
  fim: string | null,
  gerar?: () => string,
): Operacao[] {
  return [...new Set(pessoaIds)].map((pessoaId) =>
    operacaoCriar('indisponibilidade', { id: novoId('indisponibilidade', gerar), pessoaId, inicio, fim }),
  );
}

/**
 * "Já voltou": o período acaba ontem (fim = hoje − 1). Se começou hoje ou ainda não começou, apaga-se
 * (era engano). [] se o período não existir.
 */
export function operacoesTerminarPeriodo(estado: Estado, periodoId: Id, hoje: string): Operacao[] {
  const periodo = estado.indisponibilidades.find((p) => p.id === periodoId);
  // Um período que já acabou fica como está.
  if (!periodo || (periodo.fim !== null && periodo.fim < hoje)) return [];
  if (periodo.inicio >= hoje) {
    const op = operacaoApagar(estado, 'indisponibilidade', periodoId);
    return op ? [op] : [];
  }
  const op = operacaoCampo(estado, 'indisponibilidade', periodoId, 'fim', somarDias(hoje, -1));
  return op ? [op] : [];
}
