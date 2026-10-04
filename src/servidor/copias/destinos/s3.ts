// Destino S3 compatível (Cloudflare R2 na jurisdição UE: endpoint https://<conta>.eu.r2.cloudflarestorage.com,
// região 'auto'). Pedidos assinados com SigV4 (aws4fetch), endereços no estilo "caminho" (<endpoint>/<balde>/<nome>).
// Nunca se registam credenciais nem URLs assinados: as mensagens de erro só dizem a operação e o código HTTP/S3.

import { createHash } from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { lerNomeCopia, PREFIXO, validarNomeFicheiro } from '../nomes';
import { type CopiaNoDestino, type Destino, ErroCopiaInexistente } from '../tipos';

/** fetch injetável (os testes usam um servidor S3 falso em processo). */
export type FetchS3 = (pedido: Request) => Promise<Response>;

export interface OpcoesS3 {
  endpoint: string;
  balde: string;
  regiao: string;
  id: string;
  segredo: string;
  fetch?: FetchS3;
  /** Tempo máximo de cada pedido, em ms. Omissão: 60 s. */
  timeoutMs?: number;
}

/** Máximo de páginas da listagem (1000 objetos cada): uma salvaguarda contra ciclos sem fim. */
const MAX_PAGINAS = 100;

function sha256Hex(dados: Uint8Array | string): string {
  return createHash('sha256').update(dados).digest('hex');
}

function decodificarXml(texto: string): string {
  return texto
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replaceAll('&amp;', '&');
}

/** Conteúdo da primeira etiqueta <etiqueta>…</etiqueta> (análise simples: o XML do S3 é previsível). */
function etiqueta(xml: string, nome: string): string | undefined {
  const encontrado = new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(xml);
  return encontrado?.[1] === undefined ? undefined : decodificarXml(encontrado[1]);
}

/** Análise de uma página da resposta do ListObjectsV2. */
export function lerPaginaListagem(xml: string): {
  objetos: { chave: string; tamanho: number; data: Date | null }[];
  seguinte: string | null;
} {
  const objetos = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, bloco = '']) => {
    const modificado = etiqueta(bloco, 'LastModified');
    const data = modificado ? new Date(modificado) : null;
    return {
      chave: etiqueta(bloco, 'Key') ?? '',
      tamanho: Number(etiqueta(bloco, 'Size') ?? 0),
      data: data && !Number.isNaN(data.getTime()) ? data : null,
    };
  });
  const truncada = etiqueta(xml, 'IsTruncated') === 'true';
  return { objetos, seguinte: truncada ? (etiqueta(xml, 'NextContinuationToken') ?? null) : null };
}

export function criarDestinoS3(opcoes: OpcoesS3): Destino {
  const cliente = new AwsClient({
    accessKeyId: opcoes.id,
    secretAccessKey: opcoes.segredo,
    service: 's3',
    region: opcoes.regiao,
    retries: 0,
  });
  const fazerFetch: FetchS3 = opcoes.fetch ?? ((pedido) => fetch(pedido));
  const timeoutMs = opcoes.timeoutMs ?? 60_000;
  const base = `${opcoes.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(opcoes.balde)}`;

  async function pedir(
    acao: string,
    metodo: 'GET' | 'PUT' | 'DELETE',
    url: string,
    corpo?: Uint8Array,
  ): Promise<Response> {
    const pedido = await cliente.sign(url, {
      method: metodo,
      headers: {
        // Hash real do corpo (e não UNSIGNED-PAYLOAD): o S3 recusa um corpo alterado pelo caminho.
        'x-amz-content-sha256': sha256Hex(corpo ?? ''),
        ...(corpo ? { 'content-type': 'application/octet-stream' } : {}),
      },
      // Cópia para um ArrayBuffer próprio (o tipo BodyInit não aceita vistas sobre SharedArrayBuffer).
      body: corpo ? new Uint8Array(corpo) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    try {
      return await fazerFetch(pedido);
    } catch (erro) {
      const nome = erro instanceof Error ? erro.name : '';
      const motivo = nome === 'TimeoutError' || nome === 'AbortError' ? 'tempo esgotado' : 'falha de rede';
      throw new Error(`S3: não foi possível ${acao} (${motivo}).`);
    }
  }

  async function erroDaResposta(acao: string, resposta: Response): Promise<Error> {
    const corpo = await resposta.text().catch(() => '');
    const codigo = etiqueta(corpo, 'Code');
    return new Error(`S3: não foi possível ${acao} (HTTP ${resposta.status}${codigo ? `, ${codigo}` : ''}).`);
  }

  function urlDe(nome: string): string {
    validarNomeFicheiro(nome);
    return `${base}/${encodeURIComponent(nome)}`;
  }

  return {
    tipo: 's3',

    async enviar(nome, bytes) {
      const resposta = await pedir('enviar a cópia', 'PUT', urlDe(nome), bytes);
      if (!resposta.ok) throw await erroDaResposta('enviar a cópia', resposta);
      await resposta.body?.cancel();
    },

    async listar() {
      const copias: CopiaNoDestino[] = [];
      let seguinte: string | null = null;
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const parametros = new URLSearchParams({ 'list-type': '2', prefix: PREFIXO });
        if (seguinte) parametros.set('continuation-token', seguinte);
        const resposta = await pedir('listar as cópias', 'GET', `${base}?${parametros}`);
        if (!resposta.ok) throw await erroDaResposta('listar as cópias', resposta);
        const lida = lerPaginaListagem(await resposta.text());
        for (const objeto of lida.objetos) {
          if (!objeto.chave.startsWith(PREFIXO)) continue;
          const data = lerNomeCopia(objeto.chave)?.data ?? objeto.data;
          if (data) copias.push({ nome: objeto.chave, tamanho: objeto.tamanho, data });
        }
        seguinte = lida.seguinte;
        if (!seguinte) return copias;
      }
      throw new Error('S3: a listagem das cópias tem páginas a mais.');
    },

    async obter(nome) {
      const resposta = await pedir('obter a cópia', 'GET', urlDe(nome));
      if (resposta.status === 404) {
        await resposta.body?.cancel();
        throw new ErroCopiaInexistente(nome);
      }
      if (!resposta.ok) throw await erroDaResposta('obter a cópia', resposta);
      return new Uint8Array(await resposta.arrayBuffer());
    },

    async apagar(nome) {
      const resposta = await pedir('apagar a cópia', 'DELETE', urlDe(nome));
      // 404: já não existe, que é o que se queria.
      if (!resposta.ok && resposta.status !== 404) throw await erroDaResposta('apagar a cópia', resposta);
      await resposta.body?.cancel();
    },
  };
}
