// O nome de uma pessoa: fundo da cor do cliente, texto preto ou branco, sigla do cliente.
// Usado nos cartões do mapa e nas caixas laterais.

import { clienteEfetivoId, corTexto } from '../../dominio/cores';
import type { Pessoa } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';

interface Props {
  pessoa: Pessoa;
  /** Mais pequeno (cartões do mapa a zoom médio). */
  compacto?: boolean;
}

export function NomeChip({ pessoa, compacto = false }: Props) {
  const indices = useLoja((s) => s.indices);
  const clienteDestacado = useLoja((s) => s.clienteDestacado);
  const emFoco = useLoja((s) => s.foco?.tipo === 'pessoa' && s.foco.id === pessoa.id);
  const definirFoco = useLoja((s) => s.definirFoco);
  if (!indices) return null;

  const clienteId = clienteEfetivoId(pessoa, indices.obras);
  const cliente = indices.clientes.get(clienteId);
  const fundo = cliente?.cor ?? '#ffffff';
  const apagado = clienteDestacado !== null && clienteDestacado !== clienteId;
  const aConfirmar = pessoa.casaAConfirmar || pessoa.carrinhaAConfirmar;

  return (
    <button
      type="button"
      data-pessoa-id={pessoa.id}
      title={`${pessoa.nome} ${pessoa.apelidos}${cliente ? ` · ${cliente.nome}` : ''}${aConfirmar ? ' · a confirmar' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        definirFoco(emFoco ? null : { tipo: 'pessoa', id: pessoa.id });
      }}
      className={[
        'flex w-full min-w-0 items-center gap-1 rounded border text-left leading-tight transition-opacity',
        compacto ? 'px-1 py-px text-[10px]' : 'px-1.5 py-0.5 text-xs',
        emFoco ? 'border-slate-900 ring-2 ring-slate-900' : 'border-black/25',
        apagado ? 'opacity-20' : 'opacity-100',
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
    </button>
  );
}
