// Textos do fantasma: quem se está a arrastar ("Gil N. +2") e o que acontece se se largar no alvo
// debaixo do ponteiro ("Steinsel: 12 + 2 = 14/12 ▲"). Calculado sobre o estado VISÍVEL (com o rascunho).

import type { Indices } from '../../dominio/indices';
import { type NivelLotacao, ocupacaoCarrinha, ocupacaoCasa } from '../../dominio/ocupacao';
import { type Alvo, operacoesParaAlvo } from '../../dominio/operacoes';
import type { Estado, Id } from '../../dominio/tipos';
import { ESTILO_NIVEL } from '../comum/lotacao';
import { formatarMatricula } from '../comum/Matricula';
import { ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from '../paineis/textos';

export const ROTULO_SEM_OBRA_TITULO = 'Sem obra';

/** O nome que se agarrou e, levando mais pessoas, quantas mais ("+2"). */
export function partesArrastados(
  nomePrincipal: string,
  total: number,
): { nome: string; mais: string | null } {
  return { nome: nomePrincipal, mais: total > 1 ? `+${total - 1}` : null };
}

/** "Gil N." ou, levando mais pessoas, "Gil N. +2". */
export function textoArrastados(nomePrincipal: string, total: number): string {
  const { nome, mais } = partesArrastados(nomePrincipal, total);
  return mais ? `${nome} ${mais}` : nome;
}

/** Frase para os leitores de ecrã: "Gil N." / "Gil N. e mais 2 pessoas". */
export function descricaoArrastados(nomePrincipal: string, total: number): string {
  if (total <= 1) return nomePrincipal;
  return `${nomePrincipal} e mais ${total - 1 === 1 ? '1 pessoa' : `${total - 1} pessoas`}`;
}

export interface Previsao {
  /** Nome do alvo: "Steinsel", "CF 5005", "Fora das casas CMF"… */
  rotulo: string;
  /** Pessoas que lá estão agora. */
  antes: number;
  /** Quantas pessoas se estão a arrastar. */
  arrastadas: number;
  /** Das arrastadas, quantas mudam de facto (as que já lá estão não contam). */
  entram: number;
  depois: number;
  /** Lugares do alvo (casa ou carrinha); null nos grupos sem lugares e nas obras. */
  lugares: number | null;
  nivel: NivelLotacao | null;
}

function semObra(estado: Estado, ind: Pick<Indices, 'obras'>): number {
  return estado.pessoas.filter((p) => p.ativa && !(p.obraId && ind.obras.has(p.obraId))).length;
}

/** O que acontece se as pessoas `ids` forem largadas em `alvo`. null se o alvo não existir. */
export function preverLargada(estado: Estado, ind: Indices, ids: readonly Id[], alvo: Alvo): Previsao | null {
  // Só contam as ativas, como nos índices (são as únicas que ocupam lugares).
  const entram = operacoesParaAlvo(estado, ids, alvo).filter(
    (op) => ind.pessoas.get(op.pessoaId)?.ativa,
  ).length;
  const arrastadas = new Set(ids).size;
  const semLugares = (rotulo: string, antes: number): Previsao => ({
    rotulo,
    antes,
    arrastadas,
    entram,
    depois: antes + entram,
    lugares: null,
    nivel: null,
  });

  switch (alvo.tipo) {
    case 'casa': {
      const casa = ind.casas.get(alvo.id);
      if (!casa) return null;
      const antes = ind.moradores.get(casa.id)?.length ?? 0;
      const oc = ocupacaoCasa(casa, antes + entram);
      return {
        rotulo: casa.nome,
        antes,
        arrastadas,
        entram,
        depois: oc.ocupados,
        lugares: oc.lotacao,
        nivel: oc.nivel,
      };
    }
    case 'carrinha': {
      const carrinha = ind.carrinhas.get(alvo.id);
      if (!carrinha) return null;
      const antes = ind.passageiros.get(carrinha.id)?.length ?? 0;
      const oc = ocupacaoCarrinha(carrinha, antes + entram);
      return {
        rotulo: formatarMatricula(carrinha.matricula),
        antes,
        arrastadas,
        entram,
        depois: oc.ocupados,
        lugares: oc.lugares,
        nivel: oc.nivel,
      };
    }
    case 'obra': {
      const obra = ind.obras.get(alvo.id);
      return obra ? semLugares(obra.nome, ind.trabalhadores.get(obra.id)?.length ?? 0) : null;
    }
    case 'fora':
      return semLugares(ROTULO_FORA_DAS_CASAS, ind.foraDasCasas.length);
    case 'sem-transporte':
      return semLugares(ROTULO_SEM_TRANSPORTE, ind.semTransporte.length);
    case 'sem-obra':
      return semLugares(ROTULO_SEM_OBRA_TITULO, semObra(estado, ind));
  }
}

export interface PartesPrevisao {
  /** "Steinsel: 12 + 2 = " ou "Steinsel: já estão aqui". */
  texto: string;
  /** "14/12" (ou "34" sem lugares); null quando ninguém muda. */
  resultado: string | null;
  /** Símbolo do nível (○ ● ▲), quando há lugares. */
  simbolo: string | null;
}

/** A previsão em partes, para o fantasma pintar só o resultado com a cor do nível. */
export function partesPrevisao(p: Previsao): PartesPrevisao {
  if (p.entram === 0) {
    return {
      texto: `${p.rotulo}: já ${p.arrastadas === 1 ? 'está' : 'estão'} aqui`,
      resultado: null,
      simbolo: null,
    };
  }
  const resultado = p.lugares === null ? String(p.depois) : `${p.depois}/${p.lugares}`;
  return {
    texto: `${p.rotulo}: ${p.antes} + ${p.entram} = `,
    resultado,
    simbolo: p.nivel ? ESTILO_NIVEL[p.nivel].simbolo : null,
  };
}

/** A previsão numa linha: "Steinsel: 12 + 2 = 14/12 ▲". */
export function textoPrevisao(p: Previsao): string {
  const partes = partesPrevisao(p);
  if (partes.resultado === null) return partes.texto;
  return `${partes.texto}${partes.resultado}${partes.simbolo ? ` ${partes.simbolo}` : ''}`;
}

/** Para anunciar depois de largar: "2 pessoas mudadas para Steinsel." */
export function textoLargado(n: number, rotulo: string, arrastadas: number): string {
  if (n === 0) return `Nada mudou: já ${arrastadas === 1 ? 'estava' : 'estavam'} em ${rotulo}.`;
  return `${n === 1 ? '1 pessoa mudada' : `${n} pessoas mudadas`} para ${rotulo}.`;
}
