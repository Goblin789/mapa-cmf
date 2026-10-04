// Vista Tabela: uma linha por pessoa ativa — Nome, Nº, Cliente, Obra, Casa, Carrinha, Condutor e o que
// está por confirmar. Ordena-se clicando no cabeçalho (aria-sort); pesquisa indiferente a acentos e
// filtros por cliente, casa e carrinha. O cabeçalho fica fixo; no telemóvel a tabela desliza dentro do
// seu contentor (a página nunca desliza na horizontal) e a coluna do nome fica presa à esquerda.
// Clicar numa linha mostra a pessoa no mapa. A ordem e os filtros mantêm-se ao mudar de vista.
// No modo de edição mostra a simulação (o rascunho), com a nota.

import { type ReactNode, useEffect, useId, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { IconeVolante } from '../comum/IconeVolante';
import { formatarMatricula, Matricula } from '../comum/Matricula';
import { ContornoEdicao } from '../edicao/Edicao';
import { useLoja } from '../estado/loja';
import { IconeLupa } from '../lista/icones';
import { clientesPorOrdem } from '../paineis/agrupar';
import { FOCO_VISIVEL } from '../paineis/classes';
import { MarcaAConfirmar, MarcaCliente } from '../paineis/pecas';
import { ehAtalhoPesquisa, ehCampoEditavel } from '../paineis/teclado';
import { ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from '../paineis/textos';
import { IconeOrdem } from './icones';
import {
  ariaSort,
  COLUNAS_TABELA,
  type ColunaTabela,
  FILTROS_INICIAIS,
  type FiltrosTabela,
  filtrarLinhas,
  filtrosTabelaAtivos,
  type LinhaTabela,
  linhasDaTabela,
  ORDEM_INICIAL,
  type OrdemTabela,
  ordenarLinhas,
  proximaOrdem,
  SEM,
  textoContagem,
} from './linhasTabela';
import { verNoMapa } from './navegar';
import { BotaoExcel, NomeVista, NotaEdicao } from './pecas';

/** Ordem e filtros da tabela: ficam ao ir ao mapa e voltar (não ao recarregar a página). */
const useEstadoTabela = create<{
  ordem: OrdemTabela;
  filtros: FiltrosTabela;
  definirOrdem: (ordem: OrdemTabela) => void;
  definirFiltros: (filtros: FiltrosTabela) => void;
}>()((set) => ({
  ordem: ORDEM_INICIAL,
  filtros: FILTROS_INICIAIS,
  definirOrdem: (ordem) => set({ ordem }),
  definirFiltros: (filtros) => set({ filtros }),
}));

const CAMPO =
  'h-8 rounded-md border border-slate-300 bg-white px-2 text-base text-slate-800 sm:text-sm focus-visible:border-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700';

const CELULA = 'border-b border-slate-100 px-2 py-1 align-middle';

/** Primeira coluna (o nome): presa à esquerda quando a tabela desliza na horizontal. */
const PRESA = 'sticky left-0 z-[1]';

function Vazio({ children }: { children: ReactNode }) {
  return <span className="text-slate-500 italic">{children}</span>;
}

function Seletor({
  rotulo,
  valor,
  aoMudar,
  todos,
  opcoes,
}: {
  rotulo: string;
  valor: string | null;
  aoMudar: (valor: string | null) => void;
  todos: string;
  opcoes: { id: string; rotulo: string }[];
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 items-center">
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor ?? ''}
        onChange={(e) => aoMudar(e.target.value === '' ? null : e.target.value)}
        className={`${CAMPO} w-full min-w-0 sm:w-auto sm:max-w-[12rem] ${valor !== null ? 'border-slate-800 font-semibold' : ''}`}
      >
        <option value="">{todos}</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

function LinhaPessoa({ linha: l }: { linha: LinhaTabela }) {
  const verPessoa = () => verNoMapa({ tipo: 'pessoa', id: l.pessoa.id });
  return (
    // O teclado usa o botão do nome (primeira célula); o clique serve a linha toda.
    <tr onClick={verPessoa} className="group cursor-pointer">
      <td className={`${CELULA} ${PRESA} bg-white group-hover:bg-slate-50`}>
        <button
          type="button"
          title="Ver no mapa"
          aria-label={`${l.nomeCompleto}: ver no mapa`}
          className={`flex max-w-[22rem] min-w-0 items-center gap-2 rounded text-left ${FOCO_VISIVEL}`}
        >
          <NomeVista pessoa={l.pessoa} condutor={l.condutor} className="w-[11.5rem] shrink-0 text-[13px]" />
          {l.nomeCompleto !== l.nome && (
            <span className="hidden min-w-0 truncate text-xs text-slate-500 lg:inline">{l.nomeCompleto}</span>
          )}
        </button>
      </td>
      <td
        className={`${CELULA} text-xs whitespace-nowrap text-slate-700 tabular-nums group-hover:bg-slate-50`}
      >
        {l.numero ?? <Vazio>—</Vazio>}
      </td>
      <td className={`${CELULA} whitespace-nowrap group-hover:bg-slate-50`}>
        <span className="inline-flex items-center gap-1.5">
          <MarcaCliente cliente={l.cliente} />
          {l.cliente?.nome ?? <Vazio>desconhecido</Vazio>}
        </span>
      </td>
      <td className={`${CELULA} whitespace-nowrap group-hover:bg-slate-50`}>
        {l.obra?.nome ?? <Vazio>sem obra</Vazio>}
      </td>
      <td className={`${CELULA} whitespace-nowrap group-hover:bg-slate-50`}>
        {l.casa?.nome ?? <Vazio>{ROTULO_FORA_DAS_CASAS}</Vazio>}
      </td>
      <td className={`${CELULA} whitespace-nowrap group-hover:bg-slate-50`}>
        {l.carrinha ? (
          <Matricula matricula={l.carrinha.matricula} altura={18} />
        ) : (
          <Vazio>sem transporte</Vazio>
        )}
      </td>
      <td className={`${CELULA} whitespace-nowrap group-hover:bg-slate-50`}>
        {l.condutor && (
          <span className="inline-flex items-center gap-1 text-slate-800">
            <IconeVolante tamanho={13} />
            Condutor
          </span>
        )}
      </td>
      <td className={`${CELULA} whitespace-nowrap group-hover:bg-slate-50`}>
        <span className="inline-flex gap-1">
          {l.casaAConfirmar && <MarcaAConfirmar texto="casa" />}
          {l.carrinhaAConfirmar && <MarcaAConfirmar texto="carrinha" />}
        </span>
      </td>
    </tr>
  );
}

function Cabecalho({ coluna, rotulo, ordem }: { coluna: ColunaTabela; rotulo: string; ordem: OrdemTabela }) {
  const definirOrdem = useEstadoTabela((s) => s.definirOrdem);
  const sort = ariaSort(ordem, coluna);
  return (
    <th
      scope="col"
      aria-sort={sort}
      className={`sticky top-0 border-b border-slate-300 bg-slate-50 px-2 py-1 text-left text-xs font-semibold whitespace-nowrap text-slate-700 ${
        coluna === 'nome' ? 'left-0 z-[3]' : 'z-[2]'
      }`}
    >
      <button
        type="button"
        onClick={() => definirOrdem(proximaOrdem(ordem, coluna))}
        title={`Ordenar por ${rotulo.toLowerCase()}`}
        className={`inline-flex items-center gap-1 rounded px-0.5 py-0.5 hover:text-slate-950 ${FOCO_VISIVEL}`}
      >
        {rotulo}
        <IconeOrdem direcao={sort === 'none' ? null : ordem.direcao} />
      </button>
    </th>
  );
}

export function Tabela() {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const ordem = useEstadoTabela((s) => s.ordem);
  const filtros = useEstadoTabela((s) => s.filtros);
  const definirFiltros = useEstadoTabela((s) => s.definirFiltros);
  const campo = useRef<HTMLInputElement>(null);
  const idPesquisa = useId();

  const linhas = useMemo(() => (estado && indices ? linhasDaTabela(estado, indices) : []), [estado, indices]);
  const visiveis = useMemo(
    () => ordenarLinhas(filtrarLinhas(linhas, filtros), ordem),
    [linhas, filtros, ordem],
  );

  // "/" e Ctrl+K levam o foco para a pesquisa da tabela (a do cabeçalho é a do mapa).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const alvo = e.target instanceof HTMLElement ? e.target : null;
      const tecla = {
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        emCampoEditavel: ehCampoEditavel(alvo),
      };
      if (!ehAtalhoPesquisa(tecla)) return;
      e.preventDefault();
      campo.current?.focus();
      campo.current?.select();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  if (!estado || !indices) return null;

  const comFiltros = filtrosTabelaAtivos(filtros);
  const mudar = (mudanca: Partial<FiltrosTabela>) => definirFiltros({ ...filtros, ...mudanca });
  const casas = [...estado.casas].sort((a, b) => a.ordem - b.ordem);
  const carrinhas = [...estado.carrinhas].sort((a, b) =>
    formatarMatricula(a.matricula).localeCompare(formatarMatricula(b.matricula), 'pt'),
  );

  return (
    <section aria-label="Tabela de pessoas" className="relative flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="relative w-full sm:w-64">
          <label htmlFor={idPesquisa} className="sr-only">
            Pesquisar na tabela
          </label>
          <IconeLupa className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={campo}
            id={idPesquisa}
            type="search"
            value={filtros.texto}
            onChange={(e) => mudar({ texto: e.target.value })}
            placeholder="Pesquisar nome, Nº, casa…"
            aria-keyshortcuts="/ Control+K"
            autoComplete="off"
            spellCheck={false}
            className={`${CAMPO} w-full pl-8`}
          />
        </div>
        {/* No telemóvel os três filtros partilham uma linha e ficam cortados: a opção vazia começa pelo
            nome do filtro ("Casa: todas"), para se saber qual é qual. */}
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
          <Seletor
            rotulo="Filtrar por cliente"
            valor={filtros.clienteId}
            aoMudar={(clienteId) => mudar({ clienteId })}
            todos="Cliente: todos"
            opcoes={clientesPorOrdem(estado.clientes).map((c) => ({ id: c.id, rotulo: c.nome }))}
          />
          <Seletor
            rotulo="Filtrar por casa"
            valor={filtros.casa}
            aoMudar={(casa) => mudar({ casa })}
            todos="Casa: todas"
            opcoes={[
              ...casas.map((c) => ({ id: c.id, rotulo: c.nome })),
              { id: SEM, rotulo: ROTULO_FORA_DAS_CASAS },
            ]}
          />
          <Seletor
            rotulo="Filtrar por carrinha"
            valor={filtros.carrinha}
            aoMudar={(carrinha) => mudar({ carrinha })}
            todos="Carrinha: todas"
            opcoes={[
              ...carrinhas.map((c) => ({ id: c.id, rotulo: formatarMatricula(c.matricula) })),
              { id: SEM, rotulo: ROTULO_SEM_TRANSPORTE },
            ]}
          />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={filtros.soAConfirmar}
            onChange={(e) => mudar({ soAConfirmar: e.target.checked })}
            className="size-4 accent-slate-800"
          />
          Só a confirmar
        </label>
        {comFiltros && (
          <button
            type="button"
            onClick={() => definirFiltros(FILTROS_INICIAIS)}
            className={`rounded px-1 text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900 ${FOCO_VISIVEL}`}
          >
            Limpar filtros
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <p role="status" className="text-sm whitespace-nowrap text-slate-700 tabular-nums">
            {textoContagem(visiveis.length, linhas.length, comFiltros)}
          </p>
          <BotaoExcel />
        </div>
      </div>
      {modoEdicao && (
        <div className="px-3 pt-2">
          <NotaEdicao />
        </div>
      )}
      {/* relative: os textos só para leitores de ecrã (sr-only, absolutos) ficam presos a esta caixa. */}
      <div className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
        <table className="w-full min-w-[60rem] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            Pessoas ({textoContagem(visiveis.length, linhas.length, comFiltros)}). Clicar numa linha mostra a
            pessoa no mapa.
          </caption>
          <thead>
            <tr>
              {COLUNAS_TABELA.map((c) => (
                <Cabecalho key={c.id} coluna={c.id} rotulo={c.rotulo} ordem={ordem} />
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <LinhaPessoa key={l.pessoa.id} linha={l} />
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={COLUNAS_TABELA.length} className="px-3 py-6 text-sm text-slate-600">
                  Ninguém corresponde aos filtros.{' '}
                  <button
                    type="button"
                    onClick={() => definirFiltros(FILTROS_INICIAIS)}
                    className={`underline underline-offset-2 hover:text-slate-900 ${FOCO_VISIVEL}`}
                  >
                    Limpar filtros
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ContornoEdicao />
    </section>
  );
}
