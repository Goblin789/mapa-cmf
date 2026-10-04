// Dados do painel de foco e do destino da pesquisa no mapa. Funções puras.

import type { ConfiancaDormida, Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import type { Carrinha, Casa, Id, Pessoa } from '../../dominio/tipos';
import type { Foco } from '../estado/loja';
import { ROTULO_FORA_DAS_CASAS, ROTULO_SEM_OBRA, ROTULO_SEM_TRANSPORTE } from './textos';

/** A vista onde a ficha está aberta (PainelFoco): o Mapa, a Tabela ou o Quadro. */
export type VistaFicha = 'mapa' | 'tabela' | 'quadro';

/**
 * Na Tabela não há ficha da pessoa (pedido do Rafael, 04/10/2026: a linha já mostra tudo e a ficha que
 * abria era inútil; a única coisa útil, "Ver no mapa", é um botão a seguir ao nome). Uma pessoa em foco
 * na Tabela (pesquisa, nomes da ficha de uma casa) só realça a linha. No Mapa e no Quadro abre a ficha
 * completa. As fichas de casa e carrinha abrem em todas as vistas.
 */
export function haFichaDaPessoa(vista: VistaFicha): boolean {
  return vista !== 'tabela';
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
 * Carrinha: o local onde dorme. Casa: o seu local. null se não houver sítio no mapa.
 */
export function destinoNoMapa(
  foco: NonNullable<Foco>,
  ind: Pick<Indices, 'pessoas' | 'casas' | 'locais'>,
  dormidas: Map<Id, Dormida>,
): Coordenadas | null {
  if (foco.tipo === 'casa') return coordenadasDoLocal(ind.casas.get(foco.id)?.localId, ind);
  if (foco.tipo === 'carrinha') return coordenadasDaCarrinha(foco.id, ind, dormidas);
  const pessoa = ind.pessoas.get(foco.id);
  if (!pessoa) return null;
  const casa = pessoa.casaId ? ind.casas.get(pessoa.casaId) : undefined;
  return coordenadasDoLocal(casa?.localId, ind) ?? coordenadasDaCarrinha(pessoa.carrinhaId, ind, dormidas);
}
