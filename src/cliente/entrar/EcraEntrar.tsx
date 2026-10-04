// Ecrã de entrada: marca CMF, "Mapa CMF" e "Entrar com a conta Microsoft". Ocupa a página quando não há
// sessão (o Portao não monta a app). Quando a entrada falha, o servidor volta a /?erro-entrada=<código>
// e a frase certa aparece aqui (o Portao lê o código e tira-o do URL).
// Cores e letras da marca (tema.css); bom no telemóvel (375 px) e no PC.

import { type ReactNode, useEffect, useState } from 'react';
import { IconeAviso } from '../edicao/icones';
import { FOCO_VISIVEL } from '../paineis/classes';
import { destinoDaEntrada, textoErroEntrada, urlEntrar } from './entrada';

/** Logótipo da Microsoft (os 4 quadrados), como pedem as regras do botão "Entrar com a Microsoft". */
export function LogotipoMicrosoft({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 21 21" className={`shrink-0 ${className}`}>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Para onde a entrada leva: a página onde se está (com a vista, no hash), sem o erro da entrada. */
export function urlEntrarAqui(): string {
  const { pathname, search, hash } = window.location;
  return urlEntrar(destinoDaEntrada(pathname, search, hash));
}

/** Botão grande, escuro como os botões principais da app, com o logótipo da Microsoft. */
export const CLASSE_BOTAO_ENTRAR = `flex min-h-12 w-full items-center justify-center gap-3 rounded-md bg-[var(--cmf-preto)] px-4 py-2.5 text-center text-base font-semibold text-white transition-colors hover:bg-[#3a3a38] aria-disabled:cursor-wait aria-disabled:opacity-80 ${FOCO_VISIVEL}`;

/**
 * "Entrar com a conta Microsoft": leva o browser à Microsoft (pelo servidor) e no fim de volta a esta
 * página. Depois de carregar fica "A abrir…" (a Microsoft pode demorar um pouco a responder).
 */
export function BotaoEntrar({ aoEntrar }: { aoEntrar?: () => void }) {
  const [aAbrir, setAAbrir] = useState(false);

  useEffect(() => {
    // Voltar atrás desde a página da Microsoft pode trazer esta página tal como estava (cache do
    // browser): o botão volta a estar pronto.
    const aoMostrar = (e: PageTransitionEvent) => {
      if (e.persisted) setAAbrir(false);
    };
    window.addEventListener('pageshow', aoMostrar);
    return () => window.removeEventListener('pageshow', aoMostrar);
  }, []);

  return (
    <button
      type="button"
      // aria-disabled (e não disabled): o foco não se perde enquanto a página muda.
      aria-disabled={aAbrir}
      onClick={() => {
        if (aAbrir) return;
        setAAbrir(true);
        aoEntrar?.();
        window.location.assign(urlEntrarAqui());
      }}
      className={CLASSE_BOTAO_ENTRAR}
    >
      <LogotipoMicrosoft />
      {aAbrir ? 'A abrir a página da Microsoft…' : 'Entrar com a conta Microsoft'}
    </button>
  );
}

/** Caixa de aviso (erro da entrada, falha ao verificar). */
export function CaixaErro({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2.5 text-sm leading-snug text-red-950"
    >
      <IconeAviso className="mt-0.5 h-4 w-4 text-red-700" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Cartão com a marca: filete laranja em cima, logótipo da CMF e o título. O logótipo tem 160 px de
 * largura (o manual pede pelo menos 120) e à volta a margem livre de 1/3 da altura do símbolo (20 px).
 */
export function CartaoMarca({
  titulo,
  nivel = 'h1',
  idTitulo,
  children,
}: {
  titulo: ReactNode;
  /** h1 na página de entrada; h2 dentro do diálogo por cima da app (o h1 é o da app). */
  nivel?: 'h1' | 'h2';
  idTitulo?: string;
  children: ReactNode;
}) {
  const Titulo = nivel;
  return (
    <div className="w-full overflow-hidden rounded-xl border border-[var(--cmf-linha)] bg-white text-[var(--cmf-cinzento)] shadow-sm">
      <div aria-hidden="true" className="h-1 bg-[var(--cmf-laranja)]" />
      <div className="px-6 pt-8 pb-7 sm:px-8 sm:pt-10 sm:pb-8">
        <img
          src="/marca/cmf-logo.svg"
          alt=""
          width={160}
          height={60}
          decoding="async"
          className="h-[60px] w-[160px]"
        />
        <Titulo
          id={idTitulo}
          className="mt-7 text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] text-[var(--cmf-preto)]"
        >
          {titulo}
        </Titulo>
        {children}
      </div>
    </div>
  );
}

/** Fundo da página de entrada: o cartão ao centro, com 16 px de margem dos lados no telemóvel. */
export function FundoEntrada({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-[var(--cmf-fundo-alt)] px-4 py-8 sm:py-12">
      <div className="w-full max-w-[25rem]">{children}</div>
    </main>
  );
}

const SUBTITULO = 'Quem mora em que casa, quem vai em que carrinha e para que obra.';

/** Página de entrada (sem sessão). `erroEntrada` = código que o servidor mandou no URL; `saiu` = carregou em Sair. */
export function EcraEntrar({ erroEntrada, saiu = false }: { erroEntrada: string | null; saiu?: boolean }) {
  const erro = textoErroEntrada(erroEntrada);

  useEffect(() => {
    const antes = document.title;
    document.title = 'Entrar — Mapa CMF';
    return () => {
      document.title = antes;
    };
  }, []);

  return (
    <FundoEntrada>
      <CartaoMarca titulo="Mapa CMF">
        <p className="mt-2 text-[0.9375rem] leading-relaxed">{SUBTITULO}</p>
        <div className="mt-6 space-y-4">
          {saiu && !erro && (
            <p
              role="status"
              className="rounded-md border border-[var(--cmf-linha)] bg-[var(--cmf-fundo-alt)] px-3 py-2.5 text-sm leading-snug"
            >
              <strong className="font-semibold text-[var(--cmf-preto)]">Saíste do Mapa CMF.</strong> A conta
              Microsoft continua iniciada neste browser; num computador partilhado, sai também dela.
            </p>
          )}
          {erro && (
            <CaixaErro>
              <p>{erro}</p>
            </CaixaErro>
          )}
          <BotaoEntrar />
        </div>
        <p className="mt-4 text-sm text-[var(--cmf-cinzento-claro)]">Usa a tua conta Microsoft da CMF.</p>
      </CartaoMarca>
    </FundoEntrada>
  );
}
