// Importação com I/O: lê os Excel da pasta de origem (só leitura, nunca se escreve lá), escreve o relatório
// em dados/ e, com --aplicar, grava na base de dados local. A lógica está nas funções puras de processar.ts.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readXlsxFile from 'read-excel-file/node';
import { config } from '../servidor/config';
import { abrirBd } from '../servidor/db/ligacao';
import { aplicarNaBd } from './aplicar';
import {
  type Folhas,
  processarImportacao,
  type ResultadoImportacao,
  type Resumo,
  resumir,
  textoResumo,
} from './processar';
import { type FicheiroLido, gerarRelatorioHtml, type MetaRelatorio } from './relatorio';
import type { DadosIniciais } from './tipos';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PASTA_DADOS_INICIAIS = join(RAIZ, 'dados-iniciais');
export const CAMINHO_RELATORIO = join(RAIZ, 'dados', 'relatorio-importacao.html');

function lerJson<T>(nome: string): T {
  return JSON.parse(readFileSync(join(PASTA_DADOS_INICIAIS, nome), 'utf8')) as T;
}

export function lerDadosIniciais(): DadosIniciais {
  return {
    clientes: lerJson('clientes.json'),
    casas: lerJson('casas.json'),
    carrinhas: lerJson('carrinhas.json'),
    locais: lerJson('locais.json'),
    importacao: lerJson('importacao.json'),
  };
}

async function lerExcel(caminho: string): Promise<Folhas> {
  const folhas = await readXlsxFile(caminho);
  return new Map(folhas.map((f) => [f.sheet, f.data as unknown[][]]));
}

/**
 * Ficheiro do Michael: só serve para cruzar, por isso não existir ou não se conseguir ler
 * (protegido, corrompido…) não pára a importação; fica sem cruzamento e com a nota no relatório.
 */
export async function lerMichaelSeDer(caminho: string): Promise<{ folhas: Folhas | null; nota: string }> {
  if (!existsSync(caminho)) return { folhas: null, nota: 'Não encontrado: sem cruzamento' };
  try {
    return { folhas: await lerExcel(caminho), nota: 'Ficheiro do Michael (só para cruzar)' };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return { folhas: null, nota: `Não foi possível ler (${motivo}): sem cruzamento` };
  }
}

function descrever(caminho: string, nota: string | null): FicheiroLido {
  return {
    nome: basename(caminho),
    pasta: dirname(caminho),
    modificadoEm: existsSync(caminho) ? statSync(caminho).mtime : null,
    nota,
  };
}

/** `caminho` está dentro de `pasta`? (Windows: sem distinguir maiúsculas.) */
export function estaDentro(caminho: string, pasta: string): boolean {
  const c = resolve(caminho).toLowerCase();
  const p = resolve(pasta).toLowerCase();
  return c === p || c.startsWith(`${p}\\`) || c.startsWith(`${p}/`);
}

function imprimirResumo(s: Resumo, r: ResultadoImportacao, meta: MetaRelatorio): void {
  const modo = {
    ensaio: 'modo de ensaio (nada foi gravado)',
    aplicado: `gravado em ${meta.bd} (lote nº ${meta.loteId})`,
    recusado: 'NÃO gravado: há erros bloqueantes',
    falhou: `a gravação FALHOU (${meta.falha}); a base de dados ficou como estava`,
  }[meta.modo];
  const d = r.discrepancias;
  const porCampo = (c: string) => d.diferencas.filter((x) => x.campo === c).length;
  const linhas = [
    `Importação — ${modo}`,
    `  Pessoas: ${s.pessoas} (${s.pessoasLista} da folha Pessoal + ${s.pessoasExtra} extra)`,
    `  Por cliente: ${s.porCliente.map((c) => `${c.nome} ${c.pessoas}`).join(' · ')}`,
    `  Fora das casas: ${s.foraDasCasas} (${s.foraDasCasasAConfirmar} a confirmar) · ` +
      `Sem transporte: ${s.semTransporte} (${s.semTransporteAConfirmar} a confirmar)`,
    `  Clientes ${s.clientes} · Locais ${s.locais} · Casas ${s.casas} · Carrinhas ${s.carrinhas}`,
    `  Erros bloqueantes: ${s.errosBloqueantes} · Avisos: ${s.avisos}`,
    d.michaelDisponivel
      ? `  Cruzamento com o Michael: diferenças de casa ${porCampo('casa')}, de carrinha ${porCampo('carrinha')}, ` +
        `de cliente ${porCampo('cliente')} · só no Michael ${d.soNoMichael.length} · ` +
        `só na lista ${d.soNaLista.length} · repetidos ${d.repetidosNoMichael.length}`
      : '  Cruzamento com o Michael: ficheiro não lido',
    `  Relatório: ${CAMINHO_RELATORIO}`,
  ];
  console.log(linhas.join('\n'));
}

/** Corre a importação. Devolve o código de saída (0 = correu bem). */
export async function executarImportacao({ aplicar }: { aplicar: boolean }): Promise<number> {
  const agora = new Date();
  if (!config.pastaOrigem) {
    console.error('Falta PASTA_ORIGEM no .env (pasta com os Excel de origem).');
    return 1;
  }
  if (
    estaDentro(CAMINHO_RELATORIO, config.pastaOrigem) ||
    (aplicar && estaDentro(config.bd, config.pastaOrigem))
  ) {
    console.error('O relatório e a base de dados não podem ficar dentro da PASTA_ORIGEM (só se lê de lá).');
    return 1;
  }

  const dados = lerDadosIniciais();
  const caminhoLista = join(config.pastaOrigem, dados.importacao.ficheiroListaMestra);
  const caminhoMichael = join(config.pastaOrigem, dados.importacao.ficheiroMichael);
  if (!existsSync(caminhoLista)) {
    console.error(`Não encontrei a lista mestra: ${caminhoLista}`);
    return 1;
  }
  const listaMestra = await lerExcel(caminhoLista);
  const { folhas: michael, nota: notaMichael } = await lerMichaelSeDer(caminhoMichael);

  const resultado = processarImportacao({ listaMestra, michael, dados });
  const resumo = resumir(resultado);
  const meta: MetaRelatorio = {
    agora,
    modo: 'ensaio',
    bd: null,
    loteId: null,
    falha: null,
    ficheiros: [descrever(caminhoLista, 'Lista mestra (fonte)'), descrever(caminhoMichael, notaMichael)],
  };

  if (aplicar) {
    meta.bd = resolve(config.bd);
    if (resumo.errosBloqueantes > 0) {
      meta.modo = 'recusado';
    } else {
      try {
        const bd = abrirBd(config.bd);
        try {
          meta.loteId = aplicarNaBd(bd, resultado.entidades, { agora, comentario: textoResumo(resumo) });
          meta.modo = 'aplicado';
        } finally {
          bd.$client.close();
        }
      } catch (erro) {
        meta.modo = 'falhou';
        meta.falha = erro instanceof Error ? erro.message : String(erro);
      }
    }
  }

  mkdirSync(dirname(CAMINHO_RELATORIO), { recursive: true });
  writeFileSync(CAMINHO_RELATORIO, gerarRelatorioHtml(resultado, meta), 'utf8');
  imprimirResumo(resumo, resultado, meta);
  return meta.modo === 'recusado' || meta.modo === 'falhou' ? 1 : 0;
}
