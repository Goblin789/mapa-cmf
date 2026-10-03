import { describe, expect, it } from 'vitest';
import {
  type Arrumacao,
  arrumacoesDoLocal,
  arrumarLocais,
  arrumarLocal,
  caixaDoLocal,
  type ElementoCartao,
  FOLGA_CARTOES,
  grelha,
  juntar,
  type LocalAArrumar,
  opcoesDeArrumacao,
  pontuacao,
} from './arrumacao';
import { type Retangulo, sobrepoem } from './geometria';
import { geometriaCarrinha, geometriaCasa } from './medidas';

const casa = (id: string, n: number): ElementoCartao => ({ chave: `casa:${id}`, geometria: geometriaCasa(n) });
const carrinha = (id: string, n: number): ElementoCartao => ({
  chave: `carrinha:${id}`,
  geometria: geometriaCarrinha(n),
});

function retangulos(a: Arrumacao): Retangulo[] {
  return [
    ...a.cartoes.map((c) => ({ x: c.x, y: c.y, largura: c.geometria.largura, altura: c.geometria.altura })),
    ...a.rotulos.map((r) => r.retangulo),
  ];
}

/** Tudo dentro do bloco e sem sobreposições. */
function arrumada(a: Arrumacao) {
  const rets = retangulos(a);
  for (const r of rets) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.largura).toBeLessThanOrEqual(a.largura);
    expect(r.y + r.altura).toBeLessThanOrEqual(a.altura);
  }
  for (let i = 0; i < rets.length; i++) {
    for (let j = i + 1; j < rets.length; j++) {
      expect(sobrepoem(rets[i] as Retangulo, rets[j] as Retangulo)).toBe(false);
    }
  }
}

const UMA_CASA: LocalAArrumar = {
  localId: 'L1',
  rotulo: null,
  casas: [casa('C1', 12)],
  carrinhas: [carrinha('V1', 9), carrinha('V2', 5)],
  obras: [],
};

const RUA: LocalAArrumar = {
  localId: 'L2',
  rotulo: 'Lugar · Rua A',
  casas: [casa('C2', 10), casa('C3', 8), casa('C4', 8), casa('C5', 6)],
  carrinhas: [carrinha('V3', 9), carrinha('V4', 9), carrinha('V5', 5), carrinha('V6', 7)],
  obras: [],
};

describe('grelha', () => {
  it('mantém a ordem, alinha cada linha em baixo e centra as linhas', () => {
    const g = grelha([casa('A', 4), casa('B', 8), casa('C', 2)], 2);
    expect(g.cartoes.map((c) => c.chave)).toEqual(['casa:A', 'casa:B', 'casa:C']);
    const [a, b, c] = g.cartoes;
    // Primeira linha: A e B com o fundo à mesma altura.
    expect((a?.y ?? 0) + (a?.geometria.altura ?? 0)).toBe((b?.y ?? 0) + (b?.geometria.altura ?? 0));
    // Segunda linha: C sozinha, centrada.
    expect(c?.x).toBe(Math.floor((g.largura - (c?.geometria.largura ?? 0)) / 2));
    expect(c?.y).toBe((b?.geometria.altura ?? 0) + FOLGA_CARTOES);
    arrumada(g);
  });

  it('sem cartões fica vazia', () => {
    expect(grelha([], 3)).toEqual({ largura: 0, altura: 0, cartoes: [], rotulos: [] });
  });
});

describe('juntar', () => {
  const a = grelha([casa('A', 6)], 1);
  const b = grelha([carrinha('V', 9)], 1);

  it('lado a lado: alinhados em baixo', () => {
    const j = juntar(a, b, 'lado');
    expect(j.largura).toBe(a.largura + FOLGA_CARTOES + b.largura);
    expect(j.altura).toBe(Math.max(a.altura, b.altura));
    const [ca, cb] = j.cartoes;
    expect((ca?.y ?? 0) + a.altura).toBe((cb?.y ?? 0) + b.altura);
    arrumada(j);
  });

  it('um por baixo do outro: centrados', () => {
    const j = juntar(a, b, 'baixo');
    expect(j.altura).toBe(a.altura + FOLGA_CARTOES + b.altura);
    expect(j.cartoes[1]?.x).toBe(Math.floor((j.largura - b.largura) / 2));
    arrumada(j);
  });
});

describe('arrumar um local', () => {
  it('uma casa com carrinhas fica numa fila (larga e baixa), com a casa à esquerda', () => {
    const a = arrumarLocal(UMA_CASA);
    expect(a.largura).toBeGreaterThan(a.altura);
    expect(a.cartoes[0]?.chave).toBe('casa:C1');
    expect(a.cartoes[0]?.x).toBe(0);
    expect(a.rotulos).toEqual([]);
    arrumada(a);
  });

  it('as opções vêm da melhor para a pior e não se repetem', () => {
    const opcoes = arrumacoesDoLocal(RUA);
    const pontos = opcoes.map(pontuacao);
    expect([...pontos].sort((x, y) => x - y)).toEqual(pontos);
    expect(new Set(opcoes.map((o) => `${o.largura}x${o.altura}`)).size).toBe(opcoes.length);
    for (const o of opcoes) {
      expect(o.cartoes).toHaveLength(8);
      arrumada(o);
    }
  });

  it('com rótulo, o nome do local vai por cima de todos os cartões', () => {
    const a = arrumarLocal(RUA);
    const [rotulo] = a.rotulos;
    expect(rotulo).toMatchObject({ localId: 'L2', texto: 'Lugar · Rua A' });
    for (const c of a.cartoes) expect(c.y).toBeGreaterThanOrEqual((rotulo?.retangulo.altura ?? 0) + 1);
  });

  it('a pontuação prefere blocos largos a altos com a mesma área', () => {
    expect(pontuacao({ largura: 400, altura: 200 })).toBeLessThan(pontuacao({ largura: 200, altura: 400 }));
    expect(pontuacao({ largura: 400, altura: 200 })).toBeLessThan(pontuacao({ largura: 1600, altura: 50 }));
  });
});

describe('locais juntos (as duas ruas de Himeling)', () => {
  const norte: LocalAArrumar = { ...RUA, localId: 'N', rotulo: 'Norte' };
  const sul: LocalAArrumar = {
    localId: 'S',
    rotulo: 'Sul',
    casas: [casa('S1', 6), casa('S2', 6), casa('S3', 4)],
    carrinhas: [carrinha('S4', 5), carrinha('S5', 9)],
    obras: [],
  };

  it('cada local fica num bloco à parte, com o seu rótulo, sem se misturarem', () => {
    const a = arrumarLocais([norte, sul]);
    arrumada(a);
    expect(a.rotulos.map((r) => r.localId)).toEqual(['N', 'S']);
    const cn = caixaDoLocal(a, 'N', new Set(norte.casas.concat(norte.carrinhas).map((c) => c.chave)));
    const cs = caixaDoLocal(a, 'S', new Set(sul.casas.concat(sul.carrinhas).map((c) => c.chave)));
    expect(cn && cs && sobrepoem(cn, cs)).toBe(false);
  });

  it('há opções empilhadas e lado a lado (o mapa escolhe a que cabe melhor)', () => {
    const chavesN = new Set(norte.casas.concat(norte.carrinhas).map((c) => c.chave));
    const chavesS = new Set(sul.casas.concat(sul.carrinhas).map((c) => c.chave));
    const opcoes = opcoesDeArrumacao([norte, sul], 4);
    const direcoes = opcoes.map((o) => {
      const cn = caixaDoLocal(o, 'N', chavesN) as Retangulo;
      const cs = caixaDoLocal(o, 'S', chavesS) as Retangulo;
      if (cs.y >= cn.y + cn.altura) return 'baixo';
      return cs.x >= cn.x + cn.largura ? 'lado' : 'misturado';
    });
    expect(direcoes).toContain('baixo');
    expect(direcoes).toContain('lado');
    expect(direcoes).not.toContain('misturado');
  });
});
