// Fichas editáveis (M2): que entidades e que campos se mudam no programa, que registos se criam e se
// apagam, e os limites de cada campo. É a tabela de que dependem a operação 'campo' e a 'registo'
// (dominio/operacoes.ts), a validação do servidor e os editores das fichas. Funções puras.
//
// CONTRATO DO M2 (docs/m2.md): os tipos, as listas e as assinaturas são o contrato entre módulos; a
// validação fina (`validarValorCampo`, `validarRegisto`) é do módulo base.
//
// O que NÃO entra aqui de propósito:
// - casa/carrinha/obra da pessoa (`casaId`, `carrinhaId`, `obraId`), o condutor e onde dorme a carrinha:
//   têm operações próprias ('mover', 'condutor', 'dormida'), com as suas regras;
// - o motivo de uma indisponibilidade: não existe (só a pessoa e as datas);
// - datas de CT/revisão/correia e estados da carrinha: M3.

import type {
  Carrinha,
  Casa,
  Estado,
  Id,
  Indisponibilidade,
  Local,
  Obra,
  Pessoa,
  Problema,
  TipoLocal,
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

/**
 * Erro (frase pronta a mostrar) se o valor não serve para o campo: tipo, obrigatório, tamanho, limites,
 * dia AAAA-MM-DD válido, país conhecido, coordenadas dentro de REGIAO_MAPA, matrícula no formato.
 * NÃO verifica referências (cliente, local) nem unicidade: isso vê-se no estado final (validarOperacoes).
 * null = serve.
 * CONTRATO DO M2: implementação mínima (só o tipo); a regra completa é do módulo base.
 */
export function validarValorCampo<E extends EntidadeEditavel>(
  entidade: E,
  campo: CampoEditavel<E>,
  valor: ValorCampo,
): string | null {
  if (!eCampoEditavel(entidade, campo)) return `O campo ${String(campo)} não se pode mudar.`;
  if (valor !== null && typeof valor === 'object' && !Array.isArray(valor)) return 'Valor inválido.';
  return null;
}
