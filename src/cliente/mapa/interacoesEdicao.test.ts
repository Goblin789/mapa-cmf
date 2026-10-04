import { describe, expect, it } from 'vitest';
import { REGIAO_MAPA } from '../../dominio/campos';
import { ofereceNovaObra } from './interacoesEdicao';

const BASE = {
  modoEdicao: true,
  reuniao: false,
  escondido: false,
  aArrastar: false,
  noFundo: true,
  lat: 49.61,
  lng: 6.13,
};

describe('"Nova obra aqui" (clique direito ou toque longo no fundo do mapa)', () => {
  it('oferece no modo de edição, no fundo do mapa e dentro da região', () => {
    expect(ofereceNovaObra(BASE)).toBe(true);
  });

  it('não oferece fora do modo de edição, na reunião, com o mapa escondido, a arrastar ou num cartão', () => {
    expect(ofereceNovaObra({ ...BASE, modoEdicao: false })).toBe(false);
    expect(ofereceNovaObra({ ...BASE, reuniao: true })).toBe(false);
    expect(ofereceNovaObra({ ...BASE, escondido: true })).toBe(false);
    expect(ofereceNovaObra({ ...BASE, aArrastar: true })).toBe(false);
    expect(ofereceNovaObra({ ...BASE, noFundo: false })).toBe(false);
  });

  it('não oferece fora de REGIAO_MAPA', () => {
    expect(ofereceNovaObra({ ...BASE, lat: REGIAO_MAPA.norte + 0.01 })).toBe(false);
    expect(ofereceNovaObra({ ...BASE, lng: REGIAO_MAPA.oeste - 0.01 })).toBe(false);
    expect(ofereceNovaObra({ ...BASE, lat: REGIAO_MAPA.sul, lng: REGIAO_MAPA.leste })).toBe(true);
  });
});
