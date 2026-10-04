// Problemas pendurados nas casas e nas carrinhas até estarem resolvidos (M2, docs/m2.md). Funções puras.
// Texto curto sobre a casa/carrinha ("esquentador avariado", "pneu furado"), aberto ou resolvido, com o dia
// em que se abriu e o dia em que se resolveu. Nunca dados pessoais nem de saúde: ao escrever há um aviso
// discreto (avisoTextoProblema). Quem abriu e quem resolveu fica no Histórico (o autor do lote).
//
// CONTRATO DO M2: as assinaturas estão fechadas; o módulo base escreve os testes e afina a heurística.

import { novoId, type Operacao, operacaoCampo, operacaoCriar } from './operacoes';
import { normalizarTexto } from './pesquisa';
import type { Estado, Id, Problema } from './tipos';

/** Tamanho máximo do texto de um problema. */
export const MAX_TEXTO_PROBLEMA = 120;

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

/** Palavras que sugerem dados de saúde (sem acentos, minúsculas). Lista curta de propósito. */
const PALAVRAS_SAUDE = [
  'doente',
  'doenca',
  'baixa',
  'hospital',
  'medico',
  'medica',
  'consulta',
  'gravida',
  'ferido',
  'acidente de trabalho',
  'operado',
  'operacao',
  'covid',
];

/**
 * Aviso discreto enquanto se escreve: o texto parece ter dados pessoais (o nome de uma pessoa, um telefone)
 * ou de saúde. null = sem aviso. Nunca impede de gravar (é só um lembrete).
 * CONTRATO DO M2 (módulo base): afinar e testar (nomes curtos com 3+ letras, telefones com 6+ algarismos).
 */
export function avisoTextoProblema(texto: string, estado: Pick<Estado, 'pessoas'>): string | null {
  const t = ` ${normalizarTexto(texto)} `;
  if (t.trim() === '') return null;
  if (/\d[\d\s]{5,}\d/.test(texto))
    return 'Parece um número de telefone: o problema é sobre a casa ou a carrinha.';
  if (PALAVRAS_SAUDE.some((p) => t.includes(` ${p} `) || t.includes(` ${p}`))) {
    return 'Não escrevas dados de saúde: o problema é sobre a casa ou a carrinha.';
  }
  const nome = estado.pessoas.find((p) => {
    const n = normalizarTexto(p.nomeCurto);
    return n.length >= 3 && t.includes(` ${n} `);
  });
  if (nome)
    return 'Parece o nome de uma pessoa: o problema é sobre a casa ou a carrinha, não sobre quem lá está.';
  return null;
}

/**
 * Frase fixa junto ao comentário do Guardar quando o rascunho tem indisponibilidades ou problemas: o
 * comentário fica no histórico para sempre e é texto livre (a regra é nunca guardar o motivo).
 */
export const AVISO_COMENTARIO_SEM_MOTIVO = 'Não escrevas o motivo da indisponibilidade nem dados de saúde.';

/**
 * Aviso discreto para um texto livre que não é de um problema (o comentário do Guardar): só as palavras de
 * saúde (nomes de pessoas são normais num comentário). null = sem aviso. Nunca impede de gravar.
 * CONTRATO DO M2 (módulo base): afinar com avisoTextoProblema (mesma lista, sem falsos alarmes óbvios).
 */
export function avisoTextoSaude(texto: string): string | null {
  const t = ` ${normalizarTexto(texto)} `;
  if (t.trim() === '') return null;
  return PALAVRAS_SAUDE.some((p) => t.includes(` ${p} `)) ? AVISO_COMENTARIO_SEM_MOTIVO : null;
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
