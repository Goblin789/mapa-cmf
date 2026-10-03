// Cartões do mapa desenhados para texto (react-dom/server), com o estado FICTÍCIO dos testes do layout:
// o condutor em primeiro com o volante, o tooltip da carrinha compacta, as casas sempre cheias e o botão de
// fechar de um bloco com vizinho.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { indexar } from '../../../dominio/indices';
import type { Estado } from '../../../dominio/tipos';
import { useLoja } from '../../estado/loja';
import type { GrupoDisposto } from '../layout/disposicao';
import { estadoFicticio } from '../layout/estadoFicticioTeste';
import type { GrupoNoMapa } from '../layout/grupos';
import { geometriaCarrinha, geometriaCasa } from '../layout/medidas';
import { BlocoLocal } from './BlocoLocal';
import { CartaoCarrinha } from './CartaoCarrinha';
import { CartaoCasa } from './CartaoCasa';

// Ao desenhar para texto, o Zustand lê o estado INICIAL da loja (o "snapshot" do servidor, em
// useSyncExternalStore), não o atual: os testes põem lá o estado fictício e repõem-no no fim.
const inicial = useLoja.getInitialState();
const original = { estado: inicial.estado, indices: inicial.indices };

function comEstado(mudar: (e: Estado) => Estado) {
  const estado = mudar(estadoFicticio());
  Object.assign(inicial, { estado, indices: indexar(estado) });
}

/** Ids das pessoas pela ordem em que aparecem no cartão. */
function ordem(html: string): string[] {
  return [...html.matchAll(/data-pessoa-id="([^"]+)"/g)].map((m) => m[1] as string);
}

afterEach(() => {
  Object.assign(inicial, original);
});

describe('carrinha: o condutor sempre em primeiro, com o volante', () => {
  // Na V2 vão as Pessoas 01, 02, 03 e 06; o condutor é a última por ordem alfabética.
  const comCondutor = (e: Estado): Estado => ({
    ...e,
    carrinhas: e.carrinhas.map((c) => (c.id === 'V2' ? { ...c, condutorId: 'p6' } : c)),
  });

  it('na primeira linha, só ele com o volante; os outros pela ordem dos nomes', () => {
    comEstado(comCondutor);
    const g = geometriaCarrinha(9);
    const html = renderToStaticMarkup(
      createElement(CartaoCarrinha, {
        carrinhaId: 'V2',
        geometria: g,
        x: 0,
        y: 0,
        confianca: 'sugerida',
        destaque: null,
      }),
    );
    expect(ordem(html)).toEqual(['p6', 'p1', 'p2', 'p3']);
    expect(html.match(/aria-label="condutor"/g)).toHaveLength(1);
    const primeiro = html.slice(html.indexOf('data-pessoa-id="p6"'), html.indexOf('data-pessoa-id="p1"'));
    expect(primeiro).toContain('aria-label="condutor"');
  });

  it('sem condutor, ninguém leva o volante', () => {
    comEstado((e) => e);
    const html = renderToStaticMarkup(
      createElement(CartaoCarrinha, {
        carrinhaId: 'V2',
        geometria: geometriaCarrinha(9),
        x: 0,
        y: 0,
        confianca: 'sugerida',
        destaque: null,
      }),
    );
    expect(ordem(html)).toEqual(['p1', 'p2', 'p3', 'p6']);
    expect(html).not.toContain('aria-label="condutor"');
  });

  it('compacta (sem os nomes): o tooltip começa pelo condutor', () => {
    comEstado(comCondutor);
    const html = renderToStaticMarkup(
      createElement(CartaoCarrinha, {
        carrinhaId: 'V2',
        geometria: geometriaCarrinha(9, true),
        x: 0,
        y: 0,
        confianca: 'sugerida',
        destaque: null,
      }),
    );
    expect(ordem(html)).toEqual([]);
    expect(html).toContain('Vão: Pessoa 06 (condutor), Pessoa 01, Pessoa 02, Pessoa 03');
  });

  it('desenha as quatro rodas', () => {
    comEstado((e) => e);
    const html = renderToStaticMarkup(
      createElement(CartaoCarrinha, {
        carrinhaId: 'V2',
        geometria: geometriaCarrinha(9),
        x: 0,
        y: 0,
        confianca: 'sugerida',
        destaque: null,
      }),
    );
    expect(html.match(/fill="#1e293b"/g)).toHaveLength(4);
  });
});

describe('bloco aberto à mão de um local com vizinho', () => {
  it('o botão de fechar diz que fecha os dois (abrem e fecham juntos)', () => {
    comEstado((e) => e);
    const l1: GrupoNoMapa = {
      localId: 'L1',
      nome: 'Local L1',
      lat: 49.6,
      lng: 6.1,
      casas: [],
      carrinhas: [],
      obras: [],
    };
    const disposto: GrupoDisposto = {
      chave: 'grupo:L1',
      locais: [l1],
      pontos: [{ x: 0, y: 0 }],
      x: 0,
      y: 0,
      largura: 10,
      altura: 10,
      escala: 1,
      deslocado: false,
      chavesAbertura: ['grupo:L1', 'grupo:L2'],
      modo: 'completo',
      arrumacao: { largura: 10, altura: 10, cartoes: [], rotulos: [] },
    };
    const html = renderToStaticMarkup(
      createElement(BlocoLocal, { disposto, esquerda: 0, topo: 0, aberto: true, destaqueDe: () => null }),
    );
    expect(html).toContain('aria-label="Fechar Local L1 e Local L2 (voltar à vista resumida)"');
  });
});

describe('casa que conta sempre como cheia', () => {
  // C3: lotação 3, com um só morador.
  const desenhar = () =>
    renderToStaticMarkup(
      createElement(CartaoCasa, { casaId: 'C3', geometria: geometriaCasa(1), x: 0, y: 0, destaque: null }),
    );

  it('sem lugares vazios: a pastilha mostra n/n', () => {
    comEstado((e) => ({
      ...e,
      casas: e.casas.map((c) => (c.id === 'C3' ? { ...c, sempreCheia: true } : c)),
    }));
    const html = desenhar();
    expect(html).not.toContain('lugar-vazio');
    expect(html).toContain('1/1');
    expect(html).toContain('conta sempre como cheia');
  });

  it('uma casa normal mostra os lugares vazios', () => {
    comEstado((e) => e);
    const html = renderToStaticMarkup(
      createElement(CartaoCasa, { casaId: 'C3', geometria: geometriaCasa(3), x: 0, y: 0, destaque: null }),
    );
    expect(html.match(/lugar-vazio/g)).toHaveLength(2);
    expect(html).toContain('1/3');
  });
});

describe('carro: desenhado como um carro visto de cima', () => {
  const comCarro = (e: Estado): Estado => ({
    ...e,
    carrinhas: e.carrinhas.map((c) =>
      c.id === 'V2' ? { ...c, tipo: 'carro', marca: 'Marca Fictícia', modelo: 'Modelo X', lugares: 5 } : c,
    ),
  });
  const desenhar = (compacta: boolean) =>
    renderToStaticMarkup(
      createElement(CartaoCarrinha, {
        carrinhaId: 'V2',
        geometria: geometriaCarrinha(5, compacta, 'carro'),
        x: 0,
        y: 0,
        confianca: 'definida',
        destaque: null,
      }),
    );

  it('quatro rodas, para-brisas e vidro de trás; os nomes um por linha, como na carrinha', () => {
    comEstado(comCarro);
    const html = desenhar(false);
    expect(html.match(/<rect [^>]*fill="#1e293b"/g)).toHaveLength(4);
    expect(html).toContain('class="vidros-carro"');
    expect(ordem(html)).toEqual(['p1', 'p2', 'p3', 'p6']);
    expect(html).toContain('Mostrar as ligações deste carro.');
  });

  it('o tooltip diz que é um carro, com a marca e o modelo (também no compacto, com quem vai)', () => {
    comEstado(comCarro);
    expect(desenhar(false)).toContain('title="Carro ZZ 2000 · Marca Fictícia Modelo X · 4/5 lugares');
    const compacto = desenhar(true);
    expect(compacto).toContain('title="Carro ZZ 2000 · Marca Fictícia Modelo X · 4/5 lugares');
    expect(compacto).toContain('Vão: Pessoa 01, Pessoa 02, Pessoa 03, Pessoa 06');
    expect(ordem(compacto)).toEqual([]);
  });

  it('a carrinha continua sem vidro de trás e o tooltip começa por "Carrinha"', () => {
    comEstado((e) => ({
      ...e,
      carrinhas: e.carrinhas.map((c) =>
        c.id === 'V2' ? { ...c, marca: 'Marca Fictícia', modelo: 'Modelo Y' } : c,
      ),
    }));
    const html = renderToStaticMarkup(
      createElement(CartaoCarrinha, {
        carrinhaId: 'V2',
        geometria: geometriaCarrinha(9),
        x: 0,
        y: 0,
        confianca: 'definida',
        destaque: null,
      }),
    );
    expect(html).not.toContain('vidros-carro');
    expect(html).toContain('title="Carrinha ZZ 2000 · Marca Fictícia Modelo Y · 4/9 lugares');
    expect(html).toContain('Mostrar as ligações desta carrinha.');
  });
});
