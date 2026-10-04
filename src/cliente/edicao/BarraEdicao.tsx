// Barra âmbar por baixo do cabeçalho, só no modo de edição: diz que é uma simulação, quantas
// alterações há por guardar, e tem Desfazer, Refazer, Mover para…, Limpar seleção, Cancelar e Guardar….
// No telemóvel: 1.ª linha com o estado, Cancelar e Guardar; 2.ª linha com o resto (ícones + textos curtos).
// A 375 px a 1.ª linha só tem uns 166 px para o estado: sem o lápis e com "Sem alterações", "Edição" e a
// pastilha cabem lado a lado (antes a pastilha espremia o título até ficar por cima dele).
// M2: menu "Novo…" (Nova pessoa, Nova obra; setas, Home/End, Esc) e "Indisponível…" quando há seleção. Para a
// barra continuar numa linha com estes dois, abaixo de 1900 px Desfazer e Refazer ficam só com o ícone (o nome
// fica para os leitores de ecrã e na dica), "Limpar seleção" passa a "Limpar" e a frase longa ("— as mudanças
// só ficam gravadas…") passa à curta. Medido (rascunho grande, com e sem seleção): uma linha de 1280 a 2560 px;
// com o corte no 2xl (1536) a barra ia para duas linhas de 1536 a 1760. No telemóvel, com seleção, "Limpar"
// e "Novo" ficam só com o ícone (a 2.ª linha continua a caber a 375 px).
// Os cortes são em rem (1900 px = 118.75rem, 1300 px = 81.25rem): com px, o Tailwind punha as regras antes das
// do md/sm (em rem) e a 1920 px apareciam as duas frases e "Limpar" junto de "Limpar seleção".

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { comPlural } from '../paineis/textos';
import { desfazerComAviso, limparSelecaoComAviso, pedirCancelar, refazerComAviso } from './acoes';
import { teclaNoBotaoMenu, teclaNoMenu } from './atalhos';
import { BOTAO_BARRA, BOTAO_BARRA_PRIMARIO } from './classes';
import {
  IconeAbrirMenu,
  IconeDesfazer,
  IconeGuardar,
  IconeIndisponivel,
  IconeLapis,
  IconeLimparSelecao,
  IconeMais,
  IconeMover,
  IconeObra,
  IconePessoaNova,
  IconeRefazer,
} from './icones';
import { contarAlteracoes } from './resumo';
import { abrirIndisponivel, abrirMoverPara, abrirNovaPessoa, abrirObra, useUiEdicao } from './ui';

function Separador() {
  return <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-amber-300 xl:block" />;
}

interface ItemMenu {
  rotulo: string;
  icone: ReactNode;
  dica: string;
  acao: () => void;
}

const ITENS_NOVO: readonly ItemMenu[] = [
  {
    rotulo: 'Nova pessoa',
    icone: <IconePessoaNova />,
    dica: 'Juntar uma pessoa nova (casa e carrinha no mesmo passo)',
    acao: abrirNovaPessoa,
  },
  {
    rotulo: 'Nova obra',
    icone: <IconeObra />,
    dica: 'Criar uma obra com a morada ou o sítio no mapa',
    acao: () => abrirObra(null),
  },
];

/**
 * "Novo…": botão que abre um menu (role="menu"). Setas para cima e para baixo, Home e End mudam de item;
 * Enter/Espaço escolhem; Esc fecha e devolve o foco ao botão; Tab ou um clique fora fecham.
 */
/** Largura mínima do menu (min-w-44 = 11rem): para saber se cabe à direita do botão. */
const LARGURA_MENU = 176;

/**
 * `compacto`: no telemóvel, só o ícone (com a seleção, a 2.ª linha da barra ganha "Indisponível…" e o nº de
 * selecionadas; assim continua numa linha a 375 px).
 */
function MenuNovo({ compacto }: { compacto: boolean }) {
  const [aberto, setAberto] = useState<number | null>(null);
  // O botão fica no fim da barra (no PC, junto à margem direita): aí o menu abre para a esquerda.
  const [paraEsquerda, setParaEsquerda] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const itens = useRef<(HTMLButtonElement | null)[]>([]);
  const idMenu = useId();
  const idBotao = useId();

  // Ao abrir, o foco vai para o item pedido (o 1.º, ou o último com a seta para cima).
  useEffect(() => {
    if (aberto !== null) itens.current[aberto]?.focus();
  }, [aberto]);

  useEffect(() => {
    if (aberto === null) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(null);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);

  const abrirEm = (indice: number) => {
    const r = botao.current?.getBoundingClientRect();
    setParaEsquerda(r !== undefined && r.left + LARGURA_MENU > window.innerWidth - 8);
    setAberto(indice);
  };

  const fechar = (devolverFoco: boolean) => {
    setAberto(null);
    if (devolverFoco) botao.current?.focus();
  };

  const aoTeclarNoBotao = (e: KeyboardEvent<HTMLButtonElement>) => {
    const indice = teclaNoBotaoMenu(e.key, ITENS_NOVO.length);
    if (indice === null) return;
    e.preventDefault();
    abrirEm(indice);
  };

  const aoTeclarNoMenu = (e: KeyboardEvent<HTMLDivElement>) => {
    const atual = itens.current.indexOf(document.activeElement as HTMLButtonElement);
    const acao = teclaNoMenu(e.key, Math.max(0, atual), ITENS_NOVO.length);
    if (!acao) return;
    if (acao.tipo === 'focar') {
      e.preventDefault();
      itens.current[acao.indice]?.focus();
      return;
    }
    // Esc é do menu: não limpa a seleção nem fecha a ficha (os atalhos veem o defaultPrevented).
    if (acao.devolverFoco) e.preventDefault();
    fechar(acao.devolverFoco);
  };

  const escolher = (item: ItemMenu) => {
    // O foco volta ao botão antes de o diálogo abrir: é a ele que o diálogo o devolve ao fechar.
    fechar(true);
    item.acao();
  };

  return (
    <div ref={caixa} className="relative">
      <button
        ref={botao}
        id={idBotao}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto !== null}
        aria-controls={aberto !== null ? idMenu : undefined}
        onClick={() => (aberto === null ? abrirEm(0) : setAberto(null))}
        onKeyDown={aoTeclarNoBotao}
        title="Nova pessoa ou nova obra"
        className={BOTAO_BARRA}
      >
        <IconeMais />
        <span className={compacto ? 'sr-only sm:hidden' : 'sm:hidden'}>Novo</span>
        <span className="hidden sm:inline">Novo…</span>
        <IconeAbrirMenu />
      </button>
      {aberto !== null && (
        <div
          id={idMenu}
          role="menu"
          aria-labelledby={idBotao}
          onKeyDown={aoTeclarNoMenu}
          className={`absolute top-full ${paraEsquerda ? 'right-0' : 'left-0'} z-[1100] mt-1 min-w-44 rounded-md border border-slate-300 bg-white py-1 text-slate-900 shadow-lg`}
        >
          {ITENS_NOVO.map((item, i) => (
            <button
              key={item.rotulo}
              ref={(el) => {
                itens.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              title={item.dica}
              onClick={() => escolher(item)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm whitespace-nowrap hover:bg-amber-50 focus:bg-amber-50 ${FOCO_VISIVEL}`}
            >
              {item.icone}
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarraEdicao() {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  // O pino (lat e lng) conta uma vez, como no Guardar e no Reverter.
  const nPendentes = useLoja((s) => contarAlteracoes(s.pendentes));
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
            className="hidden h-6 w-6 shrink-0 place-items-center rounded-full bg-[#F39200] text-[#1C1C1B] sm:grid"
          >
            <IconeLapis className="h-3.5 w-3.5" />
          </span>
          <p className="shrink-0 leading-tight whitespace-nowrap sm:min-w-0 sm:shrink">
            <strong className="font-semibold">
              <span className="sm:hidden">Edição</span>
              <span className="hidden sm:inline">Modo de edição</span>
            </strong>
            <span className="hidden min-[118.75rem]:inline">
              {' '}
              — as mudanças só ficam gravadas quando carregares em Guardar
            </span>
            {/* Com seleção entram o nº de selecionadas e "Indisponível…": abaixo de 1300 px esta frase sai, para a
                barra continuar numa linha (a 1280 px). */}
            <span
              className={
                nSelecao > 0
                  ? 'hidden min-[81.25rem]:inline min-[118.75rem]:hidden'
                  : 'hidden md:inline min-[118.75rem]:hidden'
              }
            >
              {' '}
              — só fica gravado ao Guardar
            </span>
          </p>
          <p
            className={`min-w-0 truncate rounded-full border px-2 text-xs leading-5 font-semibold tabular-nums sm:shrink-0 ${
              nPendentes > 0
                ? 'border-[#B35F00] bg-[#F39200] text-[#1C1C1B]'
                : 'border-amber-300 bg-white/70 text-amber-900'
            }`}
          >
            {nPendentes === 0 ? (
              <>
                <span className="sm:hidden">Sem alterações</span>
                <span className="hidden sm:inline">Nenhuma alteração</span>
              </>
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
            <span className="sr-only min-[118.75rem]:not-sr-only">Desfazer</span>
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
            <span className="sr-only min-[118.75rem]:not-sr-only">Refazer</span>
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
            {/* Com a seleção, no telemóvel, só o ícone (ver MenuNovo). */}
            <span
              className={
                nSelecao > 0 ? 'sr-only sm:not-sr-only min-[118.75rem]:hidden' : 'min-[118.75rem]:hidden'
              }
            >
              Limpar
            </span>
            <span className="hidden min-[118.75rem]:inline">Limpar seleção</span>
          </button>
          {nSelecao > 0 && (
            <button
              type="button"
              onClick={() => abrirIndisponivel([...selecao])}
              title={`Marcar indisponível ${comPlural(nSelecao, 'a pessoa selecionada', 'as pessoas selecionadas')} (só as datas)`}
              className={BOTAO_BARRA}
            >
              <IconeIndisponivel />
              <span className="sr-only sm:not-sr-only">Indisponível…</span>
            </button>
          )}
          <Separador />
          <MenuNovo compacto={nSelecao > 0} />
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
