import { describe, expect, it } from 'vitest';
import { DISTRIBUICOES, gruposReais } from './cenariosTeste';
import { distanciaAoRetangulo, MARGEM_COLISAO, PINO, RAIO_PONTOS } from './colisoes';
import {
  areaDesenhada,
  areaPrevista,
  chavesPrincipais,
  type Disposicao,
  disporMapa,
  limiteDoEcra,
  linhasChamada,
  retanguloDoLocal,
  rotuloDoLocal,
  rotuloNoMapa,
} from './disposicao';
import { ESCALA_MINIMA } from './escala';
import { contextoFicticio } from './estadoFicticioTeste';
import { type Retangulo, sobrepoem } from './geometria';
import { chaveGrupo, type GrupoNoMapa, montarModelo } from './grupos';
import { desprojetar } from './projecao';

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
    // A rua mais a norte (Forêt) fica por cima da outra.
    const foret = d.grupos.find((x) => x.locais[0]?.localId === 'himeling-foret');
    const grotte = d.grupos.find((x) => x.locais[0]?.localId === 'himeling-grotte');
    expect((foret?.y ?? 0) + (foret?.altura ?? 0)).toBeLessThanOrEqual(grotte?.y ?? 0);
  });

  it('modo de edição: com a disposição anterior, uma casa que cresce uma linha não faz saltar os outros blocos', () => {
    const opcoes = { zoom: 11, larguraMapa: 1568, alturaMapa: 1030 };
    const antes = gruposReais('tipica');
    // Alguém largado em Steinsel (12/12): a casa passa a desenhar 13 lugares (mais uma linha).
    const depois = antes.map((g) =>
      g.localId === 'steinsel' ? { ...g, casas: g.casas.map((c) => ({ ...c, nLugares: 13 })) } : g,
    );
    const d0 = disporMapa(antes, opcoes);
    const sitio = (d: Disposicao) => new Map(d.grupos.map((g) => [g.chave, `${g.x},${g.y}`]));
    // Sem a anterior, a colocação refaz-se toda e outros blocos mudam de sítio (era o que acontecia).
    const refeita = sitio(disporMapa(depois, opcoes));
    const mudaram = [...sitio(d0)].filter(([k, v]) => k !== 'grupo:steinsel' && refeita.get(k) !== v);
    expect(mudaram.length).toBeGreaterThan(0);
    // Com a anterior, só Steinsel pode mudar; o resto fica exatamente onde estava, sem sobreposições.
    const d1 = disporMapa(depois, { ...opcoes, anterior: d0 });
    verificar(d1);
    const s1 = sitio(d1);
    for (const [k, v] of sitio(d0)) if (k !== 'grupo:steinsel') expect(s1.get(k), k).toBe(v);
    expect(d1.cartoes.get('casa:steinsel')?.lugares?.length).toBe(13);
    // Nada mudou: fica tudo igual (também é o que se vê ao entrar no modo de edição).
    expect(sitio(disporMapa(antes, { ...opcoes, anterior: d0 }))).toEqual(sitio(d0));
  });

  it('modo de edição: a barra da edição (mapa 45 px mais baixo) não faz saltar os blocos', () => {
    const antes = gruposReais('tipica');
    const d0 = disporMapa(antes, { zoom: 11, larguraMapa: 1568, alturaMapa: 1029 });
    const sitio = (d: Disposicao) => new Map(d.grupos.map((g) => [g.chave, `${g.x},${g.y}`]));
    const maisBaixo = { zoom: 11, larguraMapa: 1568, alturaMapa: 984 };
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
