// Vista Tabela: uma linha por pessoa ativa — Nome, Nº, Cliente, Obra, Casa, Carrinha, Condutor e o que
// está por confirmar. O nome é o completo com maiúsculas normais (dominio/nomes.ts), numa só etiqueta da
// cor do cliente e sem a sigla (a coluna Cliente já a mostra). Ordena-se clicando no cabeçalho
// (aria-sort); o campo da barra filtra (indiferente a acentos), com filtros de escolha múltipla por
// cliente, casa, carrinha e obra (comum/FiltroMultiplo: Casa 1 e Casa 2 ao mesmo tempo; entre filtros é E).
// O cabeçalho fica fixo; no telemóvel a tabela desliza dentro do seu contentor (a página nunca desliza na
// horizontal) e a coluna do nome fica presa à esquerda. A ordem e os filtros mantêm-se ao mudar de vista.
//
// Só muda de vista com o botão "Ver no mapa" (docs/vistas-edicao.md). A linha já mostra tudo da pessoa:
// clicar nela só a realça e, fora do modo de edição, na Tabela não há ficha da pessoa (pedido do Rafael,
// 04/10/2026: era inútil). O botão a seguir ao nome é o "Ver no mapa" (navegar.verNoMapa), que muda para o
// Mapa e lá põe a pessoa em foco. O nome da casa e a matrícula abrem a ficha da casa ou da carrinha
// (PainelFoco, por cima da tabela; a da casa tem o aviso do contrato). Uma pessoa em foco (pesquisa, nomes
// da ficha de uma casa) só realça a linha; as linhas da casa ou carrinha em foco ficam levemente realçadas.
// A pesquisa do cabeçalho e as ligações da ficha mostram aqui (useAoMostrar): desliza até às linhas e
// acende-as, limpando os filtros que as escondam. O realce por cliente da legenda do Mapa não conta aqui: a
// Tabela tem o filtro Cliente.
// O Excel da barra exporta o que se vê: com filtros, a folha Pessoas só tem as linhas filtradas.
//
// No modo de edição mostra a simulação (o rascunho) e edita como o mapa: coluna de caixas de seleção
// (e "todas as visíveis"), clique na linha = seleção como nos nomes (Ctrl/⌘, Shift pela ordem visível),
// Casa, Carrinha e Obra em listas (cada escolha é um passo do rascunho), o condutor num botão, células
// alteradas a âmbar com "antes: …". Várias de uma vez: selecionar e "Mover para…" da barra âmbar. Ao lado
// das listas Casa e Carrinha, um botão abre a ficha da casa/carrinha; na barra, "Confirmar todas as
// sugestões (N)" (onde dormem as carrinhas), como no Quadro por carrinhas e na lista lateral.
// Os dados da pessoa (nº, nomes, cliente, telefone, carta), "Marcar indisponível…", "Mudar…", o condutor e
// "Saiu da empresa…" (o Rafael, 05/10/2026: "não aceito" que só se mudem no Mapa e no Quadro): no modo de
// edição, a seguir ao nome, o botão "Editar…" (e o "Ver no mapa" só com o ícone, para a coluna presa não
// crescer) abre a MESMA ficha editável do Mapa e do Quadro, posta como as da casa e da carrinha (no
// telemóvel em baixo). Só esse botão a abre (useEstadoTabela.editar; linhasTabela.editarQueFica): a
// pesquisa e os nomes continuam só a realçar a linha, e o clique na linha só a seleciona. ✕/Esc fecham-na e
// devolvem o foco do teclado ao "Editar…"; Guardar e Cancelar fecham-na; depois de "Saiu da empresa…"
// fecha e a linha esconde-se (salvo com "Mostrar quem saiu").
//
// M2 (docs/m2.md, "Indisponível"): coluna "Indisponível" ("até 12/10", "sem regresso"; ordenável; só as
// datas, nunca o motivo) e o filtro "Indisponível" (Indisponíveis hoje, Disponíveis hoje, Com períodos
// futuros); no modo de edição a célula tem um botão pequeno "Marcar…" (abre o diálogo) ou "Já voltou" (o
// período acaba ontem). A caixa "Mostrar quem saiu" junta as pessoas com ativa = false, esbatidas e com a
// etiqueta "saiu"; essas linhas não se selecionam nem se mudam nas células (mover quem saiu é recusado).
// Quem saiu não está no mapa: na linha dela, em vez do "Ver no mapa", o botão "Voltou à empresa…" (fora
// do modo de edição entra nele primeiro, como os "Mudar…" da ficha) abre o DialogoSaida desse caso. Sem a
// caixa a Tabela é a de sempre.

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
import { formatarDiaMes } from '../../dominio/datas';
import { operacoesTerminarPeriodo } from '../../dominio/indisponibilidade';
import type { Cliente, Id } from '../../dominio/tipos';
import { modoDoClique } from '../arrastar/selecao';
import { FiltroMultiplo, type OpcaoFiltroMultiplo } from '../comum/FiltroMultiplo';
import { IconeVolante } from '../comum/IconeVolante';
import { formatarMatricula, Matricula } from '../comum/Matricula';
import {
  abrirVoltouAEmpresa,
  definirCondutorComAviso,
  desfazerComAviso,
  limparSelecaoComAviso,
  moverComAviso,
  refazerComAviso,
} from '../edicao/acoes';
import { BOTAO_MINI } from '../edicao/classes';
import { aplicarComAviso } from '../edicao/DialogoIndisponivel';
import { ContornoEdicao } from '../edicao/Edicao';
import { IconeLapis } from '../edicao/icones';
import { operacoesConfirmarSugestoes } from '../edicao/ondeDorme';
import { abrirIndisponivel, haDialogoAberto, useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { IconeCarrinhaLado, IconeCarroLado, IconeCasa, IconeDormir, IconeLupa } from '../lista/icones';
import { FOCO_VISIVEL } from '../paineis/classes';
import { haFichaDaPessoa } from '../paineis/fichas';
import { PainelFoco } from '../paineis/PainelFoco';
import { MarcaAConfirmar, MarcaCliente } from '../paineis/pecas';
import { ROTULO_FORA_DAS_CASAS } from '../paineis/textos';
import {
  type AntesDaLinha,
  acaoIndisponivel,
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
  rotulosAcaoIndisponivel,
  teclaMudaLista,
  valorDaCelula,
} from './celulasTabela';
import { exportarExcel } from './excel';
import { IconeDescarregar, IconeMapa, IconeOrdem } from './icones';
import {
  acaoLinhaDaFicha,
  ariaSort,
  type BotaoDaLinha,
  botoesDaLinha,
  COLUNAS_TABELA,
  type ColunaTabela,
  cliqueTiraOFoco,
  descricaoIndisponivel,
  deslocamentoParaVer,
  editarQueFica,
  FILTROS_INICIAIS,
  type FiltrosTabela,
  filtrarLinhas,
  filtrosTabelaAtivos,
  type LinhaDaFicha,
  type LinhaTabela,
  linhasDaTabela,
  marcadaDepoisDoClique,
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
  seguirEditar,
  selecaoComVisiveis,
  textoAteCurto,
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
import { verNoMapa } from './navegar';
import { BOTAO_VISTA, NomeVista } from './pecas';

/**
 * Ordem, filtros e a linha realçada pelo clique: ficam ao ir ao mapa e voltar (não ao recarregar a
 * página).
 */
const useEstadoTabela = create<{
  ordem: OrdemTabela;
  filtros: FiltrosTabela;
  /** A linha em que se clicou (fora do modo de edição): realçada (na Tabela não há ficha da pessoa). */
  marcada: Id | null;
  /** M2: "Mostrar quem saiu" (as pessoas com ativa = false). Não é um filtro: "Limpar filtros" não a tira. */
  comQuemSaiu: boolean;
  /**
   * A pessoa do último "Editar…" (só no modo de edição): a ficha dela abre na Tabela enquanto for o foco
   * (linhasTabela.editarQueFica; esquece-se quando o foco muda ou se sai do modo de edição).
   */
  editar: Id | null;
  definirOrdem: (ordem: OrdemTabela) => void;
  definirFiltros: (filtros: FiltrosTabela) => void;
  definirMarcada: (marcada: Id | null) => void;
  definirComQuemSaiu: (comQuemSaiu: boolean) => void;
  definirEditar: (editar: Id | null) => void;
}>()((set) => ({
  ordem: ORDEM_INICIAL,
  filtros: FILTROS_INICIAIS,
  marcada: null,
  comQuemSaiu: false,
  editar: null,
  definirOrdem: (ordem) => set({ ordem }),
  definirFiltros: (filtros) => set({ filtros }),
  definirMarcada: (marcada) => set({ marcada }),
  definirComQuemSaiu: (comQuemSaiu) => set({ comQuemSaiu }),
  definirEditar: (editar) => set({ editar }),
}));

// O "Editar…" esquece-se quando o foco sai dessa pessoa ou se sai do modo de edição, também com a Tabela
// noutra vista (desmontada): senão a ficha abria sozinha ao voltar à Tabela (linhasTabela.seguirEditar).
seguirEditar(
  useLoja,
  () => useEstadoTabela.getState().editar,
  (editar) => useEstadoTabela.getState().definirEditar(editar),
);

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

/**
 * Botão com contorno a seguir ao nome ("Editar…", "Voltou à empresa…"): 28 px de altura, com o alvo de
 * toque alargado sem sair da linha.
 */
const BOTAO_LINHA_CONTORNO = `relative ml-1 inline-flex h-7 shrink-0 items-center rounded border border-slate-300 bg-white text-xs whitespace-nowrap text-slate-700 before:absolute before:-inset-x-1 before:-inset-y-0.5 before:content-[''] hover:bg-slate-100 hover:text-slate-900 ${FOCO_VISIVEL}`;

/** Marca o 1.º botão a seguir ao nome com o id da pessoa (para lhe devolver o foco do teclado). */
const ATRIBUTO_BOTAO_LINHA = 'data-botao-da-linha';

const AZUL_SELECAO = '#2563eb';
const AZUL_FOCO = '#1d4ed8';
/**
 * Barra da linha em que se clicou: mais clara do que a da pessoa em foco (pesquisa, nome na ficha de uma
 * casa), que deixa de estar em foco ao clicar noutra linha.
 */
const AZUL_MARCADA = '#60a5fa';

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

/**
 * Célula "Indisponível": "até 12/10" / "sem regresso" (ou, sem período hoje, o 1.º dia do próximo, a cinzento)
 * e, no modo de edição, o botão pequeno "Marcar…" ou "Já voltou" (um passo do rascunho).
 */
function CelulaIndisponivel({ linha, modoEdicao }: { linha: LinhaTabela; modoEdicao: boolean }) {
  const periodo = linha.indisponivel;
  const hoje = useLoja((s) => s.hoje);
  const acao = modoEdicao ? acaoIndisponivel(linha, hoje) : null;
  const rotulos = acao ? rotulosAcaoIndisponivel(linha.nomeMostrado, acao) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {periodo ? (
        <span title={descricaoIndisponivel(periodo)} className="font-medium text-slate-800">
          {textoAteCurto(periodo)}
        </span>
      ) : linha.proximoInicio !== null ? (
        <span className="text-xs text-slate-500 italic" title="Próximo período de indisponibilidade">
          a partir de {formatarDiaMes(linha.proximoInicio)}
        </span>
      ) : null}
      {acao && rotulos && (
        <button
          type="button"
          aria-label={rotulos.nome}
          title={rotulos.nome}
          onClick={(e) => {
            e.stopPropagation();
            if (acao.tipo === 'marcar') {
              abrirIndisponivel([linha.pessoa.id]);
              return;
            }
            const { estado, hoje } = useLoja.getState();
            if (estado) aplicarComAviso(operacoesTerminarPeriodo(estado, acao.periodoId, hoje));
          }}
          className={BOTAO_MINI}
        >
          {rotulos.texto}
        </button>
      )}
    </span>
  );
}

interface PropsLinha {
  linha: LinhaTabela;
  modoEdicao: boolean;
  selecionada: boolean;
  realce: RealceLinha;
  /** Há obras no estado (sem obras e sem obra na pessoa, a célula fica "sem obra", como na ficha). */
  haObras: boolean;
  antes: AntesDaLinha | undefined;
  /** A ficha desta pessoa está aberta na Tabela (pelo "Editar…"). */
  comFicha: boolean;
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
    a.condutor === b.condutor &&
    a.indisponivel === b.indisponivel &&
    a.proximoInicio === b.proximoInicio &&
    a.saiu === b.saiu
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
  haObras,
  antes,
  comFicha,
  obterOrdem,
}: PropsLinha) {
  const id = l.pessoa.id;
  const casa = l.casa;
  const carrinha = l.carrinha;
  const conduz = l.condutor;
  // Quem saiu da empresa (com "Mostrar quem saiu") só se lê: não se seleciona nem se muda nas células.
  const edita = modoEdicao && !l.saiu;
  const tituloCarrinha = carrinha
    ? `Abrir a ficha ${carrinha.tipo === 'carro' ? 'do carro' : 'da carrinha'} ${formatarMatricula(carrinha.matricula)}`
    : '';

  // O clique na linha realça-a (no modo de edição, seleciona) e nunca abre ficha: a linha já mostra tudo
  // (com a ficha de uma casa ou carrinha aberta, ou a da pessoa do "Editar…", ela fica como está). Uma pessoa
  // em foco sem ficha (pesquisa, nome na ficha de uma casa) tem só o realce da linha: um clique numa linha
  // tira-lhe o foco (não ficam duas realçadas; na linha dela fica só a marcada, e o clique seguinte tira o
  // realce, como nas outras). Os controlos das células param o clique.
  const aoClicar = (e: MouseEvent<HTMLTableRowElement>) => {
    if (edita) useLoja.getState().selecionar(id, modoDoClique(e), obterOrdem());
    const { marcada, definirMarcada, editar } = useEstadoTabela.getState();
    const { foco, definirFoco } = useLoja.getState();
    const focoPessoaId = foco?.tipo === 'pessoa' ? foco.id : null;
    definirMarcada(marcadaDepoisDoClique(id, marcada, modoEdicao, focoPessoaId));
    if (cliqueTiraOFoco(focoPessoaId, editarQueFica(editar, foco, modoEdicao))) definirFoco(null);
  };
  // Ao abrir a ficha da casa ou da carrinha, a linha fica à vista (no telemóvel a ficha abre em baixo, por
  // cima das linhas).
  const abrir = (e: MouseEvent<HTMLElement>, foco: ElementoVista) => {
    e.stopPropagation();
    useLoja.getState().definirFoco(foco);
    const tr = e.currentTarget.closest('tr');
    if (tr) manterLinhaAVista(tr);
  };
  // "Ver no mapa" a seguir ao nome (onde o olho procura a pessoa): muda para o Mapa e põe-na lá em foco.
  // Fica na célula presa do nome: à vista em qualquer largura e nos dois modos. Ao voltar à Tabela, a
  // linha está realçada (fora do modo de edição).
  const irAoMapa = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!modoEdicao) useEstadoTabela.getState().definirMarcada(id);
    verNoMapa({ tipo: 'pessoa', id });
  };
  // Quem saiu da empresa não está no mapa: em vez do "Ver no mapa", "Voltou à empresa…" (abre o
  // DialogoSaida; fora do modo de edição entra nele primeiro).
  const voltou = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    abrirVoltouAEmpresa(id);
  };
  // "Editar…" (só no modo de edição): abre a ficha editável da pessoa por cima da Tabela, como as da casa e
  // da carrinha, e mantém a linha à vista (no telemóvel a ficha abre em baixo).
  const editar = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    useEstadoTabela.getState().definirEditar(id);
    useLoja.getState().definirFoco({ tipo: 'pessoa', id });
    const tr = e.currentTarget.closest('tr');
    if (tr) manterLinhaAVista(tr);
  };
  const botao = ({ tipo, comTexto }: BotaoDaLinha, i: number) => {
    // O 1.º botão da linha recebe o foco do teclado quando a ficha da pessoa fecha (✕/Esc, "Saiu…").
    const marca = i === 0 ? { [ATRIBUTO_BOTAO_LINHA]: id } : {};
    if (tipo === 'voltou') {
      return (
        <button
          key={tipo}
          type="button"
          {...marca}
          onClick={voltou}
          aria-label={`${l.nomeMostrado} voltou à empresa…`}
          title={`${l.nomeMostrado} voltou à empresa (no modo de edição; fica por guardar)`}
          className={`${BOTAO_LINHA_CONTORNO} px-1.5`}
        >
          <span aria-hidden="true" className="md:hidden">
            Voltou…
          </span>
          <span aria-hidden="true" className="hidden md:inline">
            Voltou à empresa…
          </span>
        </button>
      );
    }
    if (tipo === 'editar') {
      return (
        <button
          key={tipo}
          type="button"
          {...marca}
          onClick={editar}
          aria-label={`Editar ${l.nomeMostrado}`}
          aria-expanded={comFicha}
          title={`Editar ${l.nomeMostrado}`}
          // Azul com a ficha aberta: pela variante aria-expanded, que ganha às cores do contorno (classes
          // condicionais com a mesma especificidade perdiam conforme a ordem do CSS e ficava branco).
          className={`${BOTAO_LINHA_CONTORNO} min-w-7 justify-center gap-1 md:px-1.5 aria-expanded:border-blue-700 aria-expanded:bg-blue-50 aria-expanded:text-blue-900`}
        >
          <IconeLapis className="size-3.5" />
          <span aria-hidden="true" className="hidden md:inline">
            Editar…
          </span>
        </button>
      );
    }
    return (
      <button
        key={tipo}
        type="button"
        {...marca}
        onClick={irAoMapa}
        aria-label={`Ver ${l.nomeMostrado} no mapa`}
        title={`Ver ${l.nomeMostrado} no mapa`}
        // Alvo de toque maior do que o ícone (6 px de cada lado). A seguir ao "Editar…" (i > 0) só 2 px à
        // esquerda: o espaço entre os dois é de 4 px (ml-1) e o alvo não pode entrar no lápis, que fica
        // antes (um toque na ponta do lápis ia ao Mapa).
        className={`relative ml-1 inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded text-xs whitespace-nowrap text-slate-500 group-hover:text-slate-700 before:absolute before:-inset-y-0.5 ${i > 0 ? 'before:-right-1.5 before:-left-0.5' : 'before:-inset-x-1.5'} before:content-[''] hover:bg-slate-200 hover:text-slate-900 ${comTexto ? 'md:px-1.5' : ''} ${FOCO_VISIVEL}`}
      >
        <IconeMapa className="size-4" />
        {comTexto && (
          <span aria-hidden="true" className="hidden md:inline">
            Ver no mapa
          </span>
        )}
      </button>
    );
  };

  const fundo =
    selecionada || realce === 'foco' || realce === 'marcada'
      ? 'bg-blue-50'
      : realce === 'ligada'
        ? 'bg-slate-100'
        : 'bg-white group-hover:bg-slate-50';
  const fundoDe = (antesCelula: string | undefined) => (antesCelula ? 'bg-amber-50' : fundo);

  // Contorno azul da linha selecionada (sombras por dentro das células: as presas tapariam um contorno da
  // linha) e a barra à esquerda da linha em foco (mais clara na linha só realçada), na primeira célula presa.
  const horizontais = selecionada ? [`inset 0 1px 0 ${AZUL_SELECAO}`, `inset 0 -1px 0 ${AZUL_SELECAO}`] : [];
  const sombra = (lado: string | null): CSSProperties | undefined => {
    const todas = lado ? [lado, ...horizontais] : horizontais;
    return todas.length > 0 ? { boxShadow: todas.join(', ') } : undefined;
  };
  const meio = sombra(null);
  const naPrimeira = sombra(
    realce === 'foco'
      ? `inset 4px 0 0 ${AZUL_FOCO}`
      : realce === 'marcada'
        ? `inset 4px 0 0 ${AZUL_MARCADA}`
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
      className="group cursor-pointer"
    >
      {modoEdicao && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: só impede o clique da linha; o teclado usa a caixa.
        <td
          className={`${CELULA} ${PRESA_CAIXA} z-[1] p-0 ${fundo}`}
          style={naPrimeira}
          onClick={(e) => e.stopPropagation()}
        >
          <label
            className={`flex min-h-8 w-full items-center justify-center ${edita ? 'cursor-pointer' : 'invisible'}`}
          >
            <span className="sr-only">Selecionar {l.nomeMostrado}</span>
            <input
              type="checkbox"
              disabled={!edita}
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
            saiu={l.saiu}
            // No telemóvel, a editar, mais estreita (8 rem): ao lado vão o "Editar…" e o "Ver no mapa" (dois
            // ícones) e a coluna presa cresce só ~1 rem em relação ao "Ver no mapa" sozinho.
            className={`${modoEdicao ? 'w-[8rem]' : 'w-[12rem]'} shrink-0 text-[13px] sm:w-[16rem] 2xl:w-[18.5rem]`}
          />
          {/* "Ver no mapa" discreto (cinzento) mas sempre à vista: fora do modo de edição no PC com o texto,
              no telemóvel só o ícone (a coluna presa não cresce); no toque o alvo é maior do que o ícone
              (40 × 32 px). No modo de edição, antes dele, "Editar…" (com contorno; no telemóvel só o lápis)
              e o "Ver no mapa" só com o ícone. Quem saiu tem no mesmo sítio só "Voltou à empresa…" (no
              telemóvel "Voltou…"). botoesDaLinha diz quais. */}
          {botoesDaLinha(l, modoEdicao).map(botao)}
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
        {edita && (haObras || l.obra) ? (
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
        {edita ? (
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
        {edita ? (
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
        {edita && carrinha ? (
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
      <td className={`${CELULA} whitespace-nowrap ${fundo}`} style={meio}>
        <CelulaIndisponivel linha={l} modoEdicao={modoEdicao} />
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
 * Excel da Tabela: como o das outras vistas (pecas/BotaoExcel), mas com filtros a folha Pessoas só tem as
 * linhas que se veem, pela ordem da Tabela (o ficheiro diz "filtrado"). `filtradas` = null sem filtros nem
 * "Mostrar quem saiu" (com ela vêm as linhas, também as de quem saiu, mas o nome só diz "filtrado" com filtros).
 */
function BotaoExcelTabela({ filtradas }: { filtradas: () => readonly LinhaTabela[] | null }) {
  const [aExportar, setAExportar] = useState(false);
  const comFiltros = useEstadoTabela((s) => filtrosTabelaAtivos(s.filtros));
  const exportar = async () => {
    const { estado, indices, dormidas, modoEdicao, pendentes } = useLoja.getState();
    if (!estado || !indices || !dormidas || aExportar) return;
    setAExportar(true);
    try {
      await exportarExcel(
        estado,
        indices,
        dormidas,
        modoEdicao && pendentes.length > 0,
        filtradas(),
        filtrosTabelaAtivos(useEstadoTabela.getState().filtros),
      );
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
  const ordem = useEstadoTabela((s) => s.ordem);
  const filtros = useEstadoTabela((s) => s.filtros);
  const definirFiltros = useEstadoTabela((s) => s.definirFiltros);
  const marcada = useEstadoTabela((s) => s.marcada);
  const comQuemSaiu = useEstadoTabela((s) => s.comQuemSaiu);
  const editar = useEstadoTabela((s) => s.editar);
  const raiz = useRef<HTMLElement>(null);
  const idFiltro = useId();
  // A pessoa com a ficha aberta na Tabela: a do "Editar…", no modo de edição, enquanto é o foco e está na
  // empresa (o mesmo haFichaDaPessoa do PainelFoco). Uma pessoa em foco sem ela só realça a linha.
  const editarAberto = editarQueFica(editar, foco, modoEdicao);
  const pessoaEditada = editarAberto !== null ? indices?.pessoas.get(editarAberto) : undefined;
  const comFicha =
    pessoaEditada && haFichaDaPessoa('tabela', pessoaEditada, { modoEdicao, editar })
      ? pessoaEditada.id
      : null;
  // A caixa onde a ficha está posta e se ela foi arrastada para fora do sítio de origem. As casas e as
  // carrinhas têm ficha na Tabela; uma pessoa só a do "Editar…".
  const [areaFicha, setAreaFicha] = useState<HTMLDivElement | null>(null);
  const haFicha = foco !== null && (foco.tipo !== 'pessoa' || comFicha !== null);
  const reserva = reservaDaFicha(haFicha, useFichaMovida(areaFicha, haFicha));

  const linhas = useMemo(
    () => (estado && indices ? linhasDaTabela(estado, indices, { comQuemSaiu }) : []),
    [estado, indices, comQuemSaiu],
  );
  const visiveis = useMemo(
    () => ordenarLinhas(filtrarLinhas(linhas, filtros), ordem),
    [linhas, filtros, ordem],
  );
  const idsVisiveis = useMemo(() => visiveis.map((l) => l.pessoa.id), [visiveis]);
  // Só se selecionam as linhas de quem está na empresa (quem saiu só aparece com "Mostrar quem saiu").
  const idsSelecionaveis = useMemo(() => visiveis.filter((l) => !l.saiu).map((l) => l.pessoa.id), [visiveis]);
  const ordemVisivel = useRef(idsSelecionaveis);
  ordemVisivel.current = idsSelecionaveis;
  const obterOrdem = useCallback(() => ordemVisivel.current, []);
  // O Excel exporta o que se vê: com filtros, só as linhas filtradas (pela ordem da Tabela); com "Mostrar
  // quem saiu", também essas linhas (com "(saiu)" no nome), mesmo sem filtros.
  const filtradas = useRef<readonly LinhaTabela[] | null>(null);
  filtradas.current = filtrosTabelaAtivos(filtros) || comQuemSaiu ? visiveis : null;
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

  // Uma pessoa em foco (pela pesquisa, pelos nomes da ficha de uma casa…): a linha dela passa a ser a
  // realçada; quando deixa de estar em foco, continua realçada (sabe-se onde se estava).
  useEffect(() => {
    if (foco?.tipo === 'pessoa' && !modoEdicao) useEstadoTabela.getState().definirMarcada(foco.id);
  }, [foco, modoEdicao]);

  // "Editar…": esquece-se quando o foco muda (✕, Esc, pesquisa, ligações da ficha) ou se sai do modo de
  // edição (Guardar, Cancelar; seguirEditar fá-lo também com a Tabela noutra vista; aqui fica por
  // segurança). Depois de "Saiu da empresa…" a ficha fecha (haFichaDaPessoa) e tira-se o
  // foco à pessoa (com "Mostrar quem saiu" a linha dela fica, sem realce de foco).
  useEffect(() => {
    if (editar === null) return;
    if (editarAberto === null) {
      useEstadoTabela.getState().definirEditar(null);
      return;
    }
    if (pessoaEditada && !pessoaEditada.ativa) useLoja.getState().definirFoco(null);
  }, [editar, editarAberto, pessoaEditada]);

  // A ficha da pessoa fechou (✕, Esc, "Saiu da empresa…") ainda no modo de edição: o foco do teclado, que
  // ficou no vazio (o botão que o tinha saiu da página), volta ao "Editar…" da linha (ou ao "Voltou à
  // empresa…" de quem acabou de sair). Se foi para outro sítio (a pesquisa), fica lá.
  const fichaAntes = useRef<Id | null>(null);
  useEffect(() => {
    const antes = fichaAntes.current;
    fichaAntes.current = comFicha;
    if (antes === null || antes === comFicha || !modoEdicao) return;
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body) return;
    raiz.current
      ?.querySelector<HTMLElement>(`[${ATRIBUTO_BOTAO_LINHA}="${CSS.escape(antes)}"]`)
      ?.focus({ preventScroll: true });
  }, [comFicha, modoEdicao]);

  // A linha da pessoa com a ficha aberta fica à vista também quando a ficha muda o que ordena ou filtra a
  // Tabela (o nome com a Tabela por Nome, a casa com o filtro Casa…): volta a pôr-se à vista, ou limpam-se
  // os filtros que a passaram a esconder (linhasTabela.acaoLinhaDaFicha). Ao abrir, quem a põe à vista é o
  // "Editar…".
  const indiceFicha = comFicha === null ? -1 : idsVisiveis.indexOf(comFicha);
  const nomeFicha =
    comFicha === null ? '' : (linhas.find((l) => l.pessoa.id === comFicha)?.nomeMostrado ?? '');
  const linhaDaFichaAntes = useRef<LinhaDaFicha>({ id: null, indice: -1, filtros });
  useLayoutEffect(() => {
    const antes = linhaDaFichaAntes.current;
    const agora: LinhaDaFicha = { id: comFicha, indice: indiceFicha, filtros };
    linhaDaFichaAntes.current = agora;
    const acao = acaoLinhaDaFicha(antes, agora);
    if (acao === 'limpar-filtros') {
      useEstadoTabela.getState().definirFiltros(FILTROS_INICIAIS);
      useUiEdicao.getState().avisar(`Filtros limpos para mostrar ${nomeFicha}.`);
    } else if (acao === 'mostrar' && comFicha !== null) {
      const chave = CSS.escape(chaveElemento({ tipo: 'pessoa', id: comFicha }));
      const tr = raiz.current?.querySelector<HTMLTableRowElement>(`tr[data-elemento="${chave}"]`);
      if (tr) manterLinhaAVista(tr);
    }
  }, [comFicha, indiceFicha, filtros, nomeFicha]);

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
    if (elemento.tipo === 'obra') return estado?.obras.find((o) => o.id === elemento.id)?.nome ?? '';
    const carrinha = indices?.carrinhas.get(elemento.id);
    return carrinha ? formatarMatricula(carrinha.matricula) : '';
  }

  if (!estado || !indices || !opcoesFiltros) return null;

  const comFiltros = filtrosTabelaAtivos(filtros);
  const mudar = (mudanca: Partial<FiltrosTabela>) => definirFiltros({ ...filtros, ...mudanca });
  const contagem = textoContagem(visiveis.length, linhas.length, comFiltros);
  const haObras = estado.obras.length > 0;

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
          <FiltroMultiplo
            rotulo="Indisponível"
            genero="m"
            opcoes={opcoesFiltros.indisponivel}
            escolhidos={filtros.indisponivel}
            aoMudar={(indisponivel) => mudar({ indisponivel })}
            legenda="Filtrar por indisponível"
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
        <label className="order-4 flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-slate-700 sm:order-3">
          <input
            type="checkbox"
            checked={comQuemSaiu}
            onChange={(e) => useEstadoTabela.getState().definirComQuemSaiu(e.target.checked)}
            className="size-4 accent-slate-800"
          />
          Mostrar quem saiu
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
            className={`w-full border-separate border-spacing-0 text-sm ${modoEdicao ? 'min-w-[84rem]' : 'min-w-[66rem]'}`}
          >
            <caption className="sr-only">
              Pessoas ({contagem}). O botão a seguir a cada nome mostra a pessoa no mapa (na de quem saiu:
              Voltou à empresa)
              {modoEdicao
                ? '; no modo de edição, Editar abre a ficha da pessoa, muda-se nas células e selecionam-se linhas.'
                : '.'}
            </caption>
            <thead>
              <tr>
                {modoEdicao && <CaixaTodas ids={idsSelecionaveis} />}
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
                    haObras={haObras}
                    antes={antes.get(l.pessoa.id)}
                    comFicha={comFicha === l.pessoa.id}
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
          {haFicha && <div aria-hidden="true" className="h-[60vh] sm:hidden" />}
        </div>
        {/* Na Tabela há as fichas da casa e da carrinha e, no modo de edição, a da pessoa do "Editar…";
            lembra a sua posição. */}
        <PainelFoco lugar="vista" vista="tabela" editar={editar} />
      </div>
      <ContornoEdicao />
    </section>
  );
}
