// Regras dos cliques nos cartões que não dependem do DOM (testáveis em Node).

/**
 * O clique que o browser gera ao largar o rato depois de arrastar o mapa a partir de um cartão
 * não é um clique no cartão. Só conta um clique de rato/toque (`detail` > 0): o Leaflet só esquece
 * o arrastamento no mousedown seguinte, por isso um Enter/Espaço num cartão com o foco do teclado
 * (`detail` 0) depois de arrastar o mapa tem de passar.
 */
export function eCliqueDeArrastar(detalheDoClique: number, mapaFoiArrastado: boolean): boolean {
  return mapaFoiArrastado && detalheDoClique > 0;
}
