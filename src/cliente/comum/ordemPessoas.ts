// Ordem em que os nomes aparecem numa lista (cartão do mapa, secção da lista lateral).
// Quem desenha uma lista de NomeChip envolve-a num <ContextoOrdemPessoas.Provider value={ids}>;
// o NomeChip usa-a para o Shift+clique selecionar um intervalo dentro da mesma lista.

import { createContext } from 'react';
import type { Id } from '../../dominio/tipos';

export const ContextoOrdemPessoas = createContext<readonly Id[] | null>(null);
