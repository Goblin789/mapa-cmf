// Argumentos do "npm run publicar" e escolha do endereço público onde se confirma a versão nova.

export interface OpcoesPublicar {
  /** Publicar mesmo dentro da janela da reunião (com aviso). */
  forcar: boolean;
  /** Não correr o "npm run verificar" antes (o GitHub Actions verifica na mesma, mas só depois). */
  semVerificar: boolean;
  /** Esperar que a versão nova responda na /api/saude. */
  esperar: boolean;
  /** Origem pública dada com --endereco (sobrepõe-se ao ENDERECO_PUBLICO). */
  endereco?: string;
  ajuda: boolean;
}

export const USO_PUBLICAR = `Publica no Render a versão que está no main do GitHub (o mesmo commit que tens neste PC).

  npm run publicar                         # verifica e publica
  npm run publicar -- --esperar            # ... e espera que a versão nova responda
  npm run publicar -- --sem-verificar      # não corre o "npm run verificar" antes
  npm run publicar -- --forcar             # publica mesmo de terça 17:45 a quarta 12:00 (reunião)
  npm run publicar -- --esperar --endereco https://mapa-cmf.onrender.com

Precisa de RENDER_DEPLOY_HOOK no .env (Render > serviço > Settings > Deploy Hook). Guia: docs/publicar.md.`;

/** Lê os argumentos. Um argumento desconhecido é erro: nada se publica por engano. */
export function lerArgumentosPublicar(
  args: readonly string[],
): { opcoes: OpcoesPublicar } | { erro: string } {
  const opcoes: OpcoesPublicar = { forcar: false, semVerificar: false, esperar: false, ajuda: false };
  const simples = {
    '--forcar': 'forcar',
    '--sem-verificar': 'semVerificar',
    '--esperar': 'esperar',
    '--ajuda': 'ajuda',
    '-h': 'ajuda',
  } as const;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (Object.hasOwn(simples, arg)) {
      opcoes[simples[arg as keyof typeof simples]] = true;
      continue;
    }
    if (arg === '--endereco' || arg.startsWith('--endereco=')) {
      const valor = arg === '--endereco' ? args[++i] : arg.slice('--endereco='.length);
      if (!valor || valor.startsWith('--')) return { erro: 'Falta o endereço depois de --endereco.' };
      if (opcoes.endereco !== undefined) return { erro: '--endereco repetido.' };
      opcoes.endereco = valor;
      continue;
    }
    return {
      erro: `Argumento desconhecido: ${arg}. Use só --esperar, --sem-verificar, --forcar e --endereco <endereço>.`,
    };
  }
  return { opcoes };
}

/** Endereço por omissão: o domínio decidido (docs/decisoes.md). */
export const ENDERECO_OMISSAO = 'https://mapa.cmf-lux.lu';

const ANFITRIOES_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type EscolhaEndereco =
  | { endereco: string; origem: '--endereco' | 'ENDERECO_PUBLICO' | 'omissão' }
  | { erro: string };

/**
 * Onde perguntar pela /api/saude: o --endereco; senão o ENDERECO_PUBLICO, se for um endereço https público
 * (no .env do PC ele é o do próprio PC, ex.: http://localhost:5173, e aí não serve); senão o domínio.
 * Devolve só a origem (sem barra no fim).
 */
export function escolherEndereco(
  argumento: string | undefined,
  ambiente: string | undefined,
): EscolhaEndereco {
  if (argumento !== undefined) {
    const origem = origemPublica(argumento);
    if (!origem) {
      return { erro: `--endereco tem de ser um endereço https:// público (ex.: ${ENDERECO_OMISSAO}).` };
    }
    return { endereco: origem, origem: '--endereco' };
  }
  const doAmbiente = ambiente?.trim() ? origemPublica(ambiente.trim()) : null;
  if (doAmbiente) return { endereco: doAmbiente, origem: 'ENDERECO_PUBLICO' };
  return { endereco: ENDERECO_OMISSAO, origem: 'omissão' };
}

/** A origem de um endereço https que não seja o próprio PC, ou null. */
function origemPublica(texto: string): string | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || ANFITRIOES_LOCAIS.has(url.hostname)) return null;
  if (url.username || url.password) return null;
  return url.origin;
}
