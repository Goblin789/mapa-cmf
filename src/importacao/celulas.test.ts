import { describe, expect, it } from 'vitest';
import {
  garantirUnico,
  idPessoaBase,
  indiceColuna,
  letrasColuna,
  normalizarNumero,
  numeroCelula,
  referencia,
  slug,
  textoBruto,
  textoCelula,
} from './celulas';

describe('texto das células', () => {
  it('apara, reduz espaços e trata vazios como null', () => {
    expect(textoCelula('  Ana   Teste ')).toBe('Ana Teste');
    expect(textoCelula('   ')).toBeNull();
    expect(textoCelula(null)).toBeNull();
    expect(textoCelula(undefined)).toBeNull();
    expect(textoCelula(900)).toBe('900');
  });

  it('textoBruto mantém os espaços do meio', () => {
    expect(textoBruto(' 900- 372_2 ')).toBe('900- 372_2');
  });

  it('numeroCelula só aceita números', () => {
    expect(numeroCelula(12)).toBe(12);
    expect(numeroCelula('12')).toBeNull();
    expect(numeroCelula(Number.NaN)).toBeNull();
  });
});

describe('coordenadas A1', () => {
  it('converte letras e índices', () => {
    expect(indiceColuna('A')).toBe(0);
    expect(indiceColuna('R')).toBe(17);
    expect(indiceColuna('AA')).toBe(26);
    expect(letrasColuna(0)).toBe('A');
    expect(letrasColuna(24)).toBe('Y');
    expect(letrasColuna(26)).toBe('AA');
    expect(referencia(2, 1)).toBe('B3');
  });
});

describe('Nº e ids', () => {
  it('tira os espaços do Nº e mantém o sufixo', () => {
    expect(normalizarNumero('900- 372_2')).toBe('900-372_2');
    expect(normalizarNumero('900-017_3')).toBe('900-017_3');
    expect(normalizarNumero('900-017')).toBe('900-017');
    expect(normalizarNumero('  ')).toBeNull();
    expect(normalizarNumero(null)).toBeNull();
  });

  it('id estável: do Nº quando existe, senão do nome sem acentos', () => {
    expect(idPessoaBase('900-017_3', 'Qualquer')).toBe('p-900-017_3');
    expect(idPessoaBase(null, 'Zé Tó Teste')).toBe('p-ze-to-teste');
    expect(idPessoaBase(null, 'Ana-Rita  Teste')).toBe('p-ana-rita-teste');
    expect(idPessoaBase(null, '!!!')).toBe('p-sem-nome');
    expect(slug('Çá Ü')).toBe('ca-u');
  });

  it('garante ids únicos com sufixo', () => {
    const usados = new Set<string>();
    expect(garantirUnico('p-ana', usados)).toBe('p-ana');
    expect(garantirUnico('p-ana', usados)).toBe('p-ana-2');
    expect(garantirUnico('p-ana', usados)).toBe('p-ana-3');
  });
});
