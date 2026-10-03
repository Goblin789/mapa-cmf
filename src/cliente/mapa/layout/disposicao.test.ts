import { describe, expect, it } from 'vitest';
import { DISTRIBUICOES, gruposReais, todasAsChaves } from './cenariosTeste';
import { MARGEM_COLISAO } from './colisoes';
import {
  type Disposicao,
  disporMapa,
  linhasChamada,
  medirGrupo,
  nivelDoCartao,
  RAIO_ANCORAS,
} from './disposicao';
import { contem, type Retangulo, sobrepoem } from './geometria';
import type { GrupoNoMapa } from './grupos';
import { type NivelDetalhe, nivelDetalhe } from './niveis';

const ZOOMS = Array.from({ length: (14 - 9) / 0.25 + 1 }, (_, i) => 9 + i * 0.25);

function retanguloDoGrupo(g: Disposicao['grupos'][number]): Retangulo {
  return { x: g.x, y: g.y, largura: g.largura, altura: g.altura };
}

/** Nenhum grupo se sobrepõe a outro e cada casa/carrinha fica dentro do seu grupo, sem se sobreporem. */
function verificarSemSobreposicoes(d: Disposicao) {
  const grupos = d.grupos.map(retanguloDoGrupo);
  for (let i = 0; i < grupos.length; i++) {
    for (let j = i + 1; j < grupos.length; j++) {
      expect(sobrepoem(grupos[i] as Retangulo, grupos[j] as Retangulo, MARGEM_COLISAO), `${d.zoom}`).toBe(
        false,
      );
    }
  }
  // Nenhum cartão tapa o ponto do local real de outro grupo.
  for (const g of d.grupos) {
    for (const h of d.grupos) {
      if (g === h) continue;
      const ponto = {
        x: h.ancora.x - RAIO_ANCORAS,
        y: h.ancora.y - RAIO_ANCORAS,
        largura: 2 * RAIO_ANCORAS,
        altura: 2 * RAIO_ANCORAS,
      };
      expect(sobrepoem(retanguloDoGrupo(g), ponto), `${g.chave} tapa ${h.chave} (zoom ${d.zoom})`).toBe(
        false,
      );
    }
  }
  for (const g of d.grupos) {
    if (g.modo !== 'cartao') continue;
    const filhos = g.geometria.filhos.map((f) => ({
      x: g.x + f.x,
      y: g.y + f.y,
      largura: f.geometria.largura,
      altura: f.geometria.altura,
    }));
    for (let i = 0; i < filhos.length; i++) {
      const a = filhos[i] as Retangulo;
      expect(
        a.x >= g.x && a.y >= g.y && a.x + a.largura <= g.x + g.largura && a.y + a.altura <= g.y + g.altura,
      ).toBe(true);
      for (let j = i + 1; j < filhos.length; j++) expect(sobrepoem(a, filhos[j] as Retangulo)).toBe(false);
    }
  }
}

describe('disposição com as coordenadas e lotações reais (sem dados pessoais)', () => {
  for (const distribuicao of DISTRIBUICOES) {
    const grupos = gruposReais(distribuicao);

    it(`sem sobreposições do zoom 9 ao 14 (carrinhas: ${distribuicao})`, () => {
      for (const zoom of ZOOMS) {
        for (const largura of [375, 1600]) {
          verificarSemSobreposicoes(
            disporMapa(grupos, { zoom, nivel: nivelDetalhe(zoom, largura), expandidos: new Set() }),
          );
        }
      }
    });

    it(`sem sobreposições com todos os cartões abertos (carrinhas: ${distribuicao})`, () => {
      const expandidos = todasAsChaves(grupos);
      for (const zoom of ZOOMS) {
        verificarSemSobreposicoes(disporMapa(grupos, { zoom, nivel: nivelDetalhe(zoom), expandidos }));
      }
    });
  }

  it('os dois locais de Himeling (a ~360 m) nunca ficam um em cima do outro', () => {
    const grupos = gruposReais('himeling');
    for (const zoom of ZOOMS) {
      const d = disporMapa(grupos, { zoom, nivel: nivelDetalhe(zoom), expandidos: new Set() });
      const grotte = d.grupos.find((g) => g.grupo.localId === 'himeling-grotte');
      const foret = d.grupos.find((g) => g.grupo.localId === 'himeling-foret');
      expect(grotte && foret).toBeTruthy();
      expect(sobrepoem(retanguloDoGrupo(grotte as never), retanguloDoGrupo(foret as never))).toBe(false);
    }
  });

  it('cada cartão tem o seu retângulo e os lugares desenhados', () => {
    const grupos = gruposReais('roda');
    const d = disporMapa(grupos, { zoom: 11, nivel: 'lugares', expandidos: new Set() });
    for (const g of grupos) {
      for (const c of g.casas) {
        const cartao = d.cartoes.get(`casa:${c.id}`);
        expect(cartao?.lugares).toHaveLength(c.nLugares);
        for (const l of cartao?.lugares ?? []) expect(contem(cartao?.retangulo as Retangulo, l)).toBe(true);
      }
      for (const v of g.carrinhas)
        expect(d.cartoes.get(`carrinha:${v.id}`)?.lugares).toHaveLength(v.nLugares);
    }
  });

  it('as linhas de chamada saem do local real e chegam à borda do cartão deslocado', () => {
    const grupos = gruposReais('himeling');
    const d = disporMapa(grupos, { zoom: 11, nivel: 'lugares', expandidos: new Set() });
    const linhas = linhasChamada(d);
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) {
      const g = d.grupos.find((x) => x.chave === l.chave);
      expect(g?.deslocado).toBe(true);
      expect(l.de).toEqual(g?.ancora);
      const r = retanguloDoGrupo(g as never);
      expect(contem(r, l.para)).toBe(true);
      expect(contem(r, l.de)).toBe(false);
    }
  });
});

describe('níveis e cartões abertos', () => {
  const grupo: GrupoNoMapa = {
    localId: 'L1',
    nome: 'Local',
    lat: 49.6,
    lng: 6.1,
    casas: [{ id: 'C1', nLugares: 6, comAviso: false }],
    carrinhas: [{ id: 'V1', nLugares: 9, confianca: 'sugerida' }],
  };

  it('no resumo é uma pastilha, a não ser que o grupo (ou um cartão dele) esteja aberto', () => {
    expect(medirGrupo(grupo, 'resumo', new Set()).modo).toBe('resumo');
    expect(medirGrupo(grupo, 'resumo', new Set(['grupo:L1'])).modo).toBe('cartao');
    expect(medirGrupo(grupo, 'resumo', new Set(['carrinha:V1'])).modo).toBe('cartao');
    expect(medirGrupo(grupo, 'lugares', new Set()).modo).toBe('cartao');
  });

  it('um cartão aberto mostra os nomes em qualquer zoom', () => {
    const niveis: NivelDetalhe[] = ['resumo', 'lugares', 'nomes'];
    for (const nivel of niveis) {
      expect(nivelDoCartao(nivel, new Set(['casa:C1']), 'grupo:L1', 'casa:C1')).toBe('nomes');
      expect(nivelDoCartao(nivel, new Set(['grupo:L1']), 'grupo:L1', 'casa:C1')).toBe('nomes');
    }
    expect(nivelDoCartao('lugares', new Set(), 'grupo:L1', 'casa:C1')).toBe('lugares');
    expect(nivelDoCartao('nomes', new Set(), 'grupo:L1', 'casa:C1')).toBe('nomes');
  });

  it('abrir um cartão alarga o grupo; o tamanho não depende de mais nada', () => {
    const fechado = medirGrupo(grupo, 'lugares', new Set());
    const aberto = medirGrupo(grupo, 'lugares', new Set(['casa:C1']));
    expect(aberto.geometria.altura * aberto.geometria.largura).toBeGreaterThan(
      fechado.geometria.altura * fechado.geometria.largura,
    );
    expect(medirGrupo(grupo, 'lugares', new Set())).toEqual(fechado);
  });

  it('no resumo, as casas e carrinhas apontam para a pastilha do grupo', () => {
    const d = disporMapa([grupo], { zoom: 9, nivel: 'resumo', expandidos: new Set() });
    const pastilha = d.cartoes.get('grupo:L1')?.retangulo;
    expect(d.cartoes.get('casa:C1')?.retangulo).toEqual(pastilha);
    expect(d.cartoes.get('carrinha:V1')?.lugares).toBeNull();
  });
});
