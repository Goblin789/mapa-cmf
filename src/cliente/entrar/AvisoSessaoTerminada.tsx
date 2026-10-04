// A sessão terminou a meio do trabalho (um pedido à API deu 401: expirou, ou saiu-se noutro separador).
// Aparece num diálogo por cima da app, SEM a desmontar: o rascunho (alterações por guardar) continua em
// memória e, mal o diálogo abre, vai também para o localStorage (protegerRascunho.ts), porque o
// telemóvel pode descartar este separador enquanto se entra noutro. Com alterações por guardar, a
// entrada abre num separador novo, para esta página não sair daqui; quando a pessoa volta a este
// separador, o Portao pergunta outra vez ao servidor e, com a sessão de volta, o diálogo fecha e
// continua-se onde se estava (incluindo Guardar).
//
// Se a sessão voltar com OUTRA conta e houver alterações por guardar, o diálogo continua aberto e explica:
// as alterações são de quem tinha a sessão e não podem ser gravadas em nome de outra pessoa. Pode-se
// entrar com a conta certa (separador novo) ou continuar com a nova, pondo o rascunho de parte.
// Não fecha com Esc nem com clique fora: até se resolver, não há nada que se possa fazer na app.

import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Utilizador } from '../../dominio/api';
import { BOTAO_PERIGO, BOTAO_SECUNDARIO } from '../edicao/classes';
import { useLoja } from '../estado/loja';
import { comPlural } from '../paineis/textos';
import {
  BotaoEntrar,
  CartaoMarca,
  CLASSE_BOTAO_ENTRAR,
  LogotipoMicrosoft,
  urlEntrarAqui,
} from './EcraEntrar';
import {
  type ProtecaoRascunho,
  porDeParteRascunhoDaContaAnterior,
  protegerRascunho,
} from './protegerRascunho';
import { useSessao } from './sessao';
import { primeiroNome } from './utilizador';

/** Nome a mostrar de uma conta (sem nome: o e-mail). */
function nomeDaConta(u: Utilizador): string {
  return u.nome.trim() || u.email || 'Sem nome';
}

const DESTAQUE = 'font-semibold text-[var(--cmf-preto)]';

/**
 * "Entrar num separador novo": uma ligação (e não window.open), porque abrir um separador a partir de
 * um clique nunca é bloqueado. O destino calcula-se no clique: é a vista de agora.
 */
function LigacaoEntrarNoutroSeparador({ texto }: { texto: string }) {
  return (
    <a
      href={urlEntrarAqui()}
      target="_blank"
      rel="noopener"
      onClick={(e) => {
        e.currentTarget.href = urlEntrarAqui();
      }}
      className={CLASSE_BOTAO_ENTRAR}
    >
      <LogotipoMicrosoft />
      {texto}
    </a>
  );
}

/** O que acontece às alterações se esta página fechar, conforme o browser as deixou guardar ou não. */
function NotaProtecao({ protecao }: { protecao: ProtecaoRascunho | null }) {
  if (protecao === 'so-em-memoria') {
    return (
      <p className="mt-3 text-sm font-medium text-red-800">
        Não feches nem recarregues este separador: as alterações só existem aqui.
      </p>
    );
  }
  return (
    <p className="mt-3 text-sm text-[var(--cmf-cinzento-claro)]">
      Depois de entrares, volta a este separador.
    </p>
  );
}

/** `contaNova`: entrou outra conta que não a que tinha a sessão (e há alterações dessa por guardar). */
export function AvisoSessaoTerminada({ contaNova = null }: { contaNova?: Utilizador | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const montado = useRef(false);
  const idTitulo = useId();
  const idDescricao = useId();
  const pendentes = useLoja((s) => (s.modoEdicao ? s.pendentes.length : 0));
  const contaAnterior = useSessao((s) => s.contaAnterior);
  const [protecao, setProtecao] = useState<ProtecaoRascunho | null>(null);

  useLayoutEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    montado.current = true;
    // showModal: o resto da página (e outros diálogos abertos, ex.: Guardar) fica inerte por baixo.
    if (!dialogo.open) dialogo.showModal();
    return () => {
      montado.current = false;
      if (dialogo.open) dialogo.close();
    };
  }, []);

  // Mal a sessão termina, o rascunho vai para o localStorage em nome de quem a tinha (idempotente: o
  // Guardar que deu 401 faz o mesmo).
  useLayoutEffect(() => {
    setProtecao(protegerRascunho(useSessao.getState().contaAnterior?.chave ?? null));
  }, []);

  const alteracoes = comPlural(pendentes, 'alteração', 'alterações');
  const perder = pendentes === 1 ? 'a perderes' : 'as perderes';

  let titulo: string;
  let corpo: ReactNode;
  let acoes: ReactNode;
  if (contaNova && contaAnterior) {
    const anterior = nomeDaConta(contaAnterior);
    const nova = nomeDaConta(contaNova);
    const curtoNova = primeiroNome(nova) || nova;
    const guardado = protecao === 'guardado';
    titulo = 'Entraste com outra conta';
    corpo = (
      <>
        <p>
          Entraste como <strong className={DESTAQUE}>{nova}</strong>, mas as{' '}
          <strong className={DESTAQUE}>{alteracoes} por guardar</strong> são de{' '}
          <strong className={DESTAQUE}>{anterior}</strong> e não podem ser gravadas em nome de outra pessoa.
        </p>
        <p className="mt-2">
          {guardado
            ? `Se continuares como ${curtoNova}, ficam neste browser e voltam quando ${anterior} entrar outra vez.`
            : `Se continuares como ${curtoNova}, perdem-se.`}
        </p>
      </>
    );
    acoes = (
      <>
        <LigacaoEntrarNoutroSeparador texto={`Entrar como ${primeiroNome(anterior) || anterior}`} />
        <NotaProtecao protecao={protecao} />
        <button
          type="button"
          onClick={() => {
            porDeParteRascunhoDaContaAnterior();
            useSessao.getState().aceitarOutraConta();
          }}
          className={`${guardado ? BOTAO_SECUNDARIO : BOTAO_PERIGO} mt-4 min-h-10 w-full`}
        >
          {guardado ? `Continuar como ${curtoNova}` : `Deitar fora e continuar como ${curtoNova}`}
        </button>
      </>
    );
  } else {
    titulo = 'A sessão terminou';
    corpo =
      pendentes > 0 ? (
        <p>
          Tens <strong className={DESTAQUE}>{alteracoes} por guardar</strong>. Para não {perder}, entra num
          separador novo e depois volta a este: continuas onde estavas e podes guardar.
        </p>
      ) : (
        <p>Para continuar, entra outra vez com a conta Microsoft.</p>
      );
    acoes =
      pendentes > 0 ? (
        <>
          <LigacaoEntrarNoutroSeparador texto="Entrar num separador novo" />
          <NotaProtecao protecao={protecao} />
        </>
      ) : (
        <BotaoEntrar />
      );
  }

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      aria-describedby={idDescricao}
      onKeyDown={(e) => {
        // O Esc não fecha nem chega à app (seleção, painel de foco).
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onCancel={(e) => e.preventDefault()}
      onClose={() => {
        // O browser pode fechá-lo sem perguntar (ex.: Esc duas vezes seguidas no Chrome): volta a abrir.
        const dialogo = ref.current;
        if (montado.current && dialogo && !dialogo.open) dialogo.showModal();
      }}
      className="m-auto max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-[25rem] overflow-y-auto overscroll-contain rounded-xl bg-transparent p-0 shadow-2xl backdrop:bg-slate-950/55"
    >
      <CartaoMarca nivel="h2" idTitulo={idTitulo} titulo={titulo}>
        <div id={idDescricao} className="mt-2 text-[0.9375rem] leading-relaxed">
          {corpo}
        </div>
        <div className="mt-6">{acoes}</div>
      </CartaoMarca>
    </dialog>
  );
}
