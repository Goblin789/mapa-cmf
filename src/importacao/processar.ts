// Importação completa sem I/O: folhas lidas + dados iniciais → entidades, erros e discrepâncias.

import { indexar } from '../dominio/indices';
import type { Id } from '../dominio/tipos';
import { chaveNome } from './celulas';
import { compararComMichael } from './comparar';
import { lerFolhaExtra, lerFolhaPessoal } from './listaMestra';
import { lerMichael } from './michael';
import { montarEntidades, type ResultadoMontagem } from './montar';
import type { DadosIniciais, DadosMichael, Discrepancias, ErroImportacao } from './tipos';

export type Folhas = Map<string, unknown[][]>;

export interface EntradaImportacao {
  listaMestra: Folhas;
  /** null quando o ficheiro do Michael não existe (não há cruzamento). */
  michael: Folhas | null;
  dados: DadosIniciais;
}

export interface ResultadoImportacao extends ResultadoMontagem {
  michael: DadosMichael | null;
  discrepancias: Discrepancias;
  /** Linhas lidas da folha Pessoal (antes de juntar os extras). */
  linhasPessoal: number;
}

/** Folha pelo nome exato ou, se não houver, pelo nome sem acentos/maiúsculas. */
function obterFolha(folhas: Folhas, nome: string): unknown[][] | null {
  const exata = folhas.get(nome);
  if (exata) return exata;
  for (const [n, linhas] of folhas) if (chaveNome(n) === chaveNome(nome)) return linhas;
  return null;
}

export function processarImportacao({ listaMestra, michael, dados }: EntradaImportacao): ResultadoImportacao {
  const cfg = dados.importacao;
  const erros: ErroImportacao[] = [];

  const folhaPessoal = obterFolha(listaMestra, cfg.folhaPessoal);
  if (!folhaPessoal) {
    erros.push({
      bloqueante: true,
      mensagem: `Não encontrei a folha "${cfg.folhaPessoal}" na lista mestra.`,
    });
  }
  const pessoal = folhaPessoal ? lerFolhaPessoal(folhaPessoal, cfg.folhaPessoal) : { linhas: [], erros: [] };

  const folhaExtra = obterFolha(listaMestra, cfg.folhaExtra);
  if (!folhaExtra && cfg.extrasAIncluir.length > 0) {
    erros.push({ bloqueante: true, mensagem: `Não encontrei a folha "${cfg.folhaExtra}" na lista mestra.` });
  }
  const extra = folhaExtra ? lerFolhaExtra(folhaExtra, cfg.folhaExtra) : { linhas: [], erros: [] };

  const montagem = montarEntidades(pessoal.linhas, extra.linhas, dados);
  const dadosMichael = michael ? lerMichael(michael) : null;
  const discrepancias = compararComMichael(montagem.entidades, dados, dadosMichael, montagem.extrasExcluidos);

  return {
    ...montagem,
    erros: [...erros, ...pessoal.erros, ...extra.erros, ...montagem.erros, ...(dadosMichael?.avisos ?? [])],
    michael: dadosMichael,
    discrepancias,
    linhasPessoal: pessoal.linhas.length,
  };
}

export interface Resumo {
  pessoas: number;
  pessoasLista: number;
  pessoasExtra: number;
  porCliente: { id: Id; nome: string; pessoas: number }[];
  foraDasCasas: number;
  foraDasCasasAConfirmar: number;
  semTransporte: number;
  semTransporteAConfirmar: number;
  aConfirmar: number;
  clientes: number;
  locais: number;
  casas: number;
  carrinhas: number;
  obras: number;
  errosBloqueantes: number;
  avisos: number;
}

export function resumir(r: ResultadoImportacao): Resumo {
  const { entidades: e } = r;
  const ind = indexar({ versao: 0, geradoEm: '', ...e });
  const ativas = e.pessoas.filter((p) => p.ativa);
  return {
    pessoas: ativas.length,
    pessoasLista: ativas.length - r.extrasIncluidos.length,
    pessoasExtra: r.extrasIncluidos.length,
    porCliente: e.clientes.map((c) => ({
      id: c.id,
      nome: c.nome,
      pessoas: ativas.filter((p) => p.clienteId === c.id).length,
    })),
    foraDasCasas: ind.foraDasCasas.length,
    foraDasCasasAConfirmar: ind.foraDasCasas.filter((p) => p.casaAConfirmar).length,
    semTransporte: ind.semTransporte.length,
    semTransporteAConfirmar: ind.semTransporte.filter((p) => p.carrinhaAConfirmar).length,
    aConfirmar: ativas.filter((p) => p.casaAConfirmar || p.carrinhaAConfirmar).length,
    clientes: e.clientes.length,
    locais: e.locais.length,
    casas: e.casas.length,
    carrinhas: e.carrinhas.length,
    obras: e.obras.length,
    errosBloqueantes: r.erros.filter((x) => x.bloqueante).length,
    avisos: r.erros.filter((x) => !x.bloqueante).length,
  };
}

/** Resumo numa linha, sem nomes de pessoas (vai para o comentário do lote). */
export function textoResumo(s: Resumo): string {
  const clientes = s.porCliente.map((c) => `${c.nome} ${c.pessoas}`).join(', ');
  return (
    `${s.pessoas} pessoas (${s.pessoasLista} da lista + ${s.pessoasExtra} extra): ${clientes}. ` +
    `Fora das casas ${s.foraDasCasas} (${s.foraDasCasasAConfirmar} a confirmar); ` +
    `sem transporte ${s.semTransporte} (${s.semTransporteAConfirmar} a confirmar). ` +
    `${s.clientes} clientes, ${s.locais} locais, ${s.casas} casas, ${s.carrinhas} carrinhas.`
  );
}
