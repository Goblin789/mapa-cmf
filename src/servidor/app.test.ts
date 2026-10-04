import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Estado } from '../dominio/tipos';
import { criarApp, POLITICA_CONTEUDO } from './app';
import { inserirDadosFicticios, inserirLotes } from './dados-de-teste';
import { abrirBd, type Bd } from './db/ligacao';
import { carregarEstado } from './estado';

const HTML =
  '<!doctype html><html><body><div id="raiz"></div><script type="module" src="/assets/app-1a2b.js"></script></body></html>';
const JS = 'console.log("ola");';

let bd: Bd;

beforeEach(() => {
  bd = abrirBd(':memory:');
});

afterEach(() => {
  if (bd.$client.open) bd.$client.close();
  vi.restoreAllMocks();
});

describe('GET /api/estado', () => {
  it('devolve o estado em JSON, sem cache', async () => {
    inserirDadosFicticios(bd);
    inserirLotes(bd, 2);
    const resposta = await criarApp({ bd }).request('/api/estado');

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');

    const estado = (await resposta.json()) as Estado;
    const esperado = carregarEstado(bd);
    expect({ ...estado, geradoEm: '' }).toStrictEqual({ ...esperado, geradoEm: '' });
    expect(estado.versao).toBe(2);
    expect(estado.pessoas.map((p) => p.nomeCurto)).toStrictEqual([
      'Álvaro Exemplo',
      'Bruno Fictício',
      'Élia Modelo',
      'Zé Teste',
    ]);
    // Booleanos e listas chegam ao browser com o tipo certo, não como 0/1 ou texto.
    expect(estado.carrinhas[1]?.temporaria).toBe(true);
    expect(estado.carrinhas[1]?.matriculasAlternativas).toStrictEqual(['ZZ9999']);
    expect(estado.pessoas[0]?.casaId).toBeNull();
  });

  it('erro na base de dados dá 500 em JSON, sem detalhes nem stack trace', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    bd.$client.close();
    const resposta = await criarApp({ bd }).request('/api/estado');

    expect(resposta.status).toBe(500);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    expect(resposta.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    const corpo = await resposta.text();
    expect(JSON.parse(corpo)).toStrictEqual({ erro: 'Erro interno do servidor.' });
    expect(corpo).not.toMatch(/stack|at |database|\.ts/i);
    expect(consola).toHaveBeenCalled();
  });
});

describe('GET /api/saude', () => {
  it('responde ok com a versão, sem dados pessoais (nem a contagem de pessoas)', async () => {
    inserirDadosFicticios(bd);
    inserirLotes(bd, 5);
    const resposta = await criarApp({ bd }).request('/api/saude');

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    const corpo = (await resposta.json()) as Record<string, unknown>;
    expect(corpo).toMatchObject({ ok: true, versao: 5 });
    expect(Object.keys(corpo).sort()).toStrictEqual(['geradoEm', 'ok', 'versao']);
    expect(Number.isNaN(Date.parse(String(corpo.geradoEm)))).toBe(false);
  });

  it('diz o commit da versão quando o servidor o conhece (RENDER_GIT_COMMIT)', async () => {
    const commit = '0123456789abcdef0123456789abcdef01234567';
    const corpo = await (await criarApp({ bd, commit }).request('/api/saude')).json();
    expect(corpo).toMatchObject({ ok: true, commit });
  });

  it('com a base de dados vazia responde ok com a versão 0', async () => {
    const corpo = await (await criarApp({ bd }).request('/api/saude')).json();
    expect(corpo).toMatchObject({ ok: true, versao: 0 });
  });

  it('dá 503 quando a base de dados não responde', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    bd.$client.close();
    const resposta = await criarApp({ bd }).request('/api/saude');

    expect(resposta.status).toBe(503);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    const corpo = (await resposta.json()) as Record<string, unknown>;
    expect(corpo.ok).toBe(false);
    expect(typeof corpo.erro).toBe('string');
    expect(consola).toHaveBeenCalled();
  });
});

describe('rotas desconhecidas', () => {
  it('/api desconhecido dá 404 em JSON', async () => {
    const app = criarApp({ bd });
    for (const [metodo, caminho] of [
      ['GET', '/api/nada'],
      ['GET', '/api'],
      ['POST', '/api/estado'],
    ] as const) {
      const resposta = await app.request(caminho, { method: metodo });
      expect(resposta.status, `${metodo} ${caminho}`).toBe(404);
      expect(resposta.headers.get('Content-Type')).toMatch(/^application\/json/);
      expect(resposta.headers.get('Cache-Control')).toBe('no-store');
      expect(await resposta.json()).toHaveProperty('erro');
    }
  });

  it('sem pasta do browser, o resto também dá 404 em JSON e não há CSP', async () => {
    const resposta = await criarApp({ bd }).request('/');
    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toHaveProperty('erro');
    expect(resposta.headers.get('Content-Security-Policy')).toBeNull();
  });
});

describe('erros', () => {
  it('um erro de pedido (4xx) mantém o código e a mensagem', async () => {
    const app = criarApp({ bd });
    app.get('/teste/recusa', () => {
      throw new HTTPException(400, { message: 'Pedido mal feito.' });
    });
    const resposta = await app.request('/teste/recusa');
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toStrictEqual({ erro: 'Pedido mal feito.' });
  });

  it('um erro inesperado dá 500 genérico e fica registado na consola', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = criarApp({ bd });
    app.get('/teste/rebenta', () => {
      throw new Error('detalhe interno /caminho/secreto');
    });
    const resposta = await app.request('/teste/rebenta');
    expect(resposta.status).toBe(500);
    expect(resposta.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const corpo = await resposta.text();
    expect(JSON.parse(corpo)).toStrictEqual({ erro: 'Erro interno do servidor.' });
    expect(corpo).not.toContain('secreto');
    expect(consola).toHaveBeenCalledWith(expect.stringContaining('/teste/rebenta'), expect.any(Error));
  });
});

describe('cabeçalhos de segurança', () => {
  it('Referrer-Policy deixa passar a origem (o OpenStreetMap recusa mosaicos sem Referer)', async () => {
    const app = criarApp({ bd });
    for (const caminho of ['/api/estado', '/api/saude', '/api/nada', '/qualquer']) {
      const resposta = await app.request(caminho);
      expect(resposta.headers.get('Referrer-Policy'), caminho).toBe('strict-origin-when-cross-origin');
      expect(resposta.headers.get('X-Content-Type-Options'), caminho).toBe('nosniff');
      expect(resposta.headers.get('X-Frame-Options'), caminho).toBe('SAMEORIGIN');
      // Sem login (http no próprio PC) não há HSTS.
      expect(resposta.headers.get('Strict-Transport-Security'), caminho).toBeNull();
    }
  });

  it('com anfitriões definidos, recusa pedidos com outro Host (DNS rebinding)', async () => {
    inserirDadosFicticios(bd);
    const app = criarApp({ bd, anfitrioes: ['localhost', '127.0.0.1', '[::1]'] });

    for (const url of ['http://atacante.example:8787/api/estado', 'http://localhost.atacante.example/']) {
      const resposta = await app.request(url);
      expect(resposta.status, url).toBe(403);
      const corpo = await resposta.text();
      expect(JSON.parse(corpo), url).toHaveProperty('erro');
      expect(corpo, url).not.toContain('Teste');
      expect(resposta.headers.get('Referrer-Policy'), url).toBe('strict-origin-when-cross-origin');
    }

    // O próprio PC e o proxy do Vite (Host: localhost:5173) continuam a funcionar.
    for (const url of [
      'http://localhost:8787/api/estado',
      'http://LOCALHOST:5173/api/estado',
      'http://127.0.0.1:8787/api/estado',
      'http://[::1]:8787/api/estado',
    ]) {
      expect((await app.request(url)).status, url).toBe(200);
    }
  });

  it('a API não leva CSP (em desenvolvimento a página vem do Vite)', async () => {
    const resposta = await criarApp({ bd }).request('/api/estado');
    expect(resposta.headers.get('Content-Security-Policy')).toBeNull();
  });
});

describe('ficheiros do browser (build de produção)', () => {
  let pastaTemp: string;
  let pastaCliente: string;

  beforeEach(() => {
    pastaTemp = mkdtempSync(join(tmpdir(), 'mapa-cmf-teste-'));
    pastaCliente = join(pastaTemp, 'cliente');
    mkdirSync(join(pastaCliente, 'assets'), { recursive: true });
    writeFileSync(join(pastaCliente, 'index.html'), HTML);
    writeFileSync(join(pastaCliente, 'assets', 'app-1a2b.js'), JS);
    writeFileSync(join(pastaTemp, 'segredo.txt'), 'SEGREDO');
  });

  afterEach(() => {
    rmSync(pastaTemp, { recursive: true, force: true });
  });

  it('serve o index.html na raiz, com CSP e sem cache longa', async () => {
    const resposta = await criarApp({ bd, pastaCliente }).request('/');
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Content-Type')).toMatch(/^text\/html/);
    expect(await resposta.text()).toBe(HTML);
    expect(resposta.headers.get('Content-Security-Policy')).toBe(POLITICA_CONTEUDO);
    expect(resposta.headers.get('Cache-Control')).toBe('no-cache');
    expect(resposta.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('a CSP deixa carregar os mosaicos do OpenStreetMap e mais nada de fora', () => {
    expect(POLITICA_CONTEUDO).toBe(
      "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; " +
        "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self' blob:; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; object-src 'none'; form-action 'self'",
    );
  });

  it('rotas da SPA caem no index.html', async () => {
    const app = criarApp({ bd, pastaCliente });
    for (const caminho of ['/pessoa/p-ze', '/casas', '/index.html']) {
      const resposta = await app.request(caminho);
      expect(resposta.status, caminho).toBe(200);
      expect(await resposta.text(), caminho).toBe(HTML);
      expect(resposta.headers.get('Content-Security-Policy'), caminho).toBe(POLITICA_CONTEUDO);
    }
  });

  it('serve os ficheiros de /assets com cache longa e sem CSP', async () => {
    const resposta = await criarApp({ bd, pastaCliente }).request('/assets/app-1a2b.js');
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Content-Type')).toMatch(/javascript/);
    expect(await resposta.text()).toBe(JS);
    expect(resposta.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(resposta.headers.get('Content-Security-Policy')).toBeNull();
    expect(resposta.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('um ficheiro que falta dá 404 (não o index.html)', async () => {
    const resposta = await criarApp({ bd, pastaCliente }).request('/assets/nao-existe.js');
    expect(resposta.status).toBe(404);
    expect(await resposta.text()).not.toContain('<html');
  });

  it('a API continua a responder JSON e /api desconhecido não cai no index.html', async () => {
    const app = criarApp({ bd, pastaCliente });
    const estado = await app.request('/api/estado');
    expect(estado.status).toBe(200);
    expect(estado.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(estado.headers.get('Content-Security-Policy')).toBeNull();

    const desconhecida = await app.request('/api/nada');
    expect(desconhecida.status).toBe(404);
    expect(await desconhecida.json()).toHaveProperty('erro');
  });

  it('não serve ficheiros fora da pasta do browser', async () => {
    const app = criarApp({ bd, pastaCliente });
    for (const caminho of [
      '/../segredo.txt',
      '/..%2fsegredo.txt',
      '/%2e%2e/segredo.txt',
      '/..%5csegredo.txt',
    ]) {
      const resposta = await app.request(caminho);
      expect(await resposta.text(), caminho).not.toContain('SEGREDO');
    }
  });
});
