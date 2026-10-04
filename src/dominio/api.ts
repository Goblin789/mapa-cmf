// Formato dos pedidos e respostas da API, partilhado pelo browser e pelo servidor (sem I/O).

import type { Conflito, Operacao } from './operacoes';

export interface PedidoGuardar {
  /**
   * Versão do estado sobre a qual o rascunho foi feito. Os conflitos vêm do `de`; a versão serve também
   * para o servidor reconhecer conflitos escondidos pela regra do condutor.
   */
  versaoBase: number;
  operacoes: Operacao[];
  comentario?: string;
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
  /** Chave do autor (como Utilizador.chave): o browser de quem gravou não se avisa a si próprio. */
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
  geradoEm: string;
  erro?: string;
}
