import { describe, expect, it } from 'vitest';
import { DISTRIBUICOES, gruposReais } from './cenariosTeste';
import { distanciaAoRetangulo, MARGEM_COLISAO, PINO, RAIO_PONTOS } from './colisoes';
import {
  areaDesenhada,
  areaPrevista,
  chavesPrincipais,
  DISTANCIA_VIZINHOS_M,
  type Disposicao,
  disporMapa,
  distanciaMetros,
  type GrupoDisposto,
  limiteDoEcra,
  linhasChamada,
  retanguloDoLocal,
  rotuloDoLocal,
  rotuloNoMapa,
  vizinhancas,
} from './disposicao';
import { ESCALA_MINIMA } from './escala';
import { contextoFicticio } from './estadoFicticioTeste';
import { type Retangulo, sobrepoem } from './geometria';
import { chaveGrupo, type GrupoNoMapa, montarModelo } from './grupos';
import { desprojetar, type Ponto, projetarArredondado } from './projecao';

const ZOOMS = [9, 10, 10.25, 10.5, 10.75, 11, 12, 13, 14];
const TAMANHOS = [
  { larguraMapa: 375, alturaMapa: 600 },
  { larguraMapa: 1568, alturaMapa: 1030 },
] as const;

const todosAbertos = (grupos: readonly GrupoNoMapa[]) => new Set(grupos.map((g) => chaveGrupo(g.localId)));
const retangulo = (g: Retangulo): Retangulo => ({ x: g.x, y: g.y, largura: g.largura, altura: g.altura });

/** Sem sobreposições entre blocos, nenhum ponto tapado, cartões dentro do bloco e sem se sobreporem. */
function verificar(d: Disposicao) {
  const contexto = `zoom ${d.zoom}, modo ${d.modo}`;
  for (let i = 0; i < d.grupos.length; i++) {
    const a = d.grupos[i] as Disposicao['grupos'][number];
    for (let j = i + 1; j < d.grupos.length; j++) {
      const b = d.grupos[j] as Disposicao['grupos'][number];
      expect(
        sobrepoem(retangulo(a), retangulo(b), MARGEM_COLISAO - 1),
        `${a.chave} × ${b.chave}, ${contexto}`,
      ).toBe(false);
    }
    for (const g of d.grupos) {
      const minimo = g === a ? PINO : RAIO_PONTOS;
      for (const p of g.pontos) {
        expect(
          distanciaAoRetangulo(p, retangulo(a)),
          `${a.chave} tapa ${g.chave}, ${contexto}`,
        ).toBeGreaterThanOrEqual(minimo - 1);
      }
    }
    if (a.modo !== 'completo') continue;
    const cartoes = a.arrumacao.cartoes.map((c) => d.cartoes.get(c.chave)?.retangulo as Retangulo);
    for (let k = 0; k < cartoes.length; k++) {
      const c = cartoes[k] as Retangulo;
      expect(c.x >= a.x - 0.5 && c.y >= a.y - 0.5, contexto).toBe(true);
      expect(
        c.x + c.largura <= a.x + a.largura + 0.5 && c.y + c.altura <= a.y + a.altura + 0.5,
        contexto,
      ).toBe(true);
      for (let m = k + 1; m < cartoes.length; m++)
        expect(sobrepoem(c, cartoes[m] as Retangulo), contexto).toBe(false);
    }
  }
}

describe('disposição com as coordenadas e lotações reais (sem dados pessoais)', () => {
  for (const distribuicao of DISTRIBUICOES) {
    const grupos = gruposReais(distribuicao);

    it(`sem sobreposições nem pontos tapados, em todos os zooms (carrinhas: ${distribuicao})`, () => {
      for (const zoom of ZOOMS)
        for (const tamanho of TAMANHOS) verificar(disporMapa(grupos, { zoom, ...tamanho }));
    });

    it(`com todos os locais abertos no resumo (carrinhas: ${distribuicao})`, () => {
      for (const zoom of [9, 10]) verificar(disporMapa(grupos, { zoom, expandidos: todosAbertos(grupos) }));
    });
  }

  it('afastado, cada sítio é uma pastilha; as duas ruas de Himeling juntam-se numa só', () => {
    const grupos = gruposReais('tipica');
    const d = disporMapa(grupos, { zoom: 9, larguraMapa: 1568, alturaMapa: 1030 });
    expect(d.modo).toBe('resumo');
    expect(d.grupos.every((g) => g.modo === 'resumo')).toBe(true);
    const himeling = d.grupos.find((g) => g.locais.some((l) => l.localId === 'himeling-grotte'));
    expect(himeling?.locais.map((l) => l.localId).sort()).toEqual(['himeling-foret', 'himeling-grotte']);
  });

  it('com os nomes, cada rua de Himeling tem o seu bloco, agarrado ao seu ponto', () => {
    const grupos = gruposReais('tipica');
    for (const zoom of [10.25, 11, 13]) {
      const d = disporMapa(grupos, { zoom, larguraMapa: 1568, alturaMapa: 1030 });
      expect(d.grupos.every((g) => g.locais.length === 1)).toBe(true);
      for (const id of ['himeling-grotte', 'himeling-foret']) {
        const g = d.grupos.find((x) => x.locais[0]?.localId === id);
        if (!g) throw new Error(`falta ${id}`);
        expect(distanciaAoRetangulo(g.pontos[0] as never, retanguloDoLocal(d, g, 0))).toBeLessThanOrEqual(30);
      }
    }
  });

  it('perto, todos os pinos são curtos (o bloco encosta ao seu ponto)', () => {
    for (const distribuicao of DISTRIBUICOES) {
      const d = disporMapa(gruposReais(distribuicao), { zoom: 13, larguraMapa: 1568, alturaMapa: 1030 });
      for (const l of linhasChamada(d)) {
        expect(
          Math.hypot(l.para.x - l.de.x, l.para.y - l.de.y),
          `${distribuicao} ${l.chave}`,
        ).toBeLessThanOrEqual(PINO + 1);
      }
    }
  });

  it('a área prevista (sem colocar os blocos) é praticamente a área desenhada', () => {
    const grupos = gruposReais('tipica');
    for (const zoom of [9, 10.25, 11]) {
      const opcoes = { zoom, larguraMapa: 1568, alturaMapa: 1030 };
      // Igual a menos da largura dos rótulos (acompanham a largura da arrumação escolhida).
      const prevista = areaPrevista(grupos, opcoes);
      expect(Math.abs(prevista - areaDesenhada(disporMapa(grupos, opcoes))) / prevista).toBeLessThan(0.02);
    }
  });

  it('o limite do ecrã só existe enquanto os pontos cabem no mapa', () => {
    const pontos = [
      { x: 0, y: 0 },
      { x: 500, y: 300 },
    ];
    expect(limiteDoEcra(pontos, { largura: 800, altura: 600 })).toEqual({ largura: 768, altura: 568 });
    expect(limiteDoEcra(pontos, { largura: 400, altura: 600 })).toBeNull();
    expect(limiteDoEcra(pontos, null)).toBeNull();
  });
});

describe('modos e cartões (estado fictício)', () => {
  const { estado, indices, dormidas } = contextoFicticio();
  const modelo = montarModelo(estado, indices, dormidas);

  it('completo: as carrinhas com um lugar por linha; compacto: sem lugares (só matrícula e lotação)', () => {
    const completo = disporMapa(modelo.grupos, { zoom: 11 });
    const compacto = disporMapa(modelo.grupos, { zoom: 10.25 });
    expect(completo.modo).toBe('completo');
    expect(compacto.modo).toBe('compacto');
    expect(completo.cartoes.get('carrinha:V2')?.lugares).toHaveLength(9);
    expect(compacto.cartoes.get('carrinha:V2')?.lugares).toEqual([]);
    // As casas mostram os nomes nos dois modos.
    expect(compacto.cartoes.get('casa:C1')?.lugares).toHaveLength(5);
    const altura = (d: Disposicao) => d.cartoes.get('carrinha:V2')?.retangulo.altura ?? 0;
    expect(altura(compacto)).toBeLessThan(altura(completo) / 2);
  });

  it('um local aberto à mão no compacto mostra as carrinhas inteiras', () => {
    const d = disporMapa(modelo.grupos, { zoom: 10.25, expandidos: new Set(['grupo:L1']) });
    expect(d.cartoes.get('carrinha:V2')?.lugares).toHaveLength(9);
    expect(d.cartoes.get('carrinha:V1')?.lugares).toEqual([]);
  });

  it('um local aberto à mão no resumo é desenhado com os cartões, à escala mínima', () => {
    const d = disporMapa(modelo.grupos, { zoom: 9, expandidos: new Set(['grupo:L1']) });
    const l1 = d.grupos.find((g) => g.chave === 'grupo:L1');
    expect(l1?.modo).toBe('completo');
    expect(l1?.escala).toBe(ESCALA_MINIMA);
    expect(d.grupos.find((g) => g.chave === 'grupo:L2')?.modo).toBe('resumo');
  });

  it('no resumo, as casas e carrinhas apontam para a pastilha do seu local', () => {
    const d = disporMapa(modelo.grupos, { zoom: 9 });
    const pastilha = d.cartoes.get('grupo:L1')?.retangulo;
    expect(d.cartoes.get('casa:C1')?.retangulo).toEqual(pastilha);
    expect(d.cartoes.get('carrinha:V2')?.retangulo).toEqual(pastilha);
    expect(d.cartoes.get('casa:C1')?.lugares).toBeNull();
  });

  it('o pino chega a uma casa do local (sem casas, a uma carrinha) ou ao rótulo com o nome do local', () => {
    const l1 = modelo.grupos.find((g) => g.localId === 'L1') as GrupoNoMapa;
    const e = modelo.grupos.find((g) => g.localId === 'E') as GrupoNoMapa;
    expect([...chavesPrincipais(l1)]).toEqual(['casa:C1', 'casa:C2']);
    expect([...chavesPrincipais(e)]).toEqual(['carrinha:V4']);
    const d = disporMapa(modelo.grupos, { zoom: 12 });
    for (const g of d.grupos) {
      const local = g.locais[0] as GrupoNoMapa;
      const r = retanguloDoLocal(d, g, 0);
      const alvos = [...chavesPrincipais(local)].map((k) => d.cartoes.get(k)?.retangulo);
      alvos.push(rotuloNoMapa(g, local.localId) ?? undefined);
      expect(alvos).toContainEqual(r);
    }
  });

  it('com dois locais quase no mesmo sítio, o rótulo de cada um fica junto do seu ponto', () => {
    const grupos = gruposReais('tipica');
    const d = disporMapa(grupos, { zoom: 11, larguraMapa: 1568, alturaMapa: 1030 });
    for (const id of ['himeling-grotte', 'himeling-foret']) {
      const g = d.grupos.find((x) => x.locais[0]?.localId === id);
      const rotulo = g && rotuloNoMapa(g, id);
      if (!g || !rotulo) throw new Error(`falta ${id}`);
      expect(distanciaAoRetangulo(g.pontos[0] as never, rotulo)).toBeLessThanOrEqual(PINO + 1);
    }
    // A rua mais a oeste (Forêt) fica à esquerda da outra, mesmo sendo a mais a norte.
    const foret = d.grupos.find((x) => x.locais[0]?.localId === 'himeling-foret');
    const grotte = d.grupos.find((x) => x.locais[0]?.localId === 'himeling-grotte');
    expect((foret?.x ?? 0) + (foret?.largura ?? 0)).toBeLessThan(grotte?.x ?? 0);
  });

  it('modo de edição: com a disposição anterior, uma casa que cresce uma linha não faz saltar os outros blocos', () => {
    // Ecrã inteiro (mapa de 1568×1004, vista inicial no zoom 10,75).
    const opcoes = { zoom: 10.75, larguraMapa: 1568, alturaMapa: 1004 };
    const antes = gruposReais('tipica');
    // Alguém largado em Walferdange (sempre cheia, 4/4): a casa passa a desenhar 5 lugares (mais uma linha).
    const depois = antes.map((g) =>
      g.localId === 'walferdange' ? { ...g, casas: g.casas.map((c) => ({ ...c, nLugares: 5 })) } : g,
    );
    const d0 = disporMapa(antes, opcoes);
    const sitio = (d: Disposicao) => new Map(d.grupos.map((g) => [g.chave, `${g.x},${g.y}`]));
    // Sem a anterior, a colocação refaz-se toda e outros blocos mudam de sítio (era o que acontecia).
    const refeita = sitio(disporMapa(depois, opcoes));
    const mudaram = [...sitio(d0)].filter(([k, v]) => k !== 'grupo:walferdange' && refeita.get(k) !== v);
    expect(mudaram.length).toBeGreaterThan(0);
    // Com a anterior, só Walferdange pode mudar; o resto fica exatamente onde estava, sem sobreposições.
    const d1 = disporMapa(depois, { ...opcoes, anterior: d0 });
    verificar(d1);
    const s1 = sitio(d1);
    for (const [k, v] of sitio(d0)) if (k !== 'grupo:walferdange') expect(s1.get(k), k).toBe(v);
    expect(d1.cartoes.get('casa:walferdange')?.lugares?.length).toBe(5);
    // Nada mudou: fica tudo igual (também é o que se vê ao entrar no modo de edição).
    expect(sitio(disporMapa(antes, { ...opcoes, anterior: d0 }))).toEqual(sitio(d0));
  });

  it('modo de edição: a barra da edição (mapa 45 px mais baixo) não faz saltar os blocos', () => {
    // Ecrã inteiro (1920×1080): o mapa tem 1568×1004 e a vista inicial fica no zoom 10,75.
    const antes = gruposReais('tipica');
    const d0 = disporMapa(antes, { zoom: 10.75, larguraMapa: 1568, alturaMapa: 1004 });
    const sitio = (d: Disposicao) => new Map(d.grupos.map((g) => [g.chave, `${g.x},${g.y}`]));
    const maisBaixo = { zoom: 10.75, larguraMapa: 1568, alturaMapa: 959 };
    // Refeita para a nova altura, vários blocos mudavam de sítio (alguns mais de 100 px).
    expect(sitio(disporMapa(antes, maisBaixo))).not.toEqual(sitio(d0));
    expect(sitio(disporMapa(antes, { ...maisBaixo, anterior: d0 }))).toEqual(sitio(d0));
    // Noutro zoom não há disposição anterior que sirva: é a normal.
    const outroZoom = { zoom: 11.5, larguraMapa: 1568, alturaMapa: 984 };
    expect(sitio(disporMapa(antes, { ...outroZoom, anterior: d0 }))).toEqual(
      sitio(disporMapa(antes, outroZoom)),
    );
  });

  it('modo de edição: um bloco fixo que tape o ponto de um local novo procura outro sítio', () => {
    const opcoes = { zoom: 11, larguraMapa: 1568, alturaMapa: 1030 };
    const antes = gruposReais('tipica', { casas: false, carrinhas: true, obras: true });
    const d0 = disporMapa(antes, opcoes);
    // Um local novo, mesmo por baixo de um bloco que já estava no ecrã.
    const tapado = d0.grupos[0] as Disposicao['grupos'][number];
    const centroTapado = { x: tapado.x + tapado.largura / 2, y: tapado.y + tapado.altura / 2 };
    const latLng = desprojetar(centroTapado, 11);
    const novo: GrupoNoMapa = {
      localId: 'novo',
      nome: 'Local novo',
      lat: latLng.lat,
      lng: latLng.lng,
      casas: [],
      carrinhas: [{ id: 'VNOVA', nLugares: 5, confianca: 'sugerida' }],
      obras: [],
    };
    const d1 = disporMapa([...antes, novo], { ...opcoes, anterior: d0 });
    verificar(d1);
    const g = d1.grupos.find((x) => x.chave === tapado.chave) as Disposicao['grupos'][number];
    expect(`${g.x},${g.y}`).not.toBe(`${tapado.x},${tapado.y}`);
  });

  it('o nome do local desliza na sua faixa até junto do ponto, mesmo com o bloco todo para um lado', () => {
    // Numa janela de browser no PC (compacto): o bloco da Rue de la Forêt fica a oeste do ponto. O
    // rótulo ficava na ponta esquerda, a ~200 px (≈15 km) do sítio; agora fica junto dele.
    const d = disporMapa(gruposReais('tipica'), { zoom: 10.25, larguraMapa: 1568, alturaMapa: 896 });
    const foret = d.grupos.find((x) => x.locais[0]?.localId === 'himeling-foret');
    const rotulo = foret && rotuloNoMapa(foret, 'himeling-foret');
    if (!foret || !rotulo) throw new Error('falta a Rue de la Forêt');
    expect(distanciaAoRetangulo(foret.pontos[0] as never, rotulo)).toBeLessThanOrEqual(2 * PINO);
    // Em qualquer zoom e camadas: o rótulo fica dentro da faixa e tão perto do ponto como a faixa.
    for (const camadas of [undefined, { casas: false, carrinhas: true, obras: true }] as const) {
      for (const zoom of ZOOMS) {
        const dz = disporMapa(gruposReais('tipica', camadas), { zoom, larguraMapa: 1568, alturaMapa: 1030 });
        for (const g of dz.grupos) {
          if (g.modo !== 'completo') continue;
          for (const r of g.arrumacao.rotulos) {
            const i = g.locais.findIndex((l) => l.localId === r.localId);
            const p = g.pontos[i] as never;
            const faixa = {
              x: g.x + r.faixa.x * g.escala,
              y: g.y + r.faixa.y * g.escala,
              largura: r.faixa.largura * g.escala,
              altura: r.faixa.altura * g.escala,
            };
            const noMapa = rotuloNoMapa(g, r.localId) as Retangulo;
            expect(noMapa.x).toBeGreaterThanOrEqual(faixa.x - 0.01);
            expect(noMapa.x + noMapa.largura).toBeLessThanOrEqual(faixa.x + faixa.largura + 0.01);
            expect(distanciaAoRetangulo(p, noMapa) - distanciaAoRetangulo(p, faixa)).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('rótulo por cima só quando o nome não está numa casa', () => {
    const local = (casas: number, carrinhas: number): GrupoNoMapa => ({
      localId: 'X',
      nome: 'Sítio, Rua A',
      lat: 0,
      lng: 0,
      casas: Array.from({ length: casas }, (_, i) => ({ id: `c${i}`, nLugares: 2 })),
      carrinhas: Array.from({ length: carrinhas }, (_, i) => ({
        id: `v${i}`,
        nLugares: 5,
        confianca: 'sugerida',
      })),
      obras: [],
    });
    expect(rotuloDoLocal(local(1, 2))).toBeNull();
    expect(rotuloDoLocal(local(2, 0))).toBe('Sítio · Rua A');
    expect(rotuloDoLocal(local(0, 1))).toBe('Sítio · Rua A');
  });

  it('uma linha de chamada por local; longa só quando o bloco teve de se afastar', () => {
    const d = disporMapa(modelo.grupos, { zoom: 12 });
    const linhas = linhasChamada(d);
    expect(linhas.map((l) => l.chave).sort()).toEqual(['pino:E', 'pino:L1', 'pino:L2', 'pino:O']);
    for (const l of linhas) {
      expect(l.longa).toBe(Math.hypot(l.para.x - l.de.x, l.para.y - l.de.y) > PINO + 2);
    }
  });

  it('a mesma pergunta dá a mesma disposição (calculada uma só vez)', () => {
    const a = disporMapa(modelo.grupos, { zoom: 11.5, larguraMapa: 900, alturaMapa: 700 });
    const b = disporMapa(modelo.grupos, { zoom: 11.5, larguraMapa: 900, alturaMapa: 700 });
    expect(b).toBe(a);
    expect(disporMapa(modelo.grupos, { zoom: 11.75, larguraMapa: 900, alturaMapa: 700 })).not.toBe(a);
  });
});

/** O bloco do local (ou a pastilha onde está). */
function blocoDe(d: Disposicao, localId: string): GrupoDisposto {
  const g = d.grupos.find((x) => x.locais.some((l) => l.localId === localId));
  if (!g) throw new Error(`falta ${localId}`);
  return g;
}

/**
 * A Rue de la Forêt toda à esquerda dos dois pontos e a Rue de la Grotte toda à direita, cada uma à
 * altura do seu ponto (com o nome da rua mesmo ao lado do ponto) e viradas para o mesmo lado; nunca uma
 * por cima da outra. Devolve false se as duas ainda forem uma só pastilha (resumo).
 */
function ruasLadoALado(d: Disposicao, contexto: string): boolean {
  const foret = blocoDe(d, 'himeling-foret');
  const grotte = blocoDe(d, 'himeling-grotte');
  if (foret === grotte) {
    expect(foret.modo, contexto).toBe('resumo');
    return false;
  }
  const pF = foret.pontos[0] as Ponto;
  const pG = grotte.pontos[0] as Ponto;
  // Cada bloco todo do seu lado dos DOIS pontos.
  expect(foret.x + foret.largura, `Forêt à esquerda, ${contexto}`).toBeLessThanOrEqual(Math.min(pF.x, pG.x));
  expect(grotte.x, `Grotte à direita, ${contexto}`).toBeGreaterThanOrEqual(Math.max(pF.x, pG.x));
  // Lado a lado: cada um à altura do seu ponto e os dois com uma faixa de altura em comum.
  for (const [g, p, id] of [
    [foret, pF, 'himeling-foret'],
    [grotte, pG, 'himeling-grotte'],
  ] as const) {
    expect(p.y, `${id} à altura do ponto, ${contexto}`).toBeGreaterThanOrEqual(g.y);
    expect(p.y, `${id} à altura do ponto, ${contexto}`).toBeLessThanOrEqual(g.y + g.altura);
    const r = rotuloNoMapa(g, id);
    if (r) {
      // O nome da rua na linha do ponto, do lado de dentro (entre os dois blocos), mesmo ao lado dele:
      // um bloco afastado para o lado deixava outro meter-se entre as duas ruas.
      expect(p.y, `${id}: rótulo na linha do ponto, ${contexto}`).toBeGreaterThanOrEqual(r.y - 1);
      expect(p.y, `${id}: rótulo na linha do ponto, ${contexto}`).toBeLessThanOrEqual(r.y + r.altura + 1);
      expect(distanciaAoRetangulo(p, r), `${id}: rótulo junto do ponto, ${contexto}`).toBeLessThanOrEqual(
        PINO + 1,
      );
    }
  }
  expect(
    Math.min(foret.y + foret.altura, grotte.y + grotte.altura) - Math.max(foret.y, grotte.y),
    `uma por cima da outra, ${contexto}`,
  ).toBeGreaterThan(0);
  // Viradas para o mesmo lado (as duas a descer dos pontos, ou as duas a subir): nunca em diagonal.
  const rF = rotuloNoMapa(foret, 'himeling-foret');
  const rG = rotuloNoMapa(grotte, 'himeling-grotte');
  if (rF && rG) {
    const emCima = (g: GrupoDisposto, r: Retangulo) => r.y + r.altura / 2 < g.y + g.altura / 2;
    expect(emCima(foret, rF), `viradas para o mesmo lado, ${contexto}`).toBe(emCima(grotte, rG));
  }
  return true;
}

describe('locais vizinhos lado a lado: Himeling (Forêt à esquerda, Grotte à direita)', () => {
  const ZOOMS_9_A_15 = Array.from({ length: 25 }, (_, i) => 9 + i * 0.25);
  const CAMADAS = {
    todas: { casas: true, carrinhas: true, obras: true },
    'só casas': { casas: true, carrinhas: false, obras: true },
    'só carrinhas': { casas: false, carrinhas: true, obras: true },
  } as const;

  it('as duas ruas (a 360 m) são vizinhas; mais nenhum local tem vizinhos', () => {
    const grupos = gruposReais('tipica');
    const pontos = grupos.map((g) => projetarArredondado(g.lat, g.lng, 11));
    const viz = vizinhancas(grupos, pontos);
    expect([...viz.keys()].sort()).toEqual(['himeling-foret', 'himeling-grotte']);
    const foret = grupos.find((g) => g.localId === 'himeling-foret') as GrupoNoMapa;
    const grotte = grupos.find((g) => g.localId === 'himeling-grotte') as GrupoNoMapa;
    expect(distanciaMetros(foret, grotte)).toBeLessThan(DISTANCIA_VIZINHOS_M);
    // A Forêt é a mais a norte, mas também a mais a oeste: fica à esquerda.
    expect(foret.lat).toBeGreaterThan(grotte.lat);
    expect(viz.get('himeling-foret')).toMatchObject({
      vizinhos: ['himeling-grotte'],
      lado: { lado: 'esquerda' },
    });
    expect(viz.get('himeling-grotte')).toMatchObject({
      vizinhos: ['himeling-foret'],
      lado: { lado: 'direita' },
    });
  });

  it('com a mesma longitude, o mais a norte fica à esquerda', () => {
    const local = (localId: string, lat: number): GrupoNoMapa => ({
      localId,
      nome: localId,
      lat,
      lng: 6,
      casas: [{ id: localId, nLugares: 4 }],
      carrinhas: [],
      obras: [],
    });
    const grupos = [local('sul', 49.5), local('norte', 49.502)];
    const viz = vizinhancas(
      grupos,
      grupos.map((g) => projetarArredondado(g.lat, g.lng, 12)),
    );
    expect(viz.get('norte')?.lado?.lado).toBe('esquerda');
    expect(viz.get('sul')?.lado?.lado).toBe('direita');
  });

  for (const [nome, camadas] of Object.entries(CAMADAS)) {
    it(`${nome}: em todos os zooms de 9 a 15, cada rua do seu lado dos dois pontos (coordenadas reais)`, () => {
      const grupos = gruposReais('tipica', camadas);
      let ladoALado = 0;
      for (const zoom of ZOOMS_9_A_15) {
        for (const tamanho of [
          { larguraMapa: 1568, alturaMapa: 1004 },
          { larguraMapa: 1568, alturaMapa: 871 },
          { larguraMapa: 375, alturaMapa: 600 },
        ]) {
          if (ruasLadoALado(disporMapa(grupos, { zoom, ...tamanho }), `zoom ${zoom}, ${tamanho.larguraMapa}`))
            ladoALado++;
        }
      }
      // Afastado (resumo) são uma só pastilha; com os nomes, sempre lado a lado.
      expect(ladoALado).toBeGreaterThan(50);
    });
  }

  it('abertas à mão (resumo e compacto), cada rua tem o seu bloco, do seu lado (abrem e fecham juntas)', () => {
    for (const camadas of Object.values(CAMADAS)) {
      const grupos = gruposReais('tipica', camadas);
      for (const zoom of [9, 9.5, 10, 10.25]) {
        for (const chave of ['grupo:himeling-foret', 'grupo:himeling-grotte']) {
          const d = disporMapa(grupos, {
            zoom,
            larguraMapa: 1568,
            alturaMapa: 1004,
            expandidos: new Set([chave]),
          });
          expect(d.modo).not.toBe('completo');
          expect(ruasLadoALado(d, `aberto ${chave}, zoom ${zoom}`)).toBe(true);
          verificar(d);
          for (const id of ['himeling-foret', 'himeling-grotte']) {
            expect(blocoDe(d, id).chavesAbertura.sort()).toEqual([
              'grupo:himeling-foret',
              'grupo:himeling-grotte',
            ]);
          }
        }
      }
    }
  });

  it('só carrinhas, um passo de zoom acima da vista inicial: as duas ruas encostadas aos pontos, nada no meio', () => {
    // Weiler fica logo acima e à esquerda de Himeling: as duas ruas não cabem a subir dos pontos. Antes,
    // a primeira a pôr-se subia sozinha e a outra ficava afastada (até ~120 px), com as carrinhas de
    // Weiler entre as duas; agora as duas descem juntas dos pontos (colisoes.ts, porPar).
    const grupos = gruposReais('tipica', { casas: false, carrinhas: true, obras: true });
    for (const [zoom, larguraMapa, alturaMapa] of [
      [11.25, 1568, 1004],
      [11, 1568, 871],
      [10.5, 1280, 620],
      [10.75, 900, 700],
    ] as const) {
      const d = disporMapa(grupos, { zoom, larguraMapa, alturaMapa });
      const contexto = `zoom ${zoom}, ${larguraMapa}×${alturaMapa}`;
      expect(ruasLadoALado(d, contexto)).toBe(true);
      verificar(d);
      const foret = blocoDe(d, 'himeling-foret');
      const grotte = blocoDe(d, 'himeling-grotte');
      const meio = {
        x: foret.x + foret.largura,
        y: Math.max(foret.y, grotte.y),
        largura: grotte.x - (foret.x + foret.largura),
        altura: Math.min(foret.y + foret.altura, grotte.y + grotte.altura) - Math.max(foret.y, grotte.y),
      };
      for (const g of d.grupos) {
        if (g === foret || g === grotte) continue;
        expect(sobrepoem(retangulo(g), meio), `${g.chave} entre as duas ruas, ${contexto}`).toBe(false);
      }
    }
  });

  it('também com todas as carrinhas em Himeling (o pior caso)', () => {
    for (const distribuicao of ['himeling', 'grotte'] as const) {
      const grupos = gruposReais(distribuicao);
      for (const zoom of [10.5, 11, 12, 13, 14, 15]) {
        const d = disporMapa(grupos, { zoom, larguraMapa: 1568, alturaMapa: 1004 });
        expect(ruasLadoALado(d, `${distribuicao}, zoom ${zoom}`)).toBe(true);
        verificar(d);
      }
    }
  });

  it('as casas de cada rua ficam numa grelha 2×2', () => {
    const d = disporMapa(gruposReais('tipica'), { zoom: 11, larguraMapa: 1568, alturaMapa: 1004 });
    for (const id of ['himeling-foret', 'himeling-grotte']) {
      const g = blocoDe(d, id);
      if (g.modo !== 'completo') throw new Error('sem cartões');
      const casas = g.arrumacao.cartoes.filter((c) => c.geometria.tipo === 'casa');
      expect(casas).toHaveLength(4);
      expect(new Set(casas.map((c) => c.x)).size).toBe(2);
      expect(new Set(casas.map((c) => c.y + c.geometria.altura)).size).toBe(2);
    }
  });
});
