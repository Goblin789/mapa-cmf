// Cenários para os testes do layout com os dados reais SEM dados pessoais:
// coordenadas de dados-iniciais/locais.json, lotações de casas.json e lugares de carrinhas.json.
// Onde dorme cada carrinha depende dos passageiros (dados pessoais), por isso experimentam-se
// distribuições artificiais, incluindo a pior: todas as carrinhas em Himeling.

import carrinhasJson from '../../../../dados-iniciais/carrinhas.json';
import casasJson from '../../../../dados-iniciais/casas.json';
import locaisJson from '../../../../dados-iniciais/locais.json';
import type { CarrinhaNoMapa, CasaNoMapa, GrupoNoMapa } from './grupos';

export type Distribuicao = 'roda' | 'himeling' | 'grotte' | 'com-estacionamento';

export const DISTRIBUICOES: readonly Distribuicao[] = ['roda', 'himeling', 'grotte', 'com-estacionamento'];

interface LocalJson {
  id: string;
  tipo: string;
  nome: string;
  lat: number | null;
  lng: number | null;
}

function casaNoMapa(c: (typeof casasJson)[number]): CasaNoMapa {
  return { id: c.id, nLugares: c.lotacao, comAviso: c.maxContrato !== null && c.lotacao > c.maxContrato };
}

export function gruposReais(distribuicao: Distribuicao): GrupoNoMapa[] {
  const locais = (locaisJson as LocalJson[]).filter((l) => l.lat !== null && l.lng !== null);
  const grupos = new Map<string, GrupoNoMapa>();
  for (const l of locais) {
    grupos.set(l.id, {
      localId: l.id,
      nome: l.nome,
      lat: l.lat as number,
      lng: l.lng as number,
      casas: [],
      carrinhas: [],
    });
  }
  for (const c of casasJson) grupos.get(c.localId)?.casas.push(casaNoMapa(c));

  const locaisCasas = locais.filter((l) => l.tipo === 'casa').map((l) => l.id);
  carrinhasJson.forEach((v, i) => {
    let destino: string;
    if (distribuicao === 'roda') destino = locaisCasas[i % locaisCasas.length] as string;
    else if (distribuicao === 'himeling') destino = i % 2 === 0 ? 'himeling-grotte' : 'himeling-foret';
    else if (distribuicao === 'grotte') destino = 'himeling-grotte';
    else destino = i % 5 === 0 ? 'drusenheim' : (locaisCasas[i % locaisCasas.length] as string);
    const carrinha: CarrinhaNoMapa = { id: v.id, nLugares: v.lugares, confianca: 'sugerida' };
    grupos.get(destino)?.carrinhas.push(carrinha);
  });

  return [...grupos.values()].filter((g) => g.casas.length > 0 || g.carrinhas.length > 0);
}

/** Todas as chaves de cartões (para o cenário "tudo aberto à mão"). */
export function todasAsChaves(grupos: readonly GrupoNoMapa[]): Set<string> {
  const chaves = new Set<string>();
  for (const g of grupos) {
    chaves.add(`grupo:${g.localId}`);
    for (const c of g.casas) chaves.add(`casa:${c.id}`);
    for (const c of g.carrinhas) chaves.add(`carrinha:${c.id}`);
  }
  return chaves;
}
