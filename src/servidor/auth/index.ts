// Login Microsoft (Entra ID): rotas /api/auth/* e o middleware que exige sessão no resto da API.
// Ver docs/m1.md ("Rotas novas" e "Segurança").
//
// - GET  /api/auth/entrar?destino=/caminho → pedido de login (state, nonce, PKCE) e 302 para a Microsoft;
// - GET  /api/auth/retorno → valida o regresso, cria a sessão e volta ao destino (erros: /?erro-entrada=…);
// - POST /api/auth/sair → termina a sessão (só no Mapa: a conta Microsoft continua iniciada);
// - GET  /api/auth/eu → Utilizador ou 401.
// No modo local não há login: o utilizador é sempre "Este computador".
//
// O pedido de login liga-se ao browser que o começou por um segredo próprio (a "ligação") no cookie do
// pedido; o state é o hash dela. Ter o URL de retorno (code + state) não chega para acabar o login noutro
// browser, e o cookie, com __Host- em https, não se planta a partir de outro site.

import { and, eq, lte, ne, sql } from 'drizzle-orm';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import type { Utilizador } from '../../dominio/api';
import type { ConfigEntra } from '../config';
import * as esquema from '../db/esquema';
import type { Bd } from '../db/ligacao';
import { destinoSeguro } from './destino';
import { criarLigacoesPorSessao } from './ligacoes';
import {
  type ClienteOidc,
  criarClienteOidc,
  descreverErroOidc,
  ErroEntrada,
  estadoDaLigacao,
  type FetchOidc,
  type IdentidadeEntra,
  novosSegredos,
} from './oidc';
import {
  apagarSessao,
  criarSessao,
  DURACAO_MAXIMA_MS,
  hashToken,
  lerSessao,
  limparSessoesExpiradas,
  utilizadorDaSessao,
} from './sessoes';

/** Variáveis que o middleware deixa no contexto do Hono. */
export interface AmbienteApp {
  Variables: {
    utilizador: Utilizador;
    /** Id da sessão (hash do token); só no modo entra. */
    sessao?: string;
  };
}

/** Configuração do login (a `Config` de config.ts serve tal como está). */
export type ConfigAuth =
  | { modo: 'local' }
  | {
      modo: 'entra';
      /** Origem pública, sem barra no fim. */
      enderecoPublico: string;
      entra: ConfigEntra;
      /** E-mails em minúsculas; null = sem esta segunda barreira. */
      utilizadoresPermitidos: string[] | null;
      producao: boolean;
    };

/** O utilizador do modo local (servidor no PC, sem login). */
export const UTILIZADOR_LOCAL: Utilizador = {
  chave: 'local',
  nome: 'Este computador',
  email: null,
  modo: 'local',
};

export const ERRO_SESSAO = 'A sessão terminou. Entra outra vez.';

/** Um pedido de login vale este tempo (ida à Microsoft e regresso). */
export const VALIDADE_PEDIDO_MS = 10 * 60 * 1000;
/**
 * Pedidos pendentes no máximo: ninguém enche a tabela com pedidos anónimos. Acima disto saem os mais
 * antigos (nunca se recusa quem chega: um teto que recusasse deixava qualquer um bloquear a entrada de
 * todos com menos de um pedido por segundo).
 */
export const MAX_PEDIDOS_PENDENTES = 500;

/** As ligações do tempo real revêem-se com este intervalo (sessões que acabaram entretanto). */
export const INTERVALO_REVISAO_LIGACOES_MS = 60 * 1000;

/**
 * Nome do cookie do pedido de login, que leva a ligação ao browser (um segredo que nunca anda em URLs).
 * Em https tem o prefixo __Host- (Secure, Path=/, sem Domain): nenhum subdomínio nem ligação http o
 * consegue plantar no browser de outra pessoa.
 */
export function nomeCookieLogin(https: boolean): string {
  return https ? '__Host-mapa-login' : 'mapa-login';
}

/** Nome do cookie da sessão: com o prefixo __Host- em https (o browser obriga a Secure e Path=/). */
export function nomeCookieSessao(https: boolean): string {
  return https ? '__Host-mapa-sessao' : 'mapa-sessao';
}

export type CodigoErroEntrada = ErroEntrada['codigo'];

/** Código AADSTS de quem não tem acesso (não atribuído à aplicação, conta de outra organização…). */
const SEM_ACESSO_AADSTS = /AADSTS(50105|50020|90072|50177|53003)\b/;

/**
 * Código a mostrar quando a Microsoft volta com `error`. access_denied é, quase sempre, a pessoa ter
 * cancelado; com um AADSTS de falta de acesso é "sem acesso".
 */
export function codigoDoErroMicrosoft(erro: string, descricao: string | undefined): CodigoErroEntrada {
  if (descricao && SEM_ACESSO_AADSTS.test(descricao)) return 'sem-acesso';
  if (['access_denied', 'login_required', 'interaction_required', 'consent_required'].includes(erro)) {
    return 'cancelado';
  }
  return 'falhou';
}

/** Motivo de recusa (para os registos, sem dados pessoais) ou null se a pessoa pode entrar. */
export function motivoSemAcesso(
  identidade: Pick<IdentidadeEntra, 'tid' | 'email'>,
  config: { entra: Pick<ConfigEntra, 'inquilino'>; utilizadoresPermitidos: string[] | null },
): string | null {
  if (identidade.tid !== config.entra.inquilino) return 'conta de outro inquilino (tid)';
  if (config.utilizadoresPermitidos && !config.utilizadoresPermitidos.includes(identidade.email)) {
    return 'e-mail fora de UTILIZADORES_PERMITIDOS';
  }
  return null;
}

/** Cria ou atualiza o utilizador (pelo oid). Um registo antigo com o mesmo e-mail e outro oid sai. */
export function gravarUtilizador(bd: Bd, identidade: IdentidadeEntra, agora: Date): void {
  const quando = agora.toISOString();
  bd.transaction((tx) => {
    // Ex.: a conta foi apagada e criada de novo no Entra. As sessões da antiga vão com ela (cascade);
    // o histórico não se perde porque os lotes guardam o e-mail.
    tx.delete(esquema.utilizadores)
      .where(
        and(eq(esquema.utilizadores.email, identidade.email), ne(esquema.utilizadores.id, identidade.oid)),
      )
      .run();
    tx.insert(esquema.utilizadores)
      .values({
        id: identidade.oid,
        email: identidade.email,
        nome: identidade.nome,
        criadoEm: quando,
        ultimaEntradaEm: quando,
      })
      .onConflictDoUpdate({
        target: esquema.utilizadores.id,
        set: { email: identidade.email, nome: identidade.nome, ultimaEntradaEm: quando },
      })
      .run();
  });
}

/** Apaga os pedidos de login com mais de 10 minutos. */
export function limparPedidosVelhos(bd: Bd, agora: Date): number {
  const limite = new Date(agora.getTime() - VALIDADE_PEDIDO_MS).toISOString();
  return bd.delete(esquema.pedidosLogin).where(lte(esquema.pedidosLogin.criadoEm, limite)).run().changes;
}

/** Deixa no máximo `maximo` pedidos pendentes: os mais antigos saem. Devolve quantos saíram. */
export function limitarPedidos(bd: Bd, maximo: number): number {
  return bd.run(sql`
    DELETE FROM pedidos_login WHERE estado IN (
      SELECT estado FROM pedidos_login ORDER BY criado_em DESC, estado LIMIT -1 OFFSET ${maximo}
    )`).changes;
}

export interface OpcoesAutenticacao {
  bd: Bd;
  config: ConfigAuth;
  agora: () => Date;
  /** Para os testes (fornecedor falso em processo). */
  fetchOidc?: FetchOidc;
}

export interface Autenticacao {
  /** Montar em /api/auth. */
  rotas: Hono<AmbienteApp>;
  /**
   * Para /api/*: deixa passar /api/auth/* e /api/saude; no resto, sem sessão válida dá 401. Põe o
   * utilizador no contexto (c.get('utilizador')).
   */
  exigirSessao: MiddlewareHandler<AmbienteApp>;
  /**
   * Para respostas que ficam abertas (GET /api/eventos): a ligação é cortada quando a sessão do pedido
   * acaba (sair, prazo, utilizador retirado). No modo local devolve a resposta tal como está.
   */
  acompanharLigacao(c: Context<AmbienteApp>, resposta: Response): Response;
  /** Corta já as ligações cujas sessões deixaram de valer (corre sozinha de minuto a minuto). */
  reverLigacoes(): void;
}

/** Caminhos de /api que não exigem sessão. */
export function caminhoSemLogin(caminho: string): boolean {
  return caminho === '/api/saude' || caminho === '/api/auth' || caminho.startsWith('/api/auth/');
}

export function criarAutenticacao(opcoes: OpcoesAutenticacao): Autenticacao {
  const { config } = opcoes;
  if (config.modo === 'local') return autenticacaoLocal();
  return autenticacaoEntra({ ...opcoes, config });
}

function autenticacaoLocal(): Autenticacao {
  const rotas = new Hono<AmbienteApp>();
  rotas.get('/entrar', (c) => c.redirect('/', 302));
  rotas.get('/retorno', (c) => c.redirect('/', 302));
  rotas.post('/sair', (c) => c.body(null, 204));
  rotas.get('/eu', (c) => c.json(UTILIZADOR_LOCAL));
  return {
    rotas,
    exigirSessao: async (c, next) => {
      c.set('utilizador', UTILIZADOR_LOCAL);
      await next();
    },
    acompanharLigacao: (_c, resposta) => resposta,
    reverLigacoes: () => {},
  };
}

function autenticacaoEntra({
  bd,
  config,
  agora,
  fetchOidc,
}: OpcoesAutenticacao & { config: Extract<ConfigAuth, { modo: 'entra' }> }): Autenticacao {
  const https = config.enderecoPublico.startsWith('https:');
  const cookieSessao = nomeCookieSessao(https);
  const opcoesCookieSessao: CookieOptions = { httpOnly: true, secure: https, sameSite: 'Lax', path: '/' };
  const cookieLogin = nomeCookieLogin(https);
  const opcoesCookieLogin: CookieOptions = {
    httpOnly: true,
    secure: https,
    sameSite: 'Lax',
    // O prefixo __Host- obriga a Path=/; em http fica só em /api/auth.
    path: https ? '/' : '/api/auth',
  };
  const uriRetorno = `${config.enderecoPublico}/api/auth/retorno`;
  const oidc: ClienteOidc = criarClienteOidc(config.entra, {
    uriRetorno,
    producao: config.producao,
    fetch: fetchOidc,
  });

  // Tempo real: as ligações de cada sessão, revistas de minuto a minuto enquanto houver alguma.
  let temporizadorRevisao: ReturnType<typeof setInterval> | null = null;
  const ligacoes = criarLigacoesPorSessao((quantas) => {
    if (quantas > 0 && temporizadorRevisao === null) {
      temporizadorRevisao = setInterval(reverLigacoes, INTERVALO_REVISAO_LIGACOES_MS);
      temporizadorRevisao.unref?.();
    } else if (quantas === 0 && temporizadorRevisao !== null) {
      clearInterval(temporizadorRevisao);
      temporizadorRevisao = null;
    }
  });

  function permitido(utilizador: Utilizador): boolean {
    return !(
      utilizador.email && motivoSemAcesso({ tid: config.entra.inquilino, email: utilizador.email }, config)
    );
  }

  function reverLigacoes(): void {
    try {
      const t = agora();
      ligacoes.rever((sessao) => {
        const utilizador = utilizadorDaSessao(bd, sessao, t);
        return utilizador !== null && permitido(utilizador);
      });
    } catch (erro) {
      console.error(
        'Revisão das ligações de tempo real falhou:',
        erro instanceof Error ? erro.message : erro,
      );
    }
  }

  /** Termina a sessão deste token e corta as ligações dela. */
  function terminarSessao(token: string): void {
    apagarSessao(bd, token);
    ligacoes.cortar(hashToken(token));
  }

  /** Sessão do cookie (token e utilizador), ou null (e o cookie é apagado se já não servir). */
  function sessaoDoPedido(c: Context<AmbienteApp>): { token: string; utilizador: Utilizador } | null {
    const token = getCookie(c, cookieSessao);
    if (!token) return null;
    let utilizador = lerSessao(bd, token, agora());
    // Quem saiu de UTILIZADORES_PERMITIDOS deixa de entrar logo, mesmo com sessão aberta.
    if (utilizador && !permitido(utilizador)) {
      terminarSessao(token);
      utilizador = null;
    }
    if (!utilizador) {
      ligacoes.cortar(hashToken(token));
      deleteCookie(c, cookieSessao, opcoesCookieSessao);
      return null;
    }
    return { token, utilizador };
  }

  function voltarComErro(c: Context<AmbienteApp>, codigo: CodigoErroEntrada, motivo: string): Response {
    console.warn(`Entrada recusada (${codigo}): ${motivo}.`);
    return c.redirect(`/?erro-entrada=${codigo}`, 302);
  }

  const rotas = new Hono<AmbienteApp>();
  let ultimoAvisoTeto = Number.NEGATIVE_INFINITY;

  rotas.get('/entrar', async (c) => {
    const destino = destinoSeguro(c.req.query('destino'));
    const t = agora();
    const { ligacao, segredos } = novosSegredos();
    let url: URL;
    try {
      url = await oidc.urlDeEntrada(segredos);
    } catch (erro) {
      return voltarComErro(c, 'falhou', `a Microsoft não respondeu (${descreverErroOidc(erro)})`);
    }
    limparPedidosVelhos(bd, t);
    // Lugar para este: com a tabela cheia saem os mais antigos.
    const retirados = limitarPedidos(bd, MAX_PEDIDOS_PENDENTES - 1);
    // No máximo um aviso por minuto (numa enxurrada de pedidos, os registos não enchem).
    if (retirados > 0 && t.getTime() - ultimoAvisoTeto >= 60 * 1000) {
      ultimoAvisoTeto = t.getTime();
      console.warn(`Pedidos de login a mais (${MAX_PEDIDOS_PENDENTES}): saem os mais antigos.`);
    }
    bd.insert(esquema.pedidosLogin)
      .values({
        estado: segredos.estado,
        nonce: segredos.nonce,
        verificador: segredos.verificador,
        destino,
        criadoEm: t.toISOString(),
      })
      .run();
    setCookie(c, cookieLogin, ligacao, { ...opcoesCookieLogin, maxAge: VALIDADE_PEDIDO_MS / 1000 });
    return c.redirect(url.href, 302);
  });

  rotas.get('/retorno', async (c) => {
    const t = agora();
    const ligacao = getCookie(c, cookieLogin);
    // O cookie do pedido só serve uma vez, corra bem ou mal.
    if (ligacao !== undefined) deleteCookie(c, cookieLogin, opcoesCookieLogin);
    const estado = c.req.query('state');
    if (!ligacao) {
      return voltarComErro(c, 'expirou', 'sem o cookie do pedido (mais de 10 minutos, ou outro browser)');
    }
    // O state do URL tem de ser o hash da ligação deste browser: copiar o state para o cookie não serve.
    const estadoEsperado = estadoDaLigacao(ligacao);
    if (!estado || estado !== estadoEsperado) {
      return voltarComErro(c, 'falhou', 'o state não corresponde ao cookie do pedido');
    }
    // Uso único: o pedido sai já, antes de qualquer outra verificação.
    const pedido = bd
      .delete(esquema.pedidosLogin)
      .where(eq(esquema.pedidosLogin.estado, estadoEsperado))
      .returning()
      .get();
    if (!pedido) return voltarComErro(c, 'expirou', 'pedido de login desconhecido ou já usado');
    if (Date.parse(pedido.criadoEm) + VALIDADE_PEDIDO_MS <= t.getTime()) {
      return voltarComErro(c, 'expirou', 'pedido de login com mais de 10 minutos');
    }

    const erroMicrosoft = c.req.query('error');
    if (erroMicrosoft) {
      const codigo = codigoDoErroMicrosoft(erroMicrosoft, c.req.query('error_description'));
      // Só letras e _ (o texto vem do URL: não se escreve tal e qual nos registos).
      return voltarComErro(c, codigo, `a Microsoft devolveu ${erroMicrosoft.replace(/[^a-z_]/gi, '?')}`);
    }

    let identidade: IdentidadeEntra;
    try {
      // O URL público (o que a Microsoft conhece como redirect_uri), com os parâmetros que ela mandou.
      const urlRetorno = new URL(`${uriRetorno}${new URL(c.req.url).search}`);
      identidade = await oidc.trocarCodigo(urlRetorno, pedido);
    } catch (erro) {
      const codigo = erro instanceof ErroEntrada ? erro.codigo : 'falhou';
      return voltarComErro(c, codigo, `validação do regresso falhou (${descreverErroOidc(erro)})`);
    }
    const motivo = motivoSemAcesso(identidade, config);
    if (motivo) return voltarComErro(c, 'sem-acesso', motivo);

    gravarUtilizador(bd, identidade, t);
    limparSessoesExpiradas(bd, t);
    // Sessão nova a cada entrada (nunca se reaproveita um token que já existia no browser).
    const anterior = getCookie(c, cookieSessao);
    if (anterior) terminarSessao(anterior);
    const { token } = criarSessao(bd, identidade.oid, t);
    setCookie(c, cookieSessao, token, { ...opcoesCookieSessao, maxAge: DURACAO_MAXIMA_MS / 1000 });
    return c.redirect(pedido.destino, 302);
  });

  rotas.post('/sair', (c) => {
    const token = getCookie(c, cookieSessao);
    if (token) terminarSessao(token);
    deleteCookie(c, cookieSessao, opcoesCookieSessao);
    return c.body(null, 204);
  });

  rotas.get('/eu', (c) => {
    const sessao = sessaoDoPedido(c);
    return sessao ? c.json(sessao.utilizador) : c.json({ erro: ERRO_SESSAO }, 401);
  });

  return {
    rotas,
    exigirSessao: async (c, next) => {
      if (caminhoSemLogin(c.req.path)) return next();
      const sessao = sessaoDoPedido(c);
      if (!sessao) return c.json({ erro: ERRO_SESSAO }, 401);
      c.set('utilizador', sessao.utilizador);
      c.set('sessao', hashToken(sessao.token));
      await next();
    },
    acompanharLigacao(c, resposta) {
      const sessao = c.get('sessao');
      return sessao ? ligacoes.acompanhar(sessao, resposta) : resposta;
    },
    reverLigacoes,
  };
}
