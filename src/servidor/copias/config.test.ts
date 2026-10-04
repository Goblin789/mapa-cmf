import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { lerConfigCopias } from './config';
import { lerNomeCopia, nomeCopia } from './nomes';

const CHAVE = randomBytes(32).toString('base64');
const SEGREDO_FALSO = 'segredo-falso-de-teste-123';

const S3 = {
  COPIAS_DESTINO: 's3',
  COPIAS_CHAVE: CHAVE,
  COPIAS_S3_ENDPOINT: 'https://conta-ficticia.eu.r2.cloudflarestorage.com',
  COPIAS_S3_BALDE: 'mapa-cmf-copias',
  COPIAS_S3_ID: 'id-falso',
  COPIAS_S3_SEGREDO: SEGREDO_FALSO,
};

describe('lerConfigCopias', () => {
  it('sem COPIAS_DESTINO não há cópias', () => {
    expect(lerConfigCopias({})).toBeNull();
    expect(lerConfigCopias({ COPIAS_DESTINO: '  ', COPIAS_CHAVE: CHAVE })).toBeNull();
  });

  it('pasta:<caminho>', () => {
    const config = lerConfigCopias({ COPIAS_DESTINO: 'pasta:dados/copias-teste', COPIAS_CHAVE: CHAVE });
    expect(config?.destino).toEqual({ tipo: 'pasta', caminho: 'dados/copias-teste' });
    expect(config?.chave).toHaveLength(32);
    expect(() => lerConfigCopias({ COPIAS_DESTINO: 'pasta:', COPIAS_CHAVE: CHAVE })).toThrow('caminho');
  });

  it('s3 com região "auto" por omissão e endpoint sem barra no fim', () => {
    const config = lerConfigCopias({ ...S3, COPIAS_S3_ENDPOINT: `${S3.COPIAS_S3_ENDPOINT}/` });
    expect(config?.destino).toEqual({
      tipo: 's3',
      endpoint: 'https://conta-ficticia.eu.r2.cloudflarestorage.com',
      balde: 'mapa-cmf-copias',
      regiao: 'auto',
      id: 'id-falso',
      segredo: SEGREDO_FALSO,
    });
    expect(lerConfigCopias({ ...S3, COPIAS_S3_REGIAO: 'eu-west-1' })?.destino).toMatchObject({
      regiao: 'eu-west-1',
    });
  });

  it('s3 incompleto diz o que falta, sem mostrar valores', () => {
    const { COPIAS_S3_BALDE: _b, COPIAS_S3_SEGREDO: _s, ...incompleto } = S3;
    expect(() => lerConfigCopias(incompleto)).toThrow('COPIAS_S3_BALDE, COPIAS_S3_SEGREDO');
  });

  it('o endpoint tem de ser https e sem caminho', () => {
    expect(() => lerConfigCopias({ ...S3, COPIAS_S3_ENDPOINT: 'http://x.example.com' })).toThrow('https://');
    expect(() => lerConfigCopias({ ...S3, COPIAS_S3_ENDPOINT: 'https://x.example.com/balde' })).toThrow(
      'balde',
    );
    expect(() => lerConfigCopias({ ...S3, COPIAS_S3_ENDPOINT: 'isto não é um url' })).toThrow(
      'não é um endereço',
    );
  });

  it('COPIAS_CHAVE é obrigatória e tem de ter exatamente 32 bytes em base64', () => {
    expect(() => lerConfigCopias({ COPIAS_DESTINO: 'pasta:x' })).toThrow('Falta COPIAS_CHAVE');
    const curta = randomBytes(16).toString('base64');
    const longa = randomBytes(33).toString('base64');
    for (const chave of [curta, longa, 'não é base64!!', `${CHAVE}x`]) {
      let mensagem = '';
      try {
        lerConfigCopias({ ...S3, COPIAS_CHAVE: chave });
      } catch (erro) {
        mensagem = (erro as Error).message;
      }
      expect(mensagem).toContain('32 bytes');
      // A mensagem nunca mostra a chave nem o segredo.
      expect(mensagem).not.toContain(chave);
      expect(mensagem).not.toContain(SEGREDO_FALSO);
    }
  });

  it('destino desconhecido', () => {
    expect(() => lerConfigCopias({ COPIAS_DESTINO: 'ftp', COPIAS_CHAVE: CHAVE })).toThrow(
      '"s3" ou "pasta:<caminho>"',
    );
  });
});

describe('nomes das cópias', () => {
  it('UTC, ordenáveis e com o motivo', () => {
    const data = new Date('2026-10-04T07:05:09.123Z');
    const nome = nomeCopia(data, 'migracao');
    expect(nome).toBe('mapa-2026-10-04T07-05-09Z-migracao.db.gz.enc');
    expect(lerNomeCopia(nome)).toEqual({ data: new Date('2026-10-04T07:05:09Z'), motivo: 'migracao' });
    expect(
      nomeCopia(new Date('2026-10-04T10:00:00Z'), 'hora') > nomeCopia(new Date('2026-09-30T23:00:00Z'), 'pc'),
    ).toBe(true);
    expect(lerNomeCopia('mapa-2026-10-04T07-05-09Z-outro.db.gz.enc')).toBeNull();
    expect(lerNomeCopia('outra-coisa.txt')).toBeNull();
  });
});
