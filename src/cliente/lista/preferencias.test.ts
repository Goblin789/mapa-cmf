import { describe, expect, it } from 'vitest';
import { lerPreferencias, PREFERENCIAS_INICIAIS } from './preferencias';

describe('lerPreferencias', () => {
  it('sem nada guardado: os valores iniciais', () => {
    expect(lerPreferencias(null)).toEqual(PREFERENCIAS_INICIAIS);
    expect(lerPreferencias('')).toEqual(PREFERENCIAS_INICIAIS);
  });

  it('lê a vista e se está alargado', () => {
    expect(lerPreferencias('{"vista":"carrinhas","alargado":true}')).toEqual({
      vista: 'carrinhas',
      alargado: true,
    });
  });

  it('o que vier estragado fica com o valor inicial', () => {
    expect(lerPreferencias('{nao é json')).toEqual(PREFERENCIAS_INICIAIS);
    expect(lerPreferencias('"casas"')).toEqual(PREFERENCIAS_INICIAIS);
    expect(lerPreferencias('null')).toEqual(PREFERENCIAS_INICIAIS);
    expect(lerPreferencias('{"vista":"tabela","alargado":"sim"}')).toEqual(PREFERENCIAS_INICIAIS);
    expect(lerPreferencias('{"vista":"obras"}')).toEqual({ vista: 'obras', alargado: false });
  });
});
