// Vista Quadro no modo de edição: Shift+arrastar no fundo do Quadro (ou de um bloco, fora dos nomes e dos
// botões) desenha uma caixa e seleciona os nomes que ela toca — como no mapa (mapa/interacoesEdicao.ts),
// com as mesmas contas (mapa/caixaSelecao.ts). Fora do modo de edição e na reunião não faz nada.

import { type RefObject, useEffect } from 'react';
import { useLoja } from '../estado/loja';
import { eCaixa, idsNaCaixa, retanguloEntre } from '../mapa/caixaSelecao';

/** Onde premir NÃO começa uma caixa: os nomes (arrastam-se) e os controlos. */
const NAO_COMECA = '[data-pessoa-id], button, a, select, input, textarea, label';

/**
 * @param raiz onde se procuram os nomes ([data-pessoa-id]): o Quadro, nunca o documento (o mapa escondido
 *   também os tem);
 * @param contentor a caixa que desliza (onde se prime);
 * @param caixa a caixa desenhada: absoluta, dentro de um invólucro `relative` (as coordenadas são dele);
 * @param ativo modo de edição, fora da reunião. Ao passar a falso, uma caixa a meio é cancelada.
 * @param aoDesenhar avisa quando a caixa começa (true) e acaba (false): o Quadro deixa ver através da
 *   ficha enquanto isso (a caixa pode passar por baixo dela). Tem de ser estável (useCallback).
 */
export function useCaixaSelecaoQuadro(
  raiz: RefObject<HTMLElement | null>,
  contentor: RefObject<HTMLElement | null>,
  caixa: RefObject<HTMLDivElement | null>,
  ativo: boolean,
  aoDesenhar?: (aDesenhar: boolean) => void,
): void {
  useEffect(() => {
    const cont = contentor.current;
    if (!ativo || !cont) return;
    /** Canto onde se premiu (coordenadas do ecrã) e o deslize do contentor nesse momento. */
    let inicio: { x: number; y: number; scrollTop: number; scrollLeft: number } | null = null;
    let ponteiroId = -1;
    let ignorarClique = false;
    let ultimo: { x: number; y: number } | null = null;

    /** O canto inicial, acompanhando o que o Quadro deslizou desde então (roda do rato a meio). */
    const cantoInicial = () =>
      inicio
        ? {
            x: inicio.x - (cont.scrollLeft - inicio.scrollLeft),
            y: inicio.y - (cont.scrollTop - inicio.scrollTop),
          }
        : null;

    const desenhar = () => {
      const el = caixa.current;
      if (!el) return;
      const a = cantoInicial();
      if (!a || !ultimo) {
        el.style.display = 'none';
        return;
      }
      const base = (el.parentElement ?? cont).getBoundingClientRect();
      const r = retanguloEntre(a, ultimo);
      el.style.display = 'block';
      el.style.left = `${r.x - base.left}px`;
      el.style.top = `${r.y - base.top}px`;
      el.style.width = `${r.largura}px`;
      el.style.height = `${r.altura}px`;
    };

    const retirarOuvintes = () => {
      window.removeEventListener('pointermove', aoMover, true);
      window.removeEventListener('pointerup', aoLargar, true);
      window.removeEventListener('pointercancel', aoCancelar, true);
      cont.removeEventListener('scroll', desenhar);
    };

    const aoMover = (e: PointerEvent) => {
      if (e.pointerId !== ponteiroId) return;
      ultimo = { x: e.clientX, y: e.clientY };
      desenhar();
    };

    const terminar = (e: PointerEvent | null, selecionar: boolean) => {
      if ((e && e.pointerId !== ponteiroId) || !inicio) return;
      aoDesenhar?.(false);
      const a = cantoInicial();
      const fim = e ? { x: e.clientX, y: e.clientY } : ultimo;
      inicio = null;
      ultimo = null;
      ponteiroId = -1;
      desenhar();
      retirarOuvintes();
      if (!selecionar || !a || !fim) return;
      const r = retanguloEntre(a, fim);
      if (!eCaixa(r)) return;
      ignorarClique = true;
      const nomes = raiz.current?.querySelectorAll<HTMLElement>('[data-pessoa-id]') ?? [];
      const elementos = [...nomes].map((el) => {
        const b = el.getBoundingClientRect();
        return {
          id: el.dataset.pessoaId as string,
          retangulo: { x: b.left, y: b.top, largura: b.width, altura: b.height },
        };
      });
      useLoja.getState().definirSelecao(idsNaCaixa(r, elementos));
    };
    const aoLargar = (e: PointerEvent) => terminar(e, true);
    const aoCancelar = (e: PointerEvent) => terminar(e, false);

    const aoPremir = (e: PointerEvent) => {
      ignorarClique = false;
      if (!e.shiftKey || e.button !== 0 || e.pointerType !== 'mouse' || inicio) return;
      if (!useLoja.getState().modoEdicao) return;
      const alvo = e.target as Element | null;
      if (alvo?.closest?.(NAO_COMECA)) return;
      // Sem seleção de texto (Shift+arrastar selecionava os nomes como texto).
      e.preventDefault();
      inicio = { x: e.clientX, y: e.clientY, scrollTop: cont.scrollTop, scrollLeft: cont.scrollLeft };
      ultimo = { x: e.clientX, y: e.clientY };
      ponteiroId = e.pointerId;
      aoDesenhar?.(true);
      desenhar();
      window.addEventListener('pointermove', aoMover, true);
      window.addEventListener('pointerup', aoLargar, true);
      window.addEventListener('pointercancel', aoCancelar, true);
      cont.addEventListener('scroll', desenhar, { passive: true });
    };

    // O clique que fecha a caixa não é um clique no Quadro.
    const aoClicar = (e: MouseEvent) => {
      if (!ignorarClique) return;
      ignorarClique = false;
      e.stopPropagation();
      e.preventDefault();
    };

    cont.addEventListener('pointerdown', aoPremir, true);
    cont.addEventListener('click', aoClicar, true);
    return () => {
      // Sair do modo de edição (ou desmontar) a meio: a caixa desaparece sem selecionar.
      terminar(null, false);
      cont.removeEventListener('pointerdown', aoPremir, true);
      cont.removeEventListener('click', aoClicar, true);
      retirarOuvintes();
    };
  }, [raiz, contentor, caixa, ativo, aoDesenhar]);
}
