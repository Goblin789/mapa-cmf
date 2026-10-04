// Cópias automáticas: ao arrancar lê o destino (para saber a última cópia depois de um reinício), faz uma cópia
// 'arranque' se a última tiver mais de 1 h e depois uma de hora a hora. Nunca há duas cópias ao mesmo tempo:
// um pedido feito durante uma cópia espera por ela (que já é uma cópia fresca) em vez de fazer outra.
// Depois de cada cópia aplica-se a retenção; uma falha na retenção não desfaz a cópia.

import { copiasAApagar, ultimaCopiaDoServidor } from './retencao';
import type { CopiaNoDestino, MotivoCopia, ServicoCopias } from './tipos';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export const TEMPOS = {
  intervalo: HORA,
  /** Faz-se a cópia 'arranque' se a última for mais antiga do que isto. */
  copiaAoArrancarSeMaisDe: HORA,
  /** Espera antes da cópia 'arranque', para não atrasar o arranque do servidor. */
  atrasoArranque: 15_000,
  /** Sem cópia há mais do que isto → atrasada (aparece no /api/saude). */
  atrasadaDepoisDe: 3 * HORA,
} as const;

/** Tamanho máximo das mensagens de erro no estado. */
const MAX_MENSAGEM = 200;

export interface DependenciasServico {
  tipoDestino: 'pasta' | 's3';
  /** Tira o instantâneo, empacota e envia. Devolve o nome da cópia. */
  copiar(motivo: MotivoCopia, agora: Date): Promise<string>;
  listar(): Promise<CopiaNoDestino[]>;
  apagar(nome: string): Promise<void>;
  agora?: () => Date;
  intervaloMs?: number;
  atrasoArranqueMs?: number;
  /** Textos que nunca podem aparecer numa mensagem (credenciais, chave). */
  segredos?: readonly string[];
}

export interface ServicoCopiasAtivo extends ServicoCopias {
  /** Resolve quando a leitura inicial do destino acabou (útil nos testes). */
  arrancado: Promise<void>;
}

/** Mensagem curta e sem segredos para o estado e para o registo. */
export function mensagemSegura(
  erro: unknown,
  segredos: readonly string[] = [],
  maximo = MAX_MENSAGEM,
): string {
  let texto = erro instanceof Error ? erro.message : String(erro);
  for (const segredo of segredos) {
    if (segredo.length >= 4) texto = texto.replaceAll(segredo, '***');
  }
  texto = texto
    .replace(/https?:\/\/\S+/g, '<endereço>')
    .replace(/\s+/g, ' ')
    .trim();
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
}

export function criarServicoCopias(dependencias: DependenciasServico): ServicoCopiasAtivo {
  const agora = dependencias.agora ?? (() => new Date());
  const segredos = dependencias.segredos ?? [];
  let ultimaCopiaEm: Date | null = null;
  let ultimaTentativaEm: Date | null = null;
  let ultimoErro: string | null = null;
  let emCurso: Promise<void> | null = null;
  let parado = false;
  let temporizadorArranque: NodeJS.Timeout | null = null;

  async function aplicarRetencao(momento: Date): Promise<void> {
    const apagar = copiasAApagar(await dependencias.listar(), momento);
    for (const nome of apagar) await dependencias.apagar(nome);
  }

  async function executar(motivo: MotivoCopia): Promise<void> {
    const momento = agora();
    ultimaTentativaEm = momento;
    let nome: string;
    try {
      nome = await dependencias.copiar(motivo, momento);
    } catch (erro) {
      ultimoErro = mensagemSegura(erro, segredos);
      console.error(`Cópia de segurança (${motivo}) falhou: ${ultimoErro}`);
      return;
    }
    ultimaCopiaEm = momento;
    ultimoErro = null;
    console.log(`Cópia de segurança feita: ${nome}`);
    try {
      await aplicarRetencao(momento);
    } catch (erro) {
      ultimoErro = `Cópia feita, mas a limpeza das antigas falhou: ${mensagemSegura(erro, segredos)}`.slice(
        0,
        MAX_MENSAGEM,
      );
      console.warn(ultimoErro);
    }
  }

  function fazerAgora(motivo: MotivoCopia): Promise<void> {
    if (emCurso) return emCurso;
    emCurso = executar(motivo).finally(() => {
      emCurso = null;
    });
    return emCurso;
  }

  const intervalo = setInterval(() => void fazerAgora('hora'), dependencias.intervaloMs ?? TEMPOS.intervalo);
  intervalo.unref();

  const arrancado = (async () => {
    try {
      // Só contam as cópias deste servidor: nem as 'pc' (outra BD) nem objetos "mapa-…" fora do formato.
      const maisRecente = ultimaCopiaDoServidor(await dependencias.listar());
      // Só se a leitura inicial não chegou depois de uma cópia já feita (fazerAgora pode ter corrido entretanto).
      const jaFeita = ultimaCopiaEm as Date | null;
      if (maisRecente && (!jaFeita || maisRecente > jaFeita)) ultimaCopiaEm = maisRecente;
    } catch (erro) {
      ultimoErro = `Não foi possível ler o destino das cópias: ${mensagemSegura(erro, segredos)}`.slice(
        0,
        MAX_MENSAGEM,
      );
      console.warn(ultimoErro);
    }
    if (parado) return;
    if (!ultimaCopiaEm || agora().getTime() - ultimaCopiaEm.getTime() > TEMPOS.copiaAoArrancarSeMaisDe) {
      temporizadorArranque = setTimeout(() => {
        temporizadorArranque = null;
        void fazerAgora('arranque');
      }, dependencias.atrasoArranqueMs ?? TEMPOS.atrasoArranque);
      temporizadorArranque.unref();
    }
  })();

  return {
    arrancado,
    estado: () => ({
      ativas: true,
      ultimaCopiaEm: ultimaCopiaEm?.toISOString() ?? null,
      atrasada: !ultimaCopiaEm || agora().getTime() - ultimaCopiaEm.getTime() > TEMPOS.atrasadaDepoisDe,
      destino: dependencias.tipoDestino,
      ultimaTentativaEm: ultimaTentativaEm?.toISOString() ?? null,
      ultimoErro,
    }),
    fazerAgora,
    parar() {
      parado = true;
      clearInterval(intervalo);
      if (temporizadorArranque) clearTimeout(temporizadorArranque);
      temporizadorArranque = null;
    },
  };
}
