// Fornecedor OpenID FALSO, para testes e para experimentar o login no PC sem a Microsoft
// (npm run login-falso). Faz o essencial do Entra ID: descoberta, página de escolha do utilizador,
// código de autorização com PKCE (S256), /token com client_id e segredo, e ID tokens RS256 com
// iss, aud, tid, oid, preferred_username, name e nonce. Recusa arrancar em produção.
//
// Para os testes, /authorize aceita parâmetros extra (nunca usados pelo Mapa):
// - utilizador=<oid>: escolhe logo esse utilizador (sem página);
// - cancelar=1: volta com error=access_denied;
// - falso_tid / falso_nonce: põe outro tid ou nonce no ID token (para testar as recusas).
// Utilizadores e dados todos fictícios.

import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export interface UtilizadorFalso {
  oid: string;
  email: string;
  nome: string;
}

export const UTILIZADORES_FALSOS: readonly UtilizadorFalso[] = [
  { oid: 'oid-ana-0001', email: 'Ana.Exemplo@exemplo.test', nome: 'Ana Exemplo' },
  { oid: 'oid-rui-0002', email: 'rui.ficticio@exemplo.test', nome: 'Rui Fictício' },
  { oid: 'oid-eva-0003', email: 'eva.teste@exemplo.test', nome: 'Eva Teste' },
];

/** Inquilino e cliente fictícios (não são de nenhuma organização real). */
export const INQUILINO_FALSO = '00000000-0000-4000-8000-00000000c0de';
export const CLIENTE_FALSO = 'cliente-falso-mapa';

export interface OpcoesProvedorFalso {
  /** Origem do próprio fornecedor (ex.: http://localhost:8890). É o `iss`. */
  emissor: string;
  cliente?: string;
  segredo?: string;
  inquilino?: string;
  utilizadores?: readonly UtilizadorFalso[];
  /** Se definido, só estes redirect_uri são aceites (como no registo da aplicação no Entra). */
  urisRetorno?: readonly string[];
  /** Ambiente (para a recusa em produção). Omissão: process.env. */
  env?: NodeJS.ProcessEnv;
}

interface CodigoPendente {
  cliente: string;
  uriRetorno: string;
  desafio: string;
  nonce: string;
  utilizador: UtilizadorFalso;
  tid: string;
  expiraEm: number;
}

export interface ProvedorFalso {
  app: Hono;
  emissor: string;
  cliente: string;
  segredo: string;
  inquilino: string;
}

/** Validade de um código de autorização (como no Entra, poucos minutos). */
const VALIDADE_CODIGO_MS = 5 * 60 * 1000;

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function s256(verificador: string): string {
  return createHash('sha256').update(verificador).digest('base64url');
}

export async function criarProvedorFalso(opcoes: OpcoesProvedorFalso): Promise<ProvedorFalso> {
  const env = opcoes.env ?? process.env;
  if (env.NODE_ENV === 'production') {
    throw new Error('O fornecedor de login falso não arranca em produção.');
  }
  const emissor = opcoes.emissor.replace(/\/$/, '');
  const cliente = opcoes.cliente ?? CLIENTE_FALSO;
  const segredo = opcoes.segredo ?? 'falso';
  const inquilino = opcoes.inquilino ?? INQUILINO_FALSO;
  const utilizadores = opcoes.utilizadores ?? UTILIZADORES_FALSOS;

  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const kid = randomBytes(8).toString('hex');
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  const codigos = new Map<string, CodigoPendente>();

  const app = new Hono();

  app.get('/.well-known/openid-configuration', (c) =>
    c.json({
      issuer: emissor,
      authorization_endpoint: `${emissor}/authorize`,
      token_endpoint: `${emissor}/token`,
      jwks_uri: `${emissor}/jwks`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      subject_types_supported: ['pairwise'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      scopes_supported: ['openid', 'profile', 'email'],
      claims_supported: ['iss', 'aud', 'sub', 'tid', 'oid', 'preferred_username', 'name', 'nonce'],
    }),
  );

  app.get('/jwks', (c) => c.json({ keys: [jwk] }));

  app.get('/authorize', (c) => {
    const q = c.req.query();
    const erro = (texto: string) => c.text(`Pedido de login inválido: ${texto}`, 400);
    if (q.client_id !== cliente) return erro('client_id desconhecido.');
    if (!q.redirect_uri) return erro('falta redirect_uri.');
    if (opcoes.urisRetorno && !opcoes.urisRetorno.includes(q.redirect_uri)) {
      return erro('redirect_uri não registado.');
    }
    if (q.response_type !== 'code') return erro('response_type tem de ser code.');
    if (!q.scope?.split(' ').includes('openid')) return erro('falta o scope openid.');
    if (q.code_challenge_method !== 'S256' || !q.code_challenge) return erro('falta o PKCE S256.');
    if (!q.nonce) return erro('falta o nonce.');

    const voltar = (parametros: Record<string, string>) => {
      const url = new URL(q.redirect_uri as string);
      for (const [k, v] of Object.entries(parametros)) url.searchParams.set(k, v);
      if (q.state) url.searchParams.set('state', q.state);
      return c.redirect(url.href, 302);
    };

    if (q.cancelar) {
      return voltar({ error: 'access_denied', error_description: 'AADSTS65004: User declined to consent.' });
    }

    const escolhido = utilizadores.find((u) => u.oid === q.utilizador);
    if (!escolhido) {
      // Página de escolha (só para experimentar no PC): um link por utilizador fictício.
      const base = new URL(c.req.url);
      const ligacoes = utilizadores
        .map((u) => {
          const url = new URL(base);
          url.searchParams.set('utilizador', u.oid);
          return `<li><a href="${escaparHtml(url.pathname + url.search)}">${escaparHtml(u.nome)}</a> <small>${escaparHtml(u.email)}</small></li>`;
        })
        .join('');
      const cancelar = new URL(base);
      cancelar.searchParams.set('cancelar', '1');
      return c.html(
        `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Login falso</title>` +
          '<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;line-height:1.6}' +
          'li{margin:.4rem 0}small{color:#666}</style></head><body>' +
          '<h1>Login falso (testes)</h1><p>Isto não é a Microsoft. Escolhe um utilizador fictício:</p>' +
          `<ul>${ligacoes}</ul><p><a href="${escaparHtml(cancelar.pathname + cancelar.search)}">Cancelar</a></p>` +
          '</body></html>',
      );
    }

    const codigo = randomBytes(24).toString('base64url');
    codigos.set(codigo, {
      cliente,
      uriRetorno: q.redirect_uri,
      desafio: q.code_challenge,
      nonce: q.falso_nonce ?? q.nonce,
      utilizador: escolhido,
      tid: q.falso_tid ?? inquilino,
      expiraEm: Date.now() + VALIDADE_CODIGO_MS,
    });
    return voltar({ code: codigo });
  });

  app.post('/token', async (c) => {
    const corpo = new URLSearchParams(await c.req.text());
    const recusar = (erro: string, descricao: string, estado: 400 | 401 = 400) =>
      c.json({ error: erro, error_description: descricao }, estado);

    // Autenticação do cliente: client_secret_post ou client_secret_basic.
    let idCliente = corpo.get('client_id');
    let segredoCliente = corpo.get('client_secret');
    const basico = c.req.header('Authorization');
    if (basico?.startsWith('Basic ')) {
      const [id, s] = Buffer.from(basico.slice(6), 'base64').toString().split(':');
      idCliente = decodeURIComponent(id ?? '');
      segredoCliente = decodeURIComponent(s ?? '');
    }
    if (idCliente !== cliente || segredoCliente !== segredo) {
      return recusar('invalid_client', 'Cliente ou segredo errado.', 401);
    }
    if (corpo.get('grant_type') !== 'authorization_code') {
      return recusar('unsupported_grant_type', 'Só authorization_code.');
    }
    const codigo = corpo.get('code') ?? '';
    const pendente = codigos.get(codigo);
    codigos.delete(codigo); // uso único, corra bem ou mal
    if (!pendente || pendente.expiraEm < Date.now() || pendente.cliente !== idCliente) {
      return recusar('invalid_grant', 'Código inválido, expirado ou já usado.');
    }
    if (corpo.get('redirect_uri') !== pendente.uriRetorno) {
      return recusar('invalid_grant', 'redirect_uri diferente do pedido.');
    }
    const verificador = corpo.get('code_verifier');
    if (!verificador || s256(verificador) !== pendente.desafio) {
      return recusar('invalid_grant', 'PKCE: code_verifier errado.');
    }

    const u = pendente.utilizador;
    const idToken = await new SignJWT({
      tid: pendente.tid,
      oid: u.oid,
      preferred_username: u.email,
      name: u.nome,
      nonce: pendente.nonce,
      ver: '2.0',
    })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setIssuer(emissor)
      .setAudience(cliente)
      .setSubject(`sub-${u.oid}`)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    return c.json({
      access_token: randomBytes(24).toString('base64url'),
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid profile email',
      id_token: idToken,
    });
  });

  return { app, emissor, cliente, segredo, inquilino };
}
