// Esqueleto do ecrã principal: cabeçalho (marca, Mapa | Tabela | Quadro, pesquisa, Reunião, Histórico e
// Editar), barra do modo de edição e a vista ativa (vistas/vista.ts, no hash do URL):
// - Mapa: o mapa ao centro e a lista lateral à direita;
// - Tabela e Quadro (vistas/): por cima do mapa, que continua montado mas invisível e inerte (mantém a
//   posição e o zoom para o botão "Ver no mapa" da ficha). Cada uma monta a sua ficha (PainelFoco
//   lugar="vista").
// Nada muda de vista sozinho: a pesquisa e a ficha mostram o que se escolhe na vista ativa
// (vistas/mostrar.ts); só o "Ver no mapa" da ficha leva ao Mapa.
// No modo de edição a área de trabalho ganha um contorno âmbar: o que se vê é uma simulação até se
// carregar em Guardar. O modo reunião troca o cabeçalho pelo da reunião e é só leitura (sem Editar, sem
// barra de edição nem ficha com botões de mudar).
// Os contadores (Livres nas casas, Sem transporte, Fora das casas…) saíram do cabeçalho a pedido do Rafael
// (04/10/2026): o mapa e as vistas ficam com esse espaço. Os números continuam calculados na loja
// (dominio/contadores.ts; a legenda usa as pessoas por cliente).

import { useEffect } from 'react';
import { Marca } from './comum/Marca';
import { BarraEdicao } from './edicao/BarraEdicao';
import { BotoesCabecalho, ContornoEdicao, Edicao } from './edicao/Edicao';
import { textoDoErro } from './edicao/erros';
import { MenuUtilizador } from './entrar/MenuUtilizador';
import { useLoja } from './estado/loja';
import { Mapa } from './mapa/Mapa';
import { CaixasLaterais } from './paineis/CaixasLaterais';
import { Legenda } from './paineis/Legenda';
import { PainelFoco } from './paineis/PainelFoco';
import { Pesquisa } from './paineis/Pesquisa';
import { AvisoTempoReal } from './tempoReal/AvisoTempoReal';
import { useTempoReal } from './tempoReal/useTempoReal';
import { CabecalhoReuniao } from './vistas/CabecalhoReuniao';
import { BotaoReuniao, Comutador } from './vistas/Comutador';
import { useModoReuniao } from './vistas/modoReuniao';
import { Quadro } from './vistas/Quadro';
import { Tabela } from './vistas/Tabela';
import { useSincronizarVista, useVista } from './vistas/vista';

/**
 * Telemóvel: marca e botões na 1.ª linha, Mapa | Tabela | Quadro na 2.ª e a pesquisa na 3.ª.
 * PC largo (a partir de 1024 px): tudo numa linha — a marca, Mapa | Tabela | Quadro, a pesquisa encostada à
 * direita e, a seguir, Reunião, Histórico, Editar e o utilizador.
 * Entre 640 e 1024 px a pesquisa não cabe nessa linha: vai para a 2.ª, a todo o comprimento por baixo do
 * comutador e dos botões (a marca fica ao centro das duas linhas).
 * A pesquisa está em todas as vistas: leva a vista ativa até ao que se escolhe, sem mudar de vista.
 * Ordem no DOM = ordem do Tab no PC largo (marca, comutador, pesquisa, botões); todos os filhos têm
 * col-start/row-start explícitos, por isso a ordem no DOM não muda a grelha.
 */
function Cabecalho() {
  return (
    <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-3 py-2 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:gap-y-1.5 lg:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
      <Marca className="col-start-1 row-start-1 sm:row-span-2 lg:row-span-1" />
      <Comutador className="col-span-full row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1" />
      <div className="col-span-full row-start-3 w-full sm:col-span-2 sm:col-start-2 sm:row-start-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:w-64 lg:justify-self-end 2xl:w-72">
        <Pesquisa />
      </div>
      <div className="col-start-2 row-start-1 flex items-center gap-1.5 justify-self-end sm:col-start-3 lg:col-start-4">
        <BotaoReuniao className="hidden md:inline-flex" />
        <BotoesCabecalho />
        <MenuUtilizador />
      </div>
    </header>
  );
}

export function App() {
  const estado = useLoja((s) => s.estado);
  const erro = useLoja((s) => s.erro);
  const carregar = useLoja((s) => s.carregar);
  const vista = useVista((s) => s.vista);
  const reuniao = useVista((s) => s.reuniao);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Quando outra pessoa grava, o estado recarrega sozinho (e aparece um aviso).
  useTempoReal();
  // Vista no hash do URL (Voltar/Avançar) e modo reunião.
  useSincronizarVista();
  useModoReuniao(reuniao);

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

  const noMapa = vista === 'mapa';
  // No Mapa (fora da reunião) a página cresce no telemóvel (mapa e, por baixo, a lista); nas outras
  // vistas e na reunião ocupa o ecrã e quem desliza é a própria vista.
  const paginaCresce = noMapa && !reuniao;

  return (
    <div
      data-vista={vista}
      data-reuniao={reuniao ? '' : undefined}
      className={`flex flex-col ${paginaCresce ? 'min-h-full md:h-full' : 'h-full'}`}
    >
      {reuniao ? <CabecalhoReuniao /> : <Cabecalho />}
      {erro && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-900">
          Não foi possível atualizar os dados. {textoDoErro(erro)}{' '}
          <button type="button" className="font-semibold underline" onClick={() => void carregar()}>
            Tentar outra vez
          </button>
        </p>
      )}
      {!reuniao && <BarraEdicao />}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* O mapa fica sempre montado; fora do Mapa, invisível e inerte por baixo da vista (opacity-0 e não
            só invisible: os cartões do mapa põem visibility: visible). */}
        <div
          inert={!noMapa}
          className={
            noMapa
              ? 'relative flex min-h-0 flex-1 flex-col md:flex-row'
              : 'pointer-events-none absolute inset-0 flex flex-col overflow-hidden opacity-0 md:flex-row'
          }
        >
          <main
            className={
              reuniao
                ? 'relative min-h-0 min-w-0 flex-1'
                : 'relative h-[70svh] min-h-[22rem] min-w-0 shrink-0 md:h-auto md:min-h-0 md:flex-1 md:shrink'
            }
          >
            <Mapa />
            <Legenda />
            {/* Na reunião não há ficha: tem botões para mudar pessoas (Editar). Na Tabela e no Quadro
                quem a monta é a vista (lugar="vista"): aqui só no Mapa, senão havia duas. */}
            {noMapa && !reuniao && <PainelFoco />}
          </main>
          {/* Na reunião a lista lateral esconde-se (o mapa fica com a largura toda) sem se desmontar. */}
          <div hidden={reuniao} className="contents">
            <CaixasLaterais />
          </div>
          <ContornoEdicao />
        </div>
        {vista === 'tabela' && <Tabela />}
        {vista === 'quadro' && <Quadro reuniao={reuniao} />}
      </div>
      <Edicao />
      <AvisoTempoReal />
    </div>
  );
}
