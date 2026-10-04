// Servidor S3 FALSO, em processo, para os testes (sem rede): guarda os objetos num Map e responde ao
// PUT/GET/DELETE de objetos e ao ListObjectsV2 (com páginas pequenas, para testar a paginação).
// Recalcula a assinatura SigV4 de cada pedido com o segredo falso, numa implementação própria (independente
// do aws4fetch), como o S3/R2 faz: um erro na canonicalização do caminho, da query (ex.: um continuation-token
// com '/', '+' ou '=') ou dos cabeçalhos assinados dá 403 SignatureDoesNotMatch, como daria no R2.
// Os tokens de continuação são opacos e têm de propósito '/', '+' e '='.

import { createHash, createHmac } from 'node:crypto';

export interface S3Falso {
  fetch: (pedido: Request) => Promise<Response>;
  objetos: Map<string, { bytes: Uint8Array; modificado: Date }>;
  pedidos: { metodo: string; url: string; autorizacao: string | null }[];
  /** Tokens de continuação recebidos (já descodificados), pela ordem. */
  tokensRecebidos: string[];
  /** Respostas forçadas para o próximo pedido (ex.: 500). */
  falharProximo(status: number, codigo: string): void;
}

function xmlErro(status: number, codigo: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${codigo}</Code></Error>`, {
    status,
    headers: { 'content-type': 'application/xml' },
  });
}

/** Codificação de URI do SigV4: tudo exceto A-Z a-z 0-9 - _ . ~ (e '/' no caminho, se `barra`). */
function codificarAws(texto: string, barra = false): string {
  let resultado = '';
  for (const byte of Buffer.from(texto, 'utf8')) {
    const caractere = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(caractere) || (barra && caractere === '/')) resultado += caractere;
    else resultado += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return resultado;
}

function hmac(chave: string | Buffer, texto: string): Buffer {
  return createHmac('sha256', chave).update(texto, 'utf8').digest();
}

/** Parâmetros da query como o servidor os lê: percent-decoding (RFC 3986), sem tratar '+' como espaço. */
function lerQuery(url: URL): [string, string][] | null {
  const bruta = url.search.slice(1);
  // Um '+' cru é ambíguo (espaço ou '+', conforme o servidor): o cliente tem de o mandar como %2B.
  if (bruta.includes('+')) return null;
  return bruta
    .split('&')
    .filter(Boolean)
    .map((par) => {
      const igual = par.indexOf('=');
      const chave = igual === -1 ? par : par.slice(0, igual);
      const valor = igual === -1 ? '' : par.slice(igual + 1);
      return [decodeURIComponent(chave), decodeURIComponent(valor)];
    });
}

/** Assinatura SigV4 que o pedido devia ter (segundo o servidor), ou o código de erro S3. */
function assinaturaEsperada(
  pedido: Request,
  url: URL,
  opcoes: { id: string; segredo: string; regiao: string },
): { assinatura: string; recebida: string } | { erro: string } {
  const autorizacao = pedido.headers.get('authorization') ?? '';
  const partes =
    /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(
      autorizacao,
    );
  if (!partes) return { erro: 'AccessDenied' };
  const [, id, dia, regiao, assinados = '', recebida = ''] = partes;
  if (id !== opcoes.id) return { erro: 'InvalidAccessKeyId' };
  if (regiao !== opcoes.regiao) return { erro: 'AuthorizationHeaderMalformed' };
  const data = pedido.headers.get('x-amz-date') ?? '';
  if (!/^\d{8}T\d{6}Z$/.test(data) || data.slice(0, 8) !== dia) return { erro: 'AccessDenied' };
  const cabecalhos = assinados.split(';');
  for (const obrigatorio of ['host', 'x-amz-date', 'x-amz-content-sha256']) {
    if (!cabecalhos.includes(obrigatorio)) return { erro: 'AccessDenied' };
  }

  const query = lerQuery(url);
  if (!query) return { erro: 'InvalidArgument' };
  const queryCanonica = query
    .map(([chave, valor]) => [codificarAws(chave), codificarAws(valor)] as const)
    .sort(([k1, v1], [k2, v2]) => (k1 < k2 ? -1 : k1 > k2 ? 1 : v1 < v2 ? -1 : v1 > v2 ? 1 : 0))
    .map(([chave, valor]) => `${chave}=${valor}`)
    .join('&');
  // S3: o caminho não se normaliza e codifica-se uma vez (a partir do caminho descodificado).
  const caminhoCanonico = codificarAws(decodeURIComponent(url.pathname), true);
  const cabecalhosCanonicos = cabecalhos
    .map((nome) => {
      const valor = nome === 'host' ? (pedido.headers.get('host') ?? url.host) : pedido.headers.get(nome);
      return `${nome}:${(valor ?? '').trim().replace(/\s+/g, ' ')}\n`;
    })
    .join('');
  const pedidoCanonico = [
    pedido.method.toUpperCase(),
    caminhoCanonico,
    queryCanonica,
    cabecalhosCanonicos,
    assinados,
    pedido.headers.get('x-amz-content-sha256') ?? '',
  ].join('\n');

  const ambito = `${dia}/${opcoes.regiao}/s3/aws4_request`;
  const textoAAssinar = [
    'AWS4-HMAC-SHA256',
    data,
    ambito,
    createHash('sha256').update(pedidoCanonico, 'utf8').digest('hex'),
  ].join('\n');
  let chave = hmac(`AWS4${opcoes.segredo}`, dia as string);
  for (const parte of [opcoes.regiao, 's3', 'aws4_request']) chave = hmac(chave, parte);
  return { assinatura: hmac(chave, textoAAssinar).toString('hex'), recebida };
}

export function criarS3Falso(opcoes: {
  balde: string;
  id: string;
  segredo: string;
  regiao: string;
  porPagina?: number;
}): S3Falso {
  const objetos = new Map<string, { bytes: Uint8Array; modificado: Date }>();
  const pedidos: S3Falso['pedidos'] = [];
  const tokensRecebidos: string[] = [];
  /** Token opaco → posição na listagem. */
  const tokens = new Map<string, number>();
  const porPagina = opcoes.porPagina ?? 2;
  let falha: { status: number; codigo: string } | null = null;

  async function responder(pedido: Request): Promise<Response> {
    const url = new URL(pedido.url);
    const autorizacao = pedido.headers.get('authorization');
    pedidos.push({ metodo: pedido.method, url: pedido.url, autorizacao });

    if (falha) {
      const { status, codigo } = falha;
      falha = null;
      return xmlErro(status, codigo);
    }

    const verificacao = assinaturaEsperada(pedido, url, opcoes);
    if ('erro' in verificacao)
      return xmlErro(verificacao.erro === 'InvalidArgument' ? 400 : 403, verificacao.erro);
    if (verificacao.assinatura !== verificacao.recebida) return xmlErro(403, 'SignatureDoesNotMatch');
    const corpo = new Uint8Array(await pedido.arrayBuffer());
    const hash = createHash('sha256').update(corpo).digest('hex');
    if (pedido.headers.get('x-amz-content-sha256') !== hash) return xmlErro(400, 'XAmzContentSHA256Mismatch');

    const [, balde, ...resto] = url.pathname.split('/');
    if (balde !== opcoes.balde) return xmlErro(404, 'NoSuchBucket');
    const chave = decodeURIComponent(resto.join('/'));

    if (!chave) {
      const query = new Map(lerQuery(url) ?? []);
      if (pedido.method !== 'GET' || query.get('list-type') !== '2') return xmlErro(400, 'NotImplemented');
      const prefixo = query.get('prefix') ?? '';
      const token = query.get('continuation-token');
      let inicio = 0;
      if (token !== undefined) {
        tokensRecebidos.push(token);
        const posicao = tokens.get(token);
        if (posicao === undefined) return xmlErro(400, 'InvalidArgument');
        inicio = posicao;
      }
      const chaves = [...objetos.keys()].filter((k) => k.startsWith(prefixo)).sort();
      const pagina = chaves.slice(inicio, inicio + porPagina);
      const truncada = inicio + porPagina < chaves.length;
      const conteudos = pagina
        .map((k) => {
          const objeto = objetos.get(k) as { bytes: Uint8Array; modificado: Date };
          return `<Contents><Key>${k.replaceAll('&', '&amp;')}</Key><LastModified>${objeto.modificado.toISOString()}</LastModified><Size>${objeto.bytes.length}</Size></Contents>`;
        })
        .join('');
      let seguinte = '';
      if (truncada) {
        // Opaco, como os do R2, e com os caracteres que mais facilmente se codificam mal.
        const novo = `pg/${inicio + porPagina}+${Buffer.from(String(inicio)).toString('base64')}==`;
        tokens.set(novo, inicio + porPagina);
        seguinte = `<NextContinuationToken>${novo}</NextContinuationToken>`;
      }
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${balde}</Name><IsTruncated>${truncada}</IsTruncated>${conteudos}${seguinte}</ListBucketResult>`,
        { headers: { 'content-type': 'application/xml' } },
      );
    }

    switch (pedido.method) {
      case 'PUT':
        objetos.set(chave, { bytes: corpo, modificado: new Date() });
        return new Response(null, { status: 200 });
      case 'GET': {
        const objeto = objetos.get(chave);
        return objeto ? new Response(new Uint8Array(objeto.bytes)) : xmlErro(404, 'NoSuchKey');
      }
      case 'DELETE':
        objetos.delete(chave);
        return new Response(null, { status: 204 });
      default:
        return xmlErro(405, 'MethodNotAllowed');
    }
  }

  return {
    fetch: responder,
    objetos,
    pedidos,
    tokensRecebidos,
    falharProximo(status, codigo) {
      falha = { status, codigo };
    },
  };
}
