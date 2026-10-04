// Validação do que chega do browser: corpo de POST /api/lotes, de POST /api/geocodificar(/inverso) e
// parâmetros de GET /api/historico.
// Funções puras (não sabem nada de HTTP nem da base de dados).

import { z } from 'zod';
import type { PedidoGeocodificar, PedidoGeocodificarInverso } from '../dominio/api';
import {
  ENTIDADES_APAGAVEIS,
  ENTIDADES_CRIAVEIS,
  ENTIDADES_EDITAVEIS,
  type EntidadeCriavel,
  eCampoEditavel,
  REGIAO_MAPA,
  type ValorCampo,
  validarRegisto,
  validarValorCampo,
} from '../dominio/campos';
import type { Operacao } from '../dominio/operacoes';
import { PAISES, TIPOS_LOCAL } from '../dominio/tipos';

export const MAX_OPERACOES = 500;
export const MAX_COMENTARIO = 500;
/** Lotes revertidos de uma vez (PedidoGuardar.reverte). */
export const MAX_REVERTE = 20;
export const LIMITE_HISTORICO = { omissao: 50, maximo: 200 } as const;
/** Erros devolvidos de uma vez (500 operações mal feitas não dão 500 frases). */
const MAX_ERROS = 10;

/** Mensagens do zod em português europeu. */
const mensagensPt = z.locales.pt().localeError;

const id = z.string().min(1).max(200);

const operacaoMover = z.object({
  tipo: z.literal('mover'),
  pessoaId: id,
  campo: z.enum(['casaId', 'carrinhaId', 'obraId']),
  de: id.nullable(),
  para: id.nullable(),
});

/** Definir (para = pessoa) ou tirar (para = null) o condutor de uma carrinha. */
const operacaoCondutor = z.object({
  tipo: z.literal('condutor'),
  carrinhaId: id,
  de: id.nullable(),
  para: id.nullable(),
});

/** "casa:<id>" ou "local:<id>"; null = por definir (o mapa usa a sugestão). */
const chaveDormida = z
  .string()
  .max(210)
  .regex(/^(casa|local):.+$/, { error: 'Onde dorme tem de ser "casa:<id>", "local:<id>" ou null.' });

/** Mudar onde dorme uma carrinha. */
const operacaoDormida = z.object({
  tipo: z.literal('dormida'),
  carrinhaId: id,
  de: chaveDormida.nullable(),
  para: chaveDormida.nullable(),
});

// --- M2: 'campo' e 'registo' ------------------------------------------------------------------------

/** Valor de um campo editável (ValorCampo): a regra fina de cada campo é a do domínio (validarValorCampo). */
const valorCampo = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(100)).max(20),
]);

/** Mudar um campo de uma ficha: só os de CAMPOS_EDITAVEIS, com um valor que serve (validarValorCampo). */
const operacaoCampo = z
  .object({
    tipo: z.literal('campo'),
    entidade: z.enum(ENTIDADES_EDITAVEIS),
    id,
    campo: z.string().min(1).max(60),
    de: valorCampo,
    para: valorCampo,
  })
  .superRefine((op, ctx) => {
    if (!eCampoEditavel(op.entidade, op.campo)) {
      ctx.addIssue({ code: 'custom', path: ['campo'], message: `O campo ${op.campo} não se pode mudar.` });
      return;
    }
    const erro = validarValorCampo(op.entidade, op.campo, op.para as ValorCampo);
    if (erro) ctx.addIssue({ code: 'custom', path: ['para'], message: erro });
  });

const texto = z.string().max(1000);
const textoOuNulo = texto.nullable();
const idOuNulo = id.nullable();

/**
 * Os registos que se criam ou apagam, com EXATAMENTE os campos do tipo (strictObject: um campo a mais é
 * recusado; a indisponibilidade aceita só id, pessoaId, inicio e fim, nunca um motivo).
 */
const REGISTOS = {
  pessoa: z.strictObject({
    id,
    numero: textoOuNulo,
    numeroOriginal: textoOuNulo,
    apelidos: texto,
    nome: texto,
    nomeCurto: texto,
    nomesAlternativos: z.array(texto).max(20),
    clienteId: id,
    obraId: idOuNulo,
    casaId: idOuNulo,
    carrinhaId: idOuNulo,
    casaAConfirmar: z.boolean(),
    carrinhaAConfirmar: z.boolean(),
    telefone: textoOuNulo,
    temCarta: z.boolean().nullable(),
    cartaValidade: textoOuNulo,
    ativa: z.boolean(),
  }),
  obra: z.strictObject({
    id,
    nome: texto,
    clienteId: id,
    localId: id,
    estacionamentoLocalId: idOuNulo,
    origem: z.enum(['gps', 'manual']),
  }),
  local: z.strictObject({
    id,
    tipo: z.enum(TIPOS_LOCAL),
    nome: texto,
    morada: texto,
    pais: z.enum(PAISES),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    raioM: z.number(),
  }),
  indisponibilidade: z.strictObject({ id, pessoaId: id, inicio: texto, fim: textoOuNulo }),
  problema: z.strictObject({
    id,
    casaId: idOuNulo,
    carrinhaId: idOuNulo,
    texto,
    abertoEm: texto,
    resolvidoEm: textoOuNulo,
  }),
} as const;

/** Criar (de = null) ou apagar (para = null) um registo de uma entidade. */
function operacaoRegistoDe<E extends EntidadeCriavel>(entidade: E, registo: (typeof REGISTOS)[E]) {
  return z
    .object({
      tipo: z.literal('registo'),
      entidade: z.literal(entidade),
      id,
      de: registo.nullable(),
      para: registo.nullable(),
    })
    .superRefine((op, ctx) => {
      const de = op.de as { id: string } | null;
      const para = op.para as { id: string } | null;
      if ((de === null) === (para === null)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Um registo cria-se (de = null) ou apaga-se (para = null).',
        });
        return;
      }
      if (para !== null) {
        if (!(ENTIDADES_CRIAVEIS as readonly string[]).includes(entidade)) {
          ctx.addIssue({ code: 'custom', message: `Não se criam registos de ${entidade} no programa.` });
        }
        if (para.id !== op.id) {
          ctx.addIssue({ code: 'custom', path: ['para', 'id'], message: 'O identificador não bate certo.' });
        }
        for (const erro of validarRegisto(entidade, para)) {
          ctx.addIssue({ code: 'custom', path: ['para'], message: erro });
        }
      } else if (!(ENTIDADES_APAGAVEIS as readonly string[]).includes(entidade)) {
        ctx.addIssue({
          code: 'custom',
          message:
            entidade === 'pessoa'
              ? 'Uma pessoa não se apaga: usa "Saiu da empresa".'
              : `Não se apagam registos de ${entidade} no programa.`,
        });
      } else if (de?.id !== op.id) {
        ctx.addIssue({ code: 'custom', path: ['de', 'id'], message: 'O identificador não bate certo.' });
      }
    });
}

const operacaoRegisto = z.discriminatedUnion('entidade', [
  operacaoRegistoDe('pessoa', REGISTOS.pessoa),
  operacaoRegistoDe('obra', REGISTOS.obra),
  operacaoRegistoDe('local', REGISTOS.local),
  operacaoRegistoDe('indisponibilidade', REGISTOS.indisponibilidade),
  operacaoRegistoDe('problema', REGISTOS.problema),
]);

const operacao = z.discriminatedUnion('tipo', [
  operacaoMover,
  operacaoCondutor,
  operacaoDormida,
  operacaoCampo,
  operacaoRegisto,
]);

const pedidoGuardar = z.object({
  /**
   * Os conflitos detetam-se pelo `de` de cada operação; a versão só serve para os que a regra do condutor
   * esconde (ver conflitosDoCondutor em lotes.ts).
   */
  versaoBase: z.number().int().nonnegative(),
  operacoes: z
    .array(operacao)
    .min(1, { error: 'Não há operações para gravar.' })
    .max(MAX_OPERACOES, { error: `No máximo ${MAX_OPERACOES} operações de cada vez.` }),
  comentario: z
    .string()
    .max(MAX_COMENTARIO, { error: `O comentário tem no máximo ${MAX_COMENTARIO} caracteres.` })
    .nullish(),
  /** M2: lotes que este rascunho reverte (o servidor confirma que cada um se pode reverter). */
  reverte: z
    .array(
      z
        .number()
        .int({ error: 'As gravações a reverter são números inteiros.' })
        .min(1, { error: 'As gravações a reverter começam no nº 1.' }),
    )
    .max(MAX_REVERTE, { error: `No máximo ${MAX_REVERTE} gravações revertidas de cada vez.` })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Há gravações repetidas em "reverte".' })
    .optional(),
});

export interface PedidoGuardarValido {
  versaoBase: number;
  operacoes: Operacao[];
  /** Sem espaços nas pontas; vazio passa a null. */
  comentario: string | null;
  /** M2: lotes revertidos ([] = nenhum). */
  reverte: number[];
}

export type Lido<T> = { ok: true; valor: T } | { ok: false; erros: string[] };

/** "operacoes[2].campo" a partir do caminho do zod. */
function caminho(partes: readonly PropertyKey[]): string {
  let texto = '';
  for (const p of partes) texto += typeof p === 'number' ? `[${p}]` : `${texto ? '.' : ''}${String(p)}`;
  return texto;
}

/** Tira os repetidos e fica com os primeiros 10, mais uma linha com quantos faltam. */
export function limitarErros(erros: readonly string[]): string[] {
  const unicos = [...new Set(erros)];
  const resto = unicos.length - MAX_ERROS;
  return resto > 0 ? [...unicos.slice(0, MAX_ERROS), `… e mais ${resto}.`] : unicos;
}

/** As frases dos erros do zod ("operacoes[2].campo: …"), no máximo 10. */
function errosDoZod(erro: z.ZodError): string[] {
  return limitarErros(
    erro.issues.map((i) => (i.path.length ? `${caminho(i.path)}: ${i.message}` : i.message)),
  );
}

export function lerPedidoGuardar(corpo: unknown): Lido<PedidoGuardarValido> {
  const r = pedidoGuardar.safeParse(corpo, { error: mensagensPt });
  if (!r.success) return { ok: false, erros: errosDoZod(r.error) };
  const comentario = r.data.comentario?.trim() || null;
  return {
    ok: true,
    valor: {
      versaoBase: r.data.versaoBase,
      operacoes: r.data.operacoes as Operacao[],
      comentario,
      reverte: r.data.reverte ?? [],
    },
  };
}

/**
 * `?limite=` do histórico: inteiro maior do que zero; sem ele, 50. Acima de 200 fica 200 (quem pede mais
 * recebe os 200 mais recentes em vez de um erro). Qualquer outra coisa é null (inválido).
 */
export function lerLimiteHistorico(texto: string | undefined): number | null {
  if (texto === undefined) return LIMITE_HISTORICO.omissao;
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  return n >= 1 ? Math.min(n, LIMITE_HISTORICO.maximo) : null;
}

/** Content-Type é JSON (aceita parâmetros, ex.: "application/json; charset=utf-8"). */
export function eJson(tipo: string | undefined): boolean {
  return tipo?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

/** Nomes do próprio PC. Enquanto não há login, só páginas abertas nele podem gravar. */
const ANFITRIOES_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Cabeçalho Origin de uma página do próprio PC (http/https, qualquer porta). "null" e lixo não contam. */
export function origemLocal(origem: string): boolean {
  try {
    const url = new URL(origem);
    return (url.protocol === 'http:' || url.protocol === 'https:') && ANFITRIOES_LOCAIS.has(url.hostname);
  } catch {
    return false;
  }
}

// --- M2: geocodificação --------------------------------------------------------------------------------

const foraDaRegiao = { error: 'A posição fica fora da região do mapa.' };

const pedidoGeocodificar = z.object({
  morada: z
    .string({ error: 'Falta a morada.' })
    .trim()
    .min(1, { error: 'Escreve a morada.' })
    .max(300, { error: 'A morada tem no máximo 300 caracteres.' }),
  pais: z.enum(PAISES, { error: `O país tem de ser ${PAISES.join(', ')}.` }),
});

const pedidoGeocodificarInverso = z.object({
  lat: z
    .number({ error: 'A latitude tem de ser um número.' })
    .min(REGIAO_MAPA.sul, foraDaRegiao)
    .max(REGIAO_MAPA.norte, foraDaRegiao),
  lng: z
    .number({ error: 'A longitude tem de ser um número.' })
    .min(REGIAO_MAPA.oeste, foraDaRegiao)
    .max(REGIAO_MAPA.leste, foraDaRegiao),
});

/** POST /api/geocodificar: a morada aparada (1 a 300 caracteres) e o país. */
export function lerPedidoGeocodificar(corpo: unknown): Lido<PedidoGeocodificar> {
  const r = pedidoGeocodificar.safeParse(corpo, { error: mensagensPt });
  return r.success ? { ok: true, valor: r.data } : { ok: false, erros: errosDoZod(r.error) };
}

/** POST /api/geocodificar/inverso: uma posição dentro da região do mapa. */
export function lerPedidoGeocodificarInverso(corpo: unknown): Lido<PedidoGeocodificarInverso> {
  const r = pedidoGeocodificarInverso.safeParse(corpo, { error: mensagensPt });
  return r.success ? { ok: true, valor: r.data } : { ok: false, erros: errosDoZod(r.error) };
}
