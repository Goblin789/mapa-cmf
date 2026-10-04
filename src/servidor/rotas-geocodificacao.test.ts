// POST /api/geocodificar e /api/geocodificar/inverso (M2) com um Geocodificador FALSO (nunca os serviços
// verdadeiros), no modo local e no modo entra com o fornecedor de login falso em processo. Dados fictícios.

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { ResultadoGeocodificacao } from '../dominio/api';
import type { Pais } from '../dominio/tipos';
import { criarApp, LIMITE_GEOCODIFICAR, MORADAS_DESLIGADAS, MORADAS_SEM_RESPOSTA } from './app';
import type { ConfigAuth } from './auth';
import type { FetchOidc } from './auth/oidc';
import { criarProvedorFalso, type ProvedorFalso } from './auth/provedorFalso';
import { inserirDadosFicticios } from './dados-de-teste';
import { abrirBd, type Bd } from './db/ligacao';
import { ErroGeocodificacao, type Geocodificador } from './geocodificacao';

const MORADA = '12 Rue Fictícia, L-0000 Lugar';
const RESULTADO: ResultadoGeocodificacao = {
  rotulo: '12 Rue Fictícia, L-0000 Lugar',
  lat: 49.61,
  lng: 6.13,
  pais: 'LU',
  fonte: 'geoportail.lu',
  confianca: 0.95,
};

let bd: Bd;
let relogio: Date;
let consola: MockInstance[];

/** Um geocodificador falso que regista os pedidos e responde (ou falha) como se pedir. */
function geocodificadorFalso(falha?: () => Error) {
  const pedidos: unknown[][] = [];
  const g: Geocodificador = {
    procurar: async (morada: string, pais: Pais) => {
      pedidos.push(['procurar', morada, pais]);
      if (falha) throw falha();
      return [RESULTADO];
    },
    inverso: async (lat: number, lng: number) => {
      pedidos.push(['inverso', lat, lng]);
      if (falha) throw falha();
      return lat > 50 ? null : RESULTADO;
    },
  };
  return { g, pedidos };
}

beforeEach(() => {
  bd = abrirBd(':memory:');
  inserirDadosFicticios(bd);
  relogio = new Date('2026-10-04T10:00:00.000Z');
  consola = [
    vi.spyOn(console, 'log').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {}),
    vi.spyOn(console, 'error').mockImplementation(() => {}),
  ];
});

afterEach(() => {
  if (bd.$client.open) bd.$client.close();
  vi.restoreAllMocks();
});

function registos(): string {
  return consola.flatMap((m) => m.mock.calls.map((args) => args.map(String).join(' '))).join('\n');
}

describe('modo local', () => {
  const app = (geocodificador?: Geocodificador) => criarApp({ bd, agora: () => relogio, geocodificador });
  const pedir = (
    a: ReturnType<typeof app>,
    caminho: string,
    corpo: unknown,
    cabecalhos: Record<string, string> = {},
  ) =>
    a.request(caminho, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cabecalhos },
      body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    });

  it('procura a morada (aparada) e devolve os resultados; o inverso devolve a morada ou null', async () => {
    const { g, pedidos } = geocodificadorFalso();
    const a = app(g);
    const r = await pedir(a, '/api/geocodificar', { morada: `  ${MORADA}  `, pais: 'LU' });
    expect(r.status).toBe(200);
    expect(await r.json()).toStrictEqual({ resultados: [RESULTADO] });
    const inv = await pedir(a, '/api/geocodificar/inverso', { lat: 49.61, lng: 6.13 });
    expect(await inv.json()).toStrictEqual({ resultado: RESULTADO });
    const nada = await pedir(a, '/api/geocodificar/inverso', { lat: 50.2, lng: 6.13 });
    expect(await nada.json()).toStrictEqual({ resultado: null });
    expect(pedidos).toEqual([
      ['procurar', MORADA, 'LU'],
      ['inverso', 49.61, 6.13],
      ['inverso', 50.2, 6.13],
    ]);
  });

  it('valida o pedido: JSON obrigatório, morada de 1 a 300 caracteres, país conhecido, posição na região', async () => {
    const { g, pedidos } = geocodificadorFalso();
    const a = app(g);
    const semJson = await a.request('/api/geocodificar', { method: 'POST', body: 'morada=x' });
    expect(semJson.status).toBe(415);
    expect((await pedir(a, '/api/geocodificar', '{')).status).toBe(400);
    const vazia = await pedir(a, '/api/geocodificar', { morada: '   ', pais: 'LU' });
    expect(await vazia.json()).toStrictEqual({
      erro: 'Pedido inválido.',
      erros: ['morada: Escreve a morada.'],
    });
    const longa = await pedir(a, '/api/geocodificar', { morada: 'x'.repeat(301), pais: 'LU' });
    expect(((await longa.json()) as { erros: string[] }).erros).toEqual([
      'morada: A morada tem no máximo 300 caracteres.',
    ]);
    const pais = await pedir(a, '/api/geocodificar', { morada: MORADA, pais: 'PT' });
    expect(((await pais.json()) as { erros: string[] }).erros).toEqual([
      'pais: O país tem de ser LU, FR, BE, DE.',
    ]);
    const fora = await pedir(a, '/api/geocodificar/inverso', { lat: 48.86, lng: 2.35 });
    expect(fora.status).toBe(400);
    expect(((await fora.json()) as { erros: string[] }).erros).toEqual([
      'lat: A posição fica fora da região do mapa.',
      'lng: A posição fica fora da região do mapa.',
    ]);
    expect(pedidos).toEqual([]);
  });

  it('403 quando a página não é deste computador', async () => {
    const { g } = geocodificadorFalso();
    const r = await pedir(
      app(g),
      '/api/geocodificar',
      { morada: MORADA, pais: 'LU' },
      { Origin: 'https://mau.exemplo' },
    );
    expect(r.status).toBe(403);
  });

  it('503 sem geocodificador ou desligado; 502 quando o serviço não responde ou responde mal', async () => {
    const corpo = { morada: MORADA, pais: 'LU' };
    const sem = await pedir(app(), '/api/geocodificar', corpo);
    expect(sem.status).toBe(503);
    expect(await sem.json()).toStrictEqual({ erro: MORADAS_DESLIGADAS });
    const desligado = geocodificadorFalso(() => new ErroGeocodificacao('desligado', 'desligado'));
    expect((await pedir(app(desligado.g), '/api/geocodificar', corpo)).status).toBe(503);
    for (const falha of [
      () => new ErroGeocodificacao('tempo', 'não respondeu a tempo'),
      () => new ErroGeocodificacao('servico', 'resposta estranha'),
      () => new TypeError(`fetch failed: https://servico.exemplo/?q=${encodeURIComponent(MORADA)}`),
    ]) {
      const { g } = geocodificadorFalso(falha);
      const r = await pedir(app(g), '/api/geocodificar', corpo);
      expect(r.status).toBe(502);
      expect(await r.json()).toStrictEqual({ erro: MORADAS_SEM_RESPOSTA });
      const inv = await pedir(app(g), '/api/geocodificar/inverso', { lat: 49.6, lng: 6.1 });
      expect(inv.status).toBe(502);
    }
    // Os registos nunca levam a morada pedida.
    expect(registos()).not.toContain('Fictícia');
    expect(registos()).not.toContain('Fict%C3%ADcia');
    expect(registos()).toContain('Moradas: o serviço falhou (tempo).');
  });

  it('429 com Retry-After acima de 30 pedidos por minuto (as duas rotas juntas); passa o minuto, volta', async () => {
    const { g } = geocodificadorFalso();
    const a = app(g);
    for (let i = 0; i < LIMITE_GEOCODIFICAR.pedidos; i++) {
      const caminho = i % 2 === 0 ? '/api/geocodificar' : '/api/geocodificar/inverso';
      const corpo = i % 2 === 0 ? { morada: MORADA, pais: 'LU' } : { lat: 49.6, lng: 6.1 };
      expect((await pedir(a, caminho, corpo)).status, `pedido ${i + 1}`).toBe(200);
    }
    relogio = new Date(relogio.getTime() + 20_000);
    const r = await pedir(a, '/api/geocodificar', { morada: MORADA, pais: 'LU' });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('40');
    expect(await r.json()).toStrictEqual({
      erro: 'Demasiados pedidos de moradas seguidos. Espera um minuto e tenta outra vez.',
    });
    relogio = new Date(relogio.getTime() + 40_001);
    expect((await pedir(a, '/api/geocodificar', { morada: MORADA, pais: 'LU' })).status).toBe(200);
  });
});

// --- Modo entra (login Microsoft com o fornecedor falso em processo) -------------------------------------

const EMISSOR = 'http://localhost:8890';
const PUBLICO = 'http://localhost:5173';
const ANA = 'oid-ana-0001';
const RUI = 'oid-rui-0002';

class Frasco {
  valores = new Map<string, string>();
  guardar(resposta: Response): void {
    for (const linha of resposta.headers.getSetCookie()) {
      const [par] = linha.split(';');
      const i = (par ?? '').indexOf('=');
      const nome = (par ?? '').slice(0, i).trim();
      const valor = (par ?? '').slice(i + 1).trim();
      if (valor === '' || /max-age=0/i.test(linha)) this.valores.delete(nome);
      else this.valores.set(nome, valor);
    }
  }
  cabecalho(): string {
    return [...this.valores].map(([n, v]) => `${n}=${v}`).join('; ');
  }
}

describe('modo entra', () => {
  let provedor: ProvedorFalso;
  let fetchFalso: FetchOidc;

  beforeEach(async () => {
    provedor = await criarProvedorFalso({ emissor: EMISSOR, urisRetorno: [`${PUBLICO}/api/auth/retorno`] });
    fetchFalso = async (url, opcoes) =>
      provedor.app.request(url, {
        method: opcoes.method,
        headers: opcoes.headers,
        body: opcoes.body as BodyInit | null | undefined,
      });
  });

  function novaApp(geocodificador: Geocodificador) {
    const auth: ConfigAuth = {
      modo: 'entra',
      enderecoPublico: PUBLICO,
      entra: {
        inquilino: provedor.inquilino,
        cliente: provedor.cliente,
        segredo: provedor.segredo,
        emissor: EMISSOR,
        permitirHttp: true,
      },
      utilizadoresPermitidos: null,
      producao: false,
    };
    return criarApp({ bd, auth, agora: () => relogio, fetchOidc: fetchFalso, geocodificador });
  }

  async function pedir(
    app: ReturnType<typeof novaApp>,
    frasco: Frasco,
    caminho: string,
    init: RequestInit = {},
  ) {
    const headers = new Headers(init.headers);
    if (frasco.valores.size > 0) headers.set('Cookie', frasco.cabecalho());
    const r = await app.request(`${PUBLICO}${caminho}`, { ...init, headers });
    frasco.guardar(r);
    return r;
  }

  async function entrar(app: ReturnType<typeof novaApp>, frasco: Frasco, oid: string): Promise<void> {
    // A hora da sessão é a da app: o relógio verdadeiro (o do fornecedor falso também é o verdadeiro).
    relogio = new Date();
    const ida = await pedir(app, frasco, '/api/auth/entrar?destino=%2F');
    const microsoft = new URL(ida.headers.get('Location') ?? '');
    microsoft.searchParams.set('utilizador', oid);
    const volta = await provedor.app.request(microsoft.href);
    const retorno = new URL(volta.headers.get('Location') ?? '');
    const r = await pedir(app, frasco, retorno.pathname + retorno.search);
    expect(r.status).toBe(302);
    expect(frasco.valores.has('mapa-sessao')).toBe(true);
  }

  const procurar = (app: ReturnType<typeof novaApp>, frasco: Frasco, origem: string | null = PUBLICO) =>
    pedir(app, frasco, '/api/geocodificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origem ? { Origin: origem } : {}) },
      body: JSON.stringify({ morada: MORADA, pais: 'LU' }),
    });

  it('401 sem sessão; 403 sem a origem certa; 200 com sessão e a origem do Mapa', async () => {
    const { g, pedidos } = geocodificadorFalso();
    const app = novaApp(g);
    const frasco = new Frasco();
    expect((await procurar(app, frasco)).status).toBe(401);
    await entrar(app, frasco, ANA);
    expect((await procurar(app, frasco, 'https://mau.exemplo')).status).toBe(403);
    expect((await procurar(app, frasco, null)).status).toBe(403);
    const r = await procurar(app, frasco);
    expect(r.status).toBe(200);
    expect(await r.json()).toStrictEqual({ resultados: [RESULTADO] });
    expect(pedidos).toHaveLength(1);
  });

  it('o limite é por utilizador: a Ana chega aos 30 e recebe 429, o Rui continua; 502 e 503 também aqui', async () => {
    const { g } = geocodificadorFalso();
    const app = novaApp(g);
    const ana = new Frasco();
    const rui = new Frasco();
    await entrar(app, ana, ANA);
    await entrar(app, rui, RUI);
    for (let i = 0; i < LIMITE_GEOCODIFICAR.pedidos; i++) expect((await procurar(app, ana)).status).toBe(200);
    const bloqueado = await procurar(app, ana);
    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await procurar(app, rui)).status).toBe(200);

    const avariado = novaApp(geocodificadorFalso(() => new ErroGeocodificacao('tempo', 'x')).g);
    const eva = new Frasco();
    await entrar(avariado, eva, ANA);
    expect((await procurar(avariado, eva)).status).toBe(502);
    const desligado = novaApp(geocodificadorFalso(() => new ErroGeocodificacao('desligado', 'x')).g);
    const outro = new Frasco();
    await entrar(desligado, outro, RUI);
    expect((await procurar(desligado, outro)).status).toBe(503);
  });
});
