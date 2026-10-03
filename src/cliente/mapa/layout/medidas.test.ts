import { describe, expect, it } from 'vitest';
import { contem, type Retangulo, sobrepoem } from './geometria';
import {
  type GeometriaCartao,
  geometriaCarrinha,
  geometriaCasa,
  geometriaObra,
  geometriaResumo,
  lugaresADesenhar,
  NOME,
  OBRA_MAX_UMA_COLUNA,
} from './medidas';

const caixa = (g: { largura: number; altura: number }): Retangulo => ({
  x: 0,
  y: 0,
  largura: g.largura,
  altura: g.altura,
});

/** Os lugares cabem no cartão e não se sobrepõem. */
function lugaresArrumados(g: GeometriaCartao) {
  for (const l of g.lugares) {
    expect(contem(caixa(g), { x: l.x, y: l.y })).toBe(true);
    expect(contem(caixa(g), { x: l.x + l.largura, y: l.y + l.altura })).toBe(true);
  }
  for (let i = 0; i < g.lugares.length; i++) {
    for (let j = i + 1; j < g.lugares.length; j++) {
      expect(sobrepoem(g.lugares[i] as Retangulo, g.lugares[j] as Retangulo)).toBe(false);
    }
  }
}

describe('lugaresADesenhar', () => {
  it('a lotação, ou mais se houver gente a mais', () => {
    expect(lugaresADesenhar(9, 7)).toBe(9);
    expect(lugaresADesenhar(4, 5)).toBe(5);
    expect(lugaresADesenhar(0, 0)).toBe(0);
  });
});

describe('casa', () => {
  it('nomes em duas colunas, uma linha por cada dois lugares, dentro do corpo', () => {
    for (const n of [1, 2, 7, 12]) {
      const g = geometriaCasa(n);
      expect(g.lugares).toHaveLength(n);
      expect(new Set(g.lugares.map((l) => l.x)).size).toBe(Math.min(2, n));
      expect(new Set(g.lugares.map((l) => l.y)).size).toBe(Math.ceil(n / 2));
      lugaresArrumados(g);
      for (const l of g.lugares) expect(l.y).toBeGreaterThan(g.estado.y + g.estado.altura - 1);
    }
  });

  it('o telhado fica por cima do corpo e o nome dentro do frontão', () => {
    const g = geometriaCasa(6);
    expect(g.telhado.y + g.telhado.altura).toBe(g.corpo.y);
    expect(g.telhado.largura).toBeGreaterThan(g.corpo.largura);
    expect(contem(g.telhado, { x: g.frontao.x, y: g.frontao.y })).toBe(true);
    expect(g.frontao.y + g.frontao.altura).toBeLessThanOrEqual(g.telhado.altura);
  });

  it('o tamanho só depende dos lugares (cresce uma linha por cada dois lugares)', () => {
    expect(geometriaCasa(6).largura).toBe(geometriaCasa(12).largura);
    expect(geometriaCasa(8).altura - geometriaCasa(6).altura).toBe(NOME.passo);
    expect(geometriaCasa(7)).toEqual(geometriaCasa(7));
    // Sem lugares, a casa continua a ter corpo.
    expect(geometriaCasa(0).altura).toBe(geometriaCasa(1).altura);
  });
});

describe('carrinha', () => {
  it('um nome por linha (um por lugar), por baixo do para-brisas e por cima da traseira', () => {
    for (const n of [5, 7, 9]) {
      const g = geometriaCarrinha(n);
      expect(g.lugares).toHaveLength(n);
      expect(new Set(g.lugares.map((l) => l.x)).size).toBe(1);
      expect(new Set(g.lugares.map((l) => l.y)).size).toBe(n);
      lugaresArrumados(g);
      const [primeiro] = g.lugares;
      expect(primeiro?.y).toBeGreaterThan(g.parabrisas.y + g.parabrisas.altura);
      expect(g.estado.y).toBeGreaterThan((g.lugares.at(-1)?.y ?? 0) + NOME.altura - 1);
    }
  });

  it('é estreita e comprida: a matrícula à frente', () => {
    const g = geometriaCarrinha(9);
    expect(g.altura).toBeGreaterThan(g.largura);
    expect(g.placa.y).toBeLessThan(g.parabrisas.y);
    expect(geometriaCarrinha(9).altura - geometriaCarrinha(5).altura).toBe(4 * NOME.passo);
  });

  it('tem quatro rodas compridas a sair dos lados: duas à frente e duas atrás', () => {
    for (const g of [
      geometriaCarrinha(5),
      geometriaCarrinha(9),
      geometriaCarrinha(9, true),
      geometriaCarrinha(5, false, 'carro'),
      geometriaCarrinha(5, true, 'carro'),
    ]) {
      const [fe, fd, te, td] = g.rodas;
      // Saem da carroçaria para os lados (a largura das rodas não mudou: 3 px de fora).
      for (const r of [fe, te]) expect(g.corpo.x - r.x).toBe(3);
      for (const r of [fd, td]) expect(r.x + r.largura - (g.corpo.x + g.corpo.largura)).toBe(3);
      // Mais compridas do que largas, dentro da altura da carrinha.
      for (const r of g.rodas) {
        expect(r.altura).toBeGreaterThanOrEqual(2 * r.largura);
        expect(r.y).toBeGreaterThan(0);
        expect(r.y + r.altura).toBeLessThan(g.altura);
      }
      // As da frente na metade da frente, as de trás na de trás, à mesma altura dos dois lados.
      expect(fe.y).toBe(fd.y);
      expect(te.y).toBe(td.y);
      expect(fe.y + fe.altura).toBeLessThan(g.altura / 2);
      expect(te.y).toBeGreaterThan(g.altura / 2);
    }
    // Mais compridas do que os antigos 7 px.
    expect(geometriaCarrinha(9).rodas[0].altura).toBeGreaterThan(14);
  });
});

describe('carrinha compacta', () => {
  it('sem lugares, mais estreita e muito mais curta; a matrícula e a lotação continuam lá', () => {
    const compacta = geometriaCarrinha(9, true);
    const inteira = geometriaCarrinha(9);
    expect(compacta.compacta).toBe(true);
    expect(inteira.compacta).toBe(false);
    expect(compacta.lugares).toEqual([]);
    expect(compacta.largura).toBeLessThan(inteira.largura);
    expect(compacta.altura).toBeLessThan(inteira.altura / 3);
    // Não depende dos lugares.
    expect(geometriaCarrinha(5, true)).toEqual({ ...geometriaCarrinha(9, true) });
    expect(compacta.estado.y).toBeGreaterThan(compacta.parabrisas.y + compacta.parabrisas.altura);
    expect(compacta.estado.y + compacta.estado.altura).toBeLessThanOrEqual(compacta.altura);
    expect(
      contem(caixa(compacta), { x: compacta.placa.x + compacta.placa.largura, y: compacta.placa.y }),
    ).toBe(true);
  });
});

describe('carro', () => {
  const carro = (n: number, compacta = false) => geometriaCarrinha(n, compacta, 'carro');

  it('a carrinha é a predefinição e não tem vidro de trás', () => {
    expect(geometriaCarrinha(9).veiculo).toBe('carrinha');
    expect(geometriaCarrinha(9).vidroTraseiro).toBeNull();
    expect(geometriaCarrinha(9, false, 'carrinha')).toEqual(geometriaCarrinha(9));
    expect(carro(5).veiculo).toBe('carro');
  });

  it('um nome por linha, entre o para-brisas e o vidro de trás; a lotação na bagageira', () => {
    for (const n of [4, 5, 7]) {
      const g = carro(n);
      expect(g.lugares).toHaveLength(n);
      expect(new Set(g.lugares.map((l) => l.x)).size).toBe(1);
      lugaresArrumados(g);
      const v = g.vidroTraseiro as Retangulo;
      const ultimo = g.lugares.at(-1) as Retangulo;
      expect(g.placa.y + g.placa.altura).toBeLessThanOrEqual(g.parabrisas.y);
      expect(g.lugares[0]?.y).toBeGreaterThan(g.parabrisas.y + g.parabrisas.altura);
      expect(v.y).toBeGreaterThan(ultimo.y + ultimo.altura - 1);
      expect(g.estado.y).toBeGreaterThan(v.y + v.altura - 1);
      expect(g.estado.y + g.estado.altura).toBeLessThanOrEqual(g.altura);
      // O vidro de trás é mais estreito do que a carroçaria e mais baixo do que o para-brisas.
      expect(v.largura).toBeLessThan(g.corpo.largura);
      expect(v.altura).toBeLessThanOrEqual(g.parabrisas.altura);
    }
  });

  it('mais curto do que a carrinha com os mesmos lugares, com a mesma largura (os nomes são iguais)', () => {
    for (const n of [5, 7, 9]) {
      for (const compacta of [false, true]) {
        expect(carro(n, compacta).altura).toBeLessThan(geometriaCarrinha(n, compacta).altura);
        expect(carro(n, compacta).largura).toBe(geometriaCarrinha(n, compacta).largura);
      }
    }
    // Um carro de 5 lugares ao pé de uma carrinha de 9: bem mais curto.
    expect(carro(5).altura).toBeLessThan(geometriaCarrinha(9).altura * 0.7);
    // Cresce uma linha por lugar, como a carrinha.
    expect(carro(7).altura - carro(5).altura).toBe(2 * NOME.passo);
  });

  it('rodas mais curtas do que as da carrinha, com o capô à frente das rodas da frente', () => {
    const g = carro(5);
    const c = geometriaCarrinha(5);
    expect(g.rodas[0].altura).toBeLessThan(c.rodas[0].altura);
    expect(g.rodas[0].y).toBeGreaterThan(c.rodas[0].y);
  });

  it('a lotação fica mais para dentro do que os nomes (a traseira é redonda)', () => {
    const g = carro(5);
    const l = g.lugares[0] as Retangulo;
    expect(g.estado.x).toBeGreaterThan(l.x);
    expect(g.estado.x + g.estado.largura).toBeLessThan(l.x + l.largura);
    // Cabe a marca "sugerido" e a pastilha "5/5 ●", também no compacto.
    for (const x of [g, carro(5, true)]) expect(x.estado.largura).toBeGreaterThanOrEqual(50);
  });

  it('compacto: sem lugares, a lotação no tejadilho antes do vidro de trás; não depende dos lugares', () => {
    const g = carro(5, true);
    const v = g.vidroTraseiro as Retangulo;
    expect(g.lugares).toEqual([]);
    expect(g.estado.y).toBeGreaterThan(g.parabrisas.y + g.parabrisas.altura - 1);
    expect(v.y).toBeGreaterThan(g.estado.y + g.estado.altura - 1);
    expect(v.y + v.altura).toBeLessThan(g.altura);
    expect(carro(9, true)).toEqual(g);
  });
});

describe('obra', () => {
  it('com uma coluna, o cartão tem largura para o nome da obra e os nomes ocupam-na toda', () => {
    const g = geometriaObra(3);
    expect(g.largura).toBeGreaterThan(NOME.largura + 40);
    for (const l of g.lugares) expect(l.largura).toBe(g.cabecalho.largura);
    lugaresArrumados(g);
  });

  it('uma coluna até OBRA_MAX_UMA_COLUNA pessoas, depois duas', () => {
    const uma = geometriaObra(OBRA_MAX_UMA_COLUNA);
    const duas = geometriaObra(OBRA_MAX_UMA_COLUNA + 1);
    expect(new Set(uma.lugares.map((l) => l.x)).size).toBe(1);
    expect(new Set(duas.lugares.map((l) => l.x)).size).toBe(2);
    expect(duas.largura).toBeGreaterThan(uma.largura);
    lugaresArrumados(uma);
    lugaresArrumados(duas);
    expect(uma.faixa.y).toBe(0);
  });
});

describe('resumo', () => {
  it('uma parte por tipo presente, com o nome por cima', () => {
    const um = geometriaResumo(1);
    const tres = geometriaResumo(3);
    expect(tres.largura).toBeGreaterThan(um.largura);
    expect(um.altura).toBe(tres.altura);
    expect(um.nome.y + um.nome.altura).toBeLessThanOrEqual(um.linha.y);
  });
});
