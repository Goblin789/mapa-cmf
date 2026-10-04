import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEM_LIGACAO } from '../edicao/erros';
import {
  criarLojaSessao,
  entrouOutraConta,
  esperaDepoisDaFalha,
  lerUtilizador,
  TEMPO_MAXIMO_VERIFICACAO_MS,
  TEXTO_DEMOROU,
  textoErroServidor,
} from './sessao';

// Dados fictícios.
const ANA = {
  chave: 'ana.exemplo@exemplo.lu',
  nome: 'Ana Exemplo',
  email: 'ana.exemplo@exemplo.lu',
  modo: 'entra',
};
const BRUNO = {
  chave: 'bruno.exemplo@exemplo.lu',
  nome: 'Bruno Exemplo',
  email: 'bruno.exemplo@exemplo.lu',
  modo: 'entra',
};
const LOCAL = { chave: 'local', nome: 'Este computador', email: null, modo: 'local' };

function resposta(status: number, corpo?: unknown): Response {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type Passo = Response | Error | Promise<Response>;

/** fetch falso: responde pela ordem dada; um Error faz de falha de rede. */
function fetchFalso(...passos: Passo[]) {
  return vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
    const passo = passos.shift();
    if (passo === undefined) throw new Error('Pedido a mais no teste.');
    if (passo instanceof Error) throw passo;
    return passo;
  });
}

/** Um pedido pendurado: nunca responde (como uma rede que abre a ligação e depois não diz nada). */
function nuncaResponde(): Promise<Response> {
  return new Promise<Response>(() => {});
}

/** Uma resposta que só chega quando o teste quiser. */
function respostaAdiada() {
  let responder: (r: Response) => void = () => {};
  const promessa = new Promise<Response>((r) => {
    responder = r;
  });
  return { promessa, responder };
}

function criar(pedir: ReturnType<typeof fetchFalso>) {
  return criarLojaSessao({ pedir, agora: () => Date.now() });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T08:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('verificar', () => {
  it('começa a verificar; 200 → dentro, com o utilizador', async () => {
    const pedir = fetchFalso(resposta(200, ANA));
    const loja = criar(pedir);
    expect(loja.getState().estado).toBe('a-verificar');
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({
      estado: 'dentro',
      utilizador: ANA,
      erro: null,
      aVerificar: false,
    });
    expect(pedir).toHaveBeenCalledWith('/api/auth/eu', expect.anything());
  });

  it('modo local: dentro com "Este computador"', async () => {
    const loja = criar(fetchFalso(resposta(200, LOCAL)));
    await loja.getState().verificar();
    expect(loja.getState().estado).toBe('dentro');
    expect(loja.getState().utilizador).toEqual(LOCAL);
  });

  it('401 → fora, sem sessão', async () => {
    const loja = criar(fetchFalso(resposta(401, { erro: 'Sem sessão.' })));
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'fora', motivoFora: 'sem-sessao', utilizador: null });
  });

  it('sem rede: continua a verificar, com a mensagem, e volta a tentar com recuo', async () => {
    const pedir = fetchFalso(
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
      resposta(200, ANA),
    );
    const loja = criar(pedir);
    const inicio = Date.now();
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'a-verificar', erro: SEM_LIGACAO });
    expect(loja.getState().proximaTentativaEm).toBe(inicio + 2000);

    await vi.advanceTimersByTimeAsync(1999);
    expect(pedir).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pedir).toHaveBeenCalledTimes(2);
    // 2.ª falha: 5 s.
    expect(loja.getState().proximaTentativaEm).toBe(Date.now() + 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(pedir).toHaveBeenCalledTimes(3);
    // 3.ª falha: 10 s.
    expect(loja.getState().proximaTentativaEm).toBe(Date.now() + 10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pedir).toHaveBeenCalledTimes(4);
    expect(loja.getState()).toMatchObject({ estado: 'dentro', erro: null, proximaTentativaEm: null });

    // Depois de entrar não fica nenhuma tentativa marcada.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pedir).toHaveBeenCalledTimes(4);
  });

  it('erro do servidor (5xx) ou resposta estranha: continua a verificar', async () => {
    const loja = criar(fetchFalso(resposta(503), resposta(200, { ola: 1 }), resposta(200, ANA)));
    await loja.getState().verificar();
    expect(loja.getState().estado).toBe('a-verificar');
    expect(loja.getState().erro).toContain('503');
    await vi.advanceTimersByTimeAsync(2000);
    expect(loja.getState().estado).toBe('a-verificar');
    expect(loja.getState().erro).toBe('O servidor deu uma resposta inesperada.');
    await vi.advanceTimersByTimeAsync(5000);
    expect(loja.getState().estado).toBe('dentro');
  });

  it('nunca há duas verificações ao mesmo tempo', async () => {
    const adiada = respostaAdiada();
    const pedir = fetchFalso(adiada.promessa);
    const loja = criar(pedir);
    const a = loja.getState().verificar();
    const b = loja.getState().verificar();
    expect(loja.getState().aVerificar).toBe(true);
    expect(pedir).toHaveBeenCalledTimes(1);
    adiada.responder(resposta(200, ANA));
    await Promise.all([a, b]);
    expect(loja.getState().estado).toBe('dentro');
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('"Tentar outra vez" pergunta já e desmarca a tentativa automática', async () => {
    const pedir = fetchFalso(new TypeError('Failed to fetch'), new TypeError('Failed to fetch'));
    const loja = criar(pedir);
    await loja.getState().verificar();
    await loja.getState().verificar();
    expect(pedir).toHaveBeenCalledTimes(2);
    // A tentativa de daqui a 2 s foi trocada pela de agora (que, falhando, marca outra para daqui a 5 s).
    expect(loja.getState().proximaTentativaEm).toBe(Date.now() + 5000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('verificar com a sessão iniciada (ex.: o tempo real perdeu a ligação)', async () => {
    const loja = criar(
      fetchFalso(
        resposta(200, ANA),
        resposta(200, { ...ANA }),
        new TypeError('Failed to fetch'),
        resposta(401),
      ),
    );
    await loja.getState().verificar();
    const antes = loja.getState().utilizador;
    // A mesma pessoa: o objeto fica o mesmo.
    await loja.getState().verificar();
    expect(loja.getState().utilizador).toBe(antes);
    // Sem rede: continua dentro e não insiste sozinho.
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'dentro', erro: null, proximaTentativaEm: null });
    // 401: a sessão terminou a meio do trabalho.
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'fora', motivoFora: 'terminou' });
  });
});

describe('tempo máximo da verificação', () => {
  it('sem resposta em 15 s: é uma falha como as outras (mensagem, botão e nova tentativa)', async () => {
    const pedir = fetchFalso(nuncaResponde(), resposta(200, ANA));
    const loja = criar(pedir);
    const pergunta = loja.getState().verificar();
    await vi.advanceTimersByTimeAsync(TEMPO_MAXIMO_VERIFICACAO_MS - 1);
    expect(loja.getState()).toMatchObject({ estado: 'a-verificar', aVerificar: true, erro: null });

    await vi.advanceTimersByTimeAsync(1);
    await pergunta;
    expect(loja.getState()).toMatchObject({ estado: 'a-verificar', aVerificar: false, erro: TEXTO_DEMOROU });
    expect(loja.getState().proximaTentativaEm).toBe(Date.now() + 2000);
    // O pedido pendurado foi cancelado.
    expect(pedir.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(loja.getState()).toMatchObject({ estado: 'dentro', erro: null });
  });

  it('o corpo da resposta também conta para o tempo máximo', async () => {
    const corpoPendurado = { ok: true, status: 200, json: nuncaResponde } as unknown as Response;
    const loja = criar(fetchFalso(corpoPendurado));
    const pergunta = loja.getState().verificar();
    await vi.advanceTimersByTimeAsync(TEMPO_MAXIMO_VERIFICACAO_MS);
    await pergunta;
    expect(loja.getState()).toMatchObject({ estado: 'a-verificar', erro: TEXTO_DEMOROU });
  });

  it('depois de responder, o tempo máximo já não faz nada', async () => {
    const pedir = fetchFalso(resposta(200, ANA));
    const loja = criar(pedir);
    await loja.getState().verificar();
    await vi.advanceTimersByTimeAsync(TEMPO_MAXIMO_VERIFICACAO_MS * 2);
    expect(loja.getState()).toMatchObject({ estado: 'dentro', erro: null });
    expect(pedir.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
  });
});

describe('marcarFora', () => {
  it('a meio do trabalho → fora, porque a sessão terminou', async () => {
    const loja = criar(fetchFalso(resposta(200, ANA)));
    await loja.getState().verificar();
    loja.getState().marcarFora();
    expect(loja.getState()).toMatchObject({ estado: 'fora', motivoFora: 'terminou', utilizador: null });
    // Um segundo 401 não muda o motivo.
    loja.getState().marcarFora();
    expect(loja.getState().motivoFora).toBe('terminou');
  });

  it('uma verificação que já ia a meio deixa de contar', async () => {
    const adiada = respostaAdiada();
    const loja = criar(fetchFalso(resposta(200, ANA), adiada.promessa));
    await loja.getState().verificar();
    loja.getState().marcarFora();
    // (Ex.: o Portao pergunta outra vez quando a pessoa volta à página.)
    const pergunta = loja.getState().verificar();
    loja.getState().marcarFora();
    adiada.responder(resposta(200, ANA));
    await pergunta;
    expect(loja.getState().estado).toBe('fora');
  });

  it('cancela a verificação pendurada: voltar a perguntar faz logo uma pergunta nova', async () => {
    // Ex.: o tempo real perdeu a ligação e perguntou; o pedido ficou pendurado; entretanto outro pedido
    // deu 401. Quando a pessoa volta à página depois de entrar noutro separador, pergunta-se de novo.
    const pedir = fetchFalso(resposta(200, ANA), nuncaResponde(), resposta(200, ANA));
    const loja = criar(pedir);
    await loja.getState().verificar();
    const pendurada = loja.getState().verificar();
    loja.getState().marcarFora();
    expect(pedir.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    await pendurada;

    await loja.getState().verificar();
    expect(pedir).toHaveBeenCalledTimes(3);
    expect(loja.getState()).toMatchObject({ estado: 'dentro', utilizador: ANA });
  });

  it('desmarca a tentativa automática', async () => {
    const pedir = fetchFalso(new TypeError('Failed to fetch'));
    const loja = criar(pedir);
    await loja.getState().verificar();
    loja.getState().marcarFora();
    expect(loja.getState()).toMatchObject({
      estado: 'fora',
      motivoFora: 'sem-sessao',
      proximaTentativaEm: null,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('depois de terminar: voltar a perguntar traz a sessão de volta, ou deixa como está', async () => {
    const pedir = fetchFalso(
      resposta(200, ANA),
      resposta(401),
      new TypeError('Failed to fetch'),
      resposta(200, ANA),
    );
    const loja = criar(pedir);
    await loja.getState().verificar();
    loja.getState().marcarFora();

    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'fora', motivoFora: 'terminou' });

    // Sem rede: fica como estava e não insiste sozinho (o Portao pergunta quando a pessoa volta).
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'fora', motivoFora: 'terminou', aVerificar: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pedir).toHaveBeenCalledTimes(3);

    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'dentro', motivoFora: null, utilizador: ANA });
  });
});

describe('conta anterior (o dono do rascunho quando a sessão termina a meio)', () => {
  it('fica registada ao terminar e esquece-se quando volta a mesma pessoa', async () => {
    const loja = criar(fetchFalso(resposta(200, ANA), resposta(200, ANA)));
    await loja.getState().verificar();
    expect(loja.getState().contaAnterior).toBeNull();
    loja.getState().marcarFora();
    expect(loja.getState().contaAnterior).toEqual(ANA);
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'dentro', utilizador: ANA, contaAnterior: null });
    expect(entrouOutraConta(loja.getState())).toBe(false);
  });

  it('também quando é a verificação a dar 401', async () => {
    const loja = criar(fetchFalso(resposta(200, ANA), resposta(401)));
    await loja.getState().verificar();
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'fora', motivoFora: 'terminou', contaAnterior: ANA });
  });

  it('entra outra conta: fica dentro com ela, mas a conta anterior continua até se aceitar', async () => {
    const loja = criar(fetchFalso(resposta(200, ANA), resposta(200, BRUNO), resposta(200, BRUNO)));
    await loja.getState().verificar();
    loja.getState().marcarFora();
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ estado: 'dentro', utilizador: BRUNO, contaAnterior: ANA });
    expect(entrouOutraConta(loja.getState())).toBe(true);

    // Voltar a perguntar com a mesma conta nova não muda nada.
    await loja.getState().verificar();
    expect(entrouOutraConta(loja.getState())).toBe(true);

    loja.getState().aceitarOutraConta();
    expect(loja.getState().contaAnterior).toBeNull();
    expect(entrouOutraConta(loja.getState())).toBe(false);
  });

  it('entra outra conta e depois a certa: volta tudo ao normal', async () => {
    const loja = criar(fetchFalso(resposta(200, ANA), resposta(200, BRUNO), resposta(200, ANA)));
    await loja.getState().verificar();
    loja.getState().marcarFora();
    await loja.getState().verificar();
    expect(entrouOutraConta(loja.getState())).toBe(true);
    await loja.getState().verificar();
    expect(loja.getState()).toMatchObject({ utilizador: ANA, contaAnterior: null });
  });

  it('a sessão termina outra vez antes de se resolver: o dono continua a ser o primeiro', async () => {
    const loja = criar(fetchFalso(resposta(200, ANA), resposta(200, BRUNO)));
    await loja.getState().verificar();
    loja.getState().marcarFora();
    await loja.getState().verificar();
    loja.getState().marcarFora();
    expect(loja.getState()).toMatchObject({ estado: 'fora', motivoFora: 'terminou', contaAnterior: ANA });
  });

  it('sem sessão ao abrir a página não há conta anterior; Sair esquece-a', async () => {
    const semSessao = criar(fetchFalso(resposta(401)));
    await semSessao.getState().verificar();
    expect(semSessao.getState().contaAnterior).toBeNull();

    const loja = criar(fetchFalso(resposta(200, ANA), resposta(200, BRUNO), resposta(204)));
    await loja.getState().verificar();
    loja.getState().marcarFora();
    await loja.getState().verificar();
    expect(await loja.getState().sair()).toBe(true);
    expect(loja.getState().contaAnterior).toBeNull();
  });

  it('entrouOutraConta só com a sessão iniciada e uma conta anterior diferente', () => {
    const ana = { ...ANA, modo: 'entra' as const };
    const bruno = { ...BRUNO, modo: 'entra' as const };
    expect(entrouOutraConta({ estado: 'dentro', utilizador: bruno, contaAnterior: ana })).toBe(true);
    expect(entrouOutraConta({ estado: 'dentro', utilizador: ana, contaAnterior: ana })).toBe(false);
    expect(entrouOutraConta({ estado: 'dentro', utilizador: bruno, contaAnterior: null })).toBe(false);
    expect(entrouOutraConta({ estado: 'fora', utilizador: null, contaAnterior: ana })).toBe(false);
  });
});

describe('sair', () => {
  it('POST /api/auth/sair com JSON → fora, porque saiu', async () => {
    const pedir = fetchFalso(resposta(200, ANA), resposta(204));
    const loja = criar(pedir);
    await loja.getState().verificar();
    expect(await loja.getState().sair()).toBe(true);
    expect(loja.getState()).toMatchObject({
      estado: 'fora',
      motivoFora: 'saiu',
      utilizador: null,
      aSair: false,
    });
    const [url, init] = pedir.mock.calls[1] ?? [];
    expect(url).toBe('/api/auth/sair');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  it('401 ao sair: a sessão já tinha terminado, dá no mesmo', async () => {
    const loja = criar(fetchFalso(resposta(200, ANA), resposta(401)));
    await loja.getState().verificar();
    expect(await loja.getState().sair()).toBe(true);
    expect(loja.getState().motivoFora).toBe('saiu');
  });

  it('falhando, fica dentro e diz porquê', async () => {
    const loja = criar(fetchFalso(resposta(200, ANA), new TypeError('Failed to fetch'), resposta(500)));
    await loja.getState().verificar();
    expect(await loja.getState().sair()).toBe(false);
    expect(loja.getState()).toMatchObject({ estado: 'dentro', utilizador: ANA, aSair: false });
    expect(loja.getState().erroSair).toBe(`Não foi possível sair. ${SEM_LIGACAO}`);
    expect(await loja.getState().sair()).toBe(false);
    expect(loja.getState().erroSair).toContain('500');
  });

  it('o erro de sair esquece-se ao fechar o menu (não volta a aparecer da próxima vez)', async () => {
    const loja = criar(fetchFalso(resposta(200, ANA), new TypeError('Failed to fetch')));
    await loja.getState().verificar();
    await loja.getState().sair();
    expect(loja.getState().erroSair).not.toBeNull();
    loja.getState().limparErroSair();
    expect(loja.getState().erroSair).toBeNull();
    expect(loja.getState().estado).toBe('dentro');
  });

  it('dois cliques seguidos dão um só pedido', async () => {
    const adiada = respostaAdiada();
    const pedir = fetchFalso(resposta(200, ANA), adiada.promessa);
    const loja = criar(pedir);
    await loja.getState().verificar();
    const a = loja.getState().sair();
    expect(await loja.getState().sair()).toBe(false);
    adiada.responder(resposta(204));
    expect(await a).toBe(true);
    expect(pedir).toHaveBeenCalledTimes(2);
  });
});

describe('peças puras', () => {
  it('esperaDepoisDaFalha: 2 s, 5 s, 10 s, 20 s e depois sempre 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(esperaDepoisDaFalha)).toEqual([
      2000, 5000, 10_000, 20_000, 30_000, 30_000, 30_000,
    ]);
    expect(esperaDepoisDaFalha(0)).toBe(2000);
  });

  it('textoErroServidor: 502/503/504 é o servidor a arrancar; o resto, um erro', () => {
    expect(textoErroServidor(503)).toBe(
      'O servidor não está disponível de momento (erro 503): pode estar a arrancar.',
    );
    expect(textoErroServidor(500)).toBe('O servidor não respondeu como devia (erro 500).');
    expect(textoErroServidor(404)).toBe('O servidor não respondeu como devia (erro 404).');
  });

  it('lerUtilizador aceita só a forma certa', () => {
    expect(lerUtilizador(ANA)).toEqual(ANA);
    expect(lerUtilizador({ ...LOCAL, email: undefined })).toEqual(LOCAL);
    expect(lerUtilizador(null)).toBeNull();
    expect(lerUtilizador('Ana')).toBeNull();
    expect(lerUtilizador({ ...ANA, modo: 'admin' })).toBeNull();
    expect(lerUtilizador({ ...ANA, nome: 3 })).toBeNull();
  });
});
