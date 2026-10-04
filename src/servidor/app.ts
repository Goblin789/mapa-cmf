// A aplicação Hono: a API (estado, gravação de lotes, histórico, tempo real, login) e, em produção, os
// ficheiros do browser (dist/cliente). Em desenvolvimento o browser é servido pelo Vite (porta 5173), que
// encaminha /api para aqui.
//
// Dois modos (docs/m1.md): local (sem login, só o próprio PC, autor 'local') e entra (login Microsoft:
// tudo em /api/* exige sessão, exceto /api/auth/* e /api/saude; o autor é o e-mail de quem grava).

import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { EstadoCopiasPublico, RespostaSaude } from '../dominio/api';
import { type AmbienteApp, type ConfigAuth, criarAutenticacao } from './auth';
import type { FetchOidc } from './auth/oidc';
import type { ServicoCopias } from './copias';
import type { Bd } from './db/ligacao';
import { carregarEstado, lerVersao } from './estado';
import type { CanalEventos } from './eventos';
import { gravarLote, lerHistorico } from './lotes';
import { eJson, lerLimiteHistorico, lerPedidoGuardar, origemLocal } from './pedidos';

export interface OpcoesApp {
  bd: Bd;
  /** Pasta com o build do browser (com index.html). Sem ela, só há API. */
  pastaCliente?: string;
  /**
   * Nomes aceites no cabeçalho Host (ex.: localhost). Um site malicioso aberto no browser podia ler a
   * API por "DNS rebinding" (um domínio dele a apontar para o servidor); nesse caso o Host é o domínio
   * dele e o pedido é recusado. No modo local, sem esta opção não se verifica; no modo entra aceita-se
   * sempre o nome de ENDERECO_PUBLICO, mais estes (GET e HEAD por estes nomes vão por 302 para o
   * mesmo caminho em ENDERECO_PUBLICO).
   */
  anfitrioes?: string[];
  /** Login. Sem isto: modo local (sem login, autor 'local'), como os testes antigos. */
  auth?: ConfigAuth;
  /** Tempo real (GET /api/eventos). Sem isto, a rota dá 503 e as gravações não avisam ninguém. */
  eventos?: CanalEventos;
  /** Cópias de segurança (só o estado, para o /api/saude). */
  copias?: Pick<ServicoCopias, 'estado'>;
  /** Commit desta versão (RENDER_GIT_COMMIT no Render), mostrado na /api/saude. */
  commit?: string;
  /** Relógio (os testes fixam a hora). */
  agora?: () => Date;
  /** fetch para o OpenID (os testes usam o fornecedor falso em processo). */
  fetchOidc?: FetchOidc;
}

/** Tamanho máximo do corpo de POST /api/lotes (500 operações cabem folgadamente). */
export const TAMANHO_MAXIMO_LOTE = 100 * 1024;

/** Métodos que não mudam nada: não precisam da verificação da origem. */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** HSTS (só em https): um ano. */
export const HSTS = 'max-age=31536000';

/**
 * Política de conteúdo das páginas HTML. Os mosaicos do mapa vêm do OpenStreetMap;
 * 'unsafe-inline' nos estilos é preciso para o Leaflet (posiciona tudo com style="…").
 * `connect-src 'self'` cobre o tempo real (SSE). `worker-src blob:`: o write-excel-file comprime as folhas
 * grandes (> 160 KB) num Worker criado a partir de um blob; sem isto a exportação ficava pendurada.
 * Em https, os pedidos http passam a https.
 */
export function politicaConteudo(https: boolean): string {
  return [
    "default-src 'self'",
    "img-src 'self' data: https://tile.openstreetmap.org",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/** A política em http (desenvolvimento e modo local). */
export const POLITICA_CONTEUDO = politicaConteudo(false);

/**
 * O OpenStreetMap recusa (403) mosaicos pedidos sem Referer, por isso não pode ser o
 * "no-referrer" que o secureHeaders põe por omissão. Assim só vai a origem, nunca o caminho.
 */
export const POLITICA_REFERER = 'strict-origin-when-cross-origin';

/** Último segmento do caminho com extensão (ex.: /assets/app-1a2b.js): é um ficheiro, não uma rota. */
function pareceFicheiro(caminho: string): boolean {
  return /\.[^/]*$/.test(caminho);
}

/** Só a parte pública do estado das cópias (sem destino, erros nem datas de tentativas). */
function copiasPublicas(estado: EstadoCopiasPublico): EstadoCopiasPublico {
  return { ativas: estado.ativas, ultimaCopiaEm: estado.ultimaCopiaEm, atrasada: estado.atrasada };
}

export function criarApp({
  bd,
  pastaCliente,
  anfitrioes,
  auth = { modo: 'local' },
  eventos,
  copias,
  commit,
  agora = () => new Date(),
  fetchOidc,
}: OpcoesApp): Hono<AmbienteApp> {
  const app = new Hono<AmbienteApp>();
  const enderecoPublico = auth.modo === 'entra' ? new URL(auth.enderecoPublico) : null;
  const https = enderecoPublico?.protocol === 'https:';
  const autenticacao = criarAutenticacao({ bd, config: auth, agora, fetchOidc });

  app.use(
    '*',
    secureHeaders({ referrerPolicy: POLITICA_REFERER, strictTransportSecurity: https ? HSTS : false }),
  );

  // Os dados mudam e têm dados pessoais: nunca ficam em cache.
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  const nomesAceites = enderecoPublico ? [enderecoPublico.hostname, ...(anfitrioes ?? [])] : anfitrioes;
  if (nomesAceites) {
    const aceites = new Set(nomesAceites.map((a) => a.toLowerCase()));
    app.use('*', async (c, next) => {
      // O Render chama a /api/saude por dentro, com outro Host: fica isenta no modo entra.
      if (enderecoPublico && c.req.path === '/api/saude') return next();
      // O URL do pedido é montado a partir do cabeçalho Host (@hono/node-server).
      const url = new URL(c.req.url);
      if (!aceites.has(url.hostname)) {
        return c.json({ erro: 'Endereço não permitido.' }, 403);
      }
      // Com login, os outros nomes (ex.: o .onrender.com) levam ao endereço público: os cookies do login
      // e da sessão, e a origem aceite nas gravações, são só os de ENDERECO_PUBLICO. Sem isto, entrar
      // por outro nome voltava sempre com "expirou" (o regresso da Microsoft é ao endereço público).
      // Os pedidos que mudam coisas não se redirecionam: a verificação da origem recusa-os (403).
      const leitura = c.req.method === 'GET' || c.req.method === 'HEAD';
      if (enderecoPublico && url.hostname !== enderecoPublico.hostname && leitura) {
        return c.redirect(`${enderecoPublico.origin}${url.pathname}${url.search}`, 302);
      }
      await next();
    });
  }

  // Proteção CSRF dos pedidos que mudam coisas (além do SameSite=Lax do cookie e do JSON obrigatório).
  app.use('/api/*', async (c, next) => {
    if (METODOS_SEGUROS.has(c.req.method)) return next();
    const origem = c.req.header('Origin');
    if (enderecoPublico) {
      // Com login, o browser manda sempre Origin nestes pedidos: sem ele, ou com outro, recusa-se.
      if (origem !== enderecoPublico.origin) {
        return c.json({ erro: 'Pedido recusado: a página não é a do Mapa.' }, 403);
      }
    } else if (origem !== undefined && !origemLocal(origem)) {
      // Sem login: um site aberto no browser não pode gravar através do PC. Sem Origin (curl, testes)
      // não há página nenhuma a abusar.
      return c.json({ erro: 'Pedido recusado: a página não é deste computador.' }, 403);
    }
    await next();
  });

  app.use('/api/*', autenticacao.exigirSessao);
  app.route('/api/auth', autenticacao.rotas);

  app.get('/api/estado', (c) => c.json(carregarEstado(bd)));

  app.get('/api/eventos', async (c) => {
    if (!eventos) return c.json({ erro: 'O tempo real não está disponível.' }, 503);
    // A ligação fica aberta: é cortada quando a sessão acabar (sair, prazo, utilizador retirado).
    return autenticacao.acompanharLigacao(c, await eventos.responder(c, lerVersao(bd)));
  });

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

      const utilizador = c.get('utilizador');
      const { operacoes, comentario, versaoBase } = pedido.valor;
      const r = gravarLote(bd, {
        operacoes,
        comentario,
        versaoBase,
        autor: utilizador.chave,
        agora: agora(),
      });
      switch (r.tipo) {
        case 'gravado':
          try {
            eventos?.publicar({
              versao: r.versao,
              loteId: r.loteId,
              autor: utilizador.chave,
              autorNome: utilizador.nome,
              alteracoes: r.operacoes,
            });
          } catch (erro) {
            // O lote já está gravado: um problema no tempo real não o pode transformar num erro.
            console.error('Tempo real: o aviso do lote falhou.', erro);
          }
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
              erro: r.conflitos.some((cf) => cf.tipo !== 'mover')
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

  // Pública (sem login) e chamada pelo Render: nada de dados pessoais.
  app.get('/api/saude', (c) => {
    const geradoEm = new Date().toISOString();
    try {
      const resposta: RespostaSaude = {
        ok: true,
        versao: lerVersao(bd),
        ...(copias ? { copias: copiasPublicas(copias.estado()) } : {}),
        ...(commit ? { commit } : {}),
        geradoEm,
      };
      return c.json(resposta);
    } catch (erro) {
      console.error('Saúde: a base de dados não respondeu.', erro);
      const resposta: RespostaSaude = { ok: false, erro: 'A base de dados não está disponível.', geradoEm };
      return c.json(resposta, 503);
    }
  });

  app.all('/api/*', (c) => c.json({ erro: 'Rota da API desconhecida.' }, 404));

  if (pastaCliente) {
    const politica = politicaConteudo(https);
    app.get('*', async (c, next) => {
      await next();
      const tipo = c.res.headers.get('Content-Type') ?? '';
      if (tipo.startsWith('text/html')) {
        c.header('Content-Security-Policy', politica);
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
