import { describe, expect, it } from 'vitest';
import { SEM_LIGACAO, textoDoErro } from './erros';

describe('textoDoErro', () => {
  it('as falhas de rede do browser (Chrome, Firefox, Safari) passam a uma frase em português', () => {
    expect(textoDoErro('Failed to fetch')).toBe(SEM_LIGACAO);
    expect(textoDoErro('NetworkError when attempting to fetch resource.')).toBe(SEM_LIGACAO);
    expect(textoDoErro('Load failed')).toBe(SEM_LIGACAO);
    expect(textoDoErro('Network request failed')).toBe(SEM_LIGACAO);
  });

  it('as mensagens do servidor (já em português) ficam como estão', () => {
    expect(textoDoErro('O servidor respondeu 500 ao pedir o histórico.')).toBe(
      'O servidor respondeu 500 ao pedir o histórico.',
    );
    expect(textoDoErro('Há mudanças que não se podem gravar. Nada foi gravado. Ana T. não está ativa.')).toBe(
      'Há mudanças que não se podem gravar. Nada foi gravado. Ana T. não está ativa.',
    );
  });

  it('uma mensagem que só menciona "load failed" a meio não é confundida com falta de rede', () => {
    expect(textoDoErro('Upload failed: ficheiro grande')).toBe('Upload failed: ficheiro grande');
  });
});
