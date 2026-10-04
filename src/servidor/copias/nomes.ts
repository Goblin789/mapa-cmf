// Nomes das cópias: mapa-AAAA-MM-DDTHH-MM-SSZ-<motivo>.db.gz.enc (UTC). A ordem alfabética é a cronológica.

import { MOTIVOS, type MotivoCopia } from './tipos';

export const PREFIXO = 'mapa-';
export const EXTENSAO = '.db.gz.enc';

const PADRAO = /^mapa-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z-([a-z]+)\.db\.gz\.enc$/;

/** Data em UTC sem ":" (que o Windows não aceita em nomes de ficheiros): 2026-10-04T12-30-05Z. */
export function carimbo(data: Date): string {
  return `${data.toISOString().slice(0, 19).replaceAll(':', '-')}Z`;
}

export function nomeCopia(data: Date, motivo: MotivoCopia): string {
  return `${PREFIXO}${carimbo(data)}-${motivo}${EXTENSAO}`;
}

/** Data e motivo de um nome de cópia; null se o nome não for deste formato. */
export function lerNomeCopia(nome: string): { data: Date; motivo: MotivoCopia } | null {
  const partes = PADRAO.exec(nome);
  if (!partes) return null;
  const [, ano, mes, dia, hora, minuto, segundo, motivo] = partes;
  if (!MOTIVOS.includes(motivo as MotivoCopia)) return null;
  const data = new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}Z`);
  if (Number.isNaN(data.getTime())) return null;
  return { data, motivo: motivo as MotivoCopia };
}

/** Nomes aceites pelos destinos: sem barras nem "..", para nunca sair da pasta ou do balde. */
export function validarNomeFicheiro(nome: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(nome) || nome.includes('..')) {
    throw new Error('Nome de cópia inválido.');
  }
}
