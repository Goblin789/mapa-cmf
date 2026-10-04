// Desfazer e Refazer de um passo de "Reverter" (M2): o aviso diz "Reversão: N alterações", e não a frase de
// uma das operações. fetch e localStorage falsos; só dados fictícios.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Operacao } from '../../dominio/operacoes';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import { useLoja } from '../estado/loja';
import { desfazerComAviso, refazerComAviso } from './acoes';
import { useUiEdicao } from './ui';

const INICIAL = useLoja.getState();

const MOVER_ANA: Operacao = {
  tipo: 'mover',
  pessoaId: 'p-ana',
  campo: 'casaId',
  de: 'casa-1',
  para: 'casa-2',
};

beforeEach(() => {
  useLoja.setState(INICIAL, true);
  const dados = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() {
      return dados.size;
    },
    key: (i: number) => [...dados.keys()][i] ?? null,
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => dados.set(k, v),
    removeItem: (k: string) => dados.delete(k),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ...estadoExemplo(), versao: 7 }), { status: 200 })),
  );
});

afterEach(() => {
  useLoja.getState().cancelarEdicao();
  vi.unstubAllGlobals();
});

describe('Desfazer / Refazer de uma reversão', () => {
  it('dizem "Reversão: N alterações"; um passo normal continua com a sua frase', async () => {
    await useLoja.getState().carregar();
    expect(useLoja.getState().iniciarReversao(5, [MOVER_ANA])).toBe(true);
    desfazerComAviso();
    expect(useUiEdicao.getState().aviso?.texto).toBe('Desfeito: Reversão: 1 alteração');
    refazerComAviso();
    expect(useUiEdicao.getState().aviso?.texto).toBe('Refeito: Reversão: 1 alteração');

    useLoja.getState().aplicar([{ ...MOVER_ANA, campo: 'carrinhaId', de: 'zz1001', para: null }]);
    desfazerComAviso();
    expect(useUiEdicao.getState().aviso?.texto).not.toContain('Reversão');
  });
});
