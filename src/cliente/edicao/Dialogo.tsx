// Diálogo modal acessível com o elemento nativo <dialog> (showModal): o resto da página fica inerte,
// por isso o foco não sai do diálogo; o título dá-lhe o nome; Esc fecha; ao fechar, o foco volta a
// quem o abriu. Monta-se só enquanto está aberto: `{aberto && <Dialogo …>}`.

import { type ReactNode, type RefObject, useId, useLayoutEffect, useRef, useState } from 'react';
import { FOCO_VISIVEL } from '../paineis/classes';
import { IconeFechar } from '../paineis/pecas';

const LARGURA = {
  estreito: 'sm:max-w-md',
  normal: 'sm:max-w-xl',
  largo: 'sm:max-w-2xl',
} as const;

interface Props {
  titulo: ReactNode;
  /** Frase curta por baixo do título (também descreve o diálogo aos leitores de ecrã). */
  descricao?: ReactNode;
  aoFechar: () => void;
  children: ReactNode;
  /** Botões do fundo, alinhados à direita. */
  rodape?: ReactNode;
  largura?: keyof typeof LARGURA;
  /** Altura fixa (listas que mudam de tamanho ao filtrar não fazem o diálogo saltar). */
  alturaFixa?: boolean;
  /** O conteúdo trata do próprio scroll (ex.: campo fixo em cima e lista a rolar por baixo). */
  corpoLivre?: boolean;
  /** Recebe o foco ao abrir. Por omissão: o elemento com data-foco-inicial, ou o botão de fechar. */
  focoInicial?: RefObject<HTMLElement | null>;
  /** Enquanto grava: Esc, o × e o clique fora não fecham. */
  bloqueado?: boolean;
  /** Pedido de confirmação (role="alertdialog"). */
  alerta?: boolean;
  /** Clicar fora do diálogo fecha-o. */
  fecharFora?: boolean;
}

export function Dialogo({
  titulo,
  descricao,
  aoFechar,
  children,
  rodape,
  largura = 'normal',
  alturaFixa = false,
  corpoLivre = false,
  focoInicial,
  bloqueado = false,
  alerta = false,
  fecharFora = false,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const idDescricao = useId();
  // Quem tinha o foco quando o diálogo foi montado: recebe-o de volta ao fechar.
  const [quemAbriu] = useState(() =>
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null,
  );
  const premidoFora = useRef(false);

  useLayoutEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (!dialogo.open) dialogo.showModal();
    const alvo =
      focoInicial?.current ??
      dialogo.querySelector<HTMLElement>('[data-foco-inicial]') ??
      dialogo.querySelector<HTMLElement>('[data-fechar]');
    alvo?.focus();
    return () => {
      if (dialogo.open) dialogo.close();
      if (quemAbriu?.isConnected) quemAbriu.focus();
    };
  }, [focoInicial, quemAbriu]);

  const pedirFecho = () => {
    if (!bloqueado) aoFechar();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      aria-describedby={descricao ? idDescricao : undefined}
      aria-modal="true"
      role={alerta ? 'alertdialog' : undefined}
      onKeyDown={(e) => {
        // Trata o Esc aqui (e não deixa chegar à janela): o painel de foco e a seleção ficam como estão.
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        pedirFecho();
      }}
      onCancel={(e) => {
        // Outros pedidos de fecho do browser (ex.: botão "voltar" no Android).
        e.preventDefault();
        pedirFecho();
      }}
      onPointerDown={(e) => {
        premidoFora.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // O conteúdo ocupa o diálogo todo: um clique no próprio <dialog> é no fundo escurecido.
        if (fecharFora && premidoFora.current && e.target === e.currentTarget) pedirFecho();
      }}
      className={`m-auto max-h-[calc(100svh-1.5rem)] w-[calc(100vw-1.5rem)] ${LARGURA[largura]} ${
        alturaFixa ? 'h-[min(42rem,calc(100svh-1.5rem))]' : ''
      } overflow-hidden rounded-xl border border-slate-300 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45`}
    >
      <div className={`flex max-h-[calc(100svh-1.5rem)] flex-col ${alturaFixa ? 'h-full' : ''}`}>
        <header className="flex items-start gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="text-base leading-snug font-semibold break-words text-slate-900">
              {titulo}
            </h2>
            {descricao && (
              <p id={idDescricao} className="mt-0.5 text-sm text-slate-600">
                {descricao}
              </p>
            )}
          </div>
          <button
            type="button"
            data-fechar
            aria-label="Fechar"
            title="Fechar (Esc)"
            disabled={bloqueado}
            onClick={pedirFecho}
            className={`-mr-1.5 shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 ${FOCO_VISIVEL}`}
          >
            <IconeFechar />
          </button>
        </header>
        {corpoLivre ? (
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        )}
        {rodape && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            {rodape}
          </footer>
        )}
      </div>
    </dialog>
  );
}
