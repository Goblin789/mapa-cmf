// Vista Quadro: as casas (ou as carrinhas) em blocos, como as folhas do Michael. Cada bloco tem o nome
// (ou a matrícula) e a pastilha da lotação no cabeçalho, os nomes por baixo (condutor primeiro, com o
// volante) e, em baixo, a ligação: numa casa as carrinhas que lá dormem, numa carrinha onde dorme.
// Agrupamento e ordem em agrupamentoQuadro.ts (país, zonas de vizinhos lado a lado, "fora/sem" no fim).
//
// O Quadro faz o mesmo que o mapa sem nunca mudar de vista (docs/vistas-edicao.md):
// - Ler: clicar num nome abre a ficha da pessoa; clicar no título de uma casa ou carrinha abre a dela (a
//   mesma ficha do mapa, PainelFoco lugar="vista", por cima dos blocos). O que está em foco tem um anel; uma
//   casa em foco no Quadro por carrinhas (ou uma carrinha no Quadro por casas) realça os nomes de quem lá
//   mora (ou vai). Os pedidos de mostrar (pesquisa, contadores, ligações da ficha e do rodapé: mostrar.ts)
//   deslizam até ao bloco ou aos nomes e acendem-nos (realceQuadro.ts). A legenda dos clientes vai na barra.
// - Editar (modo de edição, como no mapa e na lista lateral): os nomes selecionam-se (clique, Ctrl/⌘+clique,
//   Shift+clique) e arrastam-se (motor de arrastar/, toque longo no telemóvel) para outro bloco: cada bloco
//   é um alvo (data-alvo = a chave do bloco) e o fantasma mostra a previsão. Shift+arrastar no fundo desenha
//   uma caixa de seleção (caixaSelecaoQuadro.ts). Onde dorme: "Mudar" no rodapé das carrinhas; no Quadro
//   por carrinhas, "Confirmar todas as sugestões". O condutor muda-se na ficha. Blocos com alterações por
//   guardar: contorno âmbar e "●". A arrastar (ou a desenhar a caixa) a ficha fica meio transparente e
//   deixa passar o ponteiro: os blocos por baixo dela continuam a ser alvos.
// - Reunião: só leitura (sem ficha, nomes e títulos não se clicam, sem alvos), mas os pedidos de mostrar
//   (casa do popover dos contadores) também deslizam e acendem.
//
// Ajuste ao ecrã: tudo é medido em em a partir da letra do quadro, e a letra escolhe-se para o quadro
// caber inteiro no espaço que tem, sem deslizar (pesquisa binária com medição no browser). Os nomes
// compridos partem em duas linhas (nunca ficam cortados: na TV não há rato para ver o title), e a
// medição conta com isso.
// - Reunião (TV 1920×1080 vista de longe): sem a marca e o modelo das carrinhas; letra de 14 a 30 px.
//   Se nem a 14 couber, passa a compacto (sem os lugares livres desenhados nem o que a pastilha ou o
//   título da secção já dizem) e tenta de 13 a 30; se nem assim, fica a 13 e desliza. Antes letra
//   legível que tudo minúsculo.
// - PC: de 12 a 16 px e, se não couber, fica a 14 px e desliza na vertical. No modo de edição a letra só
//   se volta a escolher quando muda o agrupamento, o número de blocos ou o espaço (cada largada não faz
//   saltar o Quadro todo); se deixar de caber, desliza.
// - Telemóvel: uma coluna, 14 px, desliza.

import {
  type CSSProperties,
  createContext,
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
import { COR_TEXTO_NOMES } from '../../dominio/cores';
import type { Id } from '../../dominio/tipos';
import { registarOuvintesArrasto } from '../arrastar/ouvintes';
import { IconeVolante } from '../comum/IconeVolante';
import { Matricula } from '../comum/Matricula';
import { ContextoOrdemPessoas } from '../comum/ordemPessoas';
import { BOTAO_MINI } from '../edicao/classes';
import { ContornoEdicao } from '../edicao/Edicao';
import { operacoesConfirmarSugestoes } from '../edicao/ondeDorme';
import { dormidaPendente } from '../edicao/resumo';
import { abrirDormida, useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { IconeDormir } from '../lista/icones';
import { FOCO_VISIVEL } from '../paineis/classes';
import { ehCondutor, ROTULO_SEM_CONDUTOR } from '../paineis/condutor';
import { Legenda } from '../paineis/Legenda';
import { PainelFoco } from '../paineis/PainelFoco';
import { comPlural } from '../paineis/textos';
import {
  type BlocoQuadro,
  blocosDoQuadro,
  type DegrauAjuste,
  escolherAjuste,
  type FaixaQuadro,
  type LigacaoQuadro,
  montarQuadro,
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
import { blocoTemAlteracoes, chavesNoQuadro, pessoasDoFocoSemBloco } from './realceQuadro';
import { type Agrupamento, useVista } from './vista';

/** Letra (px) no telemóvel e quando não cabe no PC. */
const LETRA_NORMAL = 14;
/** Os degraus do ajuste (ver escolherAjuste) e o que fica se nenhum couber. */
const AJUSTES: Record<
  'reuniao' | 'normal',
  { degraus: DegrauAjuste[]; senaoCouber: { letra: number; compacto: boolean } }
> = {
  reuniao: {
    degraus: [
      { compacto: false, minimo: 14, maximo: 30 },
      { compacto: true, minimo: 13, maximo: 30 },
    ],
    senaoCouber: { letra: 13, compacto: true },
  },
  normal: {
    degraus: [{ compacto: false, minimo: 12, maximo: 16 }],
    senaoCouber: { letra: LETRA_NORMAL, compacto: false },
  },
};
/** O mesmo ponto de quebra que o `sm:` do Tailwind: abaixo disto, uma coluna. */
const CONSULTA_VARIAS_COLUNAS = '(min-width: 40rem)';

/**
 * Colunas dos blocos: tantas quantas couberem (no telemóvel, uma). auto-fit: numa linha com poucos
 * blocos, eles alargam em vez de deixarem colunas vazias (menos nomes partidos), até LARGURA_MAX_BLOCO.
 */
const GRELHA_BLOCOS =
  'grid grid-cols-1 gap-[0.45em] sm:max-w-(--largura-grelha) sm:grid-cols-[repeat(auto-fit,minmax(min(100%,12.5em),1fr))]';
/** Largura máxima de um bloco (em): com várias colunas, a grelha não passa de n blocos desta largura. */
const LARGURA_MAX_BLOCO = 20;
/** Nomes dentro de um bloco: uma coluna num bloco estreito, mais num alargado (ou no telemóvel). */
const GRELHA_NOMES = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.5em),1fr))] gap-[0.18em]';
/**
 * Nos blocos largos (fora das casas, sem transporte) os nomes seguem uns atrás dos outros, cada um com a
 * largura do seu nome (já vêm juntos por cliente): cabem mais por linha e nenhum parte.
 */
const NOMES_LARGO = 'flex flex-wrap gap-[0.18em]';
/** Textos secundários (rodapé, títulos das ruas): nunca abaixo de 0,85 da letra do quadro. */
const TEXTO_SECUNDARIO = 'text-[0.85em]';
/**
 * No modo compacto (`data-compacto` no interior do quadro, ver useAjuste) escondem-se os lugares livres
 * desenhados e o "Ninguém." dos blocos com pastilha (ela já diz quantos há). É CSS para a medição não ter
 * de esperar pelo React.
 */
const SO_COMPLETO = 'group-data-[compacto]:hidden';
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

interface Ajuste {
  letra: number;
  compacto: boolean;
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
 * Escolhe a letra do quadro (e se é compacto) para caber no contentor. Volta a medir quando o contentor
 * muda de tamanho, quando as letras da marca acabam de carregar, quando muda o que se mostra (`chave`) e
 * depois de cada mudança de letra (a matrícula tem altura em px: só fica certa depois de desenhada).
 */
function useAjuste(
  contentor: RefObject<HTMLDivElement | null>,
  interior: RefObject<HTMLDivElement | null>,
  reuniao: boolean,
  chave: unknown,
): Ajuste {
  const [ajuste, setAjuste] = useState<Ajuste>({ letra: LETRA_NORMAL, compacto: false });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `chave` e o ajuste atual só servem para voltar a medir.
  useLayoutEffect(() => {
    const cont = contentor.current;
    const inter = interior.current;
    if (!cont || !inter) return;
    let ativo = true;
    let pedido = 0;
    const aplicar = ({ letra, compacto }: Ajuste) => {
      inter.style.fontSize = `${letra}px`;
      if (compacto) inter.dataset.compacto = '';
      else delete inter.dataset.compacto;
    };
    const guardar = (novo: Ajuste) =>
      setAjuste((a) => (a.letra === novo.letra && a.compacto === novo.compacto ? a : novo));
    const ajustar = () => {
      if (!ativo) return;
      if (!window.matchMedia(CONSULTA_VARIAS_COLUNAS).matches) {
        const fixo = { letra: LETRA_NORMAL, compacto: false };
        aplicar(fixo);
        guardar(fixo);
        return;
      }
      const { degraus, senaoCouber } = reuniao ? AJUSTES.reuniao : AJUSTES.normal;
      // Sem barra de deslizar durante a medição (tirava largura e mudava as colunas).
      const overflow = cont.style.overflowY;
      cont.style.overflowY = 'hidden';
      // 2 px de folga para arredondamentos.
      const disponivel = cont.clientHeight - 2;
      const escolha = escolherAjuste(degraus, senaoCouber, (letra, compacto) => {
        aplicar({ letra, compacto });
        return inter.offsetHeight <= disponivel;
      });
      aplicar(escolha);
      cont.style.overflowY = overflow;
      guardar({ letra: escolha.letra, compacto: escolha.compacto });
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
  }, [contentor, interior, reuniao, chave, ajuste.letra]);
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
  const { ligacoes, aviso, sempreCheia, semCondutor, tipo } = bloco;
  const carrinhaId = tipo === 'carrinha' ? bloco.id : null;
  // No modo de edição, onde dorme a carrinha muda-se aqui ("Mudar"); "●" se mudou no rascunho.
  const mudarDormida = useLoja((s) => interativo && s.modoEdicao && carrinhaId !== null);
  const dormidaAlterada = useLoja(
    (s) =>
      interativo && s.modoEdicao && carrinhaId !== null && dormidaPendente(s.pendentes, carrinhaId) !== null,
  );
  const temLigacoes = ligacoes.length > 0;
  if (!temLigacoes && !aviso && !sempreCheia && !semCondutor && !mudarDormida) return null;
  // Só "por definir": no modo compacto esconde-se (o título da secção, "Onde dorme: por definir", já o diz).
  const soPorDefinir =
    ligacoes.length === 1 && ligacoes[0]?.tipo === 'por-definir' && !aviso && !sempreCheia && !semCondutor;
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
      {aviso && (
        <span
          className={`inline-flex items-center rounded-[0.2em] border px-[0.25em] font-medium ${
            aviso.tipo === 'acima_tolerado'
              ? 'border-red-500 bg-red-100 text-red-900'
              : 'border-amber-400 bg-amber-100 text-amber-900'
          }`}
          title={
            aviso.tipo === 'acima_tolerado' ? 'Acima do tolerado no contrato' : 'Acima do máximo do contrato'
          }
        >
          <span aria-hidden="true">{aviso.tipo === 'acima_tolerado' ? '!!' : '!'}&nbsp;</span>
          contrato {aviso.maximo}
          {aviso.tolerado !== null && aviso.tolerado !== aviso.maximo ? ` (tol. ${aviso.tolerado})` : ''}
        </span>
      )}
      {sempreCheia && <span className="italic">sempre cheia</span>}
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
  const conteudo =
    tipo === 'carrinha' ? (
      <>
        <Matricula matricula={titulo} altura={alturaMatricula(letra)} />
        <span className="sr-only">
          {detalhe?.startsWith('Carro') ? 'Carro' : 'Carrinha'} {titulo}
        </span>
      </>
    ) : (
      <span className="min-w-0 leading-tight font-semibold break-words text-slate-900">{titulo}</span>
    );
  return (
    <h4 id={id} className="flex min-w-0 flex-1 items-center">
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
  const { lotacao, largo, pessoas, vazios, detalhe, tipo, id } = bloco;
  return (
    <article
      aria-labelledby={idTitulo}
      data-elemento={
        id !== null && (tipo === 'casa' || tipo === 'carrinha') ? chaveElemento({ tipo, id }) : undefined
      }
      data-alvo={alvo ? bloco.chave : undefined}
      className={[
        'flex min-w-0 flex-col rounded-[0.35em] border transition-[background-color,border-color,box-shadow]',
        largo ? 'col-span-full border-dashed bg-slate-50' : 'bg-white shadow-xs',
        alterado ? 'border-amber-400' : largo ? 'border-slate-400' : 'border-slate-300',
        emFoco ? 'ring-2 ring-slate-900' : '',
        POR_CIMA,
      ].join(' ')}
    >
      <header className="flex min-h-[1.9em] flex-wrap items-center gap-x-[0.4em] gap-y-[0.15em] px-[0.45em] pt-[0.25em] pb-[0.15em]">
        <Titulo bloco={bloco} letra={letra} id={idTitulo} interativo={interativo} />
        {largo && <PorCliente bloco={bloco} />}
        {alterado && (
          <span className="font-semibold text-amber-700" title="Alterado — por guardar">
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
      </header>
      {/* Na reunião não há marca e modelo: não interessam para a reunião e roubavam uma linha por carrinha. */}
      {detalhe && tipo === 'carrinha' && !reuniao && (
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
                className={`min-w-0 rounded-[0.25em] ${realceFoco.has(p.id) ? 'ring-2 ring-slate-400' : ''}`}
              >
                <NomeVista
                  pessoa={p}
                  condutor={ehCondutor(p, indices)}
                  quebrar
                  interativo={interativo}
                  arrastavel={interativo}
                  seguirLegenda={interativo}
                />
              </li>
            ))}
            {Array.from({ length: vazios }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: os lugares livres não têm identidade própria.
              <li key={`livre-${i}`} aria-hidden="true" className={`min-w-0 ${SO_COMPLETO}`}>
                <span className="flex rounded-[0.25em] border border-dashed border-slate-300 px-[0.4em] leading-[1.35] text-slate-400 italic">
                  livre
                </span>
              </li>
            ))}
          </ul>
        </ContextoOrdemPessoas.Provider>
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
      <div className={ladoALado ? 'flex flex-col gap-[0.6em] sm:flex-row' : ''}>
        {faixa.partes.map((parte) => (
          <div
            key={parte.chave}
            className="min-w-0"
            // Lado a lado, cada parte fica com a largura proporcional aos seus blocos.
            style={ladoALado ? { flex: `${parte.blocos.length} 1 0%` } : undefined}
          >
            {parte.titulo && (
              <p className={`mb-[0.2em] ${TEXTO_SECUNDARIO} font-semibold text-slate-600`}>{parte.titulo}</p>
            )}
            <div
              className={GRELHA_BLOCOS}
              style={
                parte.blocos.some((b) => b.largo)
                  ? undefined
                  : ({
                      '--largura-grelha': `${(parte.blocos.length * (LARGURA_MAX_BLOCO + 0.45)).toFixed(2)}em`,
                    } as CSSProperties)
              }
            >
              {parte.blocos.map((b) => (
                <BlocoVista key={b.chave} bloco={b} letra={letra} />
              ))}
            </div>
          </div>
        ))}
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
  const unidade = agrupamento === 'casas' ? ['casa', 'casas'] : ['carrinha', 'carrinhas'];
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
              {comPlural(seccao.nBlocos, unidade[0] as string, unidade[1] as string)} ·{' '}
              {comPlural(seccao.nPessoas, 'pessoa', 'pessoas')}
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

  const seccoes = useMemo(
    () => (estado && indices && dormidas ? montarQuadro(agrupamento, estado, indices, dormidas) : []),
    [agrupamento, estado, indices, dormidas],
  );
  const nBlocos = useMemo(() => blocosDoQuadro(seccoes).filter((b) => !b.largo).length, [seccoes]);
  // No modo de edição o rascunho muda o estado a cada largada: a letra só se volta a escolher quando muda o
  // agrupamento ou o número de blocos (ou o espaço, pelo ResizeObserver); se deixar de caber, desliza.
  const { letra, compacto } = useAjuste(
    contentor,
    interior,
    reuniao,
    editar ? `edicao:${agrupamento}:${nBlocos}` : seccoes,
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
  const espacador = useRef<HTMLDivElement>(null);
  useEspacoFicha(envolventeFicha, espacador, !reuniao && foco !== null);
  // Pesquisa, contadores, ligações: desliza até ao elemento e acende-o, sem mudar de vista (também na
  // reunião). Depois de desenhar: o foco acabou de mudar (anéis, espaço da ficha no telemóvel).
  // Procura-se só dentro do Quadro (o mapa escondido também tem data-alvo e data-pessoa-id).
  useAoMostrar((elemento) => {
    const { indices: ind, dormidas: dorm } = useLoja.getState();
    if (!ind || !dorm) return;
    revelarDepoisDeDesenhar(
      () => raiz.current,
      chavesNoQuadro(elemento, useVista.getState().agrupamento, ind, dorm),
    );
  });

  if (!estado || !indices || !dormidas) return null;
  const nPessoas = estado.pessoas.filter((p) => p.ativa).length;
  const comFicha = !reuniao && foco !== null;

  return (
    <section
      ref={raiz}
      aria-label={agrupamento === 'casas' ? 'Quadro das casas' : 'Quadro das carrinhas'}
      className="relative flex min-h-0 flex-1 flex-col bg-slate-50"
    >
      {!reuniao && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2">
          <AlternadorAgrupamento />
          <p className="text-sm text-slate-700 tabular-nums">
            {agrupamento === 'casas'
              ? comPlural(nBlocos, 'casa', 'casas')
              : comPlural(nBlocos, 'carrinha', 'carrinhas')}{' '}
            · {comPlural(nPessoas, 'pessoa', 'pessoas')}
          </p>
          <Legenda lugar="barra" />
          <div className="ml-auto">
            <BotaoExcel />
          </div>
          {editar && (
            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
              <p className="min-w-0 flex-1 basis-56 text-xs leading-snug text-slate-600">
                Arrasta os nomes para outra casa ou carrinha (no telemóvel, toque longo).
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
            data-compacto={compacto ? '' : undefined}
            style={{ fontSize: `${letra}px` }}
          >
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
