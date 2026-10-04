// Esquema da base de dados (SQLite + Drizzle).
// Depois de mudar este ficheiro: `npm run bd:gerar` cria a migração em ./migracoes.
// Nunca editar uma migração já aplicada; criar sempre uma nova.

import { sql } from 'drizzle-orm';
import { type AnySQLiteColumn, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { PAISES, TIPOS_LOCAL, TIPOS_VEICULO } from '../../dominio/tipos';

export const clientes = sqliteTable('clientes', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  cor: text('cor').notNull().unique(),
  sigla: text('sigla').notNull().unique(),
  interno: integer('interno', { mode: 'boolean' }).notNull().default(false),
  ordem: integer('ordem').notNull().default(0),
});

export const locais = sqliteTable('locais', {
  id: text('id').primaryKey(),
  tipo: text('tipo', { enum: TIPOS_LOCAL }).notNull(),
  nome: text('nome').notNull(),
  morada: text('morada').notNull(),
  pais: text('pais', { enum: PAISES }).notNull(),
  lat: real('lat'),
  lng: real('lng'),
  raioM: integer('raio_m').notNull().default(150),
});

export const casas = sqliteTable('casas', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull().unique(),
  localId: text('local_id')
    .notNull()
    .references(() => locais.id),
  apartamento: text('apartamento'),
  lotacao: integer('lotacao').notNull(),
  maxContrato: integer('max_contrato'),
  tolerado: integer('tolerado'),
  notaContrato: text('nota_contrato'),
  senhorio: text('senhorio'),
  equipamento: text('equipamento'),
  sempreCheia: integer('sempre_cheia', { mode: 'boolean' }).notNull().default(false),
  ordem: integer('ordem').notNull().default(0),
});

export const carrinhas = sqliteTable('carrinhas', {
  id: text('id').primaryKey(),
  matricula: text('matricula').notNull().unique(),
  matriculasAlternativas: text('matriculas_alternativas', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  tipo: text('tipo', { enum: TIPOS_VEICULO }).notNull().default('carrinha'),
  marca: text('marca'),
  modelo: text('modelo'),
  lugares: integer('lugares').notNull(),
  dormeCasaId: text('dorme_casa_id').references(() => casas.id),
  dormeLocalId: text('dorme_local_id').references(() => locais.id),
  temporaria: integer('temporaria', { mode: 'boolean' }).notNull().default(false),
  /** Condutor atual (o histórico de quem conduziu fica nas alterações dos lotes). */
  condutorId: text('condutor_id').references((): AnySQLiteColumn => pessoas.id),
  nota: text('nota'),
  ordem: integer('ordem').notNull().default(0),
});

export const obras = sqliteTable('obras', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  clienteId: text('cliente_id')
    .notNull()
    .references(() => clientes.id),
  localId: text('local_id')
    .notNull()
    .references(() => locais.id),
  estacionamentoLocalId: text('estacionamento_local_id').references(() => locais.id),
  origem: text('origem', { enum: ['gps', 'manual'] }).notNull(),
});

export const pessoas = sqliteTable('pessoas', {
  id: text('id').primaryKey(),
  numero: text('numero').unique(),
  numeroOriginal: text('numero_original'),
  apelidos: text('apelidos').notNull(),
  nome: text('nome').notNull(),
  nomeCurto: text('nome_curto').notNull().unique(),
  nomesAlternativos: text('nomes_alternativos', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  clienteId: text('cliente_id')
    .notNull()
    .references(() => clientes.id),
  obraId: text('obra_id').references(() => obras.id),
  casaId: text('casa_id').references(() => casas.id),
  carrinhaId: text('carrinha_id').references(() => carrinhas.id),
  casaAConfirmar: integer('casa_a_confirmar', { mode: 'boolean' }).notNull().default(false),
  carrinhaAConfirmar: integer('carrinha_a_confirmar', { mode: 'boolean' }).notNull().default(false),
  telefone: text('telefone'),
  temCarta: integer('tem_carta', { mode: 'boolean' }),
  cartaValidade: text('carta_validade'),
  ativa: integer('ativa', { mode: 'boolean' }).notNull().default(true),
});

/** Um conjunto de alterações gravado de uma vez (ou agendado). O histórico vive aqui. */
export const lotes = sqliteTable('lotes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  autor: text('autor').notNull(),
  /** Data/hora ISO da gravação. */
  criadoEm: text('criado_em').notNull(),
  /** Data/hora ISO a partir da qual vale. */
  efetivoEm: text('efetivo_em').notNull(),
  estado: text('estado', { enum: ['aplicado', 'agendado', 'cancelado', 'falhou'] }).notNull(),
  tipo: text('tipo', { enum: ['importacao', 'mudanca', 'correcao', 'ficha'] }).notNull(),
  comentario: text('comentario'),
});

/** Uma alteração de um campo. Só se acrescenta (exceto limpezas de retenção). */
export const alteracoes = sqliteTable('alteracoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loteId: integer('lote_id')
    .notNull()
    .references(() => lotes.id),
  entidade: text('entidade').notNull(),
  entidadeId: text('entidade_id').notNull(),
  campo: text('campo').notNull(),
  /** Valores em JSON; null = não existia. */
  antes: text('antes'),
  depois: text('depois'),
});

/** Quem já entrou com a conta Microsoft (Entra ID). Os lotes guardam o e-mail (`lotes.autor`). */
export const utilizadores = sqliteTable('utilizadores', {
  /** oid do Entra: não muda mesmo que o e-mail ou o nome mudem. */
  id: text('id').primaryKey(),
  /** Em minúsculas; é a chave do autor nos lotes. */
  email: text('email').notNull().unique(),
  nome: text('nome').notNull(),
  criadoEm: text('criado_em').notNull(),
  ultimaEntradaEm: text('ultima_entrada_em').notNull(),
});

/** Sessões abertas. O token só existe no cookie do browser: aqui fica o hash. */
export const sessoes = sqliteTable(
  'sessoes',
  {
    /** SHA-256 (hex) do token do cookie. */
    id: text('id').primaryKey(),
    utilizadorId: text('utilizador_id')
      .notNull()
      .references(() => utilizadores.id, { onDelete: 'cascade' }),
    criadaEm: text('criada_em').notNull(),
    /** Gravado no máximo uma vez por hora (a inatividade conta-se a partir daqui). */
    ultimoUsoEm: text('ultimo_uso_em').notNull(),
    /** Limite absoluto (criada_em + 90 dias), mesmo com uso. */
    expiraEm: text('expira_em').notNull(),
  },
  (t) => [
    index('sessoes_utilizador_idx').on(t.utilizadorId),
    index('sessoes_expira_idx').on(t.expiraEm),
    index('sessoes_ultimo_uso_idx').on(t.ultimoUsoEm),
  ],
);

/** Pedidos de login à espera do regresso da Microsoft (no máximo 10 minutos, uso único). */
export const pedidosLogin = sqliteTable(
  'pedidos_login',
  {
    /** Parâmetro `state` do OpenID (também vai no cookie mapa-login). */
    estado: text('estado').primaryKey(),
    nonce: text('nonce').notNull(),
    /** code_verifier do PKCE. */
    verificador: text('verificador').notNull(),
    /** Caminho para onde voltar depois de entrar. */
    destino: text('destino').notNull(),
    criadoEm: text('criado_em').notNull(),
  },
  (t) => [index('pedidos_login_criado_idx').on(t.criadoEm)],
);
