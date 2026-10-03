// Onde se vai largar: o [data-alvo] mais próximo do elemento debaixo do ponteiro.
// Resolve-se a cada movimento a partir do elemento atual (document.elementFromPoint), nunca de
// retângulos guardados: o mapa desliza e muda de zoom a meio do arrasto.

import { type Alvo, lerChaveAlvo } from '../../dominio/operacoes';

/** Atributo dos elementos arrastáveis (o valor é o id da pessoa). */
export const ATRIBUTO_ARRASTAVEL = 'data-arrastavel-pessoa';
/** Atributo dos sítios onde se pode largar (o valor é chaveAlvo(alvo)). */
export const ATRIBUTO_ALVO = 'data-alvo';
/** Posto pelo motor no alvo que está debaixo do ponteiro: data-alvo-estado="por-cima". */
export const ATRIBUTO_ESTADO_ALVO = 'data-alvo-estado';
/** Marca o fantasma (o que segue o ponteiro), que nunca conta como alvo. */
export const ATRIBUTO_FANTASMA = 'data-fantasma-arrasto';

/** O mínimo de um elemento do DOM que a resolução usa (os testes simulam a cadeia). */
export interface NoDom {
  getAttribute(nome: string): string | null;
  readonly parentElement: NoDom | null;
}

export interface AlvoEncontrado<T extends NoDom = NoDom> {
  chave: string;
  alvo: Alvo;
  /** O elemento que tem o data-alvo (para o realçar). */
  elemento: T;
}

/**
 * Sobe a partir do elemento debaixo do ponteiro até ao primeiro [data-alvo] com uma chave válida.
 * Dentro do fantasma não há alvo. Chaves inválidas são ignoradas (continua a subir).
 */
export function encontrarAlvo<T extends NoDom>(no: T | null): AlvoEncontrado<T> | null {
  for (let atual: NoDom | null = no; atual; atual = atual.parentElement) {
    if (atual.getAttribute(ATRIBUTO_FANTASMA) !== null) return null;
    const chave = atual.getAttribute(ATRIBUTO_ALVO);
    if (!chave) continue;
    const alvo = lerChaveAlvo(chave);
    // O elemento encontrado é um antepassado de `no`, do mesmo tipo concreto no DOM.
    if (alvo) return { chave, alvo, elemento: atual as T };
  }
  return null;
}

/** Id da pessoa do arrastável mais próximo (o próprio elemento ou um antepassado). */
export function pessoaArrastavel(no: NoDom | null): string | null {
  for (let atual: NoDom | null = no; atual; atual = atual.parentElement) {
    const id = atual.getAttribute(ATRIBUTO_ARRASTAVEL);
    if (id) return id;
  }
  return null;
}
