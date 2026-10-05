// Resumo do rascunho: alterações agrupadas por pessoa (e as de condutor e de onde dorme por carrinha),
// avisos antes de guardar, o que mudou numa pessoa/casa/carrinha (painel de foco) e a frase de um passo
// (Desfeito: …). Funções puras.
// M2 (docs/m2.md): as alterações novas agrupadas para o Guardar (Fichas, Pessoas novas e saídas, Indisponível,
// Problemas, Obras), os avisos novos (lotação e contrato mudados, condutor indisponível, quem volta), o aviso
// do comentário e as frases dos passos novos.

import { formatarDiaMes, somarDias } from '../../dominio/datas';
import type { Dormida } from '../../dominio/dormidas';
import { type Indices, indexar } from '../../dominio/indices';
import { textoAte } from '../../dominio/indisponibilidade';
import {
  type AvisoContrato,
  lugaresTemporarios,
  ocupacaoCasa,
  ocupacaoDaCarrinha,
} from '../../dominio/ocupacao';
import {
  type CampoMovivel,
  compactarOperacoes,
  descreverOperacao,
  nomeDaDormida,
  nomeDeRegisto,
  nomeDoValor,
  type Operacao,
  type OperacaoCampo,
  type OperacaoCondutor,
  type OperacaoDormida,
  type OperacaoMover,
  type OperacaoRegisto,
} from '../../dominio/operacoes';
import { AVISO_COMENTARIO_SEM_MOTIVO, avisoTextoSaude } from '../../dominio/problemas';
import type { Casa, Estado, Id, Indisponibilidade, Obra, Pessoa } from '../../dominio/tipos';
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

/** O valor (casa, carrinha, obra) existe no estado. null conta como existir ("Fora das casas", "sem obra"). */
function valorExiste(estado: Estado, campo: CampoMovivel, valor: Id | null): boolean {
  if (valor === null) return true;
  const lista = campo === 'casaId' ? estado.casas : campo === 'carrinhaId' ? estado.carrinhas : estado.obras;
  return lista.some((x) => x.id === valor);
}

/**
 * O estado de onde vêm os nomes de um movimento: o gravado (é sobre ele que as alterações se aplicam), ou o
 * visível quando a pessoa ou o destino só existem no rascunho (M2: pessoa nova, obra criada no rascunho).
 */
function estadoDosNomes(
  estadoServidor: Estado,
  estadoVisivel: Estado | undefined,
  op: OperacaoMover,
): Estado {
  if (!estadoVisivel) return estadoServidor;
  const conhecido =
    estadoServidor.pessoas.some((p) => p.id === op.pessoaId) &&
    valorExiste(estadoServidor, op.campo, op.de) &&
    valorExiste(estadoServidor, op.campo, op.para);
  return conhecido ? estadoServidor : estadoVisivel;
}

/**
 * Mudanças de pessoas por guardar, agrupadas por pessoa (por ordem alfabética) e, em cada pessoa, pela
 * ordem casa → carrinha → obra. Os nomes vêm do estado gravado (é sobre ele que as alterações se aplicam).
 * As mudanças de condutor ficam de fora: ver agruparCondutores.
 * M2: com `estadoVisivel`, os nomes de quem (ou do que) só existe no rascunho (pessoa nova, obra nova) vêm
 * dele, em vez do id.
 */
export function agruparAlteracoes(
  estadoServidor: Estado,
  pendentes: readonly Operacao[],
  estadoVisivel?: Estado,
): AlteracoesDaPessoa[] {
  const grupos = new Map<Id, AlteracoesDaPessoa>();
  for (const op of soMovimentos(pendentes)) {
    const nomes = estadoDosNomes(estadoServidor, estadoVisivel, op);
    let grupo = grupos.get(op.pessoaId);
    if (!grupo) {
      grupo = { pessoaId: op.pessoaId, nome: nomeDaPessoa(nomes, op.pessoaId), alteracoes: [] };
      grupos.set(op.pessoaId, grupo);
    }
    grupo.alteracoes.push({
      campo: op.campo,
      rotuloCampo: ROTULO_CAMPO[op.campo],
      de: rotuloDoValor(nomes, op.campo, op.de),
      para: rotuloDoValor(nomes, op.campo, op.para),
      descricao: descreverOperacao(nomes, op),
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

// --- M2: fichas, pessoas novas e saídas, indisponível, problemas e obras ---------------------------------

/** As secções novas do Guardar, por esta ordem. */
export type SeccaoAlteracoes = 'fichas' | 'pessoas' | 'casas' | 'indisponivel' | 'problemas' | 'obras';

export const TITULO_SECCAO: Readonly<Record<SeccaoAlteracoes, string>> = {
  fichas: 'Fichas',
  pessoas: 'Pessoas novas e saídas',
  casas: 'Casas novas e apagadas',
  indisponivel: 'Indisponível',
  problemas: 'Problemas',
  obras: 'Obras',
};

const ORDEM_SECCOES: readonly SeccaoAlteracoes[] = [
  'fichas',
  'pessoas',
  'casas',
  'indisponivel',
  'problemas',
  'obras',
];

/** As frases de quem (pessoa, casa, carrinha, obra) numa secção: "Casa Um" → ["lotação: 8 → 9", …]. */
export interface FrasesDeQuem {
  quem: string;
  /** O "o quê" de cada frase (sem o "quem — "), sem repetidas (a lat e a lng do pino dão uma). */
  frases: string[];
}

export interface GrupoAlteracoes {
  seccao: SeccaoAlteracoes;
  titulo: string;
  itens: FrasesDeQuem[];
}

type OperacaoM2 = OperacaoCampo | OperacaoRegisto;

function eOperacaoM2(op: Operacao): op is OperacaoM2 {
  return op.tipo === 'campo' || op.tipo === 'registo';
}

/** O local é de uma obra (o dela ou o estacionamento), no estado gravado ou no visível. */
function localDeObra(estados: readonly Estado[], localId: Id): boolean {
  return estados.some((e) =>
    e.obras.some((o) => o.localId === localId || o.estacionamentoLocalId === localId),
  );
}

function seccaoDe(op: OperacaoM2, estados: readonly Estado[]): SeccaoAlteracoes {
  switch (op.entidade) {
    case 'pessoa':
      return op.tipo === 'registo' || op.campo === 'ativa' ? 'pessoas' : 'fichas';
    case 'casa':
      // Uma casa criada ou apagada (05/10/2026) tem a sua secção; os campos de uma casa são uma ficha.
      return op.tipo === 'registo' ? 'casas' : 'fichas';
    case 'carrinha':
      return 'fichas';
    case 'indisponibilidade':
      return 'indisponivel';
    case 'problema':
      return 'problemas';
    case 'obra':
      return 'obras';
    case 'local':
      // A morada de uma casa é uma ficha; o local de uma obra (ou criado/apagado com ela) é da obra.
      return op.tipo === 'registo' || localDeObra(estados, op.id) ? 'obras' : 'fichas';
  }
}

/** Os locais que uma obra criada/apagada leva consigo (o dela e o estacionamento). */
function locaisDaObra(obra: Partial<Obra> | null): Id[] {
  return [obra?.localId, obra?.estacionamentoLocalId].filter((id): id is Id => typeof id === 'string');
}

/**
 * As alterações do M2 por guardar ('campo' e 'registo'), agrupadas para o Guardar: Fichas (por pessoa, casa,
 * carrinha), Pessoas novas e saídas, Casas novas e apagadas, Indisponível, Problemas e Obras. Frases de descreverOperacao com os nomes
 * do estado VISÍVEL (as coisas novas só existem nele). A obra criada (ou apagada) e os seus locais dão uma só
 * frase ("Obra Nova — criada (Alfa, Rue X)"); as frases repetidas do mesmo registo juntam-se ("pino mudado de
 * sítio" da lat e da lng). Os 'mover', 'condutor' e 'dormida' ficam nos grupos de sempre.
 */
export function agruparAlteracoesM2(
  estadoServidor: Estado,
  estadoVisivel: Estado,
  pendentes: readonly Operacao[],
): GrupoAlteracoes[] {
  const ops = pendentes.filter(eOperacaoM2);
  const estados = [estadoVisivel, estadoServidor];
  // Locais criados ou apagados junto com a sua obra: a frase da obra já os diz.
  const locaisJuntos = new Set<Id>();
  const estacionamentos = new Map<Id, Id>();
  for (const op of ops) {
    if (op.tipo !== 'registo' || op.entidade !== 'obra') continue;
    const obra = op.para ?? op.de;
    for (const id of locaisDaObra(obra)) locaisJuntos.add(id);
    if (op.de === null && obra?.estacionamentoLocalId) estacionamentos.set(op.id, obra.estacionamentoLocalId);
  }
  // O estacionamento tirado a uma obra e apagado no mesmo passo: a frase da obra ("estacionamento: X → sem
  // estacionamento") já o diz.
  const estacionamentosTirados = new Set<Id>();
  for (const op of ops) {
    if (op.tipo === 'campo' && op.entidade === 'obra' && op.campo === 'estacionamentoLocalId') {
      if (typeof op.de === 'string') estacionamentosTirados.add(op.de);
    }
  }
  // O local de uma casa criada (ou apagada) com ela: a frase da casa já diz a morada.
  const locaisDeCasas = new Map<Id, boolean>();
  for (const op of ops) {
    if (op.tipo !== 'registo' || op.entidade !== 'casa') continue;
    const localId = (op.para ?? op.de)?.localId;
    if (localId) locaisDeCasas.set(localId, op.de === null);
  }
  const ehJunto = (op: OperacaoM2) =>
    op.tipo === 'registo' &&
    op.entidade === 'local' &&
    (locaisDeCasas.get(op.id) === (op.de === null) ||
      (op.para === null && estacionamentosTirados.has(op.id)) ||
      (locaisJuntos.has(op.id) &&
        ops.some(
          (o) =>
            o.tipo === 'registo' &&
            o.entidade === 'obra' &&
            (o.de === null) === (op.de === null) &&
            locaisDaObra(o.para ?? o.de).includes(op.id),
        )));
  // Os nomes vêm do estado visível; um local ou uma obra apagados no rascunho só existem no gravado.
  const comApagados = (visivel: readonly { id: Id }[], gravado: readonly { id: Id }[]) => {
    const ids = new Set(visivel.map((r) => r.id));
    return [...visivel, ...gravado.filter((r) => !ids.has(r.id))];
  };
  const estadoNomes: Estado = {
    ...estadoVisivel,
    locais: comApagados(estadoVisivel.locais, estadoServidor.locais) as Estado['locais'],
    obras: comApagados(estadoVisivel.obras, estadoServidor.obras) as Estado['obras'],
    casas: comApagados(estadoVisivel.casas, estadoServidor.casas) as Estado['casas'],
  };

  const grupos = new Map<SeccaoAlteracoes, Map<string, FrasesDeQuem>>();
  const juntar = (seccao: SeccaoAlteracoes, descricao: string) => {
    const i = descricao.indexOf(' — ');
    const quem = i > 0 ? descricao.slice(0, i) : '';
    const oque = i > 0 ? descricao.slice(i + 3) : descricao;
    let itens = grupos.get(seccao);
    if (!itens) {
      itens = new Map();
      grupos.set(seccao, itens);
    }
    const item = itens.get(quem) ?? { quem, frases: [] };
    if (!item.frases.includes(oque)) item.frases.push(oque);
    itens.set(quem, item);
  };
  for (const op of ops) {
    if (ehJunto(op)) continue;
    const seccao = seccaoDe(op, estados);
    juntar(seccao, descreverOperacao(estadoNomes, op));
    const estacionamento = op.tipo === 'registo' ? estacionamentos.get(op.id) : undefined;
    if (estacionamento) {
      const local = estadoVisivel.locais.find((l) => l.id === estacionamento);
      const quem = nomeDeRegisto(estadoVisivel, 'obra', op.para as unknown as Record<string, unknown>);
      juntar(seccao, `${quem} — estacionamento: ${local?.morada.trim() || local?.nome || '—'}`);
    }
  }
  return ORDEM_SECCOES.filter((s) => grupos.has(s)).map((s) => ({
    seccao: s,
    titulo: TITULO_SECCAO[s],
    itens: [...(grupos.get(s)?.values() ?? [])],
  }));
}

/** O rascunho tem operações de indisponibilidade ou de problemas (o comentário leva a frase fixa). */
export function temIndisponivelOuProblemas(pendentes: readonly Operacao[]): boolean {
  return pendentes.some(
    (op) => eOperacaoM2(op) && (op.entidade === 'indisponibilidade' || op.entidade === 'problema'),
  );
}

/** A frase fixa junto ao comentário do Guardar (AVISO_COMENTARIO_SEM_MOTIVO), ou null. */
export function fraseFixaDoComentario(pendentes: readonly Operacao[]): string | null {
  return temIndisponivelOuProblemas(pendentes) ? AVISO_COMENTARIO_SEM_MOTIVO : null;
}

/**
 * O aviso por baixo do comentário enquanto se escreve (avisoTextoSaude: palavras de saúde; nomes de pessoas
 * não avisam). Nunca impede de gravar. null = sem aviso.
 */
export function avisoDoComentario(comentario: string): string | null {
  const aviso = avisoTextoSaude(comentario);
  return aviso === null ? null : `Isto parece um dado de saúde. ${aviso}`;
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

/** M2: os registos de `entidade` cujos `campos` mudam nas alterações (ex.: a lotação de uma casa). */
function fichasMexidas(pendentes: readonly Operacao[], entidade: string, campos: readonly string[]): Id[] {
  const ids = new Set<Id>();
  for (const op of pendentes) {
    if (op.tipo === 'campo' && op.entidade === entidade && campos.includes(op.campo)) ids.add(op.id);
  }
  return [...ids];
}

/**
 * M2: as carrinhas de quem tem um período de indisponibilidade criado, mudado ou apagado no rascunho (gravada e
 * visível). Acabar ou encurtar um período ("Já voltou", "Mudar datas…") devolve o lugar a quem estava fora e
 * pode deixar a carrinha com gente a mais. Nas casas a cama nunca se liberta, por isso lá não muda nada.
 */
function carrinhasDeIndisponivelMexido(
  pendentes: readonly Operacao[],
  indServidor: Indices,
  indVisivel: Indices,
  estados: readonly Pick<Estado, 'indisponibilidades'>[],
): Id[] {
  const pessoas = new Set<Id>();
  for (const op of pendentes) {
    if ((op.tipo !== 'campo' && op.tipo !== 'registo') || op.entidade !== 'indisponibilidade') continue;
    const pessoaId =
      op.tipo === 'registo'
        ? (op.para ?? op.de)?.pessoaId
        : estados.flatMap((e) => e.indisponibilidades).find((i) => i.id === op.id)?.pessoaId;
    if (pessoaId) pessoas.add(pessoaId);
  }
  const ids = new Set<Id>();
  for (const id of pessoas) {
    for (const ind of [indServidor, indVisivel]) {
      const carrinhaId = ind.pessoas.get(id)?.carrinhaId;
      if (carrinhaId) ids.add(carrinhaId);
    }
  }
  return [...ids];
}

/** Campos da casa que mudam a lotação ou o contrato. */
const CAMPOS_LOTACAO_CASA = ['lotacao', 'sempreCheia', 'maxContrato', 'tolerado'] as const;

/** Gente a mais (0 quando cabe). */
function aMais(ocupados: number, lugares: number): number {
  return Math.max(0, ocupados - lugares);
}

/** "Ana T.", "Ana T. e Rui S.", "Ana T., Rui S. e Gil N.". */
function juntarNomes(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

/**
 * M2: a carrinha fica acima dos lugares quando quem está fora voltar (lugaresTemporarios com data): o 1.º
 * regresso que a faz passar dos lugares, contando os que voltam antes. null se nunca passa (ou já passa hoje:
 * esse é o aviso de gente a mais). O dia de regresso é o dia a seguir ao fim do período.
 */
function avisoRegresso(ind: Indices, carrinhaId: Id): AvisoGuardar | null {
  const carrinha = ind.carrinhas.get(carrinhaId);
  if (!carrinha) return null;
  const hoje = ind.ocupadosCarrinha.get(carrinhaId) ?? 0;
  if (hoje > carrinha.lugares) return null;
  const voltam = lugaresTemporarios(ind, carrinhaId).filter(
    (l): l is { pessoaId: Id; ate: string } => l.ate !== null,
  );
  for (const [i, lugar] of voltam.entries()) {
    // Quem volta no mesmo dia volta junto.
    if (voltam[i + 1]?.ate === lugar.ate) continue;
    const ocupados = hoje + i + 1;
    if (ocupados <= carrinha.lugares) continue;
    const nomes = voltam
      .filter((l) => l.ate === lugar.ate)
      .map((l) => ind.pessoas.get(l.pessoaId)?.nomeCurto ?? l.pessoaId);
    return {
      chave: `carrinha-regresso:${carrinhaId}`,
      gravidade: 'simples',
      texto: `${formatarMatricula(carrinha.matricula)} fica com ${ocupados}/${carrinha.lugares} quando ${juntarNomes(
        nomes,
      )} ${nomes.length === 1 ? 'voltar' : 'voltarem'}, a ${formatarDiaMes(somarDias(lugar.ate, 1))}.`,
    };
  }
  return null;
}

/**
 * Avisos a mostrar antes de guardar, só sobre o que as alterações pioram:
 * - casas e carrinhas que recebem gente (M2: ou cuja lotação/lugares baixam; nas carrinhas, também quando um
 *   período de indisponibilidade de quem lá vai acaba, encurta ou é apagado) e ficam com gente a mais (mais
 *   do que tinham); nas carrinhas os indisponíveis hoje não contam (ocupacaoDaCarrinha);
 * - casas que recebem gente (M2: ou cujo contrato muda) e passam (ou passam mais) o máximo/tolerado;
 * - condutores escolhidos sem carta (forte) ou com a carta caducada (só se `hoje` for dado);
 *   carta desconhecida (temCarta null) não dá aviso;
 * - M2: o condutor fica indisponível hoje por causa do rascunho (simples);
 * - carrinhas que tinham condutor e ficam com passageiros e sem condutor;
 * - M2: carrinhas que recebem gente e ficam acima dos lugares quando quem está fora voltar (simples);
 * - pessoas que ficam fora das casas CMF ou sem transporte da empresa.
 * Uma obra criada sem ninguém não avisa.
 * Primeiro os fortes (gente a mais, acima do tolerado, condutor sem carta), depois os simples.
 * CONTRATO DO M2: no browser passam-se SEMPRE os dois índices feitos com `loja.hoje` (indexar(x, hoje)) e o
 * `hoje`; as omissões (ninguém indisponível) são só para os testes antigos.
 */
export function calcularAvisos(
  estadoServidor: Estado,
  estadoVisivel: Estado,
  pendentes: readonly Operacao[],
  indServidor: Indices = indexar(estadoServidor, null),
  indVisivel: Indices = indexar(estadoVisivel, null),
  hoje: string | null = null,
): AvisoGuardar[] {
  const avisos: AvisoGuardar[] = [];

  const casas = new Set([
    ...destinos(pendentes, 'casaId'),
    ...fichasMexidas(pendentes, 'casa', CAMPOS_LOTACAO_CASA),
  ]);
  for (const id of casas) {
    const casa = indVisivel.casas.get(id);
    if (!casa) continue;
    // O "antes" com a casa gravada: a lotação ou o contrato podem ter mudado no rascunho.
    const antes = ocupacaoCasa(indServidor.casas.get(id) ?? casa, indServidor.moradores.get(id)?.length ?? 0);
    const depois = ocupacaoCasa(casa, indVisivel.moradores.get(id)?.length ?? 0);
    if (
      depois.nivel === 'excesso' &&
      aMais(depois.ocupados, depois.lotacao) > aMais(antes.ocupados, antes.lotacao)
    ) {
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

  const carrinhasQueRecebem = destinos(pendentes, 'carrinhaId');
  const carrinhas = new Set([
    ...carrinhasQueRecebem,
    ...fichasMexidas(pendentes, 'carrinha', ['lugares']),
    ...carrinhasDeIndisponivelMexido(pendentes, indServidor, indVisivel, [estadoVisivel, estadoServidor]),
  ]);
  for (const id of carrinhas) {
    const carrinha = indVisivel.carrinhas.get(id);
    if (!carrinha) continue;
    // M2: os indisponíveis hoje não ocupam lugar (ocupacaoDaCarrinha), como no Mapa; o "antes" com a carrinha
    // gravada (os lugares podem ter mudado no rascunho).
    const antes = ocupacaoDaCarrinha(indServidor, indServidor.carrinhas.get(id) ?? carrinha);
    const depois = ocupacaoDaCarrinha(indVisivel, carrinha);
    if (
      depois.nivel === 'excesso' &&
      aMais(depois.ocupados, depois.lugares) > aMais(antes.ocupados, antes.lugares)
    ) {
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

  // M2: o condutor fica indisponível hoje por causa do rascunho (um período novo ou mudado, ou passou a
  // conduzir quem já estava fora). Não muda o condutor: só avisa.
  for (const carrinha of indVisivel.carrinhas.values()) {
    const p = condutorDaCarrinha(carrinha, indVisivel);
    const periodo = p ? indVisivel.indisponiveis.get(p.id) : undefined;
    if (!p || !periodo) continue;
    const gravada = indServidor.carrinhas.get(carrinha.id);
    const jaEra =
      gravada !== undefined &&
      condutorDaCarrinha(gravada, indServidor)?.id === p.id &&
      indServidor.indisponiveis.has(p.id);
    if (jaEra) continue;
    avisos.push({
      chave: `condutor-indisponivel:${carrinha.id}`,
      gravidade: 'simples',
      texto: `${formatarMatricula(carrinha.matricula)}: o condutor, ${p.nomeCurto}, fica indisponível ${
        periodo.fim === null ? '(sem data de regresso)' : textoAte(periodo)
      }.`,
    });
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

  // M2: carrinhas que recebem gente e passam dos lugares quando quem está fora voltar.
  for (const id of carrinhasQueRecebem) {
    const aviso = avisoRegresso(indVisivel, id);
    if (aviso) avisos.push(aviso);
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

/**
 * A pessoa tem alterações por guardar: muda de casa, carrinha ou obra, passa a (ou deixa de) conduzir, a
 * ficha dela muda, ou um período de indisponibilidade dela é criado, mudado ou apagado.
 * CONTRATO DO M2: `estadoVisivel` (o estado com o rascunho, `useLoja.estado`) é o que deixa encontrar a pessoa
 * de um 'campo' de um período (a operação só traz o id do período). Quem mostra a marca "alterado" (NomeChip,
 * PecasFoco…) passa-o SEMPRE; sem ele, as datas mudadas de um período não marcam a pessoa.
 */
export function pessoaTemAlteracoes(
  pendentes: readonly Operacao[],
  pessoaId: Id,
  estadoVisivel?: Pick<Estado, 'indisponibilidades'> | null,
): boolean {
  return pendentes.some((op) => {
    if (op.tipo === 'condutor') return op.de === pessoaId || op.para === pessoaId;
    if (op.tipo === 'campo' || op.tipo === 'registo') {
      if (op.entidade === 'pessoa') return op.id === pessoaId;
      if (op.entidade !== 'indisponibilidade') return false;
      if (op.tipo === 'registo') return (op.de ?? op.para)?.pessoaId === pessoaId;
      return estadoVisivel?.indisponibilidades.find((i) => i.id === op.id)?.pessoaId === pessoaId;
    }
    return op.tipo === 'mover' && op.pessoaId === pessoaId;
  });
}

/**
 * A casa ou carrinha tem alterações por guardar: entra ou sai alguém (ou, numa carrinha, muda o condutor
 * ou onde dorme). M2: também a ficha da casa/carrinha, a morada (o local) da casa e os seus problemas.
 * CONTRATO DO M2: com `estadoVisivel`, também um 'campo' de um problema (texto, resolvido) e da morada.
 */
export function sitioTemAlteracoes(
  pendentes: readonly Operacao[],
  campo: CampoMovivel,
  id: Id,
  estadoVisivel?: Pick<Estado, 'problemas' | 'casas' | 'obras'> | null,
): boolean {
  const entidade = campo === 'casaId' ? 'casa' : campo === 'carrinhaId' ? 'carrinha' : 'obra';
  const doAlvo = (p: { casaId: Id | null; carrinhaId: Id | null } | null | undefined) =>
    campo === 'casaId' ? p?.casaId === id : campo === 'carrinhaId' && p?.carrinhaId === id;
  return pendentes.some((op) => {
    if (op.tipo === 'mover') return op.campo === campo && (op.de === id || op.para === id);
    if (op.tipo === 'campo' || op.tipo === 'registo') {
      if (op.entidade === entidade) return op.id === id;
      if (op.entidade === 'problema') {
        if (op.tipo === 'registo') return doAlvo(op.de ?? op.para);
        return doAlvo(estadoVisivel?.problemas.find((p) => p.id === op.id));
      }
      if (op.entidade === 'local' && op.tipo === 'campo' && estadoVisivel) {
        const sitio =
          campo === 'casaId'
            ? estadoVisivel.casas.find((c) => c.id === id)
            : campo === 'obraId'
              ? estadoVisivel.obras.find((o) => o.id === id)
              : undefined;
        return sitio?.localId === op.id;
      }
      return false;
    }
    return campo === 'carrinhaId' && op.carrinhaId === id;
  });
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
 * Quantas alterações o utilizador vê: como as frases, a latitude e a longitude do mesmo pino (de um local)
 * contam como uma ("pino mudado de sítio"). A barra, o Guardar, o Reverter e o resumirPasso contam assim, para
 * o número anunciado bater com as linhas da lista.
 */
export function contarAlteracoes(operacoes: readonly Operacao[]): number {
  const pinos = new Set<string>();
  let n = 0;
  for (const op of operacoes) {
    if (op.tipo === 'campo' && op.entidade === 'local' && (op.campo === 'lat' || op.campo === 'lng')) {
      if (pinos.has(String(op.id))) continue;
      pinos.add(String(op.id));
    }
    n += 1;
  }
  return n;
}

/**
 * Os conflitos a mostrar, sem frases repetidas: o pino de uma obra dá um conflito para a lat e outro para a
 * lng (chaves diferentes), com a mesma frase "Obra X — pino mudado de sítio". Fica o primeiro de cada frase.
 */
export function frasesDosConflitos<T extends { descricao: string }>(conflitos: readonly T[]): T[] {
  const vistas = new Set<string>();
  return conflitos.filter((c) => {
    if (vistas.has(c.descricao)) return false;
    vistas.add(c.descricao);
    return true;
  });
}

export interface OpcoesResumirPasso {
  /** O passo é uma reversão (loja.iniciarReversao): "Reversão: N alterações". */
  reversao?: boolean;
}

/** "até 12/10" ou "(sem data de regresso)". */
function textoRegresso(periodo: Pick<Indisponibilidade, 'fim'>): string {
  return periodo.fim === null ? '(sem data de regresso)' : `até ${formatarDiaMes(periodo.fim)}`;
}

/** A frase de um passo com operações do M2, ou null para seguir as regras de sempre (movimentos…). */
function resumirPassoM2(estado: Estado, passo: readonly Operacao[]): string | null {
  const m2 = passo.filter(eOperacaoM2);
  if (m2.length === 0) return null;
  // Uma pessoa nova (com a casa e a carrinha no mesmo passo) e "Saiu da empresa" (com as saídas).
  const pessoaNova = m2.find((op) => op.tipo === 'registo' && op.entidade === 'pessoa' && op.de === null);
  if (pessoaNova) return descreverOperacao(estado, pessoaNova);
  const saida = m2.find((op) => op.tipo === 'campo' && op.entidade === 'pessoa' && op.campo === 'ativa');
  if (saida) return descreverOperacao(estado, saida);
  const casa = m2.find((op) => op.tipo === 'registo' && op.entidade === 'casa');
  if (casa?.tipo === 'registo') {
    return casa.para !== null && casa.de === null
      ? `Nova casa: ${(casa.para as Casa).nome}`
      : `Casa apagada: ${(casa.de as Casa).nome}`;
  }
  const obra = m2.find((op) => op.tipo === 'registo' && op.entidade === 'obra');
  if (obra?.tipo === 'registo') {
    return obra.para !== null && obra.de === null
      ? `Nova obra: ${(obra.para as Obra).nome}`
      : descreverOperacao(estado, obra);
  }
  const periodos = m2.filter(
    (op): op is OperacaoRegisto & { para: Indisponibilidade } =>
      op.tipo === 'registo' && op.entidade === 'indisponibilidade' && op.de === null && op.para !== null,
  );
  if (periodos.length > 0 && periodos.length === passo.length) {
    const [primeiro] = periodos;
    if (!primeiro) return null;
    const mesmoFim = periodos.every((op) => op.para.fim === primeiro.para.fim);
    if (periodos.length === 1) {
      const nome = nomeDeRegisto(
        estado,
        'indisponibilidade',
        primeiro.para as unknown as Record<string, unknown>,
      );
      return `${nome} indisponível ${textoRegresso(primeiro.para)}`;
    }
    const pessoas = `${periodos.length} pessoas indisponíveis`;
    return mesmoFim ? `${pessoas} ${textoRegresso(primeiro.para)}` : pessoas;
  }
  if (m2.length !== passo.length) return null;
  const frases = [...new Set(m2.map((op) => descreverOperacao(estado, op)))];
  return frases.length === 1
    ? (frases[0] as string)
    : comPlural(contarAlteracoes(passo), 'alteração', 'alterações');
}

/**
 * Frase curta de um passo do rascunho, para o aviso depois de desfazer/refazer/mover.
 * Uma pessoa: "Ana — casa: Casa Um → Casa Dois". Várias para o mesmo sítio: "3 pessoas → Casa Dois".
 * Só o condutor: "ZZ 1001 — condutor: sem condutor → Ana". Quem sai da carrinha que conduzia:
 * "Ana — carrinha: ZZ 1001 → ZZ 1002 · ZZ 1001 fica sem condutor". Onde dorme uma carrinha:
 * "ZZ 1001 — onde dorme: por definir → Casa Um"; de várias: "onde dormem 3 carrinhas".
 * Outros casos: "4 alterações".
 * M2: "Nova obra: Obra X"; "Nova casa: Casa X"; "Casa apagada: Casa X"; "Ana T. indisponível até 12/10" (várias: "3 pessoas indisponíveis até 12/10");
 * "Ana T. — entrou (Alfa)"; "Ana T. — saiu da empresa"; uma ficha: "Casa Um — lotação: 8 → 9" (o pino, com a
 * lat e a lng, dá uma frase); `opcoes.reversao` (o passo do "Reverter"): "Reversão: 5 alterações".
 */
export function resumirPasso(
  estado: Estado,
  passo: readonly Operacao[],
  opcoes: OpcoesResumirPasso = {},
): string {
  if (opcoes.reversao) return `Reversão: ${comPlural(contarAlteracoes(passo), 'alteração', 'alterações')}`;
  const m2 = resumirPassoM2(estado, passo);
  if (m2 !== null) return m2;
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
