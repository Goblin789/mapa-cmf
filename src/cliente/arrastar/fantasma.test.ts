// O fantasma mexe no DOM; aqui corre com um DOM mínimo simulado (o Vitest corre em node).
// O tamanho de cada elemento simulado é proporcional ao texto, para a previsão mudar a largura.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { posicaoFantasma } from './deslizar';
import { criarFantasma } from './fantasma';

const LARGURA_LETRA = 7;
const ALTURA = 40;

class ElementoFalso {
  className = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  filhos: (ElementoFalso | string)[] = [];
  atributos = new Map<string, string>();

  setAttribute(nome: string, valor: string) {
    this.atributos.set(nome, valor);
  }
  removeAttribute(nome: string) {
    this.atributos.delete(nome);
  }
  append(...filhos: (ElementoFalso | string)[]) {
    this.filhos.push(...filhos);
  }
  replaceChildren() {
    this.filhos = [];
  }
  remove() {}
  get textContent(): string {
    return this.filhos.map((f) => (typeof f === 'string' ? f : f.textContent)).join('');
  }
  set textContent(texto: string) {
    this.filhos = [texto];
  }
  get offsetWidth(): number {
    return this.textContent.length * LARGURA_LETRA;
  }
  get offsetHeight(): number {
    return ALTURA;
  }
}

const globais = globalThis as unknown as { document?: unknown; window?: unknown };
const originais = { document: globais.document, window: globais.window };

beforeEach(() => {
  globais.document = {
    createElement: () => new ElementoFalso(),
    body: new ElementoFalso(),
  };
  globais.window = { innerWidth: 500, innerHeight: 900 };
});

afterEach(() => {
  globais.document = originais.document;
  globais.window = originais.window;
});

function translacao(x: number, y: number): string {
  return `translate3d(${x}px, ${y}px, 0)`;
}

describe('criarFantasma', () => {
  it('quando a previsão muda de tamanho sem o ponteiro se mexer, volta a centrar-se por cima do dedo', () => {
    const fantasma = criarFantasma({
      nome: 'Gil N.',
      mais: null,
      corFundo: '#ffffff',
      corTexto: '#000000',
      ponteiro: 'toque',
    });
    const raiz = (globais.document as { body: ElementoFalso }).body.filhos[0] as ElementoFalso;
    fantasma.posicionar(250, 450);
    // O nome levantado fica por cima do sítio onde já está: a previsão encolhe.
    fantasma.definirPrevisao({ texto: 'Casa Um: já está aqui', resultado: null, simbolo: null }, null);
    const esperada = posicaoFantasma(250, 450, raiz.offsetWidth, ALTURA, 'toque', 500, 900);
    expect(raiz.style.transform).toBe(translacao(esperada.x, esperada.y));
  });

  it('com o rato junto à borda direita, o fantasma mais largo passa todo para o outro lado do ponteiro', () => {
    const fantasma = criarFantasma({
      nome: 'Gil N.',
      mais: '+2',
      corFundo: '#ffffff',
      corTexto: '#000000',
      ponteiro: 'rato',
    });
    const raiz = (globais.document as { body: ElementoFalso }).body.filhos[0] as ElementoFalso;
    fantasma.posicionar(480, 300);
    fantasma.definirPrevisao(
      { texto: 'Sem transporte da empresa: 30 + 3 = ', resultado: '33', simbolo: null },
      null,
    );
    const esperada = posicaoFantasma(480, 300, raiz.offsetWidth, ALTURA, 'rato', 500, 900);
    expect(raiz.style.transform).toBe(translacao(esperada.x, esperada.y));
    // Nunca por baixo do ponteiro.
    expect(esperada.x + raiz.offsetWidth).toBeLessThan(480);
  });

  it('antes de ser posicionado, mudar a previsão não o põe em lado nenhum', () => {
    const fantasma = criarFantasma({
      nome: 'Gil N.',
      mais: null,
      corFundo: '#ffffff',
      corTexto: '#000000',
      ponteiro: 'rato',
    });
    const raiz = (globais.document as { body: ElementoFalso }).body.filhos[0] as ElementoFalso;
    fantasma.definirPrevisao(null, null);
    expect(raiz.style.transform).toBeUndefined();
  });
});
