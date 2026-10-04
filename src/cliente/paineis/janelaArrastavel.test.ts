import { describe, expect, it } from 'vitest';
import {
  ALTURA_MINIMA_JANELA_PX,
  type Armazenamento,
  ancorar,
  CHAVE_POSICAO,
  cantoArrastado,
  cantoComTecla,
  cantoDaPosicao,
  carregarPosicao,
  colocar,
  guardarPosicao,
  lerPosicao,
  MARGEM_JANELA_PX,
  PASSO_GRANDE_PX,
  PASSO_TECLADO_PX,
  passouLimiar,
} from './janelaArrastavel';

const M = MARGEM_JANELA_PX;
// A área do Quadro a 1366×768 (medida aproximada) e uma ficha de 22 rem.
const AREA = { largura: 1366, altura: 600 };
const FICHA = { largura: 352, altura: 300 };

describe('colocar', () => {
  it('onde se pediu, se couber, com a altura máxima até ao fundo da área', () => {
    expect(colocar({ x: 100, y: 50 }, FICHA, AREA)).toEqual({ x: 100, y: 50, alturaMaxima: 600 - 50 - M });
  });

  it('nunca sai pela esquerda, pela direita nem por cima (fica à margem das bordas)', () => {
    expect(colocar({ x: -500, y: -40 }, FICHA, AREA)).toMatchObject({ x: M, y: M });
    expect(colocar({ x: 5000, y: 10 }, FICHA, AREA).x).toBe(1366 - 352 - M);
  });

  it('puxada para baixo encolhe até à altura mínima e daí já não desce', () => {
    const alta = { largura: 352, altura: 580 };
    // A 300 px do topo: encolhe para o que sobra (292 px), não sobe.
    expect(colocar({ x: 100, y: 300 }, alta, AREA)).toEqual({ x: 100, y: 300, alturaMaxima: 292 });
    // Muito em baixo: fica com a altura mínima, encostada ao fundo.
    expect(colocar({ x: 100, y: 590 }, alta, AREA)).toEqual({
      x: 100,
      y: 600 - M - ALTURA_MINIMA_JANELA_PX,
      alturaMaxima: ALTURA_MINIMA_JANELA_PX,
    });
  });

  it('uma ficha pequena desce até ao fundo sem encolher', () => {
    const baixa = { largura: 352, altura: 120 };
    expect(colocar({ x: 0, y: 590 }, baixa, AREA)).toMatchObject({ y: 600 - M - 120 });
  });

  it('numa área mais pequena do que a ficha fica à margem de cima e da esquerda', () => {
    const area = { largura: 300, altura: 150 };
    expect(colocar({ x: 50, y: 50 }, FICHA, area)).toEqual({ x: M, y: M, alturaMaxima: 150 - 2 * M });
  });

  describe('com um retângulo a evitar (a legenda do mapa, em baixo à esquerda)', () => {
    // O mapa a 1366×768 (aprox.): legenda de 190×251 px a 12 px das bordas; ficha alta (12 moradores).
    const MAPA = { largura: 1366, altura: 705 };
    const LEGENDA = { x: 12, y: 705 - 12 - 251, largura: 190, altura: 251 };
    const ALTA = { largura: 352, altura: 900 };

    it('mexida um pouco, por cima da legenda, acaba antes dela (como na origem)', () => {
      expect(colocar({ x: 28, y: 12 }, ALTA, MAPA, LEGENDA)).toEqual({
        x: 28,
        y: 12,
        alturaMaxima: LEGENDA.y - M - 12,
      });
    });

    it('ao lado da legenda (sem a sobrepor na horizontal) vai até ao fundo', () => {
      expect(colocar({ x: 400, y: 12 }, ALTA, MAPA, LEGENDA).alturaMaxima).toBe(705 - 12 - M);
      // Encostada à direita da legenda, sem lhe tocar.
      expect(colocar({ x: 202, y: 12 }, ALTA, MAPA, LEGENDA).alturaMaxima).toBe(705 - 12 - M);
    });

    it('com o topo na faixa da legenda, foi o utilizador que a pôs ali: tapa-a', () => {
      expect(colocar({ x: 28, y: 460 }, ALTA, MAPA, LEGENDA)).toMatchObject({ alturaMaxima: 705 - 460 - M });
    });

    it('logo acima da legenda não encolhe abaixo da altura mínima', () => {
      expect(colocar({ x: 28, y: 400 }, ALTA, MAPA, LEGENDA).alturaMaxima).toBe(ALTURA_MINIMA_JANELA_PX);
    });

    it('uma ficha baixa por cima da legenda fica onde se pediu', () => {
      const baixa = { largura: 352, altura: 200 };
      expect(colocar({ x: 28, y: 100 }, baixa, MAPA, LEGENDA)).toEqual({
        x: 28,
        y: 100,
        alturaMaxima: LEGENDA.y - M - 100,
      });
    });

    it('um retângulo vazio (legenda escondida) não conta', () => {
      const vazio = { x: 12, y: 693, largura: 0, altura: 0 };
      expect(colocar({ x: 28, y: 12 }, ALTA, MAPA, vazio).alturaMaxima).toBe(705 - 12 - M);
    });
  });
});

describe('ancorar e cantoDaPosicao', () => {
  it('guarda a distância à borda de lado mais perto e ao topo', () => {
    expect(ancorar({ x: 40, y: 70 }, 352, AREA)).toEqual({ borda: 'esquerda', distancia: 40, topo: 70 });
    expect(ancorar({ x: 1366 - 352 - 30, y: 8 }, 352, AREA)).toEqual({
      borda: 'direita',
      distancia: 30,
      topo: 8,
    });
  });

  it('posta à direita continua à direita quando a área muda de largura', () => {
    const posicao = ancorar({ x: 1920 - 352 - 30, y: 100 }, 352, { largura: 1920, altura: 900 });
    expect(cantoDaPosicao(posicao, 352, AREA)).toEqual({ x: 1366 - 352 - 30, y: 100 });
  });

  it('ida e volta dá o mesmo canto', () => {
    for (const x of [8, 300, 700, 1006]) {
      const p = ancorar({ x, y: 20 }, 352, AREA);
      expect(cantoDaPosicao(p, 352, AREA)).toEqual({ x, y: 20 });
    }
  });
});

describe('arrastar e teclado', () => {
  it('o canto segue o ponteiro a partir do canto inicial', () => {
    expect(cantoArrastado({ x: 100, y: 50 }, { x: 500, y: 60 }, { x: 420, y: 160 })).toEqual({
      x: 20,
      y: 150,
    });
  });

  it('um clique (ou um tremer de mão) não é arrasto', () => {
    expect(passouLimiar({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(passouLimiar({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it('setas: um passo; com Shift, um passo grande; outras teclas não', () => {
    expect(cantoComTecla({ x: 100, y: 100 }, 'ArrowLeft', false)).toEqual({
      x: 100 - PASSO_TECLADO_PX,
      y: 100,
    });
    expect(cantoComTecla({ x: 100, y: 100 }, 'ArrowDown', true)).toEqual({
      x: 100,
      y: 100 + PASSO_GRANDE_PX,
    });
    expect(cantoComTecla({ x: 100, y: 100 }, 'Enter', false)).toBeNull();
  });
});

describe('memória', () => {
  function memoria(): Armazenamento & { dados: Map<string, string> } {
    const dados = new Map<string, string>();
    return {
      dados,
      getItem: (c) => dados.get(c) ?? null,
      setItem: (c, v) => void dados.set(c, v),
      removeItem: (c) => void dados.delete(c),
    };
  }

  it('guarda e lê por lugar; null esquece', () => {
    const a = memoria();
    guardarPosicao('vista', { borda: 'direita', distancia: 12, topo: 40 }, a);
    expect(carregarPosicao('vista', a)).toEqual({ borda: 'direita', distancia: 12, topo: 40 });
    expect(carregarPosicao('mapa', a)).toBeNull();
    guardarPosicao('vista', null, a);
    expect(a.dados.has(CHAVE_POSICAO.vista)).toBe(false);
  });

  it('o que vier estragado conta como na origem', () => {
    expect(lerPosicao(null)).toBeNull();
    expect(lerPosicao('{')).toBeNull();
    expect(lerPosicao('"x"')).toBeNull();
    expect(lerPosicao('{"borda":"cima","distancia":1,"topo":1}')).toBeNull();
    expect(lerPosicao('{"borda":"esquerda","distancia":-3,"topo":1}')).toBeNull();
    expect(lerPosicao('{"borda":"esquerda","distancia":3}')).toBeNull();
  });

  it('sem localStorage (ou se recusa) não parte', () => {
    const recusa: Armazenamento = {
      getItem: () => {
        throw new Error('recusado');
      },
      setItem: () => {
        throw new Error('recusado');
      },
      removeItem: () => {
        throw new Error('recusado');
      },
    };
    expect(carregarPosicao('mapa', recusa)).toBeNull();
    expect(() => guardarPosicao('mapa', { borda: 'esquerda', distancia: 0, topo: 0 }, recusa)).not.toThrow();
    expect(carregarPosicao('mapa', null)).toBeNull();
  });
});
