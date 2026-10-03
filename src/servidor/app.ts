// A aplicação Hono: a API (estado, gravação de lotes, histórico) e, em produção, os ficheiros do
// browser (dist/cliente). Em desenvolvimento o browser é servido pelo Vite (porta 5173), que
// encaminha /api para aqui.

import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { Bd } from './db/ligacao';
import { carregarEstado, contarPessoas, lerVersao } from './estado';
import { gravarLote, lerHistorico } from './lotes';
import { eJson, lerLimiteHistorico, lerPedidoGuardar, origemLocal } from './pedidos';

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
  /** Relógio (os testes fixam a hora). */
  agora?: () => Date;
}

/** Tamanho máximo do corpo de POST /api/lotes (500 operações cabem folgadamente). */
export const TAMANHO_MAXIMO_LOTE = 100 * 1024;

/** Autor dos lotes enquanto não há login. No M1 passa a ser o utilizador com sessão iniciada. */
export const AUTOR_SEM_LOGIN = 'local';

/** Métodos que não mudam nada: não precisam da verificação da origem. */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

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

export function criarApp({ bd, pastaCliente, anfitrioes, agora = () => new Date() }: OpcoesApp): Hono {
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

  // Proteção CSRF enquanto não há login: um site aberto no browser não pode gravar através do PC.
  // O browser manda sempre Origin nos POST; sem ele (curl, testes) não há página nenhuma a abusar.
  app.use('/api/*', async (c, next) => {
    const origem = c.req.header('Origin');
    if (!METODOS_SEGUROS.has(c.req.method) && origem !== undefined && !origemLocal(origem)) {
      return c.json({ erro: 'Pedido recusado: a página não é deste computador.' }, 403);
    }
    await next();
  });

  app.get('/api/estado', (c) => c.json(carregarEstado(bd)));

  app.post(
    '/api/lotes',
    async (c, next) => {
      if (!eJson(c.req.header('Content-Type'))) {
        return c.json({ erro: 'O pedido tem de ser JSON (Content-Type: application/json).' }, 415);
      }
      await next();
    },
    bodyLimit({
      maxSize: TAMANHO_MAXIMO_LOTE,
      onError: (c) => c.json({ erro: 'Pedido demasiado grande: grava menos alterações de cada vez.' }, 413),
    }),
    async (c) => {
      let corpo: unknown;
      try {
        corpo = await c.req.json();
      } catch {
        return c.json({ erro: 'O corpo do pedido não é JSON válido.' }, 400);
      }
      const pedido = lerPedidoGuardar(corpo);
      if (!pedido.ok) return c.json({ erro: 'Pedido inválido.', erros: pedido.erros }, 400);

      const { operacoes, comentario, versaoBase } = pedido.valor;
      const r = gravarLote(bd, { operacoes, comentario, versaoBase, autor: AUTOR_SEM_LOGIN, agora: agora() });
      switch (r.tipo) {
        case 'gravado':
          return c.json({ loteId: r.loteId, versao: r.versao }, 201);
        case 'vazio':
          return c.json({ erro: 'Não há nada para gravar: as mudanças anulam-se umas às outras.' }, 400);
        case 'invalido':
          return c.json(
            { erro: 'Há mudanças que não se podem gravar. Nada foi gravado.', erros: r.erros },
            400,
          );
        case 'conflito':
          return c.json(
            {
              erro: r.conflitos.some((cf) => cf.tipo === 'condutor')
                ? 'Alguém mudou entretanto algumas destas pessoas ou carrinhas. Nada foi gravado.'
                : 'Alguém mudou entretanto algumas destas pessoas. Nada foi gravado.',
              conflitos: r.conflitos,
            },
            409,
          );
      }
    },
  );

  app.get('/api/historico', (c) => {
    const limite = lerLimiteHistorico(c.req.query('limite'));
    if (limite === null)
      return c.json({ erro: 'O limite tem de ser um número inteiro maior do que zero.' }, 400);
    return c.json(lerHistorico(bd, limite, agora()));
  });

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
