import { describe, expect, it } from 'vitest';
import { contar, nomeCurtoCasa } from './textos';

const GROTTE = 'Himeling, Rue de la Grotte 27 Rue de la Grotte, 57570 Himeling (Puttelange-lès-Thionville)';
const FORET = 'Himeling, Rue de la Forêt 14 Rue de la Forêt, 57570 Himeling (Puttelange-lès-Thionville)';

describe('nomeCurtoCasa', () => {
  it('tira o que já está no nome ou na morada do local', () => {
    expect(nomeCurtoCasa('Casa 1 Puttelange', GROTTE)).toBe('Casa 1');
    expect(nomeCurtoCasa('Casa 2 Rue de la Forêt', FORET)).toBe('Casa 2');
    expect(nomeCurtoCasa('Casa 2 Rue de la Foret', FORET)).toBe('Casa 2');
  });

  it('abrevia "Apartamento"', () => {
    expect(nomeCurtoCasa('Apartamento E Puttelange', FORET)).toBe('Ap. E');
  });

  it('nunca fica vazio nem mexe no que não se repete', () => {
    expect(nomeCurtoCasa('Steinsel', 'Steinsel 4A Rue de Hunsdorf, L-7324 Müllendorf')).toBe('Steinsel');
    expect(nomeCurtoCasa('Casa Nova Azul', 'Outro sítio')).toBe('Casa Nova Azul');
  });
});

describe('contar', () => {
  it('singular e plural', () => {
    expect(contar(1, 'casa', 'casas')).toBe('1 casa');
    expect(contar(4, 'casa', 'casas')).toBe('4 casas');
    expect(contar(0, 'carrinha', 'carrinhas')).toBe('0 carrinhas');
  });
});
