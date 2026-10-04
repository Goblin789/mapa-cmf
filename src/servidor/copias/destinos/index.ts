// Escolhe o destino das cópias a partir da configuração.

import type { ConfigCopias, Destino } from '../tipos';
import { criarDestinoPasta } from './pasta';
import { criarDestinoS3, type FetchS3 } from './s3';

export type { FetchS3 } from './s3';

export function criarDestino(config: ConfigCopias, opcoes: { fetch?: FetchS3 } = {}): Destino {
  const destino = config.destino;
  if (destino.tipo === 'pasta') return criarDestinoPasta(destino.caminho);
  return criarDestinoS3({ ...destino, fetch: opcoes.fetch });
}
