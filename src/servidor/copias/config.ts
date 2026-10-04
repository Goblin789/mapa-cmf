// Leitura da configuração das cópias (COPIAS_*). As mensagens dizem o que falta ou está mal, mas nunca
// mostram o valor de uma variável (a chave e as credenciais são segredos).

import type { ConfigCopias } from './tipos';

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Texto da variável sem espaços à volta; '' conta como não definida. */
function ler(env: NodeJS.ProcessEnv, nome: string): string | undefined {
  const valor = env[nome]?.trim();
  return valor ? valor : undefined;
}

/** Decodifica COPIAS_CHAVE: base64 de exatamente 32 bytes. */
export function lerChave(texto: string | undefined): Uint8Array {
  if (!texto) {
    throw new Error(
      'Falta COPIAS_CHAVE (32 bytes em base64). Gera uma com "npm run copias -- chave" e guarda-a no gestor de palavras-passe.',
    );
  }
  const bytes = BASE64.test(texto) ? Buffer.from(texto, 'base64') : null;
  if (bytes?.length !== 32) {
    throw new Error(
      'COPIAS_CHAVE não é válida: tem de ser exatamente 32 bytes em base64 (como as que "npm run copias -- chave" gera).',
    );
  }
  return new Uint8Array(bytes);
}

/**
 * Lê COPIAS_* do ambiente. null = sem cópias (sem COPIAS_DESTINO). Lança com uma mensagem clara se a
 * configuração estiver incompleta ou a chave não tiver 32 bytes.
 */
export function lerConfigCopias(env: NodeJS.ProcessEnv): ConfigCopias | null {
  const destino = ler(env, 'COPIAS_DESTINO');
  if (!destino) return null;

  if (destino === 's3') {
    const nomes = ['COPIAS_S3_ENDPOINT', 'COPIAS_S3_BALDE', 'COPIAS_S3_ID', 'COPIAS_S3_SEGREDO'] as const;
    const faltam = nomes.filter((nome) => !ler(env, nome));
    if (faltam.length > 0) {
      throw new Error(`COPIAS_DESTINO=s3, mas falta definir: ${faltam.join(', ')}.`);
    }
    const endpoint = lerEndpoint(ler(env, 'COPIAS_S3_ENDPOINT') as string);
    const balde = ler(env, 'COPIAS_S3_BALDE') as string;
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(balde)) {
      throw new Error('COPIAS_S3_BALDE não é um nome de balde válido (minúsculas, algarismos, "-" e ".").');
    }
    const chave = lerChave(ler(env, 'COPIAS_CHAVE'));
    return {
      chave,
      destino: {
        tipo: 's3',
        endpoint,
        balde,
        regiao: ler(env, 'COPIAS_S3_REGIAO') ?? 'auto',
        id: ler(env, 'COPIAS_S3_ID') as string,
        segredo: ler(env, 'COPIAS_S3_SEGREDO') as string,
      },
    };
  }

  if (destino.startsWith('pasta:')) {
    const caminho = destino.slice('pasta:'.length).trim();
    if (!caminho)
      throw new Error('COPIAS_DESTINO=pasta: precisa do caminho da pasta (ex.: pasta:dados/copias-teste).');
    return { chave: lerChave(ler(env, 'COPIAS_CHAVE')), destino: { tipo: 'pasta', caminho } };
  }

  throw new Error('COPIAS_DESTINO tem de ser "s3" ou "pasta:<caminho>".');
}

/** O endpoint tem de ser https e só a origem (ex.: https://<conta>.eu.r2.cloudflarestorage.com). */
function lerEndpoint(texto: string): string {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new Error(
      'COPIAS_S3_ENDPOINT não é um endereço válido (ex.: https://<conta>.eu.r2.cloudflarestorage.com).',
    );
  }
  if (url.protocol !== 'https:') throw new Error('COPIAS_S3_ENDPOINT tem de começar por https://.');
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error(
      'COPIAS_S3_ENDPOINT deve ser só o endereço do serviço, sem balde, caminho nem credenciais (o balde vai em COPIAS_S3_BALDE).',
    );
  }
  return url.origin;
}
