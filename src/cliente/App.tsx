// Esqueleto do ecrã principal: topo (contadores, pesquisa, Histórico e Editar), barra do modo de
// edição, mapa ao centro e caixas laterais à direita. No modo de edição a área de trabalho ganha um
// contorno âmbar: o que se vê é uma simulação até se carregar em Guardar.

import { useEffect } from 'react';
import { Marca } from './comum/Marca';
import { BarraEdicao } from './edicao/BarraEdicao';
import { BotoesCabecalho, ContornoEdicao, Edicao } from './edicao/Edicao';
import { textoDoErro } from './edicao/erros';
import { MenuUtilizador } from './entrar/MenuUtilizador';
import { useLoja } from './estado/loja';
import { Mapa } from './mapa/Mapa';
import { CaixasLaterais } from './paineis/CaixasLaterais';
import { Contadores } from './paineis/Contadores';
import { Legenda } from './paineis/Legenda';
import { PainelFoco } from './paineis/PainelFoco';
import { Pesquisa } from './paineis/Pesquisa';
import { AvisoTempoReal } from './tempoReal/AvisoTempoReal';
import { useTempoReal } from './tempoReal/useTempoReal';

export function App() {
  const estado = useLoja((s) => s.estado);
  const erro = useLoja((s) => s.erro);
  const carregar = useLoja((s) => s.carregar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Quando outra pessoa grava, o estado recarrega sozinho (e aparece um aviso).
  useTempoReal();

  // Sem dados nenhuns, o erro ocupa o ecrã. Com dados (ex.: falhou recarregar depois de guardar),
  // fica uma faixa por cima e o mapa continua à vista.
  if (erro && !estado) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="font-semibold text-red-700">Não foi possível carregar os dados.</p>
          <p className="mt-1 text-sm text-slate-600">{textoDoErro(erro)}</p>
          <button
            type="button"
            className="mt-4 rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
            onClick={() => void carregar()}
          >
            Tentar outra vez
          </button>
        </div>
      </div>
    );
  }

  if (!estado) {
    return <div className="grid h-full place-items-center text-slate-500">A carregar…</div>;
  }

  return (
    <div className="flex min-h-full flex-col md:h-full">
      {/* Telemóvel: título e botões na 1.ª linha, contadores, pesquisa. PC: título, contadores e, à direita,
          a pesquisa com os botões (se não couberem, passam juntos para a linha de baixo). */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-3 py-2">
        <Marca className="order-1" />
        <div className="order-3 w-full sm:order-2 sm:w-auto">
          <Contadores />
        </div>
        <div className="contents sm:order-3 sm:ml-auto sm:flex sm:items-center sm:gap-2">
          <div className="order-4 w-full sm:order-none sm:w-64 2xl:w-72">
            <Pesquisa />
          </div>
          <div className="order-2 ml-auto flex items-center gap-1.5 sm:order-none sm:ml-0">
            <BotoesCabecalho />
            <MenuUtilizador />
          </div>
        </div>
      </header>
      {erro && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-900">
          Não foi possível atualizar os dados. {textoDoErro(erro)}{' '}
          <button type="button" className="font-semibold underline" onClick={() => void carregar()}>
            Tentar outra vez
          </button>
        </p>
      )}
      <BarraEdicao />
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="relative h-[70svh] min-h-[22rem] min-w-0 shrink-0 md:h-auto md:min-h-0 md:flex-1 md:shrink">
          <Mapa />
          <Legenda />
          <PainelFoco />
        </main>
        <CaixasLaterais />
        <ContornoEdicao />
      </div>
      <Edicao />
      <AvisoTempoReal />
    </div>
  );
}
