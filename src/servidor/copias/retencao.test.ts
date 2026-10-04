import { describe, expect, it } from 'vitest';
import { nomeCopia } from './nomes';
import { copiasAApagar, ultimaCopiaDoServidor } from './retencao';

const AGORA = new Date('2026-10-04T12:00:00.000Z');
const HORA = 3_600_000;
const DIA = 24 * HORA;

function copia(iso: string) {
  const data = new Date(iso);
  return { nome: nomeCopia(data, 'hora'), data };
}

function horasAtras(horas: number) {
  const data = new Date(AGORA.getTime() - horas * HORA);
  return { nome: nomeCopia(data, 'hora'), data };
}

describe('retenção das cópias', () => {
  it('guarda todas as das últimas 48 h', () => {
    const copias = Array.from({ length: 48 }, (_, i) => horasAtras(i + 0.5));
    expect(copiasAApagar(copias, AGORA)).toEqual([]);
  });

  it('dos 2 aos 30 dias guarda só a mais recente de cada dia (UTC)', () => {
    const copias = [
      horasAtras(1),
      horasAtras(2),
      horasAtras(3),
      copia('2026-09-30T23:00:00Z'),
      copia('2026-09-30T10:00:00Z'),
      copia('2026-09-30T01:00:00Z'),
      copia('2026-09-20T08:00:00Z'),
      copia('2026-09-20T07:00:00Z'),
    ];
    expect(copiasAApagar(copias, AGORA).sort()).toEqual(
      [copia('2026-09-30T10:00:00Z'), copia('2026-09-30T01:00:00Z'), copia('2026-09-20T07:00:00Z')]
        .map((c) => c.nome)
        .sort(),
    );
  });

  it('dos 30 aos 365 dias guarda só a mais recente de cada mês (UTC)', () => {
    const copias = [
      horasAtras(1),
      horasAtras(2),
      horasAtras(3),
      copia('2026-08-25T12:00:00Z'),
      copia('2026-08-03T12:00:00Z'),
      copia('2026-03-31T23:59:00Z'),
      copia('2026-03-01T00:00:00Z'),
      copia('2026-02-15T00:00:00Z'),
    ];
    expect(copiasAApagar(copias, AGORA).sort()).toEqual(
      [copia('2026-08-03T12:00:00Z'), copia('2026-03-01T00:00:00Z')].map((c) => c.nome).sort(),
    );
  });

  it('apaga as que têm mais de 365 dias', () => {
    const antiga = copia('2025-09-01T00:00:00Z');
    const copias = [horasAtras(1), horasAtras(2), horasAtras(3), antiga];
    expect(copiasAApagar(copias, AGORA)).toEqual([antiga.nome]);
  });

  it('nunca apaga as 3 mais recentes, mesmo que sejam antigas', () => {
    const copias = [
      copia('2024-01-01T10:00:00Z'),
      copia('2024-01-01T09:00:00Z'),
      copia('2024-01-01T08:00:00Z'),
      copia('2024-01-01T07:00:00Z'),
    ];
    expect(copiasAApagar(copias, AGORA)).toEqual([copia('2024-01-01T07:00:00Z').nome]);
  });

  it('com poucas cópias não apaga nada', () => {
    expect(copiasAApagar([], AGORA)).toEqual([]);
    expect(copiasAApagar([copia('2020-01-01T00:00:00Z')], AGORA)).toEqual([]);
  });

  it('nunca apaga objetos "mapa-…" com nomes fora do formato, nem os conta para as 3 mais recentes', () => {
    const aMao = { nome: 'mapa-antes-da-publicacao.db.gz.enc', data: new Date(AGORA.getTime() - 10 * DIA) };
    const outra = { nome: 'mapa-2026-09-24T12-00-00Z-desconhecido.db.gz.enc', data: aMao.data };
    const doMesmoDia = copia('2026-09-24T13:00:00Z');
    const copias = [horasAtras(1), horasAtras(2), horasAtras(3), aMao, outra, doMesmoDia];
    expect(copiasAApagar(copias, AGORA)).toEqual([]);
    // Sozinhos com uma cópia antiga: a antiga continua protegida (é uma das 3 mais recentes válidas).
    expect(copiasAApagar([aMao, outra, copia('2020-01-01T00:00:00Z')], AGORA)).toEqual([]);
  });

  it('a última cópia do servidor ignora as "pc" e os nomes fora do formato', () => {
    const hora = copia('2026-10-04T08:00:00Z');
    const pc = { nome: nomeCopia(new Date('2026-10-04T11:00:00Z'), 'pc') };
    const aMao = { nome: 'mapa-guardada-a-mao.db.gz.enc' };
    expect(ultimaCopiaDoServidor([hora, pc, aMao])).toEqual(hora.data);
    expect(ultimaCopiaDoServidor([pc, aMao])).toBeNull();
    expect(ultimaCopiaDoServidor([])).toBeNull();
  });

  it('um ano de cópias de hora a hora fica com 48 + ~28 diárias + ~11 mensais', () => {
    const copias = Array.from({ length: 365 * 24 }, (_, i) => horasAtras(i + 0.25));
    const apagar = new Set(copiasAApagar(copias, AGORA));
    const ficam = copias.filter((c) => !apagar.has(c.nome));
    expect(ficam.filter((c) => AGORA.getTime() - c.data.getTime() <= 2 * DIA)).toHaveLength(48);
    expect(ficam.length).toBeGreaterThanOrEqual(48 + 28 + 10);
    expect(ficam.length).toBeLessThanOrEqual(48 + 29 + 12);
  });
});
