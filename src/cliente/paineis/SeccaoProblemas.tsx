// Secção "Problemas" da ficha da casa e da carrinha (M2, docs/m2.md, "Problemas"): os abertos (texto, desde
// quando) com "Resolver" e, no modo de edição, "Novo problema…", "Mudar texto…", "Reabrir" e "Apagar" (era
// engano); os resolvidos dos últimos 30 dias, recolhidos. Não aparece nada sem problemas fora da edição.
// "Resolver" e "Reabrir" também aparecem a ler: entram antes no modo de edição (nada muda fora dele). Cada
// ação é UM passo do rascunho (Ctrl+Z desfaz). O título leva o ícone com o número de abertos.
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import { useId } from 'react';
import { formatarDiaMes, somarDias } from '../../dominio/datas';
import { operacaoApagar } from '../../dominio/operacoes';
import { type AlvoProblema, operacaoResolverProblema, problemasDe } from '../../dominio/problemas';
import type { Id, Problema } from '../../dominio/tipos';
import { IconeProblemas } from '../comum/IconeProblemas';
import { BOTAO_MINI, BOTAO_PEQUENO } from '../edicao/classes';
import { aplicarComAviso } from '../edicao/DialogoIndisponivel';
import { abrirProblema } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from './classes';

/** Quantos dias os resolvidos ficam à vista na ficha (o servidor também só manda estes). */
export const DIAS_RESOLVIDOS_VISIVEIS = 30;

/** Os abertos e os resolvidos há 30 dias ou menos (os mais antigos não se mostram). */
export function problemasDaFicha(
  problemas: readonly Problema[],
  hoje: string,
): { abertos: Problema[]; resolvidos: Problema[] } {
  const desde = somarDias(hoje, -DIAS_RESOLVIDOS_VISIVEIS);
  return {
    abertos: problemas.filter((p) => p.resolvidoEm === null),
    resolvidos: problemas
      .filter((p) => p.resolvidoEm !== null && p.resolvidoEm >= desde)
      .sort((a, b) => ((a.resolvidoEm ?? '') < (b.resolvidoEm ?? '') ? 1 : -1)),
  };
}

function useProblemaAlterado(problemaId: Id): boolean {
  return useLoja(
    (s) =>
      s.modoEdicao &&
      s.pendentes.some(
        (op) =>
          (op.tipo === 'campo' || op.tipo === 'registo') &&
          op.entidade === 'problema' &&
          op.id === problemaId,
      ),
  );
}

function MarcaProblemaAlterado({ problemaId }: { problemaId: Id }) {
  const alterado = useProblemaAlterado(problemaId);
  if (!alterado) return null;
  return (
    <span className="ml-1 font-semibold text-amber-700" title="Alterado — por guardar">
      <span aria-hidden="true">●</span>
      <span className="sr-only"> (alterado, por guardar)</span>
    </span>
  );
}

/** Resolver (dia = hoje) ou reabrir (dia = null): um passo do rascunho; a ler, entra antes na edição. */
function resolver(problemaId: Id, dia: string | null) {
  const estado = useLoja.getState().estado;
  const op = estado ? operacaoResolverProblema(estado, problemaId, dia) : null;
  if (op) aplicarComAviso([op]);
}

function apagar(problemaId: Id) {
  const estado = useLoja.getState().estado;
  const op = estado ? operacaoApagar(estado, 'problema', problemaId) : null;
  if (op) aplicarComAviso([op]);
}

function LinhaProblema({ problema, alvo }: { problema: Problema; alvo: AlvoProblema }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const hoje = useLoja((s) => s.hoje);
  const aberto = problema.resolvidoEm === null;
  return (
    <li className="text-sm text-slate-900">
      <p className="break-words">
        {problema.texto}
        <MarcaProblemaAlterado problemaId={problema.id} />
      </p>
      <p className="text-xs text-slate-600">
        {aberto
          ? `desde ${formatarDiaMes(problema.abertoEm)}`
          : `resolvido a ${formatarDiaMes(problema.resolvidoEm ?? '')} (aberto a ${formatarDiaMes(problema.abertoEm)})`}
      </p>
      <span className="mt-1 flex flex-wrap gap-1">
        {aberto ? (
          <button
            type="button"
            onClick={() => resolver(problema.id, hoje)}
            title={
              modoEdicao
                ? 'Resolvido hoje'
                : 'Resolvido hoje (entra no modo de edição; só fica gravado com Guardar)'
            }
            className={BOTAO_MINI}
          >
            Resolver
          </button>
        ) : (
          <button
            type="button"
            onClick={() => resolver(problema.id, null)}
            title={
              modoEdicao
                ? 'Volta a estar por resolver'
                : 'Volta a estar por resolver (entra no modo de edição)'
            }
            className={BOTAO_MINI}
          >
            Reabrir
          </button>
        )}
        {modoEdicao && (
          <>
            <button type="button" onClick={() => abrirProblema(alvo, problema.id)} className={BOTAO_MINI}>
              Mudar texto…
            </button>
            <button
              type="button"
              onClick={() => apagar(problema.id)}
              title="Apagar o problema (era engano)"
              className={BOTAO_MINI}
            >
              Apagar
            </button>
          </>
        )}
      </span>
    </li>
  );
}

export function SeccaoProblemas({ alvo }: { alvo: AlvoProblema }) {
  const estado = useLoja((s) => s.estado);
  const hoje = useLoja((s) => s.hoje);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const idTitulo = useId();
  if (!estado) return null;

  const { abertos, resolvidos } = problemasDaFicha(problemasDe(estado, alvo), hoje);
  if (abertos.length === 0 && resolvidos.length === 0 && !modoEdicao) return null;

  return (
    <section className="mt-3" aria-labelledby={idTitulo}>
      <h3
        id={idTitulo}
        className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase"
      >
        Problemas
        <span className="text-xs tracking-normal normal-case">
          <IconeProblemas alvo={alvo} />
        </span>
      </h3>
      {abertos.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {abertos.map((p) => (
            <LinhaProblema key={p.id} problema={p} alvo={alvo} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-600">Nenhum por resolver.</p>
      )}
      {resolvidos.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className={`cursor-pointer rounded-sm text-xs font-medium text-slate-700 ${FOCO_VISIVEL}`}>
            {resolvidos.length === 1 ? '1 resolvido' : `${resolvidos.length} resolvidos`} nos últimos{' '}
            {DIAS_RESOLVIDOS_VISIVEIS} dias
          </summary>
          <ul className="mt-1.5 flex flex-col gap-2">
            {resolvidos.map((p) => (
              <LinhaProblema key={p.id} problema={p} alvo={alvo} />
            ))}
          </ul>
        </details>
      )}
      {modoEdicao && (
        <div className="mt-2">
          <button type="button" onClick={() => abrirProblema(alvo)} className={BOTAO_PEQUENO}>
            Novo problema…
          </button>
        </div>
      )}
    </section>
  );
}
