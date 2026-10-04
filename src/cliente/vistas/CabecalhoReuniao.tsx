// Cabeçalho do modo reunião, pensado para uma TV 1920×1080 vista de longe: a marca, o dia e a hora,
// "Atualizado às HH:MM", Quadro | Mapa (e Casas | Carrinhas | Obras no Quadro) e "Sair da reunião".
// Sem Editar nem Histórico: a reunião é só para ver. Sem os contadores (Livres nas casas, Sem transporte…):
// saíram a pedido do Rafael (04/10/2026) e o Quadro/Mapa da TV fica com esse espaço. No Quadro, a partir de
// xl, os filtros dos clientes e das obras ficam aqui, a seguir à hora (FiltrosReuniao, em Quadro.tsx).

import { useEffect, useState } from 'react';
import { Marca } from '../comum/Marca';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { AlternadorAgrupamento, ComutadorReuniao } from './Comutador';
import { dataPorExtenso, horaLuxemburgo, textoAtualizado } from './horas';
import { IconeEcraInteiro, IconeSairEcra } from './icones';
import { haEcraInteiro, pedirEcraInteiro, sairDaReuniao } from './modoReuniao';
import { FiltrosReuniao } from './Quadro';
import { useVista } from './vista';

/** A hora atual, renovada no início de cada minuto. */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    let temporizador = 0;
    const agendar = () => {
      const ms = 60_000 - (Date.now() % 60_000) + 50;
      temporizador = window.setTimeout(() => {
        setAgora(new Date());
        agendar();
      }, ms);
    };
    agendar();
    return () => window.clearTimeout(temporizador);
  }, []);
  return agora;
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const BOTAO = `inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm font-medium whitespace-nowrap ${FOCO_VISIVEL}`;

export function CabecalhoReuniao() {
  const vista = useVista((s) => s.vista);
  const emEcraInteiro = useVista((s) => s.emEcraInteiro);
  const geradoEm = useLoja((s) => s.estadoServidor?.geradoEm ?? null);
  const agora = useAgora();
  const atualizado = textoAtualizado(geradoEm);

  return (
    // TV e PC largo (xl): uma só linha — a marca, o dia e a hora e, à direita, os comandos. Abaixo de xl
    // os comandos não cabiam ao lado da data (partia palavra a palavra): vão para uma linha própria, por
    // baixo da marca e da data.
    // Tudo em rem: a classe modo-reuniao no <html> aumenta a letra (ver estilos.css).
    <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-2 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:gap-x-6 xl:px-4">
      <Marca />
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 leading-tight">
        <h2 className="text-xl font-semibold text-[var(--cmf-preto)]">Reunião</h2>
        <p className="text-base text-slate-700">
          <time dateTime={agora.toISOString()}>
            {maiuscula(dataPorExtenso(agora))} ·{' '}
            <span className="font-semibold whitespace-nowrap tabular-nums">{horaLuxemburgo(agora)}</span>
          </time>
        </p>
        {atualizado && (
          <p
            className="text-sm whitespace-nowrap text-slate-600 tabular-nums"
            title="Hora a que os dados chegaram do servidor"
          >
            {atualizado}
          </p>
        )}
        {/* No Quadro, a partir de xl, os filtros (clientes e obras) vêm para aqui, a seguir à hora (passam
            à linha de baixo se não couberem): o Quadro da TV fica com a altura da barra que tinham. */}
        {vista === 'quadro' && <FiltrosReuniao className="hidden self-center xl:flex" />}
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-2 xl:col-span-1 xl:justify-end">
        <ComutadorReuniao />
        {vista === 'quadro' && <AlternadorAgrupamento grande />}
        {!emEcraInteiro && haEcraInteiro() && (
          <button
            type="button"
            onClick={pedirEcraInteiro}
            title="Pôr em ecrã inteiro"
            className={`${BOTAO} border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
          >
            <IconeEcraInteiro />
            Ecrã inteiro
          </button>
        )}
        <button
          type="button"
          onClick={sairDaReuniao}
          aria-keyshortcuts="Escape"
          title="Sair da reunião (Esc)"
          className={`${BOTAO} border-slate-900 bg-slate-900 text-white hover:bg-slate-700`}
        >
          <IconeSairEcra />
          Sair da reunião
        </button>
      </div>
    </header>
  );
}
