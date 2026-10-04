// Geocodificação no servidor (M2, docs/m2.md, "Geocodificação"): a morada escrita → posições possíveis, e
// um ponto clicado no mapa → a morada. Luxemburgo: geoportail.lu; França: IGN (Géoplateforme); Bélgica e
// Alemanha: Nominatim (OSM; User-Agent próprio, no máximo 1 pedido por segundo). O browser nunca fala com
// estes serviços: pede ao servidor (POST /api/geocodificar e /api/geocodificar/inverso).
// Os testes usam SEMPRE um `fetch` falso; os serviços verdadeiros só num ensaio pontual à mão.
//
// CONTRATO DO M2: a interface `Geocodificador`, o `ErroGeocodificacao` e a assinatura de
// `criarGeocodificador` estão fechados. As rotas (app.ts, módulo base) usam só a interface; a implementação
// dos serviços é do módulo "historico-moradas".
//
// - procurar(morada, país): até 5 resultados, o melhor primeiro (pela confiança). LU → geoportail.lu
//   (/geocode/search); FR → IGN (/geocodage/search); BE e DE → Nominatim (/search, só nesse país).
// - inverso(lat, lng): o Nominatim (/reverse) diz o país; no Luxemburgo a morada vem do geoportail
//   (/geocode/reverse) e em França do IGN (/geocodage/reverse); na Bélgica e na Alemanha fica a do Nominatim.
//   Se o geoportail ou o IGN falharem ou não acharem nada, fica a do Nominatim.
// - Confiança de 0 a 1: geoportail → `ratio`; IGN → `score`; Nominatim → pelo `place_rank` (30, um edifício:
//   0,9; 26–29, uma rua: 0,7; menos: 0,5), porque a `importance` dele não diz se a morada é exata. No inverso,
//   pela distância entre o ponto e a morada achada (até 25 m: 1). Abaixo de 0,8 o ecrã pede para confirmar.
// - Resultados fora de REGIAO_MAPA descartam-se (o mapa não deixa lá ir). No inverso, se o ponto da morada
//   estiver fora, fica o ponto clicado.
// - Cada pedido tem um tempo limite (8 s; AbortController) → ErroGeocodificacao('tempo'); HTTP de erro, falha
//   de rede ou resposta que não se percebe → 'servico'. As mensagens NUNCA levam a morada nem o endereço
//   pedido (o endereço tem a morada). No Nominatim, os 8 s contam desde que o pedido entra na fila: quem
//   arrasta o pino várias vezes não fica com respostas cada vez mais atrasadas (os pedidos que já esperaram
//   demais saem com 'tempo' sem chegar a ir ao serviço).
// - Inverso com o Nominatim em baixo: se o ponto estiver no retângulo do Luxemburgo, pergunta-se diretamente
//   ao geoportail; a morada só fica se estiver a menos de 150 m do ponto (o retângulo apanha bocados da
//   Bélgica, como Arlon). Senão, o erro do Nominatim.

import type { ResultadoGeocodificacao } from '../dominio/api';
import { dentroDaRegiao } from '../dominio/campos';
import { PAISES, type Pais } from '../dominio/tipos';

/** O que as rotas usam. */
export interface Geocodificador {
  /** Até 5 resultados, o melhor primeiro ([] = nada encontrado). Lança ErroGeocodificacao. */
  procurar(morada: string, pais: Pais): Promise<ResultadoGeocodificacao[]>;
  /** A morada de um ponto (null = o serviço não encontrou nenhuma). Lança ErroGeocodificacao. */
  inverso(lat: number, lng: number): Promise<ResultadoGeocodificacao | null>;
}

/**
 * Falha de um serviço de moradas. 'tempo' = não respondeu a tempo (8 s); 'servico' = respondeu com erro ou
 * com uma resposta que não se percebe; 'desligado' = não há geocodificador. A mensagem nunca leva a morada.
 */
export class ErroGeocodificacao extends Error {
  readonly tipo: 'tempo' | 'servico' | 'desligado';
  constructor(tipo: 'tempo' | 'servico' | 'desligado', mensagem: string) {
    super(mensagem);
    this.name = 'ErroGeocodificacao';
    this.tipo = tipo;
  }
}

export interface OpcoesGeocodificador {
  /** O fetch a usar (o global no index.ts; um falso nos testes). */
  fetch: typeof fetch;
  /** User-Agent dos pedidos (o Nominatim exige um que identifique a aplicação). */
  agente: string;
  /** Para a fila do Nominatim (1 pedido/s); nos testes, uma que não espera. */
  esperar?: (ms: number) => Promise<void>;
  /** Tempo limite de cada pedido, em ms (omissão: 8000). */
  limiteMs?: number;
}

/** Endereços dos serviços (sem a parte do pedido). */
export const SERVICOS = {
  geoportail: 'https://apiv4.geoportail.lu/geocode',
  ign: 'https://data.geopf.fr/geocodage',
  nominatim: 'https://nominatim.openstreetmap.org',
} as const;

/** Tempo limite de cada pedido, por omissão (ms). */
export const LIMITE_MS_OMISSAO = 8000;
/** Intervalo mínimo entre dois pedidos ao Nominatim (a política de uso dele: no máximo 1 por segundo). */
export const INTERVALO_NOMINATIM_MS = 1000;
/** Quantos resultados devolve `procurar`. */
export const MAX_RESULTADOS = 5;
/** Retângulo do Luxemburgo, para o recurso ao geoportail quando o Nominatim falha no inverso. */
export const RETANGULO_LU = { latMin: 49.44, latMax: 50.19, lngMin: 5.73, lngMax: 6.54 } as const;
/** No recurso ao geoportail, a morada achada tem de estar a menos disto do ponto (m). */
export const DISTANCIA_RECURSO_LU_M = 150;

function noRetanguloLu(lat: number, lng: number): boolean {
  const r = RETANGULO_LU;
  return lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax;
}

const FONTE = { geoportail: 'geoportail.lu', ign: 'IGN Géoplateforme', nominatim: 'Nominatim' } as const;
type Servico = keyof typeof FONTE;

// --- Leitura defensiva das respostas -------------------------------------------------------------------

type Objeto = Record<string, unknown>;

function eObjeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * A morada como o serviço a deu, sem vírgulas soltas: o geoportail, sem nº de porta, devolve
 * ", Place X 1648 Luxembourg".
 */
export function limparRotulo(rotulo: string): string {
  return rotulo
    .replace(/(\s*,)+/g, ',')
    .replace(/,(?=\S)/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .replace(/\s{2,}/g, ' ');
}

function limitar(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** [lng, lat] de um ponto GeoJSON. */
function pontoGeoJson(v: unknown): { lat: number; lng: number } | null {
  if (!eObjeto(v) || !Array.isArray(v.coordinates)) return null;
  const lng = numero(v.coordinates[0]);
  const lat = numero(v.coordinates[1]);
  return lat === null || lng === null ? null : { lat, lng };
}

function naoSePercebe(servico: Servico): ErroGeocodificacao {
  return new ErroGeocodificacao('servico', `O ${FONTE[servico]} deu uma resposta que não se percebe.`);
}

/** Confiança de uma morada achada no inverso, pela distância (m) ao ponto clicado; sem distância, 0,8. */
export function confiancaPelaDistancia(distancia: number | null): number {
  if (distancia === null) return 0.8;
  if (distancia <= 25) return 1;
  return Math.max(0.2, Math.round(limitar(1 - (distancia - 25) / 200) * 100) / 100);
}

/** Confiança de um resultado do Nominatim, pelo `place_rank` (30 = um edifício; 26–29 = uma rua). */
export function confiancaNominatim(placeRank: number | null): number {
  if (placeRank === null) return 0.5;
  if (placeRank >= 30) return 0.9;
  if (placeRank >= 26) return 0.7;
  return 0.5;
}

function resultadoGeoportail(r: unknown, pais: Pais): ResultadoGeocodificacao | null {
  if (!eObjeto(r)) return null;
  const ponto = pontoGeoJson(r.geomlonlat);
  const bruto = texto(r.address) ?? texto(r.name);
  const rotulo = bruto === null ? null : texto(limparRotulo(bruto));
  if (!ponto || !rotulo) return null;
  return { rotulo, ...ponto, pais, fonte: FONTE.geoportail, confianca: limitar(numero(r.ratio) ?? 0.5) };
}

function resultadoIgn(f: unknown, pais: Pais, confianca?: number): ResultadoGeocodificacao | null {
  if (!eObjeto(f) || !eObjeto(f.properties)) return null;
  const ponto = pontoGeoJson(f.geometry);
  const rotulo = texto(f.properties.label);
  if (!ponto || !rotulo) return null;
  return {
    rotulo,
    ...ponto,
    pais,
    fonte: FONTE.ign,
    confianca: confianca ?? limitar(numero(f.properties.score) ?? 0.5),
  };
}

function resultadoNominatim(r: unknown, pais: Pais): ResultadoGeocodificacao | null {
  if (!eObjeto(r)) return null;
  const lat = numero(r.lat);
  const lng = numero(r.lon);
  const rotulo = texto(r.display_name);
  if (lat === null || lng === null || !rotulo) return null;
  return {
    rotulo,
    lat,
    lng,
    pais,
    fonte: FONTE.nominatim,
    confianca: confiancaNominatim(numero(r.place_rank)),
  };
}

/** "12 Rue X, L-1234 Luxembourg" a partir das partes do reverse do geoportail (ou o `name`, se faltarem). */
function rotuloGeoportailInverso(r: Objeto): string | null {
  const rua = texto(r.street);
  if (!rua) {
    const bruto = texto(r.name) ?? texto(r.address);
    return bruto === null ? null : texto(limparRotulo(bruto));
  }
  const numeroPorta = texto(r.number);
  const codigo = texto(r.postal_code);
  const localidade = texto(r.locality);
  const linha1 = numeroPorta ? `${numeroPorta} ${rua}` : rua;
  const linha2 = [codigo ? `L-${codigo}` : null, localidade].filter(Boolean).join(' ');
  return linha2 ? `${linha1}, ${linha2}` : linha1;
}

/** Ordena pela confiança (o melhor primeiro; os iguais ficam pela ordem do serviço), só na região, até 5. */
function melhores(lista: readonly (ResultadoGeocodificacao | null)[]): ResultadoGeocodificacao[] {
  return lista
    .filter((r): r is ResultadoGeocodificacao => r !== null && dentroDaRegiao(r.lat, r.lng))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.confianca - a.r.confianca || a.i - b.i)
    .slice(0, MAX_RESULTADOS)
    .map(({ r }) => r);
}

function ePais(v: string): v is Pais {
  return (PAISES as readonly string[]).includes(v);
}

// --- O geocodificador ----------------------------------------------------------------------------------

export function criarGeocodificador(opcoes: OpcoesGeocodificador): Geocodificador {
  const buscar = opcoes.fetch;
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limiteMs = opcoes.limiteMs ?? LIMITE_MS_OMISSAO;
  const cabecalhos = { 'user-agent': opcoes.agente, accept: 'application/json' };

  const tempoEsgotado = (servico: Servico) =>
    new ErroGeocodificacao('tempo', `O ${FONTE[servico]} não respondeu em ${limiteMs / 1000} s.`);

  /**
   * GET com tempo limite (`limite`: o que resta dos `limiteMs`); devolve o JSON. Os erros nunca levam o
   * endereço (tem a morada).
   */
  async function obterJson(servico: Servico, url: string, limite = limiteMs): Promise<unknown> {
    const controlo = new AbortController();
    const temporizador = setTimeout(() => controlo.abort(), limite);
    try {
      const resposta = await buscar(url, { headers: cabecalhos, signal: controlo.signal });
      if (!resposta.ok) {
        throw new ErroGeocodificacao(
          'servico',
          `O ${FONTE[servico]} respondeu com o erro ${resposta.status}.`,
        );
      }
      const corpo = await resposta.text();
      try {
        return JSON.parse(corpo) as unknown;
      } catch {
        throw naoSePercebe(servico);
      }
    } catch (e) {
      if (e instanceof ErroGeocodificacao) throw e;
      if (controlo.signal.aborted) throw tempoEsgotado(servico);
      throw new ErroGeocodificacao('servico', `Não foi possível falar com o ${FONTE[servico]}.`);
    } finally {
      clearTimeout(temporizador);
    }
  }

  // Fila do Nominatim: um pedido de cada vez e pelo menos 1 s entre o início de um e o do seguinte. O tempo
  // limite conta desde a entrada na fila: quem já esperou os 8 s sai com 'tempo' sem ir ao serviço (e não
  // ocupa a vez dos seguintes).
  let fila: Promise<unknown> = Promise.resolve();
  let ultimoNominatim: number | null = null;
  function nominatim(caminho: string): Promise<unknown> {
    const entrou = Date.now();
    const vez = fila.then(async () => {
      if (ultimoNominatim !== null) {
        const falta = INTERVALO_NOMINATIM_MS - (Date.now() - ultimoNominatim);
        if (falta > 0) await esperar(falta);
      }
      const resta = limiteMs - (Date.now() - entrou);
      if (resta <= 0) throw tempoEsgotado('nominatim');
      ultimoNominatim = Date.now();
      return obterJson('nominatim', `${SERVICOS.nominatim}${caminho}`, resta);
    });
    fila = vez.catch(() => undefined);
    return vez;
  }

  async function procurarLu(morada: string): Promise<ResultadoGeocodificacao[]> {
    const dados = await obterJson(
      'geoportail',
      `${SERVICOS.geoportail}/search?queryString=${encodeURIComponent(morada)}`,
    );
    if (!eObjeto(dados) || !Array.isArray(dados.results)) throw naoSePercebe('geoportail');
    return melhores(dados.results.map((r) => resultadoGeoportail(r, 'LU')));
  }

  async function procurarFr(morada: string): Promise<ResultadoGeocodificacao[]> {
    const dados = await obterJson(
      'ign',
      `${SERVICOS.ign}/search?q=${encodeURIComponent(morada)}&limit=${MAX_RESULTADOS}`,
    );
    if (!eObjeto(dados) || !Array.isArray(dados.features)) throw naoSePercebe('ign');
    return melhores(dados.features.map((f) => resultadoIgn(f, 'FR')));
  }

  async function procurarNominatim(morada: string, pais: 'BE' | 'DE'): Promise<ResultadoGeocodificacao[]> {
    const dados = await nominatim(
      `/search?format=jsonv2&countrycodes=${pais.toLowerCase()}&limit=${MAX_RESULTADOS}&q=${encodeURIComponent(morada)}`,
    );
    if (!Array.isArray(dados)) throw naoSePercebe('nominatim');
    return melhores(dados.map((r) => resultadoNominatim(r, pais)));
  }

  /**
   * A morada do geoportail para um ponto no Luxemburgo (null se não achar). `distanciaMax`: só aceita uma
   * morada a menos disto do ponto (m; sem a distância na resposta, recusa). É para o recurso sem o Nominatim.
   */
  async function inversoLu(
    lat: number,
    lng: number,
    distanciaMax?: number,
  ): Promise<ResultadoGeocodificacao | null> {
    const dados = await obterJson('geoportail', `${SERVICOS.geoportail}/reverse?lon=${lng}&lat=${lat}`);
    if (!eObjeto(dados) || !Array.isArray(dados.results)) throw naoSePercebe('geoportail');
    const r = dados.results[0];
    if (!eObjeto(r)) return null;
    const rotulo = rotuloGeoportailInverso(r);
    if (!rotulo) return null;
    const distancia = numero(r.distance);
    if (distanciaMax !== undefined && (distancia === null || distancia > distanciaMax)) return null;
    const ponto = pontoGeoJson(r.geomlonlat) ?? { lat, lng };
    return {
      rotulo,
      ...ponto,
      pais: 'LU',
      fonte: FONTE.geoportail,
      confianca: confiancaPelaDistancia(distancia),
    };
  }

  /** O ponto da morada fora da região: fica o ponto clicado. */
  const naRegiao = (r: ResultadoGeocodificacao, lat: number, lng: number): ResultadoGeocodificacao =>
    dentroDaRegiao(r.lat, r.lng) ? r : { ...r, lat, lng };

  /** O Nominatim falhou: no retângulo do Luxemburgo, o geoportail diretamente (null = não serve). */
  async function recursoLu(lat: number, lng: number): Promise<ResultadoGeocodificacao | null> {
    if (!noRetanguloLu(lat, lng)) return null;
    try {
      return await inversoLu(lat, lng, DISTANCIA_RECURSO_LU_M);
    } catch {
      return null;
    }
  }

  /** A morada do IGN para um ponto em França (null se não achar). */
  async function inversoFr(lat: number, lng: number): Promise<ResultadoGeocodificacao | null> {
    const dados = await obterJson('ign', `${SERVICOS.ign}/reverse?lon=${lng}&lat=${lat}&limit=1`);
    if (!eObjeto(dados) || !Array.isArray(dados.features)) throw naoSePercebe('ign');
    const f = dados.features[0];
    const distancia = eObjeto(f) && eObjeto(f.properties) ? numero(f.properties.distance) : null;
    return resultadoIgn(f, 'FR', confiancaPelaDistancia(distancia));
  }

  return {
    async procurar(morada, pais) {
      if (pais === 'LU') return procurarLu(morada);
      if (pais === 'FR') return procurarFr(morada);
      return procurarNominatim(morada, pais);
    },

    async inverso(lat, lng) {
      let dados: unknown;
      try {
        dados = await nominatim(`/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`);
      } catch (e) {
        // O Nominatim falhou: no Luxemburgo, o geoportail ainda pode dar a morada.
        const lu = e instanceof ErroGeocodificacao ? await recursoLu(lat, lng) : null;
        if (lu) return naRegiao(lu, lat, lng);
        throw e;
      }
      if (!eObjeto(dados)) throw naoSePercebe('nominatim');
      // Sem nada no ponto (ex.: no meio de um campo), o Nominatim responde { error: "Unable to geocode" }.
      if (dados.error !== undefined) return null;
      const codigo = eObjeto(dados.address) ? texto(dados.address.country_code)?.toUpperCase() : undefined;
      if (!codigo || !ePais(codigo)) return null;
      const base = resultadoNominatim(dados, codigo);
      const doPais = async () => {
        try {
          if (codigo === 'LU') return await inversoLu(lat, lng);
          if (codigo === 'FR') return await inversoFr(lat, lng);
        } catch (e) {
          // O geoportail ou o IGN falharam: fica a morada do Nominatim (se houver).
          if (!(e instanceof ErroGeocodificacao) || !base) throw e;
        }
        return null;
      };
      const resultado = (await doPais()) ?? base;
      return resultado ? naRegiao(resultado, lat, lng) : null;
    },
  };
}
