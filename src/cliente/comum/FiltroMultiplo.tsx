// Filtro de escolha múltipla: um botão ("Casa: todas", "Casa: Casa 1 Puttelange", "Casa" + pastilha "2")
// que abre um painel com caixas de seleção. Usado pela Tabela (Cliente, Casa, Carrinha, Obra) e pelo Quadro
// (Obras). Controlado: quem o usa guarda as escolhas (vazio = sem filtro) e recebe as novas em `aoMudar`.
// As decisões (texto do botão, pesquisa, secções, posição) estão em escolhaMultipla.ts (outro nome: no
// Windows, que não distingue maiúsculas, "./FiltroMultiplo" sem extensão encontrava filtroMultiplo.ts).
//
// - O painel é FIXO no ecrã (não absoluto): as barras das vistas podem recortar ou deslizar sem o esconder.
//   Segue o botão quando a página ou a barra desliza e quando a janela muda de tamanho (no telemóvel o
//   teclado muda a altura; fechar aí fechava-o ao tocar na pesquisa). Fecha com um clique fora, com Esc
//   (o foco volta ao botão), com Enter numa caixa, com o ✕ ou quando o foco sai pelo Tab.
// - Teclado: ↓ no botão abre; ↑/↓/Início/Fim andam pelas caixas (↑ na primeira volta à pesquisa); Espaço
//   liga/desliga; Enter na pesquisa vai para a primeira caixa.
// - Telemóvel: o painel cabe em 375 px (no máximo a largura do ecrã menos 8 px de cada lado), linhas de
//   44 px com o dedo, texto de 16 px na pesquisa (o iPhone não aproxima) e o teclado não abre sozinho.
// - Os cliques dentro do painel não começam arrastos nem caixas de seleção: são caixas, botões e labels,
//   que o motor e a caixa de seleção do Quadro já ignoram.

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { FOCO_VISIVEL, Z_POPOVER } from '../paineis/classes';
import { useFecharFora } from '../paineis/ganchos';
import {
  alternarEscolha,
  escolherTodas,
  filtrarOpcoes,
  type Genero,
  LIMIAR_PESQUISA,
  type OpcaoFiltro,
  type PosicaoPainel,
  posicaoPainel,
  proximaCaixa,
  rotuloBotao,
  type SecaoFiltro,
  seccionarOpcoes,
  todasEscolhidas,
} from './escolhaMultipla';

/** Uma opção com, opcionalmente, uma marca à esquerda (ex.: `<MarcaCliente cliente={c} />`). */
export interface OpcaoFiltroMultiplo extends OpcaoFiltro {
  marca?: ReactNode;
}

export interface FiltroMultiploProps {
  /** Nome do filtro, com maiúscula: "Casa", "Cliente", "Carrinha", "Obra". */
  rotulo: string;
  opcoes: readonly OpcaoFiltroMultiplo[];
  /** O que está escolhido. Vazio = sem filtro ("Casa: todas"). */
  escolhidos: ReadonlySet<string>;
  /** Recebe sempre um conjunto novo (nunca o mesmo objeto alterado). */
  aoMudar: (escolhidos: Set<string>) => void;
  /** "todas/escolhidas" (f, por omissão) ou "todos/escolhidos" (m). */
  genero?: Genero;
  /** Texto quando não há nada para escolher (o botão fica desativado): "sem obras" → "Obra: sem obras". */
  textoVazio?: string;
  /** Nome para leitores de ecrã do grupo de caixas. Por omissão "Filtrar por casa" (rótulo em minúsculas). */
  legenda?: string;
  /** Campo para filtrar a lista. Por omissão, só com mais de `LIMIAR_PESQUISA` (8) opções. */
  pesquisa?: boolean;
  /** Largura desejada do painel em px (fica sempre dentro do ecrã). Por omissão 288. */
  larguraPainel?: number;
  /** 'normal' = h-8 como os campos da Tabela; 'compacto' = h-7 e letra pequena (barras do Quadro). */
  tamanho?: 'normal' | 'compacto';
  /** Classes do invólucro (ex.: "w-full min-w-0" numa grelha). O botão ocupa a largura do invólucro. */
  className?: string;
  /** Classes extra do botão (ex.: larguras máximas por ecrã: "sm:max-w-[10rem] xl:max-w-[12rem]"). */
  classeBotao?: string;
}

const BOTAO_BASE =
  'inline-flex w-full min-w-0 items-center gap-1 rounded-md border bg-white text-left text-slate-800 disabled:cursor-not-allowed disabled:text-slate-500 disabled:opacity-70';

const TAMANHO_BOTAO = {
  normal: 'h-8 px-2 text-base sm:text-sm',
  compacto: 'h-7 px-1.5 text-xs',
} as const;

/** Botões pequenos do cabeçalho do painel (Todas, Limpar, ✕): 44 px de alto com o dedo. */
const BOTAO_PAINEL = `inline-flex h-7 shrink-0 items-center justify-center rounded px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:h-11 pointer-coarse:min-w-11 ${FOCO_VISIVEL}`;

/** O ecrã é de toque (aí não se abre o teclado sozinho ao abrir o painel). */
function ehToque(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function FiltroMultiplo({
  rotulo,
  opcoes,
  escolhidos,
  aoMudar,
  genero = 'f',
  textoVazio,
  legenda,
  pesquisa,
  larguraPainel = 288,
  tamanho = 'normal',
  className = '',
  classeBotao = '',
}: FiltroMultiploProps) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [posicao, setPosicao] = useState<PosicaoPainel | null>(null);
  const contentor = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const id = useId();
  const idPainel = `${id}-painel`;
  const idCampo = `${id}-pesquisa`;
  const idTitulo = `${id}-titulo`;

  const r = rotuloBotao(rotulo, opcoes, escolhidos, { genero, textoVazio });
  const ativo = escolhidos.size > 0;
  const comPesquisa = pesquisa ?? opcoes.length > LIMIAR_PESQUISA;
  const visiveis = comPesquisa ? filtrarOpcoes(opcoes, texto) : [...opcoes];
  const secoes = seccionarOpcoes(visiveis);
  const aFiltrar = comPesquisa && texto.trim() !== '';
  const nomeGrupo = legenda ?? `Filtrar por ${rotulo.toLowerCase()}`;

  const fechar = useCallback(() => {
    if (painel.current?.contains(document.activeElement)) botao.current?.focus();
    setAberto(false);
  }, []);
  useFecharFora(aberto, contentor, fechar);

  // Sem nada para escolher (ex.: ainda não há obras), não fica aberto.
  useEffect(() => {
    if (r.vazio && aberto) setAberto(false);
  }, [r.vazio, aberto]);

  // O foco saiu pelo Tab para fora do filtro: fecha (sem roubar o foco de volta). Um clique dentro do
  // painel num sítio que não recebe o foco não tem `relatedTarget`: não fecha.
  useEffect(() => {
    const c = contentor.current;
    if (!aberto || !c) return;
    const aoSairFoco = (e: FocusEvent) => {
      const seguinte = e.relatedTarget;
      if (seguinte instanceof Node && !c.contains(seguinte)) setAberto(false);
    };
    c.addEventListener('focusout', aoSairFoco);
    return () => c.removeEventListener('focusout', aoSairFoco);
  }, [aberto]);

  // Posição: calculada antes de pintar e outra vez quando a janela muda ou alguma coisa desliza por fora.
  useLayoutEffect(() => {
    if (!aberto) return;
    let pedido = 0;
    const atualizar = () => {
      pedido = 0;
      const b = botao.current?.getBoundingClientRect();
      if (!b || (b.width === 0 && b.height === 0)) {
        // O botão desapareceu (ex.: a barra mudou com o tamanho do ecrã).
        setAberto(false);
        return;
      }
      const vv = window.visualViewport;
      const altura = Math.min(window.innerHeight, vv ? vv.height + vv.offsetTop : window.innerHeight);
      setPosicao(
        posicaoPainel(
          { top: b.top, bottom: b.bottom, left: b.left },
          { largura: document.documentElement.clientWidth || window.innerWidth, altura },
          larguraPainel,
        ),
      );
    };
    const agendar = (e?: Event) => {
      if (e?.target instanceof Node && painel.current?.contains(e.target)) return;
      if (!pedido) pedido = requestAnimationFrame(atualizar);
    };
    atualizar();
    window.addEventListener('resize', agendar);
    window.addEventListener('scroll', agendar, true);
    window.visualViewport?.addEventListener('resize', agendar);
    return () => {
      if (pedido) cancelAnimationFrame(pedido);
      window.removeEventListener('resize', agendar);
      window.removeEventListener('scroll', agendar, true);
      window.visualViewport?.removeEventListener('resize', agendar);
    };
  }, [aberto, larguraPainel]);

  // Ao abrir: no PC o foco vai para a pesquisa (ou para a primeira caixa escolhida, ou a primeira);
  // no telemóvel fica no painel, sem abrir o teclado.
  useEffect(() => {
    if (!aberto) return;
    const p = painel.current;
    if (!p) return;
    if (ehToque()) {
      p.focus({ preventScroll: true });
      return;
    }
    if (campo.current) {
      campo.current.focus({ preventScroll: true });
      return;
    }
    const caixas = caixasDe(p);
    (caixas.find((c) => c.checked) ?? caixas[0] ?? p).focus({ preventScroll: true });
  }, [aberto]);

  const abrir = () => {
    if (r.vazio) return;
    setTexto('');
    setAberto(true);
  };

  const aoTeclarBotao = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' && !aberto) {
      e.preventDefault();
      abrir();
    }
  };

  const aoTeclarPainel = (e: KeyboardEvent<HTMLDivElement>) => {
    const p = painel.current;
    if (!p) return;
    const alvo = e.target as HTMLElement;
    const naPesquisa = alvo === campo.current;
    if (e.key === 'Enter') {
      if (naPesquisa) {
        e.preventDefault();
        caixasDe(p)[0]?.focus();
      } else if (alvo instanceof HTMLInputElement && alvo.type === 'checkbox') {
        e.preventDefault();
        fechar();
      }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    // Início/Fim dentro da pesquisa movem o cursor no texto.
    if (naPesquisa && (e.key === 'Home' || e.key === 'End' || e.key === 'ArrowUp')) return;
    const caixas = caixasDe(p);
    const atual = naPesquisa ? -1 : caixas.indexOf(alvo as HTMLInputElement);
    if (!naPesquisa && atual < 0) return;
    e.preventDefault();
    const proximo = proximaCaixa(atual, caixas.length, e.key);
    if (proximo < 0) campo.current?.focus();
    else caixas[proximo]?.focus();
  };

  const podeTodas = !todasEscolhidas(escolhidos, visiveis) && visiveis.some((o) => !o.desativada);
  const nVisiveisAtivas = visiveis.filter((o) => !o.desativada).length;

  return (
    <div ref={contentor} className={`relative min-w-0 ${className}`}>
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={idPainel}
        disabled={r.vazio}
        title={r.lista ? `${rotulo}: ${r.lista}` : r.texto}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={aoTeclarBotao}
        className={`${BOTAO_BASE} ${TAMANHO_BOTAO[tamanho]} ${FOCO_VISIVEL} ${
          ativo
            ? 'border-slate-800 font-semibold'
            : 'border-slate-300 enabled:hover:border-slate-400 enabled:hover:bg-slate-50'
        } ${aberto ? 'bg-slate-100' : ''} ${classeBotao}`}
      >
        {r.numero !== null ? (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="truncate">{rotulo}</span>
            <span className="sr-only">: </span>
            <span className="inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-slate-800 px-1.5 text-xs leading-none font-semibold text-white tabular-nums">
              {r.numero}
            </span>
            <span className="sr-only"> {genero === 'f' ? 'escolhidas' : 'escolhidos'}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{r.texto}</span>
        )}
        <span aria-hidden="true" className="shrink-0 text-[10px] text-slate-500">
          {aberto ? '▴' : '▾'}
        </span>
      </button>

      <div
        ref={painel}
        id={idPainel}
        role="dialog"
        aria-modal="false"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        hidden={!aberto}
        onKeyDown={aoTeclarPainel}
        style={
          posicao
            ? {
                left: posicao.left,
                width: posicao.largura,
                top: posicao.top,
                bottom: posicao.bottom,
                maxHeight: posicao.alturaMaxima,
              }
            : undefined
        }
        className={`fixed ${Z_POPOVER} flex flex-col overflow-hidden rounded-md border border-slate-300 bg-white text-sm font-normal text-slate-800 shadow-lg outline-none`}
      >
        {/* Cabeçalho: o nome do filtro, Todas, Limpar e ✕. */}
        <div className="flex shrink-0 items-center gap-0.5 border-b border-slate-200 py-1 pr-1 pl-2.5">
          <p
            id={idTitulo}
            className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-slate-600 uppercase"
          >
            {rotulo}
            {ativo && (
              <span className="ml-1 font-normal tracking-normal normal-case">
                ({escolhidos.size} {genero === 'f' ? 'escolhida' : 'escolhido'}
                {escolhidos.size === 1 ? '' : 's'})
              </span>
            )}
          </p>
          <button
            type="button"
            disabled={!podeTodas}
            title={
              aFiltrar
                ? `Escolher ${genero === 'f' ? 'as' : 'os'} ${nVisiveisAtivas} que aparecem`
                : `Escolher ${genero === 'f' ? 'todas' : 'todos'}`
            }
            onClick={() => aoMudar(escolherTodas(escolhidos, visiveis))}
            className={BOTAO_PAINEL}
          >
            {genero === 'f' ? 'Todas' : 'Todos'}
          </button>
          <button
            type="button"
            disabled={!ativo}
            title="Tirar todas as escolhas (sem filtro)"
            onClick={() => aoMudar(new Set())}
            className={BOTAO_PAINEL}
          >
            Limpar
          </button>
          <button type="button" aria-label="Fechar" title="Fechar" onClick={fechar} className={BOTAO_PAINEL}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {comPesquisa && (
          <div className="shrink-0 border-b border-slate-200 p-1.5">
            <label htmlFor={idCampo} className="sr-only">
              Procurar na lista de {rotulo.toLowerCase()}
            </label>
            <input
              ref={campo}
              id={idCampo}
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Procurar…"
              autoComplete="off"
              spellCheck={false}
              className={`h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-base text-slate-800 sm:text-sm focus-visible:border-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700 pointer-coarse:h-10`}
            />
          </div>
        )}

        {/* Os fieldset têm min-w-0: por omissão crescem até ao conteúdo e os nomes compridos não cortavam. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
          <fieldset className="min-w-0">
            <legend className="sr-only">{nomeGrupo}</legend>
            {visiveis.length === 0 && <p className="px-2 py-2 text-slate-600 italic">Nada encontrado.</p>}
            {secoes.map((s, i) => (
              <Secao
                key={s.grupo ?? ''}
                secao={s}
                separada={i > 0}
                escolhidos={escolhidos}
                aoAlternar={(valor) => aoMudar(alternarEscolha(escolhidos, valor))}
              />
            ))}
          </fieldset>
        </div>
      </div>
    </div>
  );
}

/**
 * Uma secção da lista. Com título é um fieldset (o leitor de ecrã diz o grupo); a legenda flutua para
 * ficar por baixo da linha de separação e não em cima dela.
 */
function Secao({
  secao,
  separada,
  escolhidos,
  aoAlternar,
}: {
  secao: SecaoFiltro<OpcaoFiltroMultiplo>;
  separada: boolean;
  escolhidos: ReadonlySet<string>;
  aoAlternar: (valor: string) => void;
}) {
  const separador = separada ? 'mt-1 border-t border-slate-200 pt-1' : '';
  const lista = (
    <ul className="clear-both flex flex-col gap-px">
      {secao.opcoes.map((o) => (
        <LinhaOpcao
          key={o.valor}
          opcao={o}
          escolhida={escolhidos.has(o.valor)}
          aoAlternar={() => aoAlternar(o.valor)}
        />
      ))}
    </ul>
  );
  if (!secao.titulo) return <div className={separador}>{lista}</div>;
  return (
    <fieldset className={`min-w-0 ${separador}`}>
      <legend className="float-left w-full truncate px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">
        {secao.titulo}
      </legend>
      {lista}
    </fieldset>
  );
}

function LinhaOpcao({
  opcao,
  escolhida,
  aoAlternar,
}: {
  opcao: OpcaoFiltroMultiplo;
  escolhida: boolean;
  aoAlternar: () => void;
}) {
  const { rotulo, detalhe, contagem, desativada, marca } = opcao;
  return (
    <li>
      <label
        title={detalhe ? `${rotulo} · ${detalhe}` : rotulo}
        className={`flex min-h-8 items-center gap-2 rounded px-2 py-1 pointer-coarse:min-h-11 ${
          desativada
            ? 'cursor-not-allowed text-slate-500'
            : `cursor-pointer hover:bg-slate-100 ${escolhida ? 'bg-slate-50 font-semibold' : ''}`
        } has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-700`}
      >
        <input
          type="checkbox"
          checked={escolhida}
          disabled={desativada}
          onChange={aoAlternar}
          className="size-4 shrink-0 accent-slate-800 outline-none pointer-coarse:size-5"
        />
        {marca && <span className="flex shrink-0 items-center">{marca}</span>}
        <span className="min-w-0 flex-1 truncate">
          {rotulo}
          {detalhe && <span className="ml-1.5 font-normal text-slate-500">{detalhe}</span>}
        </span>
        {contagem !== undefined && (
          <span
            className={`shrink-0 font-normal tabular-nums ${contagem === 0 ? 'text-slate-400' : 'text-slate-600'}`}
          >
            {contagem}
          </span>
        )}
      </label>
    </li>
  );
}

/** As caixas que se podem escolher, pela ordem do ecrã. */
function caixasDe(painel: HTMLElement): HTMLInputElement[] {
  return [...painel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)')];
}
