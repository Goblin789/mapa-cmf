// Formato dos pedidos e respostas da API, partilhado pelo browser e pelo servidor (sem I/O).

import type { Conflito, Operacao } from './operacoes';
import type { Pais } from './tipos';

export interface PedidoGuardar {
  /**
   * Versão do estado sobre a qual o rascunho foi feito. Os conflitos vêm do `de`; a versão serve também
   * para o servidor reconhecer conflitos escondidos pela regra do condutor.
   */
  versaoBase: number;
  operacoes: Operacao[];
  comentario?: string;
  /**
   * M2: lotes que este rascunho reverte ("Reverter" no Histórico pôs as operações inversas no rascunho).
   * Fica no lote (lotes.reverte) e o Histórico diz "Reverte a gravação nº N". Sem reversões: ausente.
   */
  reverte?: number[];
}

export interface RespostaGuardar {
  loteId: number;
  versao: number;
}

/** Conflito devolvido pelo servidor, já com a frase pronta a mostrar. */
export type ConflitoServidor = Conflito & { descricao: string };

export interface AlteracaoHistorico {
  entidade: string;
  entidadeId: string;
  campo: string;
  /** Valores em JSON, como estão na base de dados (null = não existia). */
  antes: string | null;
  depois: string | null;
  /** Frase pronta a mostrar (ex.: "Ana Exemplo — casa: Casa A → Casa B"). */
  descricao: string;
}

export interface EntradaHistorico {
  loteId: number;
  /** Chave do autor, como está em lotes.autor (e-mail, 'local', 'importacao', 'dados-iniciais'…). */
  autor: string;
  /** Nome a mostrar (ex.: "Michael Exemplo", "Este computador", "Dados iniciais"). */
  autorNome: string;
  criadoEm: string;
  efetivoEm: string;
  tipo: string;
  estado: string;
  comentario: string | null;
  alteracoes: AlteracaoHistorico[];
  /** M2: lotes que este lote reverteu (vazio ou ausente = nenhum). */
  reverte?: number[];
  /** M2: lotes gravados depois que reverteram este (vazio ou ausente = nenhum). */
  revertidoPor?: number[];
}

/**
 * M2 — geocodificação no servidor (POST /api/geocodificar), como scripts/geocodificar.ts: geoportail.lu no
 * Luxemburgo, IGN (Géoplateforme) em França, Nominatim na Bélgica e na Alemanha. O browser nunca fala com
 * estes serviços (a política de conteúdo só deixa falar com o próprio servidor).
 */
export interface PedidoGeocodificar {
  /** A morada como se escreveu (até 300 caracteres). */
  morada: string;
  pais: Pais;
}

export interface ResultadoGeocodificacao {
  /** A morada como o serviço a devolveu (ex.: "12 Rue de Hobscheid, L-8473 Eischen"). */
  rotulo: string;
  lat: number;
  lng: number;
  pais: Pais;
  /** "geoportail.lu", "IGN Géoplateforme", "Nominatim". */
  fonte: string;
  /** 0 a 1; abaixo de 0,8 o ecrã pede para confirmar o pino. */
  confianca: number;
}

/** Até 5 resultados, o melhor primeiro ([] = nada encontrado). */
export interface RespostaGeocodificar {
  resultados: ResultadoGeocodificacao[];
}

/** POST /api/geocodificar/inverso: a morada de um ponto clicado no mapa. */
export interface PedidoGeocodificarInverso {
  lat: number;
  lng: number;
}

/** null = o serviço não encontrou morada (a obra pode ficar só com a posição e um nome). */
export interface RespostaGeocodificarInverso {
  resultado: ResultadoGeocodificacao | null;
}

/** Quem tem a sessão iniciada (GET /api/auth/eu). */
export interface Utilizador {
  /** O que fica em lotes.autor: o e-mail em minúsculas, ou 'local' no modo sem login. */
  chave: string;
  nome: string;
  email: string | null;
  /** 'local' = servidor no PC sem login (só aceita o próprio PC). */
  modo: 'entra' | 'local';
}

/** Tempo real (GET /api/eventos, evento SSE "lote"): alguém gravou um lote. */
export interface EventoLote {
  /** Versão do estado depois deste lote. */
  versao: number;
  loteId: number;
  /**
   * Chave do autor (como Utilizador.chave). O browser de quem gravou não se avisa a si próprio, mas
   * reconhece-o pelo loteId (os lotes gravados por esse separador), não pelo autor.
   */
  autor: string;
  autorNome: string;
  /** Quantas operações o lote tinha. */
  alteracoes: number;
}

/** Estado das cópias de segurança, sem segredos nem nomes de ficheiros. */
export interface EstadoCopiasPublico {
  /** Há destino configurado e as cópias automáticas estão a correr. */
  ativas: boolean;
  /** ISO da última cópia que chegou ao destino, ou null. */
  ultimaCopiaEm: string | null;
  /** Ativas e sem cópia há mais de 3 h (ou nunca), ou não ativas em produção. */
  atrasada: boolean;
}

/** GET /api/saude: público, sem dados pessoais. 503 quando a base de dados não responde. */
export interface RespostaSaude {
  ok: boolean;
  versao?: number;
  copias?: EstadoCopiasPublico;
  /**
   * Commit da versão em produção (RENDER_GIT_COMMIT no Render; não é dado pessoal). Serve ao
   * `npm run publicar -- --esperar` para reconhecer a versão nova. Ausente fora do Render.
   */
  commit?: string;
  geradoEm: string;
  erro?: string;
}
