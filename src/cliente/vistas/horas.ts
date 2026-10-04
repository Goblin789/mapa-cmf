// Datas e horas mostradas nas vistas, sempre na hora do Luxemburgo (o PC ou a TV podem estar noutro fuso).

export const FUSO_LUXEMBURGO = 'Europe/Luxembourg';

function partes(agora: Date, opcoes: Intl.DateTimeFormatOptions): Map<string, string> {
  const formato = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO_LUXEMBURGO, ...opcoes });
  return new Map(formato.formatToParts(agora).map((p) => [p.type, p.value]));
}

/** "2026-10-04" (para o nome do ficheiro do Excel). */
export function dataISOLuxemburgo(agora: Date): string {
  const p = partes(agora, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.get('year')}-${p.get('month')}-${p.get('day')}`;
}

/** "14:05". */
export function horaLuxemburgo(agora: Date): string {
  const p = partes(agora, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.get('hour')}:${p.get('minute')}`;
}

/** "quarta-feira, 7 de outubro". */
export function dataPorExtenso(agora: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: FUSO_LUXEMBURGO,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(agora);
}

/** "Atualizado às 14:05" a partir da data ISO em que o servidor montou o estado; null se não for uma data. */
export function textoAtualizado(geradoEm: string | null | undefined): string | null {
  if (!geradoEm) return null;
  const data = new Date(geradoEm);
  if (Number.isNaN(data.getTime())) return null;
  return `Atualizado às ${horaLuxemburgo(data)}`;
}
