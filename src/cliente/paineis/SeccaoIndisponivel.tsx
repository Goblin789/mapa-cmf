// Secção "Indisponível" da ficha da pessoa (M2, docs/m2.md, "Indisponível"): se está indisponível hoje
// ("até 12/10" ou "sem data de regresso"), os próximos períodos e, no modo de edição, "Marcar
// indisponível…", "Já voltou" (termina ontem; apaga se começou hoje), "Mudar datas…" e "Apagar". Só datas:
// nunca motivo nem texto livre. Não aparece nada quando não há períodos e não se está a editar.
// Os períodos passados não se mostram, menos os que estão por guardar no modo de edição (um engano no ano
// tem de se poder corrigir antes de guardar). Quem saiu da empresa não está indisponível (como nos índices
// e na Tabela): o período de hoje dela aparece à parte, sem "Já voltou". Cada ação é UM passo do rascunho
// (Ctrl+Z desfaz).
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import { useMemo } from 'react';
import { formatarDiaMes } from '../../dominio/datas';
import {
  operacoesTerminarPeriodo,
  periodoEm,
  periodoInclui,
  periodosDaPessoa,
  periodosFuturos,
  textoPeriodo,
} from '../../dominio/indisponibilidade';
import { operacaoApagar } from '../../dominio/operacoes';
import type { Estado, Id, Indisponibilidade, Pessoa } from '../../dominio/tipos';
import { BOTAO_MINI, BOTAO_PEQUENO } from '../edicao/classes';
import { aplicarComAviso } from '../edicao/DialogoIndisponivel';
import { abrirIndisponivel } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { Secao } from './MolduraFicha';

/** "Indisponível até 12/10" / "Indisponível desde 06/10, sem data de regresso". */
export function textoPeriodoDeHoje(periodo: Pick<Indisponibilidade, 'inicio' | 'fim'>): string {
  return periodo.fim === null
    ? `Indisponível desde ${formatarDiaMes(periodo.inicio)}, sem data de regresso`
    : `Indisponível até ${formatarDiaMes(periodo.fim)}`;
}

/** O período tem alterações por guardar (criado, mudado ou apagado no rascunho). */
function usePeriodoAlterado(periodoId: Id): boolean {
  return useLoja(
    (s) =>
      s.modoEdicao &&
      s.pendentes.some(
        (op) =>
          (op.tipo === 'campo' || op.tipo === 'registo') &&
          op.entidade === 'indisponibilidade' &&
          op.id === periodoId,
      ),
  );
}

function MarcaPeriodoAlterado({ periodoId }: { periodoId: Id }) {
  const alterado = usePeriodoAlterado(periodoId);
  if (!alterado) return null;
  return (
    <span className="ml-1 font-semibold text-amber-700" title="Alterado — por guardar">
      <span aria-hidden="true">●</span>
      <span className="sr-only"> (alterado, por guardar)</span>
    </span>
  );
}

function AcoesPeriodo({
  periodo,
  hoje,
  deHoje,
}: {
  periodo: Indisponibilidade;
  hoje: string;
  deHoje: boolean;
}) {
  const jaVoltou = () => {
    const estado = useLoja.getState().estado;
    if (!estado) return;
    const ops = operacoesTerminarPeriodo(estado, periodo.id, hoje);
    aplicarComAviso(ops);
  };
  const apagar = () => {
    const estado = useLoja.getState().estado;
    const op = estado ? operacaoApagar(estado, 'indisponibilidade', periodo.id) : null;
    if (op) aplicarComAviso([op]);
  };
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {deHoje && (
        <button
          type="button"
          onClick={jaVoltou}
          title="O período acaba ontem (se começou hoje, apaga-se)"
          className={BOTAO_MINI}
        >
          Já voltou
        </button>
      )}
      <button
        type="button"
        onClick={() => abrirIndisponivel([periodo.pessoaId], periodo.id)}
        className={BOTAO_MINI}
      >
        Mudar datas…
      </button>
      <button type="button" onClick={apagar} title="Apagar o período (era engano)" className={BOTAO_MINI}>
        Apagar
      </button>
    </span>
  );
}

/** Um período que a ficha mostra fora de "hoje" e "próximos", com o porquê. */
export interface OutroPeriodo {
  periodo: Indisponibilidade;
  nota: string;
}

/** O que a secção mostra. */
export interface PeriodosDaFicha {
  /** O período de hoje, se a pessoa está na empresa (como em indisponiveisEm). */
  deHoje: Indisponibilidade | null;
  futuros: Indisponibilidade[];
  /**
   * Os outros: o de hoje de quem saiu da empresa (não conta, como na Tabela) e, no modo de edição, os que
   * já acabaram e estão por guardar (criados ou mudados no rascunho: um engano no ano tem de se poder
   * corrigir ou apagar antes de guardar). Pelo início.
   */
  outros: OutroPeriodo[];
}

export const NOTA_SAIU = 'saiu da empresa: não conta';
export const NOTA_JA_ACABOU = 'já acabou — por guardar';

/**
 * Os períodos da ficha. `alterados` = ids dos períodos com alterações por guardar (só no modo de edição;
 * vazio a ler). Os passados guardados não se mostram.
 */
export function periodosDaFicha(
  estado: Pick<Estado, 'indisponibilidades'>,
  pessoa: Pick<Pessoa, 'id' | 'ativa'>,
  hoje: string,
  alterados: ReadonlySet<Id>,
): PeriodosDaFicha {
  const deHoje = pessoa.ativa ? periodoEm(estado, pessoa.id, hoje) : null;
  const futuros = periodosFuturos(estado, pessoa.id, hoje);
  const outros = periodosDaPessoa(estado, pessoa.id).flatMap((p): OutroPeriodo[] => {
    if (p.inicio > hoje || p.id === deHoje?.id) return [];
    if (periodoInclui(p, hoje)) return [{ periodo: p, nota: NOTA_SAIU }];
    return alterados.has(p.id) ? [{ periodo: p, nota: NOTA_JA_ACABOU }] : [];
  });
  return { deHoje, futuros, outros };
}

/** Os ids dos períodos com operações por guardar (texto ordenado, para o seletor não mudar à toa). */
function useIdsAlterados(): string {
  return useLoja((s) =>
    s.modoEdicao
      ? [
          ...new Set(
            s.pendentes.flatMap((op) =>
              (op.tipo === 'campo' || op.tipo === 'registo') && op.entidade === 'indisponibilidade'
                ? [op.id]
                : [],
            ),
          ),
        ]
          .sort()
          .join('\n')
      : '',
  );
}

export function SeccaoIndisponivel({ pessoa }: { pessoa: Pessoa }) {
  const estado = useLoja((s) => s.estado);
  const hoje = useLoja((s) => s.hoje);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const idsAlterados = useIdsAlterados();
  const alterados = useMemo(() => new Set(idsAlterados ? idsAlterados.split('\n') : []), [idsAlterados]);
  if (!estado) return null;

  const { deHoje, futuros, outros } = periodosDaFicha(estado, pessoa, hoje, alterados);
  // Quem saiu da empresa não se marca (o "Voltou à empresa" é da ficha).
  const podeMarcar = modoEdicao && pessoa.ativa;
  if (!deHoje && futuros.length === 0 && outros.length === 0 && !podeMarcar) return null;

  return (
    <Secao titulo="Indisponível">
      {deHoje ? (
        <div className="text-sm">
          <p className="font-medium text-slate-900">
            {textoPeriodoDeHoje(deHoje)}
            <MarcaPeriodoAlterado periodoId={deHoje.id} />
          </p>
          {modoEdicao && <AcoesPeriodo periodo={deHoje} hoje={hoje} deHoje />}
        </div>
      ) : (
        modoEdicao && pessoa.ativa && <p className="text-xs text-slate-600">Disponível hoje.</p>
      )}
      {outros.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {outros.map(({ periodo: p, nota }) => (
            <li key={p.id} className="text-sm text-slate-600">
              {textoPeriodo(p)} <span className="text-xs italic">({nota})</span>
              <MarcaPeriodoAlterado periodoId={p.id} />
              {modoEdicao && <AcoesPeriodo periodo={p} hoje={hoje} deHoje={false} />}
            </li>
          ))}
        </ul>
      )}
      {futuros.length > 0 && (
        <div className="mt-1.5">
          <p className="text-xs text-slate-600">
            {futuros.length === 1 ? 'Próximo período' : 'Próximos períodos'}
          </p>
          <ul className="flex flex-col gap-1">
            {futuros.map((p) => (
              <li key={p.id} className="text-sm text-slate-800">
                {textoPeriodo(p)}
                <MarcaPeriodoAlterado periodoId={p.id} />
                {modoEdicao && <AcoesPeriodo periodo={p} hoje={hoje} deHoje={false} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {podeMarcar && (
        <div className="mt-2">
          <button type="button" onClick={() => abrirIndisponivel([pessoa.id])} className={BOTAO_PEQUENO}>
            Marcar indisponível…
          </button>
        </div>
      )}
    </Secao>
  );
}
