import { describe, expect, it } from 'vitest';
import clientesIniciais from '../../dados-iniciais/clientes.json';
import { COR_TEXTO_NOMES, clienteEfetivoId, contraste, corTexto, luminancia } from './cores';
import { criarObra, criarPessoa } from './teste-fabrica';

/** Mínimo WCAG AA para texto normal. */
const AA = 4.5;

// Regras da paleta dos clientes (ver docs/cores.md). O texto dos nomes é sempre COR_TEXTO_NOMES.
/** Contraste mínimo de COR_TEXTO_NOMES sobre a cor de qualquer cliente (o alvo é 7, AAA). */
const CONTRASTE_MINIMO_NOMES = 5.5;
/** Distância CIEDE2000 mínima entre as cores de dois clientes, na visão normal. */
const DISTANCIA_MINIMA_NORMAL = 15;
/** Distância CIEDE2000 mínima entre dois clientes com deuteranopia ou protanopia simuladas. */
const DISTANCIA_MINIMA_DALTONISMO = 10;
/** Distância CIEDE2000 mínima ao branco dos cartões: o nome tem de se ver como um bloco de cor. */
const DISTANCIA_MINIMA_BRANCO = 15;
/** Croma CIELAB mínimo: abaixo disto a cor parece cinzenta, "desativada". */
const CROMA_MINIMO = 20;
/**
 * Faixa de claridade (L*) dos nomes. As pastilhas da lotação são brancas (L* 100) ou vermelho-escuras
 * (L* ≈ 40): com os nomes sempre dentro desta faixa, um nome nunca tem o desenho de uma pastilha.
 */
const CLARIDADE_NOMES = { minima: 60, maxima: 95 } as const;

// --- CIELAB, CIEDE2000 e daltonismo simulado (Machado, Oliveira e Fernandes, 2009, severidade 1) -------

type Lab = readonly [number, number, number];
type Matriz = readonly [readonly number[], readonly number[], readonly number[]];
const NORMAL: Matriz = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const DEUTERANOPIA: Matriz = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];
const PROTANOPIA: Matriz = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

function linear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** CIELAB (D65) da cor vista com a matriz dada (aplicada em RGB linear). */
function lab(hex: string, matriz: Matriz = NORMAL): Lab {
  const rgb = [1, 3, 5].map((i) => linear(Number.parseInt(hex.slice(i, i + 2), 16) / 255));
  const [r, g, b] = matriz.map((linha) =>
    Math.min(
      1,
      Math.max(
        0,
        linha.reduce((s, k, j) => s + k * (rgb[j] as number), 0),
      ),
    ),
  ) as [number, number, number];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const GRAU = Math.PI / 180;

/** Ângulo de tom em graus (0–360). */
function tom(b: number, a: number): number {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a) / GRAU;
  return h < 0 ? h + 360 : h;
}

/** Diferença de cor CIEDE2000 (Sharma, Wu e Dalal, 2005). */
function ciede2000([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const cMedio = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cMedio ** 7 / (cMedio ** 7 + 25 ** 7)));
  const a1l = (1 + g) * a1;
  const a2l = (1 + g) * a2;
  const c1 = Math.hypot(a1l, b1);
  const c2 = Math.hypot(a2l, b2);
  const h1 = tom(b1, a1l);
  const h2 = tom(b2, a2l);
  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dL = l2 - l1;
  const dC = c2 - c1;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * GRAU);
  const lM = (l1 + l2) / 2;
  const cM = (c1 + c2) / 2;
  let hM = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hM = (h1 + h2) / 2;
    else hM = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hM - 30) * GRAU) +
    0.24 * Math.cos(2 * hM * GRAU) +
    0.32 * Math.cos((3 * hM + 6) * GRAU) -
    0.2 * Math.cos((4 * hM - 63) * GRAU);
  const rotacao = 30 * Math.exp(-(((hM - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cM ** 7 / (cM ** 7 + 25 ** 7));
  const sL = 1 + (0.015 * (lM - 50) ** 2) / Math.sqrt(20 + (lM - 50) ** 2);
  const sC = 1 + 0.045 * cM;
  const sH = 1 + 0.015 * cM * t;
  const rT = -Math.sin(2 * rotacao * GRAU) * rC;
  return Math.sqrt((dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH));
}

function distancia(a: string, b: string, matriz: Matriz = NORMAL): number {
  return ciede2000(lab(a, matriz), lab(b, matriz));
}

/** Todos os pares de clientes. */
const PARES = clientesIniciais.flatMap((a, i) => clientesIniciais.slice(i + 1).map((b) => [a, b] as const));

describe('luminancia', () => {
  it('preto = 0, branco = 1, cinzento #808080 ≈ 0.2159', () => {
    expect(luminancia('#000000')).toBe(0);
    expect(luminancia('#ffffff')).toBeCloseTo(1, 10);
    expect(luminancia('#808080')).toBeCloseTo(0.2159, 4);
  });

  it('aceita minúsculas, sem # e com espaços à volta', () => {
    const ref = luminancia('#ED7D31');
    expect(luminancia('#ed7d31')).toBe(ref);
    expect(luminancia('ED7D31')).toBe(ref);
    expect(luminancia('  #ED7D31 \n')).toBe(ref);
  });

  it.each(['', '#', '#fff', 'fff', 'red', '#GGGGGG', '#ED7D3', '#ED7D31FF', 'rgb(0,0,0)', '# ED7D31'])(
    'cor inválida %j: erro com mensagem clara',
    (cor) => {
      expect(() => luminancia(cor)).toThrow(/Cor inválida/);
      expect(() => corTexto(cor)).toThrow(/Cor inválida/);
    },
  );
});

describe('contraste', () => {
  it('preto/branco = 21, igual = 1, simétrico', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 10);
    expect(contraste('#ED7D31', '#ED7D31')).toBe(1);
    expect(contraste('#B4C6E7', '#00B0F0')).toBe(contraste('#00B0F0', '#B4C6E7'));
  });

  it('valores de referência do contraste', () => {
    expect(contraste('#808080', '#000000')).toBeCloseTo(5.32, 2);
    expect(contraste('#ED7D31', '#000000')).toBeCloseTo(7.58, 2);
    // O laranja da marca CMF com o quase-preto da marca (manual de marca: 7,25:1).
    expect(contraste('#F39200', COR_TEXTO_NOMES)).toBeCloseTo(7.25, 2);
  });
});

describe('corTexto', () => {
  it('extremos: fundo preto → branco, fundo branco → preto, azul puro → branco', () => {
    expect(corTexto('#000000')).toBe('#ffffff');
    expect(corTexto('#ffffff')).toBe('#000000');
    expect(corTexto('#0000ff')).toBe('#ffffff');
  });

  it('para qualquer cinzento escolhe sempre o melhor dos dois (nunca abaixo de ~4.58)', () => {
    let pior = Number.POSITIVE_INFINITY;
    for (let v = 0; v <= 255; v++) {
      const h = v.toString(16).padStart(2, '0');
      const cor = `#${h}${h}${h}`;
      const texto = corTexto(cor);
      const outro = texto === '#000000' ? '#ffffff' : '#000000';
      expect(contraste(cor, texto)).toBeGreaterThanOrEqual(contraste(cor, outro));
      pior = Math.min(pior, contraste(cor, texto));
    }
    // O pior caso possível entre preto e branco é √(1.05/0.05) ≈ 4.58: preto/branco chega sempre para AA.
    expect(pior).toBeGreaterThanOrEqual(4.58);
  });
});

describe('CIEDE2000 e daltonismo simulado (as ferramentas dos testes da paleta)', () => {
  // Pares de referência de Sharma, Wu e Dalal (2005), "The CIEDE2000 color-difference formula".
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    [[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
    [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  ] as const)('%j / %j → %d', (a, b, esperado) => {
    expect(ciede2000(a, b)).toBeCloseTo(esperado, 4);
    expect(ciede2000(b, a)).toBeCloseTo(esperado, 4);
  });

  it('CIELAB de referência: branco, preto e o vermelho sRGB', () => {
    const [lb, ab, bb] = lab('#ffffff');
    expect(lb).toBeCloseTo(100, 2);
    expect(Math.hypot(ab, bb)).toBeLessThan(0.01);
    expect(lab('#000000')[0]).toBeCloseTo(0, 6);
    const [l, a, b] = lab('#ff0000');
    expect(l).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.2, 1);
  });

  it('os cinzentos não mudam com daltonismo; vermelho e verde puros quase se juntam', () => {
    for (const matriz of [DEUTERANOPIA, PROTANOPIA]) {
      expect(distancia('#808080', '#808080', matriz)).toBe(0);
      expect(distancia('#000000', '#ffffff', matriz)).toBeCloseTo(100, 0);
      expect(distancia('#ff0000', '#00ff00', matriz)).toBeLessThan(distancia('#ff0000', '#00ff00') / 2);
    }
  });
});

describe('cores dos clientes (dados-iniciais/clientes.json)', () => {
  it('são 7, válidas (#RRGGBB) e todas diferentes', () => {
    expect(clientesIniciais).toHaveLength(7);
    const cores = clientesIniciais.map((c) => c.cor.toLowerCase());
    for (const c of cores) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(cores).size).toBe(cores.length);
  });

  it.each(clientesIniciais.map((c) => [c.nome, c.cor] as const))(
    '%s (%s): o texto dos nomes (COR_TEXTO_NOMES) lê-se bem (≥ 5.5:1)',
    (_nome, cor) => {
      expect(contraste(cor, COR_TEXTO_NOMES)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_NOMES);
    },
  );

  it('o mínimo de contraste dos nomes fica acima do AA, e todas as cores pedem texto escuro', () => {
    expect(CONTRASTE_MINIMO_NOMES).toBeGreaterThan(AA);
    for (const { sigla, cor } of clientesIniciais) {
      expect(contraste(cor, COR_TEXTO_NOMES), sigla).toBeGreaterThan(contraste(cor, '#ffffff'));
    }
  });

  it.each([
    ['visão normal', DISTANCIA_MINIMA_NORMAL, NORMAL],
    ['deuteranopia', DISTANCIA_MINIMA_DALTONISMO, DEUTERANOPIA],
    ['protanopia', DISTANCIA_MINIMA_DALTONISMO, PROTANOPIA],
  ] as const)('%s: dois clientes nunca ficam parecidos (ΔE00 ≥ %i)', (_visao, minimo, matriz) => {
    for (const [a, b] of PARES) {
      expect(distancia(a.cor, b.cor, matriz), `${a.sigla} / ${b.sigla}`).toBeGreaterThanOrEqual(minimo);
    }
  });

  it('distinguem-se dos cartões brancos e nenhuma parece cinzenta ("desativada")', () => {
    for (const { sigla, cor } of clientesIniciais) {
      expect(distancia(cor, '#ffffff'), sigla).toBeGreaterThanOrEqual(DISTANCIA_MINIMA_BRANCO);
      const [, a, b] = lab(cor);
      expect(Math.hypot(a, b), sigla).toBeGreaterThanOrEqual(CROMA_MINIMO);
    }
  });

  it('são todas claras, mas não brancas (L* entre 60 e 95): nunca parecem uma pastilha da lotação', () => {
    for (const { sigla, cor } of clientesIniciais) {
      const [l] = lab(cor);
      expect(l, sigla).toBeGreaterThanOrEqual(CLARIDADE_NOMES.minima);
      expect(l, sigla).toBeLessThanOrEqual(CLARIDADE_NOMES.maxima);
    }
  });
});

describe('clienteEfetivoId', () => {
  const obras = new Map([['o1', criarObra({ id: 'o1', clienteId: 'cliente-da-obra' })]]);

  it('sem obra: o cliente da pessoa', () => {
    expect(clienteEfetivoId(criarPessoa({ clienteId: 'meu', obraId: null }), obras)).toBe('meu');
  });

  it('com obra: o cliente da obra manda', () => {
    expect(clienteEfetivoId(criarPessoa({ clienteId: 'meu', obraId: 'o1' }), obras)).toBe('cliente-da-obra');
  });

  it('obra que não existe: volta ao cliente da pessoa', () => {
    expect(clienteEfetivoId(criarPessoa({ clienteId: 'meu', obraId: 'fantasma' }), obras)).toBe('meu');
  });
});
