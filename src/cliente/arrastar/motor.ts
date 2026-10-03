// Motor de arrastar: liga a máquina de estados (maquina.ts) aos eventos do browser.
// Genérico: serve a lista lateral e o mapa. Arrastáveis: [data-arrastavel-pessoa="<id>"] (o NomeChip
// só o põe no modo de edição). Alvos: [data-alvo="<chaveAlvo>"], resolvidos a cada movimento pelo
// elemento debaixo do ponteiro. Largar num alvo = loja.moverPara (um passo do rascunho).
// Os ouvintes ficam no document (fase de captura: o Leaflet para a propagação de alguns eventos).

import { clienteEfetivoId, corTexto } from '../../dominio/cores';
import type { Id } from '../../dominio/tipos';
import { useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { type AlvoEncontrado, ATRIBUTO_ESTADO_ALVO, encontrarAlvo, pessoaArrastavel } from './alvo';
import { podeDeslizar, velocidadeBorda } from './deslizar';
import { criarFantasma, type Fantasma } from './fantasma';
import {
  type EstadoArrasto,
  type EventoArrasto,
  INATIVO,
  type Ponteiro,
  TOQUE_LONGO_MS,
  transitar,
} from './maquina';
import { emitirFim, emitirInicio, emitirMovimento } from './ouvintes';
import {
  descricaoArrastados,
  partesArrastados,
  partesPrevisao,
  pessoasQueMudam,
  preverLargada,
  textoCondutoresQueSaem,
  textoLargado,
} from './previsao';
import { idsAArrastar } from './selecao';

/** Depois de um arrasto, o clique que o browser ainda gera não conta (não mexe na seleção). */
const IGNORAR_CLIQUE_MS = 400;
/** Folga no temporizador do toque longo (os temporizadores nunca são exatos). */
const FOLGA_TEMPORIZADOR_MS = 10;
const CLASSE_ATIVO = 'arrastar-ativo';
const ROLAVEL = /(auto|scroll|overlay)/;

/** Instala o motor no document. Devolve a função que o desinstala (cancelando um arrasto a meio). */
export function instalarMotorArrastar(): () => void {
  let estado: EstadoArrasto = INATIVO;
  /** Pessoas que vão no arrasto (a agarrada primeiro). */
  let ids: Id[] = [];
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let quadro: number | null = null;
  let fantasma: Fantasma | null = null;
  let estiloArrastados: HTMLStyleElement | null = null;
  let alvoAtual: AlvoEncontrado<Element> | null = null;
  let ponteiroCapturado: number | null = null;
  let ignorarCliqueAte = 0;

  const anuncio = document.createElement('div');
  anuncio.className = 'arrasto-anuncio';
  anuncio.setAttribute('role', 'status');
  document.body.append(anuncio);
  const anunciar = (texto: string) => {
    anuncio.textContent = texto;
  };

  function limparTemporizador(): void {
    if (temporizador !== null) clearTimeout(temporizador);
    temporizador = null;
  }

  function despachar(evento: EventoArrasto): void {
    const { estado: novo, efeito } = transitar(estado, evento);
    estado = novo;
    if (novo.fase !== 'pendente') limparTemporizador();
    if (efeito === 'comecar') comecar();
    else if (efeito === 'mover') mover();
    else if (efeito === 'largar' && evento.tipo === 'levantar') largar(evento.x, evento.y);
    else if (efeito === 'cancelar') {
      terminar();
      anunciar('Arrasto cancelado: nada mudou.');
    }
  }

  function comecar(): void {
    if (estado.fase !== 'aArrastar') return;
    const loja = useLoja.getState();
    const pessoa = loja.indices?.pessoas.get(estado.pessoaId);
    if (!loja.modoEdicao || !loja.indices || !pessoa) {
      estado = INATIVO;
      return;
    }
    if (loja.selecao.has(pessoa.id)) ids = idsAArrastar(pessoa.id, loja.selecao);
    else {
      loja.selecionar(pessoa.id, 'substituir');
      ids = [pessoa.id];
    }

    const cor = loja.indices.clientes.get(clienteEfetivoId(pessoa, loja.indices.obras))?.cor ?? '#ffffff';
    fantasma = criarFantasma({
      ...partesArrastados(pessoa.nomeCurto, ids.length),
      corFundo: cor,
      corTexto: corTexto(cor),
      ponteiro: estado.ponteiro,
    });

    // Os nomes que vão no arrasto ficam meio transparentes, onde quer que apareçam (lista e mapa),
    // mesmo que o React os volte a desenhar a meio.
    estiloArrastados = document.createElement('style');
    estiloArrastados.textContent = `${ids
      .map((id) => `[data-arrastavel-pessoa="${CSS.escape(id)}"]`)
      .join(',')}{opacity:.35}`;
    document.head.append(estiloArrastados);
    document.documentElement.classList.add(CLASSE_ATIVO);

    // Rato largado fora da janela também chega cá; no toque, os movimentos deixam de ir para o nome.
    try {
      document.documentElement.setPointerCapture(estado.pointerId);
      ponteiroCapturado = estado.pointerId;
    } catch {
      ponteiroCapturado = null;
    }
    if (estado.ponteiro === 'toque') navigator.vibrate?.(15);
    anunciar(
      `A arrastar ${descricaoArrastados(pessoa.nomeCurto, ids.length)}. Largue numa casa, carrinha ou obra; Esc cancela.`,
    );
    emitirInicio();
    mover();
    quadro = requestAnimationFrame(passo);
  }

  function mover(): void {
    if (estado.fase !== 'aArrastar') return;
    fantasma?.posicionar(estado.x, estado.y);
    atualizarAlvo(estado.x, estado.y);
    emitirMovimento(estado.x, estado.y);
  }

  /** A cada quadro: desliza os contentores perto da borda e revê o alvo (o que está por baixo muda). */
  function passo(): void {
    quadro = null;
    if (estado.fase !== 'aArrastar') return;
    deslizar(estado.x, estado.y);
    atualizarAlvo(estado.x, estado.y);
    quadro = requestAnimationFrame(passo);
  }

  function atualizarAlvo(x: number, y: number): void {
    const encontrado = encontrarAlvo(document.elementFromPoint(x, y));
    if (encontrado?.elemento !== alvoAtual?.elemento) {
      alvoAtual?.elemento.removeAttribute(ATRIBUTO_ESTADO_ALVO);
      encontrado?.elemento.setAttribute(ATRIBUTO_ESTADO_ALVO, 'por-cima');
    }
    const mudouAlvo = encontrado?.chave !== alvoAtual?.chave;
    alvoAtual = encontrado;
    if (mudouAlvo && fantasma) {
      const { estado: visivel, indices } = useLoja.getState();
      const previsao =
        encontrado && visivel && indices ? preverLargada(visivel, indices, ids, encontrado.alvo) : null;
      fantasma.definirPrevisao(previsao ? partesPrevisao(previsao) : null, previsao?.nivel ?? null);
    }
  }

  function largar(x: number, y: number): void {
    atualizarAlvo(x, y);
    const alvo = alvoAtual?.alvo ?? null;
    const levados = ids;
    const { estado: visivel, indices, moverPara } = useLoja.getState();
    // Só se larga num alvo que existe no estado (a previsão confirma-o).
    const previsao = alvo && visivel && indices ? preverLargada(visivel, indices, levados, alvo) : null;
    terminar();
    if (!alvo || !visivel || !previsao) {
      anunciar('Largado fora de uma casa, carrinha ou obra: nada mudou.');
      return;
    }
    // Contam-se pessoas (moverPara conta operações: quem sai da carrinha que conduz traz a do condutor).
    const pessoas = pessoasQueMudam(visivel, levados, alvo).length;
    const condutores = textoCondutoresQueSaem(visivel, levados, alvo);
    moverPara(levados, alvo);
    anunciar(
      [textoLargado(pessoas, previsao.rotulo, previsao.arrastadas), condutores].filter(Boolean).join(' '),
    );
    // Perder o condutor não se vê bem no sítio de onde se arrastou: fica também um aviso à vista.
    if (pessoas > 0 && condutores) useUiEdicao.getState().avisar(`${condutores} Ctrl+Z desfaz.`);
  }

  /** Arruma tudo o que o arrasto pôs no ecrã. */
  function terminar(): void {
    limparTemporizador();
    if (quadro !== null) cancelAnimationFrame(quadro);
    quadro = null;
    fantasma?.remover();
    fantasma = null;
    estiloArrastados?.remove();
    estiloArrastados = null;
    alvoAtual?.elemento.removeAttribute(ATRIBUTO_ESTADO_ALVO);
    alvoAtual = null;
    const raiz = document.documentElement;
    raiz.classList.remove(CLASSE_ATIVO);
    if (ponteiroCapturado !== null && raiz.hasPointerCapture(ponteiroCapturado)) {
      raiz.releasePointerCapture(ponteiroCapturado);
    }
    ponteiroCapturado = null;
    ids = [];
    ignorarCliqueAte = performance.now() + IGNORAR_CLIQUE_MS;
    emitirFim();
  }

  /** Desliza o contentor com scroll mais próximo (ex.: a lista lateral) ou a página, perto da borda. */
  function deslizar(x: number, y: number): void {
    const raiz = document.documentElement;
    for (
      let el = document.elementFromPoint(x, y);
      el && el !== document.body && el !== raiz;
      el = el.parentElement
    ) {
      if (!(el instanceof HTMLElement)) continue;
      const css = getComputedStyle(el);
      const rolaY = ROLAVEL.test(css.overflowY);
      const rolaX = ROLAVEL.test(css.overflowX);
      if (!rolaY && !rolaX) continue;
      const r = el.getBoundingClientRect();
      const vy = rolaY ? velocidadeBorda(y, r.top, r.bottom) : 0;
      const vx = rolaX ? velocidadeBorda(x, r.left, r.right) : 0;
      const dy = podeDeslizar(el.scrollTop, el.clientHeight, el.scrollHeight, vy) ? vy : 0;
      const dx = podeDeslizar(el.scrollLeft, el.clientWidth, el.scrollWidth, vx) ? vx : 0;
      if (dx !== 0 || dy !== 0) {
        el.scrollBy(dx, dy);
        return;
      }
    }
    // A própria página (no telemóvel a lista fica por baixo do mapa).
    const pagina = document.scrollingElement;
    if (!pagina) return;
    const vy = velocidadeBorda(y, 0, window.innerHeight);
    if (podeDeslizar(pagina.scrollTop, window.innerHeight, pagina.scrollHeight, vy)) window.scrollBy(0, vy);
  }

  // --- Eventos do browser -----------------------------------------------------------------------

  const aoBaixar = (e: PointerEvent) => {
    if (estado.fase !== 'inativo') {
      // Um segundo dedo (ex.: para fazer zoom) cancela.
      if (e.pointerId !== estado.pointerId) despachar({ tipo: 'baixarOutro', pointerId: e.pointerId });
      return;
    }
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!useLoja.getState().modoEdicao) return;
    const pessoaId = pessoaArrastavel(e.target instanceof Element ? e.target : null);
    if (!pessoaId) return;
    const ponteiro: Ponteiro = e.pointerType === 'touch' ? 'toque' : 'rato';
    // Rato: sem os mousedown de compatibilidade, o Leaflet não desloca o mapa. A propagação continua:
    // o React precisa do clique para a seleção. No toque não: um toque normal desloca o mapa/a lista.
    if (ponteiro === 'rato') e.preventDefault();
    despachar({
      tipo: 'baixar',
      ponteiro,
      pointerId: e.pointerId,
      pessoaId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
    });
    if (ponteiro === 'toque') {
      temporizador = setTimeout(
        () => despachar({ tipo: 'tempo', t: performance.now() }),
        TOQUE_LONGO_MS + FOLGA_TEMPORIZADOR_MS,
      );
    }
  };

  const aoMover = (e: PointerEvent) => {
    if (estado.fase === 'inativo' || e.pointerId !== estado.pointerId) return;
    despachar({ tipo: 'mover', pointerId: e.pointerId, x: e.clientX, y: e.clientY });
  };

  const aoLevantar = (e: PointerEvent) => {
    if (estado.fase === 'inativo') return;
    despachar({ tipo: 'levantar', pointerId: e.pointerId, x: e.clientX, y: e.clientY });
  };

  const cancelar = () => {
    if (estado.fase !== 'inativo') despachar({ tipo: 'cancelar' });
  };

  const aoCancelarPonteiro = (e: PointerEvent) => {
    if (estado.fase !== 'inativo' && e.pointerId === estado.pointerId) cancelar();
  };

  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || estado.fase === 'inativo') return;
    const aArrastar = estado.fase === 'aArrastar';
    cancelar();
    // O Esc foi para o arrasto: não fecha também o painel de foco nem limpa a pesquisa.
    if (aArrastar) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  const aoMudarVisibilidade = () => {
    if (document.hidden) cancelar();
  };

  // Depois de levantar o nome com o dedo, o dedo arrasta o nome e não a página.
  const aoMoverDedo = (e: TouchEvent) => {
    if (estado.fase === 'aArrastar' && e.cancelable) e.preventDefault();
  };

  // Sem menu de contexto no toque longo.
  const aoMenuContexto = (e: MouseEvent) => {
    if (estado.fase !== 'inativo' && estado.ponteiro === 'toque') e.preventDefault();
  };

  // Sem seleção de texto nem o arrastar nativo do browser enquanto se carrega num nome.
  const aoComecarNativo = (e: Event) => {
    if (estado.fase !== 'inativo') e.preventDefault();
  };

  const aoClicar = (e: MouseEvent) => {
    if (performance.now() > ignorarCliqueAte) return;
    ignorarCliqueAte = 0;
    e.preventDefault();
    e.stopPropagation();
  };

  // Sair do modo de edição a meio (ex.: Cancelar) cancela o arrasto.
  const desligarLoja = useLoja.subscribe((s) => {
    if (!s.modoEdicao) cancelar();
  });

  const captura = { capture: true } as const;
  document.addEventListener('pointerdown', aoBaixar, captura);
  document.addEventListener('pointermove', aoMover, { capture: true, passive: true });
  document.addEventListener('pointerup', aoLevantar, captura);
  document.addEventListener('pointercancel', aoCancelarPonteiro, captura);
  document.addEventListener('touchmove', aoMoverDedo, { capture: true, passive: false });
  document.addEventListener('contextmenu', aoMenuContexto, captura);
  document.addEventListener('selectstart', aoComecarNativo, captura);
  document.addEventListener('dragstart', aoComecarNativo, captura);
  document.addEventListener('visibilitychange', aoMudarVisibilidade);
  window.addEventListener('click', aoClicar, captura);
  window.addEventListener('keydown', aoTeclar, captura);
  window.addEventListener('blur', cancelar);

  return () => {
    cancelar();
    desligarLoja();
    document.removeEventListener('pointerdown', aoBaixar, captura);
    document.removeEventListener('pointermove', aoMover, captura);
    document.removeEventListener('pointerup', aoLevantar, captura);
    document.removeEventListener('pointercancel', aoCancelarPonteiro, captura);
    document.removeEventListener('touchmove', aoMoverDedo, captura);
    document.removeEventListener('contextmenu', aoMenuContexto, captura);
    document.removeEventListener('selectstart', aoComecarNativo, captura);
    document.removeEventListener('dragstart', aoComecarNativo, captura);
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    window.removeEventListener('click', aoClicar, captura);
    window.removeEventListener('keydown', aoTeclar, captura);
    window.removeEventListener('blur', cancelar);
    anuncio.remove();
  };
}
