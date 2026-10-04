// Geocodifica uma vez cada morada de dados-iniciais/locais.json e grava as coordenadas no próprio ficheiro.
// Usa o mesmo módulo do servidor (src/servidor/geocodificacao.ts): Luxemburgo → geoportail.lu; França →
// Géoplateforme (IGN); Bélgica/Alemanha → Nominatim (1 pedido/s). Fica o melhor resultado (o 1.º); os que
// caem fora da região do mapa descartam-se. Só trata locais sem coordenadas, a não ser com --forcar. O pino
// corrige-se depois à mão.
//
//   npm run geocodificar            # só os que faltam
//   npm run geocodificar -- --forcar

import { readFileSync, writeFileSync } from 'node:fs';
import { criarGeocodificador } from '../src/servidor/geocodificacao';

interface LocalInicial {
  id: string;
  consulta: string;
  pais: 'LU' | 'FR' | 'BE' | 'DE';
  lat: number | null;
  lng: number | null;
  fonte: string | null;
  [outro: string]: unknown;
}

const FICHEIRO = 'dados-iniciais/locais.json';
const AGENTE = 'MapaCMF/0.1 (geocodificacao pontual de moradas da empresa)';

const geocodificador = criarGeocodificador({ fetch: globalThis.fetch, agente: AGENTE });

const forcar = process.argv.includes('--forcar');
const locais = JSON.parse(readFileSync(FICHEIRO, 'utf8')) as LocalInicial[];
let alterados = 0;

for (const local of locais) {
  if (!forcar && local.lat !== null && local.lng !== null) continue;
  try {
    const [r] = await geocodificador.procurar(local.consulta, local.pais);
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
