// Dias (AAAA-MM-DD) no fuso do Luxemburgo: "hoje", somar dias e textos curtos. Funções puras.
// As indisponibilidades e os problemas guardam dias, não horas: compara-se texto com texto
// ("2026-10-04" < "2026-10-12"), por isso todos os dias têm de vir neste formato.
// M2 (docs/m2.md).

const FUSO = 'Europe/Luxembourg';

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** O dia de `agora` no Luxemburgo, em AAAA-MM-DD (o "hoje" das indisponibilidades e dos problemas). */
export function dataNoLuxemburgo(agora: Date): string {
  const partes = Object.fromEntries(formatoDia.formatToParts(agora).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/** "2026-10-04" é um dia que existe (não aceita "2026-02-30" nem horas). */
export function eDia(texto: unknown): texto is string {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** Soma (ou tira, com n negativo) dias a um dia AAAA-MM-DD. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-12" → "12/10" (o "até dd/mm" dos nomes). Texto que não é um dia passa como veio. */
export function formatarDiaMes(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  return m ? `${m[3]}/${m[2]}` : dia;
}

/** "2026-10-12" → "12/10/2026". Texto que não é um dia passa como veio. */
export function formatarDiaCompleto(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

const formatoDiaHora = new Intl.DateTimeFormat('pt-PT', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * "2026-10-03T15:01:00Z" → "03/10 17:01" (hora do Luxemburgo, sem o ano): o Histórico, o Reverter e as frases
 * dos conflitos. Texto inválido passa como veio.
 */
export function formatarDiaHoraCurto(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  const partes = Object.fromEntries(formatoDiaHora.formatToParts(data).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month} ${partes.hour}:${partes.minute}`;
}
