// Retenção das cópias (função pura). Com a idade de cada cópia em relação a `agora`:
//   - até 48 h: guardam-se todas;
//   - de 48 h a 30 dias: a mais recente de cada dia (UTC);
//   - de 30 a 365 dias: a mais recente de cada mês (UTC);
//   - mais de 365 dias: apagam-se.
// As 3 mais recentes nunca se apagam (mesmo que sejam antigas: um servidor parado não fica sem cópias).
// A data de cada cópia é a do nome; objetos com nomes fora do formato nunca se apagam.

import { lerNomeCopia } from './nomes';
import type { MotivoCopia } from './tipos';

const HORA = 3_600_000;
const DIA = 24 * HORA;

export const RETENCAO = {
  todasAte: 48 * HORA,
  diariasAte: 30 * DIA,
  mensaisAte: 365 * DIA,
  sempreGuardadas: 3,
} as const;

/**
 * Cópias com um nome do formato mapa-AAAA-MM-DDTHH-MM-SSZ-<motivo>.db.gz.enc, com a data do nome.
 * Um objeto "mapa-…" com outro nome (uma cópia guardada à mão, por exemplo) nunca é tratado como cópia:
 * nem se apaga, nem conta para as 3 mais recentes, nem para a última cópia do servidor.
 */
export function copiasComNomeValido(
  copias: readonly { nome: string }[],
): { nome: string; data: Date; motivo: MotivoCopia }[] {
  return copias.flatMap((copia) => {
    const lido = lerNomeCopia(copia.nome);
    return lido ? [{ nome: copia.nome, ...lido }] : [];
  });
}

/**
 * Data da última cópia feita PELO SERVIDOR (para o /api/saude e para decidir a cópia 'arranque').
 * As 'pc' não contam: são de outra BD (a do PC), não desta.
 */
export function ultimaCopiaDoServidor(copias: readonly { nome: string }[]): Date | null {
  let ultima: Date | null = null;
  for (const copia of copiasComNomeValido(copias)) {
    if (copia.motivo === 'pc') continue;
    if (!ultima || copia.data > ultima) ultima = copia.data;
  }
  return ultima;
}

/** Nomes das cópias a apagar. As que não estão na lista (ou têm nomes fora do formato) nunca são apagadas. */
export function copiasAApagar(copias: readonly { nome: string }[], agora: Date): string[] {
  const validas = copiasComNomeValido(copias).toSorted(
    (a, b) => b.data.getTime() - a.data.getTime() || b.nome.localeCompare(a.nome),
  );

  const guardar = new Set(validas.slice(0, RETENCAO.sempreGuardadas).map((copia) => copia.nome));
  /** Grupos (dia ou mês) que já têm a sua cópia mais recente guardada. */
  const gruposVistos = new Set<string>();

  for (const copia of validas) {
    const idade = agora.getTime() - copia.data.getTime();
    const iso = copia.data.toISOString();
    let grupo: string | null;
    if (idade <= RETENCAO.todasAte) grupo = null;
    else if (idade <= RETENCAO.diariasAte) grupo = `dia:${iso.slice(0, 10)}`;
    else if (idade <= RETENCAO.mensaisAte) grupo = `mes:${iso.slice(0, 7)}`;
    else continue;

    if (grupo === null) {
      guardar.add(copia.nome);
    } else if (!gruposVistos.has(grupo)) {
      // A lista está da mais recente para a mais antiga: a primeira de cada grupo é a que fica.
      gruposVistos.add(grupo);
      guardar.add(copia.nome);
    }
  }

  return validas.filter((copia) => !guardar.has(copia.nome)).map((copia) => copia.nome);
}
