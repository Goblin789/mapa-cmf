// Peças pequenas partilhadas pelos painéis.

import type { ReactNode } from 'react';
import { COR_TEXTO_NOMES } from '../../dominio/cores';
import type { NivelLotacao } from '../../dominio/ocupacao';
import type { Cliente, Pessoa } from '../../dominio/tipos';
import { ESTILO_NIVEL } from '../comum/lotacao';
import { NomeChip } from '../comum/NomeChip';
import { useLoja } from '../estado/loja';
import { ehCondutor } from './condutor';
import { textoLotacao } from './textos';

/**
 * Quadradinho da cor do cliente com a sigla (a cor nunca aparece sozinha).
 * Escondido dos leitores de ecrã: o nome do cliente vai sempre ao lado.
 */
export function MarcaCliente({ cliente }: { cliente: Cliente | null }) {
  const cor = cliente?.cor ?? '#ffffff';
  return (
    <span
      aria-hidden="true"
      className="inline-grid h-4 min-w-6 shrink-0 place-items-center rounded-sm border border-black/30 px-0.5 text-[10px] leading-none font-bold"
      style={{ backgroundColor: cor, color: COR_TEXTO_NOMES }}
    >
      {cliente?.sigla ?? '?'}
    </span>
  );
}

/** Marca "a confirmar": âmbar, com "?" além da cor. */
export function MarcaAConfirmar({ texto = 'a confirmar' }: { texto?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-500 bg-amber-100 px-1 text-[11px] leading-4 font-semibold text-amber-900">
      <span aria-hidden="true">?</span>
      {texto}
    </span>
  );
}

/** "9/10" com a cor e o símbolo do nível de lotação e, ao lado, "1 lugar livre" / "cheio" / "2 pessoas a mais". */
export function PastilhaLotacao({
  ocupados,
  lugares,
  nivel,
}: {
  ocupados: number;
  lugares: number;
  nivel: NivelLotacao;
}) {
  const estilo = ESTILO_NIVEL[nivel];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 text-xs leading-5 font-semibold tabular-nums ${estilo.pastilha}`}
      >
        <span aria-hidden="true">{estilo.simbolo}</span>
        {ocupados}/{lugares}
      </span>
      <span className="text-xs text-slate-700">{textoLotacao(ocupados, lugares)}</span>
    </span>
  );
}

/** Nomes em grelha de duas colunas (caixas laterais e fichas). Quem conduz leva o volante. */
export function GrelhaNomes({ pessoas, vazio = 'Ninguém.' }: { pessoas: Pessoa[]; vazio?: ReactNode }) {
  const indices = useLoja((s) => s.indices);
  if (pessoas.length === 0) return <p className="text-xs text-slate-600 italic">{vazio}</p>;
  return (
    <ul className="grid grid-cols-2 gap-1">
      {pessoas.map((p) => (
        <li key={p.id} className="min-w-0">
          <NomeChip pessoa={p} condutor={indices ? ehCondutor(p, indices) : false} />
        </li>
      ))}
    </ul>
  );
}

/** Ícone de fechar (×). */
export function IconeFechar() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor">
      <path d="M4 4l8 8M12 4l-8 8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Ícones pequenos dos tipos de resultado da pesquisa (M2: também a obra, um capacete). */
export function IconeTipo({ tipo }: { tipo: 'casa' | 'carrinha' | 'obra' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-slate-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      {tipo === 'casa' ? (
        <path d="M2 8l6-5 6 5M4 7v6h8V7" strokeLinejoin="round" />
      ) : tipo === 'obra' ? (
        <path
          d="M2.5 11.5h11M3.5 11.5a4.5 4.5 0 0 1 9 0M8 4v3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : (
        <path d="M1.5 4.5h9l3 3v4h-12zM4 12.5a1 1 0 100-.1M11 12.5a1 1 0 100-.1" strokeLinejoin="round" />
      )}
    </svg>
  );
}
