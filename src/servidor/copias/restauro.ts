// Restauro verificado: obtém a cópia, decifra, descomprime para um temporário NA MESMA PASTA do destino,
// verifica-a (integridade + tabelas do Mapa) e só então a põe no lugar com um rename atómico.
// Nunca substitui uma BD que exista, exceto com `substituir`, que primeiro a põe de lado (com o -wal e o -shm).

import { existsSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { desempacotar } from './cifra';
import { carimbo, lerNomeCopia } from './nomes';
import type { Destino } from './tipos';

/** Tabelas que uma BD do Mapa tem de ter para ser aceite num restauro. */
const TABELAS_OBRIGATORIAS = ['pessoas', 'lotes', '__drizzle_migrations'] as const;

/** Ficheiros que o SQLite junta à BD em modo WAL. */
const SUFIXOS_SQLITE = ['', '-wal', '-shm'] as const;

export interface ResultadoVerificacao {
  pessoas: number;
  lotes: number;
  /** Versão dos dados (o maior id de lote, como no /api/estado). */
  versao: number;
  /** Número de migrações aplicadas. */
  migracoes: number;
}

/**
 * Verifica uma BD em ficheiro: PRAGMA integrity_check = ok e existem as tabelas pessoas, lotes e
 * __drizzle_migrations. Abre só para leitura. Lança com uma mensagem clara se não servir.
 */
export function verificarBd(caminho: string): ResultadoVerificacao {
  let cliente: Database.Database;
  try {
    cliente = new Database(caminho, { readonly: true, fileMustExist: true });
  } catch {
    throw new Error('A cópia não é uma base de dados SQLite que se consiga abrir.');
  }
  try {
    let integridade: unknown;
    try {
      integridade = cliente.pragma('integrity_check', { simple: true });
    } catch {
      throw new Error('A cópia não é uma base de dados SQLite válida.');
    }
    if (integridade !== 'ok') throw new Error('A cópia falhou a verificação de integridade do SQLite.');

    const existentes = new Set(
      (
        cliente.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
      ).map((linha) => linha.name),
    );
    const faltam = TABELAS_OBRIGATORIAS.filter((tabela) => !existentes.has(tabela));
    if (faltam.length > 0) {
      throw new Error(`A cópia não parece ser do Mapa CMF: faltam as tabelas ${faltam.join(', ')}.`);
    }

    const contar = (sql: string): number =>
      Number((cliente.prepare(sql).get() as { n: number | null }).n ?? 0);
    return {
      pessoas: contar('SELECT COUNT(*) AS n FROM pessoas'),
      lotes: contar('SELECT COUNT(*) AS n FROM lotes'),
      versao: contar('SELECT MAX(id) AS n FROM lotes'),
      migracoes: contar('SELECT COUNT(*) AS n FROM __drizzle_migrations'),
    };
  } finally {
    cliente.close();
  }
}

/** Nome da cópia a usar: 'ultima' = a mais recente do destino (pelo nome, que é ordenável). */
export async function escolherCopia(destino: Destino, qual: string): Promise<string> {
  const pedido = qual.trim();
  if (!pedido) throw new Error('Diz que cópia restaurar: "ultima" ou o nome da cópia.');
  if (pedido !== 'ultima') return pedido;
  const nomes = (await destino.listar())
    .map((copia) => copia.nome)
    .filter((nome) => lerNomeCopia(nome) !== null)
    .sort();
  const ultima = nomes.at(-1);
  if (!ultima) throw new Error(`Não há nenhuma cópia no destino (${destino.tipo}).`);
  return ultima;
}

/** Obtém e abre (decifra + descomprime) uma cópia. */
export async function obterBdDaCopia(
  destino: Destino,
  chave: Uint8Array,
  qual: string,
): Promise<{ nome: string; bytes: Buffer }> {
  const nome = await escolherCopia(destino, qual);
  const ficheiro = await destino.obter(nome);
  return { nome, bytes: await desempacotar(ficheiro, chave) };
}

/** Temporário ao lado de `caminho` (mesma pasta = mesmo disco, para o rename ser atómico). */
function temporarioAoLado(caminho: string, etiqueta: string): string {
  return `${caminho}.${etiqueta}-${process.pid}-${Date.now().toString(36)}.tmp`;
}

async function apagarComCompanheiros(caminho: string): Promise<void> {
  for (const sufixo of SUFIXOS_SQLITE) await rm(`${caminho}${sufixo}`, { force: true });
}

/** Põe de lado a BD (e o -wal/-shm, para o -wal continuar a acompanhar a sua BD). Devolve o novo nome. */
async function porDeLado(caminho: string, novo: string): Promise<string> {
  for (const sufixo of SUFIXOS_SQLITE) {
    if (existsSync(`${caminho}${sufixo}`)) await rename(`${caminho}${sufixo}`, `${novo}${sufixo}`);
  }
  return novo;
}

/**
 * Recusa pôr de lado uma BD que outro processo (o servidor) tem aberta: em Linux o rename não falha e o servidor
 * continuaria a gravar no ficheiro posto de lado. Em modo WAL cada ligação aberta guarda um bloqueio partilhado
 * na BD, por isso um bloqueio exclusivo (sem esperar) só se consegue se mais ninguém a tiver aberta.
 */
export function exigirQueNaoEstejaEmUso(caminho: string): void {
  let cliente: Database.Database;
  try {
    cliente = new Database(caminho, { fileMustExist: true, timeout: 0 });
  } catch {
    return; // Não se abre: não é uma BD em uso (vai ser posta de lado na mesma).
  }
  try {
    cliente.pragma('locking_mode = EXCLUSIVE');
    cliente.exec('BEGIN EXCLUSIVE');
    cliente.prepare('SELECT COUNT(*) FROM sqlite_master').get();
    cliente.exec('ROLLBACK');
  } catch (erro) {
    const codigo = String((erro as { code?: unknown }).code ?? '');
    if (codigo.startsWith('SQLITE_BUSY') || codigo.startsWith('SQLITE_LOCKED')) {
      throw new Error(
        `A base de dados em ${caminho} está a ser usada (o servidor está ligado?). ` +
          'Pára o servidor antes de restaurar por cima dela.',
      );
    }
    // Outros erros (ficheiro que não é SQLite, por exemplo): não está em uso; é posta de lado na mesma.
  } finally {
    cliente.close();
  }
}

/** Aviso para uma cópia sem pessoas (de uma BD vazia): quase de certeza não é a que se quer restaurar. */
export function avisoBdVazia(verificacao: ResultadoVerificacao): string | null {
  if (verificacao.pessoas > 0) return null;
  return (
    'ATENÇÃO: esta cópia não tem nenhuma pessoa (é de uma base de dados vazia). ' +
    'Confirma com "npm run copias -- listar" se há uma cópia mais antiga com os dados.'
  );
}

/** Escreve e força a escrita no disco (fsync): uma falha de energia logo a seguir não deixa um ficheiro truncado. */
async function escreverNoDisco(caminho: string, bytes: Uint8Array): Promise<void> {
  const ficheiro = await open(caminho, 'wx');
  try {
    await ficheiro.writeFile(bytes);
    await ficheiro.sync();
  } finally {
    await ficheiro.close();
  }
}

/** fsync da pasta, para o rename também ficar no disco. O Windows não deixa abrir pastas: lá não se faz. */
async function sincronizarPasta(pasta: string): Promise<void> {
  if (process.platform === 'win32') return;
  try {
    const aberta = await open(pasta, 'r');
    try {
      await aberta.sync();
    } finally {
      await aberta.close();
    }
  } catch {
    // Melhor esforço: alguns sistemas de ficheiros não aceitam fsync de pastas.
  }
}

/** Bytes de uma BD → ficheiro verificado no temporário. O chamador põe-no no lugar ou apaga-o. */
export async function escreverEVerificar(
  bytes: Uint8Array,
  temporario: string,
): Promise<ResultadoVerificacao> {
  await escreverNoDisco(temporario, bytes);
  return verificarBd(temporario);
}

export interface ResultadoRestauro {
  nome: string;
  verificacao: ResultadoVerificacao;
  /** Onde ficou a BD que lá estava (só com `substituir`). */
  antiga: string | null;
}

/**
 * Restaura a cópia `qual` ('ultima' ou um nome) para `para`. Recusa se `para` existir, salvo com `substituir`
 * (a BD que lá estava passa a <para>.antes-restauro-<data>). Uma cópia que falhe a verificação nunca chega a `para`.
 */
export async function restaurarCopia(opcoes: {
  destino: Destino;
  chave: Uint8Array;
  qual: string;
  para: string;
  substituir?: boolean;
  agora?: Date;
}): Promise<ResultadoRestauro> {
  const para = resolve(opcoes.para);
  const agora = opcoes.agora ?? new Date();
  if (existsSync(para)) {
    if (!opcoes.substituir) throw new Error(`Já existe uma base de dados em ${para}: não a substituo.`);
    // Logo no início, para não se esperar pela transferência só para saber que o servidor está ligado.
    exigirQueNaoEstejaEmUso(para);
  }

  const { nome, bytes } = await obterBdDaCopia(opcoes.destino, opcoes.chave, opcoes.qual);
  await mkdir(dirname(para), { recursive: true });
  const temporario = temporarioAoLado(para, 'restauro');
  try {
    const verificacao = await escreverEVerificar(bytes, temporario);

    let antiga: string | null = null;
    if (existsSync(para)) {
      exigirQueNaoEstejaEmUso(para);
      antiga = await porDeLado(para, `${para}.antes-restauro-${carimbo(agora)}`);
    } else if (existsSync(`${para}-wal`) || existsSync(`${para}-shm`)) {
      // Restos de uma BD que já não existe: o SQLite juntaria o -wal antigo à BD restaurada.
      await porDeLado(para, `${para}.orfao-${carimbo(agora)}`);
    }
    if (existsSync(para))
      throw new Error(`Apareceu uma base de dados em ${para} durante o restauro: não a substituo.`);
    await rename(temporario, para);
    await sincronizarPasta(dirname(para));
    return { nome, verificacao, antiga };
  } finally {
    await apagarComCompanheiros(temporario);
  }
}
