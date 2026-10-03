import { describe, expect, it } from 'vitest';
import { idsAArrastar, modoDoClique } from './selecao';

describe('modoDoClique', () => {
  const teclas = { ctrlKey: false, metaKey: false, shiftKey: false };

  it('clique simples substitui; Ctrl ou ⌘ alterna; Shift escolhe o intervalo', () => {
    expect(modoDoClique(teclas)).toBe('substituir');
    expect(modoDoClique({ ...teclas, ctrlKey: true })).toBe('alternar');
    expect(modoDoClique({ ...teclas, metaKey: true })).toBe('alternar');
    expect(modoDoClique({ ...teclas, shiftKey: true })).toBe('intervalo');
  });

  it('Ctrl+Shift conta como Ctrl', () => {
    expect(modoDoClique({ ctrlKey: true, metaKey: false, shiftKey: true })).toBe('alternar');
  });
});

describe('idsAArrastar', () => {
  it('um nome selecionado leva a seleção toda, com ele à frente', () => {
    expect(idsAArrastar('b', new Set(['a', 'b', 'c']))).toEqual(['b', 'a', 'c']);
  });

  it('um nome fora da seleção vai sozinho', () => {
    expect(idsAArrastar('z', new Set(['a', 'b']))).toEqual(['z']);
    expect(idsAArrastar('z', new Set())).toEqual(['z']);
  });
});
