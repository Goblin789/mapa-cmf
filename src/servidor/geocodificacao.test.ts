// Geocodificador (M2) com um `fetch` FALSO: respostas gravadas à mão, com moradas fictícias. NUNCA os serviços
// verdadeiros (esses só num ensaio pontual à mão).

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confiancaNominatim,
  confiancaPelaDistancia,
  criarGeocodificador,
  ErroGeocodificacao,
  INTERVALO_NOMINATIM_MS,
  limparRotulo,
  type OpcoesGeocodificador,
} from './geocodificacao';

const AGENTE = 'MapaCMF/teste (moradas de obras da empresa)';
const MORADA = '12 Rue Fictícia, Lugar Inventado';

interface Pedido {
  url: string;
  agente: string | null;
}

type Resposta = Response | Promise<Response> | ((sinal: AbortSignal | undefined) => Promise<Response>);

/** Um fetch falso: a 1.ª regra cujo pedaço de endereço aparece no URL responde; regista os pedidos. */
function fetchFalso(regras: [string, () => Resposta][]) {
  const pedidos: Pedido[] = [];
  const f = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const cabecalhos = new Headers(init?.headers);
    pedidos.push({ url, agente: cabecalhos.get('user-agent') });
    const regra = regras.find(([pedaco]) => url.includes(pedaco));
    if (!regra) throw new Error(`pedido inesperado: ${url}`);
    const r = regra[1]();
    return typeof r === 'function' ? r(init?.signal ?? undefined) : r;
  }) as typeof fetch;
  return { f, pedidos };
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

function geocodificador(f: typeof fetch, extra: Partial<OpcoesGeocodificador> = {}) {
  const esperas: number[] = [];
  const g = criarGeocodificador({
    fetch: f,
    agente: AGENTE,
    esperar: async (ms) => {
      esperas.push(ms);
    },
    ...extra,
  });
  return { g, esperas };
}

// --- Respostas gravadas à mão (fictícias) ---

const GEOPORTAIL_PROCURA = {
  success: true,
  results: [
    {
      ratio: 0.62,
      name: 'Rue Fictícia',
      address: 'Rue Fictícia, L-0000 Lugar Inventado',
      geomlonlat: { type: 'Point', coordinates: [6.12, 49.6] },
    },
    {
      ratio: 1,
      name: '12, Rue Fictícia',
      address: '12 Rue Fictícia, L-0000 Lugar Inventado',
      geomlonlat: { type: 'Point', coordinates: [6.13, 49.61] },
    },
    // Fora da região do mapa: descarta-se.
    { ratio: 1, address: 'Algures longe', geomlonlat: { type: 'Point', coordinates: [2.35, 48.85] } },
    // Sem coordenadas: não serve.
    { ratio: 0.9, address: 'Sem ponto' },
  ],
};

const IGN_PROCURA = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [6.17, 49.12] },
      properties: { label: '3 Rue Imaginária 57000 Cidade Fictícia', score: 0.97 },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [6.18, 49.11] },
      properties: { label: 'Rue Imaginária 57000 Cidade Fictícia', score: 0.55 },
    },
  ],
};

const NOMINATIM_PROCURA = [
  { lat: '49.70', lon: '5.82', display_name: 'Rua Inventada, Aldeia Fictícia, Belgique', place_rank: 26 },
  { lat: '49.71', lon: '5.83', display_name: '7, Rua Inventada, Aldeia Fictícia, Belgique', place_rank: 30 },
];

const nominatimInverso = (pais: string, extra: object = {}) => ({
  lat: '49.6000',
  lon: '6.1000',
  display_name: `1, Caminho Fictício, Lugar, ${pais}`,
  place_rank: 30,
  address: { road: 'Caminho Fictício', country_code: pais },
  ...extra,
});

describe('procurar: o serviço depende do país', () => {
  it('Luxemburgo → geoportail.lu; o melhor primeiro; fora da região e sem ponto saem', async () => {
    const { f, pedidos } = fetchFalso([
      ['apiv4.geoportail.lu/geocode/search', () => json(GEOPORTAIL_PROCURA)],
    ]);
    const { g } = geocodificador(f);
    const resultados = await g.procurar(MORADA, 'LU');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.url).toBe(
      `https://apiv4.geoportail.lu/geocode/search?queryString=${encodeURIComponent(MORADA)}`,
    );
    expect(pedidos[0]?.agente).toBe(AGENTE);
    expect(resultados).toEqual([
      {
        rotulo: '12 Rue Fictícia, L-0000 Lugar Inventado',
        lat: 49.61,
        lng: 6.13,
        pais: 'LU',
        fonte: 'geoportail.lu',
        confianca: 1,
      },
      {
        rotulo: 'Rue Fictícia, L-0000 Lugar Inventado',
        lat: 49.6,
        lng: 6.12,
        pais: 'LU',
        fonte: 'geoportail.lu',
        confianca: 0.62,
      },
    ]);
  });

  it('França → IGN (Géoplateforme), com limit=5', async () => {
    const { f, pedidos } = fetchFalso([['data.geopf.fr/geocodage/search', () => json(IGN_PROCURA)]]);
    const { g } = geocodificador(f);
    const resultados = await g.procurar(MORADA, 'FR');
    expect(pedidos[0]?.url).toBe(
      `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(MORADA)}&limit=5`,
    );
    expect(resultados.map((r) => [r.rotulo, r.confianca, r.fonte, r.pais])).toEqual([
      ['3 Rue Imaginária 57000 Cidade Fictícia', 0.97, 'IGN Géoplateforme', 'FR'],
      ['Rue Imaginária 57000 Cidade Fictícia', 0.55, 'IGN Géoplateforme', 'FR'],
    ]);
    expect(resultados[0]).toMatchObject({ lat: 49.12, lng: 6.17 });
  });

  it('Bélgica e Alemanha → Nominatim, só nesse país; confiança pelo place_rank', async () => {
    const { f, pedidos } = fetchFalso([
      ['nominatim.openstreetmap.org/search', () => json(NOMINATIM_PROCURA)],
    ]);
    const { g } = geocodificador(f);
    const be = await g.procurar(MORADA, 'BE');
    expect(pedidos[0]?.url).toBe(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=be&limit=5&q=${encodeURIComponent(MORADA)}`,
    );
    expect(pedidos[0]?.agente).toBe(AGENTE);
    expect(be.map((r) => [r.rotulo, r.confianca, r.lat, r.lng, r.pais])).toEqual([
      ['7, Rua Inventada, Aldeia Fictícia, Belgique', 0.9, 49.71, 5.83, 'BE'],
      ['Rua Inventada, Aldeia Fictícia, Belgique', 0.7, 49.7, 5.82, 'BE'],
    ]);
    await g.procurar(MORADA, 'DE');
    expect(pedidos[1]?.url).toContain('countrycodes=de');
  });

  it('nada encontrado → []', async () => {
    const { f } = fetchFalso([
      ['geoportail', () => json({ success: true, results: [] })],
      ['geopf', () => json({ type: 'FeatureCollection', features: [] })],
      ['nominatim', () => json([])],
    ]);
    const { g } = geocodificador(f);
    expect(await g.procurar(MORADA, 'LU')).toEqual([]);
    expect(await g.procurar(MORADA, 'FR')).toEqual([]);
    expect(await g.procurar(MORADA, 'DE')).toEqual([]);
  });

  it('no máximo 5 resultados', async () => {
    const muitos = Array.from({ length: 8 }, (_, i) => ({
      lat: String(49.6 + i / 100),
      lon: '6.1',
      display_name: `Sítio ${i}`,
      place_rank: 30,
    }));
    const { f } = fetchFalso([['nominatim', () => json(muitos)]]);
    const { g } = geocodificador(f);
    const r = await g.procurar(MORADA, 'BE');
    expect(r.map((x) => x.rotulo)).toEqual(['Sítio 0', 'Sítio 1', 'Sítio 2', 'Sítio 3', 'Sítio 4']);
  });
});

describe('inverso', () => {
  it('Luxemburgo: o Nominatim dá o país e o geoportail a morada', async () => {
    const { f, pedidos } = fetchFalso([
      ['nominatim.openstreetmap.org/reverse', () => json(nominatimInverso('lu'))],
      [
        'apiv4.geoportail.lu/geocode/reverse',
        () =>
          json({
            count: 1,
            results: [
              {
                name: '12,Rue Fictícia 0000 Lugar',
                distance: 12.5,
                number: '12',
                street: 'Rue Fictícia',
                postal_code: '0000',
                locality: 'Lugar Inventado',
                geomlonlat: { type: 'Point', coordinates: [6.1001, 49.6002] },
              },
            ],
          }),
      ],
    ]);
    const { g } = geocodificador(f);
    const r = await g.inverso(49.6, 6.1);
    expect(pedidos.map((p) => p.url)).toEqual([
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=49.6&lon=6.1',
      'https://apiv4.geoportail.lu/geocode/reverse?lon=6.1&lat=49.6',
    ]);
    expect(r).toEqual({
      rotulo: '12 Rue Fictícia, L-0000 Lugar Inventado',
      lat: 49.6002,
      lng: 6.1001,
      pais: 'LU',
      fonte: 'geoportail.lu',
      confianca: 1,
    });
  });

  it('França: a morada vem do IGN; a confiança desce com a distância', async () => {
    const { f, pedidos } = fetchFalso([
      ['nominatim', () => json(nominatimInverso('fr', { lat: '49.12', lon: '6.17' }))],
      [
        'data.geopf.fr/geocodage/reverse',
        () =>
          json({
            type: 'FeatureCollection',
            features: [
              {
                geometry: { type: 'Point', coordinates: [6.171, 49.121] },
                properties: { label: '3 Rue Imaginária 57000 Cidade Fictícia', score: 0.99, distance: 125 },
              },
            ],
          }),
      ],
    ]);
    const { g } = geocodificador(f);
    const r = await g.inverso(49.12, 6.17);
    expect(pedidos[1]?.url).toBe('https://data.geopf.fr/geocodage/reverse?lon=6.17&lat=49.12&limit=1');
    expect(r).toMatchObject({
      rotulo: '3 Rue Imaginária 57000 Cidade Fictícia',
      pais: 'FR',
      fonte: 'IGN Géoplateforme',
      confianca: 0.5,
    });
  });

  it('Bélgica: fica a morada do Nominatim (um só pedido)', async () => {
    const { f, pedidos } = fetchFalso([
      ['nominatim', () => json(nominatimInverso('be', { lat: '49.70', lon: '5.82', place_rank: 26 }))],
    ]);
    const { g } = geocodificador(f);
    const r = await g.inverso(49.7, 5.82);
    expect(pedidos).toHaveLength(1);
    expect(r).toEqual({
      rotulo: '1, Caminho Fictício, Lugar, be',
      lat: 49.7,
      lng: 5.82,
      pais: 'BE',
      fonte: 'Nominatim',
      confianca: 0.7,
    });
  });

  it('nada no ponto ({ error }) ou um país que não é dos nossos → null', async () => {
    const { f } = fetchFalso([['nominatim', () => json({ error: 'Unable to geocode' })]]);
    expect(await geocodificador(f).g.inverso(49.6, 6.1)).toBeNull();
    const { f: f2 } = fetchFalso([['nominatim', () => json(nominatimInverso('nl'))]]);
    expect(await geocodificador(f2).g.inverso(49.6, 6.1)).toBeNull();
  });

  it('se o geoportail falhar ou não achar nada, fica a morada do Nominatim', async () => {
    const { f } = fetchFalso([
      ['nominatim', () => json(nominatimInverso('lu'))],
      ['geoportail', () => json({ error: 'interno' }, 500)],
    ]);
    const r = await geocodificador(f).g.inverso(49.6, 6.1);
    expect(r).toMatchObject({ fonte: 'Nominatim', pais: 'LU', rotulo: '1, Caminho Fictício, Lugar, lu' });
    const { f: f2 } = fetchFalso([
      ['nominatim', () => json(nominatimInverso('lu'))],
      ['geoportail', () => json({ count: 0, results: [] })],
    ]);
    expect(await geocodificador(f2).g.inverso(49.6, 6.1)).toMatchObject({ fonte: 'Nominatim' });
  });

  const geoportailInverso = (distancia: number) =>
    json({
      count: 1,
      results: [
        {
          distance: distancia,
          number: '3',
          street: 'Rue Fictícia',
          postal_code: '0000',
          locality: 'Lugar Inventado',
          geomlonlat: { type: 'Point', coordinates: [6.1001, 49.6002] },
        },
      ],
    });

  it('Nominatim em baixo, no Luxemburgo: a morada vem diretamente do geoportail (se estiver perto)', async () => {
    const { f, pedidos } = fetchFalso([
      ['nominatim', () => json({}, 503)],
      ['geoportail', () => geoportailInverso(12)],
    ]);
    const r = await geocodificador(f).g.inverso(49.6, 6.1);
    expect(pedidos).toHaveLength(2);
    expect(r).toMatchObject({ rotulo: '3 Rue Fictícia, L-0000 Lugar Inventado', pais: 'LU', confianca: 1 });
  });

  it('Nominatim em baixo: longe de uma morada do geoportail, fora do Luxemburgo ou o geoportail também em baixo → o erro', async () => {
    const longe = fetchFalso([
      ['nominatim', () => json({}, 503)],
      ['geoportail', () => geoportailInverso(400)],
    ]);
    await expect(geocodificador(longe.f).g.inverso(49.6, 6.1)).rejects.toMatchObject({ tipo: 'servico' });
    const ambos = fetchFalso([
      ['nominatim', () => json({}, 503)],
      ['geoportail', () => json({}, 500)],
    ]);
    await expect(geocodificador(ambos.f).g.inverso(49.6, 6.1)).rejects.toThrow(/Nominatim/);
    // Metz (França): nem se pergunta ao geoportail.
    const fora = fetchFalso([['nominatim', () => json({}, 503)]]);
    await expect(geocodificador(fora.f).g.inverso(49.12, 6.17)).rejects.toMatchObject({ tipo: 'servico' });
    expect(fora.pedidos).toHaveLength(1);
  });

  it('o ponto da morada fora da região: fica o ponto clicado', async () => {
    const { f } = fetchFalso([
      ['nominatim', () => json(nominatimInverso('de', { lat: '52.5', lon: '13.4' }))],
    ]);
    const r = await geocodificador(f).g.inverso(49.5, 6.9);
    expect(r).toMatchObject({ lat: 49.5, lng: 6.9, pais: 'DE' });
  });
});

describe('Nominatim: fila de 1 pedido por segundo', () => {
  it('pedidos seguidos esperam ~1 s entre si e vão um de cada vez, pela ordem', async () => {
    let aCorrer = 0;
    let maximo = 0;
    const ordem: string[] = [];
    const { f } = fetchFalso([
      [
        'nominatim',
        () => async () => {
          aCorrer++;
          maximo = Math.max(maximo, aCorrer);
          await new Promise((r) => setTimeout(r, 5));
          aCorrer--;
          return json([]);
        },
      ],
    ]);
    const espiao = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
      ordem.push(new URL(String(entrada)).searchParams.get('q') ?? '');
      return f(entrada, init);
    }) as typeof fetch;
    const { g, esperas } = geocodificador(espiao);
    await Promise.all([g.procurar('A', 'BE'), g.procurar('B', 'DE'), g.procurar('C', 'BE')]);
    expect(ordem).toEqual(['A', 'B', 'C']);
    expect(maximo).toBe(1);
    // O 1.º não espera; os outros dois esperam quase 1 s (o que falta para o segundo).
    expect(esperas).toHaveLength(2);
    for (const ms of esperas) {
      expect(ms).toBeGreaterThan(INTERVALO_NOMINATIM_MS - 200);
      expect(ms).toBeLessThanOrEqual(INTERVALO_NOMINATIM_MS);
    }
  });

  it('um pedido que falha não para a fila', async () => {
    let n = 0;
    const { f } = fetchFalso([['nominatim', () => (++n === 1 ? json({}, 503) : json([]))]]);
    const { g } = geocodificador(f);
    const [a, b] = await Promise.allSettled([g.procurar('A', 'BE'), g.procurar('B', 'BE')]);
    expect(a.status).toBe('rejected');
    expect(b).toEqual({ status: 'fulfilled', value: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o tempo limite conta desde a entrada na fila: quem esperou demais sai com "tempo" sem ir ao serviço', async () => {
    // Relógio falso: esperar(ms) avança o relógio; os pedidos respondem logo.
    let agora = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => agora);
    const { f, pedidos } = fetchFalso([['nominatim', () => json({ error: 'Unable to geocode' })]]);
    const g = criarGeocodificador({
      fetch: f,
      agente: AGENTE,
      limiteMs: 2500,
      esperar: async (ms) => {
        agora += ms;
      },
    });
    // Quatro pins arrastados de seguida: o 4.º só teria vez aos 3 s, depois dos 2,5 s do limite.
    const r = await Promise.allSettled([
      g.inverso(49.6, 6.1),
      g.inverso(49.61, 6.1),
      g.inverso(49.62, 6.1),
      g.inverso(49.63, 6.1),
    ]);
    expect(r.map((x) => x.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'rejected']);
    expect((r[3] as PromiseRejectedResult).reason).toMatchObject({ tipo: 'tempo' });
    // (O 4.º, no Luxemburgo, ainda tenta o geoportail: aqui não há regra para ele, e fica o erro 'tempo'.)
    const aoNominatim = () => pedidos.filter((p) => p.url.includes('nominatim')).length;
    expect(aoNominatim()).toBe(3);
    // O que saiu não ocupou a vez: o seguinte vai logo depois do intervalo do último que foi.
    agora += 5000;
    await g.inverso(49.64, 6.1);
    expect(aoNominatim()).toBe(4);
  });

  it('o geoportail e o IGN não entram na fila', async () => {
    const { f } = fetchFalso([
      ['geoportail', () => json({ results: [] })],
      ['geopf', () => json({ features: [] })],
    ]);
    const { g, esperas } = geocodificador(f);
    await Promise.all([g.procurar('A', 'LU'), g.procurar('B', 'LU'), g.procurar('C', 'FR')]);
    expect(esperas).toEqual([]);
  });
});

describe('erros (sem a morada nas mensagens)', () => {
  async function erroDe(promessa: Promise<unknown>): Promise<ErroGeocodificacao> {
    try {
      await promessa;
    } catch (e) {
      if (e instanceof ErroGeocodificacao) return e;
      throw e;
    }
    throw new Error('devia ter falhado');
  }

  it('tempo limite → "tempo"', async () => {
    const { f } = fetchFalso([
      [
        'geoportail',
        () => (sinal) =>
          new Promise<Response>((_, rejeitar) => {
            sinal?.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError')));
          }),
      ],
    ]);
    const { g } = geocodificador(f, { limiteMs: 20 });
    const e = await erroDe(g.procurar(MORADA, 'LU'));
    expect(e.tipo).toBe('tempo');
    expect(e.message).not.toContain('Fictícia');
    expect(e.message).not.toContain('http');
  });

  it('erro HTTP → "servico"', async () => {
    const { f } = fetchFalso([['geopf', () => json({ code: 500 }, 500)]]);
    const e = await erroDe(geocodificador(f).g.procurar(MORADA, 'FR'));
    expect(e.tipo).toBe('servico');
    expect(e.message).toBe('O IGN Géoplateforme respondeu com o erro 500.');
  });

  it('JSON estragado → "servico"', async () => {
    const { f } = fetchFalso([['geoportail', () => new Response('<html>erro', { status: 200 })]]);
    const e = await erroDe(geocodificador(f).g.procurar(MORADA, 'LU'));
    expect(e.tipo).toBe('servico');
    expect(e.message).not.toContain(MORADA);
  });

  it('JSON com outra forma → "servico"', async () => {
    const { f } = fetchFalso([
      ['geoportail', () => json({ resultados: 'não' })],
      ['nominatim', () => json({ nao: 'é uma lista' })],
    ]);
    expect((await erroDe(geocodificador(f).g.procurar(MORADA, 'LU'))).tipo).toBe('servico');
    expect((await erroDe(geocodificador(f).g.procurar(MORADA, 'BE'))).tipo).toBe('servico');
    const { f: f2 } = fetchFalso([['nominatim', () => json(['lista'])]]);
    expect((await erroDe(geocodificador(f2).g.inverso(49.6, 6.1))).tipo).toBe('servico');
  });

  it('falha de rede (com o endereço na mensagem original) → "servico", sem o endereço', async () => {
    const { f } = fetchFalso([
      [
        'geoportail',
        () => {
          throw new TypeError(`fetch failed: ${MORADA}`);
        },
      ],
    ]);
    const e = await erroDe(geocodificador(f).g.procurar(MORADA, 'LU'));
    expect(e.tipo).toBe('servico');
    expect(e.message).toBe('Não foi possível falar com o geoportail.lu.');
  });
});

describe('limparRotulo', () => {
  it('tira as vírgulas soltas (o geoportail sem nº de porta) e os espaços a mais', () => {
    expect(limparRotulo(', Rue Fictícia 0000 Lugar')).toBe('Rue Fictícia 0000 Lugar');
    expect(limparRotulo('12,Rue Fictícia  0000 Lugar ,')).toBe('12, Rue Fictícia 0000 Lugar');
    expect(limparRotulo('12 , , Rue X')).toBe('12, Rue X');
  });

  it('nos resultados do geoportail', async () => {
    const { f } = fetchFalso([
      [
        'geoportail',
        () =>
          json({
            results: [
              {
                ratio: 1,
                address: ', Praça Fictícia 0000 Lugar',
                geomlonlat: { coordinates: [6.13, 49.61] },
              },
            ],
          }),
      ],
    ]);
    const [r] = await geocodificador(f).g.procurar(MORADA, 'LU');
    expect(r?.rotulo).toBe('Praça Fictícia 0000 Lugar');
  });
});

describe('confiança', () => {
  it('pela distância (inverso) e pelo place_rank (Nominatim)', () => {
    expect(confiancaPelaDistancia(null)).toBe(0.8);
    expect(confiancaPelaDistancia(10)).toBe(1);
    expect(confiancaPelaDistancia(125)).toBe(0.5);
    expect(confiancaPelaDistancia(5000)).toBe(0.2);
    expect(confiancaNominatim(30)).toBe(0.9);
    expect(confiancaNominatim(27)).toBe(0.7);
    expect(confiancaNominatim(16)).toBe(0.5);
    expect(confiancaNominatim(null)).toBe(0.5);
  });
});
