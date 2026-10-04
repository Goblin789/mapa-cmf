// Quem está dentro, no cabeçalho, com "Sair". No modo local (PC sem login) não mostra nada.
//
// Um botão com as iniciais (e o primeiro nome a partir de 1536 px, como o Histórico) abre um pequeno
// painel com o nome, o e-mail e "Sair" (padrão "disclosure": Tab entra no painel; fecha com Esc e com
// um clique fora). Com alterações por guardar, "Sair" pede confirmação: saindo, perdem-se.
// Depois de sair, os dados do mapa não ficam na memória da página (a app desmonta-se e a loja volta ao
// início): num computador partilhado, quem vier a seguir não os encontra.

import { useCallback, useId, useRef, useState } from 'react';
import type { Utilizador } from '../../dominio/api';
import { BOTAO_PERIGO, BOTAO_SECUNDARIO } from '../edicao/classes';
import { Dialogo } from '../edicao/Dialogo';
import { IconeRodar } from '../edicao/icones';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL, Z_POPOVER } from '../paineis/classes';
import { useFecharFora } from '../paineis/ganchos';
import { useSessao } from './sessao';
import { iniciais, primeiroNome, textoSairComPendentes } from './utilizador';

function IconeSair() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 2.5h-3a1 1 0 00-1 1v9a1 1 0 001 1h3" />
      <path d="M10.5 5L13.5 8l-3 3" />
      <path d="M13.5 8H6" />
    </svg>
  );
}

/**
 * Sai e, saindo, deita fora o rascunho (com alterações por guardar, já se confirmou) e os dados que a
 * página tinha em memória. Devolve se saiu.
 */
async function sairELimpar(): Promise<boolean> {
  if (!(await useSessao.getState().sair())) return false;
  // cancelarEdicao também apaga o rascunho deste separador do localStorage (senão voltava ao entrar).
  useLoja.getState().cancelarEdicao();
  useLoja.getState().limparDepoisDeSair();
  return true;
}

/** Confirmação antes de sair com alterações por guardar. O foco começa em "Continuar a editar". */
function DialogoSair({ pendentes, aoFechar }: { pendentes: number; aoFechar: () => void }) {
  const aSair = useSessao((s) => s.aSair);
  const erroSair = useSessao((s) => s.erroSair);
  return (
    <Dialogo
      alerta
      largura="estreito"
      titulo="Sair sem guardar?"
      descricao={textoSairComPendentes(pendentes)}
      aoFechar={aoFechar}
      bloqueado={aSair}
      fecharFora
      rodape={
        <>
          <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Continuar a editar
          </button>
          <button
            type="button"
            aria-disabled={aSair}
            onClick={() => {
              // Saindo, o rascunho deita-se fora (foi isso que se confirmou). A app desmonta-se logo a seguir.
              if (!aSair) void sairELimpar();
            }}
            className={BOTAO_PERIGO}
          >
            {aSair && <IconeRodar />}
            {aSair ? 'A sair…' : 'Sair sem guardar'}
          </button>
        </>
      }
    >
      {erroSair ? (
        <p role="alert" className="text-sm text-red-800">
          {erroSair}
        </p>
      ) : (
        <p className="text-sm text-slate-700">
          Para não {pendentes === 1 ? 'a perderes' : 'as perderes'}, carrega em Continuar a editar e depois em
          Guardar.
        </p>
      )}
    </Dialogo>
  );
}

function Menu({ utilizador }: { utilizador: Utilizador }) {
  const [aberto, setAberto] = useState(false);
  const [aConfirmar, setAConfirmar] = useState(false);
  const contentor = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const idPainel = useId();
  const aSair = useSessao((s) => s.aSair);
  const erroSair = useSessao((s) => s.erroSair);
  const pendentes = useLoja((s) => (s.modoEdicao ? s.pendentes.length : 0));

  const fechar = useCallback(() => {
    // Se o foco estava no painel (Esc ou um botão lá dentro), volta ao botão em vez de se perder.
    if (painel.current?.contains(document.activeElement)) botao.current?.focus();
    setAberto(false);
    // O erro de um Sair que falhou não fica à espera da próxima vez que se abre o menu.
    useSessao.getState().limparErroSair();
  }, []);
  const fecharConfirmacao = useCallback(() => {
    setAConfirmar(false);
    useSessao.getState().limparErroSair();
  }, []);
  // Com a confirmação aberta é ela que trata do Esc e dos cliques.
  useFecharFora(aberto && !aConfirmar, contentor, fechar);

  const nome = utilizador.nome.trim() || utilizador.email || 'Sem nome';
  const curto = primeiroNome(nome);

  return (
    <div ref={contentor} className="relative">
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={idPainel}
        aria-label={`Conta de ${nome}`}
        title={utilizador.email ? `${nome} (${utilizador.email})` : nome}
        onClick={() => {
          if (aberto) fechar();
          else setAberto(true);
        }}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border pr-2 pl-1 text-sm font-medium whitespace-nowrap ${FOCO_VISIVEL} ${
          aberto
            ? 'border-slate-900 bg-slate-100 text-slate-900'
            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
        }`}
      >
        {/* Laranja da marca com o texto quase preto: 7,25:1. */}
        <span
          aria-hidden="true"
          className="grid h-6 min-w-6 place-items-center rounded-full bg-[var(--cmf-laranja)] px-1 text-[11px] leading-none font-semibold text-[var(--cmf-preto)]"
        >
          {iniciais(utilizador.nome, utilizador.email)}
        </span>
        {/* Entre 0 e 1536 px só as iniciais, para o cabeçalho caber numa linha. */}
        {curto && <span className="hidden 2xl:inline">{curto}</span>}
        <span aria-hidden="true" className="text-[10px] text-slate-500">
          {aberto ? '▴' : '▾'}
        </span>
      </button>
      <div
        ref={painel}
        id={idPainel}
        hidden={!aberto}
        className={`absolute top-full right-0 mt-1 ${Z_POPOVER} w-64 max-w-[calc(100vw-1.5rem)] rounded-md border border-slate-300 bg-white p-1 text-sm shadow-lg`}
      >
        <div className="px-2.5 pt-1.5 pb-2">
          <p className="font-semibold break-words text-slate-900">{nome}</p>
          {utilizador.email && <p className="text-xs break-all text-slate-600">{utilizador.email}</p>}
        </div>
        <div className="my-0.5 border-t border-slate-200" />
        {erroSair && !aConfirmar && (
          <p role="alert" className="px-2.5 py-1.5 text-xs text-red-800">
            {erroSair}
          </p>
        )}
        <button
          type="button"
          aria-disabled={aSair}
          onClick={() => {
            if (aSair) return;
            if (pendentes > 0) {
              // O foco passa para o botão do menu antes de o painel fechar: é a ele que a confirmação o
              // devolve ao fechar (senão perdia-se num botão escondido).
              botao.current?.focus();
              setAberto(false);
              useSessao.getState().limparErroSair();
              setAConfirmar(true);
              return;
            }
            void sairELimpar();
          }}
          className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-slate-800 hover:bg-slate-100 ${FOCO_VISIVEL}`}
        >
          {aSair ? <IconeRodar /> : <IconeSair />}
          {aSair ? 'A sair…' : 'Sair'}
        </button>
      </div>
      {aConfirmar && <DialogoSair pendentes={pendentes} aoFechar={fecharConfirmacao} />}
    </div>
  );
}

export function MenuUtilizador() {
  const utilizador = useSessao((s) => s.utilizador);
  if (utilizador?.modo !== 'entra') return null;
  return <Menu utilizador={utilizador} />;
}
