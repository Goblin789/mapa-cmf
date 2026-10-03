// Ganchos globais do modo de edição: atalhos de teclado e aviso antes de sair da página com
// alterações por guardar.

import { useEffect } from 'react';
import { useLoja } from '../estado/loja';
import { ehCampoEditavel } from '../paineis/teclado';
import { desfazerComAviso, limparSelecaoComAviso, refazerComAviso } from './acoes';
import { acaoDoAtalho } from './atalhos';
import { haDialogoAberto } from './ui';

/**
 * Ctrl/⌘+Z, Ctrl+Y, Ctrl/⌘+Shift+Z e Esc. Escuta no `document` (fase de borbulhar): corre depois
 * dos popovers e da pesquisa (que marcam o Esc como tratado) e antes do painel de foco (na janela),
 * por isso o primeiro Esc limpa a seleção e só o seguinte fecha a ficha.
 */
export function useAtalhosEdicao(): void {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const { modoEdicao, selecao } = useLoja.getState();
      if (!modoEdicao) return;
      const alvo = e.target instanceof HTMLElement ? e.target : null;
      const acao = acaoDoAtalho({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        emCampoEditavel: ehCampoEditavel(alvo),
        modoEdicao,
        dialogoAberto: haDialogoAberto(),
        temSelecao: selecao.size > 0,
      });
      if (!acao) return;
      e.preventDefault();
      if (acao === 'desfazer') desfazerComAviso();
      else if (acao === 'refazer') refazerComAviso();
      else limparSelecaoComAviso();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);
}

/** Com alterações por guardar, o browser pergunta antes de fechar ou recarregar a página. */
export function useAvisoAoSair(): void {
  const temPendentes = useLoja((s) => s.modoEdicao && s.pendentes.length > 0);
  useEffect(() => {
    if (!temPendentes) return;
    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers antigos só perguntam com returnValue preenchido.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [temPendentes]);
}
