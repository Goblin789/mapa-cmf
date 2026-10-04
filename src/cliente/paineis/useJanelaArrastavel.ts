// Ganchos da ficha arrastável (PainelFoco no PC; as contas estão em janelaArrastavel.ts).
// - usePosicaoJanela (no PainelFoco): a posição lembrada de cada vista ('mapa', 'tabela', 'quadro'), que
//   sobrevive a mudar de pessoa/casa/carrinha (cada ficha é um componente novo) e a recarregar a página.
// - useJanelaArrastavel (na Moldura da ficha): mede a ficha e a área onde está posta, diz onde a desenhar
//   e trata o arrastar pelo cabeçalho, as setas do teclado e o voltar à origem.
// - No mapa, a ficha mudada de sítio continua a acabar por cima da legenda (Evitar; ver colocar()).
// O arrastar é só da ficha: começa no cabeçalho (fora dos botões e dos textos [data-texto-ficha], que se
// selecionam e copiam; a pega arrasta), prende o ponteiro ao cabeçalho (setPointerCapture) e não deixa
// o evento seguir. O motor de arrastar pessoas só pega em
// [data-arrastavel-pessoa], e a caixa de seleção do Quadro e do mapa e o Leaflet escutam no seu
// contentor, de que a ficha não faz parte; com o ponteiro preso, os movimentos também não lhes chegam.

import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ancorar,
  type Canto,
  cantoArrastado,
  cantoComTecla,
  cantoDaPosicao,
  carregarPosicao,
  colocar,
  guardarPosicao,
  type LugarJanela,
  MARGEM_JANELA_PX,
  type PosicaoJanela,
  passouLimiar,
  type Retangulo,
  type Tamanho,
} from './janelaArrastavel';

/** A posição de um lugar (null = na origem) e quem a muda. `ativa` = pode arrastar-se (no PC). */
export interface PosicaoLugar {
  ativa: boolean;
  posicao: PosicaoJanela | null;
  definir: (posicao: PosicaoJanela | null) => void;
}

export function usePosicaoJanela(lugar: LugarJanela, ativa: boolean): PosicaoLugar {
  const [lembrada, setLembrada] = useState(() => ({ lugar, posicao: carregarPosicao(lugar) }));
  // A mesma ficha noutra vista (não acontece hoje: cada vista monta a sua): lê a posição dessa vista.
  let atual = lembrada;
  if (lembrada.lugar !== lugar) {
    atual = { lugar, posicao: carregarPosicao(lugar) };
    setLembrada(atual);
  }
  const posicao = atual.posicao;
  const definir = useCallback(
    (p: PosicaoJanela | null) => {
      setLembrada({ lugar, posicao: p });
      guardarPosicao(lugar, p);
    },
    [lugar],
  );
  return useMemo(() => ({ ativa, posicao: ativa ? posicao : null, definir }), [ativa, posicao, definir]);
}

/** Atributo da pega (o botão do cabeçalho que também arrasta e anda com as setas). */
export const ATRIBUTO_PEGA = 'data-pega';

/** Atributo dos textos do cabeçalho que se podem selecionar e copiar (título, morada): não arrastam. */
export const ATRIBUTO_TEXTO = 'data-texto-ficha';

/** Dentro do cabeçalho, onde carregar não arrasta (botões, ligações, textos). A pega arrasta. */
const NAO_ARRASTA = `button:not([${ATRIBUTO_PEGA}]), a, input, select, textarea, label, [${ATRIBUTO_TEXTO}]`;

/**
 * O que a ficha deve evitar tapar dentro da área (ex.: a legenda do mapa): o seletor (procura-se dentro da
 * área) e um número que muda quando ele muda de tamanho, aparece ou desaparece (para voltar a medir).
 */
export interface Evitar {
  seletor: string;
  versao: number;
}

interface Medidas {
  area: Tamanho;
  /** A largura da ficha e a altura que teria com o conteúdo todo à vista. */
  janela: Tamanho;
  /** O que a ficha deve evitar tapar, dentro da área (null = nada). */
  evitar: Retangulo | null;
}

function mesmoRetangulo(a: Retangulo | null, b: Retangulo | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y && a.largura === b.largura && a.altura === b.altura;
}

function mesmasMedidas(a: Medidas | null, b: Medidas): boolean {
  return (
    a !== null &&
    a.area.largura === b.area.largura &&
    a.area.altura === b.area.altura &&
    a.janela.largura === b.janela.largura &&
    a.janela.altura === b.janela.altura &&
    mesmoRetangulo(a.evitar, b.evitar)
  );
}

/** O retângulo de `el` dentro da área (a contar do canto de dentro da área, como o left/top da ficha). */
function retanguloNaArea(el: Element, area: HTMLElement): Retangulo | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const a = area.getBoundingClientRect();
  return {
    x: Math.round(r.left - a.left - area.clientLeft),
    y: Math.round(r.top - a.top - area.clientTop),
    largura: Math.round(r.width),
    altura: Math.round(r.height),
  };
}

interface Arrasto {
  ponteiro: number;
  inicio: Canto;
  canto: Canto;
  comecou: boolean;
}

export interface JanelaArrastavel {
  /** Pode arrastar-se (no PC). */
  ativa: boolean;
  /** Não está na posição de origem. */
  movida: boolean;
  /** A meio de um arrasto. */
  arrastando: boolean;
  /** Para a <section> da ficha. */
  refJanela: (el: HTMLElement | null) => void;
  /** Para o invólucro do conteúdo, dentro da parte que desliza (para medir a altura toda). */
  refConteudo: (el: HTMLElement | null) => void;
  /** Posição e altura máxima; undefined = na origem (mandam as classes do lugar). */
  estilo: CSSProperties | undefined;
  /** Para o <header> da ficha (por onde se pega). */
  pega: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
    onLostPointerCapture: (e: PointerEvent<HTMLElement>) => void;
    onDoubleClick: (e: MouseEvent<HTMLElement>) => void;
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  } | null;
  /** Volta à posição de origem (e esquece a lembrada). */
  repor: () => void;
}

/** Sem medidas ainda (1.º desenho): a posição guardada tal como está, com CSS. */
function estiloSemMedidas(p: PosicaoJanela): CSSProperties {
  return {
    left: p.borda === 'esquerda' ? p.distancia : 'auto',
    right: p.borda === 'direita' ? p.distancia : 'auto',
    top: p.topo,
    bottom: 'auto',
    maxHeight: `calc(100% - ${p.topo + MARGEM_JANELA_PX}px)`,
  };
}

export function useJanelaArrastavel(lugar: PosicaoLugar | null, evitar?: Evitar): JanelaArrastavel {
  const [janela, setJanela] = useState<HTMLElement | null>(null);
  const [conteudo, setConteudo] = useState<HTMLElement | null>(null);
  const [medidas, setMedidas] = useState<Medidas | null>(null);
  /** O canto que o ponteiro pede, a meio de um arrasto. */
  const [arrastado, setArrastado] = useState<Canto | null>(null);
  const arrasto = useRef<Arrasto | null>(null);
  const ativa = lugar?.ativa ?? false;
  const posicao = lugar?.posicao ?? null;
  const definir = lugar?.definir;
  const seletorEvitar = evitar?.seletor;
  const versaoEvitar = evitar?.versao;

  // Mede a ficha e a área (o antepassado posicionado: o <main> do mapa, o invólucro da vista) sempre que
  // uma delas ou o conteúdo muda de tamanho (inclui redimensionar a janela do browser).
  // biome-ignore lint/correctness/useExhaustiveDependencies: versaoEvitar só serve para voltar a medir.
  useLayoutEffect(() => {
    if (!ativa || !janela) return;
    const procurarEvitar = () => {
      const area = janela.offsetParent;
      return seletorEvitar && area ? area.querySelector(seletorEvitar) : null;
    };
    const medir = () => {
      const area = janela.offsetParent;
      if (!(area instanceof HTMLElement)) return;
      const corpo = conteudo?.parentElement;
      const alturaToda = corpo
        ? janela.offsetHeight - corpo.clientHeight + corpo.scrollHeight
        : janela.offsetHeight;
      const aEvitar = procurarEvitar();
      const novas: Medidas = {
        area: { largura: area.clientWidth, altura: area.clientHeight },
        janela: { largura: janela.offsetWidth, altura: alturaToda },
        evitar: aEvitar ? retanguloNaArea(aEvitar, area) : null,
      };
      setMedidas((antes) => (mesmasMedidas(antes, novas) ? antes : novas));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(janela);
    if (conteudo) observador.observe(conteudo);
    if (janela.offsetParent) observador.observe(janela.offsetParent);
    const aEvitar = procurarEvitar();
    if (aEvitar) observador.observe(aEvitar);
    return () => observador.disconnect();
  }, [ativa, janela, conteudo, seletorEvitar, versaoEvitar]);

  const colocacao = useMemo(() => {
    if (!ativa || !medidas) return null;
    const desejado =
      arrastado ?? (posicao ? cantoDaPosicao(posicao, medidas.janela.largura, medidas.area) : null);
    return desejado ? colocar(desejado, medidas.janela, medidas.area, medidas.evitar) : null;
  }, [ativa, medidas, arrastado, posicao]);

  const estilo = useMemo<CSSProperties | undefined>(() => {
    if (colocacao) {
      return {
        left: colocacao.x,
        top: colocacao.y,
        right: 'auto',
        bottom: 'auto',
        maxHeight: colocacao.alturaMaxima,
      };
    }
    return ativa && posicao ? estiloSemMedidas(posicao) : undefined;
  }, [colocacao, ativa, posicao]);

  /** Grava o canto (já posto dentro da área) como a posição deste lugar. */
  const fixar = useCallback(
    (desejado: Canto) => {
      if (!medidas || !definir) return;
      const c = colocar(desejado, medidas.janela, medidas.area, medidas.evitar);
      definir(ancorar(c, medidas.janela.largura, medidas.area));
    },
    [medidas, definir],
  );

  const cancelar = useCallback(() => {
    arrasto.current = null;
    setArrastado(null);
  }, []);

  const repor = useCallback(() => {
    cancelar();
    definir?.(null);
  }, [cancelar, definir]);

  // A meio de um arrasto, o Esc cancela-o (e não fecha a ficha).
  const aArrastar = arrastado !== null;
  useEffect(() => {
    if (!aArrastar) return;
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      cancelar();
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [aArrastar, cancelar]);

  const pega = useMemo<JanelaArrastavel['pega']>(() => {
    if (!ativa) return null;
    const terminar = (e: PointerEvent<HTMLElement>, gravar: boolean) => {
      const a = arrasto.current;
      if (!a || e.pointerId !== a.ponteiro) return;
      arrasto.current = null;
      if (gravar && a.comecou) fixar(cantoArrastado(a.canto, a.inicio, { x: e.clientX, y: e.clientY }));
      setArrastado(null);
    };
    return {
      onPointerDown: (e) => {
        if (!janela || arrasto.current || !e.isPrimary || e.button !== 0) return;
        if (e.target instanceof Element && e.target.closest(NAO_ARRASTA)) return;
        // Sem seleção de texto nem foco; e nada mais (mapa, caixa de seleção) fica com este ponteiro.
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        arrasto.current = {
          ponteiro: e.pointerId,
          inicio: { x: e.clientX, y: e.clientY },
          canto: { x: janela.offsetLeft, y: janela.offsetTop },
          comecou: false,
        };
      },
      onPointerMove: (e) => {
        const a = arrasto.current;
        if (!a || e.pointerId !== a.ponteiro) return;
        const agora = { x: e.clientX, y: e.clientY };
        if (!a.comecou && !passouLimiar(a.inicio, agora)) return;
        a.comecou = true;
        e.stopPropagation();
        setArrastado(cantoArrastado(a.canto, a.inicio, agora));
      },
      onPointerUp: (e) => terminar(e, true),
      onPointerCancel: (e) => terminar(e, false),
      // (Depois do pointerup o arrasto já acabou: aqui só apanha um ponteiro perdido a meio.)
      onLostPointerCapture: (e) => terminar(e, false),
      onDoubleClick: (e) => {
        if (e.target instanceof Element && e.target.closest(NAO_ARRASTA)) return;
        repor();
      },
      onKeyDown: (e) => {
        if (!janela) return;
        const naPega = e.target instanceof Element && e.target.closest(`[${ATRIBUTO_PEGA}]`) !== null;
        if (naPega && e.key === 'Home') {
          e.preventDefault();
          repor();
          return;
        }
        // Na pega, as setas; em qualquer sítio do cabeçalho, Alt+setas (Alt+← não volta à página anterior).
        if (!naPega && !e.altKey) return;
        const canto = cantoComTecla({ x: janela.offsetLeft, y: janela.offsetTop }, e.key, e.shiftKey);
        if (!canto) return;
        e.preventDefault();
        e.stopPropagation();
        fixar(canto);
      },
    };
  }, [ativa, janela, fixar, repor]);

  return {
    ativa,
    movida: ativa && posicao !== null,
    arrastando: aArrastar,
    refJanela: setJanela,
    refConteudo: setConteudo,
    estilo,
    pega,
    repor,
  };
}
