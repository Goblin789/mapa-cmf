// As duas caixas fixas da especificação: "Fora das casas CMF" e "Sem transporte da empresa".
// No PC: coluna à direita do mapa, uma caixa por baixo da outra, com scroll próprio.
// No telemóvel: por baixo do mapa (a página faz scroll), com abas para alternar entre as duas.
// O atributo data-caixas-laterais serve à pesquisa para encontrar aqui o nome de uma pessoa.

import { type KeyboardEvent, useId, useState } from 'react';
import type { Indices } from '../../dominio/indices';
import type { Pessoa } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { agruparPorCliente } from './agrupar';
import { FOCO_VISIVEL } from './classes';
import { type AbaCaixas, abaParaPessoa } from './fichas';
import { useEcraLargo } from './ganchos';
import { GrelhaNomes, MarcaAConfirmar, MarcaCliente } from './pecas';
import { ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from './textos';

interface DefCaixa {
  aba: AbaCaixas;
  titulo: string;
  tituloCurto: string;
  pessoas: Pessoa[];
  /** O que fica por confirmar nesta caixa: a casa ou a carrinha. */
  aConfirmar: (p: Pessoa) => boolean;
}

function definirCaixas(ind: Indices): DefCaixa[] {
  return [
    {
      aba: 'fora',
      titulo: ROTULO_FORA_DAS_CASAS,
      tituloCurto: 'Fora das casas',
      pessoas: ind.foraDasCasas,
      aConfirmar: (p) => p.casaAConfirmar,
    },
    {
      aba: 'sem',
      titulo: ROTULO_SEM_TRANSPORTE,
      tituloCurto: 'Sem transporte',
      pessoas: ind.semTransporte,
      aConfirmar: (p) => p.carrinhaAConfirmar,
    },
  ];
}

function Caixa({
  caixa,
  indices,
  tituloVisivel,
}: {
  caixa: DefCaixa;
  indices: Indices;
  tituloVisivel: boolean;
}) {
  const idTitulo = useId();
  const grupos = agruparPorCliente(caixa.pessoas, indices);
  const nAConfirmar = caixa.pessoas.filter(caixa.aConfirmar).length;

  return (
    <section aria-labelledby={idTitulo} className="px-3 py-2">
      <h2
        id={idTitulo}
        className={tituloVisivel ? 'flex items-baseline gap-2 text-sm font-bold text-slate-900' : 'sr-only'}
      >
        {caixa.titulo}
        <span className="rounded bg-slate-200 px-1.5 text-xs tabular-nums">{caixa.pessoas.length}</span>
      </h2>
      {nAConfirmar > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-700">
          <MarcaAConfirmar texto={String(nAConfirmar)} />
          {nAConfirmar === 1 ? 'pessoa a confirmar' : 'pessoas a confirmar'}
        </p>
      )}
      {grupos.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600 italic">Ninguém.</p>
      ) : (
        grupos.map((g) => (
          <div key={g.clienteId} className="mt-2">
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <MarcaCliente cliente={g.cliente} />
              <span className="min-w-0 flex-1 truncate">{g.cliente?.nome ?? 'Cliente desconhecido'}</span>
              <span className="font-normal tabular-nums text-slate-600">{g.pessoas.length}</span>
            </h3>
            <GrelhaNomes pessoas={g.pessoas} />
          </div>
        ))
      )}
    </section>
  );
}

export function CaixasLaterais() {
  const indices = useLoja((s) => s.indices);
  const foco = useLoja((s) => s.foco);
  const ecraLargo = useEcraLargo();
  const idBase = useId();
  const [aba, setAba] = useState<AbaCaixas>('fora');

  // No telemóvel, quando uma pessoa entra em foco (ex.: pela pesquisa), mostra a caixa onde ela está.
  const [focoVisto, setFocoVisto] = useState(foco);
  if (foco !== focoVisto) {
    setFocoVisto(foco);
    if (foco?.tipo === 'pessoa' && indices) {
      const nova = abaParaPessoa(
        indices.foraDasCasas.some((p) => p.id === foco.id),
        indices.semTransporte.some((p) => p.id === foco.id),
        aba,
      );
      if (nova !== aba) setAba(nova);
    }
  }

  if (!indices) return null;
  const caixas = definirCaixas(indices);
  const idAba = (a: AbaCaixas) => `${idBase}-aba-${a}`;
  const idPainel = (a: AbaCaixas) => `${idBase}-painel-${a}`;

  const aoTeclarNasAbas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const nova: AbaCaixas =
      e.key === 'Home' ? 'fora' : e.key === 'End' ? 'sem' : aba === 'fora' ? 'sem' : 'fora';
    setAba(nova);
    document.getElementById(idAba(nova))?.focus();
  };

  return (
    <aside
      data-caixas-laterais=""
      aria-label="Pessoas fora das casas e sem transporte"
      className="flex shrink-0 flex-col border-t border-slate-200 bg-white md:max-h-none md:w-80 md:border-t-0 md:border-l"
    >
      {!ecraLargo && (
        <div
          role="tablist"
          aria-label="Caixas"
          className="flex shrink-0 border-b border-slate-200"
          onKeyDown={aoTeclarNasAbas}
        >
          {caixas.map((c) => {
            const ativa = aba === c.aba;
            return (
              <button
                key={c.aba}
                type="button"
                role="tab"
                id={idAba(c.aba)}
                aria-selected={ativa}
                // Só o painel da aba ativa existe no DOM: as outras não podem apontar para um id inexistente.
                aria-controls={ativa ? idPainel(c.aba) : undefined}
                tabIndex={ativa ? 0 : -1}
                onClick={() => setAba(c.aba)}
                className={`flex-1 border-b-2 px-2 py-2 text-xs ${FOCO_VISIVEL} ${
                  ativa ? 'border-slate-900 font-bold text-slate-900' : 'border-transparent text-slate-600'
                }`}
              >
                {c.tituloCurto} <span className="tabular-nums">({c.pessoas.length})</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="md:min-h-0 md:flex-1 md:divide-y md:divide-slate-200 md:overflow-y-auto md:overscroll-contain">
        {ecraLargo
          ? caixas.map((c) => <Caixa key={c.aba} caixa={c} indices={indices} tituloVisivel />)
          : caixas
              .filter((c) => c.aba === aba)
              .map((c) => (
                <div key={c.aba} role="tabpanel" id={idPainel(c.aba)} aria-labelledby={idAba(c.aba)}>
                  <Caixa caixa={c} indices={indices} tituloVisivel={false} />
                </div>
              ))}
      </div>
    </aside>
  );
}
