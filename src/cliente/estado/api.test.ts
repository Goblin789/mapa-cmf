import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessao } from '../entrar/sessao';
import {
  ErroConflito,
  ErroServidor,
  ErroSessao,
  geocodificarMorada,
  geocodificarPosicao,
  guardarLote,
  obterEstado,
  obterHistorico,
  pedirApi,
} from './api';

// Dados fictícios.
const ANA = { chave: 'ana.exemplo@exemplo.lu', nome: 'Ana Exemplo', email: 'ana.exemplo@exemplo.lu' };
const inicial = useSessao.getState();

function resposta(status: number, corpo?: unknown): Response {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function responderSempre(status: number, corpo?: unknown) {
  const falso = vi.fn(async (_url: string, _init?: RequestInit) => resposta(status, corpo));
  vi.stubGlobal('fetch', falso);
  return falso;
}

beforeEach(() => {
  useSessao.setState({ estado: 'dentro', utilizador: { ...ANA, modo: 'entra' }, motivoFora: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSessao.setState(inicial, true);
});

describe('401 em qualquer pedido', () => {
  const pedidos: [string, () => Promise<unknown>][] = [
    ['obterEstado', () => obterEstado()],
    ['guardarLote', () => guardarLote({ versaoBase: 3, operacoes: [] })],
    ['obterHistorico', () => obterHistorico(20)],
    ['pedirApi', () => pedirApi('/api/outra-coisa')],
  ];

  for (const [nome, pedir] of pedidos) {
    it(`${nome}: lança ErroSessao e marca a sessão como terminada`, async () => {
      responderSempre(401, { erro: 'Sem sessão.' });
      await expect(pedir()).rejects.toBeInstanceOf(ErroSessao);
      expect(useSessao.getState()).toMatchObject({
        estado: 'fora',
        motivoFora: 'terminou',
        utilizador: null,
      });
    });
  }

  it('a mensagem do ErroSessao manda entrar outra vez', () => {
    expect(new ErroSessao().message).toBe('A sessão terminou. Entra outra vez com a conta Microsoft.');
  });
});

describe('as outras respostas ficam como estavam', () => {
  it('pedirApi passa o pedido tal e qual e devolve a resposta (também os erros)', async () => {
    const falso = responderSempre(500, { erro: 'Ups.' });
    const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };
    const r = await pedirApi('/api/coisa', init);
    expect(r.status).toBe(500);
    expect(falso).toHaveBeenCalledWith('/api/coisa', init);
    expect(useSessao.getState().estado).toBe('dentro');
  });

  it('guardarLote: 201, 409 (ErroConflito) e 400 (ErroServidor)', async () => {
    responderSempre(201, { loteId: 7, versao: 4 });
    expect(await guardarLote({ versaoBase: 3, operacoes: [] })).toEqual({ loteId: 7, versao: 4 });

    const conflitos = [{ tipo: 'mover', pessoaId: 'p1', descricao: 'Ana Exemplo mudou entretanto.' }];
    responderSempre(409, { erro: 'Alguém mudou.', conflitos });
    await expect(guardarLote({ versaoBase: 3, operacoes: [] })).rejects.toBeInstanceOf(ErroConflito);

    responderSempre(400, { erro: 'Pedido inválido.', erros: ['Falta a versão.'] });
    const erro = await guardarLote({ versaoBase: 3, operacoes: [] }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroServidor);
    expect((erro as ErroServidor).estado).toBe(400);
    expect((erro as ErroServidor).message).toBe('Pedido inválido. Falta a versão.');
    expect(useSessao.getState().estado).toBe('dentro');
  });

  it('obterHistorico e obterEstado: 200 devolve o corpo; outro erro lança Error normal', async () => {
    const falso = responderSempre(200, []);
    expect(await obterHistorico(20)).toEqual([]);
    expect(falso.mock.calls[0]?.[0]).toBe('/api/historico?limite=20');

    responderSempre(503);
    const erro = await obterEstado().catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);
    expect(erro).not.toBeInstanceOf(ErroSessao);
    expect(useSessao.getState().estado).toBe('dentro');
  });

  it('sem rede, o erro do fetch passa (a sessão não muda)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(obterEstado()).rejects.toThrow('Failed to fetch');
    expect(useSessao.getState().estado).toBe('dentro');
  });
});

describe('M2: moradas (geocodificar)', () => {
  const RESULTADO = {
    rotulo: '1 Rue Fictícia, L-0000 Lugar',
    lat: 49.6,
    lng: 6.1,
    pais: 'LU',
    fonte: 'geoportail.lu',
    confianca: 0.9,
  };

  it('geocodificarMorada: POST JSON com a morada e o país; devolve os resultados', async () => {
    const falso = responderSempre(200, { resultados: [RESULTADO] });
    await expect(geocodificarMorada('1 Rue Fictícia', 'LU')).resolves.toStrictEqual([RESULTADO]);
    const [url, init] = falso.mock.calls[0] ?? [];
    expect(url).toBe('/api/geocodificar');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toStrictEqual({ morada: '1 Rue Fictícia', pais: 'LU' });
  });

  it('geocodificarPosicao: POST JSON com a posição; null quando não há morada', async () => {
    const falso = responderSempre(200, { resultado: null });
    await expect(geocodificarPosicao(49.6, 6.1)).resolves.toBeNull();
    const [url, init] = falso.mock.calls[0] ?? [];
    expect(url).toBe('/api/geocodificar/inverso');
    expect(JSON.parse(String(init?.body))).toStrictEqual({ lat: 49.6, lng: 6.1 });
    responderSempre(200, { resultado: RESULTADO });
    await expect(geocodificarPosicao(49.6, 6.1)).resolves.toStrictEqual(RESULTADO);
  });

  it('erros: a frase do servidor (502, 503, 429, 400); 401 = ErroSessao', async () => {
    responderSempre(502, {
      erro: 'O serviço de moradas não respondeu. Tenta outra vez ou escolhe o sítio no mapa.',
    });
    await expect(geocodificarMorada('x', 'LU')).rejects.toThrow(
      'O serviço de moradas não respondeu. Tenta outra vez ou escolhe o sítio no mapa.',
    );
    responderSempre(503, { erro: 'O serviço de moradas não está ligado. Escolhe o sítio no mapa.' });
    await expect(geocodificarPosicao(49.6, 6.1)).rejects.toThrow('não está ligado');
    responderSempre(400, { erro: 'Pedido inválido.', erros: ['morada: Escreve a morada.'] });
    const erro = await geocodificarMorada(' ', 'LU').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroServidor);
    expect((erro as ErroServidor).estado).toBe(400);
    expect((erro as Error).message).toBe('Pedido inválido. morada: Escreve a morada.');
    responderSempre(500);
    await expect(geocodificarMorada('x', 'LU')).rejects.toThrow('O servidor respondeu 500.');
    responderSempre(401, { erro: 'Sem sessão.' });
    await expect(geocodificarMorada('x', 'LU')).rejects.toBeInstanceOf(ErroSessao);
    expect(useSessao.getState().estado).toBe('fora');
  });
});
