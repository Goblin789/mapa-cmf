import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nomeCopia } from '../nomes';
import { type Destino, ErroCopiaInexistente } from '../tipos';
import { criarDestinoPasta } from './pasta';
import { criarDestinoS3, lerPaginaListagem } from './s3';
import { criarS3Falso, type S3Falso } from './s3-falso';

const N1 = nomeCopia(new Date('2026-10-01T10:00:00Z'), 'hora');
const N2 = nomeCopia(new Date('2026-10-02T10:00:00Z'), 'manual');
const N3 = nomeCopia(new Date('2026-10-03T10:00:00Z'), 'pc');

/** O mesmo contrato para os dois destinos. */
async function exercitarDestino(destino: Destino): Promise<void> {
  expect(await destino.listar()).toEqual([]);
  await destino.enviar(N1, new Uint8Array([1, 2, 3]));
  await destino.enviar(N2, new Uint8Array([4, 5]));
  await destino.enviar(N3, new Uint8Array([6]));

  const lista = (await destino.listar()).toSorted((a, b) => a.nome.localeCompare(b.nome));
  expect(lista.map((c) => [c.nome, c.tamanho, c.data.toISOString()])).toEqual([
    [N1, 3, '2026-10-01T10:00:00.000Z'],
    [N2, 2, '2026-10-02T10:00:00.000Z'],
    [N3, 1, '2026-10-03T10:00:00.000Z'],
  ]);
  expect([...(await destino.obter(N2))]).toEqual([4, 5]);

  await destino.apagar(N2);
  expect((await destino.listar()).map((c) => c.nome).sort()).toEqual([N1, N3]);
  await expect(destino.obter(N2)).rejects.toBeInstanceOf(ErroCopiaInexistente);
  // Apagar o que já não existe não é erro.
  await destino.apagar(N2);

  // Nomes com caminhos nunca saem da pasta/balde.
  await expect(destino.obter('../segredo.db')).rejects.toThrow('Nome de cópia inválido');
  await expect(destino.enviar('a/b', new Uint8Array([1]))).rejects.toThrow('Nome de cópia inválido');
}

describe('destino pasta', () => {
  let pasta: string;
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'mapa-cmf-copias-pasta-'));
  });
  afterEach(() => rmSync(pasta, { recursive: true, force: true }));

  it('envia, lista, obtém e apaga (e cria a pasta)', async () => {
    await exercitarDestino(criarDestinoPasta(join(pasta, 'nova', 'destino')));
  });

  it('a listagem ignora ficheiros que não são cópias', async () => {
    const destino = criarDestinoPasta(pasta);
    writeFileSync(join(pasta, 'notas.txt'), 'x');
    writeFileSync(join(pasta, 'mapa.db'), 'x');
    await destino.enviar(N1, new Uint8Array([1]));
    expect((await destino.listar()).map((c) => c.nome)).toEqual([N1]);
  });

  it('apaga os ".parcial" abandonados (mais de 1 h) por envios que morreram a meio', async () => {
    const destino = criarDestinoPasta(pasta);
    const velho = join(pasta, `.${N1}.999.parcial`);
    const recente = join(pasta, `.${N2}.998.parcial`);
    writeFileSync(velho, 'x');
    writeFileSync(recente, 'x');
    const duasHoras = new Date(Date.now() - 2 * 3_600_000);
    utimesSync(velho, duasHoras, duasHoras);
    await destino.enviar(N3, new Uint8Array([1]));
    expect(existsSync(velho)).toBe(false);
    // Um recente pode ser de outro processo a enviar agora: fica.
    expect(existsSync(recente)).toBe(true);
  });
});

describe('destino s3 (servidor falso em processo)', () => {
  let s3: S3Falso;
  let destino: Destino;
  beforeEach(() => {
    s3 = criarS3Falso({
      balde: 'balde-teste',
      id: 'ID-FALSO',
      segredo: 'SEGREDO-FALSO',
      regiao: 'auto',
      porPagina: 2,
    });
    destino = criarDestinoS3({
      endpoint: 'https://conta-ficticia.eu.r2.cloudflarestorage.com',
      balde: 'balde-teste',
      regiao: 'auto',
      id: 'ID-FALSO',
      segredo: 'SEGREDO-FALSO',
      fetch: s3.fetch,
    });
  });

  it('envia, lista (com paginação), obtém e apaga com pedidos assinados', async () => {
    await exercitarDestino(destino);
    expect(s3.pedidos.length).toBeGreaterThan(0);
    for (const pedido of s3.pedidos) {
      expect(pedido.autorizacao).toMatch(
        /^AWS4-HMAC-SHA256 Credential=ID-FALSO\/\d{8}\/auto\/s3\/aws4_request/,
      );
      expect(pedido.url).not.toContain('SEGREDO');
      expect(pedido.url.startsWith('https://conta-ficticia.eu.r2.cloudflarestorage.com/balde-teste')).toBe(
        true,
      );
    }
    // 3 cópias com 2 por página → a listagem seguiu o continuation-token (opaco, com '/', '+' e '='),
    // e o servidor falso aceitou a assinatura (recalculada por ele) desses pedidos.
    expect(s3.tokensRecebidos.length).toBeGreaterThan(0);
    expect(s3.tokensRecebidos.every((token) => /^pg\/\d+\+[A-Za-z0-9+/]*={2,}$/.test(token))).toBe(true);
    expect(s3.pedidos.every((p) => !p.url.includes('list-type') || p.url.includes('prefix=mapa-'))).toBe(
      true,
    );
  });

  it('o servidor recalcula a assinatura: segredo errado ou URL mudado depois de assinar → 403', async () => {
    await destino.enviar(N1, new Uint8Array([1]));
    const comSegredo = (segredo: string, fetch = s3.fetch) =>
      criarDestinoS3({
        endpoint: 'https://conta-ficticia.eu.r2.cloudflarestorage.com',
        balde: 'balde-teste',
        regiao: 'auto',
        id: 'ID-FALSO',
        segredo,
        fetch,
      });
    await expect(comSegredo('OUTRO-SEGREDO').obter(N1)).rejects.toThrow(
      'S3: não foi possível obter a cópia (HTTP 403, SignatureDoesNotMatch).',
    );
    const mexido = comSegredo('SEGREDO-FALSO', (pedido) =>
      s3.fetch(new Request(`${pedido.url}?versionId=1`, pedido)),
    );
    await expect(mexido.obter(N1)).rejects.toThrow('SignatureDoesNotMatch');
    // Sem alterações, o mesmo pedido passa.
    expect([...(await comSegredo('SEGREDO-FALSO').obter(N1))]).toEqual([1]);
  });

  it('pagina com muitas cópias (tokens opacos codificados e assinados certos)', async () => {
    const nomes = Array.from({ length: 7 }, (_, i) => nomeCopia(new Date(Date.UTC(2026, 9, 1, i)), 'hora'));
    for (const nome of nomes) await destino.enviar(nome, new Uint8Array([1]));
    expect((await destino.listar()).map((c) => c.nome).sort()).toEqual(nomes);
    expect(s3.tokensRecebidos).toHaveLength(3);
  });

  it('a listagem só devolve objetos com o prefixo das cópias', async () => {
    s3.objetos.set('outra-coisa.txt', { bytes: new Uint8Array([1]), modificado: new Date() });
    await destino.enviar(N1, new Uint8Array([1]));
    expect((await destino.listar()).map((c) => c.nome)).toEqual([N1]);
  });

  it('erros dizem a operação e o código, sem URLs nem credenciais', async () => {
    s3.falharProximo(500, 'InternalError');
    const erro = await destino.enviar(N1, new Uint8Array([1])).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe('S3: não foi possível enviar a cópia (HTTP 500, InternalError).');

    const semRede = criarDestinoS3({
      endpoint: 'https://conta-ficticia.eu.r2.cloudflarestorage.com',
      balde: 'balde-teste',
      regiao: 'auto',
      id: 'ID-FALSO',
      segredo: 'SEGREDO-FALSO',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(semRede.listar()).rejects.toThrow('S3: não foi possível listar as cópias (falha de rede).');
  });

  it('tempo esgotado → erro claro', async () => {
    const lento = criarDestinoS3({
      endpoint: 'https://conta-ficticia.eu.r2.cloudflarestorage.com',
      balde: 'balde-teste',
      regiao: 'auto',
      id: 'ID-FALSO',
      segredo: 'SEGREDO-FALSO',
      timeoutMs: 20,
      // Como o fetch a sério: um sinal que já chega abortado rejeita logo. Com a máquina carregada, assinar o
      // pedido pode levar mais do que os 20 ms, e o evento 'abort' já não voltava a disparar.
      fetch: (pedido) =>
        new Promise((_, rejeitar) => {
          if (pedido.signal.aborted) rejeitar(pedido.signal.reason);
          pedido.signal.addEventListener('abort', () => rejeitar(pedido.signal.reason));
        }),
    });
    await expect(lento.obter(N1)).rejects.toThrow('(tempo esgotado)');
  });

  it('analisa o XML do ListObjectsV2 (entidades e fim da listagem)', () => {
    const lida = lerPaginaListagem(
      '<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>mapa-a&amp;b</Key><Size>10</Size><LastModified>2026-10-01T00:00:00.000Z</LastModified></Contents><NextContinuationToken>abc&#x2F;</NextContinuationToken></ListBucketResult>',
    );
    expect(lida.objetos).toEqual([
      { chave: 'mapa-a&b', tamanho: 10, data: new Date('2026-10-01T00:00:00.000Z') },
    ]);
    expect(lida.seguinte).toBe('abc/');
    expect(
      lerPaginaListagem('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'),
    ).toEqual({
      objetos: [],
      seguinte: null,
    });
  });
});
