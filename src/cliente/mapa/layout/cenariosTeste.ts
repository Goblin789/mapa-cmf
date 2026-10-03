// Cenários para os testes do layout com os dados reais SEM dados pessoais:
// coordenadas de dados-iniciais/locais.json, lotações de casas.json e lugares de carrinhas.json.
// Onde dorme cada carrinha depende dos passageiros (dados pessoais), por isso experimentam-se
// distribuições artificiais: 'tipica' (2–3 carrinhas por casa, as de Himeling nas duas ruas, as novas
// sem sítio, como hoje), 'roda', 'himeling' (a pior: todas em Himeling), 'grotte' e 'com-estacionamento'.

import carrinhasJson from '../../../../dados-iniciais/carrinhas.json';
import casasJson from '../../../../dados-iniciais/casas.json';
import locaisJson from '../../../../dados-iniciais/locais.json';
import type { CamadasVisiveis, CarrinhaNoMapa, CasaNoMapa, GrupoNoMapa } from './grupos';

export type Distribuicao = 'tipica' | 'roda' | 'himeling' | 'grotte' | 'com-estacionamento';

export const DISTRIBUICOES: readonly Distribuicao[] = [
  'tipica',
  'roda',
  'himeling',
  'grotte',
  'com-estacionamento',
];

interface LocalJson {
  id: string;
  tipo: string;
  nome: string;
  lat: number | null;
  lng: number | null;
}

function casaNoMapa(c: (typeof casasJson)[number]): CasaNoMapa {
  return { id: c.id, nLugares: c.lotacao };
}

/**
 * Distribuição típica (parecida com a de hoje, pela ordem de carrinhas.json): 10 carrinhas nas duas ruas
 * de Himeling, 2–3 nas outras casas, 1 em Schifflange; as duas novas, sem passageiros, ficam na doca.
 */
const TIPICA: readonly (string | null)[] = [
  'wasserbillig',
  null,
  null,
  'weiler',
  'michelbouch',
  'himeling-grotte',
  'weiler',
  'steinsel',
  'eischen',
  'himeling-foret',
  'steinsel',
  'walferdange',
  'walferdange',
  'himeling-grotte',
  'himeling-grotte',
  'michelbouch',
  'eischen',
  'schifflange',
  'himeling-grotte',
  'walferdange',
  'himeling-grotte',
  'himeling-foret',
  'himeling-foret',
  'wasserbillig',
  'himeling-grotte',
  'himeling-foret',
];

function destinoDe(distribuicao: Distribuicao, i: number, locaisCasas: readonly string[]): string | null {
  if (distribuicao === 'tipica') return TIPICA[i] ?? null;
  if (distribuicao === 'roda') return locaisCasas[i % locaisCasas.length] as string;
  if (distribuicao === 'himeling') return i % 2 === 0 ? 'himeling-grotte' : 'himeling-foret';
  if (distribuicao === 'grotte') return 'himeling-grotte';
  return i % 5 === 0 ? 'drusenheim' : (locaisCasas[i % locaisCasas.length] as string);
}

export function gruposReais(
  distribuicao: Distribuicao,
  camadas: CamadasVisiveis = { casas: true, carrinhas: true, obras: true },
): GrupoNoMapa[] {
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
      obras: [],
    });
  }
  if (camadas.casas) for (const c of casasJson) grupos.get(c.localId)?.casas.push(casaNoMapa(c));

  const locaisCasas = locais.filter((l) => l.tipo === 'casa').map((l) => l.id);
  if (camadas.carrinhas) {
    carrinhasJson.forEach((v, i) => {
      const destino = destinoDe(distribuicao, i, locaisCasas);
      if (!destino) return;
      const carrinha: CarrinhaNoMapa = { id: v.id, nLugares: v.lugares, confianca: 'sugerida' };
      grupos.get(destino)?.carrinhas.push(carrinha);
    });
  }

  return [...grupos.values()].filter((g) => g.casas.length > 0 || g.carrinhas.length > 0);
}
