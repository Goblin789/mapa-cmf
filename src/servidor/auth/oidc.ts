// Ligação ao Entra ID (OpenID Connect) com o openid-client: código de autorização + PKCE (S256),
// state e nonce. A descoberta do emissor é preguiçosa e fica em cache; se a Microsoft não responder,
// o pedido de login falha (volta ao ecrã de entrada) e a próxima tentativa volta a tentar. O servidor
// arranca e serve o resto mesmo sem a Microsoft.
//
// Nunca se regista (console) o código, os tokens, o client secret nem o ID token.

import { createHash, randomBytes } from 'node:crypto';
import * as cliente from 'openid-client';
import type { ConfigEntra } from '../config';

/** O que se pede à Microsoft: identidade, nome e e-mail. */
const SCOPE = 'openid profile email';

/** Tempo máximo de cada pedido à Microsoft (descoberta e troca do código), em segundos. */
const TEMPO_MAXIMO_S = 10;

/** fetch próprio (os testes falam com o fornecedor falso em processo, sem rede). */
export type FetchOidc = (url: string, opcoes: cliente.CustomFetchOptions) => Promise<Response>;

/** Quem entrou, tal como vem do ID token (já validado). */
export interface IdentidadeEntra {
  /** oid: chave estável do utilizador no inquilino. */
  oid: string;
  /** Inquilino (tid) do ID token. */
  tid: string;
  /** preferred_username ou email, em minúsculas. */
  email: string;
  nome: string;
}

/** Os dados de um pedido de login, guardados entre a ida à Microsoft e o regresso. */
export interface SegredosPedido {
  /** O state: o hash da ligação ao browser (ver estadoDaLigacao). */
  estado: string;
  nonce: string;
  verificador: string;
}

/** Falha do login com o código a mostrar no ecrã de entrada (?erro-entrada=). */
export class ErroEntrada extends Error {
  override name = 'ErroEntrada';
  constructor(
    readonly codigo: 'expirou' | 'falhou' | 'sem-acesso' | 'cancelado',
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface ClienteOidc {
  /** URL da Microsoft para onde mandar o browser. */
  urlDeEntrada(pedido: SegredosPedido): Promise<URL>;
  /**
   * Troca o código pelo ID token e valida-o (assinatura com as chaves do emissor, emissor, audiência,
   * prazo, nonce, state, PKCE). `urlRetorno` é o URL público do retorno com os parâmetros que a
   * Microsoft mandou.
   */
  trocarCodigo(urlRetorno: URL, pedido: SegredosPedido): Promise<IdentidadeEntra>;
}

export interface OpcoesOidc {
  /** URI de retorno registado no Entra (ENDERECO_PUBLICO + /api/auth/retorno). */
  uriRetorno: string;
  producao: boolean;
  fetch?: FetchOidc;
}

/**
 * O state de um pedido: SHA-256 (base64url) da ligação ao browser. A ligação é um segredo que só vai no
 * cookie do pedido; o state anda em URLs (Microsoft, histórico, registos) e, por ser um hash, não deixa
 * reconstruir o cookie. Quem só tem o URL de retorno não consegue acabar o login noutro browser.
 */
export function estadoDaLigacao(ligacao: string): string {
  return createHash('sha256').update(ligacao).digest('base64url');
}

/** Gera um pedido novo: a ligação (para o cookie) e os segredos (state, nonce e code_verifier). */
export function novosSegredos(): { ligacao: string; segredos: SegredosPedido } {
  const ligacao = randomBytes(32).toString('base64url');
  return {
    ligacao,
    segredos: {
      estado: estadoDaLigacao(ligacao),
      nonce: cliente.randomNonce(),
      verificador: cliente.randomPKCECodeVerifier(),
    },
  };
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

/** Identidade a partir das claims do ID token. Lança ErroEntrada se faltar o essencial. */
export function identidadeDasClaims(claims: Record<string, unknown>): IdentidadeEntra {
  const oid = texto(claims.oid);
  const tid = texto(claims.tid);
  const email = texto(claims.preferred_username) ?? texto(claims.email);
  if (!oid || !tid || !email) {
    throw new ErroEntrada('falhou', 'O ID token não tem oid, tid ou e-mail.');
  }
  const emailMinusculas = email.toLowerCase();
  return { oid, tid: tid.toLowerCase(), email: emailMinusculas, nome: texto(claims.name) ?? emailMinusculas };
}

export function criarClienteOidc(entra: ConfigEntra, opcoes: OpcoesOidc): ClienteOidc {
  if (entra.permitirHttp && opcoes.producao) {
    // A config já o recusa; isto é só uma segunda barreira.
    throw new Error('Emissor em http não é aceite em produção.');
  }
  let configuracao: Promise<cliente.Configuration> | null = null;

  function descobrir(): Promise<cliente.Configuration> {
    if (!configuracao) {
      configuracao = cliente
        .discovery(
          new URL(entra.emissor),
          entra.cliente,
          undefined,
          cliente.ClientSecretPost(entra.segredo),
          {
            timeout: TEMPO_MAXIMO_S,
            ...(opcoes.fetch ? { [cliente.customFetch]: opcoes.fetch } : {}),
            // Verifica também a assinatura do ID token (chaves do jwks_uri, em cache): o openid-client, por
            // omissão, confia no TLS do pedido ao /token e só valida as claims.
            execute: [
              cliente.enableNonRepudiationChecks,
              ...(entra.permitirHttp ? [cliente.allowInsecureRequests] : []),
            ],
          },
        )
        .catch((erro: unknown) => {
          // Sem cache do erro: a próxima entrada volta a tentar.
          configuracao = null;
          throw erro;
        });
    }
    return configuracao;
  }

  return {
    async urlDeEntrada(pedido) {
      const config = await descobrir();
      return cliente.buildAuthorizationUrl(config, {
        redirect_uri: opcoes.uriRetorno,
        response_type: 'code',
        response_mode: 'query',
        scope: SCOPE,
        prompt: 'select_account',
        state: pedido.estado,
        nonce: pedido.nonce,
        code_challenge: await cliente.calculatePKCECodeChallenge(pedido.verificador),
        code_challenge_method: 'S256',
      });
    },

    async trocarCodigo(urlRetorno, pedido) {
      const config = await descobrir();
      const tokens = await cliente.authorizationCodeGrant(config, urlRetorno, {
        expectedState: pedido.estado,
        expectedNonce: pedido.nonce,
        pkceCodeVerifier: pedido.verificador,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new ErroEntrada('falhou', 'A resposta não trouxe ID token.');
      return identidadeDasClaims(claims);
    },
  };
}

/** Descrição curta e sem segredos de um erro do openid-client, para os registos. */
export function descreverErroOidc(erro: unknown): string {
  if (erro instanceof ErroEntrada) return erro.message;
  if (erro instanceof Error) {
    const codigo = (erro as { code?: unknown }).code;
    const erroOauth = (erro as { error?: unknown }).error;
    return [
      erro.name,
      typeof codigo === 'string' ? codigo : null,
      typeof erroOauth === 'string' ? erroOauth : null,
    ]
      .filter(Boolean)
      .join(' / ');
  }
  return 'erro desconhecido';
}
