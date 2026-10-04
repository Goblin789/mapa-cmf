// Pastas temporárias com a BD DECIFRADA (instantâneo e verificação). Apagam-se sempre no fim da operação
// (finally) e também, de forma síncrona, quando o processo sai a meio (process.exit do servidor ao encerrar,
// ou Ctrl+C no `npm run copias`, que scripts/copias.ts transforma numa saída normal). Se nem isso correr
// (SIGKILL, falha de energia), a primeira operação seguinte apaga as que tenham ficado com mais de 1 h.

import { readdirSync, rmSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Prefixos das pastas temporárias com dados em claro (em os.tmpdir()). */
export const PREFIXOS_TEMPORARIOS = ['mapa-cmf-instantaneo-', 'mapa-cmf-verificar-'] as const;
export type PrefixoTemporario = (typeof PREFIXOS_TEMPORARIOS)[number];

/** Uma pasta destas com mais do que isto é de um processo que morreu a meio (uma cópia leva segundos). */
const ABANDONADA_DEPOIS_DE = 3_600_000;

const pastasVivas = new Set<string>();
let saidaRegistada = false;
let restosLimpos = false;

function apagarVivasJa(): void {
  for (const pasta of pastasVivas) {
    try {
      rmSync(pasta, { recursive: true, force: true });
    } catch {
      // Melhor esforço (em Windows um ficheiro ainda aberto não se apaga): fica para a limpeza dos restos.
    }
  }
  pastasVivas.clear();
}

/** Apaga as pastas temporárias abandonadas (mais de 1 h) por processos que morreram a meio. */
export function limparRestos(pastaBase = tmpdir(), agora = Date.now()): string[] {
  const apagadas: string[] = [];
  let nomes: string[];
  try {
    nomes = readdirSync(pastaBase);
  } catch {
    return apagadas;
  }
  for (const nome of nomes) {
    if (!PREFIXOS_TEMPORARIOS.some((prefixo) => nome.startsWith(prefixo))) continue;
    const pasta = join(pastaBase, nome);
    if (pastasVivas.has(pasta)) continue;
    try {
      if (agora - statSync(pasta).mtimeMs <= ABANDONADA_DEPOIS_DE) continue;
      rmSync(pasta, { recursive: true, force: true });
      apagadas.push(nome);
    } catch {
      // Outro processo pode estar a apagá-la ao mesmo tempo, ou não haver permissão: não faz mal.
    }
  }
  return apagadas;
}

/** Corre `trabalho` com uma pasta temporária nova, que fica apagada no fim (mesmo que o processo saia a meio). */
export async function comPastaTemporaria<T>(
  prefixo: PrefixoTemporario,
  trabalho: (pasta: string) => Promise<T>,
): Promise<T> {
  if (!restosLimpos) {
    restosLimpos = true;
    limparRestos();
  }
  if (!saidaRegistada) {
    saidaRegistada = true;
    process.on('exit', apagarVivasJa);
  }
  const pasta = await mkdtemp(join(tmpdir(), prefixo));
  pastasVivas.add(pasta);
  try {
    return await trabalho(pasta);
  } finally {
    await rm(pasta, { recursive: true, force: true });
    pastasVivas.delete(pasta);
  }
}
