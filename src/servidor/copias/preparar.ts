// Preparação da BD ANTES de o servidor a abrir:
//   - a BD não existe e RESTAURAR_AO_ARRANCAR está definido → restaura essa cópia (verificada) para o caminho;
//   - a BD não existe, sem RESTAURAR_AO_ARRANCAR e com cópias configuradas → se o destino já tiver cópias,
//     recusa arrancar (um disco perdido ou vazio criaria uma BD vazia, cujas cópias passariam a ser as "últimas");
//     RESTAURAR_AO_ARRANCAR=nenhuma começa mesmo com uma BD nova;
//   - a BD existe → nunca a substitui; se houver migrações por aplicar, faz primeiro uma cópia 'migracao'
//     (se essa cópia falhar, lança: não se migra sem cópia). No PC (fora de produção) sem cópias configuradas,
//     faz uma cópia simples (backup do SQLite, não cifrada) para <pasta da BD>/copias/ (M2).
// Qualquer erro aqui impede o servidor de arrancar, que é o que se quer.

import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { mensagemSegura } from './agendador';
import { criarDestino, type FetchS3 } from './destinos';
import { enviarCopia, tirarInstantaneoDoFicheiro } from './instantaneo';
import { migracoesPendentes } from './migracoes';
import { avisoBdVazia, restaurarCopia } from './restauro';
import { copiasComNomeValido } from './retencao';
import type { ConfigCopias } from './tipos';

/** Valor de RESTAURAR_AO_ARRANCAR para começar de propósito com uma BD nova (vazia). */
export const SEM_RESTAURO = 'nenhuma';

export function segredosDaConfig(config: ConfigCopias): string[] {
  const segredos = [Buffer.from(config.chave).toString('base64')];
  if (config.destino.tipo === 's3') segredos.push(config.destino.id, config.destino.segredo);
  return segredos;
}

/**
 * A BD não existe e ninguém pediu um restauro: se o destino já tiver cópias, é quase de certeza um disco
 * perdido ou trocado. Recusa arrancar, em vez de criar uma BD vazia (e de a copiar por cima das boas).
 */
async function recusarSeHouverCopias(caminho: string, config: ConfigCopias, fetch?: FetchS3): Promise<void> {
  let copias: { nome: string; data: Date }[];
  try {
    copias = copiasComNomeValido(await criarDestino(config, { fetch }).listar());
  } catch (erro) {
    throw new Error(
      `A base de dados não existe em ${caminho} e não foi possível ver se há cópias para restaurar ` +
        `(${mensagemSegura(erro, segredosDaConfig(config), 1000)}). Para restaurar a última, define ` +
        `RESTAURAR_AO_ARRANCAR=ultima; para começar com uma base de dados nova, RESTAURAR_AO_ARRANCAR=${SEM_RESTAURO}.`,
    );
  }
  if (copias.length === 0) return;
  const ultima = copias.toSorted((a, b) => a.nome.localeCompare(b.nome)).at(-1)?.nome;
  throw new Error(
    `A base de dados não existe em ${caminho}, mas o destino das cópias (${config.destino.tipo}) já tem ` +
      `${copias.length} cópia(s) (a mais recente: ${ultima}). Não se cria uma base de dados vazia por cima. ` +
      'Para restaurar a última, define RESTAURAR_AO_ARRANCAR=ultima (ou o nome de uma cópia); para começar ' +
      `mesmo com uma base de dados nova, RESTAURAR_AO_ARRANCAR=${SEM_RESTAURO}.`,
  );
}

function avisarIgnorada(caminho: string): void {
  console.warn(
    `RESTAURAR_AO_ARRANCAR foi ignorada: já existe uma base de dados em ${caminho} e nunca é substituída. ` +
      'Podes apagar a variável.',
  );
}

/** "2026-10-04-213005": a data e a hora no Luxemburgo, para o nome da cópia simples. */
function carimbo(agora: Date): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Luxembourg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}-${partes.hour}${partes.minute}${partes.second}`;
}

/**
 * Cópia simples da BD antes de migrar, no PC: abre-a só para leitura e faz um backup do SQLite para
 * <pasta da BD>/copias/<nome>-antes-<1.ª migração pendente>-<AAAA-MM-DD-HHMMSS>.db (cria a pasta).
 * Devolve o caminho da cópia. Lança se falhar.
 */
export async function copiaSimplesAntesDeMigrar(
  caminho: string,
  migracao: string,
  agora: Date,
): Promise<string> {
  const pasta = join(dirname(caminho), 'copias');
  const nome = basename(caminho, extname(caminho));
  const destino = join(pasta, `${nome}-antes-${migracao}-${carimbo(agora)}.db`);
  mkdirSync(pasta, { recursive: true });
  const bd = new Database(caminho, { readonly: true, fileMustExist: true });
  try {
    await bd.backup(destino);
  } finally {
    bd.close();
  }
  return destino;
}

export async function prepararBd(
  caminhoBd: string,
  config: ConfigCopias | null,
  env: NodeJS.ProcessEnv,
  opcoes: {
    agora?: () => Date;
    fetch?: FetchS3;
    /** Em produção as cópias são obrigatórias (index.ts); a cópia simples é só para o PC. */
    producao?: boolean;
  } = {},
): Promise<void> {
  if (caminhoBd === ':memory:') return;
  const caminho = resolve(caminhoBd);
  const agora = opcoes.agora ?? (() => new Date());
  const restaurar = env.RESTAURAR_AO_ARRANCAR?.trim() || undefined;

  if (!existsSync(caminho)) {
    if (restaurar === SEM_RESTAURO) {
      console.warn(
        `RESTAURAR_AO_ARRANCAR=${SEM_RESTAURO}: começa-se com uma base de dados nova em ${caminho}.`,
      );
      return;
    }
    if (!restaurar) {
      if (config) await recusarSeHouverCopias(caminho, config, opcoes.fetch);
      return;
    }
    if (!config) {
      throw new Error(
        'RESTAURAR_AO_ARRANCAR está definido, mas as cópias não estão configuradas (falta COPIAS_DESTINO e COPIAS_CHAVE).',
      );
    }
    try {
      const resultado = await restaurarCopia({
        destino: criarDestino(config, { fetch: opcoes.fetch }),
        chave: config.chave,
        qual: restaurar,
        para: caminho,
        agora: agora(),
      });
      const { pessoas, lotes, versao } = resultado.verificacao;
      console.log(
        `BD restaurada da cópia ${resultado.nome} (${pessoas} pessoas, ${lotes} lotes, versão ${versao}). ` +
          'Já podes apagar RESTAURAR_AO_ARRANCAR.',
      );
      const aviso = avisoBdVazia(resultado.verificacao);
      if (aviso) console.warn(aviso);
    } catch (erro) {
      throw new Error(
        `Não foi possível restaurar a cópia "${restaurar}": ${mensagemSegura(erro, segredosDaConfig(config), 1000)}`,
      );
    }
    return;
  }

  if (restaurar) avisarIgnorada(caminho);

  const pendentes = migracoesPendentes(caminho);
  if (pendentes.length === 0) return;
  if (!config) {
    if (opcoes.producao) {
      console.warn(
        `Há ${pendentes.length} migração(ões) por aplicar (${pendentes.join(', ')}) e as cópias não estão configuradas: ` +
          'migra-se sem cópia de segurança.',
      );
      return;
    }
    // No PC não há destino de cópias: uma cópia simples ao lado da BD. Sem ela não se migra.
    let destino: string;
    try {
      destino = await copiaSimplesAntesDeMigrar(caminho, pendentes[0] as string, agora());
    } catch (erro) {
      throw new Error(
        `Há migrações por aplicar (${pendentes.join(', ')}) e a cópia antes de migrar falhou: ` +
          `${erro instanceof Error ? erro.message : String(erro)}. O servidor não arranca sem essa cópia.`,
      );
    }
    console.log(`Cópia antes de migrar (${pendentes.join(', ')}): ${destino}`);
    return;
  }
  try {
    const bytes = await tirarInstantaneoDoFicheiro(caminho);
    const nome = await enviarCopia(
      bytes,
      criarDestino(config, { fetch: opcoes.fetch }),
      config.chave,
      'migracao',
      agora(),
    );
    console.log(`Cópia de segurança antes de migrar: ${nome} (${pendentes.join(', ')}).`);
  } catch (erro) {
    throw new Error(
      `Há migrações por aplicar (${pendentes.join(', ')}) e a cópia de segurança antes de migrar falhou: ` +
        `${mensagemSegura(erro, segredosDaConfig(config), 1000)}. O servidor não arranca sem essa cópia.`,
    );
  }
}
