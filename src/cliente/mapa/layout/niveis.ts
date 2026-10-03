// Nível de detalhe dos cartões conforme o zoom:
// - resumo: uma pastilha por grupo ("Himeling · 4 casas · 31/32");
// - lugares: cada casa/carrinha com um quadradinho por lugar, da cor do cliente;
// - nomes: cada lugar com o nome da pessoa.
// Num ecrã de 1920×1080 a enquadrar tudo (zoom ~10–10,75) fica em "lugares";
// num telemóvel (enquadramento ~9–9,5) fica em "resumo".

export type NivelDetalhe = 'resumo' | 'lugares' | 'nomes';

/** Nível dos cartões de casa e carrinha (o resumo só existe no grupo). */
export type NivelCartao = Exclude<NivelDetalhe, 'resumo'>;

/** Zoom a partir do qual se passa a cada nível. */
export const LIMITES_NIVEL = { lugares: 10, nomes: 13 } as const;

/** Abaixo desta largura do mapa (telemóvel), os limites sobem meio zoom: o ecrã é estreito. */
export const LARGURA_ESTREITA = 640;
const AJUSTE_ESTREITO = 0.5;

export function nivelDetalhe(zoom: number, larguraMapa: number = Number.POSITIVE_INFINITY): NivelDetalhe {
  const ajuste = larguraMapa < LARGURA_ESTREITA ? AJUSTE_ESTREITO : 0;
  if (zoom >= LIMITES_NIVEL.nomes + ajuste) return 'nomes';
  if (zoom >= LIMITES_NIVEL.lugares + ajuste) return 'lugares';
  return 'resumo';
}
