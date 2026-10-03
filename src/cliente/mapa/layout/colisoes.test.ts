import { describe, expect, it } from 'vitest';
import {
  type CaixaAColocar,
  type CaixaColocada,
  colocarBlocos,
  distanciaAoRetangulo,
  MARGEM_COLISAO,
  PINO,
  RAIO_PONTOS,
} from './colisoes';
import { sobrepoem } from './geometria';

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

function bloco(chave: string, x: number, y: number, largura: number, altura: number): CaixaAColocar {
  return { chave, pontos: [{ x, y }], formas: [{ largura, altura }] };
}

function blocosAleatorios(semente: number, n: number, espalhamento: number): CaixaAColocar[] {
  const aleatorio = gerador(semente);
  return Array.from({ length: n }, (_, i) =>
    bloco(
      `c${i}`,
      aleatorio() * espalhamento,
      aleatorio() * espalhamento,
      40 + Math.floor(aleatorio() * 300),
      30 + Math.floor(aleatorio() * 200),
    ),
  );
}

function semSobreposicoes(caixas: readonly CaixaColocada[], margem: number) {
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      if (sobrepoem(caixas[i] as CaixaColocada, caixas[j] as CaixaColocada, margem)) return false;
    }
  }
  return true;
}

describe('colocarBlocos', () => {
  it('um bloco sozinho fica por cima do seu ponto, centrado, a PINO px (o pino)', () => {
    const [c] = colocarBlocos([bloco('a', 100, 200, 120, 80)]);
    expect(c).toMatchObject({ x: 40, y: 200 - PINO - 80, largura: 120, altura: 80, deslocada: false });
    expect(c?.afastamento).toBe(PINO);
  });

  it('nunca tapa o seu próprio ponto nem o de outro bloco', () => {
    for (let semente = 1; semente <= 20; semente++) {
      const r = colocarBlocos(blocosAleatorios(semente, 12, 600));
      for (const c of r) {
        for (const p of c.pontos) expect(distanciaAoRetangulo(p, c)).toBeGreaterThanOrEqual(PINO);
        for (const outro of r) {
          if (outro === c) continue;
          for (const p of outro.pontos)
            expect(distanciaAoRetangulo(p, c)).toBeGreaterThanOrEqual(RAIO_PONTOS);
        }
      }
    }
  });

  it('blocos afastados ficam todos agarrados ao seu ponto', () => {
    const r = colocarBlocos([bloco('a', 0, 0, 100, 50), bloco('b', 500, 0, 100, 50)]);
    expect(r.every((c) => c.afastamento === PINO && !c.deslocada)).toBe(true);
  });

  it('dois blocos no mesmo sítio: um por cima e o outro por baixo, ambos com o pino curto', () => {
    const r = colocarBlocos([bloco('grande', 0, 0, 200, 100), bloco('pequeno', 3, 2, 100, 40)]);
    expect(r.every((c) => c.afastamento <= PINO + 1)).toBe(true);
    expect(semSobreposicoes(r, MARGEM_COLISAO)).toBe(true);
  });

  it('passar do tamanho do ecrã custa caro: o bloco vai para o lado em vez de alargar o conjunto', () => {
    // Por cima ou por baixo, o conjunto (ponto + bloco) ficaria mais alto do que o ecrã.
    const [c] = colocarBlocos([bloco('a', 0, 0, 120, 80)], { ecra: { largura: 400, altura: 85 } });
    expect(c && c.y < 0 && c.y + c.altura > 0).toBe(true);
    expect(c?.afastamento).toBe(PINO);
  });

  it('sem limite de ecrã, o mesmo bloco fica por cima do ponto', () => {
    const [c] = colocarBlocos([bloco('a', 0, 0, 120, 80)], { ecra: null });
    expect(c?.y).toBe(-PINO - 80);
  });

  it('prefere ficar centrado no ponto a ficar pendurado para um lado', () => {
    // Sem nada à volta, o centro do bloco fica por cima do ponto.
    const [c] = colocarBlocos([bloco('a', 0, 0, 300, 60)]);
    expect((c?.x ?? 0) + (c?.largura ?? 0) / 2).toBe(0);
  });

  it('a parte (as casas) é que fica junto do ponto, mesmo que o bloco seja maior', () => {
    // Bloco com a casa ao meio e carrinhas dos dois lados: o ponto fica por baixo da casa.
    const [c] = colocarBlocos([
      {
        chave: 'casa-ao-meio',
        pontos: [{ x: 0, y: 0 }],
        formas: [{ largura: 300, altura: 100, partes: [[{ x: 100, y: 20, largura: 100, altura: 80 }]] }],
      },
    ]);
    expect(c?.afastamento).toBe(PINO);
    expect((c?.x ?? 0) + 150).toBe(0);
  });

  it('um bloco pequeno com o ponto ao lado de um grande não fica cercado', () => {
    // O ponto pequeno fica mesmo onde o grande gostaria de ir: o grande deixa-lhe espaço.
    const r = colocarBlocos([bloco('grande', 0, 0, 400, 200), bloco('pequeno', -60, -40, 80, 40)]);
    const pequeno = r.find((c) => c.chave === 'pequeno');
    expect(pequeno?.afastamento).toBeLessThanOrEqual(PINO + 1);
    expect(semSobreposicoes(r, MARGEM_COLISAO)).toBe(true);
  });

  it('dois locais quase no mesmo sítio: cada bloco fica do seu lado (o mais a norte em cima)', () => {
    // O do sul é maior (põe-se primeiro), mas não fica por cima do outro.
    const r = colocarBlocos([bloco('sul', 0, 10, 300, 120), bloco('norte', -4, 0, 200, 80)]);
    const sul = r.find((c) => c.chave === 'sul') as CaixaColocada;
    const norte = r.find((c) => c.chave === 'norte') as CaixaColocada;
    expect(norte.y + norte.altura).toBeLessThanOrEqual(sul.y);
    expect(r.every((c) => c.afastamento <= PINO + 1)).toBe(true);
  });

  it('escolhe a forma que cabe melhor e diz qual foi', () => {
    // Uma parede de blocos por cima e por baixo do ponto: só a forma baixa cabe entre elas.
    const paredes = [bloco('cima', 0, -70, 600, 40), bloco('baixo', 0, 120, 600, 40)];
    const r = colocarBlocos([
      ...paredes,
      {
        chave: 'x',
        pontos: [{ x: 0, y: 25 }],
        formas: [
          { largura: 60, altura: 140 },
          { largura: 140, altura: 30, custoExtra: 5 },
        ],
      },
    ]);
    const x = r[2] as CaixaColocada;
    expect(x.forma).toBe(1);
    expect(x.altura).toBe(30);
    expect(semSobreposicoes(r, MARGEM_COLISAO)).toBe(true);
  });

  it('num bloco com vários pontos, cada ponto conta até à sua parte', () => {
    // Duas ruas empilhadas (norte em cima): o bloco encosta ao lado dos pontos, com a fronteira entre as
    // duas partes à altura dos pontos.
    const [c] = colocarBlocos(
      [
        {
          chave: 'duas-ruas',
          pontos: [
            { x: 0, y: -3 },
            { x: 4, y: 3 },
          ],
          formas: [
            {
              largura: 300,
              altura: 200,
              partes: [
                [{ x: 0, y: 0, largura: 300, altura: 100 }],
                [{ x: 0, y: 100, largura: 300, altura: 100 }],
              ],
            },
          ],
        },
        // Paredes por cima e por baixo: o bloco tem de ir para o lado.
        bloco('cima', 0, -160, 900, 60),
        bloco('baixo', 0, 160, 900, 60),
      ],
      { margem: 4 },
    );
    expect(c?.afastamento).toBeLessThanOrEqual(PINO + 6);
  });

  it('nunca há sobreposições, mesmo com muitos blocos amontoados', () => {
    for (let semente = 1; semente <= 30; semente++) {
      const n = 5 + (semente % 20);
      const r = colocarBlocos(blocosAleatorios(semente, n, semente % 2 ? 50 : 2000));
      expect(semSobreposicoes(r, MARGEM_COLISAO)).toBe(true);
    }
  });

  it('respeita outra margem', () => {
    const r = colocarBlocos(blocosAleatorios(7, 15, 100), { margem: 20 });
    expect(semSobreposicoes(r, 20)).toBe(true);
  });

  it('é determinístico e não depende da ordem da entrada', () => {
    const caixas = blocosAleatorios(3, 20, 300);
    const a = colocarBlocos(caixas);
    expect(colocarBlocos(caixas)).toEqual(a);
    const porChave = new Map(colocarBlocos([...caixas].reverse()).map((c) => [c.chave, c]));
    for (const c of a) expect(porChave.get(c.chave)).toEqual(c);
  });

  it('devolve pela ordem da entrada, em píxeis inteiros', () => {
    const caixas = blocosAleatorios(9, 10, 100);
    const r = colocarBlocos(caixas);
    expect(r.map((c) => c.chave)).toEqual(caixas.map((c) => c.chave));
    for (const c of r)
      for (const v of [c.x, c.y, c.largura, c.altura]) expect(Number.isInteger(v)).toBe(true);
  });

  it('blocos fixos ficam onde estavam; só os outros procuram sítio, sem se sobreporem', () => {
    for (let semente = 1; semente <= 10; semente++) {
      const caixas = blocosAleatorios(semente, 14, 400);
      const antes = colocarBlocos(caixas);
      // O bloco 0 cresce (outra forma); os outros ficam fixos.
      const maior = caixas.map((c, i) => (i === 0 ? { ...c, formas: [{ largura: 260, altura: 220 }] } : c));
      const fixos = new Map(antes.slice(1).map((c) => [c.chave, { x: c.x, y: c.y, forma: 0 }]));
      const depois = colocarBlocos(maior, { fixos });
      for (let i = 1; i < antes.length; i++) {
        expect({ x: depois[i]?.x, y: depois[i]?.y }).toEqual({ x: antes[i]?.x, y: antes[i]?.y });
      }
      expect(semSobreposicoes(depois, MARGEM_COLISAO)).toBe(true);
      for (const c of depois)
        for (const outro of depois)
          if (outro !== c)
            for (const p of outro.pontos)
              expect(distanciaAoRetangulo(p, c)).toBeGreaterThanOrEqual(RAIO_PONTOS);
    }
  });

  it('um bloco fixo com uma forma que já não existe procura sítio como os outros', () => {
    const caixas = [bloco('a', 100, 200, 120, 80), bloco('b', 400, 200, 120, 80)];
    const r = colocarBlocos(caixas, { fixos: new Map([['a', { x: 0, y: 0, forma: 3 }]]) });
    expect(r).toEqual(colocarBlocos(caixas));
  });

  it('um bloco com lado fica todo desse lado da vertical e à altura do seu ponto', () => {
    // Sozinho preferia ficar por cima do ponto; com lado, fica ao lado (à esquerda ou à direita).
    for (const lado of ['esquerda', 'direita'] as const) {
      const x = lado === 'esquerda' ? -PINO : PINO;
      const [c] = colocarBlocos([{ ...bloco('a', 0, 0, 120, 80), lado: { lado, x } }]);
      if (!c) throw new Error('sem bloco');
      if (lado === 'esquerda') expect(c.x + c.largura).toBeLessThanOrEqual(x);
      else expect(c.x).toBeGreaterThanOrEqual(x);
      expect(c.y).toBeLessThanOrEqual(0);
      expect(c.y + c.altura).toBeGreaterThanOrEqual(0);
      expect(c.afastamento).toBe(PINO);
    }
  });

  it('com rótulo, o ponto fica na linha do rótulo (o nome mesmo ao lado do ponto)', () => {
    const rotulo = { x: 60, y: 0, largura: 60, altura: 13 };
    const [c] = colocarBlocos([
      {
        chave: 'rua',
        pontos: [{ x: 0, y: 0 }],
        formas: [{ largura: 120, altura: 80, partes: [[rotulo]], rotulos: [rotulo] }],
        lado: { lado: 'esquerda', x: -PINO },
      },
    ]);
    if (!c) throw new Error('sem bloco');
    expect(c.y + rotulo.y).toBeLessThanOrEqual(0);
    expect(c.y + rotulo.y + rotulo.altura).toBeGreaterThanOrEqual(0);
    expect(c.x + c.largura).toBe(-PINO);
  });

  it('dois blocos lado a lado ficam virados para o mesmo lado, mesmo com uma parede a empurrar um deles', () => {
    // Duas ruas quase no mesmo sítio; por baixo da da direita há uma parede: as duas sobem.
    const rua = (chave: string, x: number, y: number, lado: 'esquerda' | 'direita', par: string) => {
      const emCima = { x: 0, y: 0, largura: 100, altura: 13 };
      const emBaixo = { x: 0, y: 87, largura: 100, altura: 13 };
      return {
        chave,
        pontos: [{ x, y }],
        formas: [
          { largura: 100, altura: 100, partes: [[emCima]], rotulos: [emCima] },
          { largura: 100, altura: 100, partes: [[emBaixo]], rotulos: [emBaixo] },
        ],
        lado: { lado, x: lado === 'esquerda' ? -PINO : 4 + PINO, par },
      };
    };
    const r = colocarBlocos([
      rua('oeste', 0, 0, 'esquerda', 'leste'),
      rua('leste', 4, 6, 'direita', 'oeste'),
      bloco('parede', 150, 60, 200, 40),
    ]);
    const oeste = r.find((c) => c.chave === 'oeste') as CaixaColocada;
    const leste = r.find((c) => c.chave === 'leste') as CaixaColocada;
    expect(oeste.x + oeste.largura).toBeLessThanOrEqual(-PINO);
    expect(leste.x).toBeGreaterThanOrEqual(4 + PINO);
    // A de leste tem de subir (rótulo em baixo, forma 1) e a de oeste sobe com ela.
    expect(leste.forma).toBe(1);
    expect(oeste.forma).toBe(1);
    expect(semSobreposicoes(r, MARGEM_COLISAO)).toBe(true);
  });

  it('os dois blocos lado a lado escolhem juntos para onde ficam virados, para ficarem os dois encostados', () => {
    // Por cima e à esquerda das duas ruas há o ponto de outro local: a de oeste não pode subir encostada.
    // O ecrã é baixo, por isso descer custa (o conjunto passa do ecrã): sozinha, a de leste subia e a de
    // oeste, obrigada a subir também, ficava afastada do seu ponto. Juntas, descem as duas.
    const rua = (chave: string, x: number, y: number, lado: 'esquerda' | 'direita', par: string) => {
      const emCima = { x: 0, y: 0, largura: 100, altura: 13 };
      const emBaixo = { x: 0, y: 87, largura: 100, altura: 13 };
      return {
        chave,
        pontos: [{ x, y }],
        formas: [
          { largura: 100, altura: 100, partes: [[emCima]], rotulos: [emCima] },
          { largura: 100, altura: 100, partes: [[emBaixo]], rotulos: [emBaixo] },
        ],
        lado: { lado, x: lado === 'esquerda' ? -PINO : 4 + PINO, par },
      };
    };
    const r = colocarBlocos(
      [
        rua('oeste', 0, 0, 'esquerda', 'leste'),
        rua('leste', 4, 6, 'direita', 'oeste'),
        bloco('vizinho', -50, -60, 60, 40),
      ],
      { ecra: { largura: 2000, altura: 120 } },
    );
    const oeste = r.find((c) => c.chave === 'oeste') as CaixaColocada;
    const leste = r.find((c) => c.chave === 'leste') as CaixaColocada;
    expect(oeste.afastamento).toBe(PINO);
    expect(leste.afastamento).toBe(PINO);
    expect(oeste.x + oeste.largura).toBe(-PINO);
    expect(leste.x).toBe(4 + PINO);
    // As duas a descer dos pontos (rótulo em cima, forma 0).
    expect([oeste.forma, leste.forma]).toEqual([0, 0]);
    expect(semSobreposicoes(r, MARGEM_COLISAO)).toBe(true);
  });

  it('um bloco fixo que já não está do seu lado procura sítio', () => {
    const caixa = { ...bloco('a', 0, 0, 120, 80), lado: { lado: 'esquerda' as const, x: -PINO } };
    const r = colocarBlocos([caixa], { fixos: new Map([['a', { x: -60, y: -100, forma: 0 }]]) });
    expect(r).toEqual(colocarBlocos([caixa]));
  });

  it('marca como deslocado quem ficou mais longe do que o pino', () => {
    for (const c of colocarBlocos(blocosAleatorios(11, 15, 200))) {
      expect(c.deslocada).toBe(c.afastamento > PINO + 1);
    }
  });
});
