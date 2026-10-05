// Os passos do rascunho das casas (pedido do Rafael, 05/10/2026: "em 'novo' devia ter nova casa […] e haver
// maneira de as remover também"): criar e apagar uma casa, cada um UM passo (Ctrl+Z desfaz tudo de uma vez).
// Funções puras sobre o estado VISÍVEL (o do servidor com o rascunho), como passosObra.ts; quem chama
// (edicao/DialogoCasa.tsx) valida o passo com validarOperacoes antes de o juntar ao rascunho.
//
// - Criar: a casa (id "casa-<UUID>", sem "lugares iguais aos moradores", no fim da ordem) numa morada que já
//   existe (um local de casas: ex.: Himeling, onde já há quatro) ou numa morada nova (um local 'casa' com o
//   nome da casa, RAIO_OMISSAO e o pino, que é obrigatório; a morada escrita pode ficar vazia).
// - O nome não repete o de outra casa (sem contar acentos nem maiúsculas), como no validarOperacoes.
// - Apagar: quem lá mora passa para "Fora das casas CMF" (também quem saiu da empresa e ainda a tinha), as
//   carrinhas que lá dormem ficam com onde dorme "por definir", os problemas já resolvidos dela apagam-se
//   (o servidor apaga também os antigos, que não chegam ao browser), a casa apaga-se e, com ela, o local se
//   foi criado no programa e mais nada o usa. Com problemas por resolver não se apaga: resolvem-se antes.

import { LIMITES, localCriadoNoPrograma, RAIO_OMISSAO } from '../../dominio/campos';
import { formatarMatricula } from '../../dominio/matricula';
import {
  novoId,
  type Operacao,
  operacaoApagar,
  operacaoCriar,
  operacaoDormida,
  operacoesParaAlvo,
} from '../../dominio/operacoes';
import { normalizarTexto } from '../../dominio/pesquisa';
import type { Carrinha, Casa, Estado, Id, Local, Pessoa } from '../../dominio/tipos';
import { limparMorada, temPinoValido, type ValorMorada } from '../comum/morada';
import { limparNome, type ResultadoPasso } from './passosObra';

/** Onde fica a casa nova: num local de casas que já existe, ou numa morada nova (com o pino). */
export type MoradaCasaNova = { tipo: 'existente'; localId: Id | null } | { tipo: 'nova'; valor: ValorMorada };

/** O que o diálogo da casa nova recolhe (os números como foram escritos). */
export interface DadosCasa {
  nome: string;
  morada: MoradaCasaNova;
  apartamento: string;
  lotacao: string;
  maxContrato: string;
  tolerado: string;
}

/** Uma morada de casas para escolher: "Himeling, Rue de la Grotte · Casa 1, Casa 2". */
export interface OpcaoMoradaCasa {
  valor: Id;
  rotulo: string;
  casas: string[];
}

const comparar = new Intl.Collator('pt', { sensitivity: 'base', numeric: true }).compare;

/** As moradas (locais do tipo casa) onde se pode pôr uma casa nova, pelo nome, com as casas que lá estão. */
export function opcoesMoradasDeCasas(estado: Pick<Estado, 'locais' | 'casas'>): OpcaoMoradaCasa[] {
  return estado.locais
    .filter((l) => l.tipo === 'casa')
    .sort((a, b) => comparar(a.nome, b.nome))
    .map((l) => {
      const casas = estado.casas
        .filter((c) => c.localId === l.id)
        .map((c) => c.nome)
        .sort(comparar);
      const morada =
        normalizarTexto(l.nome) === normalizarTexto(l.morada) || !l.morada.trim() ? '' : ` — ${l.morada}`;
      const onde = casas.length > 0 ? ` · ${casas.join(', ')}` : '';
      return { valor: l.id, rotulo: `${l.nome}${morada}${onde}`, casas };
    });
}

/** Há outra casa com este nome, sem contar acentos, maiúsculas nem espaços a mais. */
export function nomeDeCasaRepetido(estado: Pick<Estado, 'casas'>, nome: string): boolean {
  const alvo = normalizarTexto(nome);
  return alvo !== '' && estado.casas.some((c) => normalizarTexto(c.nome) === alvo);
}

/** "8" → 8; "" → null; o resto (letras, decimais, negativos) → NaN. */
export function lerInteiro(texto: string): number | null {
  const t = texto.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

/**
 * O aviso enquanto se escreve o contrato: o tolerado (quantos o senhorio aceita) não pode ser menor do que o
 * máximo do contrato. null = sem aviso (um dos dois vazio, ou está certo).
 */
export function avisoToleradoCasa(maxContrato: string, tolerado: string): string | null {
  const max = lerInteiro(maxContrato);
  const tol = lerInteiro(tolerado);
  if (max === null || tol === null || Number.isNaN(max) || Number.isNaN(tol) || tol >= max) return null;
  return `O tolerado (${tol}) não pode ser menor do que o máx. do contrato (${max}).`;
}

/** O que falta para o passo se montar (o resto é o validarOperacoes). */
export function errosNovaCasa(estado: Estado, dados: DadosCasa): string[] {
  const erros: string[] = [];
  const nome = limparNome(dados.nome);
  if (nome === '') erros.push('Falta o nome da casa.');
  else if (nome.length > LIMITES.textoCurto)
    erros.push(`O nome da casa tem no máximo ${LIMITES.textoCurto} caracteres.`);
  else if (nomeDeCasaRepetido(estado, nome)) {
    erros.push('Já há uma casa com este nome: escolhe outro (ex.: junta o apartamento ou a rua).');
  }
  if (dados.morada.tipo === 'existente') {
    const { localId } = dados.morada;
    if (!localId || !estado.locais.some((l) => l.id === localId)) erros.push('Escolhe a morada da casa.');
  } else if (!temPinoValido(dados.morada.valor)) {
    erros.push('Falta o pino da casa: procura a morada ou clica no mini-mapa.');
  }
  if (limparNome(dados.apartamento).length > LIMITES.textoCurto) {
    erros.push(`O apartamento tem no máximo ${LIMITES.textoCurto} caracteres.`);
  }
  const lotacao = lerInteiro(dados.lotacao);
  if (lotacao === null) erros.push('Falta a lotação (quantas pessoas cabem na casa).');
  else if (Number.isNaN(lotacao) || lotacao < 1 || lotacao > LIMITES.lotacaoMaxima) {
    erros.push(`A lotação é um número inteiro de 1 a ${LIMITES.lotacaoMaxima}.`);
  }
  for (const [rotulo, texto] of [
    ['O máx. do contrato', dados.maxContrato],
    ['O tolerado', dados.tolerado],
  ] as const) {
    const n = lerInteiro(texto);
    if (n !== null && (Number.isNaN(n) || n > LIMITES.lotacaoMaxima)) {
      erros.push(`${rotulo} é um número inteiro de 0 a ${LIMITES.lotacaoMaxima} (ou fica vazio).`);
    }
  }
  const aviso = avisoToleradoCasa(dados.maxContrato, dados.tolerado);
  if (aviso) erros.push(aviso);
  return erros;
}

/**
 * Criar uma casa: um passo com o local novo (se a morada for nova) e a casa. Devolve também o id da casa
 * nova (para a pôr em foco no fim). `gerar` só nos testes (ids previsíveis).
 */
export function passoCriarCasa(
  estado: Estado,
  dados: DadosCasa,
  gerar?: () => string,
): ResultadoPasso & { casaId: Id | null } {
  const erros = errosNovaCasa(estado, dados);
  if (erros.length > 0) return { ops: null, erros, casaId: null };
  const nome = limparNome(dados.nome);
  const ops: Operacao[] = [];
  let localId: Id;
  if (dados.morada.tipo === 'nova') {
    const v = dados.morada.valor;
    const local: Local = {
      id: novoId('local', gerar),
      tipo: 'casa',
      nome,
      morada: limparMorada(v.morada),
      pais: v.pais,
      lat: v.lat,
      lng: v.lng,
      raioM: RAIO_OMISSAO,
    };
    ops.push(operacaoCriar('local', local));
    localId = local.id;
  } else {
    localId = dados.morada.localId as Id;
  }
  const apartamento = limparNome(dados.apartamento);
  const casa: Casa = {
    id: novoId('casa', gerar),
    nome,
    localId,
    apartamento: apartamento === '' ? null : apartamento,
    lotacao: lerInteiro(dados.lotacao) as number,
    maxContrato: lerInteiro(dados.maxContrato),
    tolerado: lerInteiro(dados.tolerado),
    notaContrato: null,
    senhorio: null,
    equipamento: null,
    sempreCheia: false,
    // No fim da ordem do Michael: no Quadro fica depois das outras casas da mesma morada (ou do país).
    ordem: estado.casas.reduce((max, c) => Math.max(max, c.ordem + 1), 0),
  };
  ops.push(operacaoCriar('casa', casa));
  return { ops, erros: [], casaId: casa.id };
}

/** O que o "Apagar casa…" vai fazer (ou o que o impede), para o diálogo de confirmação. */
export interface ResumoApagarCasa {
  /** Quem lá mora (passa para "Fora das casas CMF"). */
  moradores: Pessoa[];
  /** Carrinhas que lá dormem (gravado; ficam com onde dorme "por definir"). */
  carrinhas: Carrinha[];
  /** Problemas por resolver: impedem apagar. */
  problemasAbertos: number;
  /** Problemas resolvidos que se conhecem (apagam-se com ela). */
  problemasResolvidos: number;
  /** A morada da casa, se se apaga com ela (criada no programa e sem outros usos). */
  localApagado: Local | null;
  /** A morada da casa, se fica (veio dos dados iniciais ou tem outros usos). */
  localQueFica: Local | null;
}

/** O local da casa se se apaga com ela: criado no programa e sem mais nada que o use. */
function localQueSaiComACasa(estado: Estado, casa: Casa): Local | null {
  const local = estado.locais.find((l) => l.id === casa.localId);
  if (!local || !localCriadoNoPrograma(local)) return null;
  const usado =
    estado.casas.some((c) => c.id !== casa.id && c.localId === local.id) ||
    estado.obras.some((o) => o.localId === local.id || o.estacionamentoLocalId === local.id) ||
    estado.carrinhas.some((c) => c.dormeLocalId === local.id);
  return usado ? null : local;
}

export function resumoApagarCasa(estado: Estado, casaId: Id): ResumoApagarCasa | null {
  const casa = estado.casas.find((c) => c.id === casaId);
  if (!casa) return null;
  const problemas = estado.problemas.filter((p) => p.casaId === casaId);
  const localApagado = localQueSaiComACasa(estado, casa);
  return {
    moradores: estado.pessoas.filter((p) => p.casaId === casaId),
    carrinhas: estado.carrinhas.filter((c) => c.dormeCasaId === casaId),
    problemasAbertos: problemas.filter((p) => p.resolvidoEm === null).length,
    problemasResolvidos: problemas.filter((p) => p.resolvidoEm !== null).length,
    localApagado,
    localQueFica: localApagado ? null : (estado.locais.find((l) => l.id === casa.localId) ?? null),
  };
}

/** "A, B e C". */
function listaComE(itens: readonly string[]): string {
  return itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

/**
 * O que impede apagar a casa sem mais nada, numa frase (ex.: "Tem 3 moradores e a CF 5010 dorme lá."); null
 * quando está vazia. Os problemas por resolver dizem-se à parte (esses não se tiram no mesmo passo).
 */
export function textoOQueImpede(resumo: ResumoApagarCasa): string | null {
  const partes: string[] = [];
  const n = resumo.moradores.length;
  if (n > 0) partes.push(n === 1 ? 'Tem 1 morador' : `Tem ${n} moradores`);
  const matriculas = resumo.carrinhas.map((c) => formatarMatricula(c.matricula));
  if (matriculas.length > 0) {
    const dorme =
      matriculas.length === 1
        ? `a ${matriculas[0]} dorme lá`
        : `as carrinhas ${listaComE(matriculas)} dormem lá`;
    partes.push(partes.length === 0 ? dorme.charAt(0).toLocaleUpperCase('pt') + dorme.slice(1) : dorme);
  }
  return partes.length === 0 ? null : `${partes.join(' e ')}.`;
}

/**
 * O título da confirmação de "Apagar casa…". Quase todas as casas já se chamam "Casa …" (ou "Apartamento …"):
 * "Apagar a Casa 2 Puttelange?", "Apagar o Apartamento E Puttelange?"; as outras levam "a casa": "Apagar a
 * casa Eischen?".
 */
export function tituloApagarCasa(nome: string): string {
  const inicio = normalizarTexto(nome).split(' ')[0];
  if (inicio === 'casa') return `Apagar a ${nome}?`;
  if (inicio === 'apartamento') return `Apagar o ${nome}?`;
  return `Apagar a casa ${nome}?`;
}

/**
 * Apagar uma casa: um passo com quem lá mora para "Fora das casas CMF", as carrinhas que lá dormem com onde
 * dorme "por definir", os problemas resolvidos dela apagados, a casa apagada e o local dela, se se apaga com
 * ela (o aplicarOperacoes e o servidor tratam da ordem). null se a casa já não existir. Com problemas por
 * resolver o passo monta-se na mesma, mas o validarOperacoes recusa-o (com a frase a dizer porquê).
 */
export function passoApagarCasa(estado: Estado, casaId: Id): Operacao[] | null {
  const casa = estado.casas.find((c) => c.id === casaId);
  if (!casa) return null;
  const moradores = estado.pessoas.filter((p) => p.casaId === casaId).map((p) => p.id);
  const ops: Operacao[] = operacoesParaAlvo(estado, moradores, { tipo: 'fora' });
  for (const c of estado.carrinhas) {
    if (c.dormeCasaId !== casaId) continue;
    const op = operacaoDormida(estado, c.id, null);
    if (op) ops.push(op);
  }
  for (const p of estado.problemas) {
    if (p.casaId !== casaId || p.resolvidoEm === null) continue;
    const op = operacaoApagar(estado, 'problema', p.id);
    if (op) ops.push(op);
  }
  const apagarCasa = operacaoApagar(estado, 'casa', casaId);
  if (apagarCasa) ops.push(apagarCasa);
  const local = localQueSaiComACasa(estado, casa);
  if (local) {
    const op = operacaoApagar(estado, 'local', local.id);
    if (op) ops.push(op);
  }
  return ops;
}
