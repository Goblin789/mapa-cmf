import { describe, expect, it } from 'vitest';
import { iniciais, primeiroNome, textoSairComPendentes } from './utilizador';

// Nomes fictícios.
describe('iniciais', () => {
  it('primeiro e último nome', () => {
    expect(iniciais('Ana da Silva')).toBe('AS');
    expect(iniciais('  Zé   Ninguém ')).toBe('ZN');
    expect(iniciais('élio ávila')).toBe('ÉÁ');
    expect(iniciais('Ana-Maria (Exemplo)')).toBe('AE');
  });

  it('um só nome: uma letra', () => {
    expect(iniciais('Rafa')).toBe('R');
  });

  it('sem nome: a primeira letra do e-mail; sem nada: "?"', () => {
    expect(iniciais('', 'ze.ninguem@exemplo.lu')).toBe('Z');
    expect(iniciais('  ', null)).toBe('?');
    expect(iniciais('', '123@exemplo.lu')).toBe('?');
  });
});

describe('primeiroNome', () => {
  it('a primeira palavra', () => {
    expect(primeiroNome('Ana da Silva')).toBe('Ana');
    expect(primeiroNome('  Zé Ninguém')).toBe('Zé');
    expect(primeiroNome('')).toBe('');
  });
});

describe('textoSairComPendentes', () => {
  it('singular e plural', () => {
    expect(textoSairComPendentes(1)).toBe('Tens 1 alteração por guardar. Se saíres, perde-se.');
    expect(textoSairComPendentes(3)).toBe('Tens 3 alterações por guardar. Se saíres, perdem-se.');
  });
});
