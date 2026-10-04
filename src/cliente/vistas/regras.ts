// Regras pequenas do modo reunião, sem browser (testadas à parte).

export const AVISO_ALTERACOES_POR_GUARDAR = 'Guarda ou cancela as alterações antes da reunião.';

/**
 * O que fazer ao carregar em "Reunião": fora do modo de edição, entra; no modo de edição sem alterações,
 * sai dele e entra (a reunião é só leitura); com alterações por guardar, não entra (deitá-las fora sem
 * perguntar não pode ser).
 */
export function decidirEntrada(
  modoEdicao: boolean,
  nPendentes: number,
): 'entrar' | 'sair-da-edicao-e-entrar' | 'recusar' {
  if (!modoEdicao) return 'entrar';
  return nPendentes > 0 ? 'recusar' : 'sair-da-edicao-e-entrar';
}
