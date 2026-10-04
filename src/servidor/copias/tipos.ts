// Tipos partilhados pelos módulos das cópias de segurança (reexportados por index.ts).

import type { EstadoCopiasPublico } from '../../dominio/api';

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

/** Porque se fez a cópia (vai no nome do ficheiro). 'pc' = feita à mão no PC com `npm run copias`. */
export type MotivoCopia = 'hora' | 'manual' | 'arranque' | 'migracao' | 'pc';

export const MOTIVOS: readonly MotivoCopia[] = ['hora', 'manual', 'arranque', 'migracao', 'pc'];

/** Uma cópia guardada no destino. */
export interface CopiaNoDestino {
  nome: string;
  /** Bytes do ficheiro cifrado. */
  tamanho: number;
  /** Data da cópia (a do nome; se o nome não a tiver, a do destino). */
  data: Date;
}

/** Onde as cópias ficam guardadas: uma pasta (desenvolvimento e testes) ou um balde S3 (R2). */
export interface Destino {
  tipo: 'pasta' | 's3';
  enviar(nome: string, bytes: Uint8Array): Promise<void>;
  /** Só as cópias do Mapa (nomes começados por "mapa-"), por qualquer ordem. */
  listar(): Promise<CopiaNoDestino[]>;
  /** Lança ErroCopiaInexistente se não houver nenhuma cópia com esse nome. */
  obter(nome: string): Promise<Uint8Array>;
  apagar(nome: string): Promise<void>;
}

export class ErroCopiaInexistente extends Error {
  constructor(nome: string) {
    super(`Não há nenhuma cópia com o nome ${nome} no destino.`);
    this.name = 'ErroCopiaInexistente';
  }
}
