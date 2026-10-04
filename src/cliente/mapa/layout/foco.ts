// Foco: que cartões se realçam e que linhas se desenham.
// - pessoa: a casa e a carrinha dela, linha do lugar na casa ao lugar na carrinha (e daí à obra, se houver);
// - casa: linhas para as carrinhas dos moradores;
// - carrinha: linhas para as casas dos passageiros;
// - obra (M2): realça o cartão da obra e liga-o às casas e às carrinhas de quem lá trabalha ("quem vem para
//   esta obra e de onde"). Com a camada das obras desligada (sem cartão), as linhas saem do sítio da obra.
// As pontas resolvem-se com a disposição calculada (disposicao.ts), por isso ficam certas depois de
// mudar o zoom ou abrir cartões, sem medir o DOM.

import type { Indices } from '../../../dominio/indices';
import type { Id } from '../../../dominio/tipos';
import type { Foco } from '../../estado/loja';
import type { Disposicao } from './disposicao';
import {
  centro,
  contem,
  distancia,
  pontoNaBorda,
  type Retangulo,
  type Segmento,
  segmentoEntre,
} from './geometria';
import { chaveCarrinha, chaveCasa, chaveObra } from './grupos';
import { projetarArredondado } from './projecao';

export type Ponta =
  | {
      tipo: 'cartao';
      chave: string;
      lugar: number | null;
      /** Onde fica a ponta se o cartão não estiver no mapa (ex.: a obra com a camada desligada). */
      alternativa?: Ponta;
    }
  | { tipo: 'obra'; obraId: Id };

export interface Ligacao {
  de: Ponta;
  para: Ponta;
}

export interface RelacoesFoco {
  /** Cartões a realçar ("casa:<id>", "carrinha:<id>", "obra:<id>"). */
  destaques: ReadonlySet<string>;
  ligacoes: Ligacao[];
}

const SEM_RELACOES: RelacoesFoco = { destaques: new Set(), ligacoes: [] };

function indiceNaLista(lista: readonly { id: Id }[] | undefined, id: Id): number | null {
  const i = lista ? lista.findIndex((p) => p.id === id) : -1;
  return i >= 0 ? i : null;
}

export function relacoesFoco(foco: Foco, ind: Indices): RelacoesFoco {
  if (!foco) return SEM_RELACOES;

  if (foco.tipo === 'pessoa') {
    const p = ind.pessoas.get(foco.id);
    if (!p?.ativa) return SEM_RELACOES;
    const destaques = new Set<string>();
    const ligacoes: Ligacao[] = [];
    let casa: Ponta | null = null;
    let carrinha: Ponta | null = null;
    if (p.casaId && ind.casas.has(p.casaId)) {
      casa = {
        tipo: 'cartao',
        chave: chaveCasa(p.casaId),
        lugar: indiceNaLista(ind.moradores.get(p.casaId), p.id),
      };
      destaques.add(casa.chave);
    }
    if (p.carrinhaId && ind.carrinhas.has(p.carrinhaId)) {
      carrinha = {
        tipo: 'cartao',
        chave: chaveCarrinha(p.carrinhaId),
        lugar: indiceNaLista(ind.passageiros.get(p.carrinhaId), p.id),
      };
      destaques.add(carrinha.chave);
    }
    if (casa && carrinha) ligacoes.push({ de: casa, para: carrinha });
    const origemObra = carrinha ?? casa;
    if (origemObra && p.obraId && ind.obras.has(p.obraId)) {
      ligacoes.push({ de: origemObra, para: { tipo: 'obra', obraId: p.obraId } });
    }
    return { destaques, ligacoes };
  }

  if (foco.tipo === 'casa') {
    if (!ind.casas.has(foco.id)) return SEM_RELACOES;
    const de: Ponta = { tipo: 'cartao', chave: chaveCasa(foco.id), lugar: null };
    const destaques = new Set<string>([de.chave]);
    const ligacoes: Ligacao[] = [];
    for (const p of ind.moradores.get(foco.id) ?? []) {
      if (!p.carrinhaId || !ind.carrinhas.has(p.carrinhaId)) continue;
      const chave = chaveCarrinha(p.carrinhaId);
      if (destaques.has(chave)) continue;
      destaques.add(chave);
      ligacoes.push({ de, para: { tipo: 'cartao', chave, lugar: null } });
    }
    return { destaques, ligacoes };
  }

  if (foco.tipo === 'obra') return relacoesObra(foco.id, ind);

  if (!ind.carrinhas.has(foco.id)) return SEM_RELACOES;
  const de: Ponta = { tipo: 'cartao', chave: chaveCarrinha(foco.id), lugar: null };
  const destaques = new Set<string>([de.chave]);
  const ligacoes: Ligacao[] = [];
  for (const p of ind.passageiros.get(foco.id) ?? []) {
    if (!p.casaId || !ind.casas.has(p.casaId)) continue;
    const chave = chaveCasa(p.casaId);
    if (destaques.has(chave)) continue;
    destaques.add(chave);
    ligacoes.push({ de, para: { tipo: 'cartao', chave, lugar: null } });
  }
  return { destaques, ligacoes };
}

/**
 * Obra em foco: o cartão dela e, para cada casa e cada carrinha de quem lá trabalha (sem repetir), uma
 * linha da obra até lá. Primeiro as casas, depois as carrinhas, pela ordem das pessoas.
 */
function relacoesObra(obraId: Id, ind: Indices): RelacoesFoco {
  if (!ind.obras.has(obraId)) return SEM_RELACOES;
  const de: Ponta = {
    tipo: 'cartao',
    chave: chaveObra(obraId),
    lugar: null,
    alternativa: { tipo: 'obra', obraId },
  };
  const destaques = new Set<string>([de.chave]);
  const ligacoes: Ligacao[] = [];
  const ligar = (chave: string) => {
    if (destaques.has(chave)) return;
    destaques.add(chave);
    ligacoes.push({ de, para: { tipo: 'cartao', chave, lugar: null } });
  };
  const pessoas = ind.trabalhadores.get(obraId) ?? [];
  for (const p of pessoas) if (p.casaId && ind.casas.has(p.casaId)) ligar(chaveCasa(p.casaId));
  for (const p of pessoas)
    if (p.carrinhaId && ind.carrinhas.has(p.carrinhaId)) ligar(chaveCarrinha(p.carrinhaId));
  return { destaques, ligacoes };
}

interface PontaResolvida {
  retangulo: Retangulo;
  /** Um lugar ou um ponto (a linha vai ao centro); senão é um cartão (a linha para na borda). */
  exata: boolean;
  /** A ponta é o sítio desta obra (não o cartão dela): desenha-se o marcador com o nome. */
  obraId?: Id;
}

/** Onde fica uma ponta na disposição atual (píxeis do mundo); null se não estiver no mapa. */
export function resolverPonta(ponta: Ponta, d: Disposicao, ind: Indices): PontaResolvida | null {
  if (ponta.tipo === 'obra') {
    const obra = ind.obras.get(ponta.obraId);
    const local = obra ? ind.locais.get(obra.localId) : undefined;
    if (!local || local.lat === null || local.lng === null) return null;
    const p = projetarArredondado(local.lat, local.lng, d.zoom);
    return { retangulo: { x: p.x, y: p.y, largura: 0, altura: 0 }, exata: true, obraId: ponta.obraId };
  }
  const cartao = d.cartoes.get(ponta.chave);
  if (!cartao) return ponta.alternativa ? resolverPonta(ponta.alternativa, d, ind) : null;
  const lugar = ponta.lugar !== null && cartao.lugares ? cartao.lugares[ponta.lugar] : undefined;
  if (lugar) return { retangulo: lugar, exata: true };
  return { retangulo: cartao.retangulo, exata: false };
}

export interface LinhaFoco extends Segmento {
  chave: string;
  /** A ponta de chegada é esta obra (desenha-se um marcador com o nome). */
  obraId: Id | null;
  /**
   * A ponta de partida é o sítio desta obra (foco numa obra com a camada das obras desligada): desenha-se
   * o marcador na partida (o nome só na primeira linha).
   */
  obraOrigemId: Id | null;
}

const COMPRIMENTO_MINIMO = 4;

/** Segmentos das linhas de foco (píxeis do mundo). Liga lugares pelo centro e cartões pela borda. */
export function linhasFoco(relacoes: RelacoesFoco, d: Disposicao, ind: Indices): LinhaFoco[] {
  const linhas: LinhaFoco[] = [];
  relacoes.ligacoes.forEach((ligacao, i) => {
    const a = resolverPonta(ligacao.de, d, ind);
    const b = resolverPonta(ligacao.para, d, ind);
    if (!a || !b) return;
    let segmento: Segmento | null;
    if (a.exata && b.exata) {
      segmento = { de: centro(a.retangulo), para: centro(b.retangulo) };
    } else if (a.exata) {
      const pa = centro(a.retangulo);
      segmento = contem(b.retangulo, pa) ? null : { de: pa, para: pontoNaBorda(b.retangulo, pa) };
    } else if (b.exata) {
      const pb = centro(b.retangulo);
      segmento = contem(a.retangulo, pb) ? null : { de: pontoNaBorda(a.retangulo, pb), para: pb };
    } else {
      segmento = segmentoEntre(a.retangulo, b.retangulo);
    }
    if (!segmento || distancia(segmento.de, segmento.para) < COMPRIMENTO_MINIMO) return;
    linhas.push({
      ...segmento,
      chave: `ligacao-${i}`,
      obraId: b.obraId ?? null,
      obraOrigemId: a.obraId ?? null,
    });
  });
  return linhas;
}
