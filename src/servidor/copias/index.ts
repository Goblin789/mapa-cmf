// Cópias de segurança da base de dados: de hora a hora, antes de cada migração e à mão.
// Cada cópia é um instantâneo consistente da BD (API de backup do SQLite), comprimido (gzip) e cifrado
// (AES-256-GCM, chave COPIAS_CHAVE) ANTES de sair do servidor. Destinos: pasta local (desenvolvimento e
// testes) ou S3 compatível (Cloudflare R2 na UE). Ver docs/m1.md e docs/recuperar.md.
//
// Módulos: config (COPIAS_*), cifra (formato do ficheiro), nomes, instantaneo, temporarios (BD decifrada em
// pastas temporárias que se apagam sempre), destinos/ (pasta e s3), retencao, agendador (cópias automáticas),
// restauro (verificado), migracoes (pendentes) e preparar (prepararBd).
// O comando `npm run copias` (scripts/copias.ts) usa comandos.ts.

import type { Bd } from '../db/ligacao';
import { criarServicoCopias } from './agendador';
import { criarDestino, type FetchS3 } from './destinos';
import { enviarCopia, tirarInstantaneo } from './instantaneo';
import { segredosDaConfig } from './preparar';
import type { ConfigCopias, ServicoCopias } from './tipos';

export { lerConfigCopias } from './config';
export { prepararBd } from './preparar';
export type { ConfigCopias, EstadoCopias, ServicoCopias } from './tipos';

/** Arranca as cópias automáticas. Sem config devolve um serviço inativo (estado().ativas = false). */
export function iniciarCopias(
  bd: Bd,
  config: ConfigCopias | null,
  opcoes: { producao?: boolean; agora?: () => Date; fetch?: FetchS3 } = {},
): ServicoCopias {
  if (!config) {
    return {
      estado: () => ({
        ativas: false,
        ultimaCopiaEm: null,
        // Em produção, não ter cópias é um problema (aparece no /api/saude).
        atrasada: Boolean(opcoes.producao),
        destino: null,
        ultimaTentativaEm: null,
        ultimoErro: null,
      }),
      fazerAgora: async () => {},
      parar: () => {},
    };
  }

  const destino = criarDestino(config, { fetch: opcoes.fetch });
  return criarServicoCopias({
    tipoDestino: destino.tipo,
    copiar: async (motivo, agora) =>
      enviarCopia(await tirarInstantaneo(bd.$client), destino, config.chave, motivo, agora),
    listar: () => destino.listar(),
    apagar: (nome) => destino.apagar(nome),
    agora: opcoes.agora,
    intervaloMs: config.intervaloMs,
    segredos: segredosDaConfig(config),
  });
}
