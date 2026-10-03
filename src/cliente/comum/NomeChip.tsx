// O nome de uma pessoa: fundo da cor do cliente, texto preto ou branco, sigla do cliente.
// Usado nos cartões do mapa e na lista lateral.
// Fora do modo de edição, clicar põe a pessoa em foco. No modo de edição o nome é arrastável
// (data-arrastavel-pessoa, ver arrastar/motor.ts) e o clique seleciona: Ctrl/⌘+clique junta ou tira,
// Shift+clique escolhe o intervalo pela ordem da lista (ContextoOrdemPessoas). Quem tem alterações
// por guardar leva uma marca discreta.

import { useContext } from 'react';
import { clienteEfetivoId, corTexto } from '../../dominio/cores';
import type { Pessoa } from '../../dominio/tipos';
import { modoDoClique } from '../arrastar/selecao';
import { useLoja } from '../estado/loja';
import { ContextoOrdemPessoas } from './ordemPessoas';

interface Props {
  pessoa: Pessoa;
  /** Mais pequeno (cartões do mapa a zoom médio). */
  compacto?: boolean;
  /** Classes extra, juntadas às do nome. */
  className?: string;
}

export function NomeChip({ pessoa, compacto = false, className = '' }: Props) {
  const indices = useLoja((s) => s.indices);
  const clienteDestacado = useLoja((s) => s.clienteDestacado);
  const emFoco = useLoja((s) => s.foco?.tipo === 'pessoa' && s.foco.id === pessoa.id);
  const definirFoco = useLoja((s) => s.definirFoco);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const selecionado = useLoja((s) => s.modoEdicao && s.selecao.has(pessoa.id));
  const alterado = useLoja((s) => s.modoEdicao && s.pendentes.some((op) => op.pessoaId === pessoa.id));
  const selecionar = useLoja((s) => s.selecionar);
  const ordem = useContext(ContextoOrdemPessoas);
  if (!indices) return null;

  const clienteId = clienteEfetivoId(pessoa, indices.obras);
  const cliente = indices.clientes.get(clienteId);
  const fundo = cliente?.cor ?? '#ffffff';
  // Um nome selecionado nunca fica apagado pela legenda: tem de se ver o que se vai arrastar.
  const apagado = clienteDestacado !== null && clienteDestacado !== clienteId && !selecionado;
  const aConfirmar = pessoa.casaAConfirmar || pessoa.carrinhaAConfirmar;
  const titulo = [
    `${pessoa.nome} ${pessoa.apelidos}`,
    cliente?.nome,
    aConfirmar ? 'a confirmar' : null,
    alterado ? 'alterado, por guardar' : null,
    modoEdicao ? 'arraste para mudar' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      data-pessoa-id={pessoa.id}
      data-arrastavel-pessoa={modoEdicao ? pessoa.id : undefined}
      aria-pressed={modoEdicao ? selecionado : undefined}
      title={titulo}
      onClick={(e) => {
        e.stopPropagation();
        if (!modoEdicao) {
          definirFoco(emFoco ? null : { tipo: 'pessoa', id: pessoa.id });
          return;
        }
        selecionar(pessoa.id, modoDoClique(e), ordem ?? undefined);
        definirFoco({ tipo: 'pessoa', id: pessoa.id });
      }}
      className={[
        'relative flex w-full min-w-0 items-center gap-1 rounded border text-left leading-tight transition-opacity',
        compacto ? 'px-1 py-px text-[10px]' : 'px-1.5 py-0.5 text-xs',
        modoEdicao ? 'cursor-grab' : '',
        selecionado
          ? 'border-blue-800 ring-2 ring-blue-600 ring-offset-1'
          : emFoco
            ? 'border-slate-900 ring-2 ring-slate-900'
            : 'border-black/25',
        apagado ? 'opacity-20' : 'opacity-100',
        className,
      ].join(' ')}
      style={{ backgroundColor: fundo, color: corTexto(fundo) }}
    >
      <span className="min-w-0 flex-1 truncate">{pessoa.nomeCurto}</span>
      {aConfirmar && (
        <span className="shrink-0 rounded-sm bg-white/80 px-0.5 font-bold text-amber-700" aria-hidden="true">
          ?
        </span>
      )}
      {cliente && <span className="shrink-0 font-semibold opacity-70">{cliente.sigla}</span>}
      {alterado && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -right-1 size-2 rounded-full bg-blue-600 ring-2 ring-white"
          />
          <span className="sr-only"> (alterado)</span>
        </>
      )}
    </button>
  );
}
