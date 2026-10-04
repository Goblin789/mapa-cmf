// Para onde voltar depois de entrar (GET /api/auth/entrar?destino=…). Só caminhos deste site: um
// destino como "//atacante.example" ou "https://…" faria do login um redirecionamento aberto (um link
// "entrar no Mapa" que acabava noutro site, já com a pessoa convencida de que está no Mapa).

/** Origem fictícia só para o URL resolver o caminho; nunca sai daqui. */
const BASE = 'http://destino.invalid';

/** Destinos maiores do que isto não são caminhos do Mapa. */
const TAMANHO_MAXIMO = 1000;

/**
 * Caminho relativo seguro (começa por "/", sem "//", "/\", esquemas, caracteres de controlo nem /api),
 * normalizado; qualquer outra coisa (ou nada) dá "/".
 */
export function destinoSeguro(texto: string | undefined | null): string {
  if (!texto || texto.length > TAMANHO_MAXIMO) return '/';
  if (!texto.startsWith('/') || texto.startsWith('//')) return '/';
  // Barras invertidas e caracteres de controlo: os browsers tratam "\" como "/" e apagam tabs e
  // mudanças de linha ("/\t/atacante.example" passa a "//atacante.example").
  // biome-ignore lint/suspicious/noControlCharactersInRegex: é exatamente o que se quer recusar.
  if (/[\\\u0000-\u001f\u007f]/.test(texto)) return '/';
  let url: URL;
  try {
    url = new URL(texto, BASE);
  } catch {
    return '/';
  }
  if (url.origin !== BASE) return '/';
  // A normalização pode criar "//" (ex.: "/.//atacante.example" passa a "//atacante.example").
  if (url.pathname.startsWith('//')) return '/';
  const caminho = url.pathname.toLowerCase();
  // A API não é uma página: voltar a /api/auth/sair ou a JSON não faz sentido.
  if (caminho === '/api' || caminho.startsWith('/api/')) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}
