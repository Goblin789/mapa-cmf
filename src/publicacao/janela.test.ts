import { describe, expect, it } from 'vitest';
import { aPoucoDaJanela, decidirJanela, descreverHora, horaNoLuxemburgo, naJanelaDaReuniao } from './janela';

// Em 2026 a hora de verão (CEST, UTC+2) acaba a 25 de outubro; depois é CET (UTC+1).
// 06/10/2026 e 03/11/2026 são terças; 07/10/2026 e 04/11/2026 são quartas.

describe('horaNoLuxemburgo', () => {
  it('converte para a hora local, com e sem hora de verão', () => {
    expect(horaNoLuxemburgo(new Date('2026-10-06T16:30:00Z'))).toEqual({
      diaSemana: 2,
      hora: 18,
      minuto: 30,
    });
    expect(horaNoLuxemburgo(new Date('2026-11-03T16:30:00Z'))).toEqual({
      diaSemana: 2,
      hora: 17,
      minuto: 30,
    });
  });

  it('muda de dia à meia-noite local, não à de UTC', () => {
    expect(horaNoLuxemburgo(new Date('2026-10-06T22:30:00Z'))).toEqual({ diaSemana: 3, hora: 0, minuto: 30 });
  });

  it('descreve em português', () => {
    expect(descreverHora({ diaSemana: 2, hora: 9, minuto: 5 })).toBe('terça 09:05');
  });
});

describe('naJanelaDaReuniao (terça 18:00 a quarta 12:00, hora do Luxemburgo)', () => {
  const casos: [string, boolean, string][] = [
    ['2026-10-06T15:59:00Z', false, 'terça 17:59 (verão)'],
    ['2026-10-06T16:00:00Z', true, 'terça 18:00 (verão)'],
    ['2026-10-06T21:59:00Z', true, 'terça 23:59'],
    ['2026-10-06T22:00:00Z', true, 'quarta 00:00'],
    ['2026-10-07T07:00:00Z', true, 'quarta 09:00, durante a reunião'],
    ['2026-10-07T09:59:00Z', true, 'quarta 11:59 (verão)'],
    ['2026-10-07T10:00:00Z', false, 'quarta 12:00 (verão)'],
    ['2026-11-03T16:30:00Z', false, 'terça 17:30 (inverno): em UTC+2 já seria 18:30'],
    ['2026-11-03T17:00:00Z', true, 'terça 18:00 (inverno)'],
    ['2026-11-04T10:30:00Z', true, 'quarta 11:30 (inverno)'],
    ['2026-11-04T11:00:00Z', false, 'quarta 12:00 (inverno)'],
    ['2026-10-05T17:00:00Z', false, 'segunda 19:00'],
    ['2026-10-08T07:00:00Z', false, 'quinta 09:00'],
    ['2026-10-04T12:00:00Z', false, 'domingo'],
  ];
  it.each(casos)('%s → %s (%s)', (iso, esperado) => {
    expect(naJanelaDaReuniao(new Date(iso))).toBe(esperado);
  });
});

describe('decidirJanela', () => {
  const tercaNoite = new Date('2026-10-06T17:05:00Z'); // terça 19:05 no Luxemburgo

  it('fora da janela: pode, sem aviso', () => {
    expect(decidirJanela(new Date('2026-10-08T10:00:00Z'), false)).toEqual({ pode: true });
    expect(decidirJanela(new Date('2026-10-08T10:00:00Z'), true)).toEqual({ pode: true });
  });

  it('dentro da janela: recusa e diz a hora e como forçar', () => {
    const r = decidirJanela(tercaNoite, false);
    expect(r.pode).toBe(false);
    if (r.pode) return;
    expect(r.erro).toContain('terça 19:05');
    expect(r.erro).toContain('--forcar');
    expect(r.erro).toContain('quarta às 12:00');
  });

  it('dentro da janela com --forcar: pode, com aviso', () => {
    const r = decidirJanela(tercaNoite, true);
    expect(r.pode).toBe(true);
    if (!r.pode) return;
    expect(r.aviso).toContain('ATENÇÃO');
    expect(r.aviso).toContain('terça 19:05');
  });

  // A troca de versão só acontece no fim da construção: um pedido às 17:58 deixava o mapa em baixo às 18:0x.
  describe('nos 15 minutos antes da janela', () => {
    const casos: [string, boolean, string][] = [
      ['2026-10-06T15:44:00Z', true, 'terça 17:44 (verão): ainda pode'],
      ['2026-10-06T15:45:00Z', false, 'terça 17:45 (verão): já não'],
      ['2026-10-06T15:59:00Z', false, 'terça 17:59 (verão)'],
      ['2026-11-03T16:44:00Z', true, 'terça 17:44 (inverno)'],
      ['2026-11-03T16:50:00Z', false, 'terça 17:50 (inverno)'],
      ['2026-10-07T09:50:00Z', false, 'quarta 11:50: ainda na janela'],
      ['2026-10-07T10:00:00Z', true, 'quarta 12:00: no fim da janela não há margem'],
    ];
    it.each(casos)('%s → pode = %s (%s)', (iso, pode) => {
      expect(decidirJanela(new Date(iso), false).pode).toBe(pode);
    });

    it('explica porquê, e com --forcar avisa', () => {
      const quase = new Date('2026-10-06T15:58:00Z'); // terça 17:58
      expect(aPoucoDaJanela(quase)).toBe(true);
      expect(naJanelaDaReuniao(quase)).toBe(false);
      const r = decidirJanela(quase, false);
      if (r.pode) throw new Error('devia recusar');
      expect(r.erro).toContain('terça 17:58');
      expect(r.erro).toContain('15 minutos');
      expect(r.erro).toContain('fim da construção');
      const forcado = decidirJanela(quase, true);
      expect(forcado.pode && forcado.aviso).toContain('ATENÇÃO');
    });
  });
});
