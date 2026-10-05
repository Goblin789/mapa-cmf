import { describe, expect, it } from 'vitest';
import { CLASSE_FOCO_TECLADO, classeDestaque, obraEsbatida, posicao, tracoDestaque } from './comum';

describe('obraEsbatida (legenda do Mapa)', () => {
  it('com outro cliente aceso, a obra esbate-se; com o dela, nenhum ou em foco, não', () => {
    expect(obraEsbatida('cliente-a', 'cliente-b', null)).toBe(true);
    expect(obraEsbatida('cliente-a', 'cliente-b', 'relacionado')).toBe(true);
    expect(obraEsbatida('cliente-a', 'cliente-a', null)).toBe(false);
    expect(obraEsbatida(null, 'cliente-b', null)).toBe(false);
    expect(obraEsbatida('cliente-a', 'cliente-b', 'foco')).toBe(false);
  });
});

describe('realce do foco', () => {
  it('o foco do teclado num botão do mapa é um anel, não um outline (o Leaflet apaga o outline)', () => {
    expect(CLASSE_FOCO_TECLADO).not.toMatch(/outline/);
    expect(CLASSE_FOCO_TECLADO).toMatch(/focus-visible:ring/);
  });

  it('à volta de um retângulo: contorno forte no próprio, tracejado no relacionado, nada sem foco', () => {
    expect(classeDestaque('foco')).toMatch(/outline-\[2\.5px\]/);
    expect(classeDestaque('relacionado')).toMatch(/outline-dashed/);
    expect(classeDestaque(null)).toBe('');
  });

  it('nas formas (casa, carrinha): traço mais grosso no foco, tracejado no relacionado', () => {
    const normal = tracoDestaque(null);
    const foco = tracoDestaque('foco');
    const relacionado = tracoDestaque('relacionado');
    expect(foco.largura).toBeGreaterThan(normal.largura);
    expect(relacionado.tracejado).toBeDefined();
    expect(normal.tracejado).toBeUndefined();
  });
});

describe('posicao', () => {
  it('passa um retângulo a estilo absoluto', () => {
    expect(posicao({ x: 1, y: 2, largura: 3, altura: 4 })).toEqual({ left: 1, top: 2, width: 3, height: 4 });
  });
});
