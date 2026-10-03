// Geocodifica uma vez cada morada de dados-iniciais/locais.json e grava as coordenadas no próprio ficheiro.
// Luxemburgo: geoportail.lu. França: Géoplateforme (IGN). Bélgica/Alemanha: Nominatim (1 pedido/s).
// Só trata locais sem coordenadas, a não ser com --forcar. O pino corrige-se depois à mão.
//
//   npm run geocodificar            # só os que faltam
//   npm run geocodificar -- --forcar

import { readFileSync, writeFileSync } from 'node:fs';

interface LocalInicial {
  id: string;
  consulta: string;
  pais: 'LU' | 'FR' | 'BE' | 'DE';
  lat: number | null;
  lng: number | null;
  fonte: string | null;
  [outro: string]: unknown;
}

interface Resultado {
  lat: number;
  lng: number;
  fonte: string;
  rotulo: string;
  confianca: number;
}

const FICHEIRO = 'dados-iniciais/locais.json';
const AGENTE = 'MapaCMF/0.1 (geocodificacao pontual de moradas da empresa)';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function obterJson(url: string): Promise<unknown> {
  const resposta = await fetch(url, { headers: { 'user-agent': AGENTE, accept: 'application/json' } });
  if (!resposta.ok) throw new Error(`${resposta.status} em ${url}`);
  return resposta.json();
}

async function geoportailLu(consulta: string): Promise<Resultado | null> {
  const url = `https://apiv4.geoportail.lu/geocode/search?queryString=${encodeURIComponent(consulta)}`;
  const dados = (await obterJson(url)) as {
    results?: { address: string; ratio: number; geomlonlat: { coordinates: [number, number] } }[];
  };
  const r = dados.results?.[0];
  if (!r) return null;
  return {
    lng: r.geomlonlat.coordinates[0],
    lat: r.geomlonlat.coordinates[1],
    fonte: 'geoportail.lu',
    rotulo: r.address,
    confianca: r.ratio,
  };
}

async function ignFranca(consulta: string): Promise<Resultado | null> {
  const url = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(consulta)}&limit=1`;
  const dados = (await obterJson(url)) as {
    features?: {
      geometry: { coordinates: [number, number] };
      properties: { label: string; score: number };
    }[];
  };
  const f = dados.features?.[0];
  if (!f) return null;
  return {
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    fonte: 'IGN Géoplateforme',
    rotulo: f.properties.label,
    confianca: f.properties.score,
  };
}

async function nominatim(consulta: string, pais: string): Promise<Resultado | null> {
  await esperar(1100);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=${pais.toLowerCase()}&q=${encodeURIComponent(consulta)}`;
  const dados = (await obterJson(url)) as {
    lat: string;
    lon: string;
    display_name: string;
    importance: number;
  }[];
  const r = dados[0];
  if (!r) return null;
  return {
    lat: Number(r.lat),
    lng: Number(r.lon),
    fonte: 'Nominatim',
    rotulo: r.display_name,
    confianca: r.importance,
  };
}

async function geocodificar(local: LocalInicial): Promise<Resultado | null> {
  if (local.pais === 'LU') return geoportailLu(local.consulta);
  if (local.pais === 'FR') return ignFranca(local.consulta);
  return nominatim(local.consulta, local.pais);
}

const forcar = process.argv.includes('--forcar');
const locais = JSON.parse(readFileSync(FICHEIRO, 'utf8')) as LocalInicial[];
let alterados = 0;

for (const local of locais) {
  if (!forcar && local.lat !== null && local.lng !== null) continue;
  try {
    const r = await geocodificar(local);
    if (!r) {
      console.warn(`✗ ${local.id}: sem resultado para "${local.consulta}"`);
      continue;
    }
    local.lat = Math.round(r.lat * 1e6) / 1e6;
    local.lng = Math.round(r.lng * 1e6) / 1e6;
    local.fonte = r.fonte;
    alterados++;
    const aviso = r.confianca < 0.8 ? '  ⚠ confiança baixa: confirmar o pino' : '';
    console.log(`✓ ${local.id}: ${r.rotulo} (${r.fonte}, ${r.confianca.toFixed(2)})${aviso}`);
  } catch (e) {
    console.warn(`✗ ${local.id}: ${e instanceof Error ? e.message : e}`);
  }
}

writeFileSync(FICHEIRO, `[\n${locais.map((l) => `  ${JSON.stringify(l)}`).join(',\n')}\n]\n`);
console.log(`${alterados} local(is) atualizado(s) em ${FICHEIRO}.`);
