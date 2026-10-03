import { describe, expect, it } from 'vitest';
import { type ContextoFoco, decidirFoco, focoPerdido } from './foco';

const base: ContextoFoco = { porTratar: true, modoEdicao: true, dialogoAberto: false, focoPerdido: true };

describe('decidirFoco', () => {
  it('ao entrar no modo de edição (o botão Editar desaparece), o foco vai para a barra âmbar', () => {
    expect(decidirFoco(base)).toBe('barra');
  });

  it('ao sair (Cancelar, Deitar fora, depois de guardar), o foco vai para o botão Editar', () => {
    expect(decidirFoco({ ...base, modoEdicao: false })).toBe('editar');
  });

  it('com um diálogo ainda aberto (ex.: o Guardar enquanto recarrega), espera que feche', () => {
    expect(decidirFoco({ ...base, modoEdicao: false, dialogoAberto: true })).toBe('esperar');
  });

  it('se o foco está num elemento que existe, não mexe', () => {
    expect(decidirFoco({ ...base, focoPerdido: false })).toBe('nada');
    expect(decidirFoco({ ...base, modoEdicao: false, focoPerdido: false })).toBe('nada');
  });

  it('sem mudança de modo por tratar, não mexe (ex.: ao abrir a página o foco fica no <body>)', () => {
    expect(decidirFoco({ ...base, porTratar: false })).toBe('nada');
  });
});

describe('focoPerdido', () => {
  const corpo = { isConnected: true };
  it('no <body>, em lado nenhum, ou num elemento que saiu da página', () => {
    expect(focoPerdido(corpo, corpo)).toBe(true);
    expect(focoPerdido(null, corpo)).toBe(true);
    expect(focoPerdido({ isConnected: false }, corpo)).toBe(true);
  });

  it('num botão que está na página, não', () => {
    expect(focoPerdido({ isConnected: true }, corpo)).toBe(false);
  });
});
