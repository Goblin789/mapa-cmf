// Vista Quadro: as casas, as carrinhas ou as obras em blocos (Casas | Carrinhas | Obras na barra), como as
// folhas do Michael. Cada bloco tem o nome (ou a matrícula) e a pastilha da lotação (numa obra, o nº de
// pessoas) no cabeçalho, os nomes por baixo (condutor primeiro, com o volante) e, em baixo, a ligação: numa
// casa as carrinhas que lá dormem, numa carrinha onde dorme. Agrupamento e ordem em agrupamentoQuadro.ts
// (país, zonas de vizinhos lado a lado; nas obras, por cliente; "fora/sem" no fim).
//
// Casas e carrinhas mostram os lugares livres ("livre", tracejados) até à lotação.
//
// O Quadro faz o mesmo que o mapa sem nunca mudar de vista (docs/vistas-edicao.md):
// - Ler: clicar num nome abre a ficha da pessoa; clicar no título de uma casa ou carrinha abre a dela (a
//   mesma ficha do mapa, PainelFoco lugar="vista", por cima dos blocos). O que está em foco tem um anel; uma
//   casa em foco no Quadro por carrinhas (ou uma carrinha no Quadro por casas) realça os nomes de quem lá
//   mora (ou vai). Os pedidos de mostrar (pesquisa, ligações da ficha e do rodapé: mostrar.ts)
//   deslizam até ao bloco ou aos nomes e acendem-nos (realceQuadro.ts); sem nada a que chegar, um aviso
//   curto diz porquê.
// - Filtrar (também na reunião, que só vê): na barra, os clientes (cada pastilha liga/desliga o seu, sem
//   Shift; no telemóvel uma lista de caixas), vários ao mesmo tempo; com algum filtro, "Limpar filtros". As
//   obras não têm filtro à parte: são um agrupamento (Casas | Carrinhas | Obras), como pediu o Rafael
//   (05/10/2026). Na reunião, a partir de xl, os filtros vão para o cabeçalho (FiltrosReuniao).
//   Ficam SÓ as pessoas desses clientes (agrupamentoQuadro.ts, FiltroQuadro). Os blocos
//   continuam todos, com a lotação real (para se poder largar neles); os que não têm ninguém do filtro
//   ficam recolhidos numa fila (só o título e a pastilha) e os outros dizem "+N fora do filtro". Sem
//   ninguém, por cima dos blocos: "Ninguém corresponde ao filtro. Limpar filtros". Mostrar
//   alguém que o filtro esconde (pesquisa, ligações) limpa o filtro, com um aviso curto. O filtro fica até
//   se sair da página (não se lembra no browser: um filtro esquecido escondia pessoas na reunião seguinte).
//   No modo de edição, quem o filtro esconde sai da seleção, com um aviso curto (não vai no arrasto sem se
//   ver). O realce por cliente da legenda do Mapa (clienteDestacado) já não apaga nomes no Quadro.
// - Editar (modo de edição, como no mapa e na lista lateral): os nomes selecionam-se (clique, Ctrl/⌘+clique,
//   Shift+clique) e arrastam-se (motor de arrastar/, toque longo no telemóvel) para outro bloco: cada bloco
//   é um alvo (data-alvo = a chave do bloco) e o fantasma mostra a previsão. Shift+arrastar no fundo desenha
//   uma caixa de seleção (caixaSelecaoQuadro.ts). Onde dorme: "Mudar" no rodapé das carrinhas; no Quadro
//   por carrinhas, "Confirmar todas as sugestões". O condutor muda-se na ficha. Blocos com alterações por
//   guardar: contorno âmbar e "●". A arrastar (ou a desenhar a caixa) a ficha fica meio transparente e
//   deixa passar o ponteiro: os blocos por baixo dela continuam a ser alvos.
// - Reunião: só leitura (sem ficha, nomes e títulos não se clicam, sem alvos), mas os pedidos de mostrar
//   também deslizam e acendem.
//
// Ajuste ao ecrã: tudo é medido em em a partir da letra do quadro, e a letra escolhe-se para o quadro
// caber inteiro no espaço que tem, sem deslizar (pesquisa binária com medição no browser). Os nomes e os
// títulos dos blocos ficam sempre numa só linha: antes de escolher a letra mede-se, em cada grelha de
// blocos, o nome mais comprido e o cabeçalho mais largo (título, "●" e pastilha; em em, por isso vale para
// qualquer letra) e as colunas dos blocos e dos nomes dessa grelha nunca ficam mais estreitas do que eles
// (largurasMinimas). Partes lado a lado (Himeling) sem espaço para todos os blocos numa linha: cada parte
// fica com as colunas que colunasLadoALado escolhe (a de títulos largos passa um bloco à linha de baixo,
// a outra não). Só na reunião, se nada couber assim, as colunas dos nomes voltam à largura de sempre e os
// poucos nomes compridos levam reticências (DEGRAUS_AJUSTE; os títulos continuam inteiros); num ecrã
// estreito demais também (o nome ou o título todo fica no title).
// - Reunião (TV 1920×1080 vista de longe): sem a marca e o modelo das carrinhas; letra de 14 a 30 px.
//   Se nem a 14 couber, os lugares livres de cada bloco juntam-se numa só linha ("4 livres") e sai o que
//   a pastilha ou o título da secção já dizem, de 13 a 30; se nem assim, compacto (sem os livres), de 13
//   a 30; se nem assim, fica a 13 e desliza. Antes letra legível que tudo minúsculo.
// - PC: de 12 a 16 px; se não couber, com os livres numa linha; se nem assim, fica a 14 px, completo, e
//   desliza na vertical (os degraus em agrupamentoQuadro.ts, DEGRAUS_AJUSTE). No modo de edição a letra só
//   se volta a escolher quando muda o agrupamento, o número de blocos ou o espaço (cada largada não faz
//   saltar o Quadro todo); se deixar de caber, desliza.
// - Telemóvel: uma coluna, 14 px, desliza.

import {
  type CSSProperties,
  createContext,
  type MouseEvent,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { create } from 'zustand';
import { COR_TEXTO_NOMES } from '../../dominio/cores';
import type { NivelLotacao } from '../../dominio/ocupacao';
import type { Id } from '../../dominio/tipos';
import { registarOuvintesArrasto } from '../arrastar/ouvintes';
import { FiltroMultiplo, type OpcaoFiltroMultiplo } from '../comum/FiltroMultiplo';
import { IconeVolante } from '../comum/IconeVolante';
import { ESTILO_NIVEL } from '../comum/lotacao';
import { Matricula } from '../comum/Matricula';
import { ContextoOrdemPessoas } from '../comum/ordemPessoas';
import { BOTAO_MINI } from '../edicao/classes';
import { ContornoEdicao } from '../edicao/Edicao';
import { operacoesConfirmarSugestoes } from '../edicao/ondeDorme';
import { dormidaPendente } from '../edicao/resumo';
import { abrirDormida, useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { IconeDormir } from '../lista/icones';
import { clientesPorOrdem, contagemDoCliente } from '../paineis/agrupar';
import { FOCO_VISIVEL } from '../paineis/classes';
import { ehCondutor, ROTULO_SEM_CONDUTOR } from '../paineis/condutor';
import { PainelFoco } from '../paineis/PainelFoco';
import { MarcaCliente } from '../paineis/pecas';
import { comPlural } from '../paineis/textos';
import {
  algarismosAMais,
  assinaturaCabecalhos,
  type BlocoQuadro,
  blocosDoQuadro,
  colunasLadoALado,
  DEGRAUS_AJUSTE,
  escolherAjuste,
  type FaixaQuadro,
  type FiltroQuadro,
  filtroQuadroAtivo,
  INTERVALO_BLOCOS,
  LARGURA_MIN_BLOCO,
  LETRA_NORMAL,
  type LigacaoQuadro,
  largurasMinimas,
  type ModoAjuste,
  montarQuadro,
  passaFiltroQuadro,
  type SeccaoQuadro,
} from './agrupamentoQuadro';
import { AlternadorAgrupamento } from './Comutador';
import { useCaixaSelecaoQuadro } from './caixaSelecaoQuadro';
import {
  ATRIBUTO_FICHA,
  chaveElemento,
  mostrarElemento,
  revelarDepoisDeDesenhar,
  useAoMostrar,
} from './mostrar';
import { BotaoExcel, NomeVista, PastilhaVista } from './pecas';
import {
  avisoSemNadaNoQuadro,
  blocoTemAlteracoes,
  chavesNoQuadro,
  filtroEscondeTudo,
  pessoasDoFocoSemBloco,
  selecaoSemEscondidos,
} from './realceQuadro';
import { type Agrupamento, useVista } from './vista';

/** O mesmo ponto de quebra que o `sm:` do Tailwind: abaixo disto, uma coluna. */
const CONSULTA_VARIAS_COLUNAS = '(min-width: 40rem)';

/**
 * Colunas dos blocos: tantas quantas couberem (no telemóvel, uma). auto-fit: numa linha com poucos
 * blocos, eles alargam em vez de deixarem colunas vazias, até LARGURA_MAX_BLOCO. Nunca mais estreitas
 * do que o nome mais comprido (--min-bloco, posto pelo useAjuste; por omissão LARGURA_MIN_BLOCO).
 */
const GRELHA_BLOCOS =
  'grid grid-cols-1 gap-[0.45em] sm:max-w-(--largura-grelha) sm:grid-cols-[repeat(auto-fit,minmax(min(100%,var(--min-bloco,12.5em)),1fr))]';
/** Largura máxima de um bloco (em): com várias colunas, a grelha não passa de n blocos desta largura. */
const LARGURA_MAX_BLOCO = 20;
/**
 * Nomes dentro de um bloco: uma coluna num bloco estreito, mais num alargado (ou no telemóvel). Cada
 * coluna tem pelo menos a largura do nome mais comprido (--min-nome): nenhum nome fica cortado.
 */
const GRELHA_NOMES =
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,var(--min-nome,9.5em)),1fr))] gap-[0.18em]';
/**
 * Nos blocos largos (fora das casas, sem transporte) os nomes seguem uns atrás dos outros, cada um com a
 * largura do seu nome (já vêm juntos por cliente): cabem mais por linha e nenhum parte.
 */
const NOMES_LARGO = 'flex flex-wrap gap-[0.18em]';
/** Textos secundários (rodapé, títulos das ruas): nunca abaixo de 0,85 da letra do quadro. */
const TEXTO_SECUNDARIO = 'text-[0.85em]';
/**
 * Fora do modo completo (`data-compacto` no interior do quadro, ver useAjuste e ModoAjuste) escondem-se os
 * lugares livres um a um, o "Ninguém." dos blocos com pastilha (ela já diz quantos há) e o "por definir"
 * do rodapé. Nos livres numa linha (`data-livres-linha`) aparece, em vez deles, uma linha por bloco. É CSS
 * para a medição não ter de esperar pelo React.
 */
const SO_COMPLETO = 'group-data-[compacto]:hidden';
const SO_LIVRES_NUMA_LINHA = 'hidden group-data-[livres-linha]:block';
/** Um lugar livre (ou a linha que os junta): tracejado, igual nas casas e nas carrinhas. */
const LIVRE =
  'flex rounded-[0.25em] border border-dashed border-slate-300 px-[0.4em] leading-[1.35] text-slate-400 italic';
/** Realce do bloco quando se arrasta um nome por cima (o motor põe data-alvo-estado="por-cima"). */
const POR_CIMA =
  'data-[alvo-estado=por-cima]:border-blue-500 data-[alvo-estado=por-cima]:bg-blue-50 data-[alvo-estado=por-cima]:ring-2 data-[alvo-estado=por-cima]:ring-blue-500 data-[alvo-estado=por-cima]:outline-none';
/** Ligação do rodapé (casa onde dorme, carrinhas que lá dormem): leva a vista até ela. */
const LIGACAO = `rounded-[0.15em] underline decoration-slate-300 underline-offset-2 hover:text-slate-900 hover:decoration-slate-500 ${FOCO_VISIVEL}`;

/**
 * Pessoas a realçar levemente: as da casa ou carrinha em foco que não tem bloco neste agrupamento (ver
 * pessoasDoFocoSemBloco). Por contexto, para não passar por todas as secções e faixas.
 */
const ContextoRealceFoco = createContext<ReadonlySet<Id>>(new Set());
const NINGUEM: ReadonlySet<Id> = new Set();

// --- Filtro (clientes e obras) ---------------------------------------------------------------------

interface LojaFiltroQuadro extends FiltroQuadro {
  definirClientes: (clientes: Set<Id>) => void;
  limpar: () => void;
}

/**
 * O filtro do Quadro: o mesmo dentro e fora da reunião e ao voltar ao Quadro; esquece-se ao recarregar a
 * página (de propósito: ver o comentário do início).
 */
const useFiltroQuadro = create<LojaFiltroQuadro>()((set) => ({
  clientes: new Set(),
  obras: new Set(),
  definirClientes: (clientes) => set({ clientes }),
  limpar: () => set({ clientes: new Set(), obras: new Set() }),
}));

/** Nome dos blocos de cada agrupamento (singular, plural): "3 casas", "outra carrinha". */
const UNIDADE: Record<Agrupamento, readonly [string, string]> = {
  casas: ['casa', 'casas'],
  carrinhas: ['carrinha', 'carrinhas'],
  obras: ['obra', 'obras'],
};

/** Texto que muda quando o filtro muda (para o ajuste ao ecrã voltar a medir no modo de edição). */
function chaveFiltro(f: FiltroQuadro): string {
  return `${[...f.clientes].join(',')}|${[...f.obras].join(',')}`;
}

/** "40 de 137 pessoas", com o filtro ligado. */
function ContagemFiltro({ n, total }: { n: number; total: number }) {
  return (
    <span
      className="text-sm whitespace-nowrap text-slate-700 tabular-nums"
      title="Pessoas que o filtro mostra"
    >
      <strong className="font-semibold">{n}</strong> de {comPlural(total, 'pessoa', 'pessoas')}
    </span>
  );
}

function useFiltro(): FiltroQuadro {
  const clientes = useFiltroQuadro((s) => s.clientes);
  const obras = useFiltroQuadro((s) => s.obras);
  return useMemo(() => ({ clientes, obras }), [clientes, obras]);
}

/** Atributo do grupo de filtros (barra do Quadro, cabeçalho da reunião): o "Limpar filtros" devolve lá o foco. */
const ATRIBUTO_FILTROS = 'data-filtros-quadro';

/**
 * "Limpar filtros": mostra toda a gente outra vez. Ao sumir,
 * o foco passa para o primeiro filtro visível do mesmo grupo (pastilha ou botão "Cliente"), para o teclado
 * e os leitores de ecrã não o perderem.
 */
function BotaoLimparFiltros({ className = 'text-sm' }: { className?: string }) {
  const limpar = (e: MouseEvent<HTMLButtonElement>) => {
    // O do mesmo grupo; no aviso "Ninguém corresponde ao filtro", o primeiro grupo visível.
    const grupo = e.currentTarget.closest(`[${ATRIBUTO_FILTROS}]`) ?? document;
    const alvo = [
      ...grupo.querySelectorAll<HTMLButtonElement>(
        `[${ATRIBUTO_FILTROS}] section[aria-label^="Filtrar"] button, [${ATRIBUTO_FILTROS}] button[aria-controls]`,
      ),
    ].find((b) => b.offsetParent !== null && !b.disabled);
    useFiltroQuadro.getState().limpar();
    alvo?.focus();
  };
  return (
    <button
      type="button"
      onClick={limpar}
      title="Mostrar toda a gente (tira o filtro dos clientes)"
      className={`shrink-0 rounded px-1 whitespace-nowrap text-slate-600 underline underline-offset-2 hover:text-slate-900 ${FOCO_VISIVEL} ${className}`}
    >
      Limpar filtros
    </button>
  );
}

/** Quantas pessoas (ativas) o filtro deixa, de quantas. */
function useContagemFiltro(filtro: FiltroQuadro): { n: number; total: number } {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  return useMemo(() => {
    if (!estado || !indices) return { n: 0, total: 0 };
    const ativas = estado.pessoas.filter((p) => p.ativa);
    return {
      n: ativas.filter((p) => passaFiltroQuadro(p, filtro, indices.obras)).length,
      total: ativas.length,
    };
  }, [estado, indices, filtro]);
}

/**
 * Os filtros do Quadro no cabeçalho da reunião (CabecalhoReuniao, a partir de xl: 1280 px), na linha do
 * dia e da hora, em vez da barra por cima do Quadro: o Quadro da TV fica com essa altura. Compacto (a
 * lista "Cliente"); a partir de 1920 px (a TV), onde há espaço, as pastilhas dos clientes.
 */
export function FiltrosReuniao({ className = '' }: { className?: string }) {
  const filtro = useFiltro();
  const { n, total } = useContagemFiltro(filtro);
  const filtrado = filtroQuadroAtivo(filtro);
  return (
    <div {...{ [ATRIBUTO_FILTROS]: '' }} className={`flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <FiltroClientes pastilhasDesde="largo" />
      {filtrado && <ContagemFiltro n={n} total={total} />}
      {filtrado && <BotaoLimparFiltros />}
    </div>
  );
}

interface Ajuste {
  letra: number;
  modo: ModoAjuste;
}

/**
 * Altura (px) da matrícula, o título de cada carrinha: 1,5 da letra, a altura útil do cabeçalho do bloco
 * (min-h 1.9em menos 0.4em de margens). Assim lê-se de longe e, ao medir uma letra maior, a matrícula
 * ainda desenhada com a anterior nunca faz o cabeçalho crescer.
 */
function alturaMatricula(letra: number): number {
  return Math.max(16, Math.floor(letra * 1.5));
}

/**
 * Largura natural (em) do nome mais comprido dentro de `raiz`: o texto inteiro mais o resto da etiqueta
 * (margens, volante, "?", sigla). Em em, por isso vale para qualquer letra. O texto do NomeVista é o span
 * `.truncate`; sem nenhum dá 0 e ficam as larguras de sempre.
 */
function larguraNomeMaisComprido(raiz: HTMLElement, letra: number): number {
  const intervalo = document.createRange();
  let maior = 0;
  for (const texto of raiz.querySelectorAll<HTMLElement>('[data-elemento^="pessoa:"] span.truncate')) {
    const etiqueta = texto.parentElement;
    if (!etiqueta) continue;
    maior = Math.max(maior, etiqueta.offsetWidth - texto.clientWidth + larguraNatural(texto, intervalo) + 1);
  }
  return maior / letra;
}

/**
 * Largura natural (px) do conteúdo de um elemento, mesmo que esteja cortado com reticências: cortado, o
 * scrollWidth é o texto todo; senão o elemento pode esticar (flex-1) e só o intervalo mede o texto.
 */
function larguraNatural(el: HTMLElement, intervalo: Range): number {
  if (el.scrollWidth > el.clientWidth) return el.scrollWidth;
  intervalo.selectNodeContents(el);
  return intervalo.getBoundingClientRect().width;
}

/**
 * Espaço (em) do "●" de alterado (a marca e o intervalo antes dela), reservado no modo de edição nos blocos
 * que ainda não o têm: uma largada não faz o título passar a ter reticências.
 */
const RESERVA_MARCA_ALTERADO = 1.1;

/**
 * Largura (em) de cada texto escrito como na pastilha (semibold, algarismos da mesma largura), dentro de
 * `cab` (com a letra dele).
 */
function largurasNaPastilha<T extends string>(cab: HTMLElement, letra: number, textos: readonly T[]) {
  const medida = document.createElement('span');
  medida.className = 'font-semibold whitespace-nowrap tabular-nums';
  medida.style.position = 'absolute';
  medida.style.visibility = 'hidden';
  cab.append(medida);
  const larguras = {} as Record<T, number>;
  for (const t of textos) {
    medida.textContent = t;
    larguras[t] = medida.getBoundingClientRect().width / letra;
  }
  medida.remove();
  return larguras;
}

const SIMBOLO_EXCESSO = ESTILO_NIVEL.excesso.simbolo;

/**
 * Espaço (em) que a pastilha de um cabeçalho pode ganhar no modo de edição sem se voltar a medir: os
 * algarismos a mais (`data-algarismos-a-mais`, ver algarismosAMais: 9/10 → 10/10) e, se ainda não tem gente
 * a mais (`data-nivel-lotacao`), a diferença entre o "▲" e o símbolo que tem (o "▲" é mais largo).
 */
function reservaPastilha(cab: HTMLElement, larguras: Record<string, number>): number {
  const aMais = Number(cab.dataset.algarismosAMais) || 0;
  const nivel = cab.dataset.nivelLotacao as NivelLotacao | undefined;
  const simbolo = nivel && nivel !== 'excesso' ? ESTILO_NIVEL[nivel].simbolo : null;
  const triangulo = simbolo ? Math.max(0, (larguras[SIMBOLO_EXCESSO] ?? 0) - (larguras[simbolo] ?? 0)) : 0;
  return aMais * (larguras['0'] ?? 0) + triangulo;
}

/**
 * Largura natural (em) do cabeçalho mais largo dos blocos dentro de `raiz` (`data-cabecalho-bloco`): o
 * título inteiro (`data-titulo-bloco`), o "●" e a pastilha, os intervalos entre eles, as margens e a borda
 * do bloco. Com `editar` (modo de edição), conta o "●" mesmo onde ainda não está e o que a pastilha pode
 * crescer com as largadas (reservaPastilha): uma largada não faz o título passar a ter reticências. Em em,
 * por isso vale para qualquer letra; sem blocos dá 0.
 */
function larguraCabecalhoMaisLargo(raiz: HTMLElement, letra: number, editar: boolean): number {
  const intervalo = document.createRange();
  let maior = 0;
  let larguras: Record<string, number> | null = null;
  for (const cab of raiz.querySelectorAll<HTMLElement>('[data-cabecalho-bloco]')) {
    const estilo = getComputedStyle(cab);
    const filhos = [...cab.children] as HTMLElement[];
    // Margens do cabeçalho, a borda do bloco (1 px de cada lado) e 1 px para arredondamentos.
    let largura =
      (Number.parseFloat(estilo.paddingLeft) || 0) +
      (Number.parseFloat(estilo.paddingRight) || 0) +
      3 +
      (Number.parseFloat(estilo.columnGap) || 0) * Math.max(0, filhos.length - 1);
    for (const filho of filhos) {
      const titulo = filho.querySelector<HTMLElement>('[data-titulo-bloco]');
      largura += titulo ? larguraNatural(titulo, intervalo) : filho.getBoundingClientRect().width;
    }
    let reserva = 0;
    if (editar) {
      if (!cab.querySelector('[data-marca-alterado]')) reserva += RESERVA_MARCA_ALTERADO;
      larguras ??= largurasNaPastilha(cab, letra, [
        '0',
        SIMBOLO_EXCESSO,
        ESTILO_NIVEL.livre.simbolo,
        ESTILO_NIVEL.cheio.simbolo,
      ]);
      reserva += reservaPastilha(cab, larguras);
    }
    maior = Math.max(maior, largura / letra + reserva);
  }
  return maior;
}

/**
 * Com as colunas da largura de sempre (telemóvel, ou a reunião sem espaço), um nome que não cabe na sua
 * coluna ocupa a linha toda do bloco (`data-nome-largo`): continua inteiro, numa só linha. Só se nem
 * assim couber leva reticências. `alargar` = false tira a marca a todos.
 */
function alargarNomesCompridos(interior: HTMLElement, alargar: boolean): void {
  const itens = [...interior.querySelectorAll<HTMLElement>('ul > li[data-elemento^="pessoa:"]')];
  for (const li of itens) delete li.dataset.nomeLargo;
  if (!alargar) return;
  const cortados = itens.filter((li) => {
    const texto = li.querySelector<HTMLElement>('span.truncate');
    return texto !== null && texto.scrollWidth > texto.clientWidth;
  });
  for (const li of cortados) li.dataset.nomeLargo = '';
}

/**
 * Partes lado a lado (`data-lado-a-lado`): com a letra e as larguras mínimas já postas, dá a cada parte o
 * nº de colunas (`--colunas-parte`) que colunasLadoALado escolhe para a largura da fila. Sem isto, sem
 * espaço para todos numa linha, a flexbox encolhia as duas partes na mesma proporção e ambas passavam
 * blocos à linha de baixo.
 */
function repartirLadoALado(interior: HTMLElement, letra: number): void {
  for (const fila of interior.querySelectorAll<HTMLElement>('[data-lado-a-lado]')) {
    const partes = [...fila.children].filter(
      (p): p is HTMLElement => p instanceof HTMLElement && p.dataset.nBlocos !== undefined,
    );
    for (const p of partes) p.style.removeProperty('--colunas-parte');
    const colunas = colunasLadoALado(
      fila.clientWidth / letra,
      partes.map((p) => ({
        min: Number.parseFloat(p.style.getPropertyValue('--min-bloco')) || LARGURA_MIN_BLOCO,
        n: Number(p.dataset.nBlocos) || 1,
      })),
    );
    partes.forEach((p, i) => {
      p.style.setProperty('--colunas-parte', String(colunas[i] ?? 1));
    });
  }
}

/** Atributos `data-` do interior do quadro em cada modo (para SO_COMPLETO e SO_LIVRES_NUMA_LINHA). */
function atributosDoModo(modo: ModoAjuste): { compacto: boolean; livresLinha: boolean } {
  return { compacto: modo !== 'completo', livresLinha: modo === 'livres-numa-linha' };
}

/**
 * Escolhe a letra do quadro (e o modo, ver ModoAjuste) para caber no contentor. Volta a medir quando o contentor
 * muda de tamanho, quando as letras da marca acabam de carregar, quando muda o que se mostra (`chave`) e
 * depois de cada mudança de letra (a matrícula tem altura em px: só fica certa depois de desenhada).
 */
function useAjuste(
  contentor: RefObject<HTMLDivElement | null>,
  interior: RefObject<HTMLDivElement | null>,
  reuniao: boolean,
  editar: boolean,
  chave: unknown,
): Ajuste {
  const [ajuste, setAjuste] = useState<Ajuste>({ letra: LETRA_NORMAL, modo: 'completo' });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `chave` e o ajuste atual só servem para voltar a medir.
  useLayoutEffect(() => {
    const cont = contentor.current;
    const inter = interior.current;
    if (!cont || !inter) return;
    let ativo = true;
    let pedido = 0;
    // Larguras mínimas das colunas de cada grelha de blocos: as do nome mais comprido e do cabeçalho mais
    // largo DESSA grelha (medidas em cada ajuste: só alarga onde há nomes ou títulos compridos); com os
    // nomes cortados, as de sempre ou a do cabeçalho (os títulos nunca se cortam para caber).
    type Larguras = ReturnType<typeof largurasMinimas>;
    let grelhas: { grelha: HTMLElement; inteiras: Larguras; sempre: Larguras }[] = [];
    const aplicar = ({ letra, modo }: Ajuste, nomesCortados = false) => {
      inter.style.fontSize = `${letra}px`;
      for (const [nome, sim] of Object.entries(atributosDoModo(modo))) {
        if (sim) inter.dataset[nome] = '';
        else delete inter.dataset[nome];
      }
      for (const { grelha, inteiras, sempre } of grelhas) {
        const larguras = nomesCortados ? sempre : inteiras;
        grelha.style.setProperty('--min-nome', `${larguras.nome}em`);
        grelha.style.setProperty('--min-bloco', `${larguras.bloco}em`);
      }
      repartirLadoALado(inter, letra);
      alargarNomesCompridos(inter, nomesCortados);
    };
    const guardar = (novo: Ajuste) =>
      setAjuste((a) => (a.letra === novo.letra && a.modo === novo.modo ? a : novo));
    const ajustar = () => {
      if (!ativo) return;
      // Nomes e títulos numa só linha: as colunas nunca mais estreitas do que o nome mais comprido nem do
      // que o cabeçalho mais largo (o texto mede-se inteiro, seja qual for a largura atual).
      const letraAtual = Number.parseFloat(inter.style.fontSize) || LETRA_NORMAL;
      grelhas = [...inter.querySelectorAll<HTMLElement>('[data-grelha-blocos]')].map((grelha) => {
        const cabecalho = larguraCabecalhoMaisLargo(grelha, letraAtual, editar);
        return {
          grelha,
          inteiras: largurasMinimas(larguraNomeMaisComprido(grelha, letraAtual), cabecalho),
          sempre: largurasMinimas(0, cabecalho),
        };
      });
      if (!window.matchMedia(CONSULTA_VARIAS_COLUNAS).matches) {
        const fixo: Ajuste = { letra: LETRA_NORMAL, modo: 'completo' };
        // Telemóvel: os nomes em duas colunas (com a largura do nome mais comprido ficava quase tudo numa
        // só e o Quadro com o dobro do comprimento); os poucos compridos ocupam a linha toda do bloco.
        aplicar(fixo, true);
        guardar(fixo);
        return;
      }
      const { degraus, senaoCouber } = reuniao ? DEGRAUS_AJUSTE.reuniao : DEGRAUS_AJUSTE.normal;
      // Sem barra de deslizar durante a medição (tirava largura e mudava as colunas).
      const overflow = cont.style.overflowY;
      cont.style.overflowY = 'hidden';
      // 2 px de folga para arredondamentos.
      const disponivel = cont.clientHeight - 2;
      const escolha = escolherAjuste(degraus, senaoCouber, (letra, modo, nomesCortados) => {
        aplicar({ letra, modo }, nomesCortados);
        return inter.offsetHeight <= disponivel;
      });
      aplicar(escolha, escolha.nomesCortados);
      cont.style.overflowY = overflow;
      guardar({ letra: escolha.letra, modo: escolha.modo });
    };
    ajustar();
    const observador = new ResizeObserver(() => {
      cancelAnimationFrame(pedido);
      pedido = requestAnimationFrame(ajustar);
    });
    observador.observe(cont);
    void document.fonts?.ready.then(ajustar);
    return () => {
      ativo = false;
      cancelAnimationFrame(pedido);
      observador.disconnect();
    };
  }, [contentor, interior, reuniao, editar, chave, ajuste.letra]);
  return ajuste;
}

/** Folga (px) entre o fim do Quadro, deslizado até ao fundo, e a ficha do telemóvel. */
const FOLGA_FICHA_PX = 8;

/**
 * No telemóvel a ficha é uma folha em baixo, por cima dos blocos: dá ao espaçador no fim do Quadro a
 * altura que ela tapa (do topo dela ao fundo do invólucro), para os últimos blocos poderem subir acima
 * dela. Segue a ficha quando muda de tamanho ou de conteúdo. Escreve no DOM e não em estado: o Quadro
 * não se volta a desenhar por isso.
 * @param envolvente o que envolve a ficha (o pai dele é o invólucro onde ela está posta);
 * @param espacador o último filho do contentor que desliza (escondido a partir de sm:).
 */
function useEspacoFicha(
  envolvente: RefObject<HTMLDivElement | null>,
  espacador: RefObject<HTMLDivElement | null>,
  aberta: boolean,
): void {
  useLayoutEffect(() => {
    const env = envolvente.current;
    const base = env?.parentElement;
    if (!aberta || !env || !base) return;
    const procurar = () => env.querySelector<HTMLElement>(`[${ATRIBUTO_FICHA}="vista"]`);
    const medir = () => {
      const esp = espacador.current;
      if (!esp) return;
      const ficha = procurar();
      const tapa = ficha ? base.getBoundingClientRect().bottom - ficha.getBoundingClientRect().top : 0;
      esp.style.height = `${tapa > 0 ? Math.ceil(tapa + FOLGA_FICHA_PX) : 0}px`;
    };
    const tamanhos = new ResizeObserver(medir);
    tamanhos.observe(base);
    let observada: HTMLElement | null = null;
    const seguir = () => {
      const ficha = procurar();
      if (ficha !== observada) {
        if (observada) tamanhos.unobserve(observada);
        if (ficha) tamanhos.observe(ficha);
        observada = ficha;
      }
      medir();
    };
    const mudancas = new MutationObserver(seguir);
    mudancas.observe(env, { childList: true, subtree: true });
    seguir();
    return () => {
      tamanhos.disconnect();
      mudancas.disconnect();
    };
  }, [envolvente, espacador, aberta]);
}

/** Um nome do rodapé: fora da reunião, uma casa ou carrinha conhecida é uma ligação que a mostra. */
function NomeLigacao({ ligacao: l, interativo }: { ligacao: LigacaoQuadro; interativo: boolean }) {
  const { tipo, id } = l;
  if (!interativo || id === null || (tipo !== 'casa' && tipo !== 'carrinha')) return <>{l.rotulo}</>;
  return (
    <button
      type="button"
      onClick={() => mostrarElemento({ tipo, id }, { noMapa: 'so-foco' })}
      title={tipo === 'casa' ? 'Mostrar a casa' : 'Mostrar a carrinha'}
      className={LIGACAO}
    >
      {l.rotulo}
    </button>
  );
}

function Rodape({ bloco, interativo }: { bloco: BlocoQuadro; interativo: boolean }) {
  const { ligacoes, semCondutor, tipo } = bloco;
  const carrinhaId = tipo === 'carrinha' ? bloco.id : null;
  // No modo de edição, onde dorme a carrinha muda-se aqui ("Mudar"); "●" se mudou no rascunho.
  const mudarDormida = useLoja((s) => interativo && s.modoEdicao && carrinhaId !== null);
  const dormidaAlterada = useLoja(
    (s) =>
      interativo && s.modoEdicao && carrinhaId !== null && dormidaPendente(s.pendentes, carrinhaId) !== null,
  );
  const temLigacoes = ligacoes.length > 0;
  if (!temLigacoes && !semCondutor && !mudarDormida) return null;
  // Só "por definir": no modo compacto esconde-se (o título da secção, "Onde dorme: por definir", já o diz).
  const soPorDefinir = ligacoes.length === 1 && ligacoes[0]?.tipo === 'por-definir' && !semCondutor;
  const carro = bloco.detalhe?.startsWith('Carro') === true;
  return (
    <p
      className={`mt-auto flex flex-wrap items-center gap-x-[0.5em] gap-y-[0.1em] border-t border-slate-100 px-[0.5em] py-[0.2em] ${TEXTO_SECUNDARIO} leading-snug text-slate-600 ${soPorDefinir ? SO_COMPLETO : ''}`}
    >
      {temLigacoes && (
        <span
          className="inline-flex min-w-0 items-center gap-[0.3em]"
          title={tipo === 'casa' ? 'Carrinhas que dormem nesta casa' : 'Onde dorme'}
        >
          <IconeDormir className="size-[1.1em] text-slate-400" />
          <span className="sr-only">{tipo === 'casa' ? 'Dormem cá: ' : 'Dorme em '}</span>
          <span className="min-w-0">
            {ligacoes.map((l, i) => (
              <span key={`${l.tipo}:${l.id ?? i}`} className={l.tipo === 'por-definir' ? 'italic' : ''}>
                {i > 0 && ', '}
                {l.sugerida && (
                  <span aria-hidden="true" title="Sugerido: ainda não foi definido">
                    ≈{' '}
                  </span>
                )}
                <NomeLigacao ligacao={l} interativo={interativo} />
                {l.sugerida && <span className="sr-only"> (sugerido)</span>}
              </span>
            ))}
          </span>
          {dormidaAlterada && (
            <span className="font-semibold text-amber-700" title="Alterado — por guardar">
              <span aria-hidden="true">●</span>
              <span className="sr-only"> (alterado, por guardar)</span>
            </span>
          )}
        </span>
      )}
      {mudarDormida && carrinhaId !== null && (
        <button
          type="button"
          onClick={() => abrirDormida(carrinhaId)}
          aria-label={`Mudar onde dorme ${carro ? 'o' : 'a'} ${bloco.titulo}`}
          title="Mudar onde dorme"
          className={BOTAO_MINI}
        >
          Mudar
        </button>
      )}
      {semCondutor && (
        <span className="inline-flex items-center gap-[0.25em] italic">
          <IconeVolante tamanho={12} className="size-[1em] text-slate-400" />
          {ROTULO_SEM_CONDUTOR}
        </span>
      )}
    </p>
  );
}

function Titulo({
  bloco,
  letra,
  id,
  interativo,
}: {
  bloco: BlocoQuadro;
  letra: number;
  id: string;
  interativo: boolean;
}) {
  const { tipo, id: idBloco, titulo, detalhe } = bloco;
  const emFoco = useLoja(
    (s) => interativo && idBloco !== null && s.foco?.tipo === tipo && s.foco.id === idBloco,
  );
  // data-titulo-bloco: o useAjuste mede-o inteiro (larguraCabecalhoMaisLargo) e a coluna dos blocos nunca
  // fica mais estreita do que o cabeçalho; as reticências (com o nome todo no title) são só o último
  // recurso, num ecrã estreito demais.
  const conteudo =
    tipo === 'carrinha' ? (
      <>
        <span data-titulo-bloco="" className="inline-flex shrink-0">
          <Matricula matricula={titulo} altura={alturaMatricula(letra)} />
        </span>
        <span className="sr-only">
          {detalhe?.startsWith('Carro') ? 'Carro' : 'Carrinha'} {titulo}
        </span>
      </>
    ) : (
      <span
        data-titulo-bloco=""
        title={titulo}
        className="min-w-0 truncate leading-tight font-semibold text-slate-900"
      >
        {titulo}
      </span>
    );
  return (
    // Num bloco largo o título fica inteiro e são as parcelas por cliente que passam à linha de baixo; nos
    // outros o cabeçalho é uma só linha (o título encolhe só se o bloco for mais estreito do que ele).
    <h4
      id={id}
      className={`flex min-w-0 items-center ${bloco.largo ? 'max-w-full flex-[1_0_auto]' : 'flex-1'}`}
    >
      {/* Fora da reunião, o título abre (ou fecha) a ficha, como os cartões do mapa. */}
      {interativo && idBloco && (tipo === 'casa' || tipo === 'carrinha') ? (
        <button
          type="button"
          aria-pressed={emFoco}
          onClick={() => useLoja.getState().definirFoco(emFoco ? null : { tipo, id: idBloco })}
          title={emFoco ? 'Fechar a ficha' : 'Abrir a ficha'}
          className={`flex min-w-0 items-center rounded-[0.2em] text-left hover:underline ${FOCO_VISIVEL}`}
        >
          {conteudo}
        </button>
      ) : (
        conteudo
      )}
    </h4>
  );
}

function PorCliente({ bloco }: { bloco: BlocoQuadro }) {
  return (
    <span className="flex flex-wrap items-center gap-[0.3em]">
      {bloco.porCliente.map((p) => (
        <span
          key={p.clienteId}
          title={`${p.cliente?.nome ?? 'Cliente desconhecido'}: ${comPlural(p.n, 'pessoa', 'pessoas')}`}
          className="inline-flex items-center gap-[0.25em] rounded-[0.2em] border border-black/25 px-[0.3em] text-[0.85em] leading-[1.4] font-semibold tabular-nums"
          style={{ backgroundColor: p.cliente?.cor ?? '#ffffff', color: COR_TEXTO_NOMES }}
        >
          {p.cliente?.sigla ?? '?'} {p.n}
          <span className="sr-only"> ({p.cliente?.nome ?? 'cliente desconhecido'})</span>
        </span>
      ))}
    </span>
  );
}

/** "3 fora do filtro": pessoas do bloco que o filtro esconde. */
function textoForaDoFiltro(n: number): string {
  return `${n} fora do filtro`;
}

/** Os lugares livres de um bloco numa só linha ("4 livres"), no modo livres-numa-linha. */
function LivresNumaLinha({ vazios }: { vazios: number }) {
  return (
    <li aria-hidden="true" data-livre="" className={`min-w-0 ${SO_LIVRES_NUMA_LINHA}`}>
      <span className={LIVRE}>{comPlural(vazios, 'livre', 'livres')}</span>
    </li>
  );
}

function BlocoVista({ bloco, letra }: { bloco: BlocoQuadro; letra: number }) {
  const indices = useLoja((s) => s.indices);
  const reuniao = useVista((s) => s.reuniao);
  // Na reunião só se lê: nomes e títulos não se clicam, não há alvos nem marcas de edição.
  const interativo = !reuniao;
  const alvo = useLoja((s) => interativo && s.modoEdicao);
  const emFoco = useLoja(
    (s) => interativo && bloco.id !== null && s.foco?.tipo === bloco.tipo && s.foco.id === bloco.id,
  );
  const alterado = useLoja((s) => interativo && s.modoEdicao && blocoTemAlteracoes(s.pendentes, bloco));
  const realceFoco = useContext(ContextoRealceFoco);
  // Ordem dos nomes do bloco: o Shift+clique escolhe o intervalo dentro dela.
  const ordem = useMemo(() => bloco.pessoas.map((p) => p.id), [bloco.pessoas]);
  const idTitulo = useId();
  if (!indices) return null;
  const { lotacao, largo, pessoas, vazios, detalhe, tipo, id, recolhido, escondidas } = bloco;
  const cabecalho = (
    <>
      <Titulo bloco={bloco} letra={letra} id={idTitulo} interativo={interativo} />
      {largo && !recolhido && <PorCliente bloco={bloco} />}
      {alterado && (
        <span data-marca-alterado="" className="font-semibold text-amber-700" title="Alterado — por guardar">
          <span aria-hidden="true">●</span>
          <span className="sr-only">alterado, por guardar</span>
        </span>
      )}
      {lotacao ? (
        <PastilhaVista ocupados={lotacao.ocupados} lugares={lotacao.lugares} nivel={lotacao.nivel} />
      ) : (
        <span className="rounded-[0.25em] bg-slate-200 px-[0.4em] leading-[1.5] font-semibold text-slate-800 tabular-nums">
          {pessoas.length}
          <span className="sr-only"> {pessoas.length === 1 ? 'pessoa' : 'pessoas'}</span>
        </span>
      )}
    </>
  );
  const atributos = {
    'aria-labelledby': idTitulo,
    'data-elemento':
      id !== null && (tipo === 'casa' || tipo === 'carrinha') ? chaveElemento({ tipo, id }) : undefined,
    'data-alvo': alvo ? bloco.chave : undefined,
  };
  const contorno = [
    'rounded-[0.35em] border transition-[background-color,border-color,box-shadow]',
    alterado ? 'border-amber-400' : largo ? 'border-slate-400' : 'border-slate-300',
    emFoco ? 'ring-2 ring-slate-900' : '',
    POR_CIMA,
  ].join(' ');
  // Ninguém do filtro: só o título e a pastilha (a lotação real), numa fila à parte (FaixaVista). Continua
  // a ser um alvo de largar e a abrir a ficha.
  if (recolhido) {
    return (
      <article
        {...atributos}
        title={escondidas > 0 ? `Ninguém do filtro (${textoForaDoFiltro(escondidas)})` : 'Ninguém do filtro'}
        className={`flex min-h-[1.9em] min-w-0 max-w-full items-center gap-x-[0.4em] px-[0.45em] py-[0.15em] ${
          largo ? 'border-dashed bg-slate-50' : 'bg-white/70'
        } ${contorno}`}
      >
        {cabecalho}
      </article>
    );
  }
  return (
    <article
      {...atributos}
      className={`flex min-w-0 flex-col ${largo ? 'col-span-full border-dashed bg-slate-50' : 'bg-white shadow-xs'} ${contorno}`}
    >
      {/* data-cabecalho-bloco: o useAjuste mede-o para a coluna nunca ficar mais estreita do que ele (no
          modo de edição, com o que a pastilha pode crescer: reservaPastilha). */}
      <header
        data-cabecalho-bloco={largo ? undefined : ''}
        data-algarismos-a-mais={
          alvo && !largo && lotacao ? algarismosAMais(lotacao.ocupados, lotacao.lugares) : undefined
        }
        data-nivel-lotacao={alvo && !largo && lotacao ? lotacao.nivel : undefined}
        className={`flex min-h-[1.9em] items-center gap-x-[0.4em] gap-y-[0.15em] px-[0.45em] pt-[0.25em] pb-[0.15em] ${largo ? 'flex-wrap' : ''}`}
      >
        {cabecalho}
      </header>
      {/* Marca e modelo da carrinha, local da obra. Na reunião não: não interessam para a reunião e roubavam
          uma linha por bloco. */}
      {detalhe && (tipo === 'carrinha' || tipo === 'obra') && !reuniao && (
        <p
          className={`-mt-[0.1em] truncate px-[0.5em] ${TEXTO_SECUNDARIO} leading-snug text-slate-500`}
          title={detalhe}
        >
          {detalhe}
        </p>
      )}
      {pessoas.length === 0 && vazios === 0 && (
        // No modo compacto a pastilha (0/5) já o diz.
        <p
          className={`px-[0.5em] pb-[0.3em] ${TEXTO_SECUNDARIO} text-slate-500 italic ${lotacao ? SO_COMPLETO : ''}`}
        >
          Ninguém.
        </p>
      )}
      {(pessoas.length > 0 || vazios > 0) && (
        <ContextoOrdemPessoas.Provider value={ordem}>
          <ul
            className={`${largo ? NOMES_LARGO : GRELHA_NOMES} px-[0.35em] pt-[0.1em] pb-[0.35em] ${
              pessoas.length === 0 ? SO_COMPLETO : ''
            }`}
          >
            {pessoas.map((p) => (
              <li
                key={p.id}
                data-elemento={chaveElemento({ tipo: 'pessoa', id: p.id })}
                className={`min-w-0 rounded-[0.25em] data-[nome-largo]:col-span-full ${realceFoco.has(p.id) ? 'ring-2 ring-slate-400' : ''}`}
              >
                {/* Numa só linha (as colunas têm a largura do nome mais comprido: useAjuste). O
                    Quadro não segue a legenda do Mapa: filtra-se pelos clientes da barra. */}
                <NomeVista
                  pessoa={p}
                  condutor={ehCondutor(p, indices)}
                  interativo={interativo}
                  arrastavel={interativo}
                />
              </li>
            ))}
            {escondidas > 0 && (
              <li
                className={`col-span-full min-w-0 px-[0.2em] ${TEXTO_SECUNDARIO} leading-[1.35] text-slate-500 italic`}
                title={`${comPlural(escondidas, 'pessoa', 'pessoas')} que o filtro esconde`}
              >
                +{textoForaDoFiltro(escondidas)}
              </li>
            )}
            {Array.from({ length: vazios }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: os lugares livres não têm identidade própria.
              <li key={`livre-${i}`} aria-hidden="true" data-livre="" className={`min-w-0 ${SO_COMPLETO}`}>
                <span className={LIVRE}>livre</span>
              </li>
            ))}
            {pessoas.length > 0 && vazios > 0 && <LivresNumaLinha vazios={vazios} />}
          </ul>
        </ContextoOrdemPessoas.Provider>
      )}
      {/* Bloco vazio: a lista de cima esconde-se fora do completo; os livres numa linha vêm à parte. */}
      {pessoas.length === 0 && vazios > 0 && (
        <ul className={`${SO_LIVRES_NUMA_LINHA} px-[0.35em] pt-[0.1em] pb-[0.35em]`}>
          <LivresNumaLinha vazios={vazios} />
        </ul>
      )}
      <Rodape bloco={bloco} interativo={interativo} />
    </article>
  );
}

function FaixaVista({
  faixa,
  letra,
  mostrarTitulo,
}: {
  faixa: FaixaQuadro;
  letra: number;
  mostrarTitulo: boolean;
}) {
  const ladoALado = faixa.partes.length > 1;
  return (
    <div className="flex flex-col gap-[0.25em]">
      {mostrarTitulo && faixa.titulo && (
        <p className={`${TEXTO_SECUNDARIO} font-semibold tracking-wide text-slate-600 uppercase`}>
          {faixa.titulo}
        </p>
      )}
      <div
        data-lado-a-lado={ladoALado ? '' : undefined}
        className={ladoALado ? 'flex flex-col gap-[0.6em] sm:flex-row' : ''}
      >
        {faixa.partes.map((parte) => {
          // Com o filtro, os blocos sem ninguém dele vão para uma fila por baixo, só com o título e a
          // pastilha: a grelha fica só com os que têm nomes (sem colunas cheias de vazio).
          const abertos = parte.blocos.filter((b) => !b.recolhido);
          const recolhidos = parte.blocos.filter((b) => b.recolhido);
          return (
            // data-grelha-blocos: o useAjuste põe aqui as larguras mínimas (--min-bloco, --min-nome) desta
            // parte, pelo nome mais comprido que ela tem.
            <div
              key={parte.chave}
              data-grelha-blocos=""
              className={`flex min-w-0 flex-col gap-[0.3em] sm:[flex:var(--flex-parte,none)] ${
                ladoALado ? 'sm:min-w-[var(--min-bloco,12.5em)]' : ''
              }`}
              // Lado a lado (a partir de sm), cada parte parte da largura de que os seus blocos (os abertos)
              // precisam e o que sobra reparte-se pelo nº de blocos. Sem espaço, encolhe (os blocos passam
              // à linha de baixo), mas nunca abaixo de um bloco: nenhum fica mais estreito do que o título.
              // --colunas-parte (useAjuste, repartirLadoALado): sem espaço para todos os blocos numa linha,
              // quantas colunas fica cada parte; por omissão, todos os abertos.
              data-n-blocos={ladoALado ? abertos.length : undefined}
              style={
                ladoALado
                  ? ({
                      '--flex-parte': `var(--colunas-parte, ${Math.max(1, abertos.length)}) 1 calc(var(--colunas-parte, ${Math.max(1, abertos.length)}) * (var(--min-bloco, ${LARGURA_MIN_BLOCO}em) + ${INTERVALO_BLOCOS}em) - ${INTERVALO_BLOCOS}em)`,
                    } as CSSProperties)
                  : undefined
              }
            >
              {parte.titulo && (
                <p className={`-mb-[0.1em] ${TEXTO_SECUNDARIO} font-semibold text-slate-600`}>
                  {parte.titulo}
                </p>
              )}
              {abertos.length > 0 && (
                <div
                  className={GRELHA_BLOCOS}
                  style={
                    abertos.some((b) => b.largo)
                      ? undefined
                      : ({
                          // n blocos da largura máxima (ou da do nome mais comprido, se for maior).
                          '--largura-grelha': `calc(${abertos.length} * (max(var(--min-bloco, ${LARGURA_MIN_BLOCO}em), ${LARGURA_MAX_BLOCO}em) + 0.45em))`,
                        } as CSSProperties)
                  }
                >
                  {abertos.map((b) => (
                    <BlocoVista key={b.chave} bloco={b} letra={letra} />
                  ))}
                </div>
              )}
              {recolhidos.length > 0 && (
                <div className="flex flex-wrap gap-[0.3em]">
                  {recolhidos.map((b) => (
                    <BlocoVista key={b.chave} bloco={b} letra={letra} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeccaoVista({
  seccao,
  letra,
  agrupamento,
}: {
  seccao: SeccaoQuadro;
  letra: number;
  agrupamento: Agrupamento;
}) {
  const idTitulo = useId();
  // Com uma só faixa com título (ex.: França → Himeling), os dois títulos vão na mesma linha.
  const [primeira] = seccao.faixas;
  const juntar = seccao.faixas.length === 1 && primeira?.titulo != null;
  const [um, varios] = UNIDADE[agrupamento];
  return (
    <section aria-labelledby={seccao.titulo ? idTitulo : undefined} className="flex flex-col gap-[0.3em]">
      {seccao.titulo && (
        <h3 id={idTitulo} className="flex flex-wrap items-baseline gap-x-[0.5em] text-[0.85em] leading-tight">
          <span className="font-semibold tracking-wide text-slate-700 uppercase">
            {seccao.titulo}
            {juntar && ` · ${primeira?.titulo}`}
          </span>
          {seccao.nBlocos > 0 && (
            <span className="text-slate-500">
              {comPlural(seccao.nBlocos, um, varios)} · {comPlural(seccao.nPessoas, 'pessoa', 'pessoas')}
            </span>
          )}
        </h3>
      )}
      {seccao.faixas.map((f) => (
        <FaixaVista key={f.chave} faixa={f} letra={letra} mostrarTitulo={!juntar} />
      ))}
    </section>
  );
}

/**
 * Onde as pastilhas substituem a lista "Cliente": a partir de md (barra do Quadro) ou só a partir de
 * 1920 px (cabeçalho da reunião, onde ficam na linha de baixo do dia e da hora). Classes inteiras para o
 * Tailwind as encontrar.
 */
const CLASSES_FILTRO_CLIENTES = {
  md: { lista: 'md:hidden', pastilhas: 'hidden md:flex' },
  largo: { lista: 'min-[120rem]:hidden', pastilhas: 'hidden min-[120rem]:flex' },
} as const;

/**
 * Filtro dos clientes. Com espaço (a partir de `pastilhasDesde`): as pastilhas de sempre ("Clientes" e a
 * marca de cada um); cada clique liga ou desliga esse cliente (vários ao mesmo tempo, sem Shift); com obras
 * também escolhidas, "Todos" limpa só os clientes (o "Limpar filtros" ao lado limpa tudo). Sem espaço: o
 * FiltroMultiplo (uma lista de caixas, com a marca e o nº de pessoas de cada cliente).
 */
function FiltroClientes({
  pastilhasDesde = 'md',
}: {
  pastilhasDesde?: keyof typeof CLASSES_FILTRO_CLIENTES;
}) {
  const estado = useLoja((s) => s.estado);
  const contadores = useLoja((s) => s.contadores);
  const escolhidos = useFiltroQuadro((s) => s.clientes);
  const classes = CLASSES_FILTRO_CLIENTES[pastilhasDesde];
  const definir = useFiltroQuadro((s) => s.definirClientes);
  const clientes = useMemo(() => (estado ? clientesPorOrdem(estado.clientes) : []), [estado]);
  if (!estado) return null;
  const n = (id: Id) => (contadores ? contagemDoCliente(contadores.pessoasPorCliente, id) : 0);
  const opcoes: OpcaoFiltroMultiplo[] = clientes.map((c) => ({
    valor: c.id,
    rotulo: c.nome,
    contagem: n(c.id),
    termos: c.sigla,
    marca: <MarcaCliente cliente={c} />,
  }));
  const alternar = (id: Id) => {
    const novos = new Set(escolhidos);
    if (novos.has(id)) novos.delete(id);
    else novos.add(id);
    definir(novos);
  };
  const algum = escolhidos.size > 0;
  return (
    <>
      <FiltroMultiplo
        rotulo="Cliente"
        genero="m"
        opcoes={opcoes}
        escolhidos={escolhidos}
        aoMudar={definir}
        tamanho={pastilhasDesde === 'largo' ? 'compacto' : 'normal'}
        className={classes.lista}
        classeBotao="max-w-[11rem]"
      />
      <section
        aria-label="Filtrar por cliente (vários ao mesmo tempo)"
        className={`min-w-0 flex-wrap items-center gap-1 text-xs ${classes.pastilhas}`}
      >
        <span
          aria-hidden="true"
          className="mr-0.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase"
        >
          Clientes
        </span>
        <ul className="flex flex-wrap items-center gap-1">
          {clientes.map((c) => {
            const escolhido = escolhidos.has(c.id);
            return (
              <li key={c.id} className="flex">
                <button
                  type="button"
                  aria-pressed={escolhido}
                  aria-label={`${c.nome} (${comPlural(n(c.id), 'pessoa', 'pessoas')})`}
                  title={
                    escolhido
                      ? `Tirar ${c.nome} do filtro`
                      : algum
                        ? `Juntar ${c.nome} ao filtro (${comPlural(n(c.id), 'pessoa', 'pessoas')})`
                        : `Mostrar só ${c.nome} (${comPlural(n(c.id), 'pessoa', 'pessoas')})`
                  }
                  onClick={() => alternar(c.id)}
                  className={`grid h-7 place-items-center rounded border px-1 ${FOCO_VISIVEL} ${
                    escolhido
                      ? 'border-slate-900 bg-slate-100 ring-1 ring-slate-900'
                      : 'border-transparent hover:bg-slate-100'
                  } ${algum && !escolhido ? 'opacity-40 hover:opacity-100' : ''}`}
                >
                  <MarcaCliente cliente={c} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

export function Quadro({ reuniao = false }: { reuniao?: boolean }) {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const dormidas = useLoja((s) => s.dormidas);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const foco = useLoja((s) => s.foco);
  const agrupamento = useVista((s) => s.agrupamento);
  const raiz = useRef<HTMLElement>(null);
  const contentor = useRef<HTMLDivElement>(null);
  const interior = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const editar = modoEdicao && !reuniao;
  const filtro = useFiltro();
  const filtrado = filtroQuadroAtivo(filtro);

  const seccoes = useMemo(
    () => (estado && indices && dormidas ? montarQuadro(agrupamento, estado, indices, dormidas, filtro) : []),
    [agrupamento, estado, indices, dormidas, filtro],
  );
  const nBlocos = useMemo(() => blocosDoQuadro(seccoes).filter((b) => !b.largo).length, [seccoes]);
  // No modo de edição o rascunho muda o estado a cada largada: a letra só se volta a escolher quando muda o
  // agrupamento, o número de blocos, o filtro ou quando uma pastilha passa a precisar de mais algarismos do
  // que os reservados (assinaturaCabecalhos; ou o espaço, pelo ResizeObserver); se deixar de caber, desliza.
  const assinatura = useMemo(() => (editar ? assinaturaCabecalhos(seccoes) : ''), [editar, seccoes]);
  const { letra, modo } = useAjuste(
    contentor,
    interior,
    reuniao,
    editar,
    editar ? `edicao:${agrupamento}:${nBlocos}:${chaveFiltro(filtro)}:${assinatura}` : seccoes,
  );
  const realceFoco = useMemo(
    () => (indices && !reuniao ? pessoasDoFocoSemBloco(foco, agrupamento, indices) : NINGUEM),
    [indices, reuniao, foco, agrupamento],
  );
  // "Confirmar todas as sugestões (N)": no Quadro por carrinhas, no modo de edição.
  const nSugestoes = useMemo(
    () =>
      editar && agrupamento === 'carrinhas' && estado && dormidas
        ? operacoesConfirmarSugestoes(estado, dormidas).length
        : 0,
    [editar, agrupamento, estado, dormidas],
  );

  // Enquanto se arrasta um nome ou se desenha a caixa, a ficha deixa ver e passar o ponteiro através
  // dela: os blocos por baixo continuam a ser alvos (o motor procura-os com elementFromPoint), o Quadro
  // desliza perto da borda que ela tapa (no telemóvel, a de baixo) e a caixa vê-se por baixo dela.
  // Atributos no DOM e não estado: nada se volta a desenhar a meio do arrasto.
  const envolventeFicha = useRef<HTMLDivElement>(null);
  const atravessarFicha = useCallback((motivo: 'arrasto' | 'caixa', sim: boolean) => {
    const el = envolventeFicha.current;
    if (!el) return;
    if (sim) el.dataset[motivo] = '';
    else delete el.dataset[motivo];
  }, []);
  const aoDesenharCaixa = useCallback((sim: boolean) => atravessarFicha('caixa', sim), [atravessarFicha]);
  useEffect(
    () =>
      registarOuvintesArrasto({
        aoComecar: () => atravessarFicha('arrasto', true),
        aoTerminar: () => atravessarFicha('arrasto', false),
      }),
    [atravessarFicha],
  );
  useCaixaSelecaoQuadro(raiz, contentor, caixa, editar, aoDesenharCaixa);
  // No modo de edição a seleção fica só com quem o filtro mostra: quem ele esconde sai dela, com um aviso
  // curto (senão ia no arrasto sem se ver). Também ao chegar ao Quadro com uma seleção feita noutra vista.
  const selecao = useLoja((s) => s.selecao);
  useEffect(() => {
    if (!editar || !indices || !filtroQuadroAtivo(filtro) || selecao.size === 0) return;
    const passa = (id: Id) => {
      const p = indices.pessoas.get(id);
      return p !== undefined && passaFiltroQuadro(p, filtro, indices.obras);
    };
    const tirar = selecaoSemEscondidos(selecao, passa);
    if (!tirar) return;
    useLoja.getState().definirSelecao(tirar.fica);
    useUiEdicao.getState().avisar(tirar.aviso);
  }, [editar, indices, filtro, selecao]);
  const espacador = useRef<HTMLDivElement>(null);
  useEspacoFicha(envolventeFicha, espacador, !reuniao && foco !== null);
  // Pesquisa, ligações da ficha e do rodapé: desliza até ao elemento e acende-o, sem mudar de vista (também na
  // reunião). Depois de desenhar: o foco acabou de mudar (anéis, espaço da ficha no telemóvel).
  // Procura-se só dentro do Quadro (o mapa escondido também tem data-alvo e data-pessoa-id).
  // Sem nada a que chegar (ex.: casa sem moradores e sem carrinhas a dormir lá, no Quadro por carrinhas),
  // um aviso curto diz porquê; o agrupamento não muda.
  useAoMostrar((elemento) => {
    const { indices: ind, dormidas: dorm } = useLoja.getState();
    if (!ind || !dorm) return;
    const agrup = useVista.getState().agrupamento;
    const chaves = chavesNoQuadro(elemento, agrup, ind, dorm);
    if (chaves.length === 0) {
      const aviso = avisoSemNadaNoQuadro(elemento, agrup, ind, dorm);
      if (aviso) useUiEdicao.getState().avisar(aviso);
      return;
    }
    // O filtro esconde tudo o que se ia acender (ex.: pesquisa de alguém de outro cliente): limpa-o, como
    // a Tabela faz com os dela. Os nomes aparecem no próximo desenho; o revelar espera por ele.
    const f = useFiltroQuadro.getState();
    const passa = (id: Id) => {
      const p = ind.pessoas.get(id);
      return p !== undefined && passaFiltroQuadro(p, f, ind.obras);
    };
    if (filtroQuadroAtivo(f) && filtroEscondeTudo(chaves, passa)) {
      f.limpar();
      const pessoa = elemento.tipo === 'pessoa' ? ind.pessoas.get(elemento.id) : undefined;
      useUiEdicao
        .getState()
        .avisar(
          pessoa ? `Filtro do Quadro limpo para mostrar ${pessoa.nomeCurto}.` : 'Filtro do Quadro limpo.',
        );
    }
    revelarDepoisDeDesenhar(() => raiz.current, chaves);
  });

  if (!estado || !indices || !dormidas) return null;
  const nPessoas = estado.pessoas.filter((p) => p.ativa).length;
  const nFiltradas = filtrado ? seccoes.reduce((n, s) => n + s.nPessoas, 0) : nPessoas;
  const comFicha = !reuniao && foco !== null;

  return (
    <section
      ref={raiz}
      aria-label={`Quadro das ${UNIDADE[agrupamento][1]}`}
      className="relative flex min-h-0 flex-1 flex-col bg-slate-50"
    >
      {reuniao && (
        // Na reunião (só ver) também se filtra. A partir de xl (1280 px) os filtros estão no cabeçalho da
        // reunião (FiltrosReuniao), na linha do dia e da hora; abaixo, uma barra fina só com eles.
        <div
          {...{ [ATRIBUTO_FILTROS]: '' }}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-3 py-1 xl:hidden"
        >
          <FiltroClientes />
          {filtrado && <ContagemFiltro n={nFiltradas} total={nPessoas} />}
          {filtrado && <BotaoLimparFiltros />}
        </div>
      )}
      {!reuniao && (
        <div
          {...{ [ATRIBUTO_FILTROS]: '' }}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2"
        >
          <AlternadorAgrupamento />
          {/* No telemóvel só as pessoas: assim a barra fica em duas linhas (a 2.ª com os filtros). */}
          <p className="text-sm text-slate-700 tabular-nums">
            <span className="max-sm:hidden">{comPlural(nBlocos, ...UNIDADE[agrupamento])} · </span>
            {filtrado ? (
              <ContagemFiltro n={nFiltradas} total={nPessoas} />
            ) : (
              comPlural(nPessoas, 'pessoa', 'pessoas')
            )}
          </p>
          <FiltroClientes />
          {filtrado && <BotaoLimparFiltros />}
          <div className="ml-auto">
            <BotaoExcel />
          </div>
          {editar && (
            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
              <p className="min-w-0 flex-1 basis-56 text-xs leading-snug text-slate-600">
                {/* No telemóvel numa linha só: os blocos e a ficha precisam da altura. */}
                <span className="sm:hidden">Toque longo num nome para o arrastar.</span>
                <span className="max-sm:hidden">
                  Arrasta os nomes para outra {UNIDADE[agrupamento][0]} (no telemóvel, toque longo).
                </span>
                <span className="hidden md:inline"> Shift+arrastar no fundo seleciona vários.</span>
              </p>
              {nSugestoes > 0 && (
                <button
                  type="button"
                  onClick={() => useUiEdicao.getState().abrirDialogo({ tipo: 'confirmar-sugestoes' })}
                  title="Cada carrinha passa a dormir na casa onde moram mais passageiros (pede confirmação)"
                  className={BOTAO_MINI}
                >
                  <IconeDormir className="size-3.5 text-slate-500" />
                  Confirmar todas as sugestões ({nSugestoes})
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {/* relative: a ficha e a caixa de seleção ficam por cima dos blocos, sem tapar a barra. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* relative: os textos só para leitores de ecrã (sr-only, absolutos) ficam presos a esta caixa.
            Com a ficha aberta no telemóvel (em baixo), o que se mostra fica centrado na parte de cima. */}
        <div
          ref={contentor}
          className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain ${comFicha ? 'max-sm:scroll-pb-[60%]' : ''}`}
        >
          <div
            ref={interior}
            className="group flex flex-col gap-[0.7em] p-[0.6em] text-slate-900"
            data-compacto={atributosDoModo(modo).compacto ? '' : undefined}
            data-livres-linha={atributosDoModo(modo).livresLinha ? '' : undefined}
            style={{ fontSize: `${letra}px` }}
          >
            {agrupamento === 'obras' && estado.obras.length === 0 && (
              // Como a lista lateral (Ver por Obras): sem obras, toda a gente está em "Sem obra".
              <p className="rounded-[0.35em] border border-slate-200 bg-white px-[0.6em] py-[0.4em] text-[0.85em] leading-snug text-slate-600">
                Ainda não há obras. Vão chegar do GPS das carrinhas ou criar-se à mão numa etapa seguinte. Até
                lá, toda a gente está em “Sem obra”.
              </p>
            )}
            {filtrado && nFiltradas === 0 && (
              // Os blocos ficam (recolhidos: continuam alvos de largar), mas sem um único nome: diz porquê.
              <p
                role="status"
                className="rounded-[0.35em] border border-slate-300 bg-white px-[0.6em] py-[0.4em] text-slate-700"
              >
                Ninguém corresponde ao filtro. <BotaoLimparFiltros className="" />
              </p>
            )}
            <ContextoRealceFoco.Provider value={realceFoco}>
              {seccoes.map((s) => (
                <SeccaoVista key={s.chave} seccao={s} letra={letra} agrupamento={agrupamento} />
              ))}
            </ContextoRealceFoco.Provider>
          </div>
          {/* No telemóvel a ficha tapa a parte de baixo: espaço da altura dela para os últimos blocos
              subirem acima dela (useEspacoFicha). Um espaçador e não padding no interior (a medição do
              ajuste não o conta); no PC a ficha fica em cima à direita e não é preciso. */}
          {comFicha && <div ref={espacador} aria-hidden="true" className="sm:hidden" />}
        </div>
        {!reuniao && (
          <>
            <div
              ref={caixa}
              aria-hidden="true"
              className="pointer-events-none absolute z-10 hidden rounded-sm border-2 border-blue-600 bg-blue-500/10"
            />
            {/* Sem posição própria: a ficha (absoluta) continua presa ao invólucro. pointer-events herda-se. */}
            <div
              ref={envolventeFicha}
              className="transition-opacity data-[arrasto]:pointer-events-none data-[arrasto]:opacity-25 data-[caixa]:pointer-events-none data-[caixa]:opacity-25"
            >
              <PainelFoco lugar="vista" />
            </div>
          </>
        )}
      </div>
      <ContornoEdicao />
    </section>
  );
}
