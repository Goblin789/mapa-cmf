// Lista lateral: as pessoas organizadas por Casas, Carrinhas, Obras ou Clientes, como as folhas do
// Michael (uma secção por casa/carrinha/obra/cliente, com os nomes na cor do cliente).
// No PC: à direita do mapa, com scroll próprio; "Alargar" mostra as secções em colunas lado a lado.
// No telemóvel: por baixo do mapa (a página faz scroll).
// O atributo data-caixas-laterais serve à pesquisa para encontrar aqui o nome de uma pessoa.
// M2: no separador Obras, no modo de edição, "Nova obra…" em cima (abre o DialogoObra); o título de cada
// obra abre a ficha dela (SeccaoLista).

import { useMemo, useState } from 'react';
import { BOTAO_PEQUENO } from '../edicao/classes';
import { IconeObra } from '../edicao/icones';
import { operacoesConfirmarSugestoes } from '../edicao/ondeDorme';
import { abrirObra, useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { clientesPorOrdem } from '../paineis/agrupar';
import { useEcraLargo } from '../paineis/ganchos';
import { BarraLista } from './BarraLista';
import { carregarPreferencias, guardarPreferencias, type Preferencias } from './preferencias';
import { SeccaoLista } from './SeccaoLista';
import {
  type Filtros,
  filtrosAtivos,
  juntarEmBlocos,
  SEM_FILTROS,
  seccaoDaPessoa,
  seccoesDaVista,
  seccoesVisiveis,
} from './seccoes';

/** Colunas do painel alargado: tantas quantas couberem, como as colunas da folha do Michael. */
const GRELHA_ALARGADA = 'grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] items-start gap-2.5';

function NotaSemObras({ modoEdicao }: { modoEdicao: boolean }) {
  return (
    <p className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-snug text-slate-600">
      Ainda não há obras: toda a gente está em “Sem obra”, com a cor do seu cliente.{' '}
      {modoEdicao
        ? 'Cria uma com “Nova obra…” (aqui em cima) ou com o clique direito no mapa.'
        : 'Criam-se no modo de edição (Editar); mais tarde chegam também do GPS das carrinhas.'}
    </p>
  );
}

/** "Nova obra…" no separador Obras, no modo de edição. */
function BotaoNovaObra() {
  return (
    <div className="flex">
      <button type="button" onClick={() => abrirObra(null)} className={BOTAO_PEQUENO}>
        <IconeObra className="h-3.5 w-3.5" />
        Nova obra…
      </button>
    </div>
  );
}

export function ListaLateral() {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const dormidas = useLoja((s) => s.dormidas);
  const foco = useLoja((s) => s.foco);
  const abrirDialogo = useUiEdicao((s) => s.abrirDialogo);
  const ecraLargo = useEcraLargo();

  const [preferencias, setPreferencias] = useState(carregarPreferencias);
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS);
  const [recolhidas, setRecolhidas] = useState<ReadonlySet<string>>(() => new Set());

  const { vista } = preferencias;
  const alargado = preferencias.alargado && ecraLargo;
  const comFiltros = filtrosAtivos(filtros);

  const seccoes = useMemo(
    () => (estado && indices ? seccoesDaVista(vista, estado, indices, filtros) : []),
    [vista, estado, indices, filtros],
  );
  // Carrinhas com onde dormem só sugerido (o botão "Confirmar todas as sugestões" da vista Carrinhas).
  const mostrarSugestoes = vista === 'carrinhas' && modoEdicao;
  const sugestoes = useMemo(
    () =>
      mostrarSugestoes && estado && dormidas ? operacoesConfirmarSugestoes(estado, dormidas).length : null,
    [mostrarSugestoes, estado, dormidas],
  );

  // Quando uma pessoa entra em foco (ex.: pela pesquisa), abre a secção onde ela está.
  const [focoVisto, setFocoVisto] = useState(foco);
  if (foco !== focoVisto) {
    setFocoVisto(foco);
    const chave = foco?.tipo === 'pessoa' ? seccaoDaPessoa(seccoes, foco.id) : null;
    if (chave && recolhidas.has(chave)) {
      const novas = new Set(recolhidas);
      novas.delete(chave);
      setRecolhidas(novas);
    }
  }

  if (!estado || !indices) return null;

  const mudarPreferencias = (mudanca: Partial<Preferencias>) => {
    const novas = { ...preferencias, ...mudanca };
    setPreferencias(novas);
    guardarPreferencias(novas);
  };

  const visiveis = seccoesVisiveis(seccoes, comFiltros, modoEdicao);
  const escondidas = seccoes.length - visiveis.length;
  const mostradas = seccoes.reduce((n, s) => n + s.pessoas.length, 0);
  const total = estado.pessoas.filter((p) => p.ativa).length;
  const recolhiveis = visiveis.filter((v) => !v.soCabecalho).map((v) => v.seccao.chave);
  const todasRecolhidas = recolhiveis.length > 0 && recolhiveis.every((c) => recolhidas.has(c));

  const alternar = (chave: string) => {
    const novas = new Set(recolhidas);
    if (novas.has(chave)) novas.delete(chave);
    else novas.add(chave);
    setRecolhidas(novas);
  };
  const alternarTudo = () => {
    const novas = new Set(recolhidas);
    for (const c of recolhiveis) {
      if (todasRecolhidas) novas.delete(c);
      else novas.add(c);
    }
    setRecolhidas(novas);
  };

  const blocos = juntarEmBlocos(visiveis, (v) => v.seccao.grupo);

  return (
    <aside
      data-caixas-laterais=""
      aria-label="Lista de pessoas"
      className={[
        'flex shrink-0 flex-col border-t border-slate-200 bg-slate-50 md:border-t-0 md:border-l',
        alargado ? 'md:w-[50vw]' : 'md:w-[22rem]',
      ].join(' ')}
    >
      <BarraLista
        vista={vista}
        aoMudarVista={(v) => mudarPreferencias({ vista: v })}
        filtros={filtros}
        aoMudarFiltros={setFiltros}
        comFiltros={comFiltros}
        clientes={clientesPorOrdem(estado.clientes)}
        mostradas={mostradas}
        total={total}
        todasRecolhidas={todasRecolhidas}
        aoAlternarTudo={alternarTudo}
        alargado={ecraLargo ? alargado : null}
        aoAlternarAlargado={() => mudarPreferencias({ alargado: !preferencias.alargado })}
        modoEdicao={modoEdicao}
        sugestoesPorConfirmar={sugestoes}
        aoConfirmarSugestoes={() => abrirDialogo({ tipo: 'confirmar-sugestoes' })}
      />
      {/* relative: os textos só para leitores de ecrã (sr-only, absolutos) ficam presos a esta caixa que rola;
          sem isto escapavam-lhe e a página inteira passava a rolar (a roda do rato na legenda escondia o topo). */}
      <div className="relative md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
        <div className="flex flex-col gap-4 px-3 pt-3 pb-6">
          {vista === 'obras' && modoEdicao && <BotaoNovaObra />}
          {vista === 'obras' && estado.obras.length === 0 && <NotaSemObras modoEdicao={modoEdicao} />}
          {comFiltros && mostradas === 0 && (
            <p className="text-xs text-slate-600">
              Ninguém corresponde aos filtros.{' '}
              <button
                type="button"
                onClick={() => setFiltros(SEM_FILTROS)}
                className="underline underline-offset-2 hover:text-slate-900"
              >
                Limpar filtros
              </button>
            </p>
          )}
          {blocos.map((bloco) => {
            const idTitulo = `bloco-${bloco.chave}`;
            const conteudo = (
              <div className={alargado ? GRELHA_ALARGADA : 'flex flex-col gap-2'}>
                {bloco.itens.map(({ seccao, soCabecalho }) => (
                  <SeccaoLista
                    key={seccao.chave}
                    seccao={seccao}
                    soCabecalho={soCabecalho}
                    recolhida={recolhidas.has(seccao.chave)}
                    aoAlternar={() => alternar(seccao.chave)}
                    comFiltros={comFiltros}
                    alargado={alargado}
                  />
                ))}
              </div>
            );
            if (!bloco.titulo) return <div key={bloco.chave}>{conteudo}</div>;
            return (
              <section key={bloco.chave} aria-labelledby={idTitulo}>
                <p
                  id={idTitulo}
                  className="mb-1.5 flex items-baseline gap-1.5 px-0.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase"
                >
                  {bloco.titulo}
                  <span className="font-normal tracking-normal normal-case">
                    · {bloco.itens.length} {bloco.itens.length === 1 ? 'casa' : 'casas'}
                  </span>
                </p>
                {conteudo}
              </section>
            );
          })}
          {comFiltros && escondidas > 0 && (
            <p className="text-[11px] text-slate-500">
              {escondidas === 1 ? '1 secção sem ninguém' : `${escondidas} secções sem ninguém`} com estes
              filtros.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
