import { describe, expect, it } from 'vitest';
import { acaoDoAtalho, type ContextoAtalho } from './atalhos';

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
