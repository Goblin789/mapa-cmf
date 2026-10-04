import { describe, expect, it } from 'vitest';
import {
  destinoDaEntrada,
  lerErroEntrada,
  querySemErroEntrada,
  textoErroEntrada,
  urlEntrar,
} from './entrada';

describe('textoErroEntrada', () => {
  it('uma frase para cada código que o servidor manda', () => {
    expect(textoErroEntrada('sem-acesso')).toBe(
      'A tua conta não tem acesso ao Mapa CMF. Pede ao Rafael para te dar acesso.',
    );
    expect(textoErroEntrada('expirou')).toBe('O pedido de entrada expirou. Tenta outra vez.');
    expect(textoErroEntrada('cancelado')).toBe('A entrada foi cancelada. Quando quiseres, tenta outra vez.');
    expect(textoErroEntrada('falhou')).toBe('Não foi possível entrar. Tenta outra vez.');
  });

  it('código desconhecido (ou vazio): a frase geral; sem código: nada', () => {
    expect(textoErroEntrada('outra-coisa')).toBe('Não foi possível entrar. Tenta outra vez.');
    expect(textoErroEntrada('')).toBe('Não foi possível entrar. Tenta outra vez.');
    expect(textoErroEntrada('constructor')).toBe('Não foi possível entrar. Tenta outra vez.');
    expect(textoErroEntrada(null)).toBeNull();
  });
});

describe('erro da entrada no URL', () => {
  it('lê o código', () => {
    expect(lerErroEntrada('?erro-entrada=expirou')).toBe('expirou');
    expect(lerErroEntrada('?vista=tabela&erro-entrada=sem-acesso')).toBe('sem-acesso');
    expect(lerErroEntrada('?vista=tabela')).toBeNull();
    expect(lerErroEntrada('')).toBeNull();
  });

  it('tira-o da query e deixa o resto pela mesma ordem', () => {
    expect(querySemErroEntrada('?erro-entrada=expirou')).toBe('');
    expect(querySemErroEntrada('?a=1&erro-entrada=x&b=2')).toBe('?a=1&b=2');
    expect(querySemErroEntrada('?vista=tabela')).toBe('?vista=tabela');
    expect(querySemErroEntrada('')).toBe('');
  });
});

describe('destino da entrada', () => {
  it('caminho e query atuais, sem o erro da entrada', () => {
    expect(destinoDaEntrada('/', '')).toBe('/');
    expect(destinoDaEntrada('/', '?erro-entrada=expirou')).toBe('/');
    expect(destinoDaEntrada('/', '?vista=tabela&erro-entrada=falhou')).toBe('/?vista=tabela');
    expect(destinoDaEntrada('/quadro', '?cliente=c1')).toBe('/quadro?cliente=c1');
  });

  it('mantém o hash: a vista e o modo reunião vivem lá', () => {
    expect(destinoDaEntrada('/', '', '#quadro')).toBe('/#quadro');
    expect(destinoDaEntrada('/', '', '#reuniao')).toBe('/#reuniao');
    expect(destinoDaEntrada('/', '?erro-entrada=expirou', '#tabela')).toBe('/#tabela');
    expect(destinoDaEntrada('/', '?a=1&erro-entrada=falhou', '#reuniao-mapa')).toBe('/?a=1#reuniao-mapa');
    // Sem hash, ou só "#": nada.
    expect(destinoDaEntrada('/', '', '')).toBe('/');
    expect(destinoDaEntrada('/', '', '#')).toBe('/');
  });

  it('é sempre um caminho do próprio site', () => {
    expect(destinoDaEntrada('//outro.exemplo/x', '')).toBe('/outro.exemplo/x');
    expect(destinoDaEntrada('/\\outro.exemplo', '')).toBe('/outro.exemplo');
    expect(destinoDaEntrada('', '')).toBe('/');
  });

  it('URL da entrada com o destino codificado', () => {
    expect(urlEntrar('/')).toBe('/api/auth/entrar?destino=%2F');
    expect(urlEntrar('/?vista=tabela&a=1')).toBe('/api/auth/entrar?destino=%2F%3Fvista%3Dtabela%26a%3D1');
    // O "#" vai codificado: senão o browser cortava-o do pedido e o servidor nunca o via.
    expect(urlEntrar('/#reuniao')).toBe('/api/auth/entrar?destino=%2F%23reuniao');
  });
});
