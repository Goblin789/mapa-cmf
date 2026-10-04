// Formato de uma cópia: gzip da BD e depois AES-256-GCM.
//   ficheiro = "MAPACMF1" (8 bytes) ‖ iv (12 bytes, aleatório) ‖ cifrado ‖ tag (16 bytes)
// O cabeçalho mágico entra também como AAD: mudar qualquer byte do ficheiro (ou usar outra chave) faz falhar
// a autenticação, e nunca se devolvem bytes não autenticados.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

const comprimir = promisify(gzip);
const descomprimir = promisify(gunzip);

export const MAGICO = Buffer.from('MAPACMF1', 'ascii');
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;

export const MENSAGEM_DANIFICADA = 'A cópia está danificada ou a chave não é a certa.';

function validarChave(chave: Uint8Array): void {
  if (chave.length !== 32) throw new Error('A chave das cópias tem de ter 32 bytes.');
}

export function cifrar(dados: Uint8Array, chave: Uint8Array): Buffer {
  validarChave(chave);
  const iv = randomBytes(TAMANHO_IV);
  const cifra = createCipheriv('aes-256-gcm', chave, iv);
  cifra.setAAD(MAGICO);
  const cifrado = Buffer.concat([cifra.update(dados), cifra.final()]);
  return Buffer.concat([MAGICO, iv, cifrado, cifra.getAuthTag()]);
}

/** Lança Error(MENSAGEM_DANIFICADA) se o ficheiro não for uma cópia válida para esta chave. */
export function decifrar(ficheiro: Uint8Array, chave: Uint8Array): Buffer {
  validarChave(chave);
  const bytes = Buffer.from(ficheiro.buffer, ficheiro.byteOffset, ficheiro.byteLength);
  if (
    bytes.length < MAGICO.length + TAMANHO_IV + TAMANHO_TAG ||
    !bytes.subarray(0, MAGICO.length).equals(MAGICO)
  ) {
    throw new Error(MENSAGEM_DANIFICADA);
  }
  const iv = bytes.subarray(MAGICO.length, MAGICO.length + TAMANHO_IV);
  const cifrado = bytes.subarray(MAGICO.length + TAMANHO_IV, bytes.length - TAMANHO_TAG);
  const tag = bytes.subarray(bytes.length - TAMANHO_TAG);
  try {
    const decifra = createDecipheriv('aes-256-gcm', chave, iv, { authTagLength: TAMANHO_TAG });
    decifra.setAAD(MAGICO);
    decifra.setAuthTag(tag);
    return Buffer.concat([decifra.update(cifrado), decifra.final()]);
  } catch {
    throw new Error(MENSAGEM_DANIFICADA);
  }
}

/** BD → ficheiro da cópia (comprime e cifra). */
export async function empacotar(bd: Uint8Array, chave: Uint8Array): Promise<Buffer> {
  return cifrar(await comprimir(bd), chave);
}

/** Ficheiro da cópia → BD (decifra e descomprime). */
export async function desempacotar(ficheiro: Uint8Array, chave: Uint8Array): Promise<Buffer> {
  const comprimido = decifrar(ficheiro, chave);
  try {
    return await descomprimir(comprimido);
  } catch {
    throw new Error('A cópia decifrou-se, mas não se consegue descomprimir (ficheiro de outro formato?).');
  }
}
