// A aplicação Hono: API de leitura do M0 e, em produção, os ficheiros do browser (dist/cliente).
// Em desenvolvimento o browser é servido pelo Vite (porta 5173), que encaminha /api para aqui.

import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { Bd } from './db/ligacao';
import { carregarEstado, contarPessoas, lerVersao } from './estado';

export interface OpcoesApp {
  bd: Bd;
  /** Pasta com o build do browser (com index.html). Sem ela, só há API. */
  pastaCliente?: string;
  /**
   * Nomes aceites no cabeçalho Host (ex.: localhost). Sem login, um site malicioso aberto no
   * browser podia ler a API por "DNS rebinding" (um domínio dele a apontar para 127.0.0.1);
   * nesse caso o Host é o domínio dele e o pedido é recusado. Sem esta opção não se verifica.
   */
  anfitrioes?: string[];
}

/**
 * Política de conteúdo das páginas HTML. Os mosaicos do mapa vêm do OpenStreetMap;
 * 'unsafe-inline' nos estilos é preciso para o Leaflet (posiciona tudo com style="…").
 */
export const POLITICA_CONTEUDO = [
  "default-src 'self'",
  "img-src 'self' data: https://tile.openstreetmap.org",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * O OpenStreetMap recusa (403) mosaicos pedidos sem Referer, por isso não pode ser o
 * "no-referrer" que o secureHeaders põe por omissão. Assim só vai a origem, nunca o caminho.
 */
export const POLITICA_REFERER = 'strict-origin-when-cross-origin';

/** Último segmento do caminho com extensão (ex.: /assets/app-1a2b.js): é um ficheiro, não uma rota. */
function pareceFicheiro(caminho: string): boolean {
  return /\.[^/]*$/.test(caminho);
}

export function criarApp({ bd, pastaCliente, anfitrioes }: OpcoesApp): Hono {
  const app = new Hono();

  app.use('*', secureHeaders({ referrerPolicy: POLITICA_REFERER }));

  // Os dados mudam e têm dados pessoais: nunca ficam em cache.
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  if (anfitrioes) {
    const aceites = new Set(anfitrioes.map((a) => a.toLowerCase()));
    app.use('*', async (c, next) => {
      // O URL do pedido é montado a partir do cabeçalho Host (@hono/node-server).
      if (!aceites.has(new URL(c.req.url).hostname)) {
        return c.json({ erro: 'Endereço não permitido.' }, 403);
      }
      await next();
    });
  }

  app.get('/api/estado', (c) => c.json(carregarEstado(bd)));

  app.get('/api/saude', (c) => {
    try {
      return c.json({
        ok: true,
        versao: lerVersao(bd),
        pessoas: contarPessoas(bd),
        geradoEm: new Date().toISOString(),
      });
    } catch (erro) {
      console.error('Saúde: a base de dados não respondeu.', erro);
      return c.json({ ok: false, erro: 'A base de dados não está disponível.' }, 503);
    }
  });

  app.all('/api/*', (c) => c.json({ erro: 'Rota da API desconhecida.' }, 404));

  if (pastaCliente) {
    app.get('*', async (c, next) => {
      await next();
      const tipo = c.res.headers.get('Content-Type') ?? '';
      if (tipo.startsWith('text/html')) {
        c.header('Content-Security-Policy', POLITICA_CONTEUDO);
        // O index.html aponta para os ficheiros do build atual: tem de ser sempre revalidado.
        c.header('Cache-Control', 'no-cache');
      } else if (c.res.status === 200 && c.req.path.startsWith('/assets/')) {
        // Os ficheiros de /assets têm o hash no nome: podem ficar em cache para sempre.
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      }
    });
    app.get('*', serveStatic({ root: pastaCliente }));
    // Fallback da SPA: qualquer rota que não seja um ficheiro abre o index.html.
    const indice = serveStatic({ root: pastaCliente, path: 'index.html' });
    app.get('*', (c, next) => (pareceFicheiro(c.req.path) ? next() : indice(c, next)));
  }

  app.notFound((c) => c.json({ erro: 'Não encontrado.' }, 404));

  app.onError((erro, c) => {
    if (erro instanceof HTTPException && erro.status < 500) {
      return c.json({ erro: erro.message || 'Pedido inválido.' }, erro.status);
    }
    console.error(`Erro em ${c.req.method} ${c.req.path}:`, erro);
    return c.json({ erro: 'Erro interno do servidor.' }, 500);
  });

  return app;
}
