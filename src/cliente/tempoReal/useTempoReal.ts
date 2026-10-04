// Liga ao tempo real (GET /api/eventos) enquanto a app está aberta: quando outra pessoa grava, recarrega o
// estado (o rascunho de quem está a editar continua por cima) e mostra um aviso.
//
// A ligação só abre com a sessão iniciada ('dentro') e fecha quando ela termina ('fora'); enquanto se
// verifica ('a-verificar') fica como está. As decisões estão em ligacao.ts e decisoes.ts (testadas sem
// DOM); aqui só se liga isso ao EventSource, à loja, à sessão, à visibilidade da página e à rede.

import { useEffect, useRef } from 'react';
import { useUiEdicao } from '../edicao/ui';
import { useSessao } from '../entrar/sessao';
import { type Loja, useLoja } from '../estado/loja';
import { useAvisosTempoReal } from './avisos';
import { type ContextoLoja, criarRecarregador } from './decisoes';
import { criarLigacaoTempoReal, type LigacaoTempoReal } from './ligacao';

/** O que o tempo real precisa de saber da loja. */
export function contextoDaLoja(loja: Loja): ContextoLoja {
  return {
    versaoLocal: loja.estadoServidor?.versao ?? null,
    aCarregar: loja.aCarregar,
    aGuardar: loja.aGuardar,
    comRascunho: loja.modoEdicao && loja.pendentes.length > 0,
    lotesDesteSeparador: loja.lotesDesteSeparador,
  };
}

export function useTempoReal(): void {
  const estadoSessao = useSessao((s) => s.estado);
  const chaveUtilizador = useSessao((s) => s.utilizador?.chave ?? null);
  const ligacao = useRef<LigacaoTempoReal | null>(null);

  useEffect(() => {
    // Browser sem Server-Sent Events: fica sem tempo real (os dados chegam ao recarregar a página).
    if (typeof EventSource === 'undefined') return;
    const avisos = useAvisosTempoReal.getState();
    const nova = criarLigacaoTempoReal({
      abrirFonte: (url) => new EventSource(url),
      contexto: () => contextoDaLoja(useLoja.getState()),
      recarregar: criarRecarregador(() => useLoja.getState().carregar()),
      avisar: avisos.avisar,
      definirSemLigacao: avisos.definirSemLigacao,
      verificarSessao: () => void useSessao.getState().verificar(),
    });
    ligacao.current = nova;

    // Acabou de carregar ou de gravar: decide o que ficou à espera (ex.: o lote que chegou a meio do
    // Guardar pode ser o deste separador, que só fica registado quando o POST responde).
    const largarLoja = useLoja.subscribe((agora, antes) => {
      if ((antes.aCarregar && !agora.aCarregar) || (antes.aGuardar && !agora.aGuardar)) nova.aoAcalmarLoja();
    });
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') nova.aoVoltar();
    };
    const aoVoltarRede = () => nova.aoVoltar();
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    window.addEventListener('online', aoVoltarRede);

    // Se a sessão já está iniciada quando isto monta, o outro efeito liga a seguir (corre depois deste).
    return () => {
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      window.removeEventListener('online', aoVoltarRede);
      largarLoja();
      nova.desligar();
      ligacao.current = null;
    };
  }, []);

  useEffect(() => {
    if (estadoSessao === 'dentro') ligacao.current?.ligar();
    else if (estadoSessao === 'fora') ligacao.current?.desligar();
  }, [estadoSessao]);

  // A sessão voltou (ou entrou outra conta): o rascunho que este separador deixou no localStorage quando
  // ela terminou já não faz falta, porque o tem em memória (ver loja.aoEntrar).
  useEffect(() => {
    if (estadoSessao === 'dentro' && chaveUtilizador !== null) useLoja.getState().aoEntrar();
  }, [estadoSessao, chaveUtilizador]);

  // O rascunho saiu deste separador sem ser gravado aqui (outro separador recuperou-o enquanto este estava
  // suspenso): o diálogo Guardar que ficou aberto do Guardar com 401 já não tem nada para gravar.
  useEffect(
    () =>
      useLoja.subscribe((agora, antes) => {
        if (!antes.modoEdicao || agora.modoEdicao || antes.aGuardar || agora.aGuardar) return;
        const ui = useUiEdicao.getState();
        if (ui.dialogo?.tipo === 'guardar') ui.fecharDialogo();
      }),
    [],
  );
}
