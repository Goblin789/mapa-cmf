// Fichas editáveis (M2): que entidades e que campos se mudam no programa, que registos se criam e se
// apagam, e os limites de cada campo. É a tabela de que dependem a operação 'campo' e a 'registo'
// (dominio/operacoes.ts), a validação do servidor e os editores das fichas. Funções puras.
//
// CONTRATO DO M2 (docs/m2.md): os tipos, as listas e as assinaturas são o contrato entre módulos. A
// validação de cada valor (`validarValorCampo`) e dos registos novos (`validarRegisto`) está no fim; a do
// estado final (referências, únicos, apagar) em operacoes.ts (validarOperacoes).
//
// O que NÃO entra aqui de propósito:
// - casa/carrinha/obra da pessoa (`casaId`, `carrinhaId`, `obraId`), o condutor e onde dorme a carrinha:
//   têm operações próprias ('mover', 'condutor', 'dormida'), com as suas regras;
// - o motivo de uma indisponibilidade: não existe (só a pessoa e as datas);
// - datas de CT/revisão/correia e estados da carrinha: M3.

import { eDia } from './datas';
import { formatarMatricula } from './matricula';
import { compactar } from './pesquisa';
import {
  type Carrinha,
  type Casa,
  type Estado,
  type Id,
  type Indisponibilidade,
  type Local,
  type Obra,
  PAISES,
  type Pessoa,
  type Problema,
  TIPOS_VEICULO,
  type TipoLocal,
} from './tipos';

export const ENTIDADES_EDITAVEIS = [
  'pessoa',
  'casa',
  'carrinha',
  'obra',
  'local',
  'indisponibilidade',
  'problema',
] as const;
export type EntidadeEditavel = (typeof ENTIDADES_EDITAVEIS)[number];

/** O registo de cada entidade, tal como está no Estado. */
export interface RegistosEditaveis {
  pessoa: Pessoa;
  casa: Casa;
  carrinha: Carrinha;
  obra: Obra;
  local: Local;
  indisponibilidade: Indisponibilidade;
  problema: Problema;
}

/** Valor de um campo editável (como vai em JSON nas operações e no histórico). */
export type ValorCampo = string | number | boolean | null | readonly string[];

/**
 * Campos que se mudam no programa com a operação 'campo', por entidade. A ordem é a das fichas.
 * - pessoa: `ativa` = false é "saiu da empresa" (nunca se apaga a pessoa nem o histórico); as marcas
 *   "a confirmar" também se tiram à mão ("Confirmar casa/carrinha"), sem mudar a pessoa de sítio.
 * - casa: `localId` = mudar a casa para outra morada já conhecida (a morada em si muda-se no local).
 * - local: a morada e a posição (pino) das casas, obras e estacionamentos. Uma morada partilhada por várias
 *   casas (Himeling) é um só local: mudá-la muda-a para todas.
 * - indisponibilidade: só as datas. problema: o texto e se está resolvido (`resolvidoEm`).
 */
export const CAMPOS_EDITAVEIS = {
  pessoa: [
    'numero',
    'nome',
    'apelidos',
    'nomeCurto',
    'clienteId',
    'telefone',
    'temCarta',
    'cartaValidade',
    'casaAConfirmar',
    'carrinhaAConfirmar',
    'ativa',
  ],
  casa: [
    'nome',
    'localId',
    'apartamento',
    'lotacao',
    'maxContrato',
    'tolerado',
    'notaContrato',
    'sempreCheia',
    'senhorio',
    'equipamento',
  ],
  carrinha: ['matricula', 'matriculasAlternativas', 'tipo', 'marca', 'modelo', 'lugares', 'nota'],
  obra: ['nome', 'clienteId', 'localId', 'estacionamentoLocalId'],
  local: ['nome', 'morada', 'pais', 'lat', 'lng'],
  indisponibilidade: ['inicio', 'fim'],
  problema: ['texto', 'resolvidoEm'],
} as const satisfies { [E in EntidadeEditavel]: readonly (keyof RegistosEditaveis[E] & string)[] };

export type CampoEditavel<E extends EntidadeEditavel = EntidadeEditavel> =
  (typeof CAMPOS_EDITAVEIS)[E][number];

/** O tipo do valor de um campo editável (ex.: CampoValor<'casa','lotacao'> = number). */
export type ValorDoCampo<E extends EntidadeEditavel, C extends CampoEditavel<E>> = RegistosEditaveis[E][C &
  keyof RegistosEditaveis[E]];

/**
 * Entidades que se criam no programa (operação 'registo' com `de` = null): pessoas novas, obras (e os seus
 * locais e estacionamentos), períodos de indisponibilidade e problemas. Casas e veículos novos continuam a
 * entrar pelos dados iniciais (npm run sincronizar) no M2.
 */
export const ENTIDADES_CRIAVEIS = ['pessoa', 'obra', 'local', 'indisponibilidade', 'problema'] as const;
export type EntidadeCriavel = (typeof ENTIDADES_CRIAVEIS)[number];

/**
 * Entidades que se apagam (operação 'registo' com `para` = null). Nunca pessoas (saem com `ativa` = false),
 * casas nem veículos. Uma obra só se apaga sem pessoas; um local só se foi criado no programa
 * (localCriadoNoPrograma) e sem nada que o use (casas, obras, estacionamentos de obras, carrinhas que lá
 * dormem).
 */
export const ENTIDADES_APAGAVEIS = ['obra', 'local', 'indisponibilidade', 'problema'] as const;
export type EntidadeApagavel = (typeof ENTIDADES_APAGAVEIS)[number];

/** Prefixo dos ids gerados no browser (ex.: "obra-2f1c…"). Os ids importados são outros (ex.: "CF5001"). */
export const PREFIXO_ID: Readonly<Record<EntidadeCriavel, string>> = {
  pessoa: 'pessoa',
  obra: 'obra',
  local: 'local',
  indisponibilidade: 'indisp',
  problema: 'problema',
};

/** Limites dos campos de texto e números (a validação do servidor e os editores usam os mesmos). */
export const LIMITES = {
  /** Nomes, apelidos, nome curto, nome da casa/obra/local, marca, modelo, apartamento. */
  textoCurto: 80,
  /** Morada, senhorio (contacto), equipamento, notas. */
  textoLongo: 300,
  telefone: 40,
  numero: 30,
  matricula: 12,
  matriculasAlternativas: 5,
  lotacaoMaxima: 60,
  lugaresMaximos: 20,
  /** Raio (m) de um local criado no programa: os "locais conhecidos" são o filtro do GPS no M4. */
  raioMinimo: 50,
  raioMaximo: 300,
  /** Texto de um problema (MAX_TEXTO_PROBLEMA, dominio/problemas.ts). */
  textoProblema: 120,
} as const;

/** Raio (m) com que se cria o local de uma obra ou de um estacionamento. */
export const RAIO_OMISSAO = 150;

/**
 * Região do mapa (graus): a validação das coordenadas, os limites do Mapa (maxBounds) e o mini-mapa da
 * morada usam TODOS esta, para nunca se criar um pino onde o mapa não deixa ir. Luxemburgo e arredores,
 * com Metz, Sarrebruck, Trier, Arlon e Bastogne lá dentro. CONTRATO DO M2.
 */
export const REGIAO_MAPA = { sul: 48.95, norte: 50.35, oeste: 5.3, leste: 7.1 } as const;

/** A posição está dentro da região do mapa. */
export function dentroDaRegiao(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= REGIAO_MAPA.sul &&
    lat <= REGIAO_MAPA.norte &&
    lng >= REGIAO_MAPA.oeste &&
    lng <= REGIAO_MAPA.leste
  );
}

/**
 * Tipos de local que se criam no programa (o local de uma obra e o seu estacionamento). Os outros (casa,
 * oficina, escritório, bomba…) só vêm dos dados iniciais: são os "locais conhecidos" do GPS (M4).
 */
export const TIPOS_LOCAL_CRIAVEIS = ['obra', 'estacionamento'] as const satisfies readonly TipoLocal[];

/**
 * O local foi criado no programa (id "local-…" e tipo obra/estacionamento): só estes se apagam (e só sem
 * nada que os use, o que se vê em validarOperacoes). Os dos dados iniciais nunca se apagam no programa.
 */
export function localCriadoNoPrograma(local: Pick<Local, 'id' | 'tipo'>): boolean {
  return (
    local.id.startsWith(`${PREFIXO_ID.local}-`) &&
    (TIPOS_LOCAL_CRIAVEIS as readonly TipoLocal[]).includes(local.tipo)
  );
}

/** Rótulo de cada campo, nas fichas e no histórico ("Ana — nome curto: Ana → Ana T."). */
export const ROTULO_CAMPO: { readonly [E in EntidadeEditavel]: Readonly<Record<CampoEditavel<E>, string>> } =
  {
    pessoa: {
      numero: 'nº',
      nome: 'nome',
      apelidos: 'apelidos',
      nomeCurto: 'nome no mapa',
      clienteId: 'cliente',
      telefone: 'telefone',
      temCarta: 'carta',
      cartaValidade: 'carta válida até',
      casaAConfirmar: 'casa a confirmar',
      carrinhaAConfirmar: 'carrinha a confirmar',
      ativa: 'na empresa',
    },
    casa: {
      nome: 'nome',
      localId: 'morada',
      apartamento: 'apartamento',
      lotacao: 'lotação',
      maxContrato: 'máx. do contrato',
      tolerado: 'tolerado',
      notaContrato: 'nota do contrato',
      sempreCheia: 'sempre cheia',
      senhorio: 'senhorio',
      equipamento: 'equipamento',
    },
    carrinha: {
      matricula: 'matrícula',
      matriculasAlternativas: 'outras matrículas',
      tipo: 'tipo',
      marca: 'marca',
      modelo: 'modelo',
      lugares: 'lugares',
      nota: 'nota',
    },
    obra: { nome: 'nome', clienteId: 'cliente', localId: 'morada', estacionamentoLocalId: 'estacionamento' },
    local: { nome: 'nome', morada: 'morada', pais: 'país', lat: 'latitude', lng: 'longitude' },
    indisponibilidade: { inicio: 'indisponível desde', fim: 'indisponível até' },
    problema: { texto: 'problema', resolvidoEm: 'resolvido' },
  };

export function eEntidadeEditavel(x: unknown): x is EntidadeEditavel {
  return typeof x === 'string' && (ENTIDADES_EDITAVEIS as readonly string[]).includes(x);
}

export function eCampoEditavel<E extends EntidadeEditavel>(
  entidade: E,
  campo: unknown,
): campo is CampoEditavel<E> {
  return typeof campo === 'string' && (CAMPOS_EDITAVEIS[entidade] as readonly string[]).includes(campo);
}

/** A lista do Estado onde vivem os registos de uma entidade. */
export function registosDe<E extends EntidadeEditavel>(
  estado: Estado,
  entidade: E,
): readonly RegistosEditaveis[E][] {
  const listas: { [K in EntidadeEditavel]: readonly RegistosEditaveis[K][] } = {
    pessoa: estado.pessoas,
    casa: estado.casas,
    carrinha: estado.carrinhas,
    obra: estado.obras,
    local: estado.locais,
    indisponibilidade: estado.indisponibilidades,
    problema: estado.problemas,
  };
  return listas[entidade];
}

/** O registo com este id, ou undefined. */
export function encontrarRegisto<E extends EntidadeEditavel>(
  estado: Estado,
  entidade: E,
  id: Id,
): RegistosEditaveis[E] | undefined {
  return registosDe(estado, entidade).find((r) => r.id === id);
}

// --- Validação dos valores ----------------------------------------------------------------------------

/** Como se valida cada campo editável. */
type Regra =
  /** Texto aparado, sem quebras de linha. obrigatorio: nunca vazio; opcional: null ou com texto; livre: texto, pode ser "". */
  | { tipo: 'texto'; max: number; vazio: 'obrigatorio' | 'opcional' | 'livre' }
  | { tipo: 'inteiro'; max: number; nulo: boolean }
  | { tipo: 'booleano'; nulo: boolean }
  | { tipo: 'dia'; nulo: boolean }
  | { tipo: 'id'; nulo: boolean }
  | { tipo: 'escolha'; opcoes: readonly string[] }
  | { tipo: 'coordenada'; eixo: 'lat' | 'lng' }
  | { tipo: 'matricula' }
  | { tipo: 'matriculas' };

const textoCurto = (vazio: 'obrigatorio' | 'opcional'): Regra => ({
  tipo: 'texto',
  max: LIMITES.textoCurto,
  vazio,
});
const textoLongo: Regra = { tipo: 'texto', max: LIMITES.textoLongo, vazio: 'opcional' };
const booleano: Regra = { tipo: 'booleano', nulo: false };
const lotacao = (nulo: boolean): Regra => ({ tipo: 'inteiro', max: LIMITES.lotacaoMaxima, nulo });

const REGRAS: { readonly [E in EntidadeEditavel]: Readonly<Record<CampoEditavel<E>, Regra>> } = {
  pessoa: {
    numero: { tipo: 'texto', max: LIMITES.numero, vazio: 'opcional' },
    nome: textoCurto('obrigatorio'),
    apelidos: textoCurto('obrigatorio'),
    nomeCurto: textoCurto('obrigatorio'),
    clienteId: { tipo: 'id', nulo: false },
    telefone: { tipo: 'texto', max: LIMITES.telefone, vazio: 'opcional' },
    temCarta: { tipo: 'booleano', nulo: true },
    cartaValidade: { tipo: 'dia', nulo: true },
    casaAConfirmar: booleano,
    carrinhaAConfirmar: booleano,
    ativa: booleano,
  },
  casa: {
    nome: textoCurto('obrigatorio'),
    localId: { tipo: 'id', nulo: false },
    apartamento: textoCurto('opcional'),
    lotacao: lotacao(false),
    maxContrato: lotacao(true),
    tolerado: lotacao(true),
    notaContrato: textoLongo,
    sempreCheia: booleano,
    senhorio: textoLongo,
    equipamento: textoLongo,
  },
  carrinha: {
    matricula: { tipo: 'matricula' },
    matriculasAlternativas: { tipo: 'matriculas' },
    tipo: { tipo: 'escolha', opcoes: TIPOS_VEICULO },
    marca: textoCurto('opcional'),
    modelo: textoCurto('opcional'),
    lugares: { tipo: 'inteiro', max: LIMITES.lugaresMaximos, nulo: false },
    nota: textoLongo,
  },
  obra: {
    nome: textoCurto('obrigatorio'),
    clienteId: { tipo: 'id', nulo: false },
    localId: { tipo: 'id', nulo: false },
    estacionamentoLocalId: { tipo: 'id', nulo: true },
  },
  local: {
    nome: textoCurto('obrigatorio'),
    // Uma obra escolhida só no mapa pode ficar sem morada (só com a posição e o nome).
    morada: { tipo: 'texto', max: LIMITES.textoLongo, vazio: 'livre' },
    pais: { tipo: 'escolha', opcoes: PAISES },
    lat: { tipo: 'coordenada', eixo: 'lat' },
    lng: { tipo: 'coordenada', eixo: 'lng' },
  },
  indisponibilidade: { inicio: { tipo: 'dia', nulo: false }, fim: { tipo: 'dia', nulo: true } },
  problema: {
    texto: { tipo: 'texto', max: LIMITES.textoProblema, vazio: 'obrigatorio' },
    resolvidoEm: { tipo: 'dia', nulo: true },
  },
};

/** "lotação" → "Lotação". */
function maiuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('pt') + texto.slice(1);
}

/** Uma matrícula: maiúsculas, algarismos, espaços e hífenes, com pelo menos um algarismo. */
function erroMatricula(valor: unknown): string | null {
  if (typeof valor !== 'string') return 'tem de ser um texto.';
  if (valor.trim() === '') return 'não pode ficar vazia.';
  if (valor.length > LIMITES.matricula) return `tem no máximo ${LIMITES.matricula} caracteres.`;
  if (valor !== valor.trim() || !/^[A-Z0-9](?:[A-Z0-9 -]*[A-Z0-9])?$/.test(valor) || !/\d/.test(valor)) {
    return 'só letras maiúsculas, algarismos, espaços e hífenes (ex.: CF 5001).';
  }
  return null;
}

/** Forma de comparar matrículas ("CF 5001", "cf5001" e "CF-5001" são a mesma). */
export function chaveMatricula(matricula: string): string {
  return compactar(formatarMatricula(matricula));
}

function erroDaRegra(regra: Regra, valor: ValorCampo): string | null {
  switch (regra.tipo) {
    case 'texto': {
      if (valor === null) return regra.vazio === 'opcional' ? null : 'não pode ficar vazio.';
      if (typeof valor !== 'string') return 'tem de ser um texto.';
      if (valor === '') {
        if (regra.vazio === 'livre') return null;
        return regra.vazio === 'obrigatorio' ? 'não pode ficar vazio.' : 'fica vazio com null, não com "".';
      }
      if (valor !== valor.trim()) return 'sem espaços nas pontas.';
      if (/[\r\n\u2028\u2029]/.test(valor)) return 'sem quebras de linha.';
      if (valor.length > regra.max) return `tem no máximo ${regra.max} caracteres.`;
      return null;
    }
    case 'inteiro':
      if (valor === null) return regra.nulo ? null : 'não pode ficar vazio.';
      return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 && valor <= regra.max
        ? null
        : `tem de ser um número inteiro de 0 a ${regra.max}.`;
    case 'booleano':
      if (valor === null) return regra.nulo ? null : 'tem de ser sim ou não.';
      if (typeof valor === 'boolean') return null;
      return regra.nulo ? 'tem de ser sim, não ou não sei.' : 'tem de ser sim ou não.';
    case 'dia':
      if (valor === null) return regra.nulo ? null : 'falta o dia.';
      return eDia(valor) ? null : 'tem de ser um dia que exista (AAAA-MM-DD).';
    case 'id':
      if (valor === null) return regra.nulo ? null : 'falta escolher.';
      return typeof valor === 'string' && valor.length > 0 && valor.length <= 200
        ? null
        : 'escolha inválida.';
    case 'escolha':
      return typeof valor === 'string' && regra.opcoes.includes(valor)
        ? null
        : `tem de ser ${regra.opcoes.join(', ')}.`;
    case 'coordenada': {
      const [min, max] =
        regra.eixo === 'lat' ? [REGIAO_MAPA.sul, REGIAO_MAPA.norte] : [REGIAO_MAPA.oeste, REGIAO_MAPA.leste];
      return typeof valor === 'number' && Number.isFinite(valor) && valor >= min && valor <= max
        ? null
        : 'a posição fica fora da região do mapa.';
    }
    case 'matricula':
      return erroMatricula(valor);
    case 'matriculas': {
      if (!Array.isArray(valor)) return 'tem de ser uma lista de matrículas.';
      if (valor.length > LIMITES.matriculasAlternativas) {
        return `no máximo ${LIMITES.matriculasAlternativas} matrículas.`;
      }
      for (const m of valor) {
        const erro = erroMatricula(m);
        if (erro) return `${String(m)}: ${erro}`;
      }
      const chaves = valor.map((m: string) => chaveMatricula(m));
      return new Set(chaves).size === chaves.length ? null : 'há matrículas repetidas.';
    }
  }
}

/**
 * Erro (frase pronta a mostrar, ex.: "Lotação: tem de ser um número inteiro de 0 a 60.") se o valor não
 * serve para o campo: tipo, obrigatório, tamanho (LIMITES), textos aparados e sem quebras de linha, dia
 * AAAA-MM-DD que exista, país conhecido, coordenadas dentro de REGIAO_MAPA, matrícula no formato (até
 * LIMITES.matriculasAlternativas outras, sem repetidas). Os opcionais vazios são null (nunca "").
 * NÃO verifica referências (cliente, local) nem unicidade: isso vê-se no estado final (validarOperacoes).
 * null = serve.
 */
export function validarValorCampo<E extends EntidadeEditavel>(
  entidade: E,
  campo: CampoEditavel<E>,
  valor: ValorCampo,
): string | null {
  if (!eEntidadeEditavel(entidade) || !eCampoEditavel(entidade, campo)) {
    return `O campo ${String(campo)} não se pode mudar.`;
  }
  const v: ValorCampo = valor === undefined ? null : valor;
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) return 'Valor inválido.';
  const regra = (REGRAS[entidade] as Record<string, Regra>)[campo] as Regra;
  const erro = erroDaRegra(regra, v);
  if (!erro) return null;
  const rotulo = (ROTULO_CAMPO[entidade] as Record<string, string>)[campo] ?? campo;
  return `${maiuscula(rotulo)}: ${erro}`;
}

/** Os ids dos registos criados no programa: "obra-<uuid>", "indisp-<uuid>"… */
export const PADRAO_ID_NOVO = /^(pessoa|obra|local|indisp|problema)-[A-Za-z0-9-]{8,64}$/;

/**
 * Erros (frases sem o nome do registo) de um registo NOVO, antes de ver o estado: o id gerado no browser
 * (PADRAO_ID_NOVO, com o prefixo da entidade), cada campo editável (validarValorCampo) e a forma de um
 * registo acabado de criar: pessoa sem casa, carrinha nem obra, ativa, sem marcas "a confirmar", sem nomes
 * alternativos nem nº original; obra 'manual'; problema com exatamente um alvo e ainda aberto; local só do
 * tipo obra/estacionamento, com o raio entre LIMITES.raioMinimo e raioMaximo e a posição dentro da região
 * do mapa. O que depende do estado (o id já existe, referências, unicidade) vê-se em validarOperacoes.
 * [] = serve. Usada pelo validarOperacoes e pelo zod do servidor.
 */
export function validarRegisto(entidade: EntidadeCriavel, registo: unknown): string[] {
  if (registo === null || typeof registo !== 'object' || Array.isArray(registo)) return ['Registo inválido.'];
  const r = registo as Record<string, unknown>;
  const erros: string[] = [];
  const id = r.id;
  if (typeof id !== 'string' || !PADRAO_ID_NOVO.test(id) || !id.startsWith(`${PREFIXO_ID[entidade]}-`)) {
    erros.push(`Identificador inválido (tem de ser "${PREFIXO_ID[entidade]}-…", gerado pelo programa).`);
  }
  for (const campo of CAMPOS_EDITAVEIS[entidade] as readonly CampoEditavel<typeof entidade>[]) {
    const erro = validarValorCampo(entidade, campo, (r[campo] ?? null) as ValorCampo);
    if (erro) erros.push(erro);
  }
  switch (entidade) {
    case 'pessoa': {
      if (r.casaId != null || r.carrinhaId != null || r.obraId != null) {
        erros.push('Uma pessoa nova entra sem casa, carrinha nem obra (põe-se lá a seguir).');
      }
      if (r.ativa !== true) erros.push('Uma pessoa nova entra na empresa (ativa).');
      if (r.casaAConfirmar !== false || r.carrinhaAConfirmar !== false) {
        erros.push('Uma pessoa nova entra sem marcas "a confirmar".');
      }
      if (!Array.isArray(r.nomesAlternativos) || r.nomesAlternativos.length > 0) {
        erros.push('Uma pessoa nova entra sem nomes alternativos.');
      }
      if (r.numeroOriginal != null) erros.push('Uma pessoa nova entra sem nº original (é o da importação).');
      break;
    }
    case 'obra':
      if (r.origem !== 'manual') erros.push('Uma obra criada no programa é "manual".');
      break;
    case 'problema': {
      const alvos = [r.casaId, r.carrinhaId].filter((x) => x !== null && x !== undefined);
      if (alvos.length !== 1 || alvos.some((x) => typeof x !== 'string' || x === '')) {
        erros.push('Um problema é de uma casa ou de uma carrinha (exatamente uma).');
      }
      if (r.resolvidoEm != null) erros.push('Um problema novo começa aberto.');
      if (!eDia(r.abertoEm)) erros.push('Aberto em: tem de ser um dia que exista (AAAA-MM-DD).');
      break;
    }
    case 'indisponibilidade':
      if (typeof r.pessoaId !== 'string' || r.pessoaId === '') erros.push('Falta a pessoa.');
      break;
    case 'local':
      if (!(TIPOS_LOCAL_CRIAVEIS as readonly unknown[]).includes(r.tipo)) {
        erros.push(`Só se criam locais de ${TIPOS_LOCAL_CRIAVEIS.join(' ou ')}.`);
      }
      if (
        typeof r.raioM !== 'number' ||
        !Number.isInteger(r.raioM) ||
        r.raioM < LIMITES.raioMinimo ||
        r.raioM > LIMITES.raioMaximo
      ) {
        erros.push(`Raio: tem de ser um número inteiro de ${LIMITES.raioMinimo} a ${LIMITES.raioMaximo} m.`);
      }
      break;
  }
  return erros;
}
