// Preparação da BD ANTES de o servidor a abrir:
//   - a BD não existe e RESTAURAR_AO_ARRANCAR está definido → restaura essa cópia (verificada) para o caminho;
//   - a BD não existe, sem RESTAURAR_AO_ARRANCAR e com cópias configuradas → se o destino já tiver cópias,
//     recusa arrancar (um disco perdido ou vazio criaria uma BD vazia, cujas cópias passariam a ser as "últimas");
//     RESTAURAR_AO_ARRANCAR=nenhuma começa mesmo com uma BD nova;
//   - a BD existe → nunca a substitui; se houver migrações por aplicar, faz primeiro uma cópia 'migracao'
//     (se essa cópia falhar, lança: não se migra sem cópia).
// Qualquer erro aqui impede o servidor de arrancar, que é o que se quer.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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

export async function prepararBd(
  caminhoBd: string,
  config: ConfigCopias | null,
  env: NodeJS.ProcessEnv,
  opcoes: { agora?: () => Date; fetch?: FetchS3 } = {},
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
    console.warn(
      `Há ${pendentes.length} migração(ões) por aplicar (${pendentes.join(', ')}) e as cópias não estão configuradas: ` +
        'migra-se sem cópia de segurança.',
    );
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
