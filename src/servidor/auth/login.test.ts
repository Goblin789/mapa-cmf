// Login de ponta a ponta com o fornecedor OpenID falso em processo (sem rede): entrar → Microsoft (falsa)
// → retorno → sessão → API → sair. Também as recusas (state, nonce, tid, lista de permitidos, prazos),
// o Host e a Origin no modo entra, a /api/saude isenta e o tempo real. Tudo com dados fictícios.

import { createHash } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { EntradaHistorico, EstadoCopiasPublico, EventoLote, Utilizador } from '../../dominio/api';
import { criarApp, HSTS, politicaConteudo } from '../app';
import type { EstadoCopias } from '../copias';
import { inserirDadosFicticios, inserirLotes } from '../dados-de-teste';
import * as esquema from '../db/esquema';
import { abrirBd, type Bd } from '../db/ligacao';
import { type CanalEventos, criarCanalEventos } from '../eventos';
import {
  type ConfigAuth,
  codigoDoErroMicrosoft,
  INTERVALO_REVISAO_LIGACOES_MS,
  MAX_PEDIDOS_PENDENTES,
} from '.';
import { estadoDaLigacao, type FetchOidc } from './oidc';
import { criarProvedorFalso, type ProvedorFalso } from './provedorFalso';
import { hashToken } from './sessoes';

const EMISSOR = 'http://localhost:8890';
const PUBLICO = 'http://localhost:5173';
const ANA = 'oid-ana-0001';
const RUI = 'oid-rui-0002';

let bd: Bd;
let provedor: ProvedorFalso;
/** Relógio da app (o do fornecedor falso é o real). */
let relogio: Date;
let consola: MockInstance[];

/** Canal de eventos falso: regista o que a app publica e a versão com que responde. */
function canalFalso() {
  const publicados: EventoLote[] = [];
  const versoes: number[] = [];
  const canal: CanalEventos = {
    publicar: (e) => {
      publicados.push(e);
    },
    responder: (c, versao) => {
      versoes.push(versao);
      return c.text('eventos', 200);
    },
    ligacoes: () => 0,
    fechar: () => {},
  };
  return { canal, publicados, versoes };
}

function configEntra(mudancas: Partial<Extract<ConfigAuth, { modo: 'entra' }>> = {}): ConfigAuth {
  return {
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
    ...mudancas,
  };
}

/** fetch do openid-client → fornecedor falso em processo. */
let fetchFalso: FetchOidc;

beforeEach(async () => {
  bd = abrirBd(':memory:');
  inserirDadosFicticios(bd);
  inserirLotes(bd, 1);
  relogio = new Date();
  provedor = await criarProvedorFalso({
    emissor: EMISSOR,
    urisRetorno: [`${PUBLICO}/api/auth/retorno`, 'https://mapa.exemplo.test/api/auth/retorno'],
  });
  fetchFalso = async (url, opcoes) =>
    provedor.app.request(url, {
      method: opcoes.method,
      headers: opcoes.headers,
      body: opcoes.body as BodyInit | null | undefined,
    });
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

/** Tudo o que foi escrito na consola. */
function registos(): string {
  return consola.flatMap((m) => m.mock.calls.map((args) => args.map(String).join(' '))).join('\n');
}

type App = ReturnType<typeof criarApp>;

function novaApp(auth: ConfigAuth = configEntra(), extra: Partial<Parameters<typeof criarApp>[0]> = {}) {
  const eventos = canalFalso();
  const app = criarApp({
    bd,
    auth,
    eventos: eventos.canal,
    agora: () => relogio,
    fetchOidc: fetchFalso,
    ...extra,
  });
  return { app, eventos };
}

/** Cookies simples (nome → valor), a partir dos Set-Cookie. */
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

async function pedir(app: App, frasco: Frasco, caminho: string, init: RequestInit = {}, base = PUBLICO) {
  const headers = new Headers(init.headers);
  if (frasco.valores.size > 0) headers.set('Cookie', frasco.cabecalho());
  const r = await app.request(`${base}${caminho}`, { ...init, headers });
  frasco.guardar(r);
  return r;
}

function onde(resposta: Response): string {
  return resposta.headers.get('Location') ?? '';
}

/** 1.º passo: /api/auth/entrar → URL da Microsoft (falsa). */
async function irAMicrosoft(app: App, frasco: Frasco, destino = '/tabela', base = PUBLICO): Promise<URL> {
  const r = await pedir(app, frasco, `/api/auth/entrar?destino=${encodeURIComponent(destino)}`, {}, base);
  expect(r.status).toBe(302);
  const url = new URL(onde(r));
  expect(url.origin + url.pathname).toBe(`${EMISSOR}/authorize`);
  return url;
}

/** 2.º passo: o fornecedor falso escolhe o utilizador e devolve o URL de retorno (com code e state). */
async function voltarDaMicrosoft(url: URL, parametros: Record<string, string>): Promise<URL> {
  for (const [k, v] of Object.entries(parametros)) url.searchParams.set(k, v);
  const r = await provedor.app.request(url.href);
  expect(r.status).toBe(302);
  return new URL(onde(r));
}

/** Login completo; devolve a resposta do retorno. */
async function entrar(
  app: App,
  frasco: Frasco,
  parametros: Record<string, string> = { utilizador: ANA },
  destino = '/tabela',
  base = PUBLICO,
) {
  const retorno = await voltarDaMicrosoft(await irAMicrosoft(app, frasco, destino, base), parametros);
  return pedir(app, frasco, retorno.pathname + retorno.search, {}, base);
}

function postarLote(app: App, frasco: Frasco, origem: string | null = PUBLICO) {
  return pedir(app, frasco, '/api/lotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origem ? { Origin: origem } : {}) },
    body: JSON.stringify({
      versaoBase: 1,
      operacoes: [{ tipo: 'mover', pessoaId: 'p-ze', campo: 'obraId', de: 'obra-vale', para: null }],
    }),
  });
}

describe('fluxo completo', () => {
  it('entrar → retorno → sessão → API → gravar com o e-mail → histórico com o nome → sair → 401', async () => {
    const { app, eventos } = novaApp();
    const frasco = new Frasco();

    // Sem sessão a API dá 401.
    const antes = await pedir(app, frasco, '/api/estado');
    expect(antes.status).toBe(401);
    expect(await antes.json()).toStrictEqual({ erro: 'A sessão terminou. Entra outra vez.' });

    // O pedido à Microsoft leva tudo o que o Entra precisa.
    const microsoft = await irAMicrosoft(app, frasco);
    const q = microsoft.searchParams;
    expect(q.get('client_id')).toBe(provedor.cliente);
    expect(q.get('redirect_uri')).toBe(`${PUBLICO}/api/auth/retorno`);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('response_mode')).toBe('query');
    expect(q.get('scope')).toBe('openid profile email');
    expect(q.get('prompt')).toBe('select_account');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('nonce')).toBeTruthy();
    expect(q.get('client_secret')).toBeNull();
    const estado = q.get('state') as string;
    // O cookie leva a ligação (segredo); o state do URL é só o hash dela.
    const ligacao = frasco.valores.get('mapa-login') as string;
    expect(ligacao).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ligacao).not.toBe(estado);
    expect(estadoDaLigacao(ligacao)).toBe(estado);
    expect(microsoft.href).not.toContain(ligacao);
    const pedidos = bd.select().from(esquema.pedidosLogin).all();
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ estado, destino: '/tabela' });
    // O verificador do PKCE nunca sai do servidor.
    expect(microsoft.href).not.toContain(pedidos[0]?.verificador as string);

    const retorno = await voltarDaMicrosoft(microsoft, { utilizador: ANA });
    const r = await pedir(app, frasco, retorno.pathname + retorno.search);
    expect(r.status).toBe(302);
    expect(onde(r)).toBe('/tabela');
    expect(frasco.valores.has('mapa-login')).toBe(false);
    const token = frasco.valores.get('mapa-sessao') as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // O pedido foi usado e apagado; na BD só fica o hash do token.
    expect(bd.select().from(esquema.pedidosLogin).all()).toHaveLength(0);
    expect(
      bd
        .select()
        .from(esquema.sessoes)
        .all()
        .map((s) => s.id),
    ).toStrictEqual([hashToken(token)]);
    expect(bd.select().from(esquema.utilizadores).all()).toMatchObject([
      { id: ANA, email: 'ana.exemplo@exemplo.test', nome: 'Ana Exemplo' },
    ]);

    const eu = await pedir(app, frasco, '/api/auth/eu');
    expect(eu.status).toBe(200);
    expect(await eu.json()).toStrictEqual({
      chave: 'ana.exemplo@exemplo.test',
      nome: 'Ana Exemplo',
      email: 'ana.exemplo@exemplo.test',
      modo: 'entra',
    } satisfies Utilizador);

    expect((await pedir(app, frasco, '/api/estado')).status).toBe(200);

    const gravado = await postarLote(app, frasco);
    expect(gravado.status).toBe(201);
    expect(await gravado.json()).toStrictEqual({ loteId: 2, versao: 2 });
    expect(bd.select().from(esquema.lotes).all().at(-1)?.autor).toBe('ana.exemplo@exemplo.test');
    expect(eventos.publicados).toStrictEqual([
      { versao: 2, loteId: 2, autor: 'ana.exemplo@exemplo.test', autorNome: 'Ana Exemplo', alteracoes: 1 },
    ]);

    const historico = (await (await pedir(app, frasco, '/api/historico')).json()) as EntradaHistorico[];
    expect(historico.map((h) => [h.autor, h.autorNome])).toStrictEqual([
      ['ana.exemplo@exemplo.test', 'Ana Exemplo'],
      ['teste', 'teste'],
    ]);

    const sair = await pedir(app, frasco, '/api/auth/sair', { method: 'POST', headers: { Origin: PUBLICO } });
    expect(sair.status).toBe(204);
    expect(frasco.valores.has('mapa-sessao')).toBe(false);
    expect(bd.select().from(esquema.sessoes).all()).toHaveLength(0);

    // Mesmo quem guardou o token antigo já não entra.
    const depois = await app.request(`${PUBLICO}/api/estado`, {
      headers: { Cookie: `mapa-sessao=${token}` },
    });
    expect(depois.status).toBe(401);
    expect((await pedir(app, frasco, '/api/auth/eu')).status).toBe(401);

    // Nada de tokens, códigos ou segredos na consola.
    const texto = registos();
    for (const segredo of [token, estado, provedor.segredo, retorno.searchParams.get('code') as string]) {
      expect(texto).not.toContain(segredo);
    }
  });

  it('cookies: HttpOnly, SameSite=Lax, sem Secure em http; o do pedido só em /api/auth e por 10 minutos', async () => {
    const { app } = novaApp();
    const frasco = new Frasco();
    const r = await pedir(app, frasco, '/api/auth/entrar');
    const login = r.headers.getSetCookie().find((c) => c.startsWith('mapa-login=')) as string;
    expect(login).toMatch(/HttpOnly/);
    expect(login).toMatch(/SameSite=Lax/);
    expect(login).toMatch(/Max-Age=600/);
    expect(login).toMatch(/Path=\/api\/auth/);
    expect(login).not.toMatch(/Secure/);

    const retorno = await voltarDaMicrosoft(new URL(onde(r)), { utilizador: ANA });
    const fim = await pedir(app, frasco, retorno.pathname + retorno.search);
    const sessao = fim.headers.getSetCookie().find((c) => c.startsWith('mapa-sessao=')) as string;
    expect(sessao).toMatch(/HttpOnly/);
    expect(sessao).toMatch(/SameSite=Lax/);
    expect(sessao).toMatch(/Path=\/(;|$)/);
    expect(sessao).toMatch(/Max-Age=7776000/);
    expect(sessao).not.toMatch(/Secure|Domain/);
    expect(fim.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('em https: cookies __Host- com Secure, HSTS e CSP com upgrade-insecure-requests', async () => {
    const publico = 'https://mapa.exemplo.test';
    const { app } = novaApp(configEntra({ enderecoPublico: publico }));
    const frasco = new Frasco();
    const ida = await pedir(app, frasco, '/api/auth/entrar', {}, publico);
    // O do pedido também tem o prefixo (não se planta de um subdomínio nem por http); obriga a Path=/.
    const login = ida.headers.getSetCookie().find((c) => c.startsWith('__Host-mapa-login=')) as string;
    expect(login).toMatch(/Secure/);
    expect(login).toMatch(/HttpOnly/);
    expect(login).toMatch(/Path=\/(;|$)/);
    expect(login).not.toMatch(/Domain/);
    const retorno = await voltarDaMicrosoft(new URL(onde(ida)), { utilizador: ANA });
    const r = await pedir(app, frasco, retorno.pathname + retorno.search, {}, publico);
    expect(frasco.valores.has('__Host-mapa-login')).toBe(false);
    expect(r.status).toBe(302);
    const sessao = r.headers.getSetCookie().find((c) => c.startsWith('__Host-mapa-sessao=')) as string;
    expect(sessao).toMatch(/Secure/);
    expect(sessao).toMatch(/Path=\/(;|$)/);
    expect(sessao).not.toMatch(/Domain/);
    expect(r.headers.get('Strict-Transport-Security')).toBe(HSTS);
    expect((await pedir(app, frasco, '/api/estado', {}, publico)).status).toBe(200);
    expect(politicaConteudo(true)).toMatch(/; upgrade-insecure-requests$/);
    expect(politicaConteudo(false)).not.toMatch(/upgrade-insecure-requests/);
  });

  it('o destino só pode ser um caminho deste site', async () => {
    const { app } = novaApp();
    for (const destino of [
      '//atacante.example',
      'https://atacante.example',
      '/\\atacante.example',
      '/api/estado',
    ]) {
      const r = await entrar(app, new Frasco(), { utilizador: ANA }, destino);
      expect(onde(r), destino).toBe('/');
    }
  });

  it('entrar outra vez cria uma sessão nova e apaga a antiga do mesmo browser', async () => {
    const { app } = novaApp();
    const frasco = new Frasco();
    await entrar(app, frasco);
    const primeiro = frasco.valores.get('mapa-sessao');
    await entrar(app, frasco);
    expect(frasco.valores.get('mapa-sessao')).not.toBe(primeiro);
    expect(bd.select().from(esquema.sessoes).all()).toHaveLength(1);
  });

  it('um e-mail que reaparece com outro oid substitui o registo antigo (e as sessões dele)', async () => {
    const { app } = novaApp();
    bd.insert(esquema.utilizadores)
      .values({
        id: 'oid-antigo',
        email: 'ana.exemplo@exemplo.test',
        nome: 'Ana Antiga',
        criadoEm: '2026-01-01T00:00:00.000Z',
        ultimaEntradaEm: '2026-01-01T00:00:00.000Z',
      })
      .run();
    await entrar(app, new Frasco());
    expect(bd.select().from(esquema.utilizadores).all()).toMatchObject([{ id: ANA, nome: 'Ana Exemplo' }]);
  });
});

describe('recusas do retorno', () => {
  it('quem só tem o URL de retorno não acaba o login noutro browser (nem pondo o state no cookie)', async () => {
    const { app } = novaApp();
    const vitima = new Frasco();
    const retorno = await voltarDaMicrosoft(await irAMicrosoft(app, vitima), { utilizador: ANA });
    const estado = retorno.searchParams.get('state') as string;
    // O atacante copia o state do URL para o cookie do pedido, num browser sem nada da vítima.
    const r = await app.request(`${PUBLICO}${retorno.pathname}${retorno.search}`, {
      headers: { Cookie: `mapa-login=${estado}` },
    });
    expect(onde(r)).toBe('/?erro-entrada=falhou');
    expect(r.headers.getSetCookie().some((c) => c.startsWith('mapa-sessao='))).toBe(false);
    expect(bd.select().from(esquema.sessoes).all()).toHaveLength(0);
    // O pedido da vítima não foi gasto: no browser dela o login acaba bem.
    expect(onde(await pedir(app, vitima, retorno.pathname + retorno.search))).toBe('/tabela');
  });

  it('o retorno de outra pessoa não entra no browser de quem tem um pedido seu (login CSRF)', async () => {
    const { app } = novaApp();
    const atacante = new Frasco();
    const retornoAtacante = await voltarDaMicrosoft(await irAMicrosoft(app, atacante), { utilizador: RUI });
    const vitima = new Frasco();
    await irAMicrosoft(app, vitima);
    const r = await pedir(app, vitima, retornoAtacante.pathname + retornoAtacante.search);
    expect(onde(r)).toBe('/?erro-entrada=falhou');
    expect(vitima.valores.has('mapa-sessao')).toBe(false);
  });

  it('state diferente do cookie → falhou, sem sessão', async () => {
    const { app } = novaApp();
    const frasco = new Frasco();
    const retorno = await voltarDaMicrosoft(await irAMicrosoft(app, frasco), { utilizador: ANA });
    retorno.searchParams.set('state', 'outro-state');
    const r = await pedir(app, frasco, retorno.pathname + retorno.search);
    expect(onde(r)).toBe('/?erro-entrada=falhou');
    expect(frasco.valores.has('mapa-sessao')).toBe(false);
  });

  it('sem o cookie do pedido (outro browser, ou passou o prazo) → expirou', async () => {
    const { app } = novaApp();
    const retorno = await voltarDaMicrosoft(await irAMicrosoft(app, new Frasco()), { utilizador: ANA });
    const outroBrowser = new Frasco();
    const r = await pedir(app, outroBrowser, retorno.pathname + retorno.search);
    expect(onde(r)).toBe('/?erro-entrada=expirou');
    expect(outroBrowser.valores.has('mapa-sessao')).toBe(false);
  });

  it('o mesmo retorno repetido não serve (uso único) → expirou', async () => {
    const { app } = novaApp();
    const frasco = new Frasco();
    const retorno = await voltarDaMicrosoft(await irAMicrosoft(app, frasco), { utilizador: ANA });
    const cookie = frasco.cabecalho();
    expect(onde(await pedir(app, frasco, retorno.pathname + retorno.search))).toBe('/tabela');
    const repetido = await app.request(`${PUBLICO}${retorno.pathname}${retorno.search}`, {
      headers: { Cookie: cookie },
    });
    expect(onde(repetido)).toBe('/?erro-entrada=expirou');
    expect(bd.select().from(esquema.sessoes).all()).toHaveLength(1);
  });

  it('pedido com mais de 10 minutos → expirou (e é apagado)', async () => {
    const { app } = novaApp();
    const frasco = new Frasco();
    const retorno = await voltarDaMicrosoft(await irAMicrosoft(app, frasco), { utilizador: ANA });
    relogio = new Date(relogio.getTime() + 10 * 60 * 1000 + 1);
    const r = await pedir(app, frasco, retorno.pathname + retorno.search);
    expect(onde(r)).toBe('/?erro-entrada=expirou');
    expect(bd.select().from(esquema.pedidosLogin).all()).toHaveLength(0);
  });

  it('nonce errado no ID token → falhou', async () => {
    const { app } = novaApp();
    const r = await entrar(app, new Frasco(), { utilizador: ANA, falso_nonce: 'nonce-de-outro' });
    expect(onde(r)).toBe('/?erro-entrada=falhou');
    // Recusado pela validação do ID token (openid-client), não por outra coisa qualquer.
    expect(registos()).toMatch(/validação do regresso falhou \(.*JWT_CLAIM_COMPARISON/);
    expect(bd.select().from(esquema.sessoes).all()).toHaveLength(0);
  });

  it('ID token assinado com outra chave (mesmas claims e kid) → falhou', async () => {
    const real = fetchFalso;
    const { privateKey: outraChave } = await generateKeyPair('RS256');
    fetchFalso = async (url, opcoes) => {
      const r = await real(url, opcoes);
      if (!url.endsWith('/token') || r.status !== 200) return r;
      const corpo = (await r.json()) as { id_token: string };
      const cabecalho = decodeProtectedHeader(corpo.id_token);
      corpo.id_token = await new SignJWT(decodeJwt(corpo.id_token))
        .setProtectedHeader({ alg: 'RS256', kid: cabecalho.kid as string, typ: 'JWT' })
        .sign(outraChave);
      return Response.json(corpo);
    };
    const { app } = novaApp();
    const r = await entrar(app, new Frasco());
    expect(onde(r)).toBe('/?erro-entrada=falhou');
    expect(bd.select().from(esquema.sessoes).all()).toHaveLength(0);
  });

  it('código adulterado (o fornecedor recusa o código) → falhou', async () => {
    const { app } = novaApp();
    const frasco = new Frasco();
    const retorno = await voltarDaMicrosoft(await irAMicrosoft(app, frasco), { utilizador: ANA });
    retorno.searchParams.set('code', 'codigo-inventado');
    expect(onde(await pedir(app, frasco, retorno.pathname + retorno.search))).toBe('/?erro-entrada=falhou');
  });

  it('conta de outro inquilino (tid) → sem-acesso', async () => {
    const { app } = novaApp();
    const r = await entrar(app, new Frasco(), {
      utilizador: ANA,
      falso_tid: '11111111-1111-4111-8111-111111111111',
    });
    expect(onde(r)).toBe('/?erro-entrada=sem-acesso');
    expect(registos()).toMatch(/outro inquilino/);
    expect(bd.select().from(esquema.utilizadores).all()).toHaveLength(0);
  });

  it('fora de UTILIZADORES_PERMITIDOS → sem-acesso; quem está na lista entra', async () => {
    const { app } = novaApp(configEntra({ utilizadoresPermitidos: ['rui.ficticio@exemplo.test'] }));
    expect(onde(await entrar(app, new Frasco(), { utilizador: ANA }))).toBe('/?erro-entrada=sem-acesso');
    expect(onde(await entrar(app, new Frasco(), { utilizador: RUI }))).toBe('/tabela');
    // Os registos dizem porquê, sem o e-mail.
    expect(registos()).toMatch(/UTILIZADORES_PERMITIDOS/);
    expect(registos()).not.toContain('ana.exemplo@exemplo.test');
  });

  it('quem sai de UTILIZADORES_PERMITIDOS perde logo a sessão aberta', async () => {
    const frasco = new Frasco();
    await entrar(novaApp().app, frasco, { utilizador: RUI });
    const { app } = novaApp(configEntra({ utilizadoresPermitidos: ['ana.exemplo@exemplo.test'] }));
    expect((await pedir(app, frasco, '/api/estado')).status).toBe(401);
    expect(bd.select().from(esquema.sessoes).all()).toHaveLength(0);
  });

  it('a pessoa cancela na Microsoft (access_denied) → cancelado', async () => {
    const { app } = novaApp();
    expect(onde(await entrar(app, new Frasco(), { cancelar: '1' }))).toBe('/?erro-entrada=cancelado');
  });

  it('códigos de erro da Microsoft', () => {
    expect(codigoDoErroMicrosoft('access_denied', undefined)).toBe('cancelado');
    expect(codigoDoErroMicrosoft('access_denied', 'AADSTS50105: not assigned')).toBe('sem-acesso');
    expect(codigoDoErroMicrosoft('invalid_request', 'AADSTS50020: other tenant')).toBe('sem-acesso');
    expect(codigoDoErroMicrosoft('server_error', undefined)).toBe('falhou');
  });
});

describe('pedidos de login', () => {
  it('a Microsoft não responde → falhou; da vez seguinte volta a tentar', async () => {
    let falhar = true;
    const real = fetchFalso;
    fetchFalso = (url, opcoes) =>
      falhar ? Promise.reject(new TypeError('fetch failed')) : real(url, opcoes);
    const { app } = novaApp();
    const r = await pedir(app, new Frasco(), '/api/auth/entrar');
    expect(r.status).toBe(302);
    expect(onde(r)).toBe('/?erro-entrada=falhou');
    expect(bd.select().from(esquema.pedidosLogin).all()).toHaveLength(0);
    falhar = false;
    expect(onde(await entrar(app, new Frasco()))).toBe('/tabela');
  });

  it('a descoberta do emissor faz-se uma vez e fica em cache', async () => {
    const pedidos: string[] = [];
    const real = fetchFalso;
    fetchFalso = (url, opcoes) => {
      pedidos.push(new URL(url).pathname);
      return real(url, opcoes);
    };
    const { app } = novaApp();
    expect(onde(await entrar(app, new Frasco()))).toBe('/tabela');
    expect(onde(await entrar(app, new Frasco(), { utilizador: RUI }))).toBe('/tabela');
    expect(pedidos.filter((p) => p === '/.well-known/openid-configuration')).toHaveLength(1);
    // As chaves (para a assinatura do ID token) também ficam em cache.
    expect(pedidos.filter((p) => p === '/jwks')).toHaveLength(1);
    expect(pedidos.filter((p) => p === '/token')).toHaveLength(2);
  });

  it(`no máximo ${MAX_PEDIDOS_PENDENTES} pendentes: saem os mais antigos, nunca se recusa quem chega`, async () => {
    const { app } = novaApp();
    // Um login a meio e, depois dele, a tabela cheia de pedidos anónimos.
    const frasco = new Frasco();
    const retorno = await voltarDaMicrosoft(await irAMicrosoft(app, frasco), { utilizador: ANA });
    relogio = new Date(relogio.getTime() + 1000);
    const criadoEm = relogio.toISOString();
    const linhas = Array.from({ length: MAX_PEDIDOS_PENDENTES }, (_, i) => ({
      estado: `e${i}`,
      nonce: 'n',
      verificador: 'v',
      destino: '/',
      criadoEm,
    }));
    for (let i = 0; i < linhas.length; i += 100) {
      bd.insert(esquema.pedidosLogin)
        .values(linhas.slice(i, i + 100))
        .run();
    }
    relogio = new Date(relogio.getTime() + 1000);
    const outro = await pedir(app, new Frasco(), '/api/auth/entrar');
    expect(outro.status).toBe(302);
    expect(new URL(onde(outro)).origin).toBe(EMISSOR);
    expect(bd.select().from(esquema.pedidosLogin).all()).toHaveLength(MAX_PEDIDOS_PENDENTES);
    // O mais antigo (o login a meio) saiu para dar lugar.
    expect(onde(await pedir(app, frasco, retorno.pathname + retorno.search))).toBe('/?erro-entrada=expirou');

    // Os de mais de 10 minutos limpam-se.
    relogio = new Date(relogio.getTime() + 10 * 60 * 1000);
    expect((await pedir(app, new Frasco(), '/api/auth/entrar')).status).toBe(302);
    expect(bd.select().from(esquema.pedidosLogin).all()).toHaveLength(1);
  });
});

describe('modo entra: Host, Origin, saúde e tempo real', () => {
  it('Host: só o de ENDERECO_PUBLICO e os ANFITRIOES; a /api/saude fica isenta', async () => {
    const { app } = novaApp(configEntra(), { anfitrioes: ['mapa-cmf.onrender.test'] });
    expect((await app.request('http://atacante.example/api/auth/eu')).status).toBe(403);
    expect((await app.request('http://atacante.example/')).status).toBe(403);
    expect((await app.request('http://localhost:5173/api/auth/eu')).status).toBe(401);
    const saude = await app.request('http://10.0.0.7:10000/api/saude');
    expect(saude.status).toBe(200);
    expect((await app.request('http://mapa-cmf.onrender.test/api/saude')).status).toBe(200);
  });

  it('ANFITRIOES: as leituras vão para o endereço público, onde o login funciona', async () => {
    const outro = 'http://mapa-cmf.onrender.test';
    const { app } = novaApp(configEntra(), { anfitrioes: ['mapa-cmf.onrender.test'] });
    const pagina = await app.request(`${outro}/tabela?x=1`);
    expect(pagina.status).toBe(302);
    expect(onde(pagina)).toBe(`${PUBLICO}/tabela?x=1`);

    // Começar a entrar pelo outro nome leva a entrar pelo público (o cookie do pedido fica lá).
    const frasco = new Frasco();
    const ida = await pedir(app, frasco, '/api/auth/entrar?destino=%2Fquadro', {}, outro);
    expect(onde(ida)).toBe(`${PUBLICO}/api/auth/entrar?destino=%2Fquadro`);
    expect(frasco.valores.size).toBe(0);
    expect(onde(await entrar(app, frasco, { utilizador: ANA }, '/quadro'))).toBe('/quadro');

    // Gravar pelo outro nome continua recusado (a origem não é a pública).
    const gravar = await pedir(
      app,
      frasco,
      '/api/lotes',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: outro }, body: '{}' },
      outro,
    );
    expect(gravar.status).toBe(403);
  });

  it('Origin: pedidos que mudam coisas só da origem pública; sem Origin → 403', async () => {
    const { app } = novaApp();
    const frasco = new Frasco();
    await entrar(app, frasco);
    expect((await postarLote(app, frasco, null)).status).toBe(403);
    expect((await postarLote(app, frasco, 'http://localhost:9999')).status).toBe(403);
    expect((await postarLote(app, frasco, 'https://atacante.example')).status).toBe(403);
    expect((await postarLote(app, frasco, 'null')).status).toBe(403);
    expect((await pedir(app, frasco, '/api/auth/sair', { method: 'POST' })).status).toBe(403);
    expect((await postarLote(app, frasco, PUBLICO)).status).toBe(201);
  });

  it('Content-Type JSON continua obrigatório', async () => {
    const { app } = novaApp();
    const frasco = new Frasco();
    await entrar(app, frasco);
    const r = await pedir(app, frasco, '/api/lotes', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Origin: PUBLICO },
      body: '{}',
    });
    expect(r.status).toBe(415);
  });

  it('/api/saude: sem login, sem dados pessoais, só a parte pública das cópias', async () => {
    const estadoCopias: EstadoCopias = {
      ativas: true,
      ultimaCopiaEm: '2026-10-04T08:00:00.000Z',
      atrasada: false,
      destino: 's3',
      ultimaTentativaEm: '2026-10-04T08:00:00.000Z',
      ultimoErro: 'detalhe interno',
    };
    const { app } = novaApp(configEntra(), { copias: { estado: () => estadoCopias } });
    const r = await app.request(`${PUBLICO}/api/saude`);
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(corpo).sort()).toStrictEqual(['copias', 'geradoEm', 'ok', 'versao']);
    expect(corpo.copias).toStrictEqual({
      ativas: true,
      ultimaCopiaEm: '2026-10-04T08:00:00.000Z',
      atrasada: false,
    } satisfies EstadoCopiasPublico);
  });

  it('/api/eventos exige sessão; com ela responde com a versão atual', async () => {
    const { app, eventos } = novaApp();
    const frasco = new Frasco();
    expect((await pedir(app, frasco, '/api/eventos')).status).toBe(401);
    expect(eventos.versoes).toStrictEqual([]);
    await entrar(app, frasco);
    const r = await pedir(app, frasco, '/api/eventos');
    expect(r.status).toBe(200);
    expect(eventos.versoes).toStrictEqual([1]);
  });

  describe('com o canal de eventos real', () => {
    let canal: CanalEventos;
    beforeEach(() => {
      // Sinal de vida raro: não se mistura com o que os testes leem.
      canal = criarCanalEventos({ intervaloSinalMs: 24 * 60 * 60 * 1000 });
    });
    afterEach(() => canal.fechar());

    /** Abre /api/eventos e lê o primeiro bloco (retry + versão). */
    async function ligar(app: App, frasco: Frasco) {
      const r = await pedir(app, frasco, '/api/eventos');
      expect(r.status).toBe(200);
      const leitor = (r.body as ReadableStream<Uint8Array>).getReader();
      const primeiro = await leitor.read();
      expect(new TextDecoder().decode(primeiro.value)).toContain('event: versao');
      return leitor;
    }

    /** Lê até ao fim do stream (ou até chegar um lote) e devolve o texto. */
    async function lerAteAoFim(leitor: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
      let texto = '';
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) return texto;
        texto += new TextDecoder().decode(value);
      }
    }

    it('sair corta as ligações abertas dessa sessão: não recebe mais lotes', async () => {
      const { app } = novaApp(configEntra(), { eventos: canal });
      const ana = new Frasco();
      const rui = new Frasco();
      await entrar(app, ana);
      await entrar(app, rui, { utilizador: RUI });
      const leitorAna = await ligar(app, ana);
      const leitorRui = await ligar(app, rui);
      expect(canal.ligacoes()).toBe(2);

      expect(
        (await pedir(app, ana, '/api/auth/sair', { method: 'POST', headers: { Origin: PUBLICO } })).status,
      ).toBe(204);
      expect(await lerAteAoFim(leitorAna)).toBe('');
      expect(canal.ligacoes()).toBe(1);

      // O Rui grava: a ligação dele recebe o lote; a da Ana já não existe.
      expect((await postarLote(app, rui)).status).toBe(201);
      const lote = await leitorRui.read();
      expect(new TextDecoder().decode(lote.value)).toContain('event: lote');
      await leitorRui.cancel();
    });

    it('a revisão periódica corta as ligações de sessões que acabaram (prazo ou apagadas)', async () => {
      const { app } = novaApp(configEntra(), { eventos: canal });
      const ana = new Frasco();
      await entrar(app, ana);
      // Antes de ligar: o temporizador da revisão arranca com a primeira ligação.
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      try {
        const leitor = await ligar(app, ana);
        // Ainda vale: nada muda.
        vi.advanceTimersByTime(INTERVALO_REVISAO_LIGACOES_MS);
        expect(canal.ligacoes()).toBe(1);
        // 31 dias sem uso: na revisão seguinte a ligação é cortada.
        relogio = new Date(relogio.getTime() + 31 * 24 * 60 * 60 * 1000);
        vi.advanceTimersByTime(INTERVALO_REVISAO_LIGACOES_MS);
        expect(await lerAteAoFim(leitor)).toBe('');
        expect(canal.ligacoes()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('um pedido com a sessão já apagada também corta as ligações dela', async () => {
      const { app } = novaApp(configEntra(), { eventos: canal });
      const ana = new Frasco();
      await entrar(app, ana);
      const leitor = await ligar(app, ana);
      bd.delete(esquema.sessoes).run();
      expect((await pedir(app, ana, '/api/estado')).status).toBe(401);
      expect(await lerAteAoFim(leitor)).toBe('');
      expect(canal.ligacoes()).toBe(0);
    });
  });

  it('rotas desconhecidas da API também exigem sessão', async () => {
    const { app } = novaApp();
    for (const caminho of ['/api/nada', '/api/historico', '/api']) {
      expect((await app.request(`${PUBLICO}${caminho}`)).status, caminho).toBe(401);
    }
  });
});

describe('modo local', () => {
  it('não há login: eu é "Este computador", entrar/retorno vão para / e sair dá 204', async () => {
    const { app } = novaApp({ modo: 'local' });
    const eu = await app.request('/api/auth/eu');
    expect(eu.status).toBe(200);
    expect(await eu.json()).toStrictEqual({
      chave: 'local',
      nome: 'Este computador',
      email: null,
      modo: 'local',
    });
    for (const caminho of ['/api/auth/entrar?destino=/tabela', '/api/auth/retorno?code=x&state=y']) {
      const r = await app.request(caminho);
      expect(r.status, caminho).toBe(302);
      expect(onde(r), caminho).toBe('/');
    }
    expect((await app.request('/api/auth/sair', { method: 'POST' })).status).toBe(204);
  });

  it('grava com o autor "local" e publica o lote no tempo real', async () => {
    const { app, eventos } = novaApp({ modo: 'local' });
    const r = await postarLote(app, new Frasco(), 'http://localhost:5173');
    expect(r.status).toBe(201);
    expect(bd.select().from(esquema.lotes).all().at(-1)?.autor).toBe('local');
    expect(eventos.publicados).toStrictEqual([
      { versao: 2, loteId: 2, autor: 'local', autorNome: 'Este computador', alteracoes: 1 },
    ]);
    expect((await app.request('/api/eventos')).status).toBe(200);
    expect(eventos.versoes).toStrictEqual([2]);
  });

  it('sem canal de eventos, /api/eventos dá 503 e gravar continua a funcionar', async () => {
    const app = criarApp({ bd });
    expect((await app.request('/api/eventos')).status).toBe(503);
    expect((await postarLote(app, new Frasco(), null)).status).toBe(201);
  });
});

describe('fornecedor falso', () => {
  it('recusa arrancar em produção', async () => {
    await expect(criarProvedorFalso({ emissor: EMISSOR, env: { NODE_ENV: 'production' } })).rejects.toThrow(
      /produção/,
    );
  });

  it('o /token recusa segredo errado, código inexistente e PKCE errado', async () => {
    const uriRetorno = `${PUBLICO}/api/auth/retorno`;
    const verificador = 'verificador-ficticio-com-mais-de-quarenta-e-tres-caracteres-0001';
    /** Código válido, pedido com o desafio do verificador acima. */
    async function novoCodigo(): Promise<string> {
      const url = new URL(`${EMISSOR}/authorize`);
      url.search = new URLSearchParams({
        client_id: provedor.cliente,
        redirect_uri: uriRetorno,
        response_type: 'code',
        scope: 'openid',
        code_challenge: createHash('sha256').update(verificador).digest('base64url'),
        code_challenge_method: 'S256',
        nonce: 'n',
        state: 's',
        utilizador: ANA,
      }).toString();
      const r = await provedor.app.request(url.href);
      return new URL(onde(r)).searchParams.get('code') as string;
    }
    const corpo = (extra: Record<string, string>) =>
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'x',
        redirect_uri: uriRetorno,
        client_id: provedor.cliente,
        client_secret: provedor.segredo,
        code_verifier: verificador,
        ...extra,
      });
    const trocar = (extra: Record<string, string>) =>
      provedor.app.request('/token', { method: 'POST', body: corpo(extra) });

    expect((await trocar({ code: await novoCodigo(), client_secret: 'x' })).status).toBe(401);
    expect(await (await trocar({})).json()).toMatchObject({ error: 'invalid_grant' });
    const pkceErrado = await trocar({ code: await novoCodigo(), code_verifier: `${verificador}-errado` });
    expect(await pkceErrado.json()).toStrictEqual({
      error: 'invalid_grant',
      error_description: 'PKCE: code_verifier errado.',
    });
    const certo = await trocar({ code: await novoCodigo() });
    expect(certo.status).toBe(200);
    expect(await certo.json()).toHaveProperty('id_token');
  });
});
