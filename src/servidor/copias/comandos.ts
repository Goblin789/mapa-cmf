// Comandos de `npm run copias` (scripts/copias.ts). Separados do script para se poderem testar.
//
//   npm run copias -- chave                                  # gera uma COPIAS_CHAVE nova
//   npm run copias -- fazer [--bd caminho] [--motivo pc]     # cópia da BD (omissão: a do .env, BD)
//   npm run copias -- listar                                 # cópias no destino
//   npm run copias -- verificar <nome|ultima>                # decifra e verifica, sem escrever nada
//   npm run copias -- restaurar <nome|ultima> --para <caminho> [--substituir]
//
// Nunca se imprimem segredos (exceto a chave acabada de gerar com "chave", que é para isso mesmo).

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mensagemSegura } from './agendador';
import { lerConfigCopias } from './config';
import { criarDestino, type FetchS3 } from './destinos';
import { enviarCopia, tirarInstantaneoDoFicheiro } from './instantaneo';
import { segredosDaConfig } from './preparar';
import {
  avisoBdVazia,
  escreverEVerificar,
  obterBdDaCopia,
  type ResultadoVerificacao,
  restaurarCopia,
} from './restauro';
import { comPastaTemporaria } from './temporarios';
import { type ConfigCopias, MOTIVOS, type MotivoCopia } from './tipos';

export type ComandoCopias =
  | { tipo: 'ajuda' }
  | { tipo: 'chave' }
  | { tipo: 'fazer'; bd: string | null; motivo: MotivoCopia }
  | { tipo: 'listar' }
  | { tipo: 'verificar'; qual: string }
  | { tipo: 'restaurar'; qual: string; para: string; substituir: boolean };

export const AJUDA = `Cópias de segurança do Mapa CMF

  npm run copias -- chave
      Gera uma chave nova (COPIAS_CHAVE).
  npm run copias -- fazer [--bd <caminho>] [--motivo pc]
      Faz uma cópia da BD (por omissão a do .env, BD) para o destino (COPIAS_DESTINO).
  npm run copias -- listar
      Lista as cópias no destino.
  npm run copias -- verificar <nome|ultima>
      Obtém, decifra e verifica uma cópia, sem escrever nada fora de um temporário.
  npm run copias -- restaurar <nome|ultima> --para <caminho> [--substituir]
      Restaura uma cópia verificada. Recusa se já existir uma BD em <caminho>, salvo com --substituir
      (a que lá estava fica em <caminho>.antes-restauro-<data>).`;

/** Lê os argumentos. Um argumento desconhecido é erro (nunca se adivinha o que se queria). */
export function lerArgumentosCopias(args: readonly string[]): { comando: ComandoCopias } | { erro: string } {
  const [nome, ...resto] = args;
  const posicionais: string[] = [];
  const opcoes = new Map<string, string | true>();
  const comValor = new Set(['--bd', '--motivo', '--para']);
  const semValor = new Set(['--substituir']);
  for (let i = 0; i < resto.length; i++) {
    const arg = resto[i] as string;
    if (comValor.has(arg)) {
      const valor = resto[i + 1];
      if (valor === undefined || valor.startsWith('--')) return { erro: `${arg} precisa de um valor.` };
      opcoes.set(arg, valor);
      i++;
    } else if (semValor.has(arg)) {
      opcoes.set(arg, true);
    } else if (arg.startsWith('-')) {
      return { erro: `Opção desconhecida: ${arg}` };
    } else {
      posicionais.push(arg);
    }
  }

  const aceitar = (permitidas: string[], maxPosicionais: number): string | null => {
    const proibida = [...opcoes.keys()].find((opcao) => !permitidas.includes(opcao));
    if (proibida) return `A opção ${proibida} não se usa com "${nome}".`;
    if (posicionais.length > maxPosicionais) return `Argumento a mais: ${posicionais[maxPosicionais]}`;
    return null;
  };

  switch (nome) {
    case undefined:
    case 'ajuda':
    case '--help':
    case '-h':
      return { comando: { tipo: 'ajuda' } };
    case 'chave':
    case 'listar': {
      const erro = aceitar([], 0);
      return erro ? { erro } : { comando: { tipo: nome } };
    }
    case 'fazer': {
      const erro = aceitar(['--bd', '--motivo'], 0);
      if (erro) return { erro };
      const motivo = (opcoes.get('--motivo') as string | undefined) ?? 'pc';
      if (!MOTIVOS.includes(motivo as MotivoCopia)) {
        return { erro: `Motivo desconhecido: ${motivo} (aceites: ${MOTIVOS.join(', ')}).` };
      }
      return {
        comando: {
          tipo: 'fazer',
          bd: (opcoes.get('--bd') as string | undefined) ?? null,
          motivo: motivo as MotivoCopia,
        },
      };
    }
    case 'verificar': {
      const erro = aceitar([], 1);
      if (erro) return { erro };
      const qual = posicionais[0];
      if (!qual) return { erro: 'Diz que cópia verificar: o nome ou "ultima".' };
      return { comando: { tipo: 'verificar', qual } };
    }
    case 'restaurar': {
      const erro = aceitar(['--para', '--substituir'], 1);
      if (erro) return { erro };
      const qual = posicionais[0];
      if (!qual) return { erro: 'Diz que cópia restaurar: o nome ou "ultima".' };
      const para = opcoes.get('--para');
      if (typeof para !== 'string') return { erro: 'Falta --para <caminho> (onde fica a BD restaurada).' };
      return { comando: { tipo: 'restaurar', qual, para, substituir: opcoes.has('--substituir') } };
    }
    default:
      return { erro: `Comando desconhecido: ${nome}\n\n${AJUDA}` };
  }
}

export interface Saida {
  info(texto: string): void;
  erro(texto: string): void;
}

const DATA_LUXEMBURGO = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/Luxembourg',
  dateStyle: 'short',
  timeStyle: 'medium',
});

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function descreverVerificacao(v: ResultadoVerificacao): string {
  return `${v.pessoas} pessoas, ${v.lotes} lotes, versão ${v.versao}, ${v.migracoes} migrações aplicadas`;
}

function exigirConfig(env: NodeJS.ProcessEnv): ConfigCopias {
  const config = lerConfigCopias(env);
  if (!config) {
    throw new Error(
      'As cópias não estão configuradas: define COPIAS_DESTINO ("s3" ou "pasta:<caminho>") e COPIAS_CHAVE (no .env ou no comando).',
    );
  }
  return config;
}

/** Executa um comando. Devolve o código de saída (0 = correu bem). Nunca lança. */
export async function executarComandoCopias(
  comando: ComandoCopias,
  env: NodeJS.ProcessEnv,
  saida: Saida = { info: console.log, erro: console.error },
  opcoes: { fetch?: FetchS3; agora?: () => Date } = {},
): Promise<number> {
  const agora = opcoes.agora ?? (() => new Date());
  let segredos: string[] = [];
  try {
    if (comando.tipo === 'ajuda') {
      saida.info(AJUDA);
      return 0;
    }

    if (comando.tipo === 'chave') {
      saida.info(randomBytes(32).toString('base64'));
      saida.info(
        [
          '',
          'Esta é a chave das cópias de segurança (COPIAS_CHAVE). Agora:',
          '  1. Guarda-a no gestor de palavras-passe (ex.: "Mapa CMF — chave das cópias").',
          '  2. Cola-a no Render, nas variáveis do serviço, como COPIAS_CHAVE.',
          'Nunca a ponhas no chat, no git nem em e-mails. Sem ela as cópias NÃO se conseguem ler:',
          'se a perderes, as cópias feitas com ela ficam inúteis.',
        ].join('\n'),
      );
      return 0;
    }

    const config = exigirConfig(env);
    segredos = segredosDaConfig(config);
    const destino = criarDestino(config, { fetch: opcoes.fetch });

    switch (comando.tipo) {
      case 'fazer': {
        const caminhoBd = resolve(comando.bd ?? env.BD ?? 'dados/mapa.db');
        if (!existsSync(caminhoBd)) throw new Error(`Não existe nenhuma base de dados em ${caminhoBd}.`);
        // Abre a BD só para leitura: pode correr com o servidor ligado.
        const bytes = await tirarInstantaneoDoFicheiro(caminhoBd);
        const nome = await enviarCopia(bytes, destino, config.chave, comando.motivo, agora());
        saida.info(
          `Cópia feita: ${nome} (${formatarTamanho(bytes.length)} antes de comprimir) → ${destino.tipo}.`,
        );
        return 0;
      }
      case 'listar': {
        const copias = (await destino.listar()).toSorted((a, b) => a.nome.localeCompare(b.nome));
        if (copias.length === 0) {
          saida.info(`Não há cópias no destino (${destino.tipo}).`);
          return 0;
        }
        for (const copia of copias) {
          saida.info(
            `${copia.nome}  ${DATA_LUXEMBURGO.format(copia.data)}  ${formatarTamanho(copia.tamanho).padStart(9)}`,
          );
        }
        saida.info(`${copias.length} cópia(s) em ${destino.tipo} (datas na hora do Luxemburgo).`);
        return 0;
      }
      case 'verificar': {
        const { nome, bytes } = await obterBdDaCopia(destino, config.chave, comando.qual);
        // A BD decifrada fica numa pasta temporária que se apaga sempre (também com Ctrl+C: ver temporarios.ts).
        const verificacao = await comPastaTemporaria('mapa-cmf-verificar-', (pasta) =>
          escreverEVerificar(bytes, join(pasta, 'verificar.db')),
        );
        saida.info(`Cópia ${nome}: decifrada e íntegra (${descreverVerificacao(verificacao)}).`);
        const aviso = avisoBdVazia(verificacao);
        if (aviso) saida.erro(aviso);
        return 0;
      }
      case 'restaurar': {
        const resultado = await restaurarCopia({
          destino,
          chave: config.chave,
          qual: comando.qual,
          para: comando.para,
          substituir: comando.substituir,
          agora: agora(),
        });
        if (resultado.antiga) saida.info(`A BD que lá estava ficou em ${resultado.antiga}.`);
        saida.info(
          `Restaurada a cópia ${resultado.nome} em ${resolve(comando.para)} (${descreverVerificacao(resultado.verificacao)}).`,
        );
        const aviso = avisoBdVazia(resultado.verificacao);
        if (aviso) saida.erro(aviso);
        return 0;
      }
    }
  } catch (erro) {
    // No terminal cabem mensagens mais compridas (caminhos inteiros) do que no /api/saude.
    saida.erro(`Erro: ${mensagemSegura(erro, segredos, 2000)}`);
    return 1;
  }
}
