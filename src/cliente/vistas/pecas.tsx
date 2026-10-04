// Peças partilhadas pela Tabela, pelo Quadro e pela reunião: o nome de uma pessoa, a pastilha da
// lotação e o botão do Excel.
//
// NomeVista tem o aspeto do NomeChip (fundo da cor do cliente, texto quase-preto igual em todos, sigla,
// volante do condutor, "?" a confirmar, ponto âmbar se mudou no rascunho). As medidas são em em, para o
// Quadro poder escalar a letra (na TV da reunião).
// Com `interativo` (docs/vistas-edicao.md) porta-se como o NomeChip do mapa e da lista — fora do
// modo de edição o clique põe a pessoa em foco (abre a ficha; outro clique tira-a); no modo de edição o
// clique seleciona (Ctrl/⌘+clique junta ou tira, Shift+clique escolhe o intervalo pela ordem do
// ContextoOrdemPessoas) e põe-na em foco. Com `arrastavel` (só no modo de edição) leva o
// data-arrastavel-pessoa do motor de arrastar (arrastar/motor.ts). Com `seguirLegenda` apaga-se quando a
// legenda acende só outro cliente. Sem `interativo` (reunião) é só um nome.

import { useContext, useState } from 'react';
import { COR_TEXTO_NOMES, clienteEfetivoId } from '../../dominio/cores';
import type { NivelLotacao } from '../../dominio/ocupacao';
import type { Pessoa } from '../../dominio/tipos';
import { modoDoClique } from '../arrastar/selecao';
import { IconeVolante } from '../comum/IconeVolante';
import { ESTILO_NIVEL } from '../comum/lotacao';
import { ContextoOrdemPessoas } from '../comum/ordemPessoas';
import { useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { nomeCompleto, textoLotacao } from '../paineis/textos';
import { exportarExcel } from './excel';
import { IconeDescarregar } from './icones';

export function NomeVista({
  pessoa,
  condutor = false,
  quebrar = false,
  className = '',
  interativo = false,
  arrastavel = false,
  seguirLegenda = false,
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
  /** Botão: foco fora do modo de edição, seleção dentro dele (como o NomeChip). */
  interativo?: boolean;
  /** No modo de edição arrasta-se (data-arrastavel-pessoa). Só com `interativo`. */
  arrastavel?: boolean;
  /** Apaga-se quando a legenda acende só outro cliente. */
  seguirLegenda?: boolean;
}) {
  const indices = useLoja((s) => s.indices);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const alterado = useLoja(
    (s) =>
      s.modoEdicao &&
      s.pendentes.some((op) =>
        op.tipo === 'condutor'
          ? op.de === pessoa.id || op.para === pessoa.id
          : op.tipo === 'mover' && op.pessoaId === pessoa.id,
      ),
  );
  const emFoco = useLoja((s) => interativo && s.foco?.tipo === 'pessoa' && s.foco.id === pessoa.id);
  const selecionado = useLoja((s) => interativo && s.modoEdicao && s.selecao.has(pessoa.id));
  const clienteDestacado = useLoja((s) => (seguirLegenda ? s.clienteDestacado : null));
  const ordem = useContext(ContextoOrdemPessoas);
  if (!indices) return null;
  const clienteId = clienteEfetivoId(pessoa, indices.obras);
  const cliente = indices.clientes.get(clienteId);
  const aConfirmar = pessoa.casaAConfirmar || pessoa.carrinhaAConfirmar;
  // Um nome selecionado nunca fica apagado pela legenda: tem de se ver o que se vai mover.
  const apagado = clienteDestacado !== null && clienteDestacado !== clienteId && !selecionado;
  const titulo = [
    nomeCompleto(pessoa),
    condutor ? 'condutor' : null,
    cliente?.nome,
    aConfirmar ? 'a confirmar' : null,
    alterado ? 'alterado, por guardar' : null,
    interativo && arrastavel && modoEdicao ? 'arraste para mudar' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const conteudo = (
    <>
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
    </>
  );
  const base =
    'relative flex min-w-0 items-center gap-[0.3em] rounded-[0.25em] border px-[0.4em] py-[0.06em] leading-[1.35]';
  const cores = { backgroundColor: cliente?.cor ?? '#ffffff', color: COR_TEXTO_NOMES };

  if (!interativo) {
    return (
      <span title={titulo} className={`${base} border-black/25 ${className}`} style={cores}>
        {conteudo}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-pessoa-id={pessoa.id}
      data-arrastavel-pessoa={arrastavel && modoEdicao ? pessoa.id : undefined}
      aria-pressed={modoEdicao ? selecionado : undefined}
      title={titulo}
      onClick={(e) => {
        e.stopPropagation();
        const { definirFoco, selecionar } = useLoja.getState();
        if (!modoEdicao) {
          definirFoco(emFoco ? null : { tipo: 'pessoa', id: pessoa.id });
          return;
        }
        selecionar(pessoa.id, modoDoClique(e), ordem ?? undefined);
        definirFoco({ tipo: 'pessoa', id: pessoa.id });
      }}
      className={[
        base,
        'w-full text-left transition-opacity',
        FOCO_VISIVEL,
        arrastavel && modoEdicao ? 'cursor-grab' : 'cursor-pointer',
        selecionado
          ? 'border-blue-800 ring-2 ring-blue-600 ring-offset-1'
          : emFoco
            ? 'border-slate-900 ring-2 ring-slate-900'
            : 'border-black/25',
        apagado ? 'opacity-20' : 'opacity-100',
        className,
      ].join(' ')}
      style={cores}
    >
      {conteudo}
    </button>
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
