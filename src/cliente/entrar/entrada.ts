// Entrada com a conta Microsoft: para onde mandar o browser e o que dizer quando a entrada falha.
// Funções puras (sem window), testadas em entrada.test.ts.
//
// O servidor (GET /api/auth/entrar?destino=…) leva o browser à Microsoft e, no fim, de volta ao destino.
// Quando corre mal volta a /?erro-entrada=<código> (ver docs/m1.md).

/** Parâmetro do URL com que o servidor diz porque é que a entrada falhou. */
export const PARAMETRO_ERRO_ENTRADA = 'erro-entrada';

const ERROS_ENTRADA: Record<string, string> = {
  'sem-acesso': 'A tua conta não tem acesso ao Mapa CMF. Pede ao Rafael para te dar acesso.',
  expirou: 'O pedido de entrada expirou. Tenta outra vez.',
  cancelado: 'A entrada foi cancelada. Quando quiseres, tenta outra vez.',
};

/** Qualquer outro código (incluindo "falhou"). */
const ERRO_ENTRADA_GERAL = 'Não foi possível entrar. Tenta outra vez.';

/** Frase a mostrar para um código de erro da entrada; null quando não houve erro. */
export function textoErroEntrada(codigo: string | null): string | null {
  if (codigo === null) return null;
  // Object.hasOwn: um código como "constructor" não pode apanhar o protótipo.
  return Object.hasOwn(ERROS_ENTRADA, codigo) ? (ERROS_ENTRADA[codigo] as string) : ERRO_ENTRADA_GERAL;
}

/** "?erro-entrada=expirou&x=1" → "expirou". Sem o parâmetro: null. */
export function lerErroEntrada(query: string): string | null {
  return new URLSearchParams(query).get(PARAMETRO_ERRO_ENTRADA);
}

/** A query sem o erro da entrada, com o "?" (ou "" se não sobrar nada). A ordem dos outros mantém-se. */
export function querySemErroEntrada(query: string): string {
  const parametros = new URLSearchParams(query);
  parametros.delete(PARAMETRO_ERRO_ENTRADA);
  const resto = parametros.toString();
  return resto ? `?${resto}` : '';
}

/**
 * Para onde voltar depois de entrar: o caminho, a query e o hash atuais, sem o erro da entrada (senão a
 * mensagem voltava a aparecer). O hash conta: é lá que vivem a vista e o modo reunião ("#quadro",
 * "#reuniao", ver vistas/vista.ts), e o servidor mantém-no. Sempre um caminho do próprio site:
 * "//outro.site" passaria a ser outro servidor, por isso as barras do início juntam-se numa só (o
 * servidor também o verifica).
 */
export function destinoDaEntrada(caminho: string, query: string, hash = ''): string {
  const limpo = `/${caminho.replace(/^[/\\]+/, '')}`;
  // "#" sozinho não leva a lado nenhum.
  const fragmento = hash.startsWith('#') && hash.length > 1 ? hash : '';
  return `${limpo}${querySemErroEntrada(query)}${fragmento}`;
}

/** URL que começa a entrada com a conta Microsoft e volta ao destino. */
export function urlEntrar(destino: string): string {
  return `/api/auth/entrar?destino=${encodeURIComponent(destino)}`;
}
