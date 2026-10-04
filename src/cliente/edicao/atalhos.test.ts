import { describe, expect, it } from 'vitest';
import { acaoDoAtalho, type ContextoAtalho, teclaNoBotaoMenu, teclaNoMenu } from './atalhos';

const base: ContextoAtalho = {
  key: 'z',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  emCampoEditavel: false,
  modoEdicao: true,
  dialogoAberto: false,
  temSelecao: false,
};

const tecla = (parcial: Partial<ContextoAtalho>) => acaoDoAtalho({ ...base, ...parcial });

describe('acaoDoAtalho', () => {
  it('Ctrl+Z e ⌘+Z desfazem', () => {
    expect(tecla({ ctrlKey: true })).toBe('desfazer');
    expect(tecla({ metaKey: true })).toBe('desfazer');
  });

  it('Ctrl+Y, Ctrl+Shift+Z e ⌘+Shift+Z refazem (com Shift a tecla vem em maiúscula)', () => {
    expect(tecla({ key: 'y', ctrlKey: true })).toBe('refazer');
    expect(tecla({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('refazer');
    expect(tecla({ key: 'Z', metaKey: true, shiftKey: true })).toBe('refazer');
  });

  it('⌘+Y não refaz (no Mac é o histórico do browser)', () => {
    expect(tecla({ key: 'y', metaKey: true })).toBeNull();
  });

  it('Esc limpa a seleção só quando há seleção', () => {
    expect(tecla({ key: 'Escape', temSelecao: true })).toBe('limpar-selecao');
    expect(tecla({ key: 'Escape', temSelecao: false })).toBeNull();
  });

  it('nada fora do modo de edição, em campos de texto, com diálogos abertos ou com Alt', () => {
    expect(tecla({ ctrlKey: true, modoEdicao: false })).toBeNull();
    expect(tecla({ ctrlKey: true, emCampoEditavel: true })).toBeNull();
    expect(tecla({ ctrlKey: true, dialogoAberto: true })).toBeNull();
    expect(tecla({ key: 'Escape', temSelecao: true, dialogoAberto: true })).toBeNull();
    expect(tecla({ ctrlKey: true, altKey: true })).toBeNull();
  });

  it('Z sem Ctrl/⌘ não faz nada', () => {
    expect(tecla({})).toBeNull();
  });
});

describe('teclaNoMenu (M2: menu "Novo…")', () => {
  it('setas dão a volta; Home e End', () => {
    expect(teclaNoMenu('ArrowDown', 0, 2)).toEqual({ tipo: 'focar', indice: 1 });
    expect(teclaNoMenu('ArrowDown', 1, 2)).toEqual({ tipo: 'focar', indice: 0 });
    expect(teclaNoMenu('ArrowUp', 0, 2)).toEqual({ tipo: 'focar', indice: 1 });
    expect(teclaNoMenu('Home', 1, 3)).toEqual({ tipo: 'focar', indice: 0 });
    expect(teclaNoMenu('End', 0, 3)).toEqual({ tipo: 'focar', indice: 2 });
  });

  it('Esc fecha e devolve o foco; Tab fecha e deixa o foco seguir; o resto não é do menu', () => {
    expect(teclaNoMenu('Escape', 0, 2)).toEqual({ tipo: 'fechar', devolverFoco: true });
    expect(teclaNoMenu('Tab', 1, 2)).toEqual({ tipo: 'fechar', devolverFoco: false });
    expect(teclaNoMenu('Enter', 0, 2)).toBeNull();
    expect(teclaNoMenu('a', 0, 2)).toBeNull();
    expect(teclaNoMenu('ArrowDown', 0, 0)).toBeNull();
  });

  it('no botão fechado, ↓ abre no 1.º item e ↑ no último', () => {
    expect(teclaNoBotaoMenu('ArrowDown', 2)).toBe(0);
    expect(teclaNoBotaoMenu('ArrowUp', 2)).toBe(1);
    expect(teclaNoBotaoMenu('Enter', 2)).toBeNull();
  });
});
