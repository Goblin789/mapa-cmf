// Tipos partilhados pelo browser, pelo servidor e pelos scripts.
// É o contrato do "estado": o servidor monta-o a partir da base de dados (GET /api/estado)
// e o browser só lê isto. Não importar nada do servidor nem do browser aqui.

export type Id = string;

export interface Cliente {
  id: Id;
  nome: string;
  /** Cor no formato #RRGGBB. Cada cliente tem uma cor única. */
  cor: string;
  /** Sigla de 2 letras mostrada nos nomes (os azuis confundem-se num projetor). */
  sigla: string;
  /** Grupo interno (ex.: Enquadramento), não um cliente com obras. */
  interno: boolean;
  ordem: number;
}

export const TIPOS_LOCAL = [
  'casa',
  'obra',
  'estacionamento',
  'oficina',
  'escritorio',
  'bomba',
  'outro',
] as const;
export type TipoLocal = (typeof TIPOS_LOCAL)[number];

export const PAISES = ['LU', 'FR', 'BE', 'DE'] as const;
export type Pais = (typeof PAISES)[number];

/** Um ponto no mapa. Uma morada partilhada por várias casas é um só local. */
export interface Local {
  id: Id;
  tipo: TipoLocal;
  nome: string;
  morada: string;
  pais: Pais;
  lat: number | null;
  lng: number | null;
  raioM: number;
}

export interface Casa {
  id: Id;
  nome: string;
  localId: Id;
  apartamento: string | null;
  /** Lugares da casa = moradores + vagas. */
  lotacao: number;
  /** Máximo de pessoas do contrato; null = não fixado / desconhecido. */
  maxContrato: number | null;
  /** Máximo tolerado pelo senhorio acima do contrato; null = sem tolerância conhecida. */
  tolerado: number | null;
  notaContrato: string | null;
  senhorio: string | null;
  equipamento: string | null;
  /**
   * Casa que conta sempre como cheia (ex.: casas do enquadramento): os lugares são os moradores,
   * sem vagas, e não entra nos lugares livres.
   */
  sempreCheia: boolean;
  ordem: number;
}

export const TIPOS_VEICULO = ['carrinha', 'carro'] as const;
export type TipoVeiculo = (typeof TIPOS_VEICULO)[number];

/** Um veículo da frota: carrinha ou carro (o nome "Carrinha" ficou por ser o caso mais comum). */
export interface Carrinha {
  id: Id;
  matricula: string;
  tipo: TipoVeiculo;
  marca: string | null;
  /** Outras matrículas pelas quais é conhecida (pesquisa). */
  matriculasAlternativas: string[];
  modelo: string | null;
  /** Lugares, incluindo o do condutor. */
  lugares: number;
  /** Casa onde dorme, quando definida. */
  dormeCasaId: Id | null;
  /** Outro local onde dorme (ex.: estacionamento), quando não é uma casa. */
  dormeLocalId: Id | null;
  /** Carro de substituição. */
  temporaria: boolean;
  /** Condutor (tem de ir nesta carrinha). Aparece sempre em primeiro na lista da carrinha. */
  condutorId: Id | null;
  nota: string | null;
  ordem: number;
}

export interface Obra {
  id: Id;
  nome: string;
  clienteId: Id;
  localId: Id;
  estacionamentoLocalId: Id | null;
  origem: 'gps' | 'manual';
}

export interface Pessoa {
  id: Id;
  /** Nº normalizado (sem espaços, com o sufixo: 900-001 e 900-001_2 são pessoas diferentes). */
  numero: string | null;
  numeroOriginal: string | null;
  apelidos: string;
  nome: string;
  /** Nome curto mostrado no mapa; único. */
  nomeCurto: string;
  /** Outros nomes pelos quais a pessoa é conhecida (pesquisa). */
  nomesAlternativos: string[];
  /** Cliente da pessoa enquanto não tem obra. Com obra, manda o cliente da obra. */
  clienteId: Id;
  obraId: Id | null;
  /** null = "Fora das casas CMF". */
  casaId: Id | null;
  /** null = "Sem transporte da empresa". */
  carrinhaId: Id | null;
  /** A casa (ou a falta dela) veio vazia/duvidosa na importação e precisa de confirmação. */
  casaAConfirmar: boolean;
  carrinhaAConfirmar: boolean;
  telefone: string | null;
  temCarta: boolean | null;
  /** Data ISO (AAAA-MM-DD). */
  cartaValidade: string | null;
  ativa: boolean;
}

export interface Estado {
  /** Aumenta a cada gravação; o browser usa-o para saber se tem a versão mais recente. */
  versao: number;
  /** Data/hora ISO em que o estado foi montado. */
  geradoEm: string;
  clientes: Cliente[];
  locais: Local[];
  casas: Casa[];
  carrinhas: Carrinha[];
  obras: Obra[];
  pessoas: Pessoa[];
}
