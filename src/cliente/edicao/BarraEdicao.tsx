// Barra âmbar por baixo do cabeçalho, só no modo de edição: diz que é uma simulação, quantas
// alterações há por guardar, e tem Desfazer, Refazer, Mover para…, Limpar seleção, Cancelar e Guardar….
// No telemóvel: 1.ª linha com o estado, Cancelar e Guardar; 2.ª linha com o resto (ícones + textos curtos).

import { useLoja } from '../estado/loja';
import { comPlural } from '../paineis/textos';
import { desfazerComAviso, limparSelecaoComAviso, pedirCancelar, refazerComAviso } from './acoes';
import { BOTAO_BARRA, BOTAO_BARRA_PRIMARIO } from './classes';
import {
  IconeDesfazer,
  IconeGuardar,
  IconeLapis,
  IconeLimparSelecao,
  IconeMover,
  IconeRefazer,
} from './icones';
import { abrirMoverPara, useUiEdicao } from './ui';

function Separador() {
  return <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-amber-300 xl:block" />;
}

export function BarraEdicao() {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const nPendentes = useLoja((s) => s.pendentes.length);
  const podeDesfazer = useLoja((s) => s.passos.length > 0);
  const podeRefazer = useLoja((s) => s.passosDesfeitos.length > 0);
  const selecao = useLoja((s) => s.selecao);
  const abrirDialogo = useUiEdicao((s) => s.abrirDialogo);
  if (!modoEdicao) return null;

  const nSelecao = selecao.size;

  return (
    <section
      aria-label="Modo de edição"
      // Recebe o foco ao entrar no modo de edição (o botão Editar desaparece; ver ganchos.ts).
      data-barra-edicao
      tabIndex={-1}
      // Pegajosa: no telemóvel a página rola e a barra (Cancelar, Guardar) tem de ficar à vista.
      // Acima do mapa e do contorno âmbar (1050), abaixo dos popovers do cabeçalho (1100).
      className="sticky top-0 z-[1060] border-b border-amber-300 bg-amber-100 text-amber-950 shadow-sm outline-none"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
        {/* No PC a largura parte do texto (flex-auto): se não couber tudo, os botões passam à linha seguinte
            em vez de espremerem o texto. */}
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-auto">
          <span
            aria-hidden="true"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#F39200] text-[#1C1C1B]"
          >
            <IconeLapis className="h-3.5 w-3.5" />
          </span>
          <p className="min-w-0 leading-tight sm:whitespace-nowrap">
            <strong className="font-semibold">
              <span className="sm:hidden">Edição</span>
              <span className="hidden sm:inline">Modo de edição</span>
            </strong>
            <span className="hidden 2xl:inline">
              {' '}
              — as mudanças só ficam gravadas quando carregares em Guardar
            </span>
            <span className="hidden md:inline 2xl:hidden"> — só fica gravado ao Guardar</span>
          </p>
          <p
            className={`shrink-0 rounded-full border px-2 text-xs leading-5 font-semibold tabular-nums ${
              nPendentes > 0
                ? 'border-[#B35F00] bg-[#F39200] text-[#1C1C1B]'
                : 'border-amber-300 bg-white/70 text-amber-900'
            }`}
          >
            {nPendentes === 0 ? (
              'Nenhuma alteração'
            ) : (
              <>
                {nPendentes}
                <span className="hidden sm:inline">{nPendentes === 1 ? ' alteração' : ' alterações'}</span>
                {' por guardar'}
              </>
            )}
          </p>
        </div>

        <div className="order-3 flex basis-full flex-wrap items-center gap-1.5 sm:order-2 sm:basis-auto">
          <button
            type="button"
            onClick={desfazerComAviso}
            disabled={!podeDesfazer}
            aria-keyshortcuts="Control+Z Meta+Z"
            title="Desfazer a última mudança (Ctrl+Z)"
            className={BOTAO_BARRA}
          >
            <IconeDesfazer />
            <span className="sr-only lg:not-sr-only">Desfazer</span>
          </button>
          <button
            type="button"
            onClick={refazerComAviso}
            disabled={!podeRefazer}
            aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"
            title="Refazer (Ctrl+Y)"
            className={BOTAO_BARRA}
          >
            <IconeRefazer />
            <span className="sr-only lg:not-sr-only">Refazer</span>
          </button>
          <Separador />
          <button
            type="button"
            onClick={() => abrirMoverPara([...selecao])}
            disabled={nSelecao === 0}
            title={
              nSelecao === 0
                ? 'Seleciona primeiro as pessoas: clica nos nomes (Ctrl+clique para juntar mais)'
                : `Escolher para onde vão ${comPlural(nSelecao, 'a pessoa selecionada', 'as pessoas selecionadas')}`
            }
            className={BOTAO_BARRA}
          >
            <IconeMover />
            <span className="sm:hidden">Mover</span>
            <span className="hidden sm:inline">Mover para…</span>
            {nSelecao > 0 && (
              <span className="rounded-full bg-[#F39200] px-1.5 text-xs leading-4 font-semibold text-[#1C1C1B] tabular-nums">
                {nSelecao}
                <span className="sr-only">
                  {' '}
                  {nSelecao === 1 ? 'pessoa selecionada' : 'pessoas selecionadas'}
                </span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={limparSelecaoComAviso}
            disabled={nSelecao === 0}
            aria-keyshortcuts="Escape"
            title="Limpar a seleção (Esc)"
            className={BOTAO_BARRA}
          >
            <IconeLimparSelecao />
            <span className="sm:hidden">Limpar</span>
            <span className="hidden sm:inline">Limpar seleção</span>
          </button>
        </div>

        <div className="order-2 flex items-center gap-1.5 sm:order-3 sm:ml-auto">
          <Separador />
          <button
            type="button"
            onClick={pedirCancelar}
            title={nPendentes > 0 ? 'Deitar fora as alterações e sair' : 'Sair do modo de edição'}
            className={BOTAO_BARRA}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => abrirDialogo({ tipo: 'guardar' })}
            disabled={nPendentes === 0}
            title={
              nPendentes === 0 ? 'Ainda não há alterações para guardar' : 'Rever e guardar as alterações'
            }
            className={BOTAO_BARRA_PRIMARIO}
          >
            <IconeGuardar />
            <span className="sm:hidden">Guardar</span>
            <span className="hidden sm:inline">Guardar…</span>
          </button>
        </div>
      </div>
    </section>
  );
}
