// Janela da reunião: de terça às 18:00 a quarta às 12:00, hora do Luxemburgo (com a hora de verão).
// O serviço no Render tem um disco persistente, por isso cada publicação pára o servidor uns segundos
// antes de arrancar o novo (sem "zero-downtime"). Nesta janela não se publica: a reunião é à quarta de
// manhã e o mapa não pode falhar na véspera nem durante a reunião. A troca de versão só acontece no fim
// da construção, uns minutos depois do pedido: por isso também se recusa nos MARGEM_ANTES_MS antes de
// a janela começar. Funções puras (recebem a data).

export const FUSO_LUXEMBURGO = 'Europe/Luxembourg';

/** Dia da semana como em Date.getDay(): 0 = domingo … 6 = sábado. */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface HoraLocal {
  diaSemana: DiaSemana;
  hora: number;
  minuto: number;
}

const TERCA: DiaSemana = 2;
const QUARTA: DiaSemana = 3;
/** Terça a partir desta hora (inclusive). */
const HORA_INICIO = 18;
/** Quarta antes desta hora (exclusive). */
const HORA_FIM = 12;

export const DESCRICAO_JANELA = 'de terça às 18:00 a quarta às 12:00 (hora do Luxemburgo)';

/**
 * Antes de a janela começar também se recusa: a construção no Render leva uns minutos e a troca de versão
 * (o mapa em baixo) só acontece no fim, já dentro da janela.
 */
export const MARGEM_ANTES_MS = 15 * 60_000;

const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;

/** Abreviaturas do Intl em inglês (en-GB), sempre iguais seja qual for a língua do PC. */
const DIAS_INGLES: Record<string, DiaSemana> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formato = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO_LUXEMBURGO,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Dia da semana, hora e minuto no Luxemburgo para um instante. */
export function horaNoLuxemburgo(data: Date): HoraLocal {
  const partes = Object.fromEntries(formato.formatToParts(data).map((p) => [p.type, p.value]));
  const diaSemana = DIAS_INGLES[partes.weekday ?? ''];
  if (diaSemana === undefined) throw new Error(`Dia da semana inesperado: ${partes.weekday}`);
  return { diaSemana, hora: Number(partes.hour), minuto: Number(partes.minute) };
}

/** "terça 19:05" */
export function descreverHora({ diaSemana, hora, minuto }: HoraLocal): string {
  return `${NOMES_DIAS[diaSemana]} ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/** Está entre terça 18:00 (inclusive) e quarta 12:00 (exclusive), hora do Luxemburgo. */
export function naJanelaDaReuniao(data: Date): boolean {
  const { diaSemana, hora } = horaNoLuxemburgo(data);
  return (diaSemana === TERCA && hora >= HORA_INICIO) || (diaSemana === QUARTA && hora < HORA_FIM);
}

export type DecisaoJanela =
  | { pode: true; aviso?: string }
  | {
      pode: false;
      erro: string;
    };

/** Fora da janela, mas a menos de MARGEM_ANTES_MS de ela começar (terça desde as 17:45). */
export function aPoucoDaJanela(data: Date): boolean {
  return !naJanelaDaReuniao(data) && naJanelaDaReuniao(new Date(data.getTime() + MARGEM_ANTES_MS));
}

/**
 * Pode publicar agora? Fora da janela (e longe dela), sim. Dentro dela, ou a menos de MARGEM_ANTES_MS de
 * começar, só com --forcar, e com um aviso de que o mapa fica em baixo durante a troca de versão (e mais,
 * se a versão nova não arrancar). O "npm run publicar" decide outra vez logo antes do pedido ao Render,
 * porque a verificação pode levar uns minutos.
 */
export function decidirJanela(data: Date, forcar: boolean): DecisaoJanela {
  const dentro = naJanelaDaReuniao(data);
  if (!dentro && !aPoucoDaJanela(data)) return { pode: true };
  const agora = descreverHora(horaNoLuxemburgo(data));
  const minutos = MARGEM_ANTES_MS / 60_000;
  const quase = 'a troca de versão, no fim da construção, já calharia dentro da janela';
  if (forcar) {
    const onde = dentro
      ? `dentro da janela da reunião (${DESCRICAO_JANELA})`
      : `a menos de ${minutos} minutos da janela da reunião (${DESCRICAO_JANELA}): ${quase}`;
    return {
      pode: true,
      aviso:
        `ATENÇÃO: agora é ${agora} no Luxemburgo, ${onde}. ` +
        'Publicar mesmo assim (--forcar): o mapa fica em baixo durante a troca de versão.',
    };
  }
  return {
    pode: false,
    erro:
      `Não se publica ${DESCRICAO_JANELA}, nem nos ${minutos} minutos antes: agora é ${agora}` +
      `${dentro ? '' : ` e ${quase}`}. ` +
      'Cada publicação deixa o mapa em baixo uns segundos (ou mais, se a versão nova falhar). ' +
      'Publica depois de quarta às 12:00, ou, se for mesmo urgente, com --forcar.',
  };
}
