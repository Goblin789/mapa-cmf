// Resumo do rascunho: alterações agrupadas por pessoa, avisos antes de guardar, o que mudou numa
// pessoa/casa/carrinha (painel de foco) e a frase de um passo (Desfeito: …). Funções puras.

import { type Indices, indexar } from '../../dominio/indices';
import { type AvisoContrato, ocupacaoCarrinha, ocupacaoCasa } from '../../dominio/ocupacao';
import { type CampoMovivel, descreverOperacao, nomeDoValor, type Operacao } from '../../dominio/operacoes';
import type { Estado, Id, Pessoa } from '../../dominio/tipos';
import { formatarMatricula } from '../comum/Matricula';
import { comPlural, textoContrato } from '../paineis/textos';

export const ROTULO_CAMPO: Record<CampoMovivel, string> = {
  casaId: 'Casa',
  carrinhaId: 'Carrinha',
  obraId: 'Obra',
};

const ORDEM_CAMPO: Record<CampoMovivel, number> = { casaId: 0, carrinhaId: 1, obraId: 2 };

const comparadorNomes = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });

function nomeDaPessoa(estado: Estado, id: Id): string {
  return estado.pessoas.find((p) => p.id === id)?.nomeCurto ?? id;
}

/** Nome a mostrar para um valor de campo; as matrículas vêm formatadas ("CF 5001"). */
export function rotuloDoValor(estado: Estado, campo: CampoMovivel, valor: Id | null): string {
  const nome = nomeDoValor(estado, campo, valor);
  return campo === 'carrinhaId' && valor !== null ? formatarMatricula(nome) : nome;
}

export interface AlteracaoDaPessoa {
  campo: CampoMovivel;
  rotuloCampo: string;
  de: string;
  para: string;
  /** Frase inteira, como no histórico ("Ana — casa: Casa Um → Casa Dois"). */
  descricao: string;
}

export interface AlteracoesDaPessoa {
  pessoaId: Id;
  nome: string;
  alteracoes: AlteracaoDaPessoa[];
}

/**
 * Alterações por guardar, agrupadas por pessoa (por ordem alfabética) e, em cada pessoa, pela ordem
 * casa → carrinha → obra. Os nomes vêm do estado gravado (é sobre ele que as alterações se aplicam).
 */
export function agruparAlteracoes(
  estadoServidor: Estado,
  pendentes: readonly Operacao[],
): AlteracoesDaPessoa[] {
  const grupos = new Map<Id, AlteracoesDaPessoa>();
  for (const op of pendentes) {
    let grupo = grupos.get(op.pessoaId);
    if (!grupo) {
      grupo = { pessoaId: op.pessoaId, nome: nomeDaPessoa(estadoServidor, op.pessoaId), alteracoes: [] };
      grupos.set(op.pessoaId, grupo);
    }
    grupo.alteracoes.push({
      campo: op.campo,
      rotuloCampo: ROTULO_CAMPO[op.campo],
      de: rotuloDoValor(estadoServidor, op.campo, op.de),
      para: rotuloDoValor(estadoServidor, op.campo, op.para),
      descricao: descreverOperacao(estadoServidor, op),
    });
  }
  for (const g of grupos.values()) g.alteracoes.sort((a, b) => ORDEM_CAMPO[a.campo] - ORDEM_CAMPO[b.campo]);
  return [...grupos.values()].sort((a, b) => comparadorNomes.compare(a.nome, b.nome));
}

export type GravidadeAviso = 'forte' | 'simples';

export interface AvisoGuardar {
  chave: string;
  gravidade: GravidadeAviso;
  texto: string;
}

const PESO_CONTRATO: Record<AvisoContrato, number> = {
  sem_limite: 0,
  dentro: 0,
  acima_maximo: 1,
  acima_tolerado: 2,
};

function destinos(pendentes: readonly Operacao[], campo: CampoMovivel): Id[] {
  const ids = new Set<Id>();
  for (const op of pendentes) if (op.campo === campo && op.para !== null) ids.add(op.para);
  return [...ids];
}

/**
 * Avisos a mostrar antes de guardar, só sobre o que as alterações pioram:
 * - casas e carrinhas que recebem gente e ficam com gente a mais (mais do que tinham);
 * - casas que recebem gente e passam (ou passam mais) o máximo/tolerado do contrato;
 * - pessoas que ficam fora das casas CMF ou sem transporte da empresa.
 * Primeiro os fortes (gente a mais, acima do tolerado), depois os simples.
 */
export function calcularAvisos(
  estadoServidor: Estado,
  estadoVisivel: Estado,
  pendentes: readonly Operacao[],
  indServidor: Indices = indexar(estadoServidor),
  indVisivel: Indices = indexar(estadoVisivel),
): AvisoGuardar[] {
  const avisos: AvisoGuardar[] = [];

  for (const id of destinos(pendentes, 'casaId')) {
    const casa = indVisivel.casas.get(id);
    if (!casa) continue;
    const antes = ocupacaoCasa(casa, indServidor.moradores.get(id)?.length ?? 0);
    const depois = ocupacaoCasa(casa, indVisivel.moradores.get(id)?.length ?? 0);
    if (depois.nivel === 'excesso' && depois.ocupados > antes.ocupados) {
      avisos.push({
        chave: `casa-excesso:${id}`,
        gravidade: 'forte',
        texto: `${casa.nome} fica com ${comPlural(depois.ocupados, 'pessoa', 'pessoas')} para ${comPlural(
          depois.lotacao,
          'lugar',
          'lugares',
        )} (${depois.ocupados - depois.lotacao} a mais).`,
      });
    }
    const piorou =
      PESO_CONTRATO[depois.aviso] > PESO_CONTRATO[antes.aviso] ||
      (PESO_CONTRATO[depois.aviso] > 0 && depois.usados > antes.usados);
    if (piorou) {
      const acimaTolerado = depois.aviso === 'acima_tolerado';
      avisos.push({
        chave: `casa-contrato:${id}`,
        gravidade: acimaTolerado ? 'forte' : 'simples',
        texto: `${casa.nome} passa ${acimaTolerado ? 'o tolerado' : 'o máximo'} do contrato: ${comPlural(
          depois.usados,
          'lugar usado',
          'lugares usados',
        )} para ${textoContrato(casa)}.`,
      });
    }
  }

  for (const id of destinos(pendentes, 'carrinhaId')) {
    const carrinha = indVisivel.carrinhas.get(id);
    if (!carrinha) continue;
    const antes = ocupacaoCarrinha(carrinha, indServidor.passageiros.get(id)?.length ?? 0);
    const depois = ocupacaoCarrinha(carrinha, indVisivel.passageiros.get(id)?.length ?? 0);
    if (depois.nivel === 'excesso' && depois.ocupados > antes.ocupados) {
      avisos.push({
        chave: `carrinha-excesso:${id}`,
        gravidade: 'forte',
        texto: `${formatarMatricula(carrinha.matricula)} fica com ${comPlural(
          depois.ocupados,
          'pessoa',
          'pessoas',
        )} para ${comPlural(depois.lugares, 'lugar', 'lugares')} (${depois.ocupados - depois.lugares} a mais).`,
      });
    }
  }

  const semCasa: Pessoa[] = [];
  const semCarrinha: Pessoa[] = [];
  for (const op of pendentes) {
    if (op.para !== null || op.de === null) continue;
    const p = indVisivel.pessoas.get(op.pessoaId);
    if (!p?.ativa) continue;
    if (op.campo === 'casaId' && p.casaId === null) semCasa.push(p);
    if (op.campo === 'carrinhaId' && p.carrinhaId === null) semCarrinha.push(p);
  }
  const porNome = (lista: Pessoa[]) =>
    [...lista].sort((a, b) => comparadorNomes.compare(a.nomeCurto, b.nomeCurto));
  for (const p of porNome(semCasa)) {
    avisos.push({
      chave: `fora:${p.id}`,
      gravidade: 'simples',
      texto: `${p.nomeCurto} fica fora das casas CMF.`,
    });
  }
  for (const p of porNome(semCarrinha)) {
    avisos.push({
      chave: `sem-transporte:${p.id}`,
      gravidade: 'simples',
      texto: `${p.nomeCurto} fica sem transporte da empresa.`,
    });
  }

  // sort é estável: dentro de cada gravidade fica a ordem casas → carrinhas → pessoas.
  return avisos.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === 'forte' ? -1 : 1));
}

/** Alterações por guardar de uma pessoa, por campo. */
export function alteracoesDaPessoa(
  pendentes: readonly Operacao[],
  pessoaId: Id,
): Map<CampoMovivel, Operacao> {
  const resultado = new Map<CampoMovivel, Operacao>();
  for (const op of pendentes) if (op.pessoaId === pessoaId) resultado.set(op.campo, op);
  return resultado;
}

export interface MovimentosDoSitio {
  /** Quem passa a estar aqui (com o `de` de onde vem). */
  entram: Operacao[];
  /** Quem deixa de estar aqui (com o `para` para onde vai). */
  saem: Operacao[];
}

/** Quem entra e quem sai de uma casa ou carrinha nas alterações por guardar. */
export function movimentosDoSitio(
  pendentes: readonly Operacao[],
  campo: CampoMovivel,
  id: Id,
): MovimentosDoSitio {
  return {
    entram: pendentes.filter((op) => op.campo === campo && op.para === id),
    saem: pendentes.filter((op) => op.campo === campo && op.de === id),
  };
}

/**
 * Frase curta de um passo do rascunho, para o aviso depois de desfazer/refazer/mover.
 * Uma pessoa: "Ana — casa: Casa Um → Casa Dois". Várias para o mesmo sítio: "3 pessoas → Casa Dois".
 * Outros casos: "4 alterações".
 */
export function resumirPasso(estado: Estado, passo: readonly Operacao[]): string {
  const [primeira] = passo;
  if (!primeira) return 'nada';
  if (passo.length === 1) {
    // Como descreverOperacao, mas com as matrículas formatadas como no resto do ecrã ("CF 5001").
    const { campo, de, para } = primeira;
    return `${nomeDaPessoa(estado, primeira.pessoaId)} — ${ROTULO_CAMPO[campo].toLowerCase()}: ${rotuloDoValor(
      estado,
      campo,
      de,
    )} → ${rotuloDoValor(estado, campo, para)}`;
  }
  const mesmoDestino = passo.every((op) => op.campo === primeira.campo && op.para === primeira.para);
  if (mesmoDestino) {
    const pessoas = new Set(passo.map((op) => op.pessoaId)).size;
    return `${comPlural(pessoas, 'pessoa', 'pessoas')} → ${rotuloDoValor(estado, primeira.campo, primeira.para)}`;
  }
  return comPlural(passo.length, 'alteração', 'alterações');
}

/** O valor gravado de um contador, quando é diferente do que se vê (só no modo de edição). */
export function valorAnterior(
  modoEdicao: boolean,
  gravado: number | undefined,
  visivel: number,
): number | null {
  if (!modoEdicao || gravado === undefined || gravado === visivel) return null;
  return gravado;
}
