// Dados do painel de foco, do resumo das casas e do destino da pesquisa no mapa. Funções puras.

import type { ConfiancaDormida, Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { type OcupacaoCasa, ocupacaoCasa } from '../../dominio/ocupacao';
import { normalizarTexto } from '../../dominio/pesquisa';
import type { Carrinha, Casa, Id, Pessoa } from '../../dominio/tipos';
import type { Foco } from '../estado/loja';
import {
  nomeCompleto,
  ROTULO_FORA_DAS_CASAS,
  ROTULO_SEM_OBRA,
  ROTULO_SEM_TRANSPORTE,
  textoCarta,
  textoTelefone,
} from './textos';

/** A vista onde a ficha está aberta (PainelFoco): o Mapa, a Tabela ou o Quadro. */
export type VistaFicha = 'mapa' | 'tabela' | 'quadro';

/**
 * Na Tabela a ficha da pessoa é compacta: a linha já mostra o Nº, o cliente e a casa → carrinha → obra (e,
 * no modo de edição, as listas e o botão do condutor), por isso a ficha só tem o que a linha não tem. No
 * Mapa e no Quadro é a ficha completa. As fichas de casa e carrinha são sempre completas.
 */
export function fichaPessoaCompacta(vista: VistaFicha): boolean {
  return vista === 'tabela';
}

/** O que a ficha compacta da pessoa mostra: só o que existe (null = não há dados; não se mostra). */
export interface ExtrasPessoa {
  /**
   * "no mapa: Zé T.", quando o nome do mapa não é o nome completo (sem contar acentos nem maiúsculas: "Ze
   * Teste" ao lado de "Zé Teste" era repetir a linha).
   */
  nomeNoMapa: string | null;
  telefone: string | null;
  /** O texto da carta, quando se sabe se tem ("Não tem", "Tem, válida até …", "Caducou a …"). */
  carta: string | null;
}

export function extrasDaPessoa(p: Pessoa, hoje: string): ExtrasPessoa {
  return {
    nomeNoMapa: normalizarTexto(p.nomeCurto) !== normalizarTexto(nomeCompleto(p)) ? p.nomeCurto : null,
    telefone: p.telefone?.trim() ? textoTelefone(p) : null,
    carta: p.temCarta === null ? null : textoCarta(p, hoje),
  };
}

/**
 * A ficha compacta só tem corpo quando há o que mostrar (o aviso de quem conduz sem carta, o telefone ou a
 * carta). Sem nada, fica só o cabeçalho: uma linha "sem dados" igual em todas as pessoas era repetir.
 */
export function fichaCompactaTemCorpo(extras: ExtrasPessoa, conduzSemCarta: boolean): boolean {
  return conduzSemCarta || extras.telefone !== null || extras.carta !== null;
}

export interface ElementoCadeia {
  tipo: 'casa' | 'carrinha' | 'obra';
  /** null quando a pessoa não tem (grupo especial ou sem obra). */
  id: Id | null;
  rotulo: string;
  aConfirmar: boolean;
}

/** A linha casa → carrinha → obra de uma pessoa. */
export function cadeiaDaPessoa(p: Pessoa, ind: Indices): ElementoCadeia[] {
  const casa = p.casaId ? ind.casas.get(p.casaId) : undefined;
  const carrinha = p.carrinhaId ? ind.carrinhas.get(p.carrinhaId) : undefined;
  const obra = p.obraId ? ind.obras.get(p.obraId) : undefined;
  return [
    {
      tipo: 'casa',
      id: casa?.id ?? null,
      rotulo: casa?.nome ?? ROTULO_FORA_DAS_CASAS,
      aConfirmar: p.casaAConfirmar,
    },
    {
      tipo: 'carrinha',
      id: carrinha?.id ?? null,
      rotulo: carrinha?.matricula ?? ROTULO_SEM_TRANSPORTE,
      aConfirmar: p.carrinhaAConfirmar,
    },
    { tipo: 'obra', id: obra?.id ?? null, rotulo: obra?.nome ?? ROTULO_SEM_OBRA, aConfirmar: false },
  ];
}

export interface ContagemCasa {
  casa: Casa;
  n: number;
}

/** De que casas vêm estas pessoas (mais pessoas primeiro) e quantas estão fora das casas. */
export function casasDasPessoas(
  pessoas: Pessoa[],
  ind: Pick<Indices, 'casas'>,
): { casas: ContagemCasa[]; semCasa: number } {
  const contagem = new Map<Id, number>();
  let semCasa = 0;
  for (const p of pessoas) {
    if (p.casaId && ind.casas.has(p.casaId)) contagem.set(p.casaId, (contagem.get(p.casaId) ?? 0) + 1);
    else semCasa++;
  }
  const casas = [...contagem]
    .flatMap(([id, n]) => {
      const casa = ind.casas.get(id);
      return casa ? [{ casa, n }] : [];
    })
    .sort((a, b) => b.n - a.n || a.casa.ordem - b.casa.ordem);
  return { casas, semCasa };
}

export interface ContagemCarrinha {
  carrinha: Carrinha;
  n: number;
}

/** Que carrinhas estas pessoas usam (mais pessoas primeiro) e quantas estão sem transporte. */
export function carrinhasDasPessoas(
  pessoas: Pessoa[],
  ind: Pick<Indices, 'carrinhas'>,
): { carrinhas: ContagemCarrinha[]; semCarrinha: number } {
  const contagem = new Map<Id, number>();
  let semCarrinha = 0;
  for (const p of pessoas) {
    if (p.carrinhaId && ind.carrinhas.has(p.carrinhaId)) {
      contagem.set(p.carrinhaId, (contagem.get(p.carrinhaId) ?? 0) + 1);
    } else semCarrinha++;
  }
  const carrinhas = [...contagem]
    .flatMap(([id, n]) => {
      const carrinha = ind.carrinhas.get(id);
      return carrinha ? [{ carrinha, n }] : [];
    })
    .sort((a, b) => b.n - a.n || a.carrinha.ordem - b.carrinha.ordem);
  return { carrinhas, semCarrinha };
}

/** Carrinhas que dormem numa casa (definida ou sugerida), pela ordem das carrinhas. */
export function carrinhasQueDormemEm(
  casaId: Id,
  ind: Pick<Indices, 'carrinhas'>,
  dormidas: Map<Id, Dormida>,
): { carrinha: Carrinha; confianca: ConfiancaDormida }[] {
  const resultado: { carrinha: Carrinha; confianca: ConfiancaDormida }[] = [];
  for (const d of dormidas.values()) {
    if (d.casaId !== casaId) continue;
    const carrinha = ind.carrinhas.get(d.carrinhaId);
    if (carrinha) resultado.push({ carrinha, confianca: d.confianca });
  }
  return resultado.sort((a, b) => a.carrinha.ordem - b.carrinha.ordem);
}

export interface ResumoCasa {
  casa: Casa;
  ocupacao: OcupacaoCasa;
}

/**
 * Para o contador "Livres nas casas": as casas com lugares livres (mais livres primeiro) e as que
 * passam o máximo do contrato (primeiro as acima do tolerado). Pela ordem das casas nos empates.
 */
export function resumoDasCasas(
  casas: Casa[],
  ind: Pick<Indices, 'moradores'>,
): { comLivres: ResumoCasa[]; acimaContrato: ResumoCasa[] } {
  const todas = [...casas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((casa) => ({ casa, ocupacao: ocupacaoCasa(casa, ind.moradores.get(casa.id)?.length ?? 0) }));
  const gravidade = (r: ResumoCasa) => (r.ocupacao.aviso === 'acima_tolerado' ? 0 : 1);
  return {
    comLivres: todas
      .filter((r) => r.ocupacao.livres > 0)
      .sort((a, b) => b.ocupacao.livres - a.ocupacao.livres),
    acimaContrato: todas
      .filter((r) => r.ocupacao.aviso === 'acima_maximo' || r.ocupacao.aviso === 'acima_tolerado')
      .sort((a, b) => gravidade(a) - gravidade(b)),
  };
}

/** Zoom do mapa ao ir para uma pessoa, casa ou carrinha. */
export const ZOOM_DESTINO = 13;

export interface Coordenadas {
  lat: number;
  lng: number;
}

export function coordenadasDoLocal(
  localId: Id | null | undefined,
  ind: Pick<Indices, 'locais'>,
): Coordenadas | null {
  const local = localId ? ind.locais.get(localId) : undefined;
  if (!local || local.lat === null || local.lng === null) return null;
  return { lat: local.lat, lng: local.lng };
}

function coordenadasDaCarrinha(
  carrinhaId: Id | null,
  ind: Pick<Indices, 'locais'>,
  dormidas: Map<Id, Dormida>,
): Coordenadas | null {
  return carrinhaId ? coordenadasDoLocal(dormidas.get(carrinhaId)?.localId, ind) : null;
}

/**
 * Para onde o mapa vai quando se escolhe algo na pesquisa.
 * Pessoa: o local da casa; sem casa (ou casa sem coordenadas), o local onde dorme a carrinha.
 * Carrinha: o local onde dorme. Casa: o seu local. Obra (M2): o seu local. null se não houver sítio no mapa.
 */
export function destinoNoMapa(
  foco: NonNullable<Foco>,
  ind: Pick<Indices, 'pessoas' | 'casas' | 'locais'> & Partial<Pick<Indices, 'obras'>>,
  dormidas: Map<Id, Dormida>,
): Coordenadas | null {
  if (foco.tipo === 'casa') return coordenadasDoLocal(ind.casas.get(foco.id)?.localId, ind);
  if (foco.tipo === 'carrinha') return coordenadasDaCarrinha(foco.id, ind, dormidas);
  if (foco.tipo === 'obra') return coordenadasDoLocal(ind.obras?.get(foco.id)?.localId, ind);
  const pessoa = ind.pessoas.get(foco.id);
  if (!pessoa) return null;
  const casa = pessoa.casaId ? ind.casas.get(pessoa.casaId) : undefined;
  return coordenadasDoLocal(casa?.localId, ind) ?? coordenadasDaCarrinha(pessoa.carrinhaId, ind, dormidas);
}
