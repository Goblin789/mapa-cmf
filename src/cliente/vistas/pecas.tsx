// Peças partilhadas pela Tabela, pelo Quadro e pela reunião: o nome de uma pessoa, a pastilha da
// lotação, a nota do modo de edição e o botão do Excel.
//
// NomeVista tem o aspeto do NomeChip (fundo da cor do cliente, texto quase-preto igual em todos, sigla,
// volante do condutor, "?" a confirmar, ponto âmbar se mudou no rascunho), mas não se arrasta nem se
// seleciona: mudar pessoas é só no mapa e na lista. As medidas são em em, para o Quadro poder escalar a
// letra (na TV da reunião).

import { useState } from 'react';
import { COR_TEXTO_NOMES, clienteEfetivoId } from '../../dominio/cores';
import type { NivelLotacao } from '../../dominio/ocupacao';
import type { Pessoa } from '../../dominio/tipos';
import { IconeVolante } from '../comum/IconeVolante';
import { ESTILO_NIVEL } from '../comum/lotacao';
import { useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { nomeCompleto, textoLotacao } from '../paineis/textos';
import { exportarExcel } from './excel';
import { IconeDescarregar, IconeMapa } from './icones';
import { useVista } from './vista';

export function NomeVista({
  pessoa,
  condutor = false,
  quebrar = false,
  className = '',
}: {
  pessoa: Pessoa;
  /** Conduz a carrinha onde vai: leva o volante antes do nome. */
  condutor?: boolean;
  /**
   * Um nome comprido parte em duas linhas em vez de ficar cortado com reticências (no Quadro: na TV da
   * reunião não há rato para ver o nome inteiro no title).
   */
  quebrar?: boolean;
  className?: string;
}) {
  const indices = useLoja((s) => s.indices);
  const alterado = useLoja(
    (s) =>
      s.modoEdicao &&
      s.pendentes.some((op) =>
        op.tipo === 'condutor'
          ? op.de === pessoa.id || op.para === pessoa.id
          : op.tipo === 'mover' && op.pessoaId === pessoa.id,
      ),
  );
  if (!indices) return null;
  const cliente = indices.clientes.get(clienteEfetivoId(pessoa, indices.obras));
  const aConfirmar = pessoa.casaAConfirmar || pessoa.carrinhaAConfirmar;
  const titulo = [
    nomeCompleto(pessoa),
    condutor ? 'condutor' : null,
    cliente?.nome,
    aConfirmar ? 'a confirmar' : null,
    alterado ? 'alterado, por guardar' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      title={titulo}
      className={`relative flex min-w-0 items-center gap-[0.3em] rounded-[0.25em] border border-black/25 px-[0.4em] py-[0.06em] leading-[1.35] ${className}`}
      style={{ backgroundColor: cliente?.cor ?? '#ffffff', color: COR_TEXTO_NOMES }}
    >
      {condutor && <IconeVolante tamanho={12} rotulo="condutor" className="size-[0.95em]" />}
      <span className={`min-w-0 flex-1 ${quebrar ? 'break-words' : 'truncate'}`}>{pessoa.nomeCurto}</span>
      {aConfirmar && (
        <>
          <span
            aria-hidden="true"
            className="shrink-0 rounded-[0.15em] bg-white/80 px-[0.2em] font-bold text-amber-800"
          >
            ?
          </span>
          <span className="sr-only">, a confirmar</span>
        </>
      )}
      {cliente && <span className="shrink-0 text-[0.85em] font-semibold opacity-90">{cliente.sigla}</span>}
      {alterado && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-[0.25em] -right-[0.25em] size-[0.5em] rounded-full bg-amber-500 ring-2 ring-white"
          />
          <span className="sr-only"> (alterado)</span>
        </>
      )}
    </span>
  );
}

/** "9/10" com a cor e o símbolo do nível (○ livre, ● cheio, ▲ a mais), em em. */
export function PastilhaVista({
  ocupados,
  lugares,
  nivel,
}: {
  ocupados: number;
  lugares: number;
  nivel: NivelLotacao;
}) {
  const estilo = ESTILO_NIVEL[nivel];
  const texto = textoLotacao(ocupados, lugares);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-[0.25em] rounded-[0.25em] px-[0.4em] leading-[1.5] font-semibold whitespace-nowrap tabular-nums ${estilo.pastilha}`}
      title={`${ocupados} de ${lugares} lugares · ${texto}`}
    >
      <span aria-hidden="true">{estilo.simbolo}</span>
      {ocupados}/{lugares}
      <span className="sr-only">, {texto}</span>
    </span>
  );
}

/** Botão das barras da Tabela e do Quadro (h-8, como os do cabeçalho). */
export const BOTAO_VISTA = `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium whitespace-nowrap text-slate-800 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 ${FOCO_VISIVEL}`;

/**
 * No modo de edição, a Tabela e o Quadro mostram a simulação (o rascunho por cima do que está gravado).
 * Mudar pessoas continua a ser no mapa e na lista: daí o atalho para o Mapa.
 */
export function NotaEdicao() {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const nPendentes = useLoja((s) => s.pendentes.length);
  const mudarVista = useVista((s) => s.mudarVista);
  if (!modoEdicao) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs leading-snug text-amber-950">
      <span className="font-semibold">
        {nPendentes > 0 ? 'Simulação: há alterações por guardar.' : 'Modo de edição.'}
      </span>
      <span>Para mudar pessoas, usa o mapa ou a lista.</span>
      <button
        type="button"
        onClick={() => mudarVista('mapa')}
        className={`inline-flex items-center gap-1 rounded border border-amber-400 bg-white px-1.5 py-0.5 font-medium hover:bg-amber-100 ${FOCO_VISIVEL}`}
      >
        <IconeMapa className="size-3.5" />
        Ir para o mapa
      </button>
    </p>
  );
}

/** Exporta Pessoas, Casas e Carrinhas para Excel (o que se vê: no modo de edição, a simulação). */
export function BotaoExcel() {
  const [aExportar, setAExportar] = useState(false);
  const exportar = async () => {
    const { estado, indices, dormidas, modoEdicao, pendentes } = useLoja.getState();
    if (!estado || !indices || !dormidas || aExportar) return;
    setAExportar(true);
    try {
      await exportarExcel(estado, indices, dormidas, modoEdicao && pendentes.length > 0);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      useUiEdicao.getState().avisar(`Não foi possível exportar para Excel (${motivo}).`);
    } finally {
      setAExportar(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void exportar()}
      disabled={aExportar}
      title="Exportar para Excel: folhas Pessoas, Casas e Carrinhas"
      className={BOTAO_VISTA}
    >
      <IconeDescarregar />
      {aExportar ? 'A exportar…' : 'Excel'}
    </button>
  );
}
