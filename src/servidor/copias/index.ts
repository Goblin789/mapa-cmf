// Cópias de segurança da base de dados: de hora a hora, antes de cada migração e à mão.
// Cada cópia é um instantâneo consistente da BD (API de backup do SQLite), comprimido (gzip) e cifrado
// (AES-256-GCM, chave COPIAS_CHAVE) ANTES de sair do servidor. Destinos: pasta local (desenvolvimento e
// testes) ou S3 compatível (Cloudflare R2 na UE). Ver docs/m1.md e docs/recuperar.md.
//
// CONTRATO DO M1 — implementação por fazer (peça "cópias").

import type { EstadoCopiasPublico } from '../../dominio/api';
import type { Bd } from '../db/ligacao';

/** Configuração lida do ambiente. Os segredos nunca aparecem em mensagens nem no /api/saude. */
export interface ConfigCopias {
  /** Chave AES-256 (32 bytes). */
  chave: Uint8Array;
  destino:
    | { tipo: 'pasta'; caminho: string }
    | {
        tipo: 's3';
        endpoint: string;
        balde: string;
        regiao: string;
        id: string;
        segredo: string;
      };
  /** Intervalo das cópias automáticas, em ms. Omissão: 1 h. */
  intervaloMs?: number;
}

export interface EstadoCopias extends EstadoCopiasPublico {
  /** 'pasta' ou 's3' (sem caminhos nem credenciais). */
  destino: string | null;
  ultimaTentativaEm: string | null;
  /** Mensagem curta do último erro, sem segredos. */
  ultimoErro: string | null;
}

export interface ServicoCopias {
  estado(): EstadoCopias;
  /** Faz uma cópia já (e aplica a retenção). Não lança: o erro fica em estado().ultimoErro. */
  fazerAgora(motivo: 'hora' | 'manual' | 'arranque'): Promise<void>;
  /** Pára as cópias automáticas (ao encerrar o servidor). */
  parar(): void;
}

/**
 * Lê COPIAS_* do ambiente. null = sem cópias (sem COPIAS_DESTINO). Lança com uma mensagem clara se a
 * configuração estiver incompleta ou a chave não tiver 32 bytes.
 */
export function lerConfigCopias(_env: NodeJS.ProcessEnv): ConfigCopias | null {
  return null;
}

/**
 * Corre ANTES de abrir a BD: se o ficheiro não existir e RESTAURAR_AO_ARRANCAR estiver definido, restaura
 * essa cópia ('ultima' ou um nome) e verifica-a; se a BD existir e houver migrações por aplicar, faz uma
 * cópia (motivo 'migracao') antes de as aplicar. Nunca substitui uma BD que exista.
 */
export async function prepararBd(
  _caminhoBd: string,
  _config: ConfigCopias | null,
  _env: NodeJS.ProcessEnv,
): Promise<void> {}

/** Arranca as cópias automáticas. Sem config devolve um serviço inativo (estado().ativas = false). */
export function iniciarCopias(
  _bd: Bd,
  _config: ConfigCopias | null,
  _opcoes: { producao?: boolean } = {},
): ServicoCopias {
  return {
    estado: () => ({
      ativas: false,
      ultimaCopiaEm: null,
      atrasada: Boolean(_opcoes.producao),
      destino: null,
      ultimaTentativaEm: null,
      ultimoErro: null,
    }),
    fazerAgora: async () => {},
    parar: () => {},
  };
}
