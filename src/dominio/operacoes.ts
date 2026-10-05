// Operações de edição: o que o modo de edição produz e o servidor grava.
// O browser aplica-as ao estado para mostrar a simulação; o servidor volta a validá-las e grava-as
// num lote com histórico. Funções puras, iguais nos dois lados.
//
// M2 (docs/m2.md): além de 'mover', 'condutor' e 'dormida', há
// - 'campo': muda um campo de uma ficha (pessoa, casa, carrinha, obra, local, indisponibilidade, problema);
// - 'registo': cria (`de` = null) ou apaga (`para` = null) um registo inteiro, com o id gerado no browser
//   (novoId): pessoas novas, casas e obras (e os seus locais), períodos de indisponibilidade e problemas.
// Todas têm `de` (o que se esperava encontrar: os conflitos vêm daí) e `para`. CONTRATO DO M2: os tipos e as
// assinaturas estão fechados. Compactar dobra os 'campo' de um registo criado/apagado no 'registo';
// validarOperacoes vê as regras de docs/m2.md ("Validar") no estado final; descreverOperacao dá as frases do
// histórico ("Frases do histórico").

import {
  type CampoEditavel,
  chaveMatricula,
  ENTIDADES_APAGAVEIS,
  ENTIDADES_CRIAVEIS,
  type EntidadeApagavel,
  type EntidadeCriavel,
  type EntidadeEditavel,
  eCampoEditavel,
  eEntidadeEditavel,
  encontrarRegisto,
  localCriadoNoPrograma,
  PREFIXO_ID,
  type RegistosEditaveis,
  ROTULO_CAMPO,
  registosDe,
  type ValorCampo,
  type ValorDoCampo,
  validarRegisto,
  validarValorCampo,
} from './campos';
import { formatarDiaCompleto } from './datas';
import { formatarMatricula } from './matricula';
import { normalizarTexto } from './pesquisa';
import type { Carrinha, Casa, Estado, Id, Indisponibilidade, Local, Pessoa } from './tipos';

export type CampoMovivel = 'casaId' | 'carrinhaId' | 'obraId';

/** Mudar uma pessoa de casa, de carrinha ou de obra. `de` serve para detetar conflitos ao gravar. */
export interface OperacaoMover {
  tipo: 'mover';
  pessoaId: Id;
  campo: CampoMovivel;
  /** Valor que a pessoa tinha quando a mudança foi feita (null = Fora das casas / Sem transporte / sem obra). */
  de: Id | null;
  para: Id | null;
}

/** Definir (ou tirar) o condutor de uma carrinha. O condutor tem de ir nessa carrinha. */
export interface OperacaoCondutor {
  tipo: 'condutor';
  carrinhaId: Id;
  /** Condutor quando a mudança foi feita (null = sem condutor). */
  de: Id | null;
  para: Id | null;
}

/**
 * Onde dorme uma carrinha: "casa:<id>", "local:<id>" (ex.: um estacionamento) ou null = por definir
 * (aí o mapa usa a sugestão: a casa da maioria dos passageiros).
 */
export type ChaveDormida = string;

/** Mudar onde dorme uma carrinha. */
export interface OperacaoDormida {
  tipo: 'dormida';
  carrinhaId: Id;
  de: ChaveDormida | null;
  para: ChaveDormida | null;
}

/**
 * Mudar um campo de uma ficha (M2). `campo` é um de CAMPOS_EDITAVEIS[entidade] (dominio/campos.ts);
 * `de` é o valor que lá estava quando se mudou (os conflitos vêm daí), `para` o novo.
 * Ex.: { entidade: 'casa', id: 'casa-x', campo: 'lotacao', de: 8, para: 9 }.
 */
export interface OperacaoCampo {
  tipo: 'campo';
  entidade: EntidadeEditavel;
  id: Id;
  campo: CampoEditavel;
  de: ValorCampo;
  para: ValorCampo;
}

/** Um registo inteiro de uma entidade que se cria ou apaga no programa (o id vem dentro). */
export type RegistoCriavel = RegistosEditaveis[EntidadeCriavel];

/**
 * Criar (`de` = null, `para` = o registo novo, com o id gerado no browser por novoId) ou apagar
 * (`de` = o registo como estava, `para` = null) um registo (M2). Só as entidades de ENTIDADES_CRIAVEIS se
 * criam e só as de ENTIDADES_APAGAVEIS se apagam (dominio/campos.ts). No histórico fica numa linha com o
 * campo CAMPO_REGISTO e o registo inteiro em JSON (antes/depois), o que permite reverter.
 */
export type OperacaoRegisto = {
  [E in EntidadeCriavel]: {
    tipo: 'registo';
    entidade: E;
    id: Id;
    de: RegistosEditaveis[E] | null;
    para: RegistosEditaveis[E] | null;
  };
}[EntidadeCriavel];

export type Operacao = OperacaoMover | OperacaoCondutor | OperacaoDormida | OperacaoCampo | OperacaoRegisto;

// --- Linhas do histórico (tabela `alteracoes`) ------------------------------------------------------
// Cada operação gravada dá uma ou mais linhas (entidade, entidadeId, campo, antes, depois em JSON).
// 'mover': entidade 'pessoa', campo casaId/carrinhaId/obraId (+ as marcas "a confirmar" que limpa).
// 'condutor': entidade 'carrinha', campo CAMPO_CONDUTOR. 'dormida': entidade 'carrinha', CAMPO_DORMIDA.
// 'campo': a entidade e o campo da operação. 'registo': a entidade, campo CAMPO_REGISTO e o registo inteiro.

/** Campo do condutor na tabela `alteracoes` (entidade 'carrinha'). */
export const CAMPO_CONDUTOR = 'condutorId';
/** Onde dorme a carrinha na tabela `alteracoes` (entidade 'carrinha'): a ChaveDormida em JSON. */
export const CAMPO_DORMIDA = 'dormida';
/** Registo criado (antes null) ou apagado (depois null) na tabela `alteracoes`: o registo inteiro em JSON. */
export const CAMPO_REGISTO = '@registo';

// --- Construir e comparar ----------------------------------------------------------------------------

/**
 * Forma canónica para comparar: chaves dos objetos por ordem alfabética e sem as que valem null/undefined
 * (um registo sem a chave e com ela a null são o mesmo). Os registos chegam montados no browser, pelo zod do
 * servidor ou pelo estado.ts, com as chaves por ordens diferentes: a ordem nunca pode dar "mudou".
 */
function canonico(valor: unknown): unknown {
  if (valor === undefined || valor === null) return null;
  if (Array.isArray(valor)) return valor.map(canonico);
  if (typeof valor !== 'object') return valor;
  const resultado: Record<string, unknown> = {};
  for (const chave of Object.keys(valor).sort()) {
    const v = (valor as Record<string, unknown>)[chave];
    if (v !== undefined && v !== null) resultado[chave] = canonico(v);
  }
  return resultado;
}

/**
 * Dois valores iguais pelo conteúdo (listas pela ordem; registos sem contar a ordem das chaves; undefined e
 * null são o mesmo). Usada nos conflitos, no `operacaoSemEfeito` e no reverter (CONTRATO DO M2).
 */
export function valoresIguais(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
}

/** A operação não muda nada (`de` igual a `para`): não entra no rascunho nem se envia. */
export function operacaoSemEfeito(op: Operacao): boolean {
  return op.tipo === 'campo' || op.tipo === 'registo' ? valoresIguais(op.de, op.para) : op.de === op.para;
}

/** Id novo, gerado no browser, para um registo criado no programa (ex.: "obra-5b1f…"). */
export function novoId(
  entidade: EntidadeCriavel,
  gerar: () => string = () => globalThis.crypto.randomUUID(),
): Id {
  return `${PREFIXO_ID[entidade]}-${gerar()}`;
}

/**
 * Operação para mudar um campo de uma ficha, com o `de` lido do estado (o VISÍVEL, com o rascunho aplicado,
 * como todas as outras). null se o registo não existir ou o valor já for esse. Os textos chegam já aparados
 * (trim) e com "" passado a null nos campos opcionais: é quem chama que o faz.
 */
export function operacaoCampo<E extends EntidadeEditavel, C extends CampoEditavel<E>>(
  estado: Estado,
  entidade: E,
  id: Id,
  campo: C,
  para: ValorDoCampo<E, C>,
): OperacaoCampo | null {
  const registo = encontrarRegisto(estado, entidade, id);
  if (!registo) return null;
  const de = (registo as unknown as Record<string, ValorCampo | undefined>)[campo] ?? null;
  const valor = (para ?? null) as ValorCampo;
  if (valoresIguais(de, valor)) return null;
  return { tipo: 'campo', entidade, id, campo, de, para: valor };
}

/** Operação para criar um registo (o id vai dentro do registo e gera-se com novoId). */
export function operacaoCriar<E extends EntidadeCriavel>(
  entidade: E,
  registo: RegistosEditaveis[E],
): OperacaoRegisto {
  return { tipo: 'registo', entidade, id: registo.id, de: null, para: registo } as OperacaoRegisto;
}

/** Operação para apagar um registo, com o registo como está no estado visível; null se não existir. */
export function operacaoApagar(estado: Estado, entidade: EntidadeApagavel, id: Id): OperacaoRegisto | null {
  const registo = encontrarRegisto(estado, entidade, id);
  if (!registo) return null;
  return { tipo: 'registo', entidade, id, de: registo, para: null } as OperacaoRegisto;
}

/** Onde dorme a carrinha, como está gravado (sem contar com a sugestão). */
export function chaveDormida(carrinha: Carrinha): ChaveDormida | null {
  if (carrinha.dormeCasaId) return `casa:${carrinha.dormeCasaId}`;
  if (carrinha.dormeLocalId) return `local:${carrinha.dormeLocalId}`;
  return null;
}

/** Lê uma chave de dormida; null se for inválida. */
export function lerChaveDormida(chave: ChaveDormida): { tipo: 'casa' | 'local'; id: Id } | null {
  const i = chave.indexOf(':');
  const tipo = chave.slice(0, i);
  const id = chave.slice(i + 1);
  if (i <= 0 || !id || (tipo !== 'casa' && tipo !== 'local')) return null;
  return { tipo, id };
}

/** Sítio onde se larga uma ou mais pessoas. */
export type Alvo =
  | { tipo: 'casa'; id: Id }
  | { tipo: 'fora' }
  | { tipo: 'carrinha'; id: Id }
  | { tipo: 'sem-transporte' }
  | { tipo: 'obra'; id: Id }
  | { tipo: 'sem-obra' };

export function campoDoAlvo(alvo: Alvo): CampoMovivel {
  switch (alvo.tipo) {
    case 'casa':
    case 'fora':
      return 'casaId';
    case 'carrinha':
    case 'sem-transporte':
      return 'carrinhaId';
    case 'obra':
    case 'sem-obra':
      return 'obraId';
  }
}

export function valorDoAlvo(alvo: Alvo): Id | null {
  return alvo.tipo === 'casa' || alvo.tipo === 'carrinha' || alvo.tipo === 'obra' ? alvo.id : null;
}

/** Texto estável para pôr num atributo HTML (`data-alvo`): "casa:<id>", "fora", "carrinha:<id>", … */
export function chaveAlvo(alvo: Alvo): string {
  return alvo.tipo === 'casa' || alvo.tipo === 'carrinha' || alvo.tipo === 'obra'
    ? `${alvo.tipo}:${alvo.id}`
    : alvo.tipo;
}

export function lerChaveAlvo(chave: string): Alvo | null {
  if (chave === 'fora' || chave === 'sem-transporte' || chave === 'sem-obra') return { tipo: chave };
  const i = chave.indexOf(':');
  if (i <= 0) return null;
  const tipo = chave.slice(0, i);
  const id = chave.slice(i + 1);
  if (!id) return null;
  if (tipo === 'casa' || tipo === 'carrinha' || tipo === 'obra') return { tipo, id };
  return null;
}

/**
 * Operações para levar as pessoas até ao alvo. Quem já lá está (ou não existe) fica de fora.
 * Quem sai da carrinha que conduz deixa de ser o condutor dela (vai junto uma operação de condutor).
 */
export function operacoesParaAlvo(estado: Estado, pessoaIds: readonly Id[], alvo: Alvo): Operacao[] {
  const campo = campoDoAlvo(alvo);
  const para = valorDoAlvo(alvo);
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const carrinhas = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const ops: Operacao[] = [];
  for (const id of new Set(pessoaIds)) {
    const p = pessoas.get(id);
    if (!p || p[campo] === para) continue;
    ops.push({ tipo: 'mover', pessoaId: id, campo, de: p[campo], para });
    const conduzia = campo === 'carrinhaId' && p.carrinhaId ? carrinhas.get(p.carrinhaId) : undefined;
    if (conduzia && conduzia.condutorId === id) {
      ops.push({ tipo: 'condutor', carrinhaId: conduzia.id, de: id, para: null });
    }
  }
  return ops;
}

/** Operação para a carrinha passar a dormir em `para` (null = por definir); null se já for assim. */
export function operacaoDormida(estado: Estado, carrinhaId: Id, para: ChaveDormida | null): Operacao | null {
  const carrinha = estado.carrinhas.find((c) => c.id === carrinhaId);
  if (!carrinha) return null;
  const de = chaveDormida(carrinha);
  return de === para ? null : { tipo: 'dormida', carrinhaId, de, para };
}

/** Operação para pôr `pessoaId` (ou ninguém) a conduzir a carrinha; null se já for assim. */
export function operacaoCondutor(estado: Estado, carrinhaId: Id, pessoaId: Id | null): Operacao | null {
  const carrinha = estado.carrinhas.find((c) => c.id === carrinhaId);
  if (!carrinha || carrinha.condutorId === pessoaId) return null;
  return { tipo: 'condutor', carrinhaId, de: carrinha.condutorId, para: pessoaId };
}

function aplicarUma(p: Pessoa, op: OperacaoMover): Pessoa {
  const nova: Pessoa = { ...p, [op.campo]: op.para };
  // Mudar alguém de casa/carrinha à mão confirma a nova situação.
  if (op.campo === 'casaId') nova.casaAConfirmar = false;
  if (op.campo === 'carrinhaId') nova.carrinhaAConfirmar = false;
  return nova;
}

/** As listas do Estado que as operações 'campo' e 'registo' mexem, pela entidade. */
const LISTA_DA_ENTIDADE = {
  pessoa: 'pessoas',
  casa: 'casas',
  carrinha: 'carrinhas',
  obra: 'obras',
  local: 'locais',
  indisponibilidade: 'indisponibilidades',
  problema: 'problemas',
} as const satisfies Record<EntidadeEditavel, keyof Estado>;

/**
 * Aplica as operações 'campo' e 'registo' (M2), por fases: 1) cria os registos novos (no fim da lista);
 * 2) muda os campos (os de registos que não existem ignoram-se); 3) as outras operações (aplicarOperacoes);
 * 4) apaga os registos apagados. Assim uma pessoa pode ir para uma obra criada no mesmo rascunho, e uma obra
 * só desaparece depois de as pessoas saírem. Seja qual for a ordem das operações no pedido.
 */
function aplicarRegistosECampos(estado: Estado, ops: readonly Operacao[], fase: 'antes' | 'depois'): Estado {
  let resultado = estado;
  const mudar = <K extends keyof Estado>(lista: K, valor: Estado[K]) => {
    resultado = { ...resultado, [lista]: valor };
  };
  const lista = (entidade: EntidadeEditavel) => LISTA_DA_ENTIDADE[entidade];
  const atuais = (entidade: EntidadeEditavel) => resultado[lista(entidade)] as readonly { id: Id }[];
  if (fase === 'depois') {
    for (const op of ops) {
      if (op.tipo !== 'registo' || op.para !== null) continue;
      mudar(lista(op.entidade), atuais(op.entidade).filter((r) => r.id !== op.id) as never);
    }
    return resultado;
  }
  for (const op of ops) {
    if (op.tipo !== 'registo' || op.de !== null || op.para === null) continue;
    if (atuais(op.entidade).some((r) => r.id === op.id)) continue;
    mudar(lista(op.entidade), [...atuais(op.entidade), op.para] as never);
  }
  for (const op of ops) {
    if (op.tipo !== 'campo' || !Object.hasOwn(LISTA_DA_ENTIDADE, op.entidade)) continue;
    const registos = atuais(op.entidade);
    if (!registos.some((r) => r.id === op.id)) continue;
    mudar(
      lista(op.entidade),
      registos.map((r) => (r.id === op.id ? { ...r, [op.campo]: op.para } : r)) as never,
    );
  }
  return resultado;
}

/** Aplica as operações por ordem, sem alterar o estado recebido. Operações de pessoas/carrinhas que não existem são ignoradas. */
export function aplicarOperacoes(estado: Estado, ops: readonly Operacao[]): Estado {
  if (ops.length === 0) return estado;
  const temM2 = ops.some((op) => op.tipo === 'campo' || op.tipo === 'registo');
  const inicial = temM2 ? aplicarRegistosECampos(estado, ops, 'antes') : estado;
  const porPessoa = new Map<Id, OperacaoMover[]>();
  const condutores = new Map<Id, Id | null>();
  const dormidas = new Map<Id, ChaveDormida | null>();
  for (const op of ops) {
    if (op.tipo === 'condutor') {
      condutores.set(op.carrinhaId, op.para);
      continue;
    }
    if (op.tipo === 'dormida') {
      dormidas.set(op.carrinhaId, op.para);
      continue;
    }
    if (op.tipo !== 'mover') continue;
    const lista = porPessoa.get(op.pessoaId);
    if (lista) lista.push(op);
    else porPessoa.set(op.pessoaId, [op]);
  }
  const final: Estado = {
    ...inicial,
    pessoas:
      porPessoa.size === 0
        ? inicial.pessoas
        : inicial.pessoas.map((p) => {
            const lista = porPessoa.get(p.id);
            return lista ? lista.reduce(aplicarUma, p) : p;
          }),
    carrinhas:
      condutores.size === 0 && dormidas.size === 0
        ? inicial.carrinhas
        : inicial.carrinhas.map((c): Carrinha => {
            let nova = c;
            const condutorId = condutores.get(c.id);
            if (condutorId !== undefined) nova = { ...nova, condutorId };
            const dormida = dormidas.get(c.id);
            if (dormida !== undefined) {
              const lida = dormida === null ? null : lerChaveDormida(dormida);
              nova = {
                ...nova,
                dormeCasaId: lida?.tipo === 'casa' ? lida.id : null,
                dormeLocalId: lida?.tipo === 'local' ? lida.id : null,
              };
            }
            return nova;
          }),
  };
  return temM2 ? aplicarRegistosECampos(final, ops, 'depois') : final;
}

/**
 * Chave de compactação: operações com a mesma chave juntam-se numa só. CONTRATO DO M2: a loja usa-a para
 * saber se as operações de uma reversão ainda estão nos pendentes (senão o lote sai de `reverte`).
 */
export function chaveOperacao(op: Operacao): string {
  switch (op.tipo) {
    case 'condutor':
      return `c\u0000${op.carrinhaId}`;
    case 'dormida':
      return `d\u0000${op.carrinhaId}`;
    case 'mover':
      return `p\u0000${op.pessoaId}\u0000${op.campo}`;
    case 'campo':
      return `f\u0000${op.entidade}\u0000${op.id}\u0000${op.campo}`;
    case 'registo':
      return `r\u0000${op.entidade}\u0000${op.id}`;
  }
}

/** Prefixo das chaves (chaveOperacao) das operações 'campo' de um registo. */
function prefixoCampos(entidade: EntidadeEditavel, id: Id): string {
  return `f\u0000${entidade}\u0000${id}\u0000`;
}

/** Chave (chaveOperacao) da operação 'registo' de um registo. */
function chaveDoRegisto(entidade: EntidadeEditavel, id: Id): string {
  return `r\u0000${entidade}\u0000${id}`;
}

/**
 * Campos que NÃO se dobram no `para` de um registo criado no rascunho, com o valor que um registo acabado de
 * criar tem de ter: a forma de criar recusa-os com outro valor (validarRegisto: problema aberto; pessoa ativa
 * e sem marcas; casa sem "lugares iguais aos moradores"). Ficam como 'campo' a seguir à criação, que o
 * aplicar, o validar e o servidor tratam pelas fases (ex.: abrir e resolver um problema no mesmo rascunho;
 * uma pessoa nova que sai logo da empresa ou fica com a casa a confirmar; o Reverter de uma casa apagada que
 * tinha esses lugares, ou de um problema resolvido apagado com a casa: separarCriacao).
 */
const CAMPOS_FORA_DA_CRIACAO: Readonly<
  Partial<Record<EntidadeEditavel, Readonly<Record<string, ValorCampo>>>>
> = {
  problema: { resolvidoEm: null },
  pessoa: { ativa: true, casaAConfirmar: false, carrinhaAConfirmar: false },
  casa: { sempreCheia: false },
};

function foraDaCriacao(entidade: EntidadeEditavel, campo: string): boolean {
  const campos = CAMPOS_FORA_DA_CRIACAO[entidade];
  return campos !== undefined && Object.hasOwn(campos, campo);
}

/**
 * Criar um registo que já existiu (o Reverter de um apagado) com a forma de um registo novo: os campos de
 * CAMPOS_FORA_DA_CRIACAO que tinham outro valor vão a seguir, como 'campo' (ex.: um problema resolvido volta
 * aberto + "resolvido: — → 06/10/2026"). Sem esses campos, devolve a operação como veio.
 */
export function separarCriacao(op: OperacaoRegisto): Operacao[] {
  const campos = CAMPOS_FORA_DA_CRIACAO[op.entidade];
  if (op.de !== null || op.para === null || !campos) return [op];
  const registo = op.para as unknown as Record<string, ValorCampo>;
  const novo: Record<string, ValorCampo> = { ...registo };
  const depois: Operacao[] = [];
  for (const [campo, valorNovo] of Object.entries(campos)) {
    const valor = registo[campo] ?? null;
    if (valoresIguais(valor, valorNovo)) continue;
    novo[campo] = valorNovo;
    depois.push({
      tipo: 'campo',
      entidade: op.entidade,
      id: op.id,
      campo: campo as CampoEditavel,
      de: valorNovo,
      para: valor,
    });
  }
  return depois.length === 0 ? [op] : [{ ...op, para: novo } as unknown as OperacaoRegisto, ...depois];
}

/**
 * Junta os movimentos da mesma pessoa no mesmo campo num só (o `de` do primeiro, o `para` do último)
 * e tira os que acabam onde começaram. Mantém a ordem da primeira ocorrência. Vale igual para as operações
 * do M2 (mesmo campo do mesmo registo; mesmo registo criado/apagado), com as DOBRAS (docs/m2.md, "Compactar"):
 * - os 'campo' de um registo criado no rascunho entram no `para` do 'registo' (sai um registo já acabado),
 *   menos os de CAMPOS_FORA_DA_CRIACAO, que ficam 'campo' a seguir à criação;
 * - os 'campo' de um registo que depois se apaga entram no `de` do 'registo' (o valor gravado, que é o `de`
 *   do 1.º 'campo' de cada campo) e saem: o servidor compara o `de` com o que está gravado;
 * - criar e apagar o mesmo registo no rascunho não deixa nada (nem os 'campo' dele).
 */
export function compactarOperacoes(ops: readonly Operacao[]): Operacao[] {
  const juntas = new Map<string, Operacao>();
  for (const op of ops) {
    if (op.tipo === 'campo') {
      const chaveRegisto = chaveDoRegisto(op.entidade, op.id);
      const registo = juntas.get(chaveRegisto);
      if (
        registo?.tipo === 'registo' &&
        registo.de === null &&
        registo.para !== null &&
        !foraDaCriacao(op.entidade, op.campo)
      ) {
        juntas.set(chaveRegisto, {
          ...registo,
          para: { ...registo.para, [op.campo]: op.para },
        } as Operacao);
        continue;
      }
    }
    if (op.tipo === 'registo' && op.de !== null && op.para === null) {
      const chave = chaveOperacao(op);
      const anterior = juntas.get(chave);
      // Os campos mudados antes de apagar: o registo gravado tinha o `de` do 1.º 'campo' de cada um.
      let gravado: Record<string, unknown> = { ...op.de };
      const prefixo = prefixoCampos(op.entidade, op.id);
      for (const [k, v] of juntas) {
        if (!k.startsWith(prefixo) || v.tipo !== 'campo') continue;
        gravado = { ...gravado, [v.campo]: v.de };
        juntas.delete(k);
      }
      if (anterior?.tipo === 'registo' && anterior.de === null) {
        // Criado e apagado no mesmo rascunho: não fica nada.
        juntas.delete(chave);
        continue;
      }
      juntas.set(chave, (anterior ? { ...anterior, para: null } : { ...op, de: gravado }) as Operacao);
      continue;
    }
    const chave = chaveOperacao(op);
    const anterior = juntas.get(chave);
    // A chave garante que as duas operações são do mesmo tipo (e o mesmo campo).
    juntas.set(chave, anterior ? ({ ...anterior, para: op.para } as Operacao) : { ...op });
  }
  return [...juntas.values()].filter((op) => !operacaoSemEfeito(op));
}

/** `esperado` = o que a operação esperava encontrar (`de`); `atual` = o que lá está agora. */
export type Conflito =
  | { tipo: 'mover'; pessoaId: Id; campo: CampoMovivel; esperado: Id | null; atual: Id | null }
  | { tipo: 'condutor'; carrinhaId: Id; esperado: Id | null; atual: Id | null }
  | { tipo: 'dormida'; carrinhaId: Id; esperado: ChaveDormida | null; atual: ChaveDormida | null }
  /** M2. `existe` = false quando o registo já não existe (alguém o apagou entretanto). */
  | {
      tipo: 'campo';
      entidade: EntidadeEditavel;
      id: Id;
      campo: CampoEditavel;
      esperado: ValorCampo;
      atual: ValorCampo;
      existe: boolean;
    }
  /** M2. Criar: `esperado` null e `atual` o registo que já lá está. Apagar: o registo esperado e o atual (null = já não existe). */
  | {
      tipo: 'registo';
      entidade: EntidadeCriavel;
      id: Id;
      esperado: RegistoCriavel | null;
      atual: RegistoCriavel | null;
    };

/**
 * Operações cujo `de` já não corresponde ao estado (alguém mudou entretanto).
 * M2: 'campo' compara o valor atual com o `de` (e dá conflito se o registo já não existir, a não ser que seja
 * criado no mesmo lote); 'registo' de criar dá conflito se o id já existir; de apagar, se o registo mudou ou
 * já não existe. Os registos são comparados pelo conteúdo (valoresIguais: a ordem das chaves não conta).
 */
export function encontrarConflitos(estado: Estado, ops: readonly Operacao[]): Conflito[] {
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const carrinhas = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const criados = new Set(
    ops.flatMap((op) => (op.tipo === 'registo' && op.de === null ? [`${op.entidade}:${op.id}`] : [])),
  );
  const conflitos: Conflito[] = [];
  for (const op of ops) {
    if (op.tipo === 'campo') {
      if (criados.has(`${op.entidade}:${op.id}`)) continue;
      const registo = encontrarRegisto(estado, op.entidade, op.id) as Record<string, ValorCampo> | undefined;
      const atual = registo ? (registo[op.campo] ?? null) : null;
      if (!registo || !valoresIguais(atual, op.de)) {
        conflitos.push({
          tipo: 'campo',
          entidade: op.entidade,
          id: op.id,
          campo: op.campo,
          esperado: op.de,
          atual,
          existe: registo !== undefined,
        });
      }
      continue;
    }
    if (op.tipo === 'registo') {
      const atual = (encontrarRegisto(estado, op.entidade, op.id) ?? null) as RegistoCriavel | null;
      const mudou = op.de === null ? atual !== null : !valoresIguais(atual, op.de);
      if (mudou)
        conflitos.push({ tipo: 'registo', entidade: op.entidade, id: op.id, esperado: op.de, atual });
      continue;
    }
    if (op.tipo === 'dormida') {
      const c = carrinhas.get(op.carrinhaId);
      if (c && chaveDormida(c) !== op.de) {
        conflitos.push({
          tipo: 'dormida',
          carrinhaId: op.carrinhaId,
          esperado: op.de,
          atual: chaveDormida(c),
        });
      }
      continue;
    }
    if (op.tipo === 'condutor') {
      const c = carrinhas.get(op.carrinhaId);
      if (c && c.condutorId !== op.de) {
        conflitos.push({ tipo: 'condutor', carrinhaId: op.carrinhaId, esperado: op.de, atual: c.condutorId });
      }
      continue;
    }
    const p = pessoas.get(op.pessoaId);
    if (!p) continue;
    if (p[op.campo] !== op.de) {
      conflitos.push({
        tipo: 'mover',
        pessoaId: op.pessoaId,
        campo: op.campo,
        esperado: op.de,
        atual: p[op.campo],
      });
    }
  }
  return conflitos;
}

/** "A casa", "O problema"…: o registo de que se fala quando já não se sabe o nome. */
const ARTIGO_ENTIDADE: Readonly<Record<EntidadeEditavel, string>> = {
  pessoa: 'A pessoa',
  casa: 'A casa',
  carrinha: 'A carrinha',
  obra: 'A obra',
  local: 'A morada',
  indisponibilidade: 'O período de indisponibilidade',
  problema: 'O problema',
};

type Mexidos = { [E in EntidadeEditavel]: Set<Id> };

function semMexidos(): Mexidos {
  return {
    pessoa: new Set(),
    casa: new Set(),
    carrinha: new Set(),
    obra: new Set(),
    local: new Set(),
    indisponibilidade: new Set(),
    problema: new Set(),
  };
}

/** "2026-10-06" → "06/10/2026"; null → "—". */
function dia(valor: unknown): string {
  return typeof valor === 'string' ? formatarDiaCompleto(valor) : '—';
}

/**
 * Erros (frases prontas a mostrar, com nomes e não ids) que impedem gravar as operações. Lista vazia =
 * válido. É a mesma no browser e no servidor (que a corre sobre o estado COMPLETO, com os períodos e os
 * problemas antigos). Vê:
 * - cada valor (validarValorCampo) e a forma de cada registo criado (validarRegisto); o id novo não existe;
 *   só se criam ENTIDADES_CRIAVEIS e só se apagam ENTIDADES_APAGAVEIS;
 * - no estado FINAL (aplicarOperacoes, com os registos criados no mesmo lote): as referências (cliente,
 *   local, estacionamento, casa/carrinha do problema, pessoa do período, destinos de 'mover', condutor,
 *   onde dorme); o `ativa` de quem é movido ou passa a conduzir (depois dos 'campo': "Voltou à empresa" +
 *   pôr numa casa no mesmo lote é válido);
 * - só nos registos mexidos ('campo' e criados): nome no mapa (sem acentos nem maiúsculas) entre TODAS as
 *   pessoas, nº, matrícula e nome da casa únicos; períodos da mesma pessoa sem sobreposição e fim ≥ início;
 *   resolvido ≥ aberto; tolerado ≥ máx. do contrato; sem carta (ou "não sei") não há validade;
 * - a casa criada ou mudada de morada fica num local do tipo 'casa';
 * - apagar: a obra sem pessoas no fim; a casa sem moradores, sem carrinhas a dormir lá e sem problemas por
 *   resolver (errosApagarCasa); o local só se foi criado no programa e sem nada que o use;
 * - quem sai da empresa fica sem casa, carrinha, obra e sem conduzir; e a regra do condutor de sempre (o
 *   condutor de cada carrinha mexida vai nela), vista só quando o resto está certo.
 */
export function validarOperacoes(estado: Estado, ops: readonly Operacao[]): string[] {
  const final = aplicarOperacoes(estado, ops);
  /** O nome do registo: no estado final (os criados) ou no de partida (os apagados). */
  const nome = (entidade: EntidadeEditavel, id: Id): string =>
    encontrarRegisto(final, entidade, id)
      ? nomeDoRegisto(final, entidade, id)
      : encontrarRegisto(estado, entidade, id)
        ? nomeDoRegisto(estado, entidade, id)
        : ARTIGO_ENTIDADE[entidade];
  const pessoasFinal = new Map(final.pessoas.map((p) => [p.id, p]));
  const carrinhasIniciais = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const existeNoFim: Record<CampoMovivel, Set<Id>> = {
    casaId: new Set(final.casas.map((c) => c.id)),
    carrinhaId: new Set(final.carrinhas.map((c) => c.id)),
    obraId: new Set(final.obras.map((o) => o.id)),
  };
  const erros: string[] = [];
  const mexidos = semMexidos();
  const criados = new Set<string>();
  const apagados: OperacaoRegisto[] = [];
  const carrinhasMexidas = new Set<Id>();
  /** Quem passa a ativa = false neste lote ("Saiu da empresa"). */
  const saidas = new Set<Id>();
  /** "entidade:id:campo" dos 'campo' do lote. */
  const camposMexidos = new Set<string>();

  for (const op of ops) {
    if (op.tipo === 'campo') {
      if (op.entidade === 'pessoa' && op.campo === 'ativa' && op.para === false) saidas.add(op.id);
      if (!eEntidadeEditavel(op.entidade) || !eCampoEditavel(op.entidade, op.campo)) {
        erros.push(`O campo ${String(op.campo)} não se pode mudar no programa.`);
        continue;
      }
      const erro = validarValorCampo(op.entidade, op.campo, op.para);
      if (erro) erros.push(`${nome(op.entidade, op.id)} — ${erro}`);
      if (!encontrarRegisto(final, op.entidade, op.id) && !encontrarRegisto(estado, op.entidade, op.id)) {
        erros.push(`${ARTIGO_ENTIDADE[op.entidade]} que estavas a mudar já não existe.`);
        continue;
      }
      mexidos[op.entidade].add(op.id);
      camposMexidos.add(`${op.entidade}:${op.id}:${op.campo}`);
      continue;
    }
    if (op.tipo === 'registo') {
      const { entidade } = op;
      if (op.de === null && op.para !== null) {
        const quem = nomeDeRegisto(final, entidade, op.para as unknown as Record<string, unknown>);
        if (!(ENTIDADES_CRIAVEIS as readonly string[]).includes(entidade)) {
          erros.push(`${quem} — não se cria no programa.`);
          continue;
        }
        for (const e of validarRegisto(entidade, op.para)) erros.push(`${quem} — ${e}`);
        const chave = `${entidade}:${op.id}`;
        if (op.para.id !== op.id) erros.push(`${quem} — registo inválido (o identificador não bate certo).`);
        else if (encontrarRegisto(estado, entidade, op.id) || criados.has(chave)) {
          erros.push(`${quem} — já existe (identificador repetido).`);
        }
        criados.add(chave);
        mexidos[entidade].add(op.id);
        continue;
      }
      if (op.de !== null && op.para === null) {
        const quem = nome(entidade, op.id);
        if (!(ENTIDADES_APAGAVEIS as readonly string[]).includes(entidade)) {
          erros.push(
            entidade === 'pessoa'
              ? `${quem} — uma pessoa não se apaga: usa "Saiu da empresa".`
              : `${quem} — não se apaga no programa.`,
          );
          continue;
        }
        const atual = encontrarRegisto(estado, entidade, op.id);
        if (!atual) {
          erros.push(`${ARTIGO_ENTIDADE[entidade]} que querias apagar já não existe.`);
          continue;
        }
        if (entidade === 'local' && !localCriadoNoPrograma(atual as Local)) {
          erros.push(`${quem} — esta morada veio dos dados iniciais e não se apaga no programa.`);
          continue;
        }
        apagados.push(op);
        continue;
      }
      erros.push(`${nome(entidade, op.id)} — um registo cria-se ou apaga-se (não as duas coisas).`);
      continue;
    }
    if (op.tipo === 'dormida') {
      if (!carrinhasIniciais.has(op.carrinhaId)) erros.push(`A carrinha ${op.carrinhaId} não existe.`);
      if (op.para !== null) {
        const lida = lerChaveDormida(op.para);
        const existe =
          lida &&
          (lida.tipo === 'casa'
            ? final.casas.some((c) => c.id === lida.id)
            : final.locais.some((l) => l.id === lida.id));
        if (!existe) {
          const carrinha = carrinhasIniciais.get(op.carrinhaId);
          const quem = carrinha ? formatarMatricula(carrinha.matricula) : op.carrinhaId;
          erros.push(`${quem} — o sítio onde dormir escolhido já não existe.`);
        }
      }
      continue;
    }
    if (op.tipo === 'condutor') {
      if (!carrinhasIniciais.has(op.carrinhaId)) {
        erros.push(`A carrinha ${op.carrinhaId} não existe.`);
        continue;
      }
      carrinhasMexidas.add(op.carrinhaId);
      if (op.para !== null) {
        const c = pessoasFinal.get(op.para);
        if (!c) erros.push(`A pessoa ${op.para} não existe.`);
        else if (!c.ativa) erros.push(`${c.nomeCurto} não está ativa.`);
      }
      continue;
    }
    if (op.campo === 'carrinhaId') {
      if (op.de) carrinhasMexidas.add(op.de);
      if (op.para) carrinhasMexidas.add(op.para);
    }
    const p = pessoasFinal.get(op.pessoaId);
    if (!p) {
      erros.push(`A pessoa ${op.pessoaId} não existe.`);
      continue;
    }
    // O `ativa` vê-se depois dos 'campo' do lote: tirar alguém que saiu da empresa (para null) é sempre válido.
    if (op.para !== null && !p.ativa) erros.push(`${p.nomeCurto} não está ativa.`);
    if (op.para !== null && !existeNoFim[op.campo].has(op.para)) {
      // As carrinhas não se apagam no programa: um id que não existe só vem de um pedido feito à mão.
      erros.push(
        op.campo === 'carrinhaId'
          ? `${p.nomeCurto}: o destino ${op.para} não existe.`
          : `${p.nomeCurto}: ${DESTINO_QUE_NAO_EXISTE[op.campo]}`,
      );
    }
  }

  /** O registo foi criado no lote, ou algum destes campos mudou. */
  const mudou = (entidade: EntidadeEditavel, id: Id, ...campos: string[]) =>
    criados.has(`${entidade}:${id}`) || campos.some((c) => camposMexidos.has(`${entidade}:${id}:${c}`));
  erros.push(...errosDosRegistos(final, mexidos, mudou, saidas, apagados, nome));

  // Quem sai da empresa deixa de conduzir: a carrinha que conduzia conta como mexida.
  for (const id of saidas) {
    for (const c of final.carrinhas) if (c.condutorId === id) carrinhasMexidas.add(c.id);
  }

  if (erros.length > 0 || carrinhasMexidas.size === 0) return erros;
  for (const c of final.carrinhas) {
    if (!carrinhasMexidas.has(c.id) || c.condutorId === null) continue;
    const condutor = pessoasFinal.get(c.condutorId);
    if (!condutor || condutor.carrinhaId !== c.id || !condutor.ativa) {
      erros.push(
        `${condutor?.nomeCurto ?? c.condutorId} não vai na carrinha ${formatarMatricula(c.matricula)}: não pode ser o condutor.`,
      );
    }
  }
  return erros;
}

/**
 * Referências, unicidade, datas e apagados dos registos mexidos, no estado final. Cada regra só olha para os
 * registos criados no lote ou cujos campos dessa regra mudaram (dados antigos incoerentes não bloqueiam outra
 * mudança na mesma ficha).
 */
function errosDosRegistos(
  final: Estado,
  mexidos: Mexidos,
  mudou: (entidade: EntidadeEditavel, id: Id, ...campos: string[]) => boolean,
  saidas: ReadonlySet<Id>,
  apagados: readonly OperacaoRegisto[],
  nome: (entidade: EntidadeEditavel, id: Id) => string,
): string[] {
  const erros: string[] = [];
  const ids = <T extends { id: Id }>(lista: readonly T[]) => new Set(lista.map((x) => x.id));
  const clientes = ids(final.clientes);
  const locais = ids(final.locais);
  const casas = ids(final.casas);
  const carrinhas = ids(final.carrinhas);
  const pessoas = ids(final.pessoas);
  const mexido = <E extends EntidadeEditavel>(entidade: E): RegistosEditaveis[E][] =>
    registosDe(final, entidade).filter((r) => mexidos[entidade].has(r.id));

  // --- Pessoas -------------------------------------------------------------------------------------
  const nomesCurtos = new Map<string, Pessoa[]>();
  const numeros = new Map<string, Pessoa[]>();
  for (const p of final.pessoas) {
    juntar(nomesCurtos, normalizarTexto(p.nomeCurto ?? ''), p);
    if (p.numero) juntar(numeros, normalizarTexto(p.numero), p);
  }
  for (const p of mexido('pessoa')) {
    if (mudou('pessoa', p.id, 'clienteId') && !clientes.has(p.clienteId)) {
      erros.push(`${p.nomeCurto} — o cliente escolhido não existe.`);
    }
    const outroNome = mudou('pessoa', p.id, 'nomeCurto')
      ? nomesCurtos.get(normalizarTexto(p.nomeCurto ?? ''))?.find((x) => x.id !== p.id)
      : undefined;
    if (outroNome) {
      erros.push(`${p.nomeCurto} — nome no mapa repetido: já há outra pessoa com «${outroNome.nomeCurto}».`);
    }
    const outroNumero =
      p.numero && mudou('pessoa', p.id, 'numero')
        ? numeros.get(normalizarTexto(p.numero))?.find((x) => x.id !== p.id)
        : undefined;
    if (outroNumero) erros.push(`${p.nomeCurto} — o nº ${p.numero} já é de ${outroNumero.nomeCurto}.`);
    if (
      mudou('pessoa', p.id, 'temCarta', 'cartaValidade') &&
      p.temCarta !== true &&
      p.cartaValidade !== null
    ) {
      erros.push(`${p.nomeCurto} — sem carta (ou sem saber) não há validade da carta.`);
    }
    if (saidas.has(p.id) && !p.ativa) {
      if (p.casaId !== null || p.carrinhaId !== null || p.obraId !== null) {
        erros.push(`${p.nomeCurto} — quem sai da empresa sai também da casa, da carrinha e da obra.`);
      }
      const conduz = final.carrinhas.find((c) => c.condutorId === p.id);
      if (conduz) {
        erros.push(
          `${p.nomeCurto} — quem sai da empresa deixa de conduzir a ${formatarMatricula(conduz.matricula)}.`,
        );
      }
    }
  }

  // --- Casas e carrinhas ---------------------------------------------------------------------------
  const nomesCasas = new Map<string, Casa[]>();
  for (const c of final.casas) juntar(nomesCasas, normalizarTexto(c.nome ?? ''), c);
  const tipoDoLocal = new Map(final.locais.map((l) => [l.id, l.tipo]));
  for (const c of mexido('casa')) {
    if (mudou('casa', c.id, 'localId') && !locais.has(c.localId)) {
      erros.push(`${c.nome} — a morada escolhida não existe.`);
    } else if (mudou('casa', c.id, 'localId') && tipoDoLocal.get(c.localId) !== 'casa') {
      // Uma casa só num local de casas (a interface só oferece esses): senão o local de uma obra ou de um
      // estacionamento passava a ser "usado" pela casa, ou saía com ela.
      erros.push(`${c.nome} — a morada escolhida não é de casas.`);
    }
    if (mudou('casa', c.id, 'nome') && (nomesCasas.get(normalizarTexto(c.nome ?? ''))?.length ?? 0) > 1) {
      erros.push(`${c.nome} — já há outra casa com este nome.`);
    }
    const contrato = mudou('casa', c.id, 'maxContrato', 'tolerado');
    if (contrato && c.maxContrato !== null && c.tolerado !== null && c.tolerado < c.maxContrato) {
      erros.push(
        `${c.nome} — o tolerado (${c.tolerado}) não pode ser menor do que o máx. do contrato (${c.maxContrato}).`,
      );
    }
  }
  const matriculas = new Map<string, Carrinha[]>();
  for (const c of final.carrinhas) juntar(matriculas, chaveMatricula(c.matricula ?? ''), c);
  // As outras matrículas também encontram o veículo (pesquisa, Mover para…): não podem ser de outro.
  const alternativas = new Map<string, Carrinha[]>();
  for (const c of final.carrinhas) {
    for (const m of new Set((c.matriculasAlternativas ?? []).map(chaveMatricula))) juntar(alternativas, m, c);
  }
  const deOutro = (chave: string, id: Id): Carrinha | undefined =>
    [...(matriculas.get(chave) ?? []), ...(alternativas.get(chave) ?? [])].find((o) => o.id !== id);
  for (const c of mexido('carrinha')) {
    if (mudou('carrinha', c.id, 'matricula') && deOutro(chaveMatricula(c.matricula), c.id)) {
      erros.push(`${formatarMatricula(c.matricula)} — já há outro veículo com esta matrícula.`);
    }
    if (mudou('carrinha', c.id, 'matriculasAlternativas')) {
      const vistas = new Set<string>();
      for (const m of c.matriculasAlternativas ?? []) {
        const chave = chaveMatricula(m);
        const outro = deOutro(chave, c.id);
        // As repetidas na própria lista já as recusa o validarValorCampo.
        if (vistas.has(chave)) continue;
        if (chave === chaveMatricula(c.matricula)) {
          erros.push(
            `${formatarMatricula(c.matricula)} — ${formatarMatricula(m)} já é a matrícula principal deste veículo.`,
          );
        } else if (outro) {
          erros.push(
            `${formatarMatricula(c.matricula)} — ${formatarMatricula(m)} já é de outro veículo (${formatarMatricula(outro.matricula)}).`,
          );
        }
        vistas.add(chave);
      }
    }
  }

  // --- Obras, problemas e períodos -----------------------------------------------------------------
  for (const o of mexido('obra')) {
    if (mudou('obra', o.id, 'clienteId') && !clientes.has(o.clienteId)) {
      erros.push(`${o.nome} — o cliente escolhido não existe.`);
    }
    if (mudou('obra', o.id, 'localId') && !locais.has(o.localId)) {
      erros.push(`${o.nome} — a morada escolhida não existe.`);
    }
    const estacionamento = o.estacionamentoLocalId;
    if (
      mudou('obra', o.id, 'estacionamentoLocalId') &&
      estacionamento !== null &&
      !locais.has(estacionamento)
    ) {
      erros.push(`${o.nome} — o estacionamento escolhido não existe.`);
    }
  }
  for (const p of mexido('problema')) {
    const alvoExiste =
      p.casaId !== null ? casas.has(p.casaId) : p.carrinhaId !== null && carrinhas.has(p.carrinhaId);
    if (mudou('problema', p.id) && !alvoExiste)
      erros.push('O problema é de uma casa ou carrinha que não existe.');
    if (p.resolvidoEm !== null && p.resolvidoEm < p.abertoEm) {
      erros.push(
        `${nome('problema', p.id)} — o problema não pode ficar resolvido (${dia(p.resolvidoEm)}) antes de ser aberto (${dia(p.abertoEm)}).`,
      );
    }
  }
  const pessoasComPeriodos = new Set<Id>();
  for (const periodo of mexido('indisponibilidade')) {
    if (!pessoas.has(periodo.pessoaId)) {
      erros.push('O período de indisponibilidade é de uma pessoa que não existe.');
      continue;
    }
    if (periodo.fim !== null && periodo.fim < periodo.inicio) {
      erros.push(
        `${nome('indisponibilidade', periodo.id)} — o período acaba (${dia(periodo.fim)}) antes de começar (${dia(periodo.inicio)}).`,
      );
    }
    pessoasComPeriodos.add(periodo.pessoaId);
  }
  for (const pessoaId of pessoasComPeriodos) {
    const periodos = final.indisponibilidades.filter((x) => x.pessoaId === pessoaId);
    for (const [i, a] of periodos.entries()) {
      for (const b of periodos.slice(i + 1)) {
        if (!mexidos.indisponibilidade.has(a.id) && !mexidos.indisponibilidade.has(b.id)) continue;
        if (!sobrepoem(a, b)) continue;
        const [velho, novo] = mexidos.indisponibilidade.has(b.id) ? [a, b] : [b, a];
        erros.push(
          `${nome('indisponibilidade', novo.id)} — já está indisponível ${textoDoPeriodo(velho)}: os períodos não se podem sobrepor.`,
        );
      }
    }
  }

  // --- Apagados --------------------------------------------------------------------------------------
  for (const op of apagados) {
    const quem = nome(op.entidade, op.id);
    if (op.entidade === 'obra') {
      const n = final.pessoas.filter((p) => p.obraId === op.id).length;
      if (n > 0) {
        erros.push(
          `${quem} — ainda tem ${n === 1 ? '1 pessoa' : `${n} pessoas`}: muda-as para outra obra antes de a apagar.`,
        );
      }
    } else if (op.entidade === 'casa') {
      erros.push(...errosApagarCasa(final, op.id, quem));
    } else if (op.entidade === 'local') {
      const usos = [
        ...final.casas.filter((c) => c.localId === op.id).map((c) => c.nome),
        ...final.obras
          .filter((o) => o.localId === op.id || o.estacionamentoLocalId === op.id)
          .map((o) => o.nome),
        ...final.carrinhas
          .filter((c) => c.dormeLocalId === op.id)
          .map((c) => `${formatarMatricula(c.matricula)} (dorme lá)`),
      ];
      if (usos.length > 0)
        erros.push(`${quem} — esta morada ainda é usada por ${usos.join(', ')}: não se apaga.`);
    }
  }
  return erros;
}

/**
 * O que impede apagar uma casa, no estado final do lote: moradores (também quem saiu da empresa e ainda a
 * tivesse), carrinhas que lá dormem (o que está gravado; a sugestão não conta) e problemas por resolver. Os
 * problemas resolvidos não impedem: o servidor apaga-os antes da casa (chave estrangeira; ficam no histórico).
 */
function errosApagarCasa(final: Estado, casaId: Id, quem: string): string[] {
  const erros: string[] = [];
  const moradores = final.pessoas.filter((p) => p.casaId === casaId).length;
  if (moradores > 0) {
    erros.push(
      `${quem} — ainda tem ${moradores === 1 ? '1 morador' : `${moradores} moradores`}: muda-os para outra casa (ou para "Fora das casas CMF") antes de a apagar.`,
    );
  }
  const dormem = final.carrinhas
    .filter((c) => c.dormeCasaId === casaId)
    .map((c) => formatarMatricula(c.matricula));
  if (dormem.length > 0) {
    erros.push(
      `${quem} — ${dormem.length === 1 ? `a ${dormem[0]} dorme lá` : `as carrinhas ${listaComE(dormem)} dormem lá`}: muda onde dorme antes de a apagar.`,
    );
  }
  const abertos = final.problemas.filter((p) => p.casaId === casaId && p.resolvidoEm === null).length;
  if (abertos > 0) {
    erros.push(
      `${quem} — tem ${abertos === 1 ? '1 problema por resolver: resolve-o' : `${abertos} problemas por resolver: resolve-os`} antes de a apagar.`,
    );
  }
  return erros;
}

/** "A, B e C". */
function listaComE(itens: readonly string[]): string {
  return itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

/** Dois períodos têm pelo menos um dia em comum (o mesmo que periodosSobrepoem, em indisponibilidade.ts). */
function sobrepoem(a: Indisponibilidade, b: Indisponibilidade): boolean {
  return a.inicio <= (b.fim ?? '9999-12-31') && b.inicio <= (a.fim ?? '9999-12-31');
}

function juntar<T>(mapa: Map<string, T[]>, chave: string, valor: T): void {
  const lista = mapa.get(chave);
  if (lista) lista.push(valor);
  else mapa.set(chave, [valor]);
}

/** "de 06/10/2026 a 10/10/2026", "a 06/10/2026", "a partir de 06/10/2026 (sem data de regresso)". */
function textoDoPeriodo(p: Pick<Indisponibilidade, 'inicio' | 'fim'>): string {
  if (p.fim === null) return `a partir de ${dia(p.inicio)} (sem data de regresso)`;
  if (p.fim === p.inicio) return `a ${dia(p.inicio)}`;
  return `de ${dia(p.inicio)} a ${dia(p.fim)}`;
}

const NOME_CAMPO: Record<CampoMovivel, string> = { casaId: 'casa', carrinhaId: 'carrinha', obraId: 'obra' };

/**
 * Uma casa ou obra que já não está no estado (apagada entretanto, por outra pessoa ou noutro passo): as frases
 * dizem isto em vez do id ("casa-1b2c…"). O servidor, nos conflitos, junta ao estado as apagadas com o nome
 * que tinham (lotes.ts), e aí a frase diz o nome.
 */
export const CASA_APAGADA = 'uma casa apagada';
export const OBRA_APAGADA = 'uma obra apagada';

/** validarOperacoes: o destino de um 'mover' não existe no fim (uma casa ou obra apagada entretanto). */
const DESTINO_QUE_NAO_EXISTE: Record<'casaId' | 'obraId', string> = {
  casaId: 'a casa escolhida já não existe.',
  obraId: 'a obra escolhida já não existe.',
};

export function nomeDoValor(estado: Estado, campo: CampoMovivel, valor: Id | null): string {
  if (campo === 'casaId') {
    return valor === null
      ? 'Fora das casas CMF'
      : (estado.casas.find((c) => c.id === valor)?.nome ?? CASA_APAGADA);
  }
  if (campo === 'carrinhaId') {
    if (valor === null) return 'Sem transporte da empresa';
    const carrinha = estado.carrinhas.find((c) => c.id === valor);
    return carrinha ? formatarMatricula(carrinha.matricula) : valor;
  }
  return valor === null ? 'sem obra' : (estado.obras.find((o) => o.id === valor)?.nome ?? OBRA_APAGADA);
}

function nomePessoa(estado: Estado, id: Id | null): string {
  if (id === null) return 'sem condutor';
  return estado.pessoas.find((p) => p.id === id)?.nomeCurto ?? id;
}

/** Nome do sítio onde a carrinha dorme ("por definir" quando não está definido). */
export function nomeDaDormida(estado: Estado, chave: ChaveDormida | null): string {
  if (chave === null) return 'por definir';
  const lida = lerChaveDormida(chave);
  if (!lida) return chave;
  if (lida.tipo === 'casa') return estado.casas.find((c) => c.id === lida.id)?.nome ?? CASA_APAGADA;
  return estado.locais.find((l) => l.id === lida.id)?.nome ?? lida.id;
}

/**
 * O nome de um registo para as frases (mesmo um que já não está no estado, ex.: apagado): pessoa → nome no
 * mapa; casa e obra → nome; carrinha → matrícula formatada; local → a obra que o usa (ou o estacionamento
 * dela), senão a casa, senão o nome do local; indisponibilidade → a pessoa; problema → a casa ou a matrícula.
 */
export function nomeDeRegisto(
  estado: Estado,
  entidade: EntidadeEditavel,
  registo: Readonly<Record<string, unknown>>,
): string {
  const texto = (v: unknown, omissao: string) => (typeof v === 'string' && v !== '' ? v : omissao);
  const id = texto(registo.id, '?');
  switch (entidade) {
    case 'pessoa':
      return texto(registo.nomeCurto, id);
    case 'carrinha':
      return formatarMatricula(texto(registo.matricula, id));
    case 'casa':
    case 'obra':
      return texto(registo.nome, id);
    case 'local': {
      const obra =
        estado.obras.find((o) => o.localId === id) ??
        estado.obras.find((o) => o.estacionamentoLocalId === id);
      if (obra) return obra.nome;
      const casas = estado.casas.filter((c) => c.localId === id);
      // Uma morada partilhada (Himeling: 4 casas) diz-se pelo local, para a frase não parecer de uma só casa.
      if (casas.length > 1) {
        const nomeLocal = estado.locais.find((l) => l.id === id)?.nome ?? texto(registo.nome, '');
        return nomeLocal ? `${nomeLocal} (${casas.length} casas)` : casas.map((c) => c.nome).join(', ');
      }
      return casas[0]?.nome ?? texto(registo.nome, id);
    }
    case 'indisponibilidade': {
      const pessoaId = texto(registo.pessoaId, '');
      return estado.pessoas.find((p) => p.id === pessoaId)?.nomeCurto ?? (pessoaId || id);
    }
    case 'problema': {
      if (typeof registo.casaId === 'string') {
        return estado.casas.find((c) => c.id === registo.casaId)?.nome ?? registo.casaId;
      }
      if (typeof registo.carrinhaId === 'string') {
        const carrinha = estado.carrinhas.find((c) => c.id === registo.carrinhaId);
        return formatarMatricula(carrinha?.matricula ?? registo.carrinhaId);
      }
      return id;
    }
  }
}

/**
 * Quem é o registo de uma operação do M2, para as frases ("Ana T.", "Casa Um", "CF 5001", "Obra X"): ver
 * nomeDeRegisto. O id quando o registo não está no estado.
 */
export function nomeDoRegisto(estado: Estado, entidade: EntidadeEditavel, id: Id): string {
  const r = encontrarRegisto(estado, entidade, id);
  return r ? nomeDeRegisto(estado, entidade, r as unknown as Record<string, unknown>) : id;
}

/** A morada de um local para as frases ("Rue X, Luxembourg"; o nome quando não tem morada). */
function moradaDoLocal(estado: Estado, id: unknown): string {
  if (typeof id !== 'string') return '—';
  const local = estado.locais.find((l) => l.id === id);
  if (!local) return id;
  return local.morada.trim() || local.nome;
}

/**
 * O que se diz quando ainda não se sabe (a carta desconhecida, temCarta null): o mesmo texto na ficha, no
 * Histórico e no Guardar.
 */
export const SEM_DADOS_AINDA = 'sem dados ainda';

/**
 * A carta com as palavras da ficha (o Rafael, 05/10/2026: a ficha dizia "Tem"/"Não tem" e o Guardar e o
 * Histórico "sim"/"não"): "Tem", "Não tem" ou "sem dados ainda".
 */
export const TEXTO_CARTA = { tem: 'Tem', naoTem: 'Não tem' } as const;

/**
 * Um valor de um campo, legível: "—", sim/não (a carta como na ficha: "Tem", "Não tem", "sem dados
 * ainda"), dias dd/mm/aaaa, matrículas, nomes em vez de ids.
 */
export function valorLegivel(
  estado: Estado,
  entidade: EntidadeEditavel,
  campo: string,
  v: ValorCampo,
): string {
  if (campo === 'temCarta')
    return v === true ? TEXTO_CARTA.tem : v === false ? TEXTO_CARTA.naoTem : SEM_DADOS_AINDA;
  if (campo === 'fim' && entidade === 'indisponibilidade' && v === null) return 'sem data de regresso';
  if (campo === 'estacionamentoLocalId' && v === null) return 'sem estacionamento';
  if (v === null || v === '') return '—';
  if (v === true) return 'sim';
  if (v === false) return 'não';
  if (Array.isArray(v)) return v.length > 0 ? v.map((m) => formatarMatricula(String(m))).join(', ') : '—';
  if (campo === 'clienteId') return estado.clientes.find((c) => c.id === v)?.nome ?? String(v);
  if (campo === 'localId' || campo === 'estacionamentoLocalId') return moradaDoLocal(estado, v);
  if (campo === 'matricula') return formatarMatricula(String(v));
  if (['cartaValidade', 'inicio', 'fim', 'resolvidoEm', 'abertoEm'].includes(campo)) return dia(v);
  if (typeof v === 'number') return String(v).replace('.', ',');
  return String(v);
}

/** A frase de uma operação 'campo' (sem o "quem — "). */
function fraseDoCampo(estado: Estado, op: OperacaoCampo): string {
  const { entidade, campo, de, para } = op;
  if (entidade === 'pessoa' && campo === 'ativa')
    return para === false ? 'saiu da empresa' : 'voltou à empresa';
  if (entidade === 'pessoa' && (campo === 'casaAConfirmar' || campo === 'carrinhaAConfirmar')) {
    const qual = campo === 'casaAConfirmar' ? 'casa' : 'carrinha';
    return para === true ? `${qual} a confirmar` : `${qual} confirmada`;
  }
  if (entidade === 'local' && (campo === 'lat' || campo === 'lng')) return 'pino mudado de sítio';
  if (entidade === 'problema') {
    const problema = encontrarRegisto(estado, 'problema', op.id);
    const texto = `«${problema?.texto ?? '…'}»`;
    if (campo === 'texto') return `problema: «${String(de ?? '')}» → «${String(para ?? '')}»`;
    if (de === null && para !== null) return `problema resolvido: ${texto}`;
    if (de !== null && para === null) return `problema reaberto: ${texto}`;
  }
  const rotulo = (ROTULO_CAMPO[entidade] as Record<string, string>)[campo] ?? campo;
  return `${rotulo}: ${valorLegivel(estado, entidade, campo, de)} → ${valorLegivel(estado, entidade, campo, para)}`;
}

/** A frase de uma operação 'registo' (sem o "quem — "). */
function fraseDoRegisto(estado: Estado, op: OperacaoRegisto): string {
  const criado = op.de === null;
  const r = (op.para ?? op.de) as unknown as Record<string, unknown> | null;
  if (!r) return 'sem mudança';
  switch (op.entidade) {
    case 'pessoa': {
      const cliente = estado.clientes.find((c) => c.id === r.clienteId)?.nome;
      return criado ? `entrou${cliente ? ` (${cliente})` : ''}` : 'apagada';
    }
    case 'casa': {
      if (!criado) return 'apagada';
      const local = estado.locais.find((l) => l.id === r.localId);
      // Uma morada nova escolhida só com o pino (o serviço de moradas não respondeu) não tem texto.
      if (local && !local.morada.trim()) return 'criada (só o sítio no mapa)';
      const morada = moradaDoLocal(estado, r.localId);
      return morada !== '—' ? `criada (${morada})` : 'criada';
    }
    case 'obra': {
      if (!criado) return 'apagada';
      const partes = [
        estado.clientes.find((c) => c.id === r.clienteId)?.nome,
        moradaDoLocal(estado, r.localId),
      ].filter((x) => x && x !== '—');
      return partes.length > 0 ? `criada (${partes.join(', ')})` : 'criada';
    }
    case 'local': {
      const qual = r.tipo === 'estacionamento' ? 'estacionamento' : 'local';
      if (!criado) return `${qual} apagado`;
      const morada = typeof r.morada === 'string' && r.morada.trim() ? r.morada.trim() : 'sem morada';
      return `${qual} criado: ${morada}`;
    }
    case 'indisponibilidade':
      return criado
        ? `indisponível ${textoDoPeriodo(r as unknown as Indisponibilidade)}`
        : 'período de indisponibilidade apagado';
    case 'problema':
      return `problema ${criado ? 'aberto' : 'apagado'}: «${String(r.texto ?? '')}»`;
  }
}

/**
 * A frase do histórico de uma operação, sempre "quem — o quê", com os nomes do estado:
 * "Ana Exemplo — casa: Casa A → Casa B"; "ZZ 1001 — condutor: sem condutor → Ana Exemplo";
 * "ZZ 1001 — onde dorme: por definir → Casa A"; "Casa Um — lotação: 8 → 9"; "Ana T. — telefone: — → 691";
 * "Ana T. — saiu da empresa"; "Ana T. — casa confirmada"; "Ana T. — entrou (Costantini)";
 * "Ana T. — indisponível de 06/10/2026 a 10/10/2026"; "Ana T. — indisponível até: 10/10/2026 → 08/10/2026";
 * "Casa Um — problema aberto: «esquentador avariado»"; "Obra Nova — criada (Costantini, Rue X)";
 * "Obra Nova — pino mudado de sítio"; "Obra Nova — apagada"; "Casa Nova — criada (Rue X, Luxembourg)";
 * "Casa Nova — apagada" (docs/m2.md, "Frases do histórico").
 */
export function descreverOperacao(estado: Estado, op: Operacao): string {
  if (op.tipo === 'campo') {
    return `${nomeDoRegisto(estado, op.entidade, op.id)} — ${fraseDoCampo(estado, op)}`;
  }
  if (op.tipo === 'registo') {
    const r = (op.para ?? op.de) as unknown as Record<string, unknown> | null;
    // O nome atual quando o registo ainda existe (como nas outras frases do lote); o gravado, se não.
    const quem =
      r && !encontrarRegisto(estado, op.entidade, op.id)
        ? nomeDeRegisto(estado, op.entidade, r)
        : nomeDoRegisto(estado, op.entidade, op.id);
    return `${quem} — ${fraseDoRegisto(estado, op)}`;
  }
  if (op.tipo === 'dormida') {
    const matricula = estado.carrinhas.find((c) => c.id === op.carrinhaId)?.matricula;
    const carrinha = matricula ? formatarMatricula(matricula) : op.carrinhaId;
    return `${carrinha} — onde dorme: ${nomeDaDormida(estado, op.de)} → ${nomeDaDormida(estado, op.para)}`;
  }
  if (op.tipo === 'condutor') {
    const matricula = estado.carrinhas.find((c) => c.id === op.carrinhaId)?.matricula;
    const carrinha = matricula ? formatarMatricula(matricula) : op.carrinhaId;
    return `${carrinha} — condutor: ${nomePessoa(estado, op.de)} → ${nomePessoa(estado, op.para)}`;
  }
  const nome = estado.pessoas.find((p) => p.id === op.pessoaId)?.nomeCurto ?? op.pessoaId;
  return `${nome} — ${NOME_CAMPO[op.campo]}: ${nomeDoValor(estado, op.campo, op.de)} → ${nomeDoValor(estado, op.campo, op.para)}`;
}
