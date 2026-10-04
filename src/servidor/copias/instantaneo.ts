// Instantâneo consistente da BD com a API de backup do SQLite (pode correr com o servidor a gravar) e
// cópia completa: instantâneo → gzip → AES-256-GCM → destino.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { empacotar } from './cifra';
import { nomeCopia } from './nomes';
import { comPastaTemporaria } from './temporarios';
import type { Destino, MotivoCopia } from './tipos';

/** Bytes de um instantâneo da BD aberta em `cliente`. O temporário é sempre apagado (ver temporarios.ts). */
export async function tirarInstantaneo(cliente: Database.Database): Promise<Buffer> {
  return comPastaTemporaria('mapa-cmf-instantaneo-', async (pasta) => {
    const temporario = join(pasta, 'instantaneo.db');
    await cliente.backup(temporario);
    return await readFile(temporario);
  });
}

/** Instantâneo de uma BD que ainda não está aberta (antes de migrar, ou no PC): abre-a só para leitura. */
export async function tirarInstantaneoDoFicheiro(caminhoBd: string): Promise<Buffer> {
  const cliente = new Database(caminhoBd, { readonly: true, fileMustExist: true });
  try {
    return await tirarInstantaneo(cliente);
  } finally {
    cliente.close();
  }
}

/** Empacota os bytes de uma BD e envia-os para o destino. Devolve o nome da cópia. */
export async function enviarCopia(
  bytesBd: Uint8Array,
  destino: Destino,
  chave: Uint8Array,
  motivo: MotivoCopia,
  agora: Date,
): Promise<string> {
  const nome = nomeCopia(agora, motivo);
  await destino.enviar(nome, await empacotar(bytesBd, chave));
  return nome;
}
