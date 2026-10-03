import { describe, expect, it } from 'vitest';
import { DISTRIBUICOES, gruposReais } from './cenariosTeste';
import { areaDesenhada, disporMapa, linhasChamada } from './disposicao';
import {
  COBERTURA_MAXIMA,
  caixaDeTudo,
  centroParaIrPara,
  enquadrarTudo,
  type Margens,
  PINO_ACEITAVEL,
} from './enquadramento';
import { projetar } from './projecao';

const OPCOES = { zoomMinimo: 9, zoomMaximo: 14, passo: 0.25 };
// As mesmas margens que o Mapa.tsx usa num ecrã largo.
const MARGENS: Margens = { cima: 14, baixo: 12, esquerda: 12, direita: 12 };
// Mapa num ecrã de 1920×1080: em ecrã inteiro (1568×1029) e numa janela com as barras do browser e do
// Windows (1568×897).
const ECRA_INTEIRO = { largura: 1568, altura: 1029 };
const JANELA = { largura: 1568, altura: 897 };

describe('enquadrarTudo (coordenadas e lotações reais, sem dados pessoais)', () => {
  for (const distribuicao of DISTRIBUICOES) {
    const grupos = gruposReais(distribuicao);

    for (const tamanho of [ECRA_INTEIRO, JANELA]) {
      it(`num PC (${tamanho.largura}×${tamanho.altura}) cabe tudo, agarrado aos locais e sem tapar o mapa (${distribuicao})`, () => {
        const e = enquadrarTudo(grupos, { ...OPCOES, ...tamanho, margem: MARGENS });
        if (!e) throw new Error('sem enquadramento');
        expect(e.cabe).toBe(true);
        const d = disporMapa(grupos, {
          zoom: e.zoom,
          larguraMapa: tamanho.largura,
          alturaMapa: tamanho.altura,
        });
        // Com os nomes das casas (completo ou compacto), nunca só as pastilhas.
        expect(d.modo).not.toBe('resumo');
        expect(areaDesenhada(d) / (tamanho.largura * tamanho.altura)).toBeLessThanOrEqual(COBERTURA_MAXIMA);
        for (const l of linhasChamada(d)) {
          expect(Math.hypot(l.para.x - l.de.x, l.para.y - l.de.y), l.chave).toBeLessThanOrEqual(
            PINO_ACEITAVEL,
          );
        }
      });
    }

    it(`num telemóvel (375×700) começa no resumo (${distribuicao})`, () => {
      const e = enquadrarTudo(grupos, { ...OPCOES, largura: 375, altura: 700, margem: 8 });
      if (!e) throw new Error('sem enquadramento');
      expect(disporMapa(grupos, { zoom: e.zoom, larguraMapa: 375, alturaMapa: 700 }).modo).toBe('resumo');
    });
  }

  it('em ecrã inteiro mostra todos os nomes; numa janela mais baixa, as carrinhas ficam compactas', () => {
    const grupos = gruposReais('tipica');
    const modo = (t: { largura: number; altura: number }) => {
      const e = enquadrarTudo(grupos, { ...OPCOES, ...t, margem: MARGENS });
      return e && disporMapa(grupos, { zoom: e.zoom, larguraMapa: t.largura, alturaMapa: t.altura }).modo;
    };
    expect(modo(ECRA_INTEIRO)).toBe('completo');
    expect(modo(JANELA)).toBe('compacto');
  });

  it('o centro escolhido é o centro de tudo o que se desenha', () => {
    const grupos = gruposReais('roda');
    const e = enquadrarTudo(grupos, { ...OPCOES, largura: 1600, altura: 980, margem: 24 });
    if (!e) throw new Error('sem enquadramento');
    const caixa = caixaDeTudo(grupos, e.zoom, 1600, new Set(), 980);
    const c = projetar(e.centro.lat, e.centro.lng, e.zoom);
    expect(c.x).toBeCloseTo((caixa?.x ?? 0) + (caixa?.largura ?? 0) / 2, 3);
    expect(c.y).toBeCloseTo((caixa?.y ?? 0) + (caixa?.altura ?? 0) / 2, 3);
  });

  it('o que se desenha cabe no espaço livre', () => {
    const grupos = gruposReais('tipica');
    const e = enquadrarTudo(grupos, { ...OPCOES, ...ECRA_INTEIRO, margem: MARGENS });
    if (!e) throw new Error('sem enquadramento');
    const caixa = caixaDeTudo(grupos, e.zoom, ECRA_INTEIRO.largura, new Set(), ECRA_INTEIRO.altura);
    expect(caixa?.largura).toBeLessThanOrEqual(ECRA_INTEIRO.largura - MARGENS.esquerda - MARGENS.direita);
    expect(caixa?.altura).toBeLessThanOrEqual(ECRA_INTEIRO.altura - MARGENS.cima - MARGENS.baixo);
  });

  it('sem grupos não há enquadramento', () => {
    expect(enquadrarTudo([], { ...OPCOES, largura: 800, altura: 600, margem: 10 })).toBeNull();
  });
});

describe('margens diferentes em cada lado', () => {
  it('o centro desloca-se para o meio do espaço livre', () => {
    const grupos = gruposReais('roda');
    const simetrico = enquadrarTudo(grupos, { ...OPCOES, largura: 1600, altura: 980, margem: 24 });
    const comDoca = enquadrarTudo(grupos, {
      ...OPCOES,
      largura: 1600,
      altura: 980,
      margem: { cima: 24, baixo: 24, esquerda: 24, direita: 324 },
    });
    if (!simetrico || !comDoca) throw new Error('sem enquadramento');
    expect(comDoca.zoom).toBeLessThanOrEqual(simetrico.zoom);
    const caixa = caixaDeTudo(grupos, comDoca.zoom, 1600, new Set(), 980);
    const c = projetar(comDoca.centro.lat, comDoca.centro.lng, comDoca.zoom);
    // Margem maior à direita: o centro do mapa fica 150 px à direita do centro dos cartões.
    expect(c.x - ((caixa?.x ?? 0) + (caixa?.largura ?? 0) / 2)).toBeCloseTo(150, 3);
  });
});

describe('centroParaIrPara', () => {
  const grupos = gruposReais('himeling');
  const grotte = grupos.find((g) => g.localId === 'himeling-grotte');
  const mapa = { largura: 1568, altura: 1029 };

  it('vai para o centro do bloco do local e do ponto juntos (o bloco fica ao lado do ponto)', () => {
    if (!grotte) throw new Error('falta Himeling');
    const zoom = 12;
    const destino = centroParaIrPara(grupos, { lat: grotte.lat, lng: grotte.lng }, zoom, mapa, new Set());
    const d = disporMapa(grupos, { zoom, larguraMapa: mapa.largura, alturaMapa: mapa.altura });
    const g = d.grupos.find((x) => x.locais.some((l) => l.localId === 'himeling-grotte'));
    if (!g) throw new Error('falta o bloco');
    const p = g.pontos[0] as { x: number; y: number };
    const x1 = Math.min(g.x, p.x);
    const x2 = Math.max(g.x + g.largura, p.x);
    const y1 = Math.min(g.y, p.y);
    const y2 = Math.max(g.y + g.altura, p.y);
    const c = projetar(destino.lat, destino.lng, zoom);
    expect(c.x).toBeCloseTo((x1 + x2) / 2, 3);
    expect(c.y).toBeCloseTo((y1 + y2) / 2, 3);
  });

  it('um ponto qualquer fica como está', () => {
    const p = { lat: 49.61, lng: 6.13 };
    expect(centroParaIrPara(grupos, p, 12, mapa, new Set())).toEqual(p);
  });
});
