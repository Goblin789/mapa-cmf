// Porta de entrada: sem sessão mostra o ecrã "Entrar com a conta Microsoft"; com sessão mostra a app.
//
// - 'a-verificar' (ao abrir a página): a marca e "A verificar a sessão…"; a app ainda não monta.
// - 'fora' ao abrir a página, ou depois de "Sair": a página de entrada, sem a app (nada de dados à vista).
// - 'fora' a meio do trabalho (um pedido deu 401): a app FICA montada e o aviso "A sessão terminou"
//   aparece por cima, num diálogo. Desmontá-la deitava fora o rascunho sem aviso; assim ele continua em
//   memória (e também no localStorage, ver protegerRascunho.ts) e, quando a pessoa volta a esta página
//   depois de entrar noutro separador, pergunta-se outra vez ao servidor: com a sessão de volta, o aviso
//   fecha e continua-se onde se estava.
// - A sessão voltou com OUTRA conta: com alterações por guardar (da conta anterior), o aviso continua até
//   se escolher (entrar com a conta certa, ou continuar com a nova pondo o rascunho de parte); sem
//   alterações por guardar não há nada a proteger e continua-se com a conta nova.
// O erro da entrada (?erro-entrada=…, ver docs/m1.md) lê-se uma vez ao abrir e sai logo do URL.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { AvisoSessaoTerminada } from './AvisoSessaoTerminada';
import { EcraEntrar } from './EcraEntrar';
import { EcraVerificar } from './EcraVerificar';
import { lerErroEntrada, querySemErroEntrada } from './entrada';
import { entrouOutraConta, useSessao } from './sessao';

/** Tira o erro da entrada do URL (não volta a aparecer ao recarregar nem fica nos favoritos). */
function tirarErroEntradaDoUrl(): void {
  const { pathname, search, hash } = window.location;
  const limpo = `${pathname}${querySemErroEntrada(search)}${hash}`;
  if (limpo !== `${pathname}${search}${hash}`) window.history.replaceState(window.history.state, '', limpo);
}

/** Com a sessão terminada a meio, pergunta outra vez ao servidor sempre que a pessoa volta a esta página. */
function useVerificarAoVoltar(ativo: boolean, verificar: () => Promise<void>): void {
  useEffect(() => {
    if (!ativo) return;
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void verificar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [ativo, verificar]);
}

export function Portao({ children }: { children: ReactNode }) {
  const estado = useSessao((s) => s.estado);
  const motivo = useSessao((s) => s.motivoFora);
  const utilizador = useSessao((s) => s.utilizador);
  const contaAnterior = useSessao((s) => s.contaAnterior);
  const outraConta = useSessao(entrouOutraConta);
  const verificar = useSessao((s) => s.verificar);
  const pendentes = useLoja((s) => (s.modoEdicao ? s.pendentes.length : 0));
  // Lido uma vez, ao abrir (sem efeitos no inicializador: o StrictMode corre-o duas vezes).
  const [erroEntrada] = useState(() => lerErroEntrada(window.location.search));

  useEffect(() => {
    if (erroEntrada !== null) tirarErroEntradaDoUrl();
  }, [erroEntrada]);

  // Duas chamadas seguidas (StrictMode) dão uma só pergunta ao servidor.
  useEffect(() => {
    void verificar();
  }, [verificar]);

  const terminou = estado === 'fora' && motivo === 'terminou';
  // Decide-se aqui, no desenho: nunca há um instante com a app aberta e o rascunho de outra pessoa.
  const contaTrocada = outraConta && pendentes > 0;
  const bloqueado = terminou || contaTrocada;
  useVerificarAoVoltar(bloqueado, verificar);

  // Entrou outra conta sem alterações por guardar: não há nada de ninguém a proteger.
  useLayoutEffect(() => {
    if (outraConta && pendentes === 0) useSessao.getState().aceitarOutraConta();
  }, [outraConta, pendentes]);

  // A sessão voltou depois de ter terminado a meio: os outros podem ter gravado entretanto. O estado
  // recarrega (o rascunho continua por cima, como sempre) e um aviso curto diz com quem se continua.
  // Guarda-se a chave de quem tinha a sessão (null = não terminou).
  const chaveAoTerminar = useRef<string | null>(null);
  useEffect(() => {
    if (bloqueado) {
      chaveAoTerminar.current ??= contaAnterior?.chave ?? '';
      return;
    }
    if (estado !== 'dentro' || chaveAoTerminar.current === null || !utilizador) return;
    const mesmaConta = chaveAoTerminar.current === utilizador.chave;
    chaveAoTerminar.current = null;
    void useLoja.getState().carregar();
    useUiEdicao
      .getState()
      .avisar(
        mesmaConta
          ? 'Entraste outra vez. Podes continuar onde estavas.'
          : `Entraste como ${utilizador.nome.trim() || utilizador.email || 'outra conta'}.`,
      );
  }, [estado, bloqueado, contaAnterior, utilizador]);

  if (estado === 'a-verificar') return <EcraVerificar />;
  if (estado === 'fora' && !terminou) {
    // O erro da entrada só interessa a quem chegou sem sessão (não depois de Sair).
    return <EcraEntrar erroEntrada={motivo === 'sem-sessao' ? erroEntrada : null} />;
  }
  return (
    <>
      {children}
      {bloqueado && <AvisoSessaoTerminada contaNova={contaTrocada ? utilizador : null} />}
    </>
  );
}
