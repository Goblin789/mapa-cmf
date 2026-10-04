// destinoSeguro: o login nunca serve de redirecionamento aberto.

import { describe, expect, it } from 'vitest';
import { destinoSeguro } from './destino';

describe('destinoSeguro', () => {
  it.each([
    ['/', '/'],
    ['/tabela', '/tabela'],
    ['/quadro?filtro=casas#topo', '/quadro?filtro=casas#topo'],
    ['/pessoa/p-ze', '/pessoa/p-ze'],
    ['/a/../b', '/b'],
    ['/apis', '/apis'],
    // Um %0a codificado é só texto do caminho (não é uma mudança de linha).
    ['/%0a', '/%0a'],
  ])('aceita %j → %j', (destino, esperado) => {
    expect(destinoSeguro(destino)).toBe(esperado);
  });

  it.each([
    undefined,
    null,
    '',
    'tabela',
    '//atacante.example',
    '//atacante.example/caminho',
    '/\\atacante.example',
    '\\\\atacante.example',
    '/\t/atacante.example',
    '/\n/atacante.example',
    '/.//atacante.example',
    '/a/..//atacante.example',
    'https://atacante.example',
    'http:atacante.example',
    'javascript:alert(1)',
    ' /tabela',
    '/api',
    '/api/auth/sair',
    '/API/estado',
    '/%2e%2e/api/estado',
    '/./api/estado',
    `/${'a'.repeat(1001)}`,
  ])('recusa %j (fica "/")', (destino) => {
    expect(destinoSeguro(destino)).toBe('/');
  });

  it('o resultado começa sempre por uma só barra', () => {
    for (const d of ['/a', '//b', '/\\c', '/.//d', '/%2f%2fatacante.example']) {
      const r = destinoSeguro(d);
      expect(r.startsWith('/'), d).toBe(true);
      expect(r.startsWith('//'), d).toBe(false);
    }
  });
});
