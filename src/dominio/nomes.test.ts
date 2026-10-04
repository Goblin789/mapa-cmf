import { describe, expect, it } from 'vitest';
import { nomeComMaiusculasNormais } from './nomes';

// Nomes fictícios.
describe('nomeComMaiusculasNormais', () => {
  it('palavras todas em maiúsculas passam a ter só a inicial maiúscula', () => {
    expect(nomeComMaiusculasNormais('RUI Manuel Pinto FONSECA')).toBe('Rui Manuel Pinto Fonseca');
    expect(nomeComMaiusculasNormais('ÓSCAR ÉVORA')).toBe('Óscar Évora');
    expect(nomeComMaiusculasNormais('IVO')).toBe('Ivo');
  });

  it('partículas em minúsculas quando não são a 1.ª palavra', () => {
    expect(nomeComMaiusculasNormais('Tiago DA COSTA')).toBe('Tiago da Costa');
    expect(nomeComMaiusculasNormais('ANA DE SOUSA E MELO')).toBe('Ana de Sousa e Melo');
    expect(nomeComMaiusculasNormais('LUÍS DOS SANTOS DAS NEVES DO VALE')).toBe(
      'Luís dos Santos das Neves do Vale',
    );
    expect(nomeComMaiusculasNormais('DA SILVA')).toBe('Da Silva');
  });

  it('partes com hífen ou apóstrofo; o "d\'" a meio fica em minúsculas', () => {
    expect(nomeComMaiusculasNormais('ANA-RITA SOUSA-PINTO')).toBe('Ana-Rita Sousa-Pinto');
    expect(nomeComMaiusculasNormais("PEDRO D'ALMEIDA")).toBe("Pedro d'Almeida");
    expect(nomeComMaiusculasNormais('PEDRO D’ALMEIDA')).toBe('Pedro d’Almeida');
    expect(nomeComMaiusculasNormais("D'ALMEIDA Pedro")).toBe("D'Almeida Pedro");
    expect(nomeComMaiusculasNormais("Sean O'NEILL")).toBe("Sean O'Neill");
  });

  it('maiúscula a seguir a ponto ou parênteses', () => {
    expect(nomeComMaiusculasNormais('J.P. COSTA')).toBe('J.P. Costa');
    expect(nomeComMaiusculasNormais('ANA (TINA) SOUSA')).toBe('Ana (Tina) Sousa');
    // "É" decomposto (E + acento combinado): o acento não conta como fim da letra.
    expect(nomeComMaiusculasNormais('ÉVORA'.normalize('NFD'))).toBe('Évora'.normalize('NFD'));
  });

  it('partículas só com a inicial maiúscula também passam a minúsculas (fora da 1.ª palavra)', () => {
    expect(nomeComMaiusculasNormais('Maria Da Luz')).toBe('Maria da Luz');
    expect(nomeComMaiusculasNormais('Rui Dos SANTOS')).toBe('Rui dos Santos');
    expect(nomeComMaiusculasNormais('ALEXANDRE De Azevedo MOTA')).toBe('Alexandre de Azevedo Mota');
    expect(nomeComMaiusculasNormais("Pedro D'Almeida")).toBe("Pedro d'Almeida");
    expect(nomeComMaiusculasNormais('Pedro D’Almeida')).toBe('Pedro d’Almeida');
    expect(nomeComMaiusculasNormais('Da Luz Maria')).toBe('Da Luz Maria');
    expect(nomeComMaiusculasNormais('Rui Dores')).toBe('Rui Dores');
  });

  it('palavras já com minúsculas ficam como estão (menos as partículas)', () => {
    expect(nomeComMaiusculasNormais('João de Sá')).toBe('João de Sá');
    expect(nomeComMaiusculasNormais('Kevin McDONALD')).toBe('Kevin McDONALD');
    expect(nomeComMaiusculasNormais('Zé A.')).toBe('Zé A.');
  });

  it('sem letras ou com espaços a mais', () => {
    expect(nomeComMaiusculasNormais('  RUI   COSTA  ')).toBe('Rui Costa');
    expect(nomeComMaiusculasNormais('')).toBe('');
    expect(nomeComMaiusculasNormais('Equipa 2')).toBe('Equipa 2');
  });
});
