// Testes de dominio/datas.ts (M2): dias no fuso do Luxemburgo.

import { describe, expect, it } from 'vitest';
import { dataNoLuxemburgo, eDia, formatarDiaCompleto, formatarDiaMes, somarDias } from './datas';

describe('datas', () => {
  it('o dia é o do Luxemburgo, no verão (UTC+2) e no inverno (UTC+1)', () => {
    expect(dataNoLuxemburgo(new Date('2026-10-04T21:59:00Z'))).toBe('2026-10-04');
    expect(dataNoLuxemburgo(new Date('2026-10-04T22:00:00Z'))).toBe('2026-10-05');
    expect(dataNoLuxemburgo(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31');
    expect(dataNoLuxemburgo(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
  });

  it('eDia só aceita dias AAAA-MM-DD que existem', () => {
    expect(eDia('2028-02-29')).toBe(true);
    expect(eDia('2027-02-29')).toBe(false);
    expect(eDia('2026-1-04')).toBe(false);
    expect(eDia('04/10/2026')).toBe(false);
    expect(eDia(20261004)).toBe(false);
    expect(eDia(null)).toBe(false);
  });

  it('somar dias atravessa meses, anos e o 29 de fevereiro', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2028-03-01', -1)).toBe('2028-02-29');
    expect(somarDias('2026-10-04', 0)).toBe('2026-10-04');
    expect(somarDias('2026-10-04', -30)).toBe('2026-09-04');
  });

  it('formata dd/mm e dd/mm/aaaa; o que não é um dia passa como veio', () => {
    expect(formatarDiaMes('2026-10-12')).toBe('12/10');
    expect(formatarDiaCompleto('2026-10-12')).toBe('12/10/2026');
    expect(formatarDiaCompleto('amanhã')).toBe('amanhã');
  });
});
