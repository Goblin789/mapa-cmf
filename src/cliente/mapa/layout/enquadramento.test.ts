import { describe, expect, it } from 'vitest';
import { DISTRIBUICOES, gruposReais } from './cenariosTeste';
import { disporMapa } from './disposicao';
import { caixaDeTudo, centroParaIrPara, enquadrarTudo } from './enquadramento';
import { nivelDetalhe } from './niveis';
import { projetar } from './projecao';

const OPCOES = { zoomMinimo: 9, zoomMaximo: 14, passo: 0.25 };
// As mesmas margens que o Mapa.tsx usa num ecrã grande.
const MARGENS_ECRA_GRANDE = { cima: 40, baixo: 16, esquerda: 16, direita: 16 };

describe('enquadrarTudo (dados reais, sem dados pessoais)', () => {
  for (const distribuicao of DISTRIBUICOES) {
    const grupos = gruposReais(distribuicao);

    it(`num ecrã de 1920×1080 vê-se cada casa e carrinha (${distribuicao})`, () => {
      // Mapa = ecrã menos barra de tarefas, barras do browser, cabeçalho e caixas laterais (~320 px).
      for (const [largura, altura] of [
        [1600, 896],
        [1600, 980],
        [1920, 1030],
      ] as const) {
        const e = enquadrarTudo(grupos, { ...OPCOES, largura, altura, margem: MARGENS_ECRA_GRANDE });
        expect(e?.cabe).toBe(true);
        expect(nivelDetalhe(e?.zoom ?? 0, largura)).toBe('lugares');
      }
    });

    it(`num telemóvel (375×800) começa no resumo (${distribuicao})`, () => {
      const e = enquadrarTudo(grupos, { ...OPCOES, largura: 375, altura: 700, margem: 8 });
      expect(e).not.toBeNull();
      expect(nivelDetalhe(e?.zoom ?? 0, 375)).toBe('resumo');
    });
  }

  it('o centro escolhido é o centro de tudo o que se desenha', () => {
    const grupos = gruposReais('roda');
    const e = enquadrarTudo(grupos, { ...OPCOES, largura: 1600, altura: 980, margem: 24 });
    if (!e) throw new Error('sem enquadramento');
    const caixa = caixaDeTudo(grupos, e.zoom, 1600, new Set());
    const c = projetar(e.centro.lat, e.centro.lng, e.zoom);
    expect(c.x).toBeCloseTo((caixa?.x ?? 0) + (caixa?.largura ?? 0) / 2, 3);
    expect(c.y).toBeCloseTo((caixa?.y ?? 0) + (caixa?.altura ?? 0) / 2, 3);
  });

  it('escolhe o zoom mais alto que cabe', () => {
    const grupos = gruposReais('roda');
    const e = enquadrarTudo(grupos, { ...OPCOES, largura: 1600, altura: 980, margem: 24 });
    if (!e) throw new Error('sem enquadramento');
    const acima = caixaDeTudo(grupos, e.zoom + OPCOES.passo, 1600, new Set());
    expect((acima?.largura ?? 0) > 1600 - 48 || (acima?.altura ?? 0) > 980 - 48).toBe(true);
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
    const caixa = caixaDeTudo(grupos, comDoca.zoom, 1600, new Set());
    const c = projetar(comDoca.centro.lat, comDoca.centro.lng, comDoca.zoom);
    // Margem maior à direita: o centro do mapa fica 150 px à direita do centro dos cartões.
    expect(c.x - ((caixa?.x ?? 0) + (caixa?.largura ?? 0) / 2)).toBeCloseTo(150, 3);
  });
});

describe('centroParaIrPara', () => {
  const grupos = gruposReais('himeling');
  const grotte = grupos.find((g) => g.localId === 'himeling-grotte');

  it('vai para o centro do cartão do local (que pode estar afastado do local)', () => {
    if (!grotte) throw new Error('falta Himeling');
    const zoom = 11;
    const destino = centroParaIrPara(
      grupos,
      { lat: grotte.lat, lng: grotte.lng },
      zoom,
      'lugares',
      new Set(),
    );
    const d = disporMapa(grupos, { zoom, nivel: 'lugares', expandidos: new Set() });
    const g = d.grupos.find((x) => x.grupo.localId === 'himeling-grotte');
    const c = projetar(destino.lat, destino.lng, zoom);
    expect(c.x).toBeCloseTo((g?.x ?? 0) + (g?.largura ?? 0) / 2, 3);
    expect(c.y).toBeCloseTo((g?.y ?? 0) + (g?.altura ?? 0) / 2, 3);
  });

  it('um ponto qualquer fica como está', () => {
    const p = { lat: 49.61, lng: 6.13 };
    expect(centroParaIrPara(grupos, p, 12, 'lugares', new Set())).toEqual(p);
  });
});
