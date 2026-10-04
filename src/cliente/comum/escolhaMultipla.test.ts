import { describe, expect, it } from 'vitest';
import {
  alternarEscolha,
  escolherTodas,
  filtrarOpcoes,
  GRUPO_ESPECIAIS,
  type OpcaoFiltro,
  passaFiltro,
  posicaoPainel,
  proximaCaixa,
  rotuloBotao,
  seccionarOpcoes,
  temOpcoesAtivas,
  todasEscolhidas,
} from './escolhaMultipla';

// Dados fictícios.
const CASAS: OpcaoFiltro[] = [
  { valor: 'c1', rotulo: 'Casa 1 Exemplo', detalhe: 'Vila Nova', contagem: 4 },
  { valor: 'c2', rotulo: 'Casa 2 Ação', contagem: 0 },
  { valor: 'c3', rotulo: 'Casa 3 Teste', termos: 'antiga casa do rio' },
  { valor: 'sem', rotulo: 'Fora das casas CMF', grupo: GRUPO_ESPECIAIS },
];

const conj = (...v: string[]) => new Set(v);

describe('passaFiltro', () => {
  it('sem escolhas passa tudo, até sem valor', () => {
    expect(passaFiltro(conj(), 'c1')).toBe(true);
    expect(passaFiltro(conj(), null)).toBe(true);
  });

  it('com escolhas é OU entre elas', () => {
    expect(passaFiltro(conj('c1', 'c2'), 'c2')).toBe(true);
    expect(passaFiltro(conj('c1', 'c2'), 'c3')).toBe(false);
    expect(passaFiltro(conj('c1'), null)).toBe(false);
  });

  it('com vários valores passa se algum estiver escolhido', () => {
    expect(passaFiltro(conj('x'), ['a', 'x'])).toBe(true);
    expect(passaFiltro(conj('x'), ['a', null])).toBe(false);
    expect(passaFiltro(conj('x'), [])).toBe(false);
  });
});

describe('rotuloBotao', () => {
  it('sem escolhas: "todas" ou "todos"', () => {
    expect(rotuloBotao('Casa', CASAS, conj()).texto).toBe('Casa: todas');
    expect(rotuloBotao('Cliente', CASAS, conj(), { genero: 'm' }).texto).toBe('Cliente: todos');
    expect(rotuloBotao('Casa', CASAS, conj()).numero).toBeNull();
    expect(rotuloBotao('Casa', CASAS, conj()).vazio).toBe(false);
  });

  it('uma escolha mostra o rótulo dela', () => {
    const r = rotuloBotao('Casa', CASAS, conj('c1'));
    expect(r.texto).toBe('Casa: Casa 1 Exemplo');
    expect(r.numero).toBeNull();
    expect(r.lista).toBe('Casa 1 Exemplo');
  });

  it('várias escolhas: o número, e a lista pela ordem das opções', () => {
    const r = rotuloBotao('Casa', CASAS, conj('sem', 'c2', 'c1'));
    expect(r.texto).toBe('Casa: 3 escolhidas');
    expect(r.numero).toBe(3);
    expect(r.lista).toBe('Casa 1 Exemplo, Casa 2 Ação, Fora das casas CMF');
    expect(rotuloBotao('Cliente', CASAS, conj('c1', 'c2'), { genero: 'm' }).texto).toBe(
      'Cliente: 2 escolhidos',
    );
  });

  it('uma escolha que já não existe conta na mesma', () => {
    expect(rotuloBotao('Casa', CASAS, conj('apagada')).texto).toBe('Casa: 1 escolhida');
    expect(rotuloBotao('Cliente', CASAS, conj('x'), { genero: 'm' }).texto).toBe('Cliente: 1 escolhido');
    expect(rotuloBotao('Casa', CASAS, conj('c1', 'apagada')).lista).toBe('Casa 1 Exemplo, apagada');
  });

  it('sem nada para escolher: o texto vazio e desativado', () => {
    const r = rotuloBotao('Obra', [], conj(), { textoVazio: 'sem obras' });
    expect(r.texto).toBe('Obra: sem obras');
    expect(r.vazio).toBe(true);
    const soDesativadas = [{ valor: 'x', rotulo: 'Sem obras', desativada: true }];
    expect(rotuloBotao('Obra', soDesativadas, conj(), { textoVazio: 'sem obras' }).vazio).toBe(true);
    expect(rotuloBotao('Obra', [], conj()).texto).toBe('Obra: sem opções');
  });

  it('com uma escolha antiga e sem opções não fica desativado (para se poder ver e limpar)', () => {
    expect(rotuloBotao('Obra', [], conj('o1')).vazio).toBe(false);
  });
});

describe('filtrarOpcoes', () => {
  it('texto vazio devolve todas, pela mesma ordem', () => {
    expect(filtrarOpcoes(CASAS, '  ').map((o) => o.valor)).toEqual(['c1', 'c2', 'c3', 'sem']);
  });

  it('indiferente a acentos e maiúsculas, em todas as palavras', () => {
    expect(filtrarOpcoes(CASAS, 'ACAO').map((o) => o.valor)).toEqual(['c2']);
    expect(filtrarOpcoes(CASAS, 'casa exemplo').map((o) => o.valor)).toEqual(['c1']);
    expect(filtrarOpcoes(CASAS, 'casa xyz')).toEqual([]);
  });

  it('procura também no detalhe e nos termos', () => {
    expect(filtrarOpcoes(CASAS, 'vila').map((o) => o.valor)).toEqual(['c1']);
    expect(filtrarOpcoes(CASAS, 'rio').map((o) => o.valor)).toEqual(['c3']);
  });

  it('matrículas sem espaços nem hífenes', () => {
    const carrinhas: OpcaoFiltro[] = [
      { valor: 'v1', rotulo: 'AB 1234' },
      { valor: 'v2', rotulo: 'CD 5678' },
    ];
    expect(filtrarOpcoes(carrinhas, 'ab1234').map((o) => o.valor)).toEqual(['v1']);
    expect(filtrarOpcoes(carrinhas, 'cd-56').map((o) => o.valor)).toEqual(['v2']);
  });
});

describe('alternar, todas e limpar', () => {
  it('alternarEscolha liga e desliga sem mexer no original', () => {
    const original = conj('c1');
    expect([...alternarEscolha(original, 'c2')]).toEqual(['c1', 'c2']);
    expect([...alternarEscolha(original, 'c1')]).toEqual([]);
    expect([...original]).toEqual(['c1']);
  });

  it('escolherTodas junta as visíveis que se podem escolher', () => {
    const opcoes: OpcaoFiltro[] = [...CASAS, { valor: 'x', rotulo: 'Desligada', desativada: true }];
    expect([...escolherTodas(conj('c2'), opcoes)].sort()).toEqual(['c1', 'c2', 'c3', 'sem']);
    // Com a pesquisa a mostrar só algumas, só essas se juntam (as escolhas antigas ficam).
    expect([...escolherTodas(conj('c3'), filtrarOpcoes(opcoes, 'exemplo'))].sort()).toEqual(['c1', 'c3']);
  });

  it('todasEscolhidas ignora as desativadas', () => {
    const opcoes: OpcaoFiltro[] = [
      { valor: 'a', rotulo: 'A' },
      { valor: 'b', rotulo: 'B', desativada: true },
    ];
    expect(todasEscolhidas(conj('a'), opcoes)).toBe(true);
    expect(todasEscolhidas(conj(), opcoes)).toBe(false);
    expect(temOpcoesAtivas(opcoes)).toBe(true);
    expect(temOpcoesAtivas([{ valor: 'b', rotulo: 'B', desativada: true }])).toBe(false);
  });
});

describe('seccionarOpcoes', () => {
  it('junta por grupo pela ordem em que aparecem; os especiais sem título', () => {
    const opcoes: OpcaoFiltro[] = [
      { valor: 'esp', rotulo: 'Sem obra', grupo: GRUPO_ESPECIAIS },
      { valor: 'o1', rotulo: 'Obra 1', grupo: 'Cliente A' },
      { valor: 'o2', rotulo: 'Obra 2' },
      { valor: 'o3', rotulo: 'Obra 3', grupo: 'Cliente A' },
    ];
    const s = seccionarOpcoes(opcoes);
    expect(s.map((x) => [x.grupo, x.titulo, x.opcoes.map((o) => o.valor)])).toEqual([
      ['especiais', null, ['esp']],
      ['Cliente A', 'Cliente A', ['o1', 'o3']],
      [undefined, null, ['o2']],
    ]);
  });

  it('grupo vazio conta como a lista principal; sem opções, sem secções', () => {
    expect(seccionarOpcoes([{ valor: 'a', rotulo: 'A', grupo: '' }])[0]?.grupo).toBeUndefined();
    expect(seccionarOpcoes([])).toEqual([]);
  });
});

describe('posicaoPainel', () => {
  const PC = { largura: 1920, altura: 1080 };
  const TELEMOVEL = { largura: 375, altura: 667 };

  it('no PC abre por baixo, alinhado com o botão', () => {
    expect(posicaoPainel({ top: 60, bottom: 92, left: 300 }, PC, 288)).toEqual({
      left: 300,
      largura: 288,
      top: 96,
      alturaMaxima: 420,
    });
  });

  it('encosta à margem direita quando não cabe', () => {
    const p = posicaoPainel({ top: 60, bottom: 92, left: 1800 }, PC, 288);
    expect(p.left + p.largura).toBe(1920 - 8);
  });

  it('no telemóvel ocupa a largura toda menos 8 px de cada lado, peça-se o que se pedir', () => {
    for (const pedida of [200, 288, 400]) {
      const p = posicaoPainel({ top: 100, bottom: 132, left: 250 }, TELEMOVEL, pedida);
      expect(p.largura).toBe(359);
      expect(p.left).toBe(8);
    }
    expect(
      posicaoPainel({ top: 100, bottom: 132, left: 0 }, { largura: 320, altura: 568 }, 288).largura,
    ).toBe(304);
  });

  it('a partir de 640 px usa a largura pedida', () => {
    expect(
      posicaoPainel({ top: 100, bottom: 132, left: 20 }, { largura: 640, altura: 800 }, 288).largura,
    ).toBe(288);
  });

  it('a altura máxima é o espaço até à borda de baixo', () => {
    const p = posicaoPainel({ top: 100, bottom: 132, left: 8 }, TELEMOVEL, 288);
    expect(p.top).toBe(136);
    expect(p.alturaMaxima).toBe(420);
    const baixo = posicaoPainel({ top: 100, bottom: 132, left: 8 }, { largura: 375, altura: 500 }, 288);
    expect(baixo.alturaMaxima).toBe(500 - 132 - 4 - 8);
  });

  it('abre para cima quando por baixo há pouco espaço e por cima há mais', () => {
    const p = posicaoPainel({ top: 600, bottom: 632, left: 8 }, TELEMOVEL, 288);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(667 - 600 + 4);
    expect(p.alturaMaxima).toBe(420);
  });

  it('com pouco espaço dos dois lados fica por baixo se lá houver mais', () => {
    const p = posicaoPainel({ top: 150, bottom: 182, left: 8 }, { largura: 375, altura: 400 }, 288);
    expect(p.top).toBe(186);
    expect(p.alturaMaxima).toBe(400 - 182 - 4 - 8);
  });
});

describe('proximaCaixa', () => {
  it('anda sem dar a volta e volta à pesquisa com ↑ na primeira', () => {
    expect(proximaCaixa(-1, 3, 'ArrowDown')).toBe(0);
    expect(proximaCaixa(0, 3, 'ArrowDown')).toBe(1);
    expect(proximaCaixa(2, 3, 'ArrowDown')).toBe(2);
    expect(proximaCaixa(1, 3, 'ArrowUp')).toBe(0);
    expect(proximaCaixa(0, 3, 'ArrowUp')).toBe(-1);
    expect(proximaCaixa(1, 3, 'Home')).toBe(0);
    expect(proximaCaixa(0, 3, 'End')).toBe(2);
    expect(proximaCaixa(0, 0, 'ArrowDown')).toBe(-1);
  });
});
