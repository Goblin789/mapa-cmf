// Operações de edição: o que o modo de edição produz e o servidor grava.
// O browser aplica-as ao estado para mostrar a simulação; o servidor volta a validá-las e grava-as
// num lote com histórico. Funções puras, iguais nos dois lados.
//
// M2 (docs/m2.md): além de 'mover', 'condutor' e 'dormida', há
// - 'campo': muda um campo de uma ficha (pessoa, casa, carrinha, obra, local, indisponibilidade, problema);
// - 'registo': cria (`de` = null) ou apaga (`para` = null) um registo inteiro, com o id gerado no browser
//   (novoId): pessoas novas, obras e os seus locais, períodos de indisponibilidade e problemas.
// Todas têm `de` (o que se esperava encontrar: os conflitos vêm daí) e `para`. CONTRATO DO M2: os tipos e as
// assinaturas estão fechados; dobrar os 'campo' num 'registo' ao compactar, validar as operações novas, os
// conflitos escondidos e as frases finais são do módulo base (ver os comentários "CONTRATO DO M2").

import {
  type CampoEditavel,
  type EntidadeApagavel,
  type EntidadeCriavel,
  type EntidadeEditavel,
  encontrarRegisto,
  PREFIXO_ID,
  type RegistosEditaveis,
  ROTULO_CAMPO,
  type ValorCampo,
  type ValorDoCampo,
} from './campos';
import { formatarMatricula } from './matricula';
import type { Carrinha, Estado, Id, Pessoa } from './tipos';

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
 * 2) muda os campos; 3) as outras operações (aplicarOperacoes); 4) apaga os registos apagados. Assim uma
 * pessoa pode ir para uma obra criada no mesmo rascunho, e uma obra só desaparece depois de as pessoas saírem.
 * CONTRATO DO M2: o módulo base revê e testa (ordem das listas criadas, campos de registos inexistentes).
 */
function aplicarRegistosECampos(estado: Estado, ops: readonly Operacao[], fase: 'antes' | 'depois'): Estado {
  let resultado = estado;
  const mudar = <K extends keyof Estado>(lista: K, valor: Estado[K]) => {
    resultado = { ...resultado, [lista]: valor };
  };
  for (const op of ops) {
    if (op.tipo === 'registo') {
      const lista = LISTA_DA_ENTIDADE[op.entidade];
      const atuais = resultado[lista] as readonly { id: Id }[];
      if (fase === 'antes' && op.de === null && op.para !== null) {
        if (!atuais.some((r) => r.id === op.id)) mudar(lista, [...atuais, op.para] as never);
      } else if (fase === 'depois' && op.para === null) {
        mudar(lista, atuais.filter((r) => r.id !== op.id) as never);
      }
      continue;
    }
    if (op.tipo !== 'campo' || fase !== 'antes') continue;
    const lista = LISTA_DA_ENTIDADE[op.entidade];
    const atuais = resultado[lista] as readonly { id: Id }[];
    if (!atuais.some((r) => r.id === op.id)) continue;
    mudar(lista, atuais.map((r) => (r.id === op.id ? { ...r, [op.campo]: op.para } : r)) as never);
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

/**
 * Junta os movimentos da mesma pessoa no mesmo campo num só (o `de` do primeiro, o `para` do último)
 * e tira os que acabam onde começaram. Mantém a ordem da primeira ocorrência. Vale igual para as operações
 * do M2 (mesmo campo do mesmo registo; mesmo registo criado/apagado).
 * CONTRATO DO M2 (módulo base): os 'campo' de um registo criado no rascunho dobram-se no `para` do 'registo';
 * os de um registo apagado no rascunho dobram-se no `de` (o valor gravado); criar e apagar no mesmo rascunho
 * não deixa nada (nem os 'campo' desse registo). Ver docs/m2.md, "Compactar".
 */
export function compactarOperacoes(ops: readonly Operacao[]): Operacao[] {
  const juntas = new Map<string, Operacao>();
  for (const op of ops) {
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
 * já não existe. CONTRATO DO M2: o módulo base testa (e revê os registos criados no mesmo lote).
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

/**
 * Erros de referência (pessoa, carrinha ou destino que não existem, pessoa inativa) e a regra do condutor:
 * no fim das operações, o condutor de cada carrinha mexida tem de ir nela. Lista vazia = válido.
 * CONTRATO DO M2 (módulo base): validar também as operações 'campo' e 'registo' (docs/m2.md, "Validar"):
 * valores (validarValorCampo), referências e unicidade no estado FINAL, só se apagam as entidades apagáveis e
 * sem nada que as use, sem períodos sobrepostos, quem sai da empresa fica sem casa/carrinha/obra/condutor; e
 * as referências das operações antigas passam a ver os registos criados no mesmo lote. O `ativa` de quem é
 * movido ou passa a conduzir vê-se DEPOIS dos 'campo' do mesmo lote ("Voltou à empresa" + pôr numa casa no
 * mesmo rascunho é válido; reverter um "Saiu da empresa" também).
 */
export function validarOperacoes(estado: Estado, ops: readonly Operacao[]): string[] {
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const carrinhas = new Map(estado.carrinhas.map((c) => [c.id, c]));
  const existe: Record<CampoMovivel, Set<Id>> = {
    casaId: new Set(estado.casas.map((c) => c.id)),
    carrinhaId: new Set(estado.carrinhas.map((c) => c.id)),
    obraId: new Set(estado.obras.map((o) => o.id)),
  };
  const erros: string[] = [];
  const carrinhasMexidas = new Set<Id>();
  const casas = new Set(estado.casas.map((c) => c.id));
  const locais = new Set(estado.locais.map((l) => l.id));
  for (const op of ops) {
    // CONTRATO DO M2: as operações 'campo' e 'registo' validam-se no módulo base.
    if (op.tipo === 'campo' || op.tipo === 'registo') continue;
    if (op.tipo === 'dormida') {
      if (!carrinhas.has(op.carrinhaId)) erros.push(`A carrinha ${op.carrinhaId} não existe.`);
      if (op.para !== null) {
        const lida = lerChaveDormida(op.para);
        const existe = lida && (lida.tipo === 'casa' ? casas.has(lida.id) : locais.has(lida.id));
        if (!existe) erros.push(`O sítio onde dormir "${op.para}" não existe.`);
      }
      continue;
    }
    if (op.tipo === 'condutor') {
      if (!carrinhas.has(op.carrinhaId)) {
        erros.push(`A carrinha ${op.carrinhaId} não existe.`);
        continue;
      }
      carrinhasMexidas.add(op.carrinhaId);
      if (op.para !== null) {
        const c = pessoas.get(op.para);
        if (!c) erros.push(`A pessoa ${op.para} não existe.`);
        else if (!c.ativa) erros.push(`${c.nomeCurto} não está ativa.`);
      }
      continue;
    }
    if (op.campo === 'carrinhaId') {
      if (op.de) carrinhasMexidas.add(op.de);
      if (op.para) carrinhasMexidas.add(op.para);
    }
    const p = pessoas.get(op.pessoaId);
    if (!p) {
      erros.push(`A pessoa ${op.pessoaId} não existe.`);
      continue;
    }
    if (!p.ativa) erros.push(`${p.nomeCurto} não está ativa.`);
    if (op.para !== null && !existe[op.campo].has(op.para)) {
      erros.push(`${p.nomeCurto}: o destino ${op.para} não existe.`);
    }
  }
  if (erros.length > 0 || carrinhasMexidas.size === 0) return erros;
  const final = aplicarOperacoes(estado, ops);
  const pessoasFinal = new Map(final.pessoas.map((p) => [p.id, p]));
  for (const c of final.carrinhas) {
    if (!carrinhasMexidas.has(c.id) || c.condutorId === null) continue;
    const condutor = pessoasFinal.get(c.condutorId);
    if (!condutor || condutor.carrinhaId !== c.id) {
      erros.push(
        `${condutor?.nomeCurto ?? c.condutorId} não vai na carrinha ${formatarMatricula(c.matricula)}: não pode ser o condutor.`,
      );
    }
  }
  return erros;
}

const NOME_CAMPO: Record<CampoMovivel, string> = { casaId: 'casa', carrinhaId: 'carrinha', obraId: 'obra' };

export function nomeDoValor(estado: Estado, campo: CampoMovivel, valor: Id | null): string {
  if (campo === 'casaId') {
    return valor === null ? 'Fora das casas CMF' : (estado.casas.find((c) => c.id === valor)?.nome ?? valor);
  }
  if (campo === 'carrinhaId') {
    if (valor === null) return 'Sem transporte da empresa';
    const carrinha = estado.carrinhas.find((c) => c.id === valor);
    return carrinha ? formatarMatricula(carrinha.matricula) : valor;
  }
  return valor === null ? 'sem obra' : (estado.obras.find((o) => o.id === valor)?.nome ?? valor);
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
  if (lida.tipo === 'casa') return estado.casas.find((c) => c.id === lida.id)?.nome ?? lida.id;
  return estado.locais.find((l) => l.id === lida.id)?.nome ?? lida.id;
}

/**
 * Quem é o registo de uma operação do M2, para as frases ("Ana T.", "Casa Um", "CF 5001", "Obra X").
 * CONTRATO DO M2: o módulo base afina (indisponibilidade → nome da pessoa; problema → casa/carrinha).
 */
export function nomeDoRegisto(estado: Estado, entidade: EntidadeEditavel, id: Id): string {
  const r = encontrarRegisto(estado, entidade, id) as Record<string, unknown> | undefined;
  if (!r) return id;
  if (entidade === 'pessoa') return String(r.nomeCurto ?? id);
  if (entidade === 'carrinha') return formatarMatricula(String(r.matricula ?? id));
  if (typeof r.nome === 'string') return r.nome;
  return id;
}

/**
 * Ex.: "Ana Exemplo — casa: Casa A → Casa B"; "ZZ 1001 — condutor: sem condutor → Ana Exemplo";
 * "ZZ 1001 — onde dorme: por definir → Casa A".
 * M2 (frase provisória, CONTRATO DO M2 — o módulo base faz as frases legíveis de docs/m2.md, "Frases"):
 * "Casa Um — lotação: 8 → 9"; "Obra Nova — criada"; "Obra Nova — apagada".
 */
export function descreverOperacao(estado: Estado, op: Operacao): string {
  if (op.tipo === 'campo') {
    const rotulo = (ROTULO_CAMPO[op.entidade] as Record<string, string>)[op.campo] ?? op.campo;
    const texto = (v: ValorCampo) =>
      v === null
        ? '—'
        : v === true
          ? 'sim'
          : v === false
            ? 'não'
            : Array.isArray(v)
              ? v.join(', ')
              : String(v);
    return `${nomeDoRegisto(estado, op.entidade, op.id)} — ${rotulo}: ${texto(op.de)} → ${texto(op.para)}`;
  }
  if (op.tipo === 'registo') {
    const quem =
      op.para && 'nome' in op.para && typeof op.para.nome === 'string'
        ? op.para.nome
        : nomeDoRegisto(estado, op.entidade, op.id);
    return `${quem} — ${op.de === null ? 'criado' : 'apagado'}`;
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
