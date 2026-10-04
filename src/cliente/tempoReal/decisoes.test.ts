import { describe, expect, it, vi } from 'vitest';
import type { EventoLote } from '../../dominio/api';
import {
  type ContextoLoja,
  criarRecarregador,
  decidirLote,
  decidirVersao,
  esperaParaReabrir,
  juntarAviso,
  lerEventoLote,
  lerEventoVersao,
  textoAvisoLote,
} from './decisoes';

const LOTE: EventoLote = {
  versao: 12,
  loteId: 12,
  autor: 'ana@exemplo.lu',
  autorNome: 'Ana Exemplo',
  alteracoes: 3,
};

function contexto(parcial: Partial<ContextoLoja> = {}): ContextoLoja {
  return {
    versaoLocal: 11,
    aCarregar: false,
    aGuardar: false,
    comRascunho: false,
    lotesDesteSeparador: new Set(),
    ...parcial,
  };
}

describe('ler os eventos', () => {
  it('versão: só um inteiro não negativo', () => {
    expect(lerEventoVersao('{"versao":7}')).toBe(7);
    expect(lerEventoVersao('{"versao":0}')).toBe(0);
    expect(lerEventoVersao('{"versao":-1}')).toBeNull();
    expect(lerEventoVersao('{"versao":"7"}')).toBeNull();
    expect(lerEventoVersao('{"versao":1.5}')).toBeNull();
    expect(lerEventoVersao('não é json')).toBeNull();
    expect(lerEventoVersao('[7]')).toBeNull();
    expect(lerEventoVersao(undefined)).toBeNull();
  });

  it('lote: precisa de todos os campos com o tipo certo', () => {
    expect(lerEventoLote(JSON.stringify(LOTE))).toStrictEqual(LOTE);
    expect(lerEventoLote(JSON.stringify({ ...LOTE, extra: 'ignorado' }))).toStrictEqual(LOTE);
    expect(lerEventoLote(JSON.stringify({ ...LOTE, loteId: '12' }))).toBeNull();
    expect(lerEventoLote(JSON.stringify({ ...LOTE, autorNome: null }))).toBeNull();
    expect(lerEventoLote(JSON.stringify({ ...LOTE, alteracoes: undefined }))).toBeNull();
    expect(lerEventoLote('{')).toBeNull();
    expect(lerEventoLote(null)).toBeNull();
  });
});

describe('textoAvisoLote', () => {
  it('singular e plural', () => {
    expect(textoAvisoLote({ autorNome: 'Michael Exemplo', alteracoes: 3 }, false)).toBe(
      'Michael Exemplo gravou 3 alterações.',
    );
    expect(textoAvisoLote({ autorNome: 'Michael Exemplo', alteracoes: 1 }, false)).toBe(
      'Michael Exemplo gravou 1 alteração.',
    );
  });

  it('com rascunho por guardar diz que ele continua por cima', () => {
    expect(textoAvisoLote({ autorNome: 'João Exemplo', alteracoes: 2 }, true)).toBe(
      'João Exemplo gravou 2 alterações. O teu rascunho continua por cima.',
    );
  });

  it('sem nome ou sem número não fica uma frase estranha', () => {
    expect(textoAvisoLote({ autorNome: '  ', alteracoes: 1 }, false)).toBe('Alguém gravou 1 alteração.');
    expect(textoAvisoLote({ autorNome: 'Ana Exemplo', alteracoes: 0 }, false)).toBe(
      'Ana Exemplo gravou alterações.',
    );
  });
});

describe('decidirVersao (ao ligar)', () => {
  it('recarrega se o servidor tiver outra versão; a mesma: nada', () => {
    expect(decidirVersao(12, { versaoLocal: 11, aCarregar: false })).toBe('recarregar');
    expect(decidirVersao(11, { versaoLocal: 11, aCarregar: false })).toBe('nada');
  });

  it('versão mais antiga (a BD foi restaurada de uma cópia): recarrega', () => {
    expect(decidirVersao(100, { versaoLocal: 120, aCarregar: false })).toBe('recarregar');
  });

  it('sem estado: espera pelo carregamento em curso, ou carrega se não houver nenhum', () => {
    expect(decidirVersao(3, { versaoLocal: null, aCarregar: true })).toBe('esperar');
    expect(decidirVersao(3, { versaoLocal: null, aCarregar: false })).toBe('recarregar');
  });
});

describe('decidirLote', () => {
  it('lote de outro separador mais recente: recarrega e avisa', () => {
    expect(decidirLote(LOTE, contexto())).toStrictEqual({
      tipo: 'seguir',
      recarregar: true,
      aviso: 'Ana Exemplo gravou 3 alterações.',
    });
  });

  it('lote deste separador: nem recarrega nem avisa (mesmo que a versão seja mais recente)', () => {
    expect(decidirLote(LOTE, contexto({ lotesDesteSeparador: new Set([12]) }))).toStrictEqual({
      tipo: 'seguir',
      recarregar: false,
      aviso: null,
    });
  });

  it('o autor não conta: o mesmo autor noutro separador (ou no modo local) é avisado', () => {
    const local = { ...LOTE, autor: 'local', autorNome: 'Este computador' };
    expect(decidirLote(local, contexto({ lotesDesteSeparador: new Set([5]) }))).toMatchObject({
      recarregar: true,
      aviso: 'Este computador gravou 3 alterações.',
    });
  });

  it('a meio de um Guardar, adia (o lote pode ser deste separador e o POST ainda não respondeu)', () => {
    expect(decidirLote(LOTE, contexto({ aGuardar: true }))).toStrictEqual({ tipo: 'adiar' });
  });

  it('versão que a loja já tem: avisa sem recarregar', () => {
    expect(decidirLote(LOTE, contexto({ versaoLocal: 12 }))).toMatchObject({
      recarregar: false,
      aviso: expect.any(String),
    });
  });

  it('versão mais antiga do que a da loja (restauro: a numeração recomeçou): recarrega e avisa', () => {
    expect(decidirLote({ ...LOTE, versao: 101, loteId: 101 }, contexto({ versaoLocal: 120 }))).toMatchObject({
      recarregar: true,
      aviso: 'Ana Exemplo gravou 3 alterações.',
    });
  });

  it('sem estado carregado: recarrega', () => {
    expect(decidirLote(LOTE, contexto({ versaoLocal: null }))).toMatchObject({ recarregar: true });
  });

  it('em edição com alterações: o aviso diz que o rascunho continua por cima', () => {
    expect(decidirLote(LOTE, contexto({ comRascunho: true }))).toMatchObject({
      aviso: 'Ana Exemplo gravou 3 alterações. O teu rascunho continua por cima.',
    });
  });
});

describe('esperaParaReabrir', () => {
  it('5 s, 10 s, 20 s e depois 30 s', () => {
    expect([0, 1, 2, 3, 4, 10].map(esperaParaReabrir)).toStrictEqual([
      5000, 10_000, 20_000, 30_000, 30_000, 30_000,
    ]);
  });
});

describe('criarRecarregador', () => {
  function adiada() {
    let resolver!: () => void;
    const promessa = new Promise<void>((r) => {
      resolver = r;
    });
    return { promessa, resolver };
  }

  it('pedidos seguidos enquanto carrega dão UMA carga extra no fim', async () => {
    const cargas: ReturnType<typeof adiada>[] = [];
    const carregar = vi.fn(() => {
      const c = adiada();
      cargas.push(c);
      return c.promessa;
    });
    const recarregar = criarRecarregador(carregar);

    const fim = recarregar();
    void recarregar();
    void recarregar();
    void recarregar();
    expect(carregar).toHaveBeenCalledTimes(1);

    cargas[0]?.resolver();
    await vi.waitFor(() => expect(carregar).toHaveBeenCalledTimes(2));
    cargas[1]?.resolver();
    await fim;
    expect(carregar).toHaveBeenCalledTimes(2);

    // Depois de acabar, um pedido novo carrega outra vez.
    const outra = recarregar();
    expect(carregar).toHaveBeenCalledTimes(3);
    cargas[2]?.resolver();
    await outra;
  });

  it('um erro ao carregar não estraga os pedidos seguintes', async () => {
    const carregar = vi.fn().mockRejectedValueOnce(new Error('sem rede')).mockResolvedValue(undefined);
    const recarregar = criarRecarregador(carregar);
    await expect(recarregar()).resolves.toBeUndefined();
    await recarregar();
    expect(carregar).toHaveBeenCalledTimes(2);
  });
});

describe('juntarAviso', () => {
  it('no máximo 3: saem os mais antigos, o novo fica no fim', () => {
    let avisos = juntarAviso([], { id: 1, texto: 'a' });
    avisos = juntarAviso(avisos, { id: 2, texto: 'b' });
    avisos = juntarAviso(avisos, { id: 3, texto: 'c' });
    avisos = juntarAviso(avisos, { id: 4, texto: 'd' });
    expect(avisos.map((a) => a.id)).toStrictEqual([2, 3, 4]);
  });
});
