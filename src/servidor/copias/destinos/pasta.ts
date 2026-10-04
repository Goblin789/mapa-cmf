// Destino "pasta": as cópias ficam numa pasta local (desenvolvimento, testes e ensaios no PC).

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { EXTENSAO, lerNomeCopia, PREFIXO, validarNomeFicheiro } from '../nomes';
import { type CopiaNoDestino, type Destino, ErroCopiaInexistente } from '../tipos';

/** Um ".parcial" com mais do que isto é de um envio que morreu a meio (um envio leva segundos). */
const PARCIAL_ABANDONADO_DEPOIS_DE = 3_600_000;

/** Apaga os ".mapa-….parcial" deixados por envios interrompidos (processo morto antes do finally). */
async function limparParciaisAbandonados(pasta: string): Promise<void> {
  const agora = Date.now();
  for (const nome of await readdir(pasta)) {
    if (!nome.startsWith(`.${PREFIXO}`) || !nome.endsWith('.parcial')) continue;
    try {
      const info = await stat(join(pasta, nome));
      if (info.isFile() && agora - info.mtimeMs > PARCIAL_ABANDONADO_DEPOIS_DE) await rm(join(pasta, nome));
    } catch {
      // Outro processo pode estar a acabá-lo ou a apagá-lo: não faz mal.
    }
  }
}

export function criarDestinoPasta(caminho: string): Destino {
  const pasta = resolve(caminho);

  return {
    tipo: 'pasta',

    async enviar(nome, bytes) {
      validarNomeFicheiro(nome);
      await mkdir(pasta, { recursive: true });
      await limparParciaisAbandonados(pasta);
      // Escreve num temporário e muda o nome: nunca fica uma cópia a meio com o nome final.
      const temporario = join(pasta, `.${nome}.${process.pid}.parcial`);
      try {
        await writeFile(temporario, bytes);
        await rename(temporario, join(pasta, nome));
      } finally {
        await rm(temporario, { force: true });
      }
    },

    async listar() {
      let nomes: string[];
      try {
        nomes = await readdir(pasta);
      } catch (erro) {
        if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw erro;
      }
      const copias: CopiaNoDestino[] = [];
      for (const nome of nomes) {
        if (!nome.startsWith(PREFIXO) || !nome.endsWith(EXTENSAO)) continue;
        const info = await stat(join(pasta, nome));
        if (!info.isFile()) continue;
        copias.push({ nome, tamanho: info.size, data: lerNomeCopia(nome)?.data ?? info.mtime });
      }
      return copias;
    },

    async obter(nome) {
      validarNomeFicheiro(nome);
      try {
        return new Uint8Array(await readFile(join(pasta, nome)));
      } catch (erro) {
        if ((erro as NodeJS.ErrnoException).code === 'ENOENT') throw new ErroCopiaInexistente(nome);
        throw erro;
      }
    },

    async apagar(nome) {
      validarNomeFicheiro(nome);
      await rm(join(pasta, nome), { force: true });
    },
  };
}
