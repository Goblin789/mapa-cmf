import { describe, expect, it } from 'vitest';
import { deslocamentoPopover, ehAtalhoPesquisa, ehCampoEditavel, moverAtivo } from './teclado';

describe('ehCampoEditavel', () => {
  it('campos de texto, áreas de texto, listas e conteúdo editável', () => {
    expect(ehCampoEditavel({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(ehCampoEditavel({ tagName: 'input' })).toBe(true);
    expect(ehCampoEditavel({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(ehCampoEditavel({ tagName: 'TEXTAREA' })).toBe(true);
    expect(ehCampoEditavel({ tagName: 'SELECT' })).toBe(true);
    expect(ehCampoEditavel({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('botões, caixas de seleção e o resto da página não', () => {
    expect(ehCampoEditavel({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(ehCampoEditavel({ tagName: 'BUTTON' })).toBe(false);
    expect(ehCampoEditavel({ tagName: 'BODY' })).toBe(false);
    expect(ehCampoEditavel(null)).toBe(false);
  });
});

describe('ehAtalhoPesquisa', () => {
  const tecla = { key: '/', ctrlKey: false, metaKey: false, altKey: false, emCampoEditavel: false };

  it('"/" fora de campos de texto', () => {
    expect(ehAtalhoPesquisa(tecla)).toBe(true);
    expect(ehAtalhoPesquisa({ ...tecla, emCampoEditavel: true })).toBe(false);
  });

  it('Ctrl+K e ⌘K em qualquer sítio', () => {
    expect(ehAtalhoPesquisa({ ...tecla, key: 'k', ctrlKey: true, emCampoEditavel: true })).toBe(true);
    expect(ehAtalhoPesquisa({ ...tecla, key: 'K', metaKey: true })).toBe(true);
  });

  it('outras teclas e combinações não', () => {
    expect(ehAtalhoPesquisa({ ...tecla, key: 'k' })).toBe(false);
    expect(ehAtalhoPesquisa({ ...tecla, ctrlKey: true })).toBe(false);
    expect(ehAtalhoPesquisa({ ...tecla, altKey: true })).toBe(false);
    expect(ehAtalhoPesquisa({ ...tecla, key: 'k', ctrlKey: true, altKey: true })).toBe(false);
  });
});

describe('moverAtivo', () => {
  it('desce e sobe, dando a volta nas pontas', () => {
    expect(moverAtivo(0, 3, 1)).toBe(1);
    expect(moverAtivo(2, 3, 1)).toBe(0);
    expect(moverAtivo(0, 3, -1)).toBe(2);
  });

  it('sem nenhum ativo começa pela ponta certa', () => {
    expect(moverAtivo(-1, 3, 1)).toBe(0);
    expect(moverAtivo(-1, 3, -1)).toBe(2);
    expect(moverAtivo(7, 3, 1)).toBe(0);
  });

  it('sem resultados não há ativo', () => {
    expect(moverAtivo(0, 0, 1)).toBe(-1);
  });
});

describe('deslocamentoPopover', () => {
  it('fica alinhado com o botão quando cabe', () => {
    expect(deslocamentoPopover(12, 240, 375)).toBe(0);
  });

  it('encosta à margem direita quando sairia pela direita', () => {
    // 200 + 240 + 8 = 448: 73 px a mais numa janela de 375.
    expect(deslocamentoPopover(200, 240, 375)).toBe(-73);
  });

  it('coluna do meio num telemóvel de 360 px: cabe inteiro no ecrã', () => {
    // Alinhado pela direita do botão (como estava) começava em -5 px (medido no browser).
    const esquerda = 124 + deslocamentoPopover(124, 240, 360);
    expect(esquerda).toBe(112);
    expect(esquerda).toBeGreaterThanOrEqual(8);
    expect(esquerda + 240).toBeLessThanOrEqual(360 - 8);
  });

  it('num ecrã mais estreito do que o popover, prefere a margem esquerda', () => {
    expect(10 + deslocamentoPopover(10, 240, 200)).toBe(8);
  });
});
