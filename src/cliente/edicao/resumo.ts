// Resumo do rascunho: alterações agrupadas por pessoa (e as de condutor e de onde dorme por carrinha),
// avisos antes de guardar, o que mudou numa pessoa/casa/carrinha (painel de foco) e a frase de um passo
// (Desfeito: …). Funções puras.

import type { Dormida } from '../../dominio/dormidas';
import { type Indices, indexar } from '../../dominio/indices';
import { type AvisoContrato, ocupacaoCarrinha, ocupacaoCasa } from '../../dominio/ocupacao';
import {
  type CampoMovivel,
  compactarOperacoes,
  descreverOperacao,
  nomeDaDormida,
  nomeDoValor,
  type Operacao,
  type OperacaoCondutor,
  type OperacaoDormida,
  type OperacaoMover,
} from '../../dominio/operacoes';
import type { Estado, Id, Pessoa } from '../../dominio/tipos';
import { formatarMatricula } from '../comum/Matricula';
import { condutorDaCarrinha } from '../paineis/condutor';
import { comPlural, formatarData, textoContrato } from '../paineis/textos';

export const ROTULO_CAMPO: Record<CampoMovivel, string> = {
  casaId: 'Casa',
  carrinhaId: 'Carrinha',
  obraId: 'Obra',
};

const ORDEM_CAMPO: Record<CampoMovivel, number> = { casaId: 0, carrinhaId: 1, obraId: 2 };

const comparadorNomes = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });

/** Só as mudanças de pessoas (casa, carrinha, obra). */
export function soMovimentos(ops: readonly Operacao[]): OperacaoMover[] {
  return ops.filter((op): op is OperacaoMover => op.tipo === 'mover');
}

/** Só as mudanças de condutor. */
export function soCondutores(ops: readonly Operacao[]): OperacaoCondutor[] {
  return ops.filter((op): op is OperacaoCondutor => op.tipo === 'condutor');
}

/** Só as mudanças de onde dormem as carrinhas. */
export function soDormidas(ops: readonly Operacao[]): OperacaoDormida[] {
  return ops.filter((op): op is OperacaoDormida => op.tipo === 'dormida');
}

function nomeDaPessoa(estado: Estado, id: Id): string {
  return estado.pessoas.find((p) => p.id === id)?.nomeCurto ?? id;
}

function matriculaDe(estado: Estado, carrinhaId: Id): string {
  return nomeDoValor(estado, 'carrinhaId', carrinhaId);
}

/** Nome do condutor ou "sem condutor". */
export function rotuloDoCondutor(estado: Estado, pessoaId: Id | null): string {
  return pessoaId === null ? 'sem condutor' : nomeDaPessoa(estado, pessoaId);
}

/** Nome a mostrar para um valor de campo; as matrículas vêm formatadas ("ZZ 1001"). */
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
 * Mudanças de pessoas por guardar, agrupadas por pessoa (por ordem alfabética) e, em cada pessoa, pela
 * ordem casa → carrinha → obra. Os nomes vêm do estado gravado (é sobre ele que as alterações se aplicam).
 * As mudanças de condutor ficam de fora: ver agruparCondutores.
 */
export function agruparAlteracoes(
  estadoServidor: Estado,
  pendentes: readonly Operacao[],
): AlteracoesDaPessoa[] {
  const grupos = new Map<Id, AlteracoesDaPessoa>();
  for (const op of soMovimentos(pendentes)) {
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

export interface AlteracaoDeCondutor {
  /** Condutor antes e depois ("Ana T.", "sem condutor"). */
  de: string;
  para: string;
  /** Frase inteira, como no histórico ("ZZ 1001 — condutor: Ana T. → Rui S."). */
  descricao: string;
}

export interface CondutoresDaCarrinha {
  carrinhaId: Id;
  /** Matrícula formatada ("ZZ 1001"). */
  matricula: string;
  alteracoes: AlteracaoDeCondutor[];
}

/** Mudanças de condutor por guardar, agrupadas por carrinha (pela ordem das carrinhas). */
export function agruparCondutores(
  estadoServidor: Estado,
  pendentes: readonly Operacao[],
): CondutoresDaCarrinha[] {
  const grupos = new Map<Id, CondutoresDaCarrinha>();
  for (const op of soCondutores(pendentes)) {
    let grupo = grupos.get(op.carrinhaId);
    if (!grupo) {
      grupo = {
        carrinhaId: op.carrinhaId,
        matricula: matriculaDe(estadoServidor, op.carrinhaId),
        alteracoes: [],
      };
      grupos.set(op.carrinhaId, grupo);
    }
    grupo.alteracoes.push({
      de: rotuloDoCondutor(estadoServidor, op.de),
      para: rotuloDoCondutor(estadoServidor, op.para),
      descricao: descreverOperacao(estadoServidor, op),
    });
  }
  const ordem = new Map(estadoServidor.carrinhas.map((c) => [c.id, c.ordem]));
  const posicao = (id: Id) => ordem.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...grupos.values()].sort(
    (a, b) =>
      posicao(a.carrinhaId) - posicao(b.carrinhaId) || comparadorNomes.compare(a.matricula, b.matricula),
  );
}

export interface AlteracaoDeDormida {
  carrinhaId: Id;
  /** Matrícula formatada ("ZZ 1001"). */
  matricula: string;
  /** Onde dormia e onde passa a dormir ("por definir", "Casa Um", "Parque"). */
  de: string;
  para: string;
  /** Casa sugerida quando estava por definir (a da maioria dos passageiros); null se não havia. */
  sugestaoAntes: string | null;
  /** Estava por definir e passa a dormir na casa que era sugerida: confirma a sugestão. */
  confirmaSugestao: boolean;
  /** Frase inteira, como no histórico ("ZZ 1001 — onde dorme: por definir → Casa Um"). */
  descricao: string;
}

/**
 * Mudanças de onde dormem as carrinhas por guardar, uma por carrinha (pela ordem das carrinhas). Os nomes
 * vêm do estado gravado; `dormidasServidor` (as sugestões do estado gravado) diz o que estava sugerido.
 */
export function agruparDormidas(
  estadoServidor: Estado,
  pendentes: readonly Operacao[],
  dormidasServidor: ReadonlyMap<Id, Dormida> = new Map(),
): AlteracaoDeDormida[] {
  const resultado: AlteracaoDeDormida[] = [];
  for (const op of soDormidas(compactarOperacoes(soDormidas(pendentes)))) {
    const sugerida = dormidasServidor.get(op.carrinhaId);
    const sugestao = op.de === null && sugerida?.confianca === 'sugerida' ? sugerida.casaId : null;
    resultado.push({
      carrinhaId: op.carrinhaId,
      matricula: matriculaDe(estadoServidor, op.carrinhaId),
      de: nomeDaDormida(estadoServidor, op.de),
      para: nomeDaDormida(estadoServidor, op.para),
      sugestaoAntes: sugestao === null ? null : nomeDaDormida(estadoServidor, `casa:${sugestao}`),
      confirmaSugestao: sugestao !== null && op.para === `casa:${sugestao}`,
      descricao: descreverOperacao(estadoServidor, op),
    });
  }
  const ordem = new Map(estadoServidor.carrinhas.map((c) => [c.id, c.ordem]));
  const posicao = (id: Id) => ordem.get(id) ?? Number.MAX_SAFE_INTEGER;
  return resultado.sort(
    (a, b) =>
      posicao(a.carrinhaId) - posicao(b.carrinhaId) || comparadorNomes.compare(a.matricula, b.matricula),
  );
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
  for (const op of soMovimentos(pendentes)) if (op.campo === campo && op.para !== null) ids.add(op.para);
  return [...ids];
}

/** Carrinhas em que as alterações mexem: entra ou sai alguém, ou muda o condutor (onde dorme não conta). */
function carrinhasMexidas(pendentes: readonly Operacao[]): Id[] {
  const ids = new Set<Id>();
  for (const op of pendentes) {
    if (op.tipo === 'condutor') ids.add(op.carrinhaId);
    else if (op.tipo === 'mover' && op.campo === 'carrinhaId') {
      if (op.de !== null) ids.add(op.de);
      if (op.para !== null) ids.add(op.para);
    }
  }
  return [...ids];
}

/**
 * Avisos a mostrar antes de guardar, só sobre o que as alterações pioram:
 * - casas e carrinhas que recebem gente e ficam com gente a mais (mais do que tinham);
 * - casas que recebem gente e passam (ou passam mais) o máximo/tolerado do contrato;
 * - condutores escolhidos sem carta (forte) ou com a carta caducada (só se `hoje` for dado);
 *   carta desconhecida (temCarta null) não dá aviso;
 * - carrinhas que tinham condutor e ficam com passageiros e sem condutor;
 * - pessoas que ficam fora das casas CMF ou sem transporte da empresa.
 * Primeiro os fortes (gente a mais, acima do tolerado, condutor sem carta), depois os simples.
 */
export function calcularAvisos(
  estadoServidor: Estado,
  estadoVisivel: Estado,
  pendentes: readonly Operacao[],
  indServidor: Indices = indexar(estadoServidor),
  indVisivel: Indices = indexar(estadoVisivel),
  hoje: string | null = null,
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

  // Condutores escolhidos nas alterações (só os que ficam mesmo a conduzir no fim).
  for (const op of soCondutores(pendentes)) {
    if (op.para === null) continue;
    const carrinha = indVisivel.carrinhas.get(op.carrinhaId);
    const p = indVisivel.pessoas.get(op.para);
    if (!carrinha || !p || carrinha.condutorId !== p.id) continue;
    const matricula = formatarMatricula(carrinha.matricula);
    if (p.temCarta === false) {
      avisos.push({
        chave: `condutor-sem-carta:${carrinha.id}`,
        gravidade: 'forte',
        texto: `${p.nomeCurto} fica a conduzir a ${matricula}, mas não tem carta.`,
      });
    } else if (p.temCarta === true && hoje !== null && p.cartaValidade !== null && p.cartaValidade < hoje) {
      avisos.push({
        chave: `condutor-carta-caducada:${carrinha.id}`,
        gravidade: 'simples',
        texto: `${p.nomeCurto} fica a conduzir a ${matricula}, mas a carta caducou a ${formatarData(
          p.cartaValidade,
        )}.`,
      });
    }
  }

  // Carrinhas que tinham condutor e ficam com gente e sem ninguém a conduzir. Como no resto do ecrã, só conta
  // um condutor que vai na carrinha (um inativo ou que já não vai nela é "sem condutor" antes e depois).
  for (const id of carrinhasMexidas(pendentes)) {
    const antes = indServidor.carrinhas.get(id);
    const depois = indVisivel.carrinhas.get(id);
    if (!antes || !depois || condutorDaCarrinha(antes, indServidor) === null) continue;
    const passageiros = indVisivel.passageiros.get(id) ?? [];
    if (passageiros.length === 0 || condutorDaCarrinha(depois, indVisivel) !== null) continue;
    avisos.push({
      chave: `carrinha-sem-condutor:${id}`,
      gravidade: 'simples',
      texto: `${formatarMatricula(depois.matricula)} fica sem condutor (${comPlural(
        passageiros.length,
        'passageiro',
        'passageiros',
      )}).`,
    });
  }

  const semCasa: Pessoa[] = [];
  const semCarrinha: Pessoa[] = [];
  for (const op of soMovimentos(pendentes)) {
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

  // sort é estável: dentro de cada gravidade fica a ordem casas → carrinhas → condutores → pessoas.
  return avisos.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === 'forte' ? -1 : 1));
}

/** Mudanças por guardar de uma pessoa, por campo. */
export function alteracoesDaPessoa(
  pendentes: readonly Operacao[],
  pessoaId: Id,
): Map<CampoMovivel, OperacaoMover> {
  const resultado = new Map<CampoMovivel, OperacaoMover>();
  for (const op of soMovimentos(pendentes)) if (op.pessoaId === pessoaId) resultado.set(op.campo, op);
  return resultado;
}

/** Mudança de condutor por guardar de uma carrinha (a última, se houver mais do que uma). */
export function condutorPendente(pendentes: readonly Operacao[], carrinhaId: Id): OperacaoCondutor | null {
  return soCondutores(pendentes).findLast((op) => op.carrinhaId === carrinhaId) ?? null;
}

/** Mudança de onde dorme por guardar de uma carrinha (a última, se houver mais do que uma). */
export function dormidaPendente(pendentes: readonly Operacao[], carrinhaId: Id): OperacaoDormida | null {
  return soDormidas(pendentes).findLast((op) => op.carrinhaId === carrinhaId) ?? null;
}

/** A pessoa tem alterações por guardar: muda de casa, carrinha ou obra, ou passa a (ou deixa de) conduzir. */
export function pessoaTemAlteracoes(pendentes: readonly Operacao[], pessoaId: Id): boolean {
  return pendentes.some((op) => {
    if (op.tipo === 'condutor') return op.de === pessoaId || op.para === pessoaId;
    return op.tipo === 'mover' && op.pessoaId === pessoaId;
  });
}

/**
 * A casa ou carrinha tem alterações por guardar: entra ou sai alguém (ou, numa carrinha, muda o condutor
 * ou onde dorme).
 */
export function sitioTemAlteracoes(pendentes: readonly Operacao[], campo: CampoMovivel, id: Id): boolean {
  return pendentes.some((op) =>
    op.tipo === 'mover'
      ? op.campo === campo && (op.de === id || op.para === id)
      : campo === 'carrinhaId' && op.carrinhaId === id,
  );
}

export interface MovimentosDoSitio {
  /** Quem passa a estar aqui (com o `de` de onde vem). */
  entram: OperacaoMover[];
  /** Quem deixa de estar aqui (com o `para` para onde vai). */
  saem: OperacaoMover[];
}

/** Quem entra e quem sai de uma casa ou carrinha nas alterações por guardar. */
export function movimentosDoSitio(
  pendentes: readonly Operacao[],
  campo: CampoMovivel,
  id: Id,
): MovimentosDoSitio {
  const movimentos = soMovimentos(pendentes);
  return {
    entram: movimentos.filter((op) => op.campo === campo && op.para === id),
    saem: movimentos.filter((op) => op.campo === campo && op.de === id),
  };
}

/** "Ana T. — casa: Casa Um → Casa Dois", "3 pessoas → Casa Dois" ou "4 alterações". */
function resumirMovimentos(estado: Estado, movimentos: readonly OperacaoMover[]): string {
  const [primeira] = movimentos;
  if (!primeira) return 'nada';
  if (movimentos.length === 1) {
    // Como descreverOperacao, mas com as matrículas formatadas como no resto do ecrã ("ZZ 1001").
    const { campo, de, para } = primeira;
    return `${nomeDaPessoa(estado, primeira.pessoaId)} — ${ROTULO_CAMPO[campo].toLowerCase()}: ${rotuloDoValor(
      estado,
      campo,
      de,
    )} → ${rotuloDoValor(estado, campo, para)}`;
  }
  const mesmoDestino = movimentos.every((op) => op.campo === primeira.campo && op.para === primeira.para);
  if (mesmoDestino) {
    const pessoas = new Set(movimentos.map((op) => op.pessoaId)).size;
    return `${comPlural(pessoas, 'pessoa', 'pessoas')} → ${rotuloDoValor(estado, primeira.campo, primeira.para)}`;
  }
  return comPlural(movimentos.length, 'alteração', 'alterações');
}

/** Consequência de uma mudança de condutor que vem junto de mudanças de pessoas. */
function efeitoNoCondutor(estado: Estado, op: OperacaoCondutor): string {
  const matricula = matriculaDe(estado, op.carrinhaId);
  return op.para === null
    ? `${matricula} fica sem condutor`
    : `${nomeDaPessoa(estado, op.para)} passa a conduzir a ${matricula}`;
}

/**
 * Frase curta de um passo do rascunho, para o aviso depois de desfazer/refazer/mover.
 * Uma pessoa: "Ana — casa: Casa Um → Casa Dois". Várias para o mesmo sítio: "3 pessoas → Casa Dois".
 * Só o condutor: "ZZ 1001 — condutor: sem condutor → Ana". Quem sai da carrinha que conduzia:
 * "Ana — carrinha: ZZ 1001 → ZZ 1002 · ZZ 1001 fica sem condutor". Onde dorme uma carrinha:
 * "ZZ 1001 — onde dorme: por definir → Casa Um"; de várias: "onde dormem 3 carrinhas".
 * Outros casos: "4 alterações".
 */
export function resumirPasso(estado: Estado, passo: readonly Operacao[]): string {
  const movimentos = soMovimentos(passo);
  const condutores = soCondutores(passo);
  const dormidas = soDormidas(passo);
  if (movimentos.length === 0) {
    const outras = [...condutores, ...dormidas];
    const [unica] = outras;
    if (!unica) return 'nada';
    if (outras.length === 1) return descreverOperacao(estado, unica);
    return condutores.length === 0
      ? `onde dormem ${comPlural(dormidas.length, 'carrinha', 'carrinhas')}`
      : comPlural(outras.length, 'alteração', 'alterações');
  }
  return [
    resumirMovimentos(estado, movimentos),
    ...condutores.map((op) => efeitoNoCondutor(estado, op)),
    ...dormidas.map((op) => descreverOperacao(estado, op)),
  ].join(' · ');
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
