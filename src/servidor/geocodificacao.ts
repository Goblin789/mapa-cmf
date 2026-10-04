// Geocodificação no servidor (M2, docs/m2.md, "Geocodificação"): a morada escrita → posições possíveis, e
// um ponto clicado no mapa → a morada. Luxemburgo: geoportail.lu; França: IGN (Géoplateforme); Bélgica e
// Alemanha: Nominatim (OSM; User-Agent próprio, no máximo 1 pedido por segundo). O browser nunca fala com
// estes serviços: pede ao servidor (POST /api/geocodificar e /api/geocodificar/inverso).
// Os testes usam SEMPRE um `fetch` falso; os serviços verdadeiros só num ensaio pontual à mão.
//
// CONTRATO DO M2: a interface `Geocodificador`, o `ErroGeocodificacao` e a assinatura de
// `criarGeocodificador` estão fechados. As rotas (app.ts, módulo base) usam só a interface; a implementação
// dos serviços é do módulo "historico-moradas". Até lá, `criarGeocodificador` devolve um que recusa tudo
// com o tipo 'desligado' (as rotas respondem 503 e o ecrã deixa escolher o sítio no mini-mapa).

import type { ResultadoGeocodificacao } from '../dominio/api';
import type { Pais } from '../dominio/tipos';

/** O que as rotas usam. */
export interface Geocodificador {
  /** Até 5 resultados, o melhor primeiro ([] = nada encontrado). Lança ErroGeocodificacao. */
  procurar(morada: string, pais: Pais): Promise<ResultadoGeocodificacao[]>;
  /** A morada de um ponto (null = o serviço não encontrou nenhuma). Lança ErroGeocodificacao. */
  inverso(lat: number, lng: number): Promise<ResultadoGeocodificacao | null>;
}

/**
 * Falha de um serviço de moradas. 'tempo' = não respondeu a tempo (8 s); 'servico' = respondeu com erro ou
 * com uma resposta que não se percebe; 'desligado' = não há geocodificador. A mensagem nunca leva a morada.
 */
export class ErroGeocodificacao extends Error {
  readonly tipo: 'tempo' | 'servico' | 'desligado';
  constructor(tipo: 'tempo' | 'servico' | 'desligado', mensagem: string) {
    super(mensagem);
    this.name = 'ErroGeocodificacao';
    this.tipo = tipo;
  }
}

export interface OpcoesGeocodificador {
  /** O fetch a usar (o global no index.ts; um falso nos testes). */
  fetch: typeof fetch;
  /** User-Agent dos pedidos (o Nominatim exige um que identifique a aplicação). */
  agente: string;
  /** Para a fila do Nominatim (1 pedido/s); nos testes, uma que não espera. */
  esperar?: (ms: number) => Promise<void>;
  /** Tempo limite de cada pedido, em ms (omissão: 8000). */
  limiteMs?: number;
}

/** CONTRATO DO M2: provisório (recusa tudo com 'desligado'); o módulo "historico-moradas" implementa. */
export function criarGeocodificador(opcoes: OpcoesGeocodificador): Geocodificador {
  void opcoes;
  const desligado = () =>
    Promise.reject(new ErroGeocodificacao('desligado', 'O serviço de moradas ainda não está ligado.'));
  return { procurar: desligado, inverso: desligado };
}
