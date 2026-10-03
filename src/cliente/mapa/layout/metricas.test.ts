// Medidas da vista inicial com as coordenadas reais (dados-iniciais/locais.json), as lotações
// (casas.json) e os lugares (carrinhas.json), sem dados pessoais: num mapa de 1600×1030 (um PC de
// 1920×1080), quanto do mapa os cartões tapam, quão longe fica cada cartão do seu sítio e se há
// sobreposições. Com todas as camadas, só as casas e só as carrinhas.

import { describe, expect, it } from 'vitest';
import { DISTRIBUICOES, gruposReais } from './cenariosTeste';
import { COBERTURA_MAXIMA, type Margens, PINO_ACEITAVEL } from './enquadramento';
import type { CamadasVisiveis } from './grupos';
import { areaCoberta, medirVistaInicial } from './metricas';
import { metrosPorPixel } from './projecao';

const MAPA = { largura: 1600, altura: 1030 };
// As margens que o Mapa.tsx usa num ecrã largo.
const MARGENS: Margens = { cima: 14, baixo: 12, esquerda: 12, direita: 12 };
const LATITUDE_LUXEMBURGO = 49.6;

const CAMADAS: Record<string, CamadasVisiveis> = {
  todas: { casas: true, carrinhas: true, obras: true },
  'só casas': { casas: true, carrinhas: false, obras: true },
  'só carrinhas': { casas: false, carrinhas: true, obras: true },
};

/**
 * Limites para a distribuição de hoje ('tipica'): fração do mapa tapada, pino mais comprido (px) e
 * cartão mais afastado do seu sítio (km no terreno). Himeling tem 8 casas e 10 carrinhas à volta de
 * dois pontos a 360 m: os seus cartões são os que ficam mais longe, inevitavelmente.
 */
const LIMITES: Record<string, { cobertura: number; pino: number; km: number }> = {
  todas: { cobertura: 0.3, pino: 30, km: 30 },
  'só casas': { cobertura: 0.15, pino: 12, km: 10 },
  'só carrinhas': { cobertura: 0.2, pino: 12, km: 15 },
};

function medir(distribuicao: (typeof DISTRIBUICOES)[number], camadas: CamadasVisiveis) {
  const m = medirVistaInicial(gruposReais(distribuicao, camadas), { ...MAPA, margem: MARGENS });
  if (!m) throw new Error('sem enquadramento');
  const metros = metrosPorPixel(LATITUDE_LUXEMBURGO, m.zoom);
  return {
    m,
    pinoMaximo: Math.max(...m.pinos.values()),
    kmMaximo: (Math.max(0, ...m.afastamentos.values()) * metros) / 1000,
  };
}

describe('vista inicial num PC (1600×1030), distribuição de hoje', () => {
  for (const [nome, camadas] of Object.entries(CAMADAS)) {
    const limite = LIMITES[nome] as (typeof LIMITES)[string];

    it(`${nome}: cabe, com os nomes, sem sobreposições e sem tapar demasiado o mapa`, () => {
      const { m, pinoMaximo, kmMaximo } = medir('tipica', camadas);
      expect(m.cabe).toBe(true);
      expect(m.modo).toBe('completo');
      expect(m.escala).toBeGreaterThanOrEqual(0.9);
      expect(m.sobreposicoes).toEqual([]);
      expect(m.pontosTapados).toEqual([]);
      expect(m.cobertura).toBeLessThanOrEqual(limite.cobertura);
      expect(pinoMaximo).toBeLessThanOrEqual(limite.pino);
      expect(kmMaximo).toBeLessThanOrEqual(limite.km);
    });
  }

  it('cada cartão tem a sua distância ao ponto do seu local (as casas agarradas, a poucos km)', () => {
    const { m } = medir('tipica', CAMADAS.todas as CamadasVisiveis);
    const metros = metrosPorPixel(LATITUDE_LUXEMBURGO, m.zoom);
    const casas = [...m.afastamentos.entries()].filter(([chave]) => chave.startsWith('casa:'));
    expect(casas.length).toBe(15);
    // Fora de Himeling, cada casa fica encostada ao seu ponto.
    for (const [chave, px] of casas) {
      if (chave.includes('puttelange') || chave.includes('foret')) continue;
      expect(px, chave).toBeLessThanOrEqual(PINO_ACEITAVEL);
    }
    // As de Himeling (8, à volta de dois pontos a 360 m), a menos de 30 km (no ponto não cabem todos).
    for (const [chave, px] of casas) expect((px * metros) / 1000, chave).toBeLessThan(30);
  });
});

describe('vista inicial com outras distribuições das carrinhas (casos extremos)', () => {
  for (const distribuicao of DISTRIBUICOES) {
    for (const [nome, camadas] of Object.entries(CAMADAS)) {
      it(`${distribuicao}, ${nome}: sem sobreposições, pontos à vista e pinos curtos`, () => {
        const { m, pinoMaximo } = medir(distribuicao, camadas);
        expect(m.cabe).toBe(true);
        expect(m.sobreposicoes).toEqual([]);
        expect(m.pontosTapados).toEqual([]);
        expect(pinoMaximo).toBeLessThanOrEqual(PINO_ACEITAVEL);
        expect(m.cobertura).toBeLessThanOrEqual(COBERTURA_MAXIMA + 0.01);
      });
    }
  }
});

describe('areaCoberta', () => {
  it('conta a união dos retângulos, só dentro da janela', () => {
    const janela = { x: 0, y: 0, largura: 10, altura: 10 };
    expect(areaCoberta([{ x: 0, y: 0, largura: 4, altura: 5 }], janela)).toBe(20);
    // Sobrepostos não contam duas vezes; o que sai da janela não conta.
    expect(
      areaCoberta(
        [
          { x: 0, y: 0, largura: 4, altura: 5 },
          { x: 2, y: 0, largura: 4, altura: 5 },
          { x: 8, y: 8, largura: 10, altura: 10 },
        ],
        janela,
      ),
    ).toBe(30 + 4);
  });
});
