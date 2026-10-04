import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import type { Pessoa } from '../../dominio/tipos';
import { estadoVistas } from './estadoTeste';
import {
  ariaSort,
  deslocamentoParaVer,
  FILTROS_INICIAIS,
  type FiltrosTabela,
  filtrarLinhas,
  filtrosTabelaAtivos,
  linhaApagada,
  linhasDaTabela,
  modoDaCaixa,
  ORDEM_INICIAL,
  ordenarLinhas,
  pessoasDoElemento,
  proximaOrdem,
  realceDaLinha,
  SEM,
  selecaoComVisiveis,
  textoAConfirmar,
  textoContagem,
  zonaLivreDaTabela,
} from './linhasTabela';

const estado = estadoVistas();
const ind = indexar(estado);
const linhas = linhasDaTabela(estado, ind);
const nomes = (ls: readonly { nome: string }[]) => ls.map((l) => l.nome);
const filtrar = (f: Partial<FiltrosTabela>) => nomes(filtrarLinhas(linhas, { ...FILTROS_INICIAIS, ...f }));

describe('linhasDaTabela', () => {
  it('uma linha por pessoa ativa', () => {
    expect(linhas).toHaveLength(8);
    expect(nomes(linhas)).not.toContain('Velho I.');
  });

  it('junta o cliente, a casa, a carrinha e se conduz', () => {
    const ze = linhas.find((l) => l.nome === 'Zé A.');
    expect(ze?.cliente?.nome).toBe('Beta Construções');
    expect(ze?.casa?.nome).toBe('Casa L1');
    expect(ze?.carrinha?.matricula).toBe('XX1001');
    expect(ze?.condutor).toBe(true);
    expect(ze?.nomeCompleto).toBe('José Amaral');
    const ana = linhas.find((l) => l.nome === 'Ana B.');
    expect(ana?.condutor).toBe(false);
    const oscar = linhas.find((l) => l.nome === 'Óscar G.');
    expect(oscar?.casa).toBeNull();
    expect(oscar?.carrinha).toBeNull();
    expect(oscar?.carrinhaAConfirmar).toBe(true);
  });
});

describe('nomeMostrado', () => {
  // Nomes fictícios, à maneira da lista de pessoal (apelidos em maiúsculas).
  const comMaiusculas = {
    ...estado,
    pessoas: [
      ...estado.pessoas.map((p) =>
        p.id === 'p-6'
          ? { ...p, nome: 'IVO Manuel', apelidos: 'DA FONSECA', nomesAlternativos: ['Ivinho'] }
          : p,
      ),
      {
        ...estado.pessoas[0],
        id: 'p-10',
        nomeCurto: 'Tó Z.',
        nome: '',
        apelidos: '',
        numero: null,
      } as Pessoa,
    ],
  };
  const ls = linhasDaTabela(comMaiusculas, indexar(comMaiusculas));
  const ivo = ls.find((l) => l.pessoa.id === 'p-6');

  it('o nome completo com maiúsculas normais; sem nome completo, o nome curto', () => {
    expect(ivo?.nomeMostrado).toBe('Ivo Manuel da Fonseca');
    expect(ivo?.nomeCompleto).toBe('IVO Manuel DA FONSECA');
    expect(ls.find((l) => l.pessoa.id === 'p-10')?.nomeMostrado).toBe('Tó Z.');
    expect(ls.find((l) => l.pessoa.id === 'p-1')?.nomeMostrado).toBe('José Amaral');
  });

  it('ordena pelo nome mostrado', () => {
    const ordem = ordenarLinhas(ls, ORDEM_INICIAL).map((l) => l.nomeMostrado);
    expect(ordem.slice(3, 6)).toEqual(['Ivo Manuel da Fonseca', 'José Amaral', 'Luís Esteves']);
    expect(ordem.at(-1)).toBe('Tó Z.');
  });

  it('a pesquisa encontra pelo nome mostrado, pelo curto e pelos alternativos', () => {
    const achar = (texto: string) =>
      filtrarLinhas(ls, { ...FILTROS_INICIAIS, texto }).map((l) => l.pessoa.id);
    expect(achar('manuel da fonseca')).toEqual(['p-6']);
    expect(achar('ivo f.')).toEqual(['p-6']);
    expect(achar('ivinho')).toEqual(['p-6']);
    expect(achar('tó')).toEqual(['p-10']);
  });
});

describe('linhaApagada', () => {
  it('esbatida só com outro cliente aceso, e nunca se selecionada ou em foco', () => {
    const alfa = { clienteId: 'alfa' };
    expect(linhaApagada(alfa, null, false)).toBe(false);
    expect(linhaApagada(alfa, 'alfa', false)).toBe(false);
    expect(linhaApagada(alfa, 'beta', false)).toBe(true);
    expect(linhaApagada(alfa, 'beta', true)).toBe(false);
  });
});

describe('ordenarLinhas', () => {
  it('por omissão, pelo nome mostrado (o completo; indiferente a acentos e maiúsculas)', () => {
    expect(nomes(ordenarLinhas(linhas, ORDEM_INICIAL))).toEqual([
      'Ana B.',
      'Eva D.',
      'Inês H.',
      'Ivo F.',
      'Zé A.', // José Amaral
      'Luís E.',
      'Óscar G.',
      'Rui C.',
    ]);
  });

  it('pela casa: pela ordem das casas (não pelo alfabeto); quem está fora fica no fim nos dois sentidos', () => {
    const asc = ordenarLinhas(linhas, { coluna: 'casa', direcao: 'asc' }).map((l) => l.casa?.nome ?? '—');
    expect(asc).toEqual(['Casa L1', 'Casa L1', 'Casa O1', 'Aldeia', 'Aldeia', 'Monte', '—', '—']);
    const desc = ordenarLinhas(linhas, { coluna: 'casa', direcao: 'desc' }).map((l) => l.casa?.nome ?? '—');
    expect(desc).toEqual(['Monte', 'Aldeia', 'Aldeia', 'Casa O1', 'Casa L1', 'Casa L1', '—', '—']);
  });

  it('empates vão pelo nome', () => {
    const asc = ordenarLinhas(linhas, { coluna: 'casa', direcao: 'asc' });
    expect(nomes(asc.slice(0, 2))).toEqual(['Ana B.', 'Zé A.']);
    const desc = ordenarLinhas(linhas, { coluna: 'casa', direcao: 'desc' });
    expect(nomes(desc.slice(1, 3))).toEqual(['Eva D.', 'Luís E.']);
  });

  it('pelo Nº (com números) e pelo cliente (pela ordem dos clientes)', () => {
    expect(nomes(ordenarLinhas(linhas, { coluna: 'numero', direcao: 'asc' })).slice(0, 2)).toEqual([
      'Zé A.',
      'Inês H.',
    ]);
    const porCliente = ordenarLinhas(linhas, { coluna: 'cliente', direcao: 'asc' });
    expect(porCliente.map((l) => l.clienteId)).toEqual([
      'alfa',
      'alfa',
      'alfa',
      'alfa',
      'alfa',
      'beta',
      'beta',
      'beta',
    ]);
  });

  it('pelo condutor e pelo "a confirmar": esses primeiro', () => {
    expect(nomes(ordenarLinhas(linhas, { coluna: 'condutor', direcao: 'asc' }).slice(0, 3))).toEqual([
      'Zé A.',
      'Luís E.',
      'Rui C.',
    ]);
    expect(nomes(ordenarLinhas(linhas, { coluna: 'aConfirmar', direcao: 'asc' }).slice(0, 2))).toEqual([
      'Eva D.',
      'Óscar G.',
    ]);
  });

  it('não muda a lista recebida', () => {
    const copia = [...linhas];
    ordenarLinhas(linhas, { coluna: 'carrinha', direcao: 'desc' });
    expect(linhas).toEqual(copia);
  });
});

describe('proximaOrdem e ariaSort', () => {
  it('clicar na mesma coluna inverte; noutra começa crescente', () => {
    expect(proximaOrdem({ coluna: 'nome', direcao: 'asc' }, 'nome')).toEqual({
      coluna: 'nome',
      direcao: 'desc',
    });
    expect(proximaOrdem({ coluna: 'nome', direcao: 'desc' }, 'nome')).toEqual({
      coluna: 'nome',
      direcao: 'asc',
    });
    expect(proximaOrdem({ coluna: 'nome', direcao: 'desc' }, 'casa')).toEqual({
      coluna: 'casa',
      direcao: 'asc',
    });
  });

  it('aria-sort só na coluna ordenada', () => {
    expect(ariaSort({ coluna: 'casa', direcao: 'asc' }, 'casa')).toBe('ascending');
    expect(ariaSort({ coluna: 'casa', direcao: 'desc' }, 'casa')).toBe('descending');
    expect(ariaSort({ coluna: 'casa', direcao: 'asc' }, 'nome')).toBe('none');
  });
});

describe('filtrarLinhas', () => {
  it('sem filtros, todas', () => {
    expect(filtrar({})).toHaveLength(8);
    expect(filtrosTabelaAtivos(FILTROS_INICIAIS)).toBe(false);
    expect(filtrosTabelaAtivos({ ...FILTROS_INICIAIS, texto: '   ' })).toBe(false);
  });

  it('o texto é indiferente a acentos e maiúsculas, e procura no nome completo', () => {
    expect(filtrar({ texto: 'OSCAR' })).toEqual(['Óscar G.']);
    expect(filtrar({ texto: 'jose' })).toEqual(['Zé A.']);
    expect(filtrar({ texto: 'luis' })).toEqual(['Luís E.']);
  });

  it('cada palavra tem de aparecer em algum lado (nome, casa, cliente, matrícula)', () => {
    expect(filtrar({ texto: 'eva aldeia' })).toEqual(['Eva D.']);
    expect(filtrar({ texto: 'beta casa l1' })).toEqual(['Zé A.']);
    expect(filtrar({ texto: 'xx 1003' })).toEqual(['Ivo F.']);
    expect(filtrar({ texto: 'xx1001' }).sort()).toEqual(['Ana B.', 'Zé A.']);
  });

  it('o Nº sem espaços nem hífenes', () => {
    expect(filtrar({ texto: '900002' })).toEqual(['Inês H.']);
    expect(filtrar({ texto: '900-00' }).sort()).toEqual(['Inês H.', 'Zé A.']);
  });

  it('por cliente, casa e carrinha (SEM = fora das casas / sem transporte)', () => {
    expect(filtrar({ clienteId: 'beta' }).sort()).toEqual(['Eva D.', 'Zé A.', 'Óscar G.']);
    expect(filtrar({ casa: 'casa-a' }).sort()).toEqual(['Eva D.', 'Luís E.']);
    expect(filtrar({ casa: SEM }).sort()).toEqual(['Ivo F.', 'Óscar G.']);
    expect(filtrar({ carrinha: SEM }).sort()).toEqual(['Inês H.', 'Óscar G.']);
    expect(filtrar({ carrinha: 'XX1002', clienteId: 'alfa' })).toEqual(['Luís E.']);
  });

  it('só a confirmar (a casa ou a carrinha)', () => {
    expect(filtrar({ soAConfirmar: true }).sort()).toEqual(['Eva D.', 'Óscar G.']);
  });
});

describe('textos', () => {
  it('o que está por confirmar', () => {
    expect(textoAConfirmar({ casaAConfirmar: true, carrinhaAConfirmar: true })).toBe('casa e carrinha');
    expect(textoAConfirmar({ casaAConfirmar: true, carrinhaAConfirmar: false })).toBe('casa');
    expect(textoAConfirmar({ casaAConfirmar: false, carrinhaAConfirmar: true })).toBe('carrinha');
    expect(textoAConfirmar({ casaAConfirmar: false, carrinhaAConfirmar: false })).toBe('');
  });

  it('a contagem', () => {
    expect(textoContagem(8, 8, false)).toBe('8 pessoas');
    expect(textoContagem(1, 1, false)).toBe('1 pessoa');
    expect(textoContagem(2, 8, true)).toBe('2 de 8 pessoas');
  });
});

describe('realceDaLinha', () => {
  const ze = linhas.find((l) => l.nome === 'Zé A.');
  const oscar = linhas.find((l) => l.nome === 'Óscar G.');
  if (!ze || !oscar) throw new Error('linhas em falta');

  it('sem foco, nenhum', () => {
    expect(realceDaLinha(ze, null)).toBeNull();
  });

  it('a pessoa da ficha: foco; as outras: nenhum', () => {
    expect(realceDaLinha(ze, { tipo: 'pessoa', id: 'p-1' })).toBe('foco');
    expect(realceDaLinha(oscar, { tipo: 'pessoa', id: 'p-1' })).toBeNull();
  });

  it('quem mora na casa ou vai na carrinha da ficha: ligada', () => {
    expect(realceDaLinha(ze, { tipo: 'casa', id: 'casa-l1' })).toBe('ligada');
    expect(realceDaLinha(ze, { tipo: 'carrinha', id: 'XX1001' })).toBe('ligada');
    expect(realceDaLinha(ze, { tipo: 'casa', id: 'casa-o1' })).toBeNull();
    // Fora das casas e sem transporte não ficam ligados a nada.
    expect(realceDaLinha(oscar, { tipo: 'casa', id: 'casa-l1' })).toBeNull();
    expect(realceDaLinha(oscar, { tipo: 'carrinha', id: 'XX1001' })).toBeNull();
  });
});

describe('pessoasDoElemento', () => {
  it('uma pessoa é só ela (mesmo que não esteja nas linhas)', () => {
    expect(pessoasDoElemento(linhas, { tipo: 'pessoa', id: 'p-7' })).toEqual(['p-7']);
    expect(pessoasDoElemento([], { tipo: 'pessoa', id: 'p-7' })).toEqual(['p-7']);
  });

  it('uma casa ou carrinha são as linhas dela, pela ordem recebida', () => {
    const ordenadas = ordenarLinhas(linhas, ORDEM_INICIAL);
    expect(pessoasDoElemento(ordenadas, { tipo: 'casa', id: 'casa-l1' })).toEqual(['p-2', 'p-1']);
    expect(pessoasDoElemento(ordenadas, { tipo: 'carrinha', id: 'XX1002' })).toEqual(['p-4', 'p-5']);
    expect(pessoasDoElemento(ordenadas, { tipo: 'casa', id: 'casa-l2' })).toEqual([]);
  });
});

describe('selecaoComVisiveis', () => {
  const selecao = new Set(['p-9', 'p-1']);

  it('marcar junta as visíveis sem tirar quem os filtros escondem', () => {
    expect(selecaoComVisiveis(selecao, ['p-1', 'p-2', 'p-3'], true)).toEqual(['p-9', 'p-1', 'p-2', 'p-3']);
  });

  it('desmarcar tira só as visíveis', () => {
    expect(selecaoComVisiveis(selecao, ['p-1', 'p-2'], false)).toEqual(['p-9']);
    expect(selecaoComVisiveis(new Set(), ['p-1'], false)).toEqual([]);
  });
});

describe('modoDaCaixa', () => {
  const ordem = ['p-1', 'p-2', 'p-3'];

  it('sem Shift junta ou tira', () => {
    expect(modoDaCaixa(false, 'p-1', ordem)).toBe('alternar');
  });

  it('com Shift e a âncora à vista: intervalo', () => {
    expect(modoDaCaixa(true, 'p-1', ordem)).toBe('intervalo');
  });

  it('com Shift e a âncora escondida (ou sem âncora): só esta linha, sem deitar fora a seleção', () => {
    expect(modoDaCaixa(true, 'p-9', ordem)).toBe('alternar');
    expect(modoDaCaixa(true, null, ordem)).toBe('alternar');
  });
});

describe('zonaLivreDaTabela e deslocamentoParaVer', () => {
  // Telemóvel 375×812: a caixa da tabela de 476 a 812, o cabeçalho até 508, a ficha de 602 a 804.
  const contentor = { top: 476, bottom: 812, left: 0, right: 375 };
  const celula = { left: 0, right: 36 };
  const fichaMovel = { top: 602, bottom: 804, left: 8, right: 367 };

  it('no telemóvel a ficha em baixo encurta a zona; no PC (à direita) não conta', () => {
    expect(zonaLivreDaTabela(contentor, 508, fichaMovel, celula)).toEqual({ top: 508, bottom: 602 });
    const pc = { top: 120, bottom: 700, left: 980, right: 1340 };
    expect(zonaLivreDaTabela({ ...contentor, right: 1366 }, 508, pc, celula)).toEqual({
      top: 508,
      bottom: 812,
    });
  });

  it('sem ficha, ou escondida (retângulo vazio), é a caixa por baixo do cabeçalho', () => {
    expect(zonaLivreDaTabela(contentor, 508, null, celula)).toEqual({ top: 508, bottom: 812 });
    const vazia = { top: 0, bottom: 0, left: 0, right: 0 };
    expect(zonaLivreDaTabela(contentor, 508, vazia, celula)).toEqual({ top: 508, bottom: 812 });
  });

  it('uma linha que se vê não desliza', () => {
    expect(deslocamentoParaVer({ top: 520, bottom: 560 }, { top: 508, bottom: 602 })).toBe(0);
  });

  it('uma linha tapada pela ficha sobe até ficar por cima dela, com folga', () => {
    // 3.ª linha em 591–632: sobe 632 − 602 + 8.
    expect(deslocamentoParaVer({ top: 591, bottom: 632 }, { top: 508, bottom: 602 })).toBe(38);
  });

  it('uma linha por baixo do cabeçalho desce; se não couber, fica com o topo no topo da zona', () => {
    expect(deslocamentoParaVer({ top: 490, bottom: 530 }, { top: 508, bottom: 602 })).toBe(-26);
    expect(deslocamentoParaVer({ top: 700, bottom: 820 }, { top: 508, bottom: 602 })).toBe(192);
  });
});
