// Vista Tabela: uma linha por pessoa ativa — Nome, Nº, Cliente, Obra, Casa, Carrinha, Condutor e o que
// está por confirmar. O nome é o completo com maiúsculas normais (dominio/nomes.ts), numa só etiqueta da
// cor do cliente e sem a sigla (a coluna Cliente já a mostra). Ordena-se clicando no cabeçalho
// (aria-sort); o campo da barra filtra (indiferente a acentos), com filtros de escolha múltipla por
// cliente, casa, carrinha e obra (comum/FiltroMultiplo: Casa 1 e Casa 2 ao mesmo tempo; entre filtros é E).
// O cabeçalho fica fixo; no telemóvel a tabela desliza dentro do seu contentor (a página nunca desliza na
// horizontal) e a coluna do nome fica presa à esquerda. A ordem e os filtros mantêm-se ao mudar de vista.
//
// Nunca muda de vista (docs/vistas-edicao.md). A linha já mostra tudo da pessoa: clicar nela só a realça
// (não abre a ficha, que repetia a linha); o botão pequeno a seguir ao nome (ⓘ) abre a ficha da pessoa
// (PainelFoco, por cima da tabela) para quem precisa dela (ex.: "Ver no mapa"). Com a ficha de uma pessoa
// aberta, clicar noutra linha passa a ficha para ela. O nome da casa e a matrícula abrem a ficha da casa ou
// da carrinha. A linha em foco fica realçada, e as da casa ou carrinha em foco levemente. A pesquisa do
// cabeçalho e as ligações da ficha mostram aqui (useAoMostrar): desliza até às linhas e
// acende-as, limpando os filtros que as escondam. Com um cliente aceso na legenda do Mapa,
// as linhas dos outros ficam esbatidas; a barra diz qual está aceso e tem "Todos".
// O Excel da barra exporta o que se vê: com filtros, a folha Pessoas só tem as linhas filtradas.
//
// No modo de edição mostra a simulação (o rascunho) e edita como o mapa: coluna de caixas de seleção
// (e "todas as visíveis"), clique na linha = seleção como nos nomes (Ctrl/⌘, Shift pela ordem visível),
// Casa, Carrinha e Obra em listas (cada escolha é um passo do rascunho), o condutor num botão, células
// alteradas a âmbar com "antes: …". Várias de uma vez: selecionar e "Mover para…" da barra âmbar. Ao lado
// das listas Casa e Carrinha, um botão abre a ficha da casa/carrinha; na barra, "Confirmar todas as
// sugestões (N)" (onde dormem as carrinhas), como no Quadro por carrinhas e na lista lateral.

import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { create } from 'zustand';
import type { Cliente, Id } from '../../dominio/tipos';
import { modoDoClique } from '../arrastar/selecao';
import { FiltroMultiplo, type OpcaoFiltroMultiplo } from '../comum/FiltroMultiplo';
import { IconeVolante } from '../comum/IconeVolante';
import { formatarMatricula, Matricula } from '../comum/Matricula';
import {
  definirCondutorComAviso,
  desfazerComAviso,
  limparSelecaoComAviso,
  moverComAviso,
  refazerComAviso,
} from '../edicao/acoes';
import { BOTAO_MINI } from '../edicao/classes';
import { ContornoEdicao } from '../edicao/Edicao';
import { operacoesConfirmarSugestoes } from '../edicao/ondeDorme';
import { haDialogoAberto, useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { IconeCarrinhaLado, IconeCarroLado, IconeCasa, IconeDormir, IconeLupa } from '../lista/icones';
import { FOCO_VISIVEL } from '../paineis/classes';
import { PainelFoco } from '../paineis/PainelFoco';
import { MarcaAConfirmar, MarcaCliente } from '../paineis/pecas';
import { ROTULO_FORA_DAS_CASAS } from '../paineis/textos';
import {
  type AntesDaLinha,
  acaoTeclaLista,
  alvoDaEscolha,
  antesDasLinhas,
  type CampoCelula,
  mesmasOpcoes,
  type OpcaoCelula,
  opcoesCarrinha,
  opcoesCasa,
  opcoesObra,
  rotuloBotaoCondutor,
  rotuloDaCelula,
  teclaMudaLista,
  valorDaCelula,
} from './celulasTabela';
import { exportarExcel } from './excel';
import { IconeDescarregar, IconeOrdem } from './icones';
import {
  ariaSort,
  COLUNAS_TABELA,
  type ColunaTabela,
  cliqueNaLinha,
  deslocamentoParaVer,
  FILTROS_INICIAIS,
  type FiltrosTabela,
  filtrarLinhas,
  filtrosTabelaAtivos,
  type LinhaTabela,
  linhaApagada,
  linhasDaTabela,
  modoDaCaixa,
  ORDEM_INICIAL,
  type OrdemTabela,
  opcoesFiltrosTabela,
  ordenarLinhas,
  pessoasDoElemento,
  proximaOrdem,
  type RealceLinha,
  realceDaLinha,
  reservaDaFicha,
  selecaoComVisiveis,
  textoContagem,
  zonaLivreDaTabela,
} from './linhasTabela';
import {
  ATRIBUTO_FICHA,
  chaveElemento,
  type ElementoVista,
  revelarDepoisDeDesenhar,
  revelarElementos,
  seletorElementos,
  useAoMostrar,
} from './mostrar';
import { BOTAO_VISTA, NomeVista } from './pecas';

/**
 * Ordem, filtros e a linha realçada pelo clique: ficam ao ir ao mapa e voltar (não ao recarregar a
 * página).
 */
const useEstadoTabela = create<{
  ordem: OrdemTabela;
  filtros: FiltrosTabela;
  /** A linha em que se clicou (fora do modo de edição): realçada, sem abrir a ficha. */
  marcada: Id | null;
  definirOrdem: (ordem: OrdemTabela) => void;
  definirFiltros: (filtros: FiltrosTabela) => void;
  definirMarcada: (marcada: Id | null) => void;
}>()((set) => ({
  ordem: ORDEM_INICIAL,
  filtros: FILTROS_INICIAIS,
  marcada: null,
  definirOrdem: (ordem) => set({ ordem }),
  definirFiltros: (filtros) => set({ filtros }),
  definirMarcada: (marcada) => set({ marcada }),
}));

const CAMPO =
  'h-8 rounded-md border border-slate-300 bg-white px-2 text-base text-slate-800 sm:text-sm focus-visible:border-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700';

const CELULA = 'border-b border-slate-100 px-2 py-1 align-middle';

/** Colunas presas à esquerda quando a tabela desliza na horizontal: a caixa (só na edição) e o nome. */
const PRESA_CAIXA = 'sticky left-0 w-9 min-w-9 max-w-9';
/** O nome fica encostado à esquerda, ou a seguir à caixa de seleção (w-9) no modo de edição. */
const PRESA_NOME = { fora: 'sticky left-0', edicao: 'sticky left-9' } as const;

/** Lista de uma célula no modo de edição (16 px no telemóvel, para o iPhone não aproximar). */
const LISTA_CELULA = `h-7 shrink-0 rounded border border-slate-300 bg-white px-1 text-base text-slate-800 sm:text-sm ${FOCO_VISIVEL}`;

/**
 * Filtros de escolha múltipla da barra: no telemóvel dois por linha (quatro numa linha ficavam "Cli…");
 * no PC ao lado uns dos outros, com a largura dos campos de antes.
 */
const FILTRO = { className: 'min-w-0 sm:w-auto', classeBotao: 'sm:max-w-[10rem] xl:max-w-[12rem]' };

/** Ligação-botão dentro de uma célula (nome da casa, matrícula): abre a ficha. */
const LIGACAO = `rounded text-left hover:underline hover:underline-offset-2 ${FOCO_VISIVEL}`;

const AZUL_SELECAO = '#2563eb';
const AZUL_FOCO = '#1d4ed8';

const ROTULO_LISTA: Record<CampoCelula, string> = { casa: 'Casa', carrinha: 'Carrinha', obra: 'Obra' };

/** Largura fixa das listas: não mudam de largura quando as opções aparecem. */
const LARGURA_LISTA: Record<CampoCelula, string> = {
  casa: 'w-[14rem]',
  carrinha: 'w-[13.5rem]',
  obra: 'w-[12rem]',
};

interface OpcoesCelulas {
  casa: readonly OpcaoCelula[];
  carrinha: readonly OpcaoCelula[];
  obra: readonly OpcaoCelula[];
}

/**
 * As opções das listas das células (com a lotação da simulação). Só a lista que se está a usar as lê:
 * as outras têm só a opção escolhida, e mudar uma pessoa não redesenha as listas das ~140 linhas.
 */
const useOpcoesTabela = create<OpcoesCelulas>()(() => ({ casa: [], carrinha: [], obra: [] }));

const SEM_ANTES: ReadonlyMap<Id, AntesDaLinha> = new Map();

function Vazio({ children }: { children: ReactNode }) {
  return <span className="text-slate-500 italic">{children}</span>;
}

/** "●" com o "antes: …" para os leitores de ecrã (o title fica na célula). */
function MarcaAntes({ antes }: { antes: string | undefined }) {
  if (!antes) return null;
  return (
    <>
      <span aria-hidden="true" className="shrink-0 text-amber-600">
        ●
      </span>
      <span className="sr-only">({antes})</span>
    </>
  );
}

/** Corre `fazer` depois de o React desenhar (dois fotogramas). */
function depoisDeDesenhar(fazer: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(fazer));
}

/**
 * Mantém a linha inteira à vista na caixa da tabela, por baixo do cabeçalho e, no telemóvel, por cima da
 * ficha (que lá fica em baixo, a toda a largura). Espera que a ficha abra (dois fotogramas).
 */
function manterLinhaAVista(tr: HTMLTableRowElement): void {
  depoisDeDesenhar(() => {
    const caixa = tr.closest('table')?.parentElement;
    const primeira = tr.cells[0];
    if (!tr.isConnected || !caixa || !primeira) return;
    const ficha = document.querySelector<HTMLElement>(`[${ATRIBUTO_FICHA}="vista"]`);
    // (As células do cabeçalho é que ficam presas; o thead desliza com a tabela.)
    const fundoCabecalho = caixa.querySelector('thead th')?.getBoundingClientRect().bottom ?? 0;
    const zona = zonaLivreDaTabela(
      caixa.getBoundingClientRect(),
      fundoCabecalho,
      ficha?.getBoundingClientRect() ?? null,
      primeira.getBoundingClientRect(),
    );
    const delta = deslocamentoParaVer(tr.getBoundingClientRect(), zona);
    if (delta === 0) return;
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    caixa.scrollBy({ top: delta, behavior: reduzir ? 'auto' : 'smooth' });
  });
}

/**
 * A ficha da vista (PainelFoco, dentro de `area`) foi arrastada para fora do sítio de origem: o PainelFoco
 * marca-a com `data-movida` (e guarda a posição só para si). Segue a marca enquanto há ficha aberta: muda
 * ao largar a ficha, ao voltar ao sítio e quando abre outra ficha (que já vem na posição lembrada).
 */
function useFichaMovida(area: HTMLElement | null, haFicha: boolean): boolean {
  const [movida, setMovida] = useState(false);
  useLayoutEffect(() => {
    if (!area || !haFicha) {
      setMovida(false);
      return;
    }
    const ler = () => setMovida(area.querySelector(`[${ATRIBUTO_FICHA}="vista"][data-movida]`) !== null);
    ler();
    const observador = new MutationObserver(ler);
    observador.observe(area, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-movida'],
    });
    return () => observador.disconnect();
  }, [area, haFicha]);
  return movida;
}

/**
 * Leva a pessoa para o que se escolheu na lista (um passo do rascunho) e segue a linha: se a ordenação
 * a mudou de sítio, desliza até ela e acende-a; se os filtros agora a escondem, o aviso di-lo.
 */
function escolherNaCelula(lista: HTMLSelectElement, linha: LinhaTabela, campo: CampoCelula, valor: string) {
  const raiz = lista.closest('section');
  const antes = lista.closest('tr')?.sectionRowIndex ?? -1;
  const id = linha.pessoa.id;
  if (moverComAviso([id], alvoDaEscolha(campo, valor)) === 0 || !raiz) return;
  const aviso = useUiEdicao.getState().aviso?.texto;
  const chave = chaveElemento({ tipo: 'pessoa', id });
  depoisDeDesenhar(() => {
    const tr = raiz.querySelector<HTMLTableRowElement>(seletorElementos([chave]));
    if (!tr) {
      const texto = `${linha.nomeMostrado} já não aparece com estes filtros.`;
      useUiEdicao.getState().avisar(aviso ? `${aviso} ${texto}` : texto);
    } else if (tr.sectionRowIndex !== antes) revelarElementos(raiz, [chave]);
  });
}

/**
 * Casa, Carrinha ou Obra no modo de edição: escolher leva a pessoa para lá (um passo do rascunho).
 * Teclado: numa lista fechada, ↓/↑ e as letras mudariam logo a pessoa (Chrome e Firefox no Windows e
 * Linux), uma vez por tecla; em vez disso abrem a lista, onde se escolhe com Enter. Onde o browser não
 * a deixa abrir, a escolha feita assim fica provisória (Enter ou sair da lista grava; Esc anula). A lista
 * tem os atalhos do modo de edição (Ctrl+Z, Ctrl+Y, Esc), que fora dela ignoram os campos.
 */
function ListaCelula({ campo, linha }: { campo: CampoCelula; linha: LinhaTabela }) {
  // Fechada, tem só a opção escolhida; ao tocar-lhe (rato, toque ou teclado) desenha as opções todas antes
  // de o browser abrir a lista.
  const [ativa, setAtiva] = useState(false);
  const [provisoria, setProvisoria] = useState<string | null>(null);
  // Abrimos a lista (showPicker) e não se sabe se já fechou: as teclas que chegarem são dela.
  const aberta = useRef(false);
  // A última tecla mudaria o valor da lista fechada: o onChange que vier logo a seguir é dela.
  const teclaQueMuda = useRef(false);
  const opcoes = useOpcoesTabela((s) => (ativa ? s[campo] : null));
  const valor = valorDaCelula(linha, campo);
  const mostrado = provisoria ?? valor;

  const gravar = (lista: HTMLSelectElement, escolhido: string) => {
    setProvisoria(null);
    if (escolhido !== valor) escolherNaCelula(lista, linha, campo, escolhido);
  };

  const aoTeclar = (e: KeyboardEvent<HTMLSelectElement>) => {
    const lista = e.currentTarget;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'Tab') aberta.current = false;
    const acao = acaoTeclaLista(e, {
      aberta: aberta.current,
      provisoria: provisoria !== null,
      temSelecao: useLoja.getState().selecao.size > 0,
      dialogoAberto: haDialogoAberto(),
    });
    if (acao === 'abrir') {
      try {
        lista.showPicker();
        e.preventDefault();
        aberta.current = true;
        return;
      } catch {
        // Sem showPicker (ou recusado): o browser muda o valor e a escolha fica provisória.
      }
    }
    if (acao === null || acao === 'abrir') {
      if (teclaMudaLista(e)) {
        // O onChange de uma lista fechada vem nesta mesma tarefa, antes do temporizador.
        teclaQueMuda.current = true;
        setTimeout(() => {
          teclaQueMuda.current = false;
        }, 0);
      }
      return;
    }
    e.preventDefault();
    if (acao === 'confirmar') gravar(lista, mostrado);
    else if (acao === 'anular') setProvisoria(null);
    else if (acao === 'desfazer') desfazerComAviso();
    else if (acao === 'refazer') refazerComAviso();
    else limparSelecaoComAviso();
  };

  return (
    <select
      aria-label={`${ROTULO_LISTA[campo]} de ${linha.nomeMostrado}`}
      title={provisoria !== null ? 'Enter grava a escolha; Esc anula' : undefined}
      value={mostrado}
      onPointerDown={() => {
        setAtiva(true);
        aberta.current = false;
      }}
      onFocus={() => setAtiva(true)}
      onBlur={(e) => {
        setAtiva(false);
        aberta.current = false;
        if (provisoria !== null) gravar(e.currentTarget, provisoria);
      }}
      onKeyDown={aoTeclar}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const escolhido = e.target.value;
        aberta.current = false;
        if (teclaQueMuda.current) setProvisoria(escolhido === valor ? null : escolhido);
        else gravar(e.currentTarget, escolhido);
      }}
      className={`${LISTA_CELULA} ${LARGURA_LISTA[campo]} ${provisoria !== null ? 'border-amber-500 bg-amber-50' : ''}`}
    >
      {opcoes && opcoes.length > 0 ? (
        opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))
      ) : (
        <option value={valor}>{rotuloDaCelula(linha, campo)}</option>
      )}
    </select>
  );
}

/** Botão pequeno ao lado das listas Casa e Carrinha (modo de edição): abre a ficha da casa/carrinha. */
function BotaoFicha({
  titulo,
  aoClicar,
  children,
}: {
  titulo: string;
  aoClicar: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={aoClicar}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${FOCO_VISIVEL}`}
    >
      {children}
    </button>
  );
}

/** O lugar do BotaoFicha quando não há casa/carrinha: as marcas "●" ficam alinhadas. */
const SEM_BOTAO_FICHA = <span aria-hidden="true" className="w-7 shrink-0" />;

/** "i" num círculo: o botão a seguir ao nome que abre a ficha da pessoa. */
function IconeFicha({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" />
      <circle cx="8" cy="4.9" r="0.4" fill="currentColor" />
    </svg>
  );
}

interface PropsLinha {
  linha: LinhaTabela;
  modoEdicao: boolean;
  selecionada: boolean;
  realce: RealceLinha;
  /** Outro cliente está aceso na legenda do Mapa: a linha fica esbatida. */
  apagada: boolean;
  /** Há obras no estado (sem obras e sem obra na pessoa, a célula fica "sem obra", como na ficha). */
  haObras: boolean;
  antes: AntesDaLinha | undefined;
  /** Ids das linhas visíveis pela ordem atual (para o Shift+clique); estável entre desenhos. */
  obterOrdem: () => readonly Id[];
}

/** A linha só se redesenha quando muda o que mostra (a Tabela tem perto de 140 linhas). */
function linhasIguais(a: LinhaTabela, b: LinhaTabela): boolean {
  return (
    a.pessoa === b.pessoa &&
    a.cliente === b.cliente &&
    a.obra === b.obra &&
    a.casa === b.casa &&
    a.carrinha === b.carrinha &&
    a.condutor === b.condutor
  );
}

function propsLinhaIguais(a: PropsLinha, b: PropsLinha): boolean {
  for (const chave of Object.keys(a) as (keyof PropsLinha)[]) {
    if (chave === 'linha' ? !linhasIguais(a.linha, b.linha) : !Object.is(a[chave], b[chave])) return false;
  }
  return true;
}

const LinhaPessoa = memo(function LinhaPessoa({
  linha: l,
  modoEdicao,
  selecionada,
  realce,
  apagada,
  haObras,
  antes,
  obterOrdem,
}: PropsLinha) {
  const id = l.pessoa.id;
  const casa = l.casa;
  const carrinha = l.carrinha;
  const conduz = l.condutor;
  const tituloCarrinha = carrinha
    ? `Abrir a ficha ${carrinha.tipo === 'carro' ? 'do carro' : 'da carrinha'} ${formatarMatricula(carrinha.matricula)}`
    : '';

  // O clique na linha realça-a (no modo de edição, seleciona) sem abrir a ficha: a linha já mostra tudo.
  // O teclado usa o botão da ficha a seguir ao nome e, no modo de edição, a caixa de seleção. Os controlos
  // das células param o clique. Ao abrir a ficha (ou ao passá-la para esta linha), a linha fica à vista
  // (no telemóvel a ficha abre em baixo, por cima das linhas).
  const aoClicar = (e: MouseEvent<HTMLTableRowElement>) => {
    const { foco, definirFoco, selecionar } = useLoja.getState();
    const { marcada, definirMarcada } = useEstadoTabela.getState();
    const tr = e.currentTarget;
    if (modoEdicao) selecionar(id, modoDoClique(e), obterOrdem());
    const depois = cliqueNaLinha(id, { foco, marcada, modoEdicao });
    definirMarcada(depois.marcada);
    if (depois.foco !== undefined) {
      definirFoco(depois.foco);
      manterLinhaAVista(tr);
    }
  };
  const abrir = (e: MouseEvent<HTMLElement>, foco: ElementoVista) => {
    e.stopPropagation();
    useLoja.getState().definirFoco(foco);
    const tr = e.currentTarget.closest('tr');
    if (tr) manterLinhaAVista(tr);
  };
  // Botão ⓘ a seguir ao nome: abre a ficha da pessoa (e realça a linha); na pessoa da ficha, fecha-a.
  // Fica na célula presa do nome: à vista em qualquer largura e nos dois modos (no fim da linha, no modo
  // de edição a 1366 px, ficava fora do ecrã), e nunca por baixo da ficha, que abre à direita.
  const emFoco = realce === 'foco';
  const alternarFicha = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (emFoco) {
      useLoja.getState().definirFoco(null);
      return;
    }
    if (!modoEdicao) useEstadoTabela.getState().definirMarcada(id);
    abrir(e, { tipo: 'pessoa', id });
  };

  const fundo =
    selecionada || realce === 'foco' || realce === 'marcada'
      ? 'bg-blue-50'
      : realce === 'ligada'
        ? 'bg-slate-100'
        : 'bg-white group-hover:bg-slate-50';
  const fundoDe = (antesCelula: string | undefined) => (antesCelula ? 'bg-amber-50' : fundo);

  // Contorno azul da linha selecionada (sombras por dentro das células: as presas tapariam um contorno da
  // linha) e a barra à esquerda da linha em foco, na primeira célula presa.
  const horizontais = selecionada ? [`inset 0 1px 0 ${AZUL_SELECAO}`, `inset 0 -1px 0 ${AZUL_SELECAO}`] : [];
  const sombra = (lado: string | null): CSSProperties | undefined => {
    const todas = lado ? [lado, ...horizontais] : horizontais;
    return todas.length > 0 ? { boxShadow: todas.join(', ') } : undefined;
  };
  const meio = sombra(null);
  const naPrimeira = sombra(
    realce === 'foco' || realce === 'marcada'
      ? `inset 4px 0 0 ${AZUL_FOCO}`
      : selecionada
        ? `inset 2px 0 0 ${AZUL_SELECAO}`
        : null,
  );
  const naUltima = sombra(selecionada ? `inset -1px 0 0 ${AZUL_SELECAO}` : null);

  return (
    <tr
      data-elemento={chaveElemento({ tipo: 'pessoa', id })}
      onClick={aoClicar}
      onMouseDown={(e) => {
        // Shift+clique escolhe um intervalo: sem selecionar o texto das linhas pelo meio.
        if (modoEdicao && e.shiftKey && !(e.target as HTMLElement).closest('select')) e.preventDefault();
      }}
      // Esbatida: o conteúdo das células (não o fundo: as células presas tapam o que desliza por baixo).
      className={`group cursor-pointer ${apagada ? '[&>td>*]:opacity-25' : ''}`}
    >
      {modoEdicao && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: só impede o clique da linha; o teclado usa a caixa.
        <td
          className={`${CELULA} ${PRESA_CAIXA} z-[1] p-0 ${fundo}`}
          style={naPrimeira}
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex min-h-8 w-full cursor-pointer items-center justify-center">
            <span className="sr-only">Selecionar {l.nomeMostrado}</span>
            <input
              type="checkbox"
              checked={selecionada}
              onChange={(e) => {
                // Numa caixa, o onChange do React vem do clique: o Shift escolhe o intervalo.
                const comShift =
                  'shiftKey' in e.nativeEvent && (e.nativeEvent as globalThis.MouseEvent).shiftKey;
                const { selecionar, ancoraSelecao } = useLoja.getState();
                const ordem = obterOrdem();
                selecionar(id, modoDaCaixa(comShift, ancoraSelecao, ordem), ordem);
              }}
              className="size-4 cursor-pointer accent-blue-700"
            />
          </label>
        </td>
      )}
      <td
        className={`${CELULA} ${modoEdicao ? PRESA_NOME.edicao : PRESA_NOME.fora} z-[1] ${fundo}`}
        style={modoEdicao ? meio : naPrimeira}
      >
        <span className="flex min-w-0 items-center">
          <NomeVista
            pessoa={l.pessoa}
            condutor={l.condutor}
            nome={l.nomeMostrado}
            semSigla
            className={`${modoEdicao ? 'w-[9rem]' : 'w-[12rem]'} shrink-0 text-[13px] sm:w-[16rem] 2xl:w-[18.5rem]`}
          />
          <button
            type="button"
            onClick={alternarFicha}
            aria-pressed={emFoco}
            aria-label={`Ficha de ${l.nomeMostrado}`}
            title={emFoco ? `Fechar a ficha de ${l.nomeMostrado}` : `Abrir a ficha de ${l.nomeMostrado}`}
            className={`ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded ${FOCO_VISIVEL} ${
              emFoco
                ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                : 'text-slate-400 group-hover:text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <IconeFicha />
          </button>
        </span>
      </td>
      <td className={`${CELULA} text-xs whitespace-nowrap text-slate-700 tabular-nums ${fundo}`} style={meio}>
        {l.numero !== null ? <span>{l.numero}</span> : <Vazio>—</Vazio>}
      </td>
      <td className={`${CELULA} whitespace-nowrap ${fundo}`} style={meio}>
        <span className="inline-flex items-center gap-1.5">
          <MarcaCliente cliente={l.cliente} />
          {l.cliente?.nome ?? <Vazio>desconhecido</Vazio>}
        </span>
      </td>
      <td className={`${CELULA} whitespace-nowrap ${fundoDe(antes?.obra)}`} style={meio} title={antes?.obra}>
        {modoEdicao && (haObras || l.obra) ? (
          <span className="flex items-center gap-1">
            <ListaCelula campo="obra" linha={l} />
            <MarcaAntes antes={antes?.obra} />
          </span>
        ) : l.obra ? (
          <span>{l.obra.nome}</span>
        ) : (
          <Vazio>sem obra</Vazio>
        )}
      </td>
      <td className={`${CELULA} whitespace-nowrap ${fundoDe(antes?.casa)}`} style={meio} title={antes?.casa}>
        {modoEdicao ? (
          <span className="flex items-center gap-1">
            <ListaCelula campo="casa" linha={l} />
            {casa ? (
              <BotaoFicha
                titulo={`Abrir a ficha de ${casa.nome}`}
                aoClicar={(e) => abrir(e, { tipo: 'casa', id: casa.id })}
              >
                <IconeCasa className="size-4" />
              </BotaoFicha>
            ) : (
              SEM_BOTAO_FICHA
            )}
            <MarcaAntes antes={antes?.casa} />
          </span>
        ) : casa ? (
          <button
            type="button"
            onClick={(e) => abrir(e, { tipo: 'casa', id: casa.id })}
            title={`Abrir a ficha de ${casa.nome}`}
            className={LIGACAO}
          >
            {casa.nome}
          </button>
        ) : (
          <Vazio>{ROTULO_FORA_DAS_CASAS}</Vazio>
        )}
      </td>
      <td
        className={`${CELULA} whitespace-nowrap ${fundoDe(antes?.carrinha)}`}
        style={meio}
        title={antes?.carrinha}
      >
        {modoEdicao ? (
          <span className="flex items-center gap-1">
            <ListaCelula campo="carrinha" linha={l} />
            {carrinha ? (
              <BotaoFicha
                titulo={tituloCarrinha}
                aoClicar={(e) => abrir(e, { tipo: 'carrinha', id: carrinha.id })}
              >
                {carrinha.tipo === 'carro' ? (
                  <IconeCarroLado className="size-4" />
                ) : (
                  <IconeCarrinhaLado className="size-4" />
                )}
              </BotaoFicha>
            ) : (
              SEM_BOTAO_FICHA
            )}
            <MarcaAntes antes={antes?.carrinha} />
          </span>
        ) : carrinha ? (
          <button
            type="button"
            onClick={(e) => abrir(e, { tipo: 'carrinha', id: carrinha.id })}
            title={tituloCarrinha}
            className={`${LIGACAO} inline-flex`}
          >
            <Matricula matricula={carrinha.matricula} altura={18} />
          </button>
        ) : (
          <Vazio>sem transporte</Vazio>
        )}
      </td>
      <td
        className={`${CELULA} whitespace-nowrap ${fundoDe(antes?.condutor)}`}
        style={meio}
        title={antes?.condutor}
      >
        {modoEdicao && carrinha ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={conduz}
              aria-label={rotuloBotaoCondutor(l.nomeMostrado, carrinha, conduz)}
              title={rotuloBotaoCondutor(l.nomeMostrado, carrinha, conduz)}
              onClick={(e) => {
                e.stopPropagation();
                definirCondutorComAviso(carrinha.id, conduz ? null : id);
              }}
              className={`inline-flex h-7 items-center gap-1 rounded border px-1.5 text-xs ${FOCO_VISIVEL} ${
                conduz
                  ? 'border-slate-700 bg-white font-semibold text-slate-900 hover:bg-slate-100'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-800'
              }`}
            >
              {conduz && <IconeVolante tamanho={13} />}
              {conduz ? 'Condutor' : 'Tornar'}
            </button>
            <MarcaAntes antes={antes?.condutor} />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            {conduz && (
              <span className="inline-flex items-center gap-1 text-slate-800">
                <IconeVolante tamanho={13} />
                Condutor
              </span>
            )}
            <MarcaAntes antes={antes?.condutor} />
          </span>
        )}
      </td>
      <td className={`${CELULA} whitespace-nowrap ${fundo}`} style={naUltima}>
        <span className="inline-flex gap-1">
          {l.casaAConfirmar && <MarcaAConfirmar texto="casa" />}
          {l.carrinhaAConfirmar && <MarcaAConfirmar texto="carrinha" />}
        </span>
      </td>
    </tr>
  );
}, propsLinhaIguais);

function Cabecalho({
  coluna,
  rotulo,
  ordem,
  modoEdicao,
}: {
  coluna: ColunaTabela;
  rotulo: string;
  ordem: OrdemTabela;
  modoEdicao: boolean;
}) {
  const definirOrdem = useEstadoTabela((s) => s.definirOrdem);
  const sort = ariaSort(ordem, coluna);
  return (
    <th
      scope="col"
      aria-sort={sort}
      className={`sticky top-0 border-b border-slate-300 bg-slate-50 px-2 py-1 text-left text-xs font-semibold whitespace-nowrap text-slate-700 ${
        coluna === 'nome' ? `${modoEdicao ? PRESA_NOME.edicao : PRESA_NOME.fora} z-[3]` : 'z-[2]'
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

/**
 * Caixa do cabeçalho: junta à seleção todas as linhas visíveis, ou tira-as (meio marcada quando são só
 * algumas). Quem está selecionado e os filtros escondem fica selecionado.
 */
function CaixaTodas({ ids }: { ids: readonly Id[] }) {
  const selecao = useLoja((s) => s.selecao);
  const caixa = useRef<HTMLInputElement>(null);
  const n = ids.reduce((total, id) => total + (selecao.has(id) ? 1 : 0), 0);
  const todas = ids.length > 0 && n === ids.length;
  const algumas = n > 0 && !todas;
  useEffect(() => {
    if (caixa.current) caixa.current.indeterminate = algumas;
  }, [algumas]);
  return (
    <th scope="col" className={`${PRESA_CAIXA} top-0 z-[3] border-b border-slate-300 bg-slate-50 p-0`}>
      <label className="flex min-h-8 w-full cursor-pointer items-center justify-center">
        <span className="sr-only">Selecionar todas as linhas visíveis</span>
        <input
          ref={caixa}
          type="checkbox"
          checked={todas}
          disabled={ids.length === 0}
          onChange={() => {
            const { selecao: atual, definirSelecao } = useLoja.getState();
            definirSelecao(selecaoComVisiveis(atual, ids, !todas));
          }}
          className="size-4 cursor-pointer accent-blue-700"
        />
      </label>
    </th>
  );
}

/**
 * Cliente aceso na legenda do Mapa: diz qual é e "Todos" volta a acender todos. No
 * telemóvel só a marca do cliente e "Todos" (o "Só <cliente>" fica para os leitores de ecrã), para
 * caber na linha de "Só a confirmar" e da contagem.
 */
function ClienteAceso({ cliente }: { cliente: Cliente }) {
  return (
    <p
      className="order-5 flex min-w-0 shrink-0 items-center gap-1.5 text-sm text-slate-700 sm:order-4"
      title={`Só ${cliente.nome} aceso (legenda)`}
    >
      <MarcaCliente cliente={cliente} />
      <span className="max-w-[10rem] truncate max-sm:sr-only">Só {cliente.nome}</span>
      <button
        type="button"
        onClick={() => useLoja.getState().definirClienteDestacado(null)}
        title="Mostrar todos os clientes"
        className={`rounded px-1 text-slate-600 underline underline-offset-2 hover:text-slate-900 ${FOCO_VISIVEL}`}
      >
        Todos
      </button>
    </p>
  );
}

/**
 * Excel da Tabela: como o das outras vistas (pecas/BotaoExcel), mas com filtros a folha Pessoas só tem as
 * linhas que se veem, pela ordem da Tabela (o ficheiro diz "filtrado"). `filtradas` = null sem filtros.
 */
function BotaoExcelTabela({ filtradas }: { filtradas: () => readonly LinhaTabela[] | null }) {
  const [aExportar, setAExportar] = useState(false);
  const comFiltros = useEstadoTabela((s) => filtrosTabelaAtivos(s.filtros));
  const exportar = async () => {
    const { estado, indices, dormidas, modoEdicao, pendentes } = useLoja.getState();
    if (!estado || !indices || !dormidas || aExportar) return;
    setAExportar(true);
    try {
      await exportarExcel(estado, indices, dormidas, modoEdicao && pendentes.length > 0, filtradas());
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      useUiEdicao.getState().avisar(`Não foi possível exportar para Excel (${motivo}).`);
    } finally {
      setAExportar(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void exportar()}
      disabled={aExportar}
      title={
        comFiltros
          ? 'Exportar para Excel: a folha Pessoas só com as linhas filtradas; folhas Casas e Carrinhas inteiras'
          : 'Exportar para Excel: folhas Pessoas, Casas e Carrinhas'
      }
      className={BOTAO_VISTA}
    >
      <IconeDescarregar />
      {aExportar ? 'A exportar…' : 'Excel'}
    </button>
  );
}

/** As marcas dos clientes nas opções dos filtros Cliente e Obra (a obra tem a cor do seu cliente). */
function comMarcas(
  opcoes: readonly OpcaoFiltroMultiplo[],
  cliente: (valor: string) => Cliente | null | undefined,
): OpcaoFiltroMultiplo[] {
  return opcoes.map((o) => {
    const c = cliente(o.valor);
    return c ? { ...o, marca: <MarcaCliente cliente={c} /> } : o;
  });
}

export function Tabela() {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const selecao = useLoja((s) => s.selecao);
  const foco = useLoja((s) => s.foco);
  const pendentes = useLoja((s) => s.pendentes);
  const estadoServidor = useLoja((s) => s.estadoServidor);
  const dormidas = useLoja((s) => s.dormidas);
  const clienteDestacado = useLoja((s) => s.clienteDestacado);
  const ordem = useEstadoTabela((s) => s.ordem);
  const filtros = useEstadoTabela((s) => s.filtros);
  const definirFiltros = useEstadoTabela((s) => s.definirFiltros);
  const marcada = useEstadoTabela((s) => s.marcada);
  const raiz = useRef<HTMLElement>(null);
  const idFiltro = useId();
  // A caixa onde a ficha está posta e se ela foi arrastada para fora do sítio de origem.
  const [areaFicha, setAreaFicha] = useState<HTMLDivElement | null>(null);
  const reserva = reservaDaFicha(Boolean(foco), useFichaMovida(areaFicha, Boolean(foco)));

  const linhas = useMemo(() => (estado && indices ? linhasDaTabela(estado, indices) : []), [estado, indices]);
  const visiveis = useMemo(
    () => ordenarLinhas(filtrarLinhas(linhas, filtros), ordem),
    [linhas, filtros, ordem],
  );
  const idsVisiveis = useMemo(() => visiveis.map((l) => l.pessoa.id), [visiveis]);
  const ordemVisivel = useRef(idsVisiveis);
  ordemVisivel.current = idsVisiveis;
  const obterOrdem = useCallback(() => ordemVisivel.current, []);
  // O Excel exporta o que se vê: com filtros, só as linhas filtradas (pela ordem da Tabela).
  const filtradas = useRef<readonly LinhaTabela[] | null>(null);
  filtradas.current = filtrosTabelaAtivos(filtros) ? visiveis : null;
  const obterFiltradas = useCallback(() => filtradas.current, []);

  // As opções dos filtros (com o nº de pessoas de cada uma) e as marcas dos clientes.
  const opcoesFiltros = useMemo(() => {
    if (!estado || !indices) return null;
    const o = opcoesFiltrosTabela(estado, indices, linhas);
    return {
      ...o,
      clientes: comMarcas(o.clientes, (id) => indices.clientes.get(id)),
      obras: comMarcas(o.obras, (id) => {
        const obra = indices.obras.get(id);
        return obra ? indices.clientes.get(obra.clienteId) : null;
      }),
    };
  }, [estado, indices, linhas]);

  // A ficha de uma pessoa aberta (pela pesquisa, pelo botão da linha, pela ficha de uma casa…): a linha
  // dela passa a ser a realçada; ao fechar a ficha, continua realçada (sabe-se onde se estava).
  useEffect(() => {
    if (foco?.tipo === 'pessoa' && !modoEdicao) useEstadoTabela.getState().definirMarcada(foco.id);
  }, [foco, modoEdicao]);

  // As opções das listas das células calculam-se uma vez por estado (useOpcoesTabela); as que não mudaram
  // (ex.: mudou uma carrinha e não uma casa) ficam as mesmas e a lista aberta não se redesenha.
  useLayoutEffect(() => {
    if (!modoEdicao || !estado || !indices) return;
    const antigas = useOpcoesTabela.getState();
    const estavel = (campo: CampoCelula, novas: OpcaoCelula[]) =>
      mesmasOpcoes(antigas[campo], novas) ? antigas[campo] : novas;
    useOpcoesTabela.setState({
      casa: estavel('casa', opcoesCasa(estado, indices)),
      carrinha: estavel('carrinha', opcoesCarrinha(estado, indices)),
      obra: estavel('obra', opcoesObra(estado, indices)),
    });
  }, [modoEdicao, estado, indices]);

  const antes = useMemo(
    () =>
      modoEdicao && estado && estadoServidor && pendentes.length > 0
        ? antesDasLinhas(pendentes, estadoServidor, estado)
        : SEM_ANTES,
    [modoEdicao, pendentes, estadoServidor, estado],
  );

  // "Confirmar todas as sugestões (N)" (onde dormem as carrinhas), no modo de edição.
  const nSugestoes = useMemo(
    () => (modoEdicao && estado && dormidas ? operacoesConfirmarSugestoes(estado, dormidas).length : 0),
    [modoEdicao, estado, dormidas],
  );

  // Pesquisa do cabeçalho e ligações da ficha: desliza até às linhas e acende-as. Se os
  // filtros as escondem todas, limpam-se (com aviso) e mostra-se depois de desenhar.
  useAoMostrar((elemento) => {
    const existentes = new Set(linhas.map((l) => l.pessoa.id));
    const ids = pessoasDoElemento(linhas, elemento).filter((id) => existentes.has(id));
    if (ids.length === 0) return;
    const chaves = ids.map((id) => chaveElemento({ tipo: 'pessoa', id }));
    const naTabela = new Set(idsVisiveis);
    if (ids.some((id) => naTabela.has(id))) {
      if (raiz.current) revelarElementos(raiz.current, chaves);
      return;
    }
    definirFiltros(FILTROS_INICIAIS);
    useUiEdicao.getState().avisar(`Filtros limpos para mostrar ${nomeDoElemento(elemento)}.`);
    revelarDepoisDeDesenhar(() => raiz.current, chaves);
  });

  function nomeDoElemento(elemento: ElementoVista): string {
    if (elemento.tipo === 'pessoa')
      return linhas.find((l) => l.pessoa.id === elemento.id)?.nomeMostrado ?? '';
    if (elemento.tipo === 'casa') return indices?.casas.get(elemento.id)?.nome ?? '';
    const carrinha = indices?.carrinhas.get(elemento.id);
    return carrinha ? formatarMatricula(carrinha.matricula) : '';
  }

  if (!estado || !indices || !opcoesFiltros) return null;

  const comFiltros = filtrosTabelaAtivos(filtros);
  const mudar = (mudanca: Partial<FiltrosTabela>) => definirFiltros({ ...filtros, ...mudanca });
  const contagem = textoContagem(visiveis.length, linhas.length, comFiltros);
  const haObras = estado.obras.length > 0;
  const clienteAceso = clienteDestacado ? (indices.clientes.get(clienteDestacado) ?? null) : null;

  return (
    <section
      ref={raiz}
      aria-label="Tabela de pessoas"
      className="relative flex min-h-0 flex-1 flex-col bg-white"
    >
      {/* No telemóvel: filtro e Excel; os quatro filtros (2 × 2); "Só a confirmar" e a contagem; a dica da edição.
          No PC tudo numa linha sempre que couber (a ordem muda com order-*). */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-1.5 sm:py-2">
        <div className="relative order-1 min-w-0 flex-1 basis-40 sm:w-56 sm:flex-none sm:basis-auto">
          <label htmlFor={idFiltro} className="sr-only">
            Filtrar a tabela
          </label>
          <IconeLupa className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id={idFiltro}
            type="search"
            value={filtros.texto}
            onChange={(e) => mudar({ texto: e.target.value })}
            placeholder="Filtrar por nome, Nº, casa…"
            autoComplete="off"
            spellCheck={false}
            className={`${CAMPO} w-full pl-8`}
          />
        </div>
        <div className="order-3 grid w-full grid-cols-2 gap-2 sm:order-2 sm:flex sm:w-auto">
          <FiltroMultiplo
            rotulo="Cliente"
            genero="m"
            opcoes={opcoesFiltros.clientes}
            escolhidos={filtros.clientes}
            aoMudar={(clientes) => mudar({ clientes })}
            {...FILTRO}
          />
          <FiltroMultiplo
            rotulo="Casa"
            opcoes={opcoesFiltros.casas}
            escolhidos={filtros.casas}
            aoMudar={(casas) => mudar({ casas })}
            {...FILTRO}
          />
          <FiltroMultiplo
            rotulo="Carrinha"
            opcoes={opcoesFiltros.carrinhas}
            escolhidos={filtros.carrinhas}
            aoMudar={(carrinhas) => mudar({ carrinhas })}
            {...FILTRO}
          />
          <FiltroMultiplo
            rotulo="Obra"
            opcoes={opcoesFiltros.obras}
            escolhidos={filtros.obras}
            aoMudar={(obras) => mudar({ obras })}
            textoVazio="sem obras"
            larguraPainel={320}
            {...FILTRO}
          />
        </div>
        <label className="order-4 flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-slate-700 sm:order-3">
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
            className={`order-5 shrink-0 rounded px-1 text-sm text-slate-600 underline sm:order-4 underline-offset-2 hover:text-slate-900 ${FOCO_VISIVEL}`}
          >
            Limpar filtros
          </button>
        )}
        {clienteAceso && <ClienteAceso cliente={clienteAceso} />}
        {/* Com o botão das sugestões, no PC (até 1536 px) a dica e o botão passam para uma 2.ª linha. */}
        {modoEdicao && (
          <div
            className={`order-7 flex w-full min-w-0 items-center gap-2 ${nSugestoes > 0 ? 'sm:order-8 2xl:order-5 2xl:w-auto' : 'sm:order-5 sm:w-auto'}`}
          >
            <p
              className={`min-w-0 text-[11px] leading-tight text-amber-900 sm:text-xs ${nSugestoes > 0 ? 'flex-1 sm:flex-none' : 'flex-1 sm:max-w-[15rem] 2xl:max-w-none'}`}
            >
              Muda nas células ou seleciona linhas e usa Mover para…
            </p>
            {nSugestoes > 0 && (
              <button
                type="button"
                onClick={() => useUiEdicao.getState().abrirDialogo({ tipo: 'confirmar-sugestoes' })}
                title="Cada carrinha passa a dormir na casa onde moram mais passageiros (pede confirmação)"
                className={BOTAO_MINI}
              >
                <IconeDormir className="size-3.5 text-slate-500" />
                Confirmar <span className="max-sm:hidden">todas as</span> sugestões ({nSugestoes})
              </button>
            )}
          </div>
        )}
        <p
          role="status"
          className="order-6 ml-auto text-sm whitespace-nowrap text-slate-700 tabular-nums sm:mr-1"
        >
          {contagem}
        </p>
        <div className="order-2 flex shrink-0 sm:order-7">
          <BotaoExcelTabela filtradas={obterFiltradas} />
        </div>
      </div>
      {/* A ficha fica por cima da tabela, fora da caixa que desliza (não desliza com as linhas). */}
      <div ref={setAreaFicha} className="relative flex min-h-0 flex-1 flex-col">
        {/* relative: os textos só para leitores de ecrã (sr-only, absolutos) ficam presos a esta caixa.
            Com a ficha aberta, a tabela deixa-lhe espaço (reservaDaFicha: em baixo no telemóvel; à direita
            no PC, só com a ficha no sítio de origem): as colunas e as últimas linhas continuam a
            alcançar-se, deslizando. */}
        <div
          className={`relative min-h-0 flex-1 overflow-auto overscroll-contain ${reserva.baixo ? 'max-sm:scroll-pb-[60vh]' : ''} ${reserva.direita ? 'sm:scroll-pr-[23.5rem] sm:pr-[23.5rem]' : ''}`}
        >
          <table
            className={`w-full border-separate border-spacing-0 text-sm ${modoEdicao ? 'min-w-[76rem]' : 'min-w-[60rem]'}`}
          >
            <caption className="sr-only">
              Pessoas ({contagem}). O botão a seguir a cada nome abre a ficha da pessoa
              {modoEdicao ? '; no modo de edição muda-se nas células e selecionam-se linhas.' : '.'}
            </caption>
            <thead>
              <tr>
                {modoEdicao && <CaixaTodas ids={idsVisiveis} />}
                {COLUNAS_TABELA.map((c) => (
                  <Cabecalho
                    key={c.id}
                    coluna={c.id}
                    rotulo={c.rotulo}
                    ordem={ordem}
                    modoEdicao={modoEdicao}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                const selecionada = modoEdicao && selecao.has(l.pessoa.id);
                const realce = realceDaLinha(l, foco, modoEdicao ? null : marcada);
                return (
                  <LinhaPessoa
                    key={l.pessoa.id}
                    linha={l}
                    modoEdicao={modoEdicao}
                    selecionada={selecionada}
                    realce={realce}
                    apagada={linhaApagada(l, clienteDestacado, selecionada || realce === 'foco')}
                    haObras={haObras}
                    antes={antes.get(l.pessoa.id)}
                    obterOrdem={obterOrdem}
                  />
                );
              })}
              {visiveis.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUNAS_TABELA.length + (modoEdicao ? 1 : 0)}
                    className="px-3 py-6 text-sm text-slate-600"
                  >
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
          {/* No telemóvel a ficha tapa a parte de baixo: espaço para as últimas linhas subirem acima dela
              (um espaçador e não padding, que faria a caixa crescer e a página deslizar). */}
          {foco && <div aria-hidden="true" className="h-[60vh] sm:hidden" />}
        </div>
        <PainelFoco lugar="vista" />
      </div>
      <ContornoEdicao />
    </section>
  );
}
