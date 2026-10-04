import { describe, expect, it } from 'vitest';
import {
  dicaDoAutor,
  formatarDataHora,
  nomeDoAutor,
  notaEstadoLote,
  partirDescricao,
  podeHaverMais,
  proximoLimite,
  rotuloAutor,
  rotuloTipoLote,
} from './historico';

describe('formatarDataHora', () => {
  it('mostra a hora do Luxemburgo (verão: UTC+2; inverno: UTC+1)', () => {
    expect(formatarDataHora('2026-10-03T15:01:00.000Z')).toBe('03/10/2026, 17:01');
    expect(formatarDataHora('2026-12-31T23:30:00Z')).toBe('01/01/2027, 00:30');
  });

  it('texto que não é data passa como veio', () => {
    expect(formatarDataHora('ontem')).toBe('ontem');
  });
});

describe('rótulos do lote', () => {
  it('tipo, estado e autor', () => {
    expect(rotuloTipoLote('mudanca')).toBe('Mudança');
    expect(rotuloTipoLote('importacao')).toBe('Importação');
    expect(rotuloTipoLote('outro')).toBe('outro');
    expect(notaEstadoLote('aplicado')).toBeNull();
    expect(notaEstadoLote('agendado')).toBe('agendado');
    expect(rotuloAutor('importacao')).toBe('Importação dos Excel');
    expect(rotuloAutor('local')).toBe('Este computador');
    expect(rotuloAutor('Rafael')).toBe('Rafael');
    expect(rotuloAutor('constructor')).toBe('constructor');
    expect(rotuloTipoLote('toString')).toBe('toString');
  });
});

describe('nomeDoAutor', () => {
  it('mostra o nome que o servidor resolveu', () => {
    expect(nomeDoAutor({ autor: 'ana.exemplo@exemplo.lu', autorNome: 'Ana Exemplo' })).toBe('Ana Exemplo');
    expect(nomeDoAutor({ autor: 'local', autorNome: 'Este computador' })).toBe('Este computador');
    // O servidor manda sempre o nome: o dele ganha ao rótulo local.
    expect(nomeDoAutor({ autor: 'importacao', autorNome: 'Importação inicial' })).toBe('Importação inicial');
  });

  it('sem nome (vazio, só espaços ou em falta), usa o rótulo da chave', () => {
    expect(nomeDoAutor({ autor: 'importacao', autorNome: '' })).toBe('Importação dos Excel');
    expect(nomeDoAutor({ autor: 'dados-iniciais', autorNome: '   ' })).toBe('Dados iniciais');
    expect(nomeDoAutor({ autor: 'local' })).toBe('Este computador');
    expect(nomeDoAutor({ autor: 'ze.ninguem@exemplo.lu', autorNome: null })).toBe('ze.ninguem@exemplo.lu');
  });

  it('a dica com o e-mail só aparece quando diz mais do que o nome', () => {
    expect(dicaDoAutor({ autor: 'ana.exemplo@exemplo.lu', autorNome: 'Ana Exemplo' })).toBe(
      'ana.exemplo@exemplo.lu',
    );
    expect(dicaDoAutor({ autor: 'ana.exemplo@exemplo.lu', autorNome: '' })).toBeNull();
    expect(dicaDoAutor({ autor: 'local', autorNome: 'Este computador' })).toBeNull();
  });
});

describe('partirDescricao', () => {
  it('separa quem e o quê', () => {
    expect(partirDescricao('Ana T. — casa: Casa Um → Casa Dois')).toEqual({
      quem: 'Ana T.',
      oque: 'casa: Casa Um → Casa Dois',
    });
    expect(partirDescricao('Importação inicial')).toEqual({ quem: null, oque: 'Importação inicial' });
  });
});

describe('podeHaverMais', () => {
  it('só quando veio tudo o que se pediu', () => {
    expect(podeHaverMais(20, 20)).toBe(true);
    expect(podeHaverMais(7, 20)).toBe(false);
    expect(podeHaverMais(200, 200)).toBe(false);
  });

  it('proximoLimite não passa o máximo do servidor', () => {
    expect(proximoLimite(20)).toBe(40);
    expect(proximoLimite(190)).toBe(200);
    expect(proximoLimite(200)).toBe(200);
  });
});
