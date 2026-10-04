import { afterEach, describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import { useLoja } from '../estado/loja';
import { ZOOM_DESTINO } from '../paineis/fichas';
import { estadoVistas } from './estadoTeste';
import {
  chaveElemento,
  deslocamentoForaDaFicha,
  mostrarElemento,
  seguirPessoaEmFoco,
  seletorElementos,
  usePedidoMostrar,
} from './mostrar';
import { useVista } from './vista';

describe('chaveElemento e seletorElementos', () => {
  it('a chave junta o tipo e o id', () => {
    expect(chaveElemento({ tipo: 'pessoa', id: 'p1' })).toBe('pessoa:p1');
    expect(chaveElemento({ tipo: 'casa', id: 'c-2' })).toBe('casa:c-2');
    expect(chaveElemento({ tipo: 'carrinha', id: 'ZZ1001' })).toBe('carrinha:ZZ1001');
    expect(chaveElemento({ tipo: 'obra', id: 'obra-1' })).toBe('obra:obra-1');
  });

  it('o seletor procura o data-elemento de cada chave, com aspas escapadas', () => {
    expect(seletorElementos(['casa:c1', 'pessoa:p1'])).toBe(
      '[data-elemento="casa:c1"],[data-elemento="pessoa:p1"]',
    );
    expect(seletorElementos(['pessoa:a"b'])).toBe('[data-elemento="pessoa:a\\"b"]');
  });
});

describe('mostrarElemento', () => {
  afterEach(() => {
    useVista.setState({ vista: 'mapa', reuniao: false });
    useLoja.setState({ foco: null, irPara: null, indices: null, dormidas: null });
    usePedidoMostrar.setState({ pedido: null });
  });

  it('na Tabela e no Quadro põe em foco e deixa um pedido para a vista, sem mudar de vista', () => {
    useVista.setState({ vista: 'tabela' });
    mostrarElemento({ tipo: 'pessoa', id: 'p1' }, { noMapa: 'ir' });
    expect(useLoja.getState().foco).toEqual({ tipo: 'pessoa', id: 'p1' });
    expect(usePedidoMostrar.getState().pedido).toEqual({ elemento: { tipo: 'pessoa', id: 'p1' }, seq: 1 });
    expect(useLoja.getState().irPara).toBeNull();
    expect(useVista.getState().vista).toBe('tabela');

    useVista.setState({ vista: 'quadro' });
    mostrarElemento({ tipo: 'pessoa', id: 'p1' });
    // O mesmo elemento outra vez é um pedido novo (a vista volta a deslizar até lá).
    expect(usePedidoMostrar.getState().pedido?.seq).toBe(2);
    expect(useVista.getState().vista).toBe('quadro');
  });

  it('no Mapa não deixa pedido às outras vistas; sem dados não leva o mapa a lado nenhum', () => {
    mostrarElemento({ tipo: 'casa', id: 'c1' }, { noMapa: 'ir' });
    expect(useLoja.getState().foco).toEqual({ tipo: 'casa', id: 'c1' });
    expect(usePedidoMostrar.getState().pedido).toBeNull();
    expect(useLoja.getState().irPara).toBeNull();
    expect(useVista.getState().vista).toBe('mapa');
  });

  it('no Mapa, com dados, "ir" leva o mapa até lá (como a pesquisa sempre fez) e "so-foco" não', () => {
    const estado = estadoVistas();
    const indices = indexar(estado);
    useLoja.setState({ indices, dormidas: dormidasDasCarrinhas(estado, indices) });

    // Casa: o local da casa (Casa L1 fica na Rua Leste da Vila Fictícia).
    mostrarElemento({ tipo: 'casa', id: 'casa-l1' }, { noMapa: 'ir' });
    expect(useLoja.getState().irPara).toEqual({ lat: 49.492, lng: 6.243, zoom: ZOOM_DESTINO, seq: 1 });
    expect(useLoja.getState().foco).toEqual({ tipo: 'casa', id: 'casa-l1' });

    // Carrinha: onde dorme (a XX1003 dorme no Parque Norte).
    mostrarElemento({ tipo: 'carrinha', id: 'XX1003' }, { noMapa: 'ir' });
    expect(useLoja.getState().irPara).toEqual({ lat: 49.75, lng: 6.2, zoom: ZOOM_DESTINO, seq: 2 });

    // As ligações da ficha só mudam o foco: o mapa fica onde está.
    mostrarElemento({ tipo: 'casa', id: 'casa-a' }, { noMapa: 'so-foco' });
    expect(useLoja.getState().foco).toEqual({ tipo: 'casa', id: 'casa-a' });
    expect(useLoja.getState().irPara?.seq).toBe(2);
    expect(usePedidoMostrar.getState().pedido).toBeNull();
    expect(useVista.getState().vista).toBe('mapa');
  });

  it('na reunião, no Quadro, deixa o pedido ao Quadro e não mexe no mapa escondido', () => {
    const estado = estadoVistas();
    const indices = indexar(estado);
    useLoja.setState({ indices, dormidas: dormidasDasCarrinhas(estado, indices) });
    useVista.setState({ vista: 'quadro', reuniao: true });
    mostrarElemento({ tipo: 'casa', id: 'casa-l1' }, { noMapa: 'ir' });
    expect(usePedidoMostrar.getState().pedido?.elemento).toEqual({ tipo: 'casa', id: 'casa-l1' });
    expect(useLoja.getState().irPara).toBeNull();
    expect(useVista.getState()).toMatchObject({ vista: 'quadro', reuniao: true });
  });
});

describe('seguirPessoaEmFoco (nomes dentro da ficha da vista)', () => {
  afterEach(() => {
    useVista.setState({ vista: 'mapa', reuniao: false });
    useLoja.setState({ foco: null });
    usePedidoMostrar.setState({ pedido: null });
  });

  it('na Tabela e no Quadro, a pessoa que ficou em foco é levada à vista', () => {
    useVista.setState({ vista: 'tabela' });
    useLoja.setState({ foco: { tipo: 'pessoa', id: 'p1' } });
    expect(seguirPessoaEmFoco('p1')).toBe(true);
    expect(usePedidoMostrar.getState().pedido).toEqual({ elemento: { tipo: 'pessoa', id: 'p1' }, seq: 1 });

    useVista.setState({ vista: 'quadro' });
    expect(seguirPessoaEmFoco('p1')).toBe(true);
    expect(usePedidoMostrar.getState().pedido?.seq).toBe(2);
    expect(useVista.getState().vista).toBe('quadro');
  });

  it('não faz nada se o clique tirou o foco ou o pôs noutro sítio', () => {
    useVista.setState({ vista: 'quadro' });
    expect(seguirPessoaEmFoco('p1')).toBe(false);
    useLoja.setState({ foco: { tipo: 'pessoa', id: 'p2' } });
    expect(seguirPessoaEmFoco('p1')).toBe(false);
    useLoja.setState({ foco: { tipo: 'casa', id: 'p1' } });
    expect(seguirPessoaEmFoco('p1')).toBe(false);
    expect(usePedidoMostrar.getState().pedido).toBeNull();
  });

  it('no Mapa não deixa pedido (lá os nomes da ficha só mudam o foco, como sempre)', () => {
    useLoja.setState({ foco: { tipo: 'pessoa', id: 'p1' } });
    expect(seguirPessoaEmFoco('p1')).toBe(false);
    expect(usePedidoMostrar.getState().pedido).toBeNull();
  });
});

describe('deslocamentoForaDaFicha', () => {
  // Contentor da vista de 100 a 700 px (600 de altura), 0 a 1000 na horizontal.
  const contentor = { top: 100, bottom: 700, left: 0, right: 1000 };
  const ret = (top: number, altura: number, left = 0, largura = 200) => ({
    top,
    bottom: top + altura,
    left,
    right: left + largura,
  });

  it('sem ficha, ou com a ficha noutra coluna, basta centrar no contentor', () => {
    expect(deslocamentoForaDaFicha(ret(900, 100), contentor, null)).toBeNull();
    // Ficha do PC em cima à direita; o bloco está à esquerda.
    expect(deslocamentoForaDaFicha(ret(900, 100), contentor, ret(108, 350, 640, 352))).toBeNull();
  });

  it('telemóvel: a ficha ocupa a parte de baixo, o elemento fica ao centro da parte de cima', () => {
    const ficha = { top: 340, bottom: 692, left: 8, right: 367 }; // de 340 para baixo
    // Elemento de 40 px em 900: centro em 920; faixa livre 100–340, centro em 220.
    expect(deslocamentoForaDaFicha(ret(900, 40, 8, 359), contentor, ficha)).toBe(700);
  });

  it('se não couber na faixa, fica com o topo no topo dela (vê-se o título do bloco)', () => {
    const ficha = { top: 340, bottom: 692, left: 8, right: 367 };
    expect(deslocamentoForaDaFicha(ret(900, 400, 8, 359), contentor, ficha)).toBe(900 - 116);
  });

  it('PC: um bloco atrás da ficha (em cima à direita) vai para a faixa por baixo dela', () => {
    const ficha = ret(108, 300, 640, 352); // 108–408: livre por baixo de 408 a 700
    expect(deslocamentoForaDaFicha(ret(120, 100, 700), contentor, ficha)).toBe(170 - 554);
  });

  it('uma faixa pequena demais não serve: centra-se no contentor', () => {
    const ficha = ret(108, 585, 640, 352); // quase toda a altura
    expect(deslocamentoForaDaFicha(ret(120, 30, 700), contentor, ficha)).toBeNull();
  });
});
