// Sincronização dos dados iniciais com I/O: lê dados-iniciais/ (só leitura: nunca se escreve lá nem na
// PASTA_ORIGEM), lê (ensaio) ou grava (--aplicar) a base de dados, escreve
// dados/relatorio-sincronizacao.html e imprime o resumo, sem nomes de pessoas.
// A lógica está em sincronizar.ts (plano) e sincronizarBd.ts (transação).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Estado } from '../dominio/tipos';
import { config } from '../servidor/config';
import { abrirBd } from '../servidor/db/ligacao';
import { estaDentro, lerDadosReferencia, PASTA_DADOS_INICIAIS, RAIZ } from './executar';
import { gerarRelatorioSincronizacao, type MetaSincronizacao } from './relatorioSincronizacao';
import {
  contarPlano,
  frasesDoPlano,
  PALAVRAS,
  type PlanoSincronizacao,
  planoVazio,
  plural,
  textoContagem,
} from './sincronizar';
import { abrirBdSoLeitura, aplicarSincronizacao, ensaiarSincronizacao } from './sincronizarBd';

export const CAMINHO_RELATORIO_SINCRONIZACAO = join(RAIZ, 'dados', 'relatorio-sincronizacao.html');

/** Resumo para a consola: contagens e o que muda (sem nomes de pessoas). Função pura. */
export function textoConsola(
  plano: PlanoSincronizacao,
  estado: Pick<Estado, 'locais'>,
  meta: MetaSincronizacao,
  caminhoRelatorio: string,
): string {
  const modo = {
    ensaio: 'modo de ensaio (nada foi gravado)',
    aplicado: `gravado (lote nº ${meta.loteId ?? '?'} no histórico)`,
    vazio: 'nada a mudar (não se gravou nada nem se criou lote)',
    recusado: 'NÃO gravado: há erros bloqueantes',
    falhou: `a gravação FALHOU (${meta.falha ?? ''}); a base de dados ficou como estava`,
  }[meta.modo];
  const n = contarPlano(plano);
  // As frases incluem avisos que não mudam nada (ex.: locais que só existem na base de dados).
  const frases = frasesDoPlano(plano, estado);
  const nadaAMudar = planoVazio(plano);
  const linhas = [
    `Sincronização dos dados iniciais — ${modo}`,
    `  Base de dados: ${meta.bd}${meta.versao === null ? '' : ` (versão ${meta.versao})`}`,
    `  Veículos: ${textoContagem(n.veiculos, PALAVRAS.veiculos)}`,
    `  Clientes: ${textoContagem(n.clientes)} · Casas: ${textoContagem(n.casas, PALAVRAS.casas)} · Locais: ${textoContagem(n.locais)}`,
    `  Pessoas que ficam sem transporte (a confirmar): ${n.semTransporte} · Condutores retirados: ${n.condutoresRetirados}` +
      (n.dormidasRetiradas > 0 ? ` · Onde dorme por definir: ${n.dormidasRetiradas}` : ''),
    `  Erros bloqueantes: ${n.erros}`,
    ...plano.erros.map((e) => `    ! ${e.mensagem}${e.onde ? ` (${e.onde})` : ''}`),
    nadaAMudar ? '  O que muda: nada (a base de dados já está igual aos dados iniciais).' : '  O que muda:',
    ...frases.map((f) => `    - ${f}`),
    `  Relatório: ${caminhoRelatorio}`,
  ];
  if (meta.modo === 'ensaio' && (!nadaAMudar || n.erros > 0)) {
    linhas.push(
      n.erros > 0
        ? `  Corrija ${plural(n.erros, 'o erro', 'os erros')} antes de gravar.`
        : '  Para gravar: npm run sincronizar -- --aplicar',
    );
  }
  return linhas.join('\n');
}

export interface OpcoesSincronizacao {
  aplicar: boolean;
  /** Caminho da base de dados; por omissão o do .env (BD) ou dados/mapa.db. */
  bd?: string;
  /** Onde escrever o relatório (por omissão dados/relatorio-sincronizacao.html). */
  relatorio?: string;
}

/**
 * Lê os argumentos da linha de comandos (sem `node` nem o script): --aplicar, --bd <caminho> e
 * --relatorio <caminho> (também --bd=<caminho>). Qualquer outro argumento, ou um --bd sem caminho, é erro:
 * um engano como "--db copia.db --aplicar" ou "--aplicar --bd" não pode acabar a gravar na base de dados
 * por omissão (a verdadeira). Função pura.
 */
export function lerArgumentosSincronizacao(
  args: readonly string[],
): { opcoes: OpcoesSincronizacao } | { erro: string } {
  const opcoes: OpcoesSincronizacao = { aplicar: false };
  const comValor = { '--bd': 'bd', '--relatorio': 'relatorio' } as const;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--aplicar') {
      opcoes.aplicar = true;
      continue;
    }
    const igual = arg.indexOf('=');
    const nome = igual > 0 ? arg.slice(0, igual) : arg;
    if (!Object.hasOwn(comValor, nome)) {
      return {
        erro: `Argumento desconhecido: ${arg}. Use só --aplicar, --bd <caminho> e --relatorio <caminho>.`,
      };
    }
    const chave = comValor[nome as keyof typeof comValor];
    const valor = igual > 0 ? arg.slice(igual + 1) : args[++i];
    if (!valor || valor.startsWith('--')) return { erro: `Falta o caminho depois de ${nome}.` };
    if (opcoes[chave] !== undefined) return { erro: `${nome} repetido.` };
    opcoes[chave] = valor;
  }
  return { opcoes };
}

/** Corre a sincronização. Devolve o código de saída (0 = correu bem). */
export function executarSincronizacao(opcoes: OpcoesSincronizacao): number {
  const agora = new Date();
  const caminhoBd = resolve(opcoes.bd ?? config.bd);
  const caminhoRelatorio = resolve(opcoes.relatorio ?? CAMINHO_RELATORIO_SINCRONIZACAO);
  const protegidas = [PASTA_DADOS_INICIAIS, ...(config.pastaOrigem ? [config.pastaOrigem] : [])];
  if (protegidas.some((p) => estaDentro(caminhoRelatorio, p) || estaDentro(caminhoBd, p))) {
    console.error(
      'O relatório e a base de dados não podem ficar dentro de dados-iniciais/ nem da PASTA_ORIGEM (só se lê de lá).',
    );
    return 1;
  }
  if (!existsSync(caminhoBd)) {
    console.error(`Não encontrei a base de dados: ${caminhoBd}`);
    return 1;
  }

  const dados = lerDadosReferencia();
  const meta: MetaSincronizacao = {
    agora,
    modo: 'ensaio',
    bd: caminhoBd,
    versao: null,
    loteId: null,
    falha: null,
  };
  let plano: PlanoSincronizacao;
  let estado: Estado;

  if (opcoes.aplicar) {
    try {
      // Abre com as migrações (como o servidor): a sincronização precisa das colunas mais recentes.
      const bd = abrirBd(caminhoBd);
      try {
        const r = aplicarSincronizacao(bd, dados, { agora });
        plano = r.plano;
        estado = r.estado;
        meta.versao = r.estado.versao;
        meta.modo = r.tipo;
        if (r.tipo === 'aplicado') meta.loteId = r.loteId;
      } finally {
        bd.$client.close();
      }
    } catch (erro) {
      console.error(`A sincronização falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
      console.error('A base de dados ficou como estava (tudo ou nada).');
      return 1;
    }
  } else {
    try {
      const bd = abrirBdSoLeitura(caminhoBd);
      try {
        const r = ensaiarSincronizacao(bd, dados, agora);
        plano = r.plano;
        estado = r.estado;
        meta.versao = r.versao;
      } finally {
        bd.$client.close();
      }
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      console.error(`Não consegui ler a base de dados: ${motivo}`);
      if (/no such (column|table)/i.test(motivo)) {
        console.error(
          'Faltam as migrações mais recentes: arranque o servidor uma vez (npm run dev), que as aplica, e volte a correr.',
        );
      }
      return 1;
    }
  }

  mkdirSync(dirname(caminhoRelatorio), { recursive: true });
  writeFileSync(caminhoRelatorio, gerarRelatorioSincronizacao(plano, estado, meta), 'utf8');
  console.log(textoConsola(plano, estado, meta, caminhoRelatorio));
  return meta.modo === 'recusado' ? 1 : 0;
}
