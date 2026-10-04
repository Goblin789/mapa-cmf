import { describe, expect, it } from 'vitest';
import { ENDERECO_OMISSAO, escolherEndereco, lerArgumentosPublicar } from './argumentos';

describe('lerArgumentosPublicar', () => {
  it('sem argumentos: tudo desligado', () => {
    expect(lerArgumentosPublicar([])).toEqual({
      opcoes: { forcar: false, semVerificar: false, esperar: false, ajuda: false },
    });
  });

  it('lê as opções simples e o endereço (separado ou com =)', () => {
    expect(lerArgumentosPublicar(['--esperar', '--forcar', '--sem-verificar'])).toEqual({
      opcoes: { forcar: true, semVerificar: true, esperar: true, ajuda: false },
    });
    expect(lerArgumentosPublicar(['--endereco', 'https://exemplo.onrender.com'])).toMatchObject({
      opcoes: { endereco: 'https://exemplo.onrender.com' },
    });
    expect(lerArgumentosPublicar(['--endereco=https://exemplo.onrender.com'])).toMatchObject({
      opcoes: { endereco: 'https://exemplo.onrender.com' },
    });
    expect(lerArgumentosPublicar(['-h'])).toMatchObject({ opcoes: { ajuda: true } });
  });

  it('argumentos desconhecidos, endereço em falta ou repetido: erro', () => {
    expect(lerArgumentosPublicar(['--force'])).toHaveProperty('erro');
    expect(lerArgumentosPublicar(['publicar'])).toHaveProperty('erro');
    expect(lerArgumentosPublicar(['--endereco'])).toHaveProperty('erro');
    expect(lerArgumentosPublicar(['--endereco', '--esperar'])).toHaveProperty('erro');
    expect(lerArgumentosPublicar(['--endereco=a', '--endereco=b'])).toHaveProperty('erro');
  });
});

describe('escolherEndereco', () => {
  it('o --endereco tem prioridade e fica só a origem', () => {
    expect(escolherEndereco('https://exemplo.onrender.com/', 'https://outro.exemplo')).toEqual({
      endereco: 'https://exemplo.onrender.com',
      origem: '--endereco',
    });
  });

  it('um --endereco que não seja https público é erro', () => {
    expect(escolherEndereco('http://exemplo.onrender.com', undefined)).toHaveProperty('erro');
    expect(escolherEndereco('https://localhost:5173', undefined)).toHaveProperty('erro');
    expect(escolherEndereco('exemplo.onrender.com', undefined)).toHaveProperty('erro');
  });

  it('usa o ENDERECO_PUBLICO quando é https público', () => {
    expect(escolherEndereco(undefined, ' https://mapa.exemplo.lu ')).toEqual({
      endereco: 'https://mapa.exemplo.lu',
      origem: 'ENDERECO_PUBLICO',
    });
  });

  it('ignora o ENDERECO_PUBLICO do próprio PC e usa o domínio', () => {
    for (const local of ['http://localhost:5173', 'https://127.0.0.1:8787', '', undefined]) {
      expect(escolherEndereco(undefined, local)).toEqual({ endereco: ENDERECO_OMISSAO, origem: 'omissão' });
    }
  });
});
