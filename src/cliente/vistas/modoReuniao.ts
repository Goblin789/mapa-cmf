// Modo reunião (à quarta, num ecrã grande): o Quadro (ou o Mapa) em ecrã inteiro, só para ver.
// - Entrar: botão "Reunião". Com alterações por guardar não entra (explica porquê); no modo de edição sem
//   alterações, sai dele. Pede o ecrã inteiro ao browser (Fullscreen API); sem ele, fica só o layout.
// - Sair: Esc, o botão "Sair da reunião" ou sair do ecrã inteiro pelo browser.
// - Só leitura: sem Editar, sem barra de edição, sem ficha com botões de mudar.
// - Atualiza-se sozinho: o tempo real recarrega o estado quando alguém grava; de 5 em 5 minutos
//   recarrega também, para o "Atualizado às" nunca ficar velho se a ligação cair.
// - Letra maior: a classe "modo-reuniao" no <html> aumenta o rem (ver estilos.css).

import { useEffect } from 'react';
import { haDialogoAberto, useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { AVISO_ALTERACOES_POR_GUARDAR, decidirEntrada } from './regras';
import { useVista } from './vista';

/** De quanto em quanto tempo a reunião recarrega o estado (além do tempo real). */
export const INTERVALO_RECARREGAR_MS = 5 * 60 * 1000;

export const CLASSE_REUNIAO = 'modo-reuniao';

/** O browser deixa pôr a página em ecrã inteiro (não há no iPhone, por exemplo). */
export function haEcraInteiro(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

/** Pede o ecrã inteiro (tem de ser chamado num clique). Se o browser recusar, fica só o layout. */
export function pedirEcraInteiro(): void {
  if (!haEcraInteiro() || document.fullscreenElement) return;
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => useVista.getState().definirEcraInteiro(true))
    .catch(() => {
      // Recusado (ex.: sem gesto do utilizador): a reunião continua, sem ecrã inteiro.
    });
}

/** Botão "Reunião". */
export function pedirReuniao(): void {
  const { modoEdicao, pendentes, cancelarEdicao } = useLoja.getState();
  const decisao = decidirEntrada(modoEdicao, pendentes.length);
  if (decisao === 'recusar') {
    useUiEdicao.getState().avisar(AVISO_ALTERACOES_POR_GUARDAR);
    return;
  }
  if (decisao === 'sair-da-edicao-e-entrar') cancelarEdicao();
  pedirEcraInteiro();
  useVista.getState().entrarReuniao();
}

/** Sai da reunião (o ecrã inteiro termina no fim, em useModoReuniao). */
export function sairDaReuniao(): void {
  useVista.getState().sairReuniao();
}

/** Liga o que a reunião precisa enquanto está ativa: Esc, ecrã inteiro, recarregar, letra maior e só leitura. */
export function useModoReuniao(reuniao: boolean): void {
  useEffect(() => {
    if (!reuniao) return;
    const html = document.documentElement;
    html.classList.add(CLASSE_REUNIAO);
    if (document.fullscreenElement) useVista.getState().definirEcraInteiro(true);

    // Esc sai. Um popover (contadores) ou um diálogo aberto tratam o Esc primeiro.
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || haDialogoAberto()) return;
      e.preventDefault();
      sairDaReuniao();
    };
    // Sair do ecrã inteiro pelo browser (Esc, F11, o botão do browser) também termina a reunião.
    const aoMudarEcra = () => {
      const { emEcraInteiro, definirEcraInteiro } = useVista.getState();
      if (document.fullscreenElement) definirEcraInteiro(true);
      else if (emEcraInteiro) sairDaReuniao();
    };
    const temporizador = window.setInterval(() => {
      const { aCarregar, carregar } = useLoja.getState();
      if (!aCarregar) void carregar();
    }, INTERVALO_RECARREGAR_MS);

    window.addEventListener('keydown', aoTeclar);
    document.addEventListener('fullscreenchange', aoMudarEcra);
    return () => {
      html.classList.remove(CLASSE_REUNIAO);
      window.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('fullscreenchange', aoMudarEcra);
      window.clearInterval(temporizador);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {
          // Já estava a sair do ecrã inteiro.
        });
      }
    };
  }, [reuniao]);

  // A reunião é só leitura. Se se entrar nela pelo endereço (#reuniao) a meio de uma edição, ou se um
  // rascunho voltar enquanto ela está aberta, aplica-se a mesma regra do botão: sem alterações, sai-se do
  // modo de edição; com alterações por guardar, sai-se da reunião (para se poder guardar ou cancelar).
  const modoEdicao = useLoja((s) => s.modoEdicao);
  useEffect(() => {
    if (!reuniao || !modoEdicao) return;
    const { pendentes, cancelarEdicao } = useLoja.getState();
    if (decidirEntrada(true, pendentes.length) === 'recusar') {
      useUiEdicao.getState().avisar(AVISO_ALTERACOES_POR_GUARDAR);
      sairDaReuniao();
    } else cancelarEdicao();
  }, [reuniao, modoEdicao]);
}
