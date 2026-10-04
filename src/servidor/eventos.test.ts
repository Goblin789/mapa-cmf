import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventoLote } from '../dominio/api';
import { type CanalEventos, criarCanalEventos, MAXIMO_POR_ENVIAR, SINAL } from './eventos';

const LOTE: EventoLote = {
  versao: 8,
  loteId: 41,
  autor: 'ana@exemplo.lu',
  autorNome: 'Ana Exemplo',
  alteracoes: 3,
};

let canal: CanalEventos;

afterEach(() => {
  canal?.fechar();
  vi.restoreAllMocks();
});

/**
 * Espia os temporizadores do sinal (os setInterval com este intervalo): quantos foram criados e se cada um
 * já foi parado.
 */
function espiarSinal(intervaloMs: number) {
  const criar = vi.spyOn(globalThis, 'setInterval');
  const parar = vi.spyOn(globalThis, 'clearInterval');
  const criados = () =>
    criar.mock.calls.flatMap(([, ms], i) => (ms === intervaloMs ? [criar.mock.results[i]?.value] : []));
  return {
    criados: () => criados().length,
    /** Temporizadores do sinal ainda a correr. */
    aCorrer: () => criados().filter((t) => !parar.mock.calls.some(([x]) => x === t)).length,
  };
}

function criarAppTeste(versao = 7): Hono {
  const app = new Hono();
  app.get('/api/eventos', (c) => canal.responder(c, versao));
  return app;
}

/** Lê o stream aos poucos e junta o texto, para esperar por pedaços. */
function leitor(resposta: Response) {
  if (!resposta.body) throw new Error('A resposta não tem corpo.');
  const leitura = resposta.body.getReader();
  const descodificador = new TextDecoder();
  let texto = '';
  let terminou = false;
  const ciclo = (async () => {
    for (;;) {
      const { done, value } = await leitura.read();
      if (done) break;
      texto += descodificador.decode(value, { stream: true });
    }
    terminou = true;
  })().catch(() => {
    terminou = true;
  });
  return {
    texto: () => texto,
    terminou: () => terminou,
    /** Espera até o texto ter `pedaco` (ou até `ms`). */
    async esperar(pedaco: string, ms = 1000): Promise<string> {
      const limite = Date.now() + ms;
      while (!texto.includes(pedaco)) {
        if (Date.now() > limite) throw new Error(`Não chegou ${JSON.stringify(pedaco)}. Chegou: ${texto}`);
        await new Promise((r) => setTimeout(r, 5));
      }
      return texto;
    },
    cancelar: () => leitura.cancel(),
    ciclo,
  };
}

async function esperarQue(condicao: () => boolean, ms = 1000): Promise<void> {
  const limite = Date.now() + ms;
  while (!condicao()) {
    if (Date.now() > limite) throw new Error('A condição não chegou a ser verdadeira.');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('GET /api/eventos', () => {
  it('responde em text/event-stream, sem cache nem buffer, e começa com retry e a versão', async () => {
    canal = criarCanalEventos();
    const resposta = await criarAppTeste(7).request('/api/eventos');

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Content-Type')).toBe('text/event-stream');
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    expect(resposta.headers.get('X-Accel-Buffering')).toBe('no');

    const l = leitor(resposta);
    const texto = await l.esperar('\n\nevent: versao\ndata: {"versao":7}\n\n');
    expect(texto).toBe('retry: 5000\n\nevent: versao\ndata: {"versao":7}\n\n');
    expect(canal.ligacoes()).toBe(1);
  });

  it('cada lote publicado chega a todas as ligações abertas', async () => {
    canal = criarCanalEventos();
    const app = criarAppTeste();
    const a = leitor(await app.request('/api/eventos'));
    const b = leitor(await app.request('/api/eventos'));
    await a.esperar('versao');
    await b.esperar('versao');
    expect(canal.ligacoes()).toBe(2);

    canal.publicar(LOTE);
    const esperado = `event: lote\ndata: ${JSON.stringify(LOTE)}\n\n`;
    expect(await a.esperar(esperado)).toContain(esperado);
    expect(await b.esperar(esperado)).toContain(esperado);
    // Os dados são o EventoLote tal e qual.
    const linha = (await a.esperar('event: lote')).split('\n').find((x) => x.startsWith('data: {"versao":8'));
    expect(JSON.parse(linha?.slice('data: '.length) ?? '')).toStrictEqual(LOTE);
  });

  it('manda o sinal de vida no intervalo configurado', async () => {
    canal = criarCanalEventos({ intervaloSinalMs: 20 });
    const l = leitor(await criarAppTeste().request('/api/eventos'));
    const texto = await l.esperar(`${SINAL}${SINAL}`, 2000);
    expect(texto.startsWith('retry: 5000\n\n')).toBe(true);
    // O comentário para os proxies e o evento que o browser vê, num só bloco.
    expect(SINAL).toBe(': sinal\nevent: sinal\ndata: {}\n\n');
  });

  it('acima do limite de ligações responde 503 em JSON', async () => {
    canal = criarCanalEventos({ maxLigacoes: 2 });
    const app = criarAppTeste();
    leitor(await app.request('/api/eventos'));
    leitor(await app.request('/api/eventos'));

    const terceira = await app.request('/api/eventos');
    expect(terceira.status).toBe(503);
    expect(terceira.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(terceira.headers.get('Retry-After')).toBe('30');
    expect(((await terceira.json()) as { erro: string }).erro).toMatch(/demasiadas ligações/);
    expect(canal.ligacoes()).toBe(2);
  });

  it('quando o browser fecha (pedido abortado), a ligação sai da lista', async () => {
    canal = criarCanalEventos();
    const app = criarAppTeste();
    const controlo = new AbortController();
    const l = leitor(await app.request('/api/eventos', { signal: controlo.signal }));
    leitor(await app.request('/api/eventos'));
    await l.esperar('versao');
    expect(canal.ligacoes()).toBe(2);

    controlo.abort();
    expect(canal.ligacoes()).toBe(1);
    await esperarQue(l.terminou);
    // Publicar depois não lança nem chega à ligação fechada.
    expect(() => canal.publicar(LOTE)).not.toThrow();
    expect(l.texto()).not.toContain('event: lote');
  });

  it('quando o stream é cancelado (o servidor Node faz isto ao cair a ligação), sai da lista', async () => {
    canal = criarCanalEventos();
    const l = leitor(await criarAppTeste().request('/api/eventos'));
    await l.esperar('versao');
    await l.cancelar();
    expect(canal.ligacoes()).toBe(0);
  });

  it('pedido já abortado não fica na lista', async () => {
    canal = criarCanalEventos();
    const controlo = new AbortController();
    controlo.abort();
    await criarAppTeste().request('/api/eventos', { signal: controlo.signal });
    expect(canal.ligacoes()).toBe(0);
  });

  it('um browser que deixou de ler é cortado, sem atrasar os outros', async () => {
    canal = criarCanalEventos();
    const app = criarAppTeste();
    const parado = await app.request('/api/eventos'); // ninguém lê
    const ativo = leitor(await app.request('/api/eventos'));
    await ativo.esperar('versao');

    const vezes = Math.ceil(MAXIMO_POR_ENVIAR / JSON.stringify(LOTE).length) + 5;
    for (let i = 0; i < vezes; i++) {
      canal.publicar({ ...LOTE, loteId: i });
      // Cada lote é um pedido: entre dois, o browser ativo tem tempo de ler.
      if (i % 10 === 0) await new Promise((r) => setImmediate(r));
    }
    expect(canal.ligacoes()).toBe(1);
    await ativo.esperar(`"loteId":${vezes - 1},`);
    // O stream cortado dá erro a quem o for ler.
    await expect(parado.body?.getReader().read()).rejects.toThrow();
  });

  it('o sinal só corre enquanto há ligações: pára quando a última sai e volta com a seguinte', async () => {
    const sinal = espiarSinal(30);
    canal = criarCanalEventos({ intervaloSinalMs: 30 });
    const app = criarAppTeste();
    expect(sinal.criados()).toBe(0);

    const controlos = [new AbortController(), new AbortController()];
    const [a, b] = await Promise.all(
      controlos.map(async (c) => leitor(await app.request('/api/eventos', { signal: c.signal }))),
    );
    await a?.esperar('versao');
    await b?.esperar('versao');
    // Um só temporizador para todas as ligações.
    expect(sinal.criados()).toBe(1);
    expect(sinal.aCorrer()).toBe(1);

    controlos[0]?.abort();
    expect(sinal.aCorrer()).toBe(1);
    controlos[1]?.abort();
    expect(canal.ligacoes()).toBe(0);
    expect(sinal.aCorrer()).toBe(0);

    const c = leitor(await app.request('/api/eventos'));
    await c.esperar('versao');
    expect(sinal.criados()).toBe(2);
    expect(sinal.aCorrer()).toBe(1);
    await c.esperar(SINAL, 2000);
  });

  it('fechar() termina as ligações, pára os sinais e recusa ligações novas', async () => {
    const sinal = espiarSinal(10);
    canal = criarCanalEventos({ intervaloSinalMs: 10 });
    const app = criarAppTeste();
    const a = leitor(await app.request('/api/eventos'));
    const b = leitor(await app.request('/api/eventos'));
    await a.esperar('versao');
    await b.esperar('versao');
    expect(sinal.aCorrer()).toBe(1);

    canal.fechar();
    expect(canal.ligacoes()).toBe(0);
    expect(sinal.aCorrer()).toBe(0);
    await esperarQue(() => a.terminou() && b.terminou());
    // O que já estava por enviar chega (fecho normal, não um corte).
    expect(a.texto()).toContain('data: {"versao":7}');

    const depois = await app.request('/api/eventos');
    expect(depois.status).toBe(503);
    expect(sinal.criados()).toBe(1);
    expect(() => canal.publicar(LOTE)).not.toThrow();
    // Sem temporizadores: nada mais chega.
    const antes = a.texto();
    await new Promise((r) => setTimeout(r, 40));
    expect(a.texto()).toBe(antes);
  });

  it('publicar sem ligações não faz nada', () => {
    canal = criarCanalEventos();
    expect(() => canal.publicar(LOTE)).not.toThrow();
    expect(canal.ligacoes()).toBe(0);
  });
});
