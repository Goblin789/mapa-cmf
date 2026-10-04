// Marca de quem está indisponível hoje (M2, docs/m2.md, "Indisponível"), dentro do nome (NomeChip,
// NomeVista): um símbolo discreto e o nome um pouco esbatido (o lugar na carrinha está livre). Com `texto`,
// mostra também, à vista e em letra pequena, "até 12/10" (ou "sem regresso"): no Quadro, na lista lateral,
// na ficha, na Tabela e na reunião (na TV e no telemóvel um title nunca se vê). Sem `texto` (os cartões
// apertados do Mapa) fica só o símbolo, com o "até…" no title e para leitores de ecrã.
// Sem período hoje não mostra nada. Só as datas: nunca o motivo.
// O símbolo (pausa) mede-se em em: no cartão do mapa (letra de 10 px) fica com 8,5 px; no Quadro e na
// reunião cresce com a letra. Quem monta a marca esbate o nome com `usePeriodoHoje` e
// CLASSE_NOME_INDISPONIVEL.
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import type { Id, Indisponibilidade } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { descricaoIndisponivel, textoAteCurto } from '../vistas/linhasTabela';

/** O nome de quem está indisponível hoje fica um pouco esbatido (só o texto do nome, não a marca). */
export const CLASSE_NOME_INDISPONIVEL = 'opacity-60';

/** O período em que a pessoa está indisponível hoje (índices feitos com o hoje da loja), ou null. */
export function usePeriodoHoje(pessoaId: Id): Indisponibilidade | null {
  return useLoja((s) => s.indices?.indisponiveis.get(pessoaId) ?? null);
}

/** Pausa (duas barras): discreta, lê-se como "parado uns dias". */
function IconePausa() {
  return (
    <svg aria-hidden="true" viewBox="0 0 10 10" className="size-[0.85em] shrink-0" fill="currentColor">
      <rect x="1.5" y="1" width="2.5" height="8" rx="0.6" />
      <rect x="6" y="1" width="2.5" height="8" rx="0.6" />
    </svg>
  );
}

export function MarcaIndisponivel({
  pessoaId,
  compacto = false,
  texto = false,
}: {
  pessoaId: Id;
  compacto?: boolean;
  /** Mostra "até 12/10" à vista (tudo menos os cartões do Mapa). */
  texto?: boolean;
}) {
  const periodo = usePeriodoHoje(pessoaId);
  if (!periodo) return null;
  const descricao = descricaoIndisponivel(periodo);
  return (
    <span
      data-indisponivel=""
      title={descricao}
      className={`inline-flex shrink-0 items-center whitespace-nowrap text-slate-700 ${compacto ? 'gap-[0.15em]' : 'gap-[0.25em]'}`}
    >
      <IconePausa />
      {texto && (
        <span aria-hidden="true" className="text-[0.8em] leading-none font-medium">
          {textoAteCurto(periodo)}
        </span>
      )}
      <span className="sr-only">, {descricao.charAt(0).toLowerCase() + descricao.slice(1)}</span>
    </span>
  );
}
