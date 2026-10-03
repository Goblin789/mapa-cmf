import { describe, expect, it } from 'vitest';
import clientesIniciais from '../../../dados-iniciais/clientes.json';
import { COR_TEXTO_NOMES, contraste } from '../../dominio/cores';
import type { NivelLotacao } from '../../dominio/ocupacao';
import { ESTILO_NIVEL } from './lotacao';

/** Tons do Tailwind 4 que a lotação usa (oklch do tema convertido para sRGB). */
const TAILWIND: Record<string, string> = {
  white: '#ffffff',
  'green-700': '#008236',
  'green-800': '#016630',
  'amber-600': '#e17100',
  'amber-800': '#973c00',
  'red-700': '#c10007',
  'red-800': '#9f0712',
};

const NIVEIS: NivelLotacao[] = ['livre', 'cheio', 'excesso'];

/** A cor hex de `bg-…`, `text-…` ou `ring-…` nas classes da pastilha (`white` ou `tom-número`). */
function corDaClasse(classes: string, prefixo: 'bg' | 'text' | 'ring'): string {
  const m = new RegExp(`(?:^|\\s)${prefixo}-(white|[a-z]+-\\d+)(?=\\s|$)`).exec(classes);
  if (!m) throw new Error(`Sem ${prefixo}-… em "${classes}"`);
  const hex = TAILWIND[m[1] as string];
  if (!hex) throw new Error(`Falta ${m[1]} na tabela de tons do teste`);
  return hex;
}

// --- Daltonismo simulado (Machado, Oliveira e Fernandes, 2009, severidade 1) e distância CIE76 ---------

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
function lab(hex: string, matriz: Matriz = NORMAL): [number, number, number] {
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

function distancia(a: string, b: string, matriz: Matriz): number {
  const [l1, a1, b1] = lab(a, matriz);
  const [l2, a2, b2] = lab(b, matriz);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const VISOES = [
  ['visão normal', NORMAL],
  ['deuteranopia', DEUTERANOPIA],
  ['protanopia', PROTANOPIA],
] as const;

describe('ESTILO_NIVEL (pastilhas da lotação)', () => {
  it('cada nível tem o seu símbolo: o significado nunca depende só da cor', () => {
    const simbolos = NIVEIS.map((n) => ESTILO_NIVEL[n].simbolo);
    expect(new Set(simbolos).size).toBe(3);
    for (const s of simbolos) expect(s.trim()).not.toBe('');
  });

  it.each(NIVEIS)('%s: o número lê-se bem (texto sobre o fundo ≥ 6:1, acima do AA)', (nivel) => {
    const { pastilha } = ESTILO_NIVEL[nivel];
    expect(contraste(corDaClasse(pastilha, 'text'), corDaClasse(pastilha, 'bg'))).toBeGreaterThanOrEqual(6);
  });

  it.each(NIVEIS)('%s: corHex é a cor do contorno da pastilha', (nivel) => {
    const { pastilha, corHex } = ESTILO_NIVEL[nivel];
    expect(corHex).toBe(corDaClasse(pastilha, 'ring'));
  });

  it.each(NIVEIS)('%s: a pastilha vê-se sobre o cartão branco (fundo ou contorno ≥ 3:1)', (nivel) => {
    const { pastilha } = ESTILO_NIVEL[nivel];
    const fundo = contraste(corDaClasse(pastilha, 'bg'), '#ffffff');
    const contorno = contraste(corDaClasse(pastilha, 'ring'), '#ffffff');
    expect(Math.max(fundo, contorno)).toBeGreaterThanOrEqual(3);
  });

  // Os nomes são todos blocos de cor clara (L* entre 60 e 95) com texto quase-preto. Uma pastilha é
  // branca (L* ≥ 99) ou escura (L* ≤ 50) e nunca tem o texto dos nomes: não há como as confundir.
  it('nenhuma pastilha tem o desenho de um nome (fundo branco ou escuro, texto que não é o dos nomes)', () => {
    for (const cliente of clientesIniciais) {
      const [l] = lab(cliente.cor);
      expect(l, cliente.sigla).toBeGreaterThanOrEqual(60);
      expect(l, cliente.sigla).toBeLessThanOrEqual(95);
    }
    for (const nivel of NIVEIS) {
      const { pastilha } = ESTILO_NIVEL[nivel];
      const [l] = lab(corDaClasse(pastilha, 'bg'));
      expect(l >= 99 || l <= 50, `${nivel}: L* ${l.toFixed(1)}`).toBe(true);
      expect(corDaClasse(pastilha, 'text').toLowerCase()).not.toBe(COR_TEXTO_NOMES.toLowerCase());
    }
  });

  it.each(VISOES)(
    '%s: nenhum fundo de pastilha se parece com o nome de um cliente (ΔE76 ≥ 15)',
    (_visao, matriz) => {
      for (const nivel of NIVEIS) {
        const fundo = corDaClasse(ESTILO_NIVEL[nivel].pastilha, 'bg');
        for (const cliente of clientesIniciais) {
          expect(distancia(fundo, cliente.cor, matriz), `${nivel} / ${cliente.sigla}`).toBeGreaterThanOrEqual(
            15,
          );
        }
      }
    },
  );

  // Duas pastilhas distinguem-se pelo fundo (branca / cheia) ou, sendo ambas brancas, pelo contorno.
  it.each(VISOES)(
    '%s: os três níveis distinguem-se entre si (fundo ou contorno, ΔE76 ≥ 15)',
    (_visao, matriz) => {
      for (let i = 0; i < NIVEIS.length; i++) {
        for (let j = i + 1; j < NIVEIS.length; j++) {
          const a = ESTILO_NIVEL[NIVEIS[i] as NivelLotacao].pastilha;
          const b = ESTILO_NIVEL[NIVEIS[j] as NivelLotacao].pastilha;
          const fundo = distancia(corDaClasse(a, 'bg'), corDaClasse(b, 'bg'), matriz);
          const contorno = distancia(corDaClasse(a, 'ring'), corDaClasse(b, 'ring'), matriz);
          expect(Math.max(fundo, contorno), `${NIVEIS[i]} / ${NIVEIS[j]}`).toBeGreaterThanOrEqual(15);
        }
      }
    },
  );

  it('"gente a mais" é a única pastilha cheia: é o aviso que mais importa ver', () => {
    const cheias = NIVEIS.filter((n) => lab(corDaClasse(ESTILO_NIVEL[n].pastilha, 'bg'))[0] <= 50);
    expect(cheias).toEqual(['excesso']);
  });

  it('a simulação bate com valores conhecidos (preto, branco, cinzento ficam iguais)', () => {
    for (const [, matriz] of VISOES) {
      expect(distancia('#000000', '#ffffff', matriz)).toBeCloseTo(100, 0);
      expect(distancia('#808080', '#808080', matriz)).toBe(0);
    }
    // Vermelho e verde puros: muito diferentes na visão normal, quase iguais na deuteranopia.
    expect(distancia('#ff0000', '#00ff00', NORMAL)).toBeGreaterThan(150);
    expect(distancia('#ff0000', '#00ff00', DEUTERANOPIA)).toBeLessThan(
      distancia('#ff0000', '#00ff00', NORMAL) / 3,
    );
  });
});
