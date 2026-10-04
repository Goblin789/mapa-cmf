// Configuração lida do ambiente (.env local ou variáveis do alojamento). Ver docs/m1.md ("Modos do
// servidor" e "Variáveis de ambiente"). Importar este ficheiro não tem efeitos (não lê o .env nem termina
// o processo), por isso os testes não dependem do .env do PC:
// - `lerConfig(env)` é pura (os testes passam o ambiente que querem);
// - `obterConfigServidor()` é a do servidor (index.ts), já validada: com uma configuração inválida o
//   processo termina com uma mensagem clara em vez de arrancar meio configurado;
// - `config` dá só a BD e a pasta de origem (importação e sincronização), sem validar o login.

let envCarregado = false;

/** Lê o .env (uma vez); as variáveis que já existem no ambiente têm prioridade. */
function carregarEnv(): void {
  if (envCarregado) return;
  envCarregado = true;
  try {
    process.loadEnvFile('.env');
  } catch {
    // Sem .env: usa só as variáveis do ambiente.
  }
}

/** Nomes pelos quais o próprio PC chega ao servidor (também os do proxy do Vite). */
export const ANFITRIOES_LOCAIS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

/** Nomes aceites no ENTRA_EMISSOR em http (o fornecedor falso no próprio PC). */
const EMISSORES_HTTP_PERMITIDOS = new Set(['localhost', '127.0.0.1']);

/** Directory (tenant) ID do Entra: um GUID. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Nome de anfitrião sem porta (ex.: mapa-cmf.onrender.com) ou um IPv6 entre parênteses retos. */
const ANFITRIAO = /^([a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:.]+\]$/;

/** Login Microsoft (Entra ID). O segredo nunca aparece em mensagens nem nos registos. */
export interface ConfigEntra {
  /** Directory (tenant) ID, em minúsculas. */
  inquilino: string;
  /** Application (client) ID. */
  cliente: string;
  /** Client secret. */
  segredo: string;
  /** Emissor OpenID (https://login.microsoftonline.com/<inquilino>/v2.0, ou o fornecedor falso). */
  emissor: string;
  /** O emissor é http (só o fornecedor falso no próprio PC, nunca em produção). */
  permitirHttp: boolean;
}

interface ConfigComum {
  /** NODE_ENV=production (no Render). */
  producao: boolean;
  porta: number;
  /** Endereço onde o servidor escuta. */
  host: string;
  bd: string;
  pastaOrigem: string;
  /** Nomes aceites no cabeçalho Host (em minúsculas). */
  anfitrioes: string[];
}

/** Sem login: só o próprio PC, autor 'local'. Recusado em produção. */
export interface ConfigLocal extends ConfigComum {
  modo: 'local';
  enderecoPublico: null;
  entra: null;
  utilizadoresPermitidos: null;
}

/** Com login Microsoft: tudo em /api/* exige sessão (exceto /api/auth/* e /api/saude). */
export interface ConfigComLogin extends ConfigComum {
  modo: 'entra';
  /** Origem pública (ex.: https://mapa.cmf-lux.lu), sem barra no fim. */
  enderecoPublico: string;
  entra: ConfigEntra;
  /** E-mails em minúsculas; null = sem esta segunda barreira (só fora de produção, onde é obrigatória). */
  utilizadoresPermitidos: string[] | null;
}

export type Config = ConfigLocal | ConfigComLogin;

/** Configuração inválida: a mensagem diz o que corrigir (nunca inclui segredos). */
export class ErroConfig extends Error {
  override name = 'ErroConfig';
}

/** Valor preenchido (sem espaços nas pontas) ou undefined. */
function valor(env: NodeJS.ProcessEnv, nome: string): string | undefined {
  const v = env[nome]?.trim();
  return v ? v : undefined;
}

/** Lista separada por vírgulas, em minúsculas, sem vazios. */
function lista(texto: string | undefined): string[] {
  return (texto ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x !== '');
}

function lerBd(env: NodeJS.ProcessEnv): string {
  return valor(env, 'BD') ?? 'dados/mapa.db';
}

function lerPastaOrigem(env: NodeJS.ProcessEnv): string {
  return env.PASTA_ORIGEM ?? '';
}

function lerPorta(env: NodeJS.ProcessEnv): number {
  // O Render define PORT; tem prioridade sobre a PORTA do .env.
  const nome = valor(env, 'PORT') !== undefined ? 'PORT' : 'PORTA';
  const texto = valor(env, nome) ?? '8787';
  const porta = Number(texto);
  if (!/^\d+$/.test(texto) || porta < 1 || porta > 65535) {
    throw new ErroConfig(`${nome} tem de ser um número de porta entre 1 e 65535 (está "${texto}").`);
  }
  return porta;
}

/** ENDERECO_PUBLICO tem de ser uma origem http(s), sem caminho; https obrigatório em produção. */
function lerEnderecoPublico(texto: string, producao: boolean): URL {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new ErroConfig('ENDERECO_PUBLICO não é um endereço válido (ex.: https://mapa.cmf-lux.lu).');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ErroConfig('ENDERECO_PUBLICO tem de começar por https:// (ou http:// fora de produção).');
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username || url.password) {
    throw new ErroConfig(
      'ENDERECO_PUBLICO tem de ser só a origem, sem caminho nem parâmetros (ex.: https://mapa.cmf-lux.lu).',
    );
  }
  if (producao && url.protocol !== 'https:') {
    throw new ErroConfig('Em produção o ENDERECO_PUBLICO tem de ser https://.');
  }
  return url;
}

/** ENTRA_EMISSOR (fornecedor falso): recusado em produção; fora dela, https ou http no próprio PC. */
function lerEmissor(texto: string, producao: boolean): URL {
  if (producao) {
    throw new ErroConfig('ENTRA_EMISSOR só serve para testes e não é aceite em produção. Apaga-a.');
  }
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new ErroConfig('ENTRA_EMISSOR não é um endereço válido (ex.: http://localhost:8890).');
  }
  const httpLocal = url.protocol === 'http:' && EMISSORES_HTTP_PERMITIDOS.has(url.hostname);
  if (url.protocol !== 'https:' && !httpLocal) {
    throw new ErroConfig('ENTRA_EMISSOR tem de ser https:// ou http://localhost / http://127.0.0.1.');
  }
  if (url.search !== '' || url.hash !== '' || url.username || url.password) {
    throw new ErroConfig('ENTRA_EMISSOR não pode ter parâmetros.');
  }
  return url;
}

function lerAnfitrioes(texto: string | undefined): string[] {
  const nomes = lista(texto);
  for (const nome of nomes) {
    if (!ANFITRIAO.test(nome)) {
      throw new ErroConfig(
        `ANFITRIOES: "${nome}" não é um nome válido (só o nome, sem https:// nem porta; separados por vírgulas).`,
      );
    }
  }
  return nomes;
}

/**
 * Lê e valida a configuração. Modo 'entra' quando ENTRA_INQUILINO, ENTRA_CLIENTE e ENTRA_SEGREDO estão
 * todos preenchidos; senão 'local'. Lança ErroConfig com uma mensagem em português se algo estiver mal.
 */
export function lerConfig(env: NodeJS.ProcessEnv): Config {
  const producao = env.NODE_ENV === 'production';
  const inquilino = valor(env, 'ENTRA_INQUILINO');
  const cliente = valor(env, 'ENTRA_CLIENTE');
  const segredo = valor(env, 'ENTRA_SEGREDO');
  const comum = {
    producao,
    porta: lerPorta(env),
    bd: lerBd(env),
    pastaOrigem: lerPastaOrigem(env),
  };

  if (!inquilino || !cliente || !segredo) {
    if (producao) {
      const faltam = Object.entries({
        ENTRA_INQUILINO: inquilino,
        ENTRA_CLIENTE: cliente,
        ENTRA_SEGREDO: segredo,
      })
        .filter(([, v]) => !v)
        .map(([nome]) => nome);
      throw new ErroConfig(
        `Em produção o login Microsoft é obrigatório: falta ${faltam.join(', ')}. ` +
          'O servidor não arranca sem login (os dados têm nomes e telefones).',
      );
    }
    // Sem login só se aceita o próprio PC, seja qual for o HOST pedido.
    return {
      ...comum,
      modo: 'local',
      host: '127.0.0.1',
      anfitrioes: [...ANFITRIOES_LOCAIS],
      enderecoPublico: null,
      entra: null,
      utilizadoresPermitidos: null,
    };
  }

  const textoPublico = valor(env, 'ENDERECO_PUBLICO');
  if (!textoPublico) {
    throw new ErroConfig(
      'Com login Microsoft falta ENDERECO_PUBLICO (ex.: https://mapa.cmf-lux.lu, ou http://localhost:5173 no PC).',
    );
  }
  const publico = lerEnderecoPublico(textoPublico, producao);

  const inquilinoMinusculas = inquilino.toLowerCase();
  if (!GUID.test(inquilinoMinusculas)) {
    throw new ErroConfig(
      'ENTRA_INQUILINO tem de ser o Directory (tenant) ID do Entra: um GUID como 00000000-0000-0000-0000-000000000000.',
    );
  }

  const textoEmissor = valor(env, 'ENTRA_EMISSOR');
  const emissor = textoEmissor
    ? lerEmissor(textoEmissor, producao)
    : new URL(`https://login.microsoftonline.com/${inquilinoMinusculas}/v2.0`);

  const permitidos = lista(env.UTILIZADORES_PERMITIDOS);
  if (producao && permitidos.length === 0) {
    // Sem a lista, só a atribuição no Entra decide quem entra, e a opção "Assignment required" vem
    // desligada por omissão: qualquer conta do inquilino (convidados incluídos) entrava.
    throw new ErroConfig(
      'Em produção falta UTILIZADORES_PERMITIDOS: os e-mails de quem pode entrar, separados por vírgulas ' +
        '(ex.: a@cmf-lux.lu,b@cmf-lux.lu). Tirar um e-mail da lista e reiniciar termina as sessões dessa pessoa.',
    );
  }
  for (const email of permitidos) {
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
      throw new ErroConfig(`UTILIZADORES_PERMITIDOS: "${email}" não é um e-mail.`);
    }
  }
  const anfitrioes = [publico.hostname, ...lerAnfitrioes(env.ANFITRIOES)];

  return {
    ...comum,
    modo: 'entra',
    host: valor(env, 'HOST') ?? (producao ? '0.0.0.0' : '127.0.0.1'),
    anfitrioes: [...new Set(anfitrioes)],
    enderecoPublico: publico.origin,
    entra: {
      inquilino: inquilinoMinusculas,
      cliente,
      segredo,
      // Sem a barra final que o URL acrescenta a uma origem (o emissor do Entra não a tem).
      emissor: emissor.href.replace(/\/$/, ''),
      permitirHttp: emissor.protocol === 'http:',
    },
    utilizadoresPermitidos: permitidos.length > 0 ? [...new Set(permitidos)] : null,
  };
}

let configServidor: Config | null = null;

/**
 * Configuração do servidor (lê o .env, se existir). Se for inválida, explica porquê e termina o processo
 * (sem stack trace).
 */
export function obterConfigServidor(): Config {
  if (configServidor) return configServidor;
  carregarEnv();
  try {
    configServidor = lerConfig(process.env);
    return configServidor;
  } catch (erro) {
    if (!(erro instanceof ErroConfig)) throw erro;
    console.error(`Configuração inválida: ${erro.message}`);
    process.exit(1);
  }
}

/**
 * Só a BD e a pasta de origem, para a importação e a sincronização (que não precisam do login). O .env lê-se
 * na primeira vez que se pede um valor, não ao importar.
 */
export const config: Pick<Config, 'bd' | 'pastaOrigem'> = {
  get bd() {
    carregarEnv();
    return lerBd(process.env);
  },
  get pastaOrigem() {
    carregarEnv();
    return lerPastaOrigem(process.env);
  },
};
