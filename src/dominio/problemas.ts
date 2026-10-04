// Problemas pendurados nas casas e nas carrinhas até estarem resolvidos (M2, docs/m2.md). Funções puras.
// Texto curto sobre a casa/carrinha ("esquentador avariado", "pneu furado"), aberto ou resolvido, com o dia
// em que se abriu e o dia em que se resolveu. Nunca dados pessoais nem de saúde: ao escrever há um aviso
// discreto (avisoTextoProblema). Quem abriu e quem resolveu fica no Histórico (o autor do lote).
//
// CONTRATO DO M2: as assinaturas estão fechadas.

import { LIMITES } from './campos';
import { novoId, type Operacao, operacaoCampo, operacaoCriar } from './operacoes';
import { normalizarTexto } from './pesquisa';
import type { Estado, Id, Problema } from './tipos';

/** Tamanho máximo do texto de um problema. */
export const MAX_TEXTO_PROBLEMA = LIMITES.textoProblema;

/** A casa ou a carrinha onde o problema está pendurado. */
export type AlvoProblema = { tipo: 'casa'; id: Id } | { tipo: 'carrinha'; id: Id };

/** O alvo de um problema (casa ou carrinha). */
export function alvoDoProblema(p: Problema): AlvoProblema | null {
  if (p.casaId !== null) return { tipo: 'casa', id: p.casaId };
  if (p.carrinhaId !== null) return { tipo: 'carrinha', id: p.carrinhaId };
  return null;
}

/** "casa:<id>" / "carrinha:<id>": a chave dos mapas do Indices (problemasAbertos). */
export function chaveAlvoProblema(alvo: AlvoProblema): string {
  return `${alvo.tipo}:${alvo.id}`;
}

/** Problemas da casa/carrinha: os abertos primeiro (mais recentes primeiro), depois os resolvidos. */
export function problemasDe(estado: Pick<Estado, 'problemas'>, alvo: AlvoProblema): Problema[] {
  return estado.problemas
    .filter((p) => (alvo.tipo === 'casa' ? p.casaId === alvo.id : p.carrinhaId === alvo.id))
    .sort((a, b) => {
      const abertoA = a.resolvidoEm === null ? 0 : 1;
      const abertoB = b.resolvidoEm === null ? 0 : 1;
      if (abertoA !== abertoB) return abertoA - abertoB;
      return a.abertoEm < b.abertoEm ? 1 : a.abertoEm > b.abertoEm ? -1 : 0;
    });
}

/** Problemas abertos por alvo ("casa:<id>" / "carrinha:<id>" → lista). Vai para o Indices. */
export function problemasAbertosPorAlvo(estado: Pick<Estado, 'problemas'>): Map<string, Problema[]> {
  const resultado = new Map<string, Problema[]>();
  for (const p of estado.problemas) {
    if (p.resolvidoEm !== null) continue;
    const alvo = alvoDoProblema(p);
    if (!alvo) continue;
    const chave = chaveAlvoProblema(alvo);
    const lista = resultado.get(chave);
    if (lista) lista.push(p);
    else resultado.set(chave, [p]);
  }
  return resultado;
}

/**
 * Palavras e expressões que sugerem dados de saúde (sem acentos, minúsculas; contam também no plural).
 * Lista curta de propósito, sem falsos alarmes óbvios: "baixa" só em "de baixa"/"baixa médica" (não em
 * "lotação mais baixa"), "acidente" só "acidente de trabalho" (um acidente com a carrinha é um problema
 * dela), "urgências" e não "urgência" ("com urgência").
 */
const PALAVRAS_SAUDE = [
  'doente',
  'doenca',
  'de baixa',
  'baixa medica',
  'hospital',
  'hospitalizado',
  'internado',
  'urgencias',
  'medico',
  'medica',
  'consulta',
  'clinica',
  'gravida',
  'gravidez',
  'ferido',
  'lesao',
  'lesionado',
  'fratura',
  'acidente de trabalho',
  'operado',
  'cirurgia',
  'covid',
  'gripe',
  'febre',
  'depressao',
  'psicologo',
  'psiquiatra',
  'saude',
];

/** Minúsculas, sem acentos, só letras e algarismos separados por um espaço (com espaços nas pontas). */
function palavras(texto: string): string {
  return ` ${normalizarTexto(texto)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

/** O texto (já em `palavras`) tem a expressão inteira (palavra a palavra, também no plural). */
function temExpressao(t: string, expressao: string): boolean {
  return t.includes(` ${expressao} `) || t.includes(` ${expressao}s `);
}

function temSaude(t: string): boolean {
  return PALAVRAS_SAUDE.some((p) => temExpressao(t, p));
}

/**
 * Datas escritas à mão (2026-10-01, 01.10.2026, 01-10-2026, 1/10/26): não são telefones. Só com um mês que
 * exista e sem algarismos colados antes ou depois, para não comer um pedaço de "621.12.10.56".
 */
const DATAS =
  /(?<!\d[ ./-]?)(?:\d{4}-(?:0?[1-9]|1[0-2])-\d{1,2}|\d{1,2}[./-](?:0?[1-9]|1[0-2])[./-](?:\d{4}|\d{2}))(?![ ./-]?\d)/g;

/**
 * Um número de telefone: 6 ou mais algarismos seguidos (separados só por espaços, pontos ou hífenes), sem
 * contar as datas (tiram-se antes; o resto do texto continua a contar).
 */
function temTelefone(texto: string): boolean {
  return /(?:^|[^\d])\+?\d(?:[ .-]?\d){5,}(?!\d)/.test(texto.replace(DATAS, ' '));
}

/**
 * Aviso discreto enquanto se escreve: o texto parece ter dados pessoais (o nome no mapa de uma pessoa, com 3
 * ou mais letras; um telefone, com 6 ou mais algarismos) ou de saúde. null = sem aviso. Nunca impede de
 * gravar (é só um lembrete). "Pneu furado", "janela partida" e "lotação mais baixa" não avisam.
 */
export function avisoTextoProblema(texto: string, estado: Pick<Estado, 'pessoas'>): string | null {
  const t = palavras(texto);
  if (t.trim() === '') return null;
  if (temTelefone(texto)) return 'Parece um número de telefone: o problema é sobre a casa ou a carrinha.';
  if (temSaude(t)) return 'Não escrevas dados de saúde: o problema é sobre a casa ou a carrinha.';
  const nome = estado.pessoas.find((p) => {
    const n = palavras(p.nomeCurto).trim();
    return n.replace(/[^\p{L}]/gu, '').length >= 3 && t.includes(` ${n} `);
  });
  if (nome) {
    return 'Parece o nome de uma pessoa: o problema é sobre a casa ou a carrinha, não sobre quem lá está.';
  }
  return null;
}

/**
 * Frase fixa junto ao comentário do Guardar quando o rascunho tem indisponibilidades ou problemas: o
 * comentário fica no histórico para sempre e é texto livre (a regra é nunca guardar o motivo).
 */
export const AVISO_COMENTARIO_SEM_MOTIVO = 'Não escrevas o motivo da indisponibilidade nem dados de saúde.';

/**
 * Aviso discreto para um texto livre que não é de um problema (o comentário do Guardar): só as palavras de
 * saúde, as mesmas de avisoTextoProblema (nomes de pessoas são normais num comentário). null = sem aviso.
 * Nunca impede de gravar.
 */
export function avisoTextoSaude(texto: string): string | null {
  const t = palavras(texto);
  if (t.trim() === '') return null;
  return temSaude(t) ? AVISO_COMENTARIO_SEM_MOTIVO : null;
}

/** Operação para abrir um problema novo na casa/carrinha, aberto hoje. O texto chega já aparado. */
export function operacaoNovoProblema(
  alvo: AlvoProblema,
  texto: string,
  hoje: string,
  gerar?: () => string,
): Operacao {
  return operacaoCriar('problema', {
    id: novoId('problema', gerar),
    casaId: alvo.tipo === 'casa' ? alvo.id : null,
    carrinhaId: alvo.tipo === 'carrinha' ? alvo.id : null,
    texto,
    abertoEm: hoje,
    resolvidoEm: null,
  });
}

/** Operação para resolver (dia = hoje) ou reabrir (dia = null) um problema; null se já estiver assim. */
export function operacaoResolverProblema(
  estado: Estado,
  problemaId: Id,
  dia: string | null,
): Operacao | null {
  return operacaoCampo(estado, 'problema', problemaId, 'resolvidoEm', dia);
}
