// A moldura da ficha (PainelFoco) e as peças com que se montam as fichas: o cabeçalho (tipo, título,
// subtítulo, "alterado — por guardar", "Ver no mapa", ✕), o corpo que desliza por dentro, a ficha
// recolhida da vista no telemóvel, a ficha arrastável no PC (useJanelaArrastavel) e as linhas, secções e
// ligações do corpo. Saiu do PainelFoco.tsx no M2 (docs/m2.md) para as fichas novas (obra) e as secções
// novas (indisponível, problemas) se montarem em ficheiros próprios, cada um do seu módulo, sem mexer no
// PainelFoco. O comportamento é o de sempre (docs/vistas-edicao.md).

import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
  useId,
  useSyncExternalStore,
} from 'react';
import { MarcaAlterado } from '../edicao/PecasFoco';
import { type Foco, useLoja } from '../estado/loja';
import { IconeMapa } from '../vistas/icones';
import { ATRIBUTO_FICHA, mostrarElemento, seguirPessoaEmFoco } from '../vistas/mostrar';
import { verNoMapa } from '../vistas/navegar';
import { alturaMaximaPainelFoco, FOCO_VISIVEL, Z_SOBRE_MAPA } from './classes';
import type { VistaFicha } from './fichas';
import { useAlturaLegenda } from './ganchos';
import { IconeFechar } from './pecas';
import {
  ATRIBUTO_PEGA,
  ATRIBUTO_TEXTO,
  type JanelaArrastavel,
  type PosicaoLugar,
  useJanelaArrastavel,
} from './useJanelaArrastavel';

/** Onde a ficha aparece: sobre o mapa ou sobre a Tabela/Quadro. */
export type LugarFicha = 'mapa' | 'vista';

export const ContextoLugar = createContext<LugarFicha>('mapa');

/** A vista onde a ficha está (Mapa, Tabela ou Quadro): a posição lembrada e a ficha compacta da pessoa. */
export const ContextoVistaFicha = createContext<VistaFicha>('mapa');

/**
 * Ficha da vista no telemóvel: se está aberta toda ou recolhida. null no mapa e no PC (sempre inteira,
 * como sempre).
 */
export interface Recolher {
  inteira: boolean;
  alternar: () => void;
  /** Um clique dentro da ficha: se mudar o foco (ligações, nomes), a ficha fica como está. */
  marcarDentro: () => void;
}
export const ContextoRecolher = createContext<Recolher | null>(null);

/** A posição da ficha arrastável deste lugar (fica no PainelFoco: sobrevive a mudar de ficha). */
export const ContextoPosicao = createContext<PosicaoLugar | null>(null);

/** O contrário do `sm:` do Tailwind: abaixo disto a ficha da vista é uma folha em baixo. */
const CONSULTA_TELEMOVEL = '(max-width: 39.99rem)';

function subscreverTelemovel(avisar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_TELEMOVEL);
  consulta.addEventListener('change', avisar);
  return () => consulta.removeEventListener('change', avisar);
}

export function useTelemovel(): boolean {
  return useSyncExternalStore(
    subscreverTelemovel,
    () => window.matchMedia(CONSULTA_TELEMOVEL).matches,
    () => false,
  );
}

/**
 * Posição, tamanho e sombra da ficha em cada lugar (a do mapa é a de sempre). Na vista, no telemóvel, é
 * uma folha em baixo (a sombra para cima separa-a do que está por trás); a partir de 640 px, um cartão em
 * cima à direita. O conteúdo desliza por dentro (Moldura): a ficha nunca faz a página deslizar.
 */
const CLASSES_LUGAR: Record<LugarFicha, string> = {
  mapa: 'top-3 left-3 w-[min(22rem,calc(100%-4.5rem))] rounded-lg shadow-lg',
  vista:
    'inset-x-2 bottom-2 rounded-xl shadow-[0_-4px_24px_rgb(15_23_42/0.22)] sm:inset-x-auto sm:top-2 sm:right-3 sm:bottom-auto sm:max-h-[calc(100%-1rem)] sm:w-[min(22rem,calc(100%-1.5rem))] sm:rounded-lg sm:shadow-lg',
};

/**
 * Altura máxima da ficha da vista no telemóvel (no PC manda o `sm:max-h` de cima).
 * - Inteira: até 60 % da área da vista, ou até 16 rem se a área der, mas deixando sempre 6 rem da vista à
 *   mostra (num ecrã baixo, a editar, a área fica com uns 320 px: 16 rem tapava-a quase toda).
 * - Recolhida: o que precisa (cabeçalho, resumo, ações), até 45 % da área (ou 9 rem, se a área der).
 * - Com um campo aberto (M2, CamposFicha.tsx: o formulário tem data-campo-aberto): a ficha passa a ocupar
 *   o ecrã todo (fixed, com 0,5 rem de margem, por cima da barra do modo de edição, z 1060, e por baixo
 *   dos avisos e popovers, 1090+) até o campo fechar. A editar, a área da Tabela e do Quadro fica com uns
 *   230 px e a ficha inteira tinha uns 130: o campo, o aviso e o erro não cabiam.
 */
const ALTURA_VISTA_TELEMOVEL = {
  inteira:
    'max-h-[max(60%,min(16rem,calc(100%-6rem)))] max-sm:has-data-campo-aberto:fixed max-sm:has-data-campo-aberto:top-2 max-sm:has-data-campo-aberto:z-[1070] max-sm:has-data-campo-aberto:max-h-none',
  recolhida: 'max-h-[max(45%,min(9rem,calc(100%-1rem)))]',
} as const;

/**
 * As ações (AcoesPessoa, AcoesDormida) na ficha recolhida: sem a linha por cima nem o título "Mudar", numa
 * só fila que desliza de lado (o último botão fica meio à vista), para a ficha recolhida não crescer.
 */
const ACOES_RECOLHIDA =
  'mt-1.5 [&_button]:shrink-0 [&_button]:whitespace-nowrap [&>div]:mt-0 [&>div]:border-t-0 [&>div]:pt-0 [&>div>div]:flex-nowrap [&>div>div]:overflow-x-auto [&>div>p]:sr-only [&>span]:mt-0 [&>span]:flex-nowrap [&>span]:overflow-x-auto';

/**
 * A legenda dos clientes (canto inferior esquerdo do mapa; paineis/Legenda.tsx): a ficha arrastada no
 * mapa acaba por cima dela, como na origem, a não ser que se ponha o topo da ficha na faixa da legenda.
 */
const SELETOR_LEGENDA_MAPA = '[data-legenda-mapa]';

/**
 * A ficha: cabeçalho e corpo. Todas as fichas (pessoa, casa, carrinha e, no M2, obra) usam esta moldura,
 * para se arrastarem, recolherem e fecharem da mesma maneira.
 */
export function Moldura({
  tipo,
  titulo,
  subtitulo,
  alterado = false,
  resumo,
  acoes,
  compacta = false,
  children,
}: {
  tipo: string;
  titulo: string;
  subtitulo?: ReactNode;
  /** Tem alterações por guardar (modo de edição). */
  alterado?: boolean;
  /** Ficha recolhida (vista, telemóvel): o essencial numa ou duas linhas, em vez do corpo. */
  resumo?: ReactNode;
  /** Ficha recolhida: as ações principais (as mesmas que o corpo tem no fim). */
  acoes?: ReactNode;
  /** Ficha compacta (pessoa na Tabela): já é curta, nunca recolhe (sem "Ver tudo"). */
  compacta?: boolean;
  /** null = sem corpo: só o cabeçalho (a ficha compacta sem nada a mostrar). */
  children: ReactNode;
}) {
  const definirFoco = useLoja((s) => s.definirFoco);
  const idTitulo = useId();
  const idCorpo = useId();
  const alturaLegenda = useAlturaLegenda();
  const lugar = useContext(ContextoLugar);
  const recolherDoLugar = useContext(ContextoRecolher);
  const recolher = compacta ? null : recolherDoLugar;
  const recolhida = recolher !== null && !recolher.inteira;
  const temCorpo = recolhida || (children !== null && children !== undefined);
  const altura = lugar === 'vista' ? ALTURA_VISTA_TELEMOVEL[recolhida ? 'recolhida' : 'inteira'] : '';
  const janela = useJanelaArrastavel(
    useContext(ContextoPosicao),
    lugar === 'mapa' ? { seletor: SELETOR_LEGENDA_MAPA, versao: alturaLegenda } : undefined,
  );
  // Arrastável: o título e o subtítulo (morada, matrícula) continuam a selecionar-se e a copiar-se; pega-se
  // pela pega, pela linha do tipo e pelo espaço vazio do cabeçalho.
  const texto = janela.ativa ? { [ATRIBUTO_TEXTO]: '' } : undefined;
  const classeTexto = janela.ativa ? 'w-fit max-w-full cursor-text select-text' : '';
  return (
    <section
      ref={janela.refJanela}
      aria-labelledby={idTitulo}
      // Na vista, quem desliza até um elemento (vistas/mostrar.ts) deixa-o fora da ficha.
      {...{ [ATRIBUTO_FICHA]: lugar }}
      data-movida={janela.movida ? '' : undefined}
      data-compacta={compacta ? '' : undefined}
      data-a-arrastar={janela.arrastando ? '' : undefined}
      // Arrastada, manda a posição que se escolheu. Na origem, no mapa, a ficha acaba por cima da legenda
      // (canto inferior esquerdo) em vez de a tapar.
      style={
        janela.estilo ?? (lugar === 'mapa' ? { maxHeight: alturaMaximaPainelFoco(alturaLegenda) } : undefined)
      }
      onClickCapture={
        lugar === 'vista'
          ? (e) => {
              recolher?.marcarDentro();
              seguirNomeClicado(e);
            }
          : undefined
      }
      className={`absolute ${CLASSES_LUGAR[lugar]} ${altura} ${Z_SOBRE_MAPA} flex flex-col overflow-hidden border bg-white text-sm ${
        alterado ? 'border-amber-400' : 'border-slate-300'
      } ${janela.arrastando ? 'shadow-2xl ring-2 ring-blue-500/40' : ''}`}
    >
      <header
        {...janela.pega}
        className={`flex items-start gap-2 px-3 ${temCorpo ? 'border-b border-slate-200' : ''} ${recolhida ? 'py-1.5' : 'py-2'} ${
          janela.ativa ? CLASSES_CABECALHO_ARRASTAVEL : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {janela.ativa && <Pega janela={janela} />}
            <span className="text-[11px] font-semibold tracking-wide text-slate-600 uppercase">{tipo}</span>
            {alterado && <MarcaAlterado />}
            {recolher && (
              <BotaoRecolher inteira={recolher.inteira} alternar={recolher.alternar} corpo={idCorpo} />
            )}
          </p>
          {/* Recolhida: o título numa linha (inteiro na ficha toda) e sem o subtítulo; tocar-lhe abre-a. */}
          <h2
            id={idTitulo}
            {...texto}
            className={`text-base leading-tight font-bold text-slate-900 ${recolhida ? 'truncate' : 'break-words'} ${classeTexto}`}
          >
            {recolhida && recolher ? (
              <button
                type="button"
                onClick={recolher.alternar}
                aria-controls={idCorpo}
                aria-expanded={false}
                title={`${titulo}: ver a ficha toda`}
                className={`max-w-full truncate rounded-sm text-left ${FOCO_VISIVEL}`}
              >
                {titulo}
              </button>
            ) : (
              titulo
            )}
          </h2>
          {subtitulo && !recolhida && (
            <p {...texto} className={`mt-0.5 text-xs text-slate-700 ${classeTexto}`}>
              {subtitulo}
            </p>
          )}
        </div>
        {janela.movida && <BotaoVoltarAoSitio janela={janela} />}
        {lugar === 'vista' && <BotaoVerNoMapa />}
        <button
          type="button"
          aria-label="Fechar a ficha"
          title="Fechar (Esc)"
          onClick={() => definirFoco(null)}
          className={`-mr-1 shrink-0 rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${FOCO_VISIVEL}`}
        >
          <IconeFechar />
        </button>
      </header>
      {/* Sem corpo, a ficha arrastável mede só a <section> (useJanelaArrastavel aceita refConteudo a null). */}
      {temCorpo && (
        <div id={idCorpo} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {/* Invólucro sem estilo: a ficha arrastável mede-o para saber a altura do conteúdo todo. */}
          <div ref={janela.refConteudo}>
            {recolhida ? (
              <>
                {resumo}
                {acoes && <div className={ACOES_RECOLHIDA}>{acoes}</div>}
              </>
            ) : (
              children
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Cabeçalho da ficha arrastável (PC): a mão de agarrar, sem selecionar texto, e o dedo não desliza a
 * página. Os botões ficam com a seta de sempre (o cursor herda-se).
 */
const CLASSES_CABECALHO_ARRASTAVEL = `cursor-grab touch-none select-none active:cursor-grabbing [&_button:not([${ATRIBUTO_PEGA}])]:cursor-default`;

/**
 * A pega da ficha arrastável, antes do tipo: arrasta-se como o resto do cabeçalho e, com o foco do
 * teclado, as setas mudam a ficha de sítio (Shift: passos maiores) e Início volta à origem.
 */
function Pega({ janela }: { janela: JanelaArrastavel }) {
  const idAjuda = useId();
  return (
    <>
      <button
        type="button"
        {...{ [ATRIBUTO_PEGA]: '' }}
        // Carregar não faz nada (arrasta-se ou usam-se as setas): o nome e o papel dizem-no.
        aria-label="Mover a ficha com as setas"
        aria-roledescription="pega"
        aria-describedby={idAjuda}
        title="Arrastar para mudar a ficha de sítio (duplo clique no cabeçalho volta ao sítio)"
        className={`-my-1 -ml-1.5 shrink-0 cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing ${FOCO_VISIVEL}`}
      >
        <IconePega />
      </button>
      <span id={idAjuda} className="sr-only">
        Setas para mover, com Shift em passos maiores; Início volta ao sítio.
        {janela.movida ? ' A ficha não está no sítio de origem.' : ''}
      </span>
    </>
  );
}

/** Seis pontos (agarrar). */
function IconePega() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
      <circle cx="6" cy="4" r="1.25" />
      <circle cx="10" cy="4" r="1.25" />
      <circle cx="6" cy="8" r="1.25" />
      <circle cx="10" cy="8" r="1.25" />
      <circle cx="6" cy="12" r="1.25" />
      <circle cx="10" cy="12" r="1.25" />
    </svg>
  );
}

/** Na ficha que se mudou de sítio: volta à posição de origem (o foco passa para a pega). */
function BotaoVoltarAoSitio({ janela }: { janela: JanelaArrastavel }) {
  return (
    <button
      type="button"
      title="Voltar a pôr a ficha no sítio (ou duplo clique no cabeçalho)"
      aria-label="Voltar a pôr a ficha no sítio"
      onClick={(e) => {
        e.currentTarget.closest('header')?.querySelector<HTMLElement>(`[${ATRIBUTO_PEGA}]`)?.focus();
        janela.repor();
      }}
      className={`inline-flex h-7 shrink-0 items-center rounded border border-slate-300 bg-white px-1.5 text-slate-700 hover:bg-slate-50 hover:text-slate-900 ${FOCO_VISIVEL}`}
    >
      <IconeVoltar />
    </button>
  );
}

/** Seta que volta para trás (repor). */
function IconeVoltar() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 5.5h6.5a3.5 3.5 0 0 1 0 7H6" />
      <path d="M5.5 3 3 5.5 5.5 8" />
    </svg>
  );
}

/** Seta para cima (abrir a ficha toda) ou para baixo (recolher). */
function IconeSeta({ paraCima }: { paraCima: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paraCima ? 'm3.5 10 4.5-4.5 4.5 4.5' : 'm3.5 6 4.5 4.5 4.5-4.5'} />
    </svg>
  );
}

/** Na ficha da vista no telemóvel, na linha do tipo: "Ver tudo" abre-a toda; "Recolher" volta a fechá-la. */
function BotaoRecolher({
  inteira,
  alternar,
  corpo,
}: {
  inteira: boolean;
  alternar: () => void;
  corpo: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={inteira}
      aria-controls={corpo}
      title={inteira ? 'Recolher a ficha' : 'Ver a ficha toda'}
      onClick={alternar}
      className={`-my-1 ml-auto inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 ${FOCO_VISIVEL}`}
    >
      {inteira ? 'Recolher' : 'Ver tudo'}
      <IconeSeta paraCima={!inteira} />
    </button>
  );
}

/**
 * Na ficha da vista, os nomes (moradores, passageiros) são NomeChip, que só mudam o foco (e a seleção, no
 * modo de edição) e não deixam o clique subir. Apanha-se o clique ao descer e, depois de o nome o tratar,
 * se a pessoa ficou em foco a vista leva-se até ela, como nas outras ligações da ficha. (Um setTimeout e
 * não uma microtarefa: o React trata o clique ao descer e ao subir em dois ouvintes separados.)
 */
function seguirNomeClicado(e: MouseEvent<HTMLElement>) {
  const nome = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-pessoa-id]') : null;
  // (contains: um clique num diálogo aberto a partir da ficha também passa por aqui no React.)
  const id = nome && e.currentTarget.contains(nome) ? nome.dataset.pessoaId : undefined;
  if (id) setTimeout(() => seguirPessoaEmFoco(id), 0);
}

/** Na Tabela e no Quadro: o único caminho para o Mapa (leva o mapa até ao que está em foco). */
function BotaoVerNoMapa() {
  return (
    <button
      type="button"
      title="Ver no mapa"
      onClick={() => {
        const { foco } = useLoja.getState();
        if (foco) verNoMapa(foco);
      }}
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 ${FOCO_VISIVEL}`}
    >
      <IconeMapa className="size-4" />
      {/* No telemóvel só o ícone (o nome do botão fica para os leitores de ecrã). */}
      <span className="sr-only sm:not-sr-only">Ver no mapa</span>
    </button>
  );
}

/** Uma linha "rótulo: valor" do corpo da ficha (dentro de um <dl>). */
export function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <dt className="w-24 shrink-0 text-xs leading-5 text-slate-600">{rotulo}</dt>
      <dd className="min-w-0 flex-1 leading-5">{children}</dd>
    </div>
  );
}

/** Uma secção do corpo da ficha, com título em maiúsculas pequenas ("MORADORES (6)"). */
export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * Texto clicável que muda o foco para uma pessoa, casa, carrinha ou obra. No Mapa só muda o foco (como
 * sempre); na Tabela e no Quadro a vista também desliza até lá e acende-a.
 */
export function BotaoFoco({ foco, children }: { foco: NonNullable<Foco>; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => mostrarElemento(foco, { noMapa: 'so-foco' })}
      className={`rounded-sm text-left font-medium text-blue-800 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-800 ${FOCO_VISIVEL}`}
    >
      {children}
    </button>
  );
}

/** Valor em falta ("sem dados ainda", "Fora das casas CMF"…), em itálico. */
export function Vazio({ children }: { children: ReactNode }) {
  return <span className="text-slate-600 italic">{children}</span>;
}
