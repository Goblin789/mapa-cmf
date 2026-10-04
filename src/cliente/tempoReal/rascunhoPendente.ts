// Rascunho que não chegou ao servidor porque a sessão tinha terminado (o Guardar deu 401). Fica no
// localStorage deste browser para não se perder se a página fechar ou recarregar antes de a pessoa voltar
// a entrar; o primeiro carregamento com sucesso depois disso põe-no outra vez no modo de edição.
//
// O separador onde a gravação falhou continua com o rascunho em memória (o Portao abre a entrada num
// separador NOVO). Para esse separador novo não ficar com uma cópia do mesmo rascunho, o registo diz
// quem o tem ("separador") e esse separador vai dizendo que continua aberto ("vivoEm"). Quando a página
// fecha ou recarrega, larga-o (separador = null) e qualquer separador o pode recuperar. Se fechar sem
// aviso (o telemóvel matou o browser), ao fim de SEPARADOR_VIVO_MS conta como largado.
//
// Pode haver vários registos ao mesmo tempo (dois separadores em edição quando a sessão expira, ou o
// rascunho largado de outra pessoa no mesmo PC): cada um é identificado pelo separador onde nasceu
// ("origem") e fica na sua chave, `mapa-cmf:rascunho-pendente:<origem>`. Uma chave por separador e não
// uma lista partilhada: quando a sessão termina, o servidor corta o tempo real de todos os separadores
// ao mesmo tempo e todos guardam o rascunho no mesmo instante; cada processo do browser tem a sua cópia
// do localStorage, atualizada com atraso, e ler-mudar-escrever uma chave comum perdia registos (visto no
// ensaio com dois separadores). Um armazenamento que não deixa listar as chaves (sem key/length) fica
// com um só registo, na chave base (o último a gravar ganha).
//
// Quem recupera o rascunho de um separador que parecia fechado (o telemóvel suspende os separadores em
// segundo plano) não o apaga: marca-o como recuperado ("recuperadoPor"). Se esse separador acordar, sabe
// que outro ficou com as alterações e larga a sua cópia (ver estado/loja.ts).
//
// Funções puras sobre um armazenamento (o localStorage, ou um falso nos testes); nunca lançam.

import { ENTIDADES_CRIAVEIS, eCampoEditavel, eEntidadeEditavel } from '../../dominio/campos';
import type { Operacao } from '../../dominio/operacoes';

/** Chave base: os registos ficam em `<base>:<origem>` (ou na própria base, ver acima). */
export const CHAVE_RASCUNHO_PENDENTE = 'mapa-cmf:rascunho-pendente';
const PREFIXO = `${CHAVE_RASCUNHO_PENDENTE}:`;

/** Um rascunho mais antigo do que isto já não se recupera (o mapa mudou demasiado entretanto). */
export const VALIDADE_RASCUNHO_MS = 24 * 60 * 60 * 1000;

/** De quanto em quanto tempo o separador que tem o rascunho diz que continua aberto. */
export const INTERVALO_VIVO_MS = 20_000;

/**
 * Sem notícias do separador há mais do que isto, o rascunho conta como largado. Folgado: com o separador
 * escondido, o Chrome só corre os temporizadores uma vez por minuto.
 */
export const SEPARADOR_VIVO_MS = 3 * 60 * 1000;

/** Registos guardados ao mesmo tempo, no máximo (acima disto saem os mais antigos). */
export const MAX_REGISTOS = 6;

/** Folga para relógios ligeiramente desacertados (uma data "no futuro" até aqui ainda conta). */
const FOLGA_RELOGIO_MS = 5 * 60 * 1000;

/** Teto de operações lidas por registo: um valor estragado não pode pendurar o browser. */
const MAX_OPERACOES = 2000;

export interface RascunhoPendente {
  /** Os passos do rascunho, como estavam na loja (cada passo desfaz-se de uma vez). */
  passos: Operacao[][];
  /** Versão do estado sobre a qual foi feito. */
  versaoBase: number;
  /** ISO: quando a gravação falhou. */
  data: string;
  /** Quem o fez (Utilizador.chave), se se sabia: outra pessoa que entre neste browser não o recupera. */
  autor: string | null;
  /** Separador que ainda o tem em memória; null = largado (a página fechou ou recarregou). */
  separador: string | null;
  /** Última vez (ms desde 1970) que esse separador disse que continua aberto. */
  vivoEm: number;
  /** Separador onde nasceu: identifica o registo (não muda quando é largado). Omissão: `separador`. */
  origem?: string;
  /** Outro separador já ficou com estas alterações; o que as tinha em memória larga a sua cópia. */
  recuperadoPor?: string;
  /** M2: lotes revertidos neste rascunho ("Reverter" no Histórico), com o passo onde entraram. */
  reversoes?: ReversaoPendente[];
}

/**
 * M2: um lote cuja reversão está no rascunho: o passo onde entrou (índice em `passos`) e as chaves
 * (chaveOperacao) das suas operações. Ver estado/loja.ts.
 */
export interface ReversaoPendente {
  loteId: number;
  passo: number;
  chaves: string[];
}

/** Um registo tal como se lê: com a origem sempre preenchida. */
export type RegistoRascunho = RascunhoPendente & { origem: string };

/** O que se usa do localStorage. `length` e `key` servem para listar as chaves (ver no início). */
export interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
  readonly length?: number;
  key?(indice: number): string | null;
}

/** O localStorage, se o browser o deixar usar (sem ele, em modo privado ou bloqueado: null). */
export function armazenamentoLocal(): Armazenamento | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Sem saber quem fez ou quem está, conta como a mesma pessoa. Um rascunho do modo local (autor 'local', sem
 * login) serve a quem estiver agora: o modo local só se abre no próprio PC, na mesma origem, por isso um
 * rascunho feito antes de ligar o login não fica preso.
 */
export function autorCompativel(autor: string | null, autorAtual: string | null): boolean {
  return autor === null || autorAtual === null || autor === autorAtual || autor === AUTOR_MODO_LOCAL;
}

/** Utilizador.chave no modo local (servidor sem login). */
const AUTOR_MODO_LOCAL = 'local';

// --- Leitura e escrita: uma chave por registo -------------------------------------------------------

/** Um registo e a chave onde está. */
interface Guardado {
  chave: string;
  registo: RegistoRascunho;
}

function listavel(armazenamento: Armazenamento): boolean {
  try {
    return typeof armazenamento.key === 'function' && typeof armazenamento.length === 'number';
  } catch {
    return false;
  }
}

/** Onde fica o registo com esta origem. */
function chaveDe(armazenamento: Armazenamento, origem: string): string {
  return listavel(armazenamento) ? `${PREFIXO}${origem}` : CHAVE_RASCUNHO_PENDENTE;
}

/** As chaves de rascunhos que existem (a base também, de registos de antes ou sem forma de listar). */
function chaves(armazenamento: Armazenamento): string[] {
  if (!listavel(armazenamento)) return [CHAVE_RASCUNHO_PENDENTE];
  const encontradas: string[] = [];
  try {
    const n = armazenamento.length ?? 0;
    for (let i = 0; i < n; i++) {
      const chave = armazenamento.key?.(i) ?? null;
      if (chave === CHAVE_RASCUNHO_PENDENTE || chave?.startsWith(PREFIXO)) encontradas.push(chave);
    }
  } catch {
    return [];
  }
  return encontradas;
}

function escrever(armazenamento: Armazenamento, chave: string, valor: RegistoRascunho | null): boolean {
  try {
    if (valor === null) armazenamento.removeItem(chave);
    else armazenamento.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

/**
 * Lê tudo: os registos válidos (um por origem, o mais recente primeiro) e as chaves com valores estragados
 * ou repetidos (para apagar).
 */
function lerTudo(armazenamento: Armazenamento): { guardados: Guardado[]; estragadas: string[] } {
  const guardados: Guardado[] = [];
  const estragadas: string[] = [];
  for (const chave of chaves(armazenamento)) {
    let texto: string | null;
    try {
      texto = armazenamento.getItem(chave);
    } catch {
      continue;
    }
    if (texto === null) continue;
    const registo = validarTexto(texto);
    if (!registo) estragadas.push(chave);
    else guardados.push({ chave, registo });
  }
  guardados.sort((a, b) => Date.parse(b.registo.data) - Date.parse(a.registo.data));
  // A mesma origem em duas chaves (a base, de antes, e a dela): fica a da origem.
  const unicos: Guardado[] = [];
  for (const g of guardados) {
    const outro = unicos.findIndex((u) => u.registo.origem === g.registo.origem);
    if (outro === -1) unicos.push(g);
    else if (g.chave === CHAVE_RASCUNHO_PENDENTE) estragadas.push(g.chave);
    else {
      estragadas.push((unicos[outro] as Guardado).chave);
      unicos[outro] = g;
    }
  }
  return { guardados: unicos, estragadas };
}

/**
 * Muda os registos um a um: `mudar` devolve o registo novo, null para o apagar, ou undefined para o deixar.
 * Cada registo só se escreve na sua chave. Devolve se tudo o que havia a escrever foi escrito.
 */
function alterar(
  armazenamento: Armazenamento | null,
  mudar: (registo: RegistoRascunho) => RegistoRascunho | null | undefined,
): boolean {
  if (!armazenamento) return false;
  const { guardados, estragadas } = lerTudo(armazenamento);
  let ok = true;
  for (const chave of estragadas) escrever(armazenamento, chave, null);
  for (const { chave, registo } of guardados) {
    const novo = mudar(registo);
    if (novo !== undefined) ok = escrever(armazenamento, chave, novo) && ok;
  }
  return ok;
}

/** Todos os registos válidos (o mais recente primeiro), sem olhar para a idade nem para quem os tem. */
export function lerRegistos(armazenamento: Armazenamento | null): RegistoRascunho[] {
  if (!armazenamento) return [];
  return lerTudo(armazenamento).guardados.map((g) => g.registo);
}

/** O registo que este separador tem em memória (se houver). */
export function registoDoSeparador(
  armazenamento: Armazenamento | null,
  separador: string,
): RegistoRascunho | null {
  return lerRegistos(armazenamento).find((r) => r.separador === separador) ?? null;
}

// --- Operações ---------------------------------------------------------------------------------------

/**
 * Guarda o rascunho deste separador, na chave dele (substitui o que ele já lá tinha, nunca o de outro).
 * false se não foi possível (sem armazenamento, cheio, bloqueado).
 */
export function guardarRascunhoPendente(
  armazenamento: Armazenamento | null,
  rascunho: RascunhoPendente,
): boolean {
  if (!armazenamento) return false;
  const origem = rascunho.origem ?? rascunho.separador ?? `${rascunho.data}|${rascunho.autor ?? ''}`;
  const chave = chaveDe(armazenamento, origem);
  if (!escrever(armazenamento, chave, { ...rascunho, origem })) return false;
  // Acima do máximo saem os mais antigos (de outros separadores: há muito largados).
  const { guardados } = lerTudo(armazenamento);
  for (const { chave: antiga } of guardados.slice(MAX_REGISTOS)) {
    if (antiga !== chave) escrever(armazenamento, antiga, null);
  }
  return true;
}

/** Apaga o registo com esta origem. */
export function apagarRegisto(armazenamento: Armazenamento | null, origem: string): void {
  alterar(armazenamento, (r) => (r.origem === origem ? null : undefined));
}

/** Apaga o registo que este separador tem (não mexe nos de outros separadores nem nos largados). */
export function apagarSeForDeste(armazenamento: Armazenamento | null, separador: string): void {
  alterar(armazenamento, (r) => (r.separador === separador ? null : undefined));
}

/**
 * O separador continua aberto. false se já não tem registo nenhum (foi gravado, cancelado, apagado) ou se
 * outro separador o recuperou entretanto: pode parar de avisar.
 */
export function marcarVivo(armazenamento: Armazenamento | null, separador: string, agora: number): boolean {
  const meu = registoDoSeparador(armazenamento, separador);
  if (!meu || meu.recuperadoPor) return false;
  return alterar(armazenamento, (r) =>
    r.separador === separador && !r.recuperadoPor ? { ...r, vivoEm: agora } : undefined,
  );
}

/**
 * A página vai fechar ou recarregar: o rascunho deste separador fica livre para ser recuperado. Se outro
 * separador já o tinha recuperado, já não serve a ninguém e apaga-se.
 */
export function largar(armazenamento: Armazenamento | null, separador: string): void {
  alterar(armazenamento, (r) => {
    if (r.separador !== separador) return undefined;
    return r.recuperadoPor ? null : { ...r, separador: null };
  });
}

/**
 * A página voltou da cache do browser (bfcache) depois de ter largado o rascunho e ainda o tem em memória:
 * volta a segurá-lo. Devolve se segurou algum (para voltar a dizer que continua aberto).
 */
export function retomar(
  armazenamento: Armazenamento | null,
  separador: string,
  agora: number,
  autorAtual: string | null,
): boolean {
  let retomado = false;
  alterar(armazenamento, (r) => {
    if (r.origem !== separador || r.separador !== null || r.recuperadoPor) return undefined;
    if (!autorCompativel(r.autor, autorAtual)) return undefined;
    retomado = true;
    return { ...r, separador, vivoEm: agora };
  });
  return retomado;
}

/**
 * Este separador ficou com o rascunho com esta origem. Se ainda havia um separador a segurá-lo (parecia
 * fechado, mas pode só estar suspenso), fica marcado como recuperado para esse o largar quando acordar; se
 * não, apaga-se.
 */
export function marcarRecuperado(armazenamento: Armazenamento | null, origem: string, por: string): void {
  alterar(armazenamento, (r) => {
    if (r.origem !== origem) return undefined;
    return r.separador === null || r.separador === por ? null : { ...r, recuperadoPor: por };
  });
}

function valido(registo: RascunhoPendente, agora: number): boolean {
  const quando = Date.parse(registo.data);
  return agora - quando <= VALIDADE_RASCUNHO_MS && quando - agora <= FOLGA_RELOGIO_MS;
}

/**
 * O rascunho que este separador pode recuperar, ou null: o mais recente que não seja de outra pessoa, que
 * nenhum separador vivo tenha em memória (incluindo este: aí é o que está em memória que conta) e que
 * ninguém tenha recuperado ainda. Apaga os que têm mais de 24 h, os estragados e os recuperados que já
 * ninguém segura.
 */
export function lerRascunhoPendente(
  armazenamento: Armazenamento | null,
  agora: number,
  autorAtual: string | null,
  separadorAtual: string,
): RegistoRascunho | null {
  if (!armazenamento) return null;
  alterar(armazenamento, (r) => {
    const recuperadoSemDono = r.recuperadoPor !== undefined && r.separador === null;
    return !valido(r, agora) || recuperadoSemDono ? null : undefined;
  });
  const candidatos = lerRegistos(armazenamento).filter((r) => {
    if (r.recuperadoPor || r.separador === separadorAtual) return false;
    if (!autorCompativel(r.autor, autorAtual)) return false;
    return r.separador === null || agora - r.vivoEm >= SEPARADOR_VIVO_MS;
  });
  candidatos.sort((a, b) => Date.parse(b.data) - Date.parse(a.data));
  return candidatos[0] ?? null;
}

/**
 * Corre `fazer` com uma tranca partilhada por todos os separadores deste browser (Web Locks), para dois
 * separadores que carregam ao mesmo tempo não recuperarem o mesmo rascunho. Sem Web Locks, corre logo.
 */
export async function comTrancaRascunhos<T>(fazer: () => T): Promise<T> {
  let trancas: LockManager | undefined;
  try {
    trancas = globalThis.navigator?.locks;
  } catch {
    trancas = undefined;
  }
  if (!trancas?.request) return fazer();
  let feito = false;
  let resultado!: T;
  try {
    await trancas.request(CHAVE_RASCUNHO_PENDENTE, () => {
      resultado = fazer();
      feito = true;
    });
  } catch {
    // A tranca falhou (contexto sem acesso): faz-se sem ela.
  }
  return feito ? resultado : fazer();
}

/** "Recuperámos 3 alterações que não chegaram a ser guardadas. Revê-as e carrega em Guardar." */
export function textoRascunhoRecuperado(n: number): string {
  return n === 1
    ? 'Recuperámos 1 alteração que não chegou a ser guardada. Revê-a e carrega em Guardar.'
    : `Recuperámos ${n} alterações que não chegaram a ser guardadas. Revê-as e carrega em Guardar.`;
}

/** O separador que tinha o rascunho acordou e outro já ficou com ele. */
export function textoRascunhoNoutroSeparador(n: number): string {
  return n === 1
    ? 'A alteração por guardar deste separador foi recuperada noutro separador. Revê-a e guarda-a lá.'
    : `As ${n} alterações por guardar deste separador foram recuperadas noutro separador. Revê-as e guarda-as lá.`;
}

// --- Validação ---------------------------------------------------------------------------------------

function validarTexto(texto: string): RegistoRascunho | null {
  try {
    return validarRascunho(JSON.parse(texto));
  } catch {
    return null;
  }
}

function validarRascunho(valor: unknown): RegistoRascunho | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  const { passos, versaoBase, data, autor, separador, vivoEm, origem, recuperadoPor, reversoes } =
    valor as Record<string, unknown>;
  if (typeof versaoBase !== 'number' || !Number.isInteger(versaoBase) || versaoBase < 0) return null;
  if (typeof data !== 'string') return null;
  if (autor !== null && autor !== undefined && typeof autor !== 'string') return null;
  if (separador !== null && separador !== undefined && typeof separador !== 'string') return null;
  if (origem !== undefined && (typeof origem !== 'string' || origem === '')) return null;
  if (recuperadoPor !== undefined && typeof recuperadoPor !== 'string') return null;
  if (!Array.isArray(passos) || passos.length === 0) return null;
  let total = 0;
  for (const passo of passos) {
    if (!Array.isArray(passo) || passo.length === 0) return null;
    total += passo.length;
    if (total > MAX_OPERACOES || !passo.every(eOperacao)) return null;
  }
  const registo: RegistoRascunho = {
    passos: passos as Operacao[][],
    versaoBase,
    data,
    autor: autor ?? null,
    separador: separador ?? null,
    vivoEm: typeof vivoEm === 'number' && Number.isFinite(vivoEm) ? vivoEm : 0,
    // Registos de antes de haver origem: o separador onde nasceram, ou a data e o autor.
    origem: origem ?? separador ?? `${data}|${autor ?? ''}`,
  };
  if (typeof recuperadoPor === 'string') registo.recuperadoPor = recuperadoPor;
  // As reversões estragadas não estragam o rascunho: só se perdem elas.
  const validas = Array.isArray(reversoes) ? reversoes.filter(eReversao) : [];
  if (validas.length > 0) registo.reversoes = validas;
  return registo;
}

function eReversao(valor: unknown): valor is ReversaoPendente {
  if (typeof valor !== 'object' || valor === null) return false;
  const r = valor as Record<string, unknown>;
  return (
    typeof r.loteId === 'number' &&
    Number.isInteger(r.loteId) &&
    r.loteId > 0 &&
    typeof r.passo === 'number' &&
    Number.isInteger(r.passo) &&
    r.passo >= 0 &&
    Array.isArray(r.chaves) &&
    r.chaves.every((c) => typeof c === 'string')
  );
}

const CAMPOS = new Set(['casaId', 'carrinhaId', 'obraId']);

function eIdOuNulo(valor: unknown): boolean {
  return valor === null || (typeof valor === 'string' && valor.length > 0);
}

/** Um valor de um campo (ValorCampo): texto, número, sim/não, null ou lista de textos. */
function eValorCampo(valor: unknown): boolean {
  if (valor === null || ['string', 'number', 'boolean'].includes(typeof valor)) return true;
  return Array.isArray(valor) && valor.every((x) => typeof x === 'string');
}

/** Um registo inteiro (de uma operação 'registo') ou null. */
function eRegistoOuNulo(valor: unknown, id: unknown): boolean {
  if (valor === null) return true;
  return typeof valor === 'object' && !Array.isArray(valor) && (valor as Record<string, unknown>).id === id;
}

function eOperacao(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false;
  const op = valor as Record<string, unknown>;
  // M2: os campos das fichas e os registos criados/apagados.
  if (op.tipo === 'campo') {
    return (
      eEntidadeEditavel(op.entidade) &&
      eCampoEditavel(op.entidade, op.campo) &&
      typeof op.id === 'string' &&
      op.id !== '' &&
      eValorCampo(op.de) &&
      eValorCampo(op.para)
    );
  }
  if (op.tipo === 'registo') {
    return (
      typeof op.entidade === 'string' &&
      (ENTIDADES_CRIAVEIS as readonly string[]).includes(op.entidade) &&
      typeof op.id === 'string' &&
      op.id !== '' &&
      eRegistoOuNulo(op.de, op.id) &&
      eRegistoOuNulo(op.para, op.id) &&
      (op.de === null) !== (op.para === null)
    );
  }
  if (!eIdOuNulo(op.de) || !eIdOuNulo(op.para)) return false;
  switch (op.tipo) {
    case 'mover':
      return typeof op.pessoaId === 'string' && typeof op.campo === 'string' && CAMPOS.has(op.campo);
    case 'condutor':
    case 'dormida':
      return typeof op.carrinhaId === 'string';
    default:
      return false;
  }
}
