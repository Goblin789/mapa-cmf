import { describe, expect, it } from 'vitest';
import { dataISOLuxemburgo, dataPorExtenso, horaLuxemburgo, textoAtualizado } from './horas';

describe('horas do Luxemburgo', () => {
  it('hora com dois dígitos, em 24 h (verão UTC+2, inverno UTC+1)', () => {
    expect(horaLuxemburgo(new Date('2026-10-07T08:05:00Z'))).toBe('10:05');
    expect(horaLuxemburgo(new Date('2026-12-02T08:05:00Z'))).toBe('09:05');
    expect(horaLuxemburgo(new Date('2026-12-02T23:30:00Z'))).toBe('00:30');
  });

  it('data por extenso, em português', () => {
    expect(dataPorExtenso(new Date('2026-10-07T08:00:00Z'))).toBe('quarta-feira, 7 de outubro');
  });

  it('data ISO do dia no Luxemburgo', () => {
    expect(dataISOLuxemburgo(new Date('2026-03-01T23:30:00Z'))).toBe('2026-03-02');
  });

  it('"Atualizado às HH:MM" a partir da data do estado; nada se não for uma data', () => {
    expect(textoAtualizado('2026-10-07T12:41:09.000Z')).toBe('Atualizado às 14:41');
    expect(textoAtualizado(null)).toBeNull();
    expect(textoAtualizado('')).toBeNull();
    expect(textoAtualizado('ontem')).toBeNull();
  });
});
