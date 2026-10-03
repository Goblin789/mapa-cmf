// Cenários para os testes do layout com os dados reais SEM dados pessoais:
// coordenadas de dados-iniciais/locais.json, lotações de casas.json (nas casas sempre cheias, os
// moradores do documento) e lugares de carrinhas.json.
// Onde dorme cada carrinha depende dos passageiros (dados pessoais), por isso experimentam-se
// distribuições artificiais: 'tipica' (2–3 carrinhas por casa, as de Himeling nas duas ruas, as novas
// sem sítio, como hoje), 'roda', 'himeling' (a pior: todas em Himeling), 'grotte' e 'com-estacionamento'.
// As distribuições vão pela matrícula (ORDEM_CENARIOS), não pela posição em carrinhas.json: assim os
// cenários não mudam quando a frota é reordenada; os veículos novos vão para o fim.

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
  // Uma casa sempre cheia desenha só os lugares dos moradores (ocupacaoCasa).
  return { id: c.id, nLugares: 'sempreCheia' in c && c.sempreCheia ? c.moradoresDoc : c.lotacao };
}

/**
 * Distribuição típica (parecida com a de 03/10/2026): 10 carrinhas nas duas ruas de Himeling, 2–3 nas
 * outras casas, 1 em Schifflange; as duas novas, sem passageiros, ficam na doca. Por id do veículo; a
 * ordem destas linhas é a ORDEM_CENARIOS das outras distribuições.
 */
const TIPICA: readonly (readonly [string, string | null])[] = [
  ['CF5001', 'wasserbillig'],
  ['CF5003', null],
  ['CF5005', null],
  ['CF5006', 'weiler'],
  ['CF5007', 'michelbouch'],
  ['CF5008', 'himeling-grotte'],
  ['CF5009', 'weiler'],
  ['CF5010', 'steinsel'],
  ['CF5011', 'eischen'],
  ['CU5655', 'himeling-foret'],
  ['CV6813', 'steinsel'],
  ['DH9250', 'walferdange'],
  ['DS4264', 'walferdange'],
  ['KG4549', 'himeling-grotte'],
  ['LN8786', 'himeling-grotte'],
  ['LR6976', 'michelbouch'],
  ['LT4701', 'eischen'],
  ['NQ6505', 'schifflange'],
  ['QM9530', 'himeling-grotte'],
  ['SF4680', 'walferdange'],
  ['SZ7564', 'himeling-grotte'],
  ['TD4512', 'himeling-foret'],
  ['YT7579', 'himeling-foret'],
  ['VG9733', 'wasserbillig'],
  ['XN4293', 'himeling-grotte'],
  ['YF6656', 'himeling-foret'],
];

const DESTINO_TIPICO = new Map(TIPICA);
const ORDEM_CENARIOS = new Map(TIPICA.map(([id], i) => [id, i]));

/** Os veículos de carrinhas.json pela ORDEM_CENARIOS (os que não estão lá vão para o fim, pela ordem do JSON). */
function veiculosPelaOrdemDosCenarios() {
  const fora = TIPICA.length;
  return carrinhasJson
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (ORDEM_CENARIOS.get(a.v.id) ?? fora + a.i) - (ORDEM_CENARIOS.get(b.v.id) ?? fora + b.i))
    .map(({ v }) => v);
}

function destinoDe(
  distribuicao: Distribuicao,
  id: string,
  i: number,
  locaisCasas: readonly string[],
): string | null {
  if (distribuicao === 'tipica') return DESTINO_TIPICO.get(id) ?? null;
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
    veiculosPelaOrdemDosCenarios().forEach((v, i) => {
      const destino = destinoDe(distribuicao, v.id, i, locaisCasas);
      if (!destino) return;
      const carrinha: CarrinhaNoMapa = {
        id: v.id,
        tipo: v.tipo === 'carro' ? 'carro' : 'carrinha',
        nLugares: v.lugares,
        confianca: 'sugerida',
      };
      grupos.get(destino)?.carrinhas.push(carrinha);
    });
  }

  return [...grupos.values()].filter((g) => g.casas.length > 0 || g.carrinhas.length > 0);
}
