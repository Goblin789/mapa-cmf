// Formato dos pedidos e respostas da API, partilhado pelo browser e pelo servidor (sem I/O).

import type { Conflito, Operacao } from './operacoes';

export interface PedidoGuardar {
  /** Versão do estado sobre a qual as alterações foram feitas (informativa; os conflitos vêm do `de`). */
  versaoBase: number;
  operacoes: Operacao[];
  comentario?: string;
}

export interface RespostaGuardar {
  loteId: number;
  versao: number;
}

/** Conflito devolvido pelo servidor, já com a frase pronta a mostrar. */
export interface ConflitoServidor extends Conflito {
  descricao: string;
}

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
  autor: string;
  criadoEm: string;
  efetivoEm: string;
  tipo: string;
  estado: string;
  comentario: string | null;
  alteracoes: AlteracaoHistorico[];
}
