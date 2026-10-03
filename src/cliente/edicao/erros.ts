// Texto dos erros mostrados ao utilizador. Quando o pedido nem chega ao servidor (sem rede, servidor
// parado), o fetch falha com uma frase em inglês que muda de browser para browser ("Failed to fetch",
// "NetworkError…", "Load failed"): aqui passa a uma frase em português. Funções puras.

const FALHAS_DE_REDE = [/failed to fetch/i, /networkerror/i, /^load failed$/i, /network request failed/i];

export const SEM_LIGACAO =
  'Não foi possível falar com o servidor. Verifica a ligação (ou se o servidor está a correr) e tenta outra vez.';

/** A mensagem a mostrar: as falhas de rede do browser passam a SEM_LIGACAO; as do servidor ficam. */
export function textoDoErro(mensagem: string): string {
  const limpa = mensagem.trim();
  return FALHAS_DE_REDE.some((r) => r.test(limpa)) ? SEM_LIGACAO : mensagem;
}
