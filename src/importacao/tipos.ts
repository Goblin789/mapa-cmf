// Tipos da importação: dados iniciais (JSON), linhas lidas dos Excel, erros e discrepâncias.

import type { Estado, Id } from '../dominio/tipos';

// --- dados-iniciais/*.json (sem dados pessoais) ---

export interface ClienteInicial {
  id: Id;
  nome: string;
  /** Nome como aparece nos Excel (ex.: "GALÈRE"). */
  nomeExcel: string;
  nomesAlternativos?: string[];
  cor: string;
  sigla: string;
  interno: boolean;
  /** Pessoas segundo o documento de especificação. */
  pessoasDoc: number | null;
}

export interface CasaInicial {
  id: Id;
  nome: string;
  nomeExcel: string;
  localId: Id;
  apartamento: string | null;
  lotacao: number;
  /** Moradores segundo o documento de especificação. */
  moradoresDoc: number | null;
  maxContrato: number | null;
  tolerado: number | null;
  notaContrato: string | null;
}

export interface CarrinhaInicial {
  id: Id;
  matricula: string;
  matriculasAlternativas: string[];
  modelo: string | null;
  lugares: number;
  /** Pessoas segundo o documento de especificação. */
  pessoasDoc: number | null;
  nota: string | null;
}

export interface LocalInicial {
  id: Id;
  tipo: string;
  nome: string;
  morada: string;
  pais: string;
  lat: number | null;
  lng: number | null;
}

export interface ConfigImportacao {
  ficheiroListaMestra: string;
  folhaPessoal: string;
  folhaExtra: string;
  /** Nomes da folha "Não estão na lista" que entram (os outros ficam de fora). */
  extrasAIncluir: string[];
  ficheiroMichael: string;
  valoresEspeciais: { foraDasCasas: string; semTransporte: string };
  /** Nome curto da lista → outros nomes para a pesquisa. */
  nomesAlternativos: Record<string, string[]>;
  /** Nome escrito pelo Michael → nome curto da lista. */
  aliasesMichael: Record<string, string>;
}

export interface DadosIniciais {
  clientes: ClienteInicial[];
  casas: CasaInicial[];
  carrinhas: CarrinhaInicial[];
  locais: LocalInicial[];
  importacao: ConfigImportacao;
}

// --- Resultado da importação ---

/** O que se grava na base de dados. */
export type Entidades = Omit<Estado, 'versao' | 'geradoEm'>;

export interface ErroImportacao {
  /** Um erro bloqueante impede o --aplicar. */
  bloqueante: boolean;
  mensagem: string;
  /** Ex.: "Pessoal, linha 12". */
  onde?: string;
}

/** Uma linha de pessoa lida da lista mestra (folha Pessoal ou "Não estão na lista"). */
export interface LinhaLista {
  folha: string;
  /** Linha no Excel (1 = primeira). */
  linha: number;
  numero: string | null;
  apelidos: string;
  nome: string;
  nomeCurto: string;
  cliente: string | null;
  casa: string | null;
  carrinha: string | null;
  observacoes: string | null;
}

export type TipoNormalizacao = 'numero' | 'cliente' | 'casa' | 'carrinha' | 'nomeAlternativo';

export interface Normalizacao {
  tipo: TipoNormalizacao;
  de: string;
  para: string;
  /** Quantas pessoas foram afetadas. */
  pessoas: number;
  /** Ex.: o nome curto da pessoa, quando é só uma. */
  nota: string | null;
}

/** Pessoa marcada "a confirmar" e porquê. */
export interface Pendente {
  pessoaId: Id;
  nomeCurto: string;
  motivos: string[];
  observacoes: string | null;
}

// --- Ficheiro do Michael (só para cruzar) ---

export interface GrupoMichael {
  /** Cabeçalho tal como está na folha (nome da casa, matrícula, cliente…). */
  rotulo: string;
  /** Célula do cabeçalho, ex.: "B3". */
  celula: string;
  nomes: string[];
  /** Contagem escrita pelo Michael por baixo dos nomes; null se não houver. */
  contagem: number | null;
}

export interface DadosMichael {
  casas: GrupoMichael[];
  foraDasCasas: GrupoMichael | null;
  /** Lista à parte de pessoas sem casa (a salmão). */
  semCasa: GrupoMichael | null;
  empresas: GrupoMichael[];
  viaturas: GrupoMichael[];
  semTransporte: GrupoMichael | null;
  folhas: { casas: string | null; empresas: string | null; viaturas: string | null };
  avisos: ErroImportacao[];
}

// --- Discrepâncias ---

export interface LinhaContagem {
  /** Id da casa/carrinha/cliente; null para "Fora das casas", "Sem transporte" ou cabeçalhos só do Michael. */
  id: Id | null;
  rotulo: string;
  /** Lotação da casa ou lugares da carrinha. */
  capacidade: number | null;
  /** Segundo o documento de especificação. */
  documento: number | null;
  lista: number;
  /** Nomes contados na folha do Michael; null se a folha não existe. */
  michael: number | null;
  /** Número escrito pelo Michael por baixo dos nomes (pode não bater com os nomes). */
  michaelDeclarado: number | null;
}

export type CampoComparado = 'casa' | 'carrinha' | 'cliente';

export interface DiferencaPessoa {
  pessoaId: Id;
  nomeCurto: string;
  campo: CampoComparado;
  lista: string;
  michael: string;
}

export interface SoNoMichael {
  nomeMichael: string;
  onde: string[];
  /** Está na folha "Não estão na lista" (e ficou de fora por decisão). */
  naFolhaExtra: boolean;
  /** Nome curto da lista muito parecido (provável erro de escrita: acrescentar a aliasesMichael). */
  parecido: string | null;
}

export interface SemCasaMichael {
  nomeMichael: string;
  pessoaId: Id | null;
  nomeCurto: string | null;
  casaLista: string | null;
}

export interface Discrepancias {
  michaelDisponivel: boolean;
  contagensCasas: LinhaContagem[];
  contagensCarrinhas: LinhaContagem[];
  contagensClientes: LinhaContagem[];
  diferencas: DiferencaPessoa[];
  soNoMichael: SoNoMichael[];
  soNaLista: { pessoaId: Id; nomeCurto: string }[];
  /** Nomes que aparecem mais de uma vez na mesma folha do Michael. */
  repetidosNoMichael: { nomeMichael: string; folha: string; onde: string[] }[];
  semCasaMichael: SemCasaMichael[];
  /** Nomes do Michael lidos através de aliasesMichael ou dos nomes alternativos. */
  aliasesUsados: { nomeMichael: string; nomeCurto: string }[];
}
