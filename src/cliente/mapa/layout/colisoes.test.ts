import { describe, expect, it } from 'vitest';
import { type CaixaAColocar, type CaixaColocada, MARGEM_COLISAO, resolverColisoes } from './colisoes';
import { centro, distancia, sobrepoem } from './geometria';

/** Gerador pseudoaleatório com semente (os testes têm de ser reprodutíveis). */
function gerador(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function caixasAleatorias(semente: number, n: number, espalhamento: number): CaixaAColocar[] {
  const aleatorio = gerador(semente);
  return Array.from({ length: n }, (_, i) => ({
    chave: `c${i}`,
    ancora: { x: aleatorio() * espalhamento, y: aleatorio() * espalhamento },
    largura: 40 + Math.floor(aleatorio() * 400),
    altura: 30 + Math.floor(aleatorio() * 300),
  }));
}

function semSobreposicoes(caixas: readonly CaixaColocada[], margem: number) {
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      if (sobrepoem(caixas[i] as CaixaColocada, caixas[j] as CaixaColocada, margem)) return false;
    }
  }
  return true;
}

describe('resolverColisoes', () => {
  it('um cartão sozinho fica centrado na âncora', () => {
    const [c] = resolverColisoes([{ chave: 'a', ancora: { x: 100, y: 200 }, largura: 120, altura: 80 }]);
    expect(c).toMatchObject({ x: 40, y: 160, largura: 120, altura: 80, deslocada: false });
    const [d] = resolverColisoes([{ chave: 'a', ancora: { x: 100.4, y: 199.6 }, largura: 121, altura: 81 }]);
    expect(distancia(centro(d as CaixaColocada), { x: 100, y: 200 })).toBeLessThanOrEqual(Math.SQRT1_2);
  });

  it('cartões afastados não se mexem', () => {
    const r = resolverColisoes([
      { chave: 'a', ancora: { x: 0, y: 0 }, largura: 100, altura: 50 },
      { chave: 'b', ancora: { x: 500, y: 0 }, largura: 100, altura: 50 },
    ]);
    expect(r.every((c) => !c.deslocada)).toBe(true);
  });

  it('dois cartões no mesmo sítio: um fica, o outro encosta pelo lado mais curto', () => {
    const r = resolverColisoes([
      { chave: 'grande', ancora: { x: 0, y: 0 }, largura: 200, altura: 100 },
      { chave: 'pequeno', ancora: { x: 0, y: 0 }, largura: 100, altura: 40 },
    ]);
    const deslocados = r.filter((c) => c.deslocada);
    expect(deslocados).toHaveLength(1);
    // Sobe ou desce (50 + 20 + margem) em vez de ir para o lado (100 + 50 + margem).
    const d = deslocados[0] as CaixaColocada;
    expect(centro(d).x).toBe(0);
    expect(Math.abs(centro(d).y)).toBe(70 + MARGEM_COLISAO);
  });

  it('com peso vertical, prefere afastar para o lado', () => {
    const caixas = [
      { chave: 'grande', ancora: { x: 0, y: 0 }, largura: 200, altura: 100 },
      { chave: 'pequeno', ancora: { x: 0, y: 0 }, largura: 100, altura: 40 },
    ];
    // Na vertical seriam 78 px (× 2,5 = 195); para o lado são 158 px.
    const [d] = resolverColisoes(caixas, { pesoVertical: 2.5 }).filter((c) => c.deslocada);
    expect(Math.abs(centro(d as CaixaColocada).x)).toBe(150 + MARGEM_COLISAO);
    expect(centro(d as CaixaColocada).y).toBe(0);
    // Com peso 2 (78 × 2 = 156 < 158) ainda compensa ir na vertical.
    const [v] = resolverColisoes(caixas, { pesoVertical: 2 }).filter((c) => c.deslocada);
    expect(centro(v as CaixaColocada).x).toBe(0);
  });

  it('fica na posição livre mais próxima', () => {
    // Uma parede de três cartões; o quarto, com âncora no do meio, só pode subir ou descer.
    const r = resolverColisoes([
      { chave: 'a', ancora: { x: 0, y: 0 }, largura: 300, altura: 60 },
      { chave: 'b', ancora: { x: 308, y: 0 }, largura: 300, altura: 60 },
      { chave: 'c', ancora: { x: -308, y: 0 }, largura: 300, altura: 60 },
      { chave: 'd', ancora: { x: 0, y: 10 }, largura: 50, altura: 50 },
    ]);
    const d = r[3] as CaixaColocada;
    expect(d.x).toBe(-25);
    expect(d.y).toBe(30 + MARGEM_COLISAO);
  });

  it('não tapa o local real de outro cartão (com raio)', () => {
    for (let semente = 1; semente <= 20; semente++) {
      const r = resolverColisoes(caixasAleatorias(semente, 12, 600), { raioAncoras: 7 });
      for (const c of r) {
        for (const outro of r) {
          if (outro === c || (outro.ancora.x === c.ancora.x && outro.ancora.y === c.ancora.y)) continue;
          const ponto = { x: outro.ancora.x - 7, y: outro.ancora.y - 7, largura: 14, altura: 14 };
          expect(sobrepoem(c, ponto)).toBe(false);
        }
      }
      expect(semSobreposicoes(r, MARGEM_COLISAO)).toBe(true);
    }
  });

  it('um cartão afastado do local volta para perto quando a troca compensa', () => {
    // Sem reparação, o pequeno (colocado depois) ia para longe; com ela, fica no sítio.
    const r = resolverColisoes([
      { chave: 'grande', ancora: { x: 0, y: 0 }, largura: 400, altura: 300 },
      { chave: 'pequeno', ancora: { x: 150, y: 100 }, largura: 60, altura: 40 },
    ]);
    const pequeno = r[1] as CaixaColocada;
    expect(pequeno.deslocada).toBe(false);
    expect(semSobreposicoes(r, MARGEM_COLISAO)).toBe(true);
  });

  it('nunca há sobreposições, mesmo com muitos cartões amontoados', () => {
    for (let semente = 1; semente <= 40; semente++) {
      const n = 5 + (semente % 30);
      const r = resolverColisoes(caixasAleatorias(semente, n, semente % 2 ? 50 : 2000));
      expect(semSobreposicoes(r, MARGEM_COLISAO)).toBe(true);
    }
  });

  it('respeita outra margem', () => {
    const r = resolverColisoes(caixasAleatorias(7, 20, 100), { margem: 20 });
    expect(semSobreposicoes(r, 20)).toBe(true);
  });

  it('é determinístico e não depende da ordem da entrada', () => {
    const caixas = caixasAleatorias(3, 25, 300);
    const a = resolverColisoes(caixas);
    expect(resolverColisoes(caixas)).toEqual(a);
    const invertidas = resolverColisoes([...caixas].reverse());
    const porChave = new Map(invertidas.map((c) => [c.chave, c]));
    for (const c of a) expect(porChave.get(c.chave)).toEqual(c);
  });

  it('devolve pela ordem da entrada, com tamanhos inteiros', () => {
    const caixas = caixasAleatorias(9, 10, 100);
    const r = resolverColisoes(caixas);
    expect(r.map((c) => c.chave)).toEqual(caixas.map((c) => c.chave));
    for (const c of r)
      for (const v of [c.x, c.y, c.largura, c.altura]) expect(Number.isInteger(v)).toBe(true);
  });

  it('marca como deslocado só quem saiu da posição ideal', () => {
    const r = resolverColisoes(caixasAleatorias(11, 15, 400));
    for (const c of r) {
      const ideal = { x: c.ancora.x - Math.floor(c.largura / 2), y: c.ancora.y - Math.floor(c.altura / 2) };
      expect(c.deslocada).toBe(c.x !== ideal.x || c.y !== ideal.y);
    }
  });
});
