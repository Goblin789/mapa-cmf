import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import { criarIndisponibilidade, criarObra } from '../../dominio/teste-fabrica';
import type { Pessoa } from '../../dominio/tipos';
import { GRUPO_ESPECIAIS } from '../comum/escolhaMultipla';
import { ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from '../paineis/textos';
import { estadoVistas } from './estadoTeste';
import {
  ariaSort,
  COM_FUTUROS,
  DISPONIVEL_HOJE,
  descricaoIndisponivel,
  deslocamentoParaVer,
  FILTROS_INICIAIS,
  type FiltrosTabela,
  filtrarLinhas,
  filtrosTabelaAtivos,
  INDISPONIVEL_HOJE,
  linhasDaTabela,
  marcadaDepoisDoClique,
  modoDaCaixa,
  ORDEM_INICIAL,
  opcoesFiltrosTabela,
  ordenarLinhas,
  pessoasDoElemento,
  proximaOrdem,
  realceDaLinha,
  reservaDaFicha,
  SEM,
  selecaoComVisiveis,
  textoAConfirmar,
  textoAteCurto,
  textoContagem,
  textoIndisponivelExcel,
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
    expect(filtrar({ clientes: new Set(['beta']) }).sort()).toEqual(['Eva D.', 'Zé A.', 'Óscar G.']);
    expect(filtrar({ casas: new Set(['casa-a']) }).sort()).toEqual(['Eva D.', 'Luís E.']);
    expect(filtrar({ casas: new Set([SEM]) }).sort()).toEqual(['Ivo F.', 'Óscar G.']);
    expect(filtrar({ carrinhas: new Set([SEM]) }).sort()).toEqual(['Inês H.', 'Óscar G.']);
    expect(filtrar({ carrinhas: new Set(['XX1002']), clientes: new Set(['alfa']) })).toEqual(['Luís E.']);
  });

  it('várias escolhas no mesmo filtro: basta uma (Casa L1 OU a Aldeia)', () => {
    expect(filtrar({ casas: new Set(['casa-l1', 'casa-a']) }).sort()).toEqual([
      'Ana B.',
      'Eva D.',
      'Luís E.',
      'Zé A.',
    ]);
    // Uma casa e "fora das casas" ao mesmo tempo.
    expect(filtrar({ casas: new Set(['casa-a', SEM]) }).sort()).toEqual([
      'Eva D.',
      'Ivo F.',
      'Luís E.',
      'Óscar G.',
    ]);
    expect(filtrar({ clientes: new Set(['alfa', 'beta']) })).toHaveLength(filtrar({}).length);
    expect(filtrar({ carrinhas: new Set(['XX1001', SEM]) }).sort()).toEqual([
      'Ana B.',
      'Inês H.',
      'Zé A.',
      'Óscar G.',
    ]);
  });

  it('entre filtros diferentes têm de passar todos (E)', () => {
    const casas = new Set(['casa-l1', 'casa-a']);
    expect(filtrar({ casas, clientes: new Set(['beta']) }).sort()).toEqual(['Eva D.', 'Zé A.']);
    expect(filtrar({ casas, carrinhas: new Set(['XX1002']), clientes: new Set(['beta']) })).toEqual([
      'Eva D.',
    ]);
    expect(filtrar({ casas, carrinhas: new Set([SEM]) })).toEqual([]);
  });

  it('os conjuntos vazios são "sem filtro"; qualquer escolha conta como filtro ativo', () => {
    expect(filtrosTabelaAtivos({ ...FILTROS_INICIAIS, casas: new Set() })).toBe(false);
    expect(filtrosTabelaAtivos({ ...FILTROS_INICIAIS, casas: new Set([SEM]) })).toBe(true);
    expect(filtrosTabelaAtivos({ ...FILTROS_INICIAIS, obras: new Set(['o-1']) })).toBe(true);
    expect(filtrosTabelaAtivos({ ...FILTROS_INICIAIS, clientes: new Set(['alfa']) })).toBe(true);
    expect(filtrosTabelaAtivos({ ...FILTROS_INICIAIS, carrinhas: new Set(['XX1001']) })).toBe(true);
  });

  it('só a confirmar (a casa ou a carrinha)', () => {
    expect(filtrar({ soAConfirmar: true }).sort()).toEqual(['Eva D.', 'Óscar G.']);
  });
});

// Obras fictícias: a Ponte Norte (Alfa) e a Escola Sul (Beta). O Zé vai para a Escola, a Ana para a Ponte.
const comObras = {
  ...estado,
  obras: [
    criarObra({ id: 'o-ponte', nome: 'Ponte Norte', clienteId: 'alfa' }),
    criarObra({ id: 'o-escola', nome: 'Escola Sul', clienteId: 'beta' }),
    criarObra({ id: 'o-armazem', nome: 'Armazém', clienteId: 'beta' }),
  ],
  pessoas: estado.pessoas.map((p) =>
    p.id === 'p-1' ? { ...p, obraId: 'o-escola' } : p.id === 'p-2' ? { ...p, obraId: 'o-ponte' } : p,
  ),
};
const indObras = indexar(comObras);
const linhasObras = linhasDaTabela(comObras, indObras);

describe('filtro por obra', () => {
  const filtrarObras = (obras: string[], extra: Partial<FiltrosTabela> = {}) =>
    nomes(filtrarLinhas(linhasObras, { ...FILTROS_INICIAIS, ...extra, obras: new Set(obras) })).sort();

  it('uma ou várias obras, e "sem obra"', () => {
    expect(filtrarObras(['o-escola'])).toEqual(['Zé A.']);
    expect(filtrarObras(['o-escola', 'o-ponte'])).toEqual(['Ana B.', 'Zé A.']);
    expect(filtrarObras([SEM])).toHaveLength(linhasObras.length - 2);
    expect(filtrarObras(['o-armazem'])).toEqual([]);
  });

  it('com os outros filtros (E)', () => {
    expect(filtrarObras(['o-escola', 'o-ponte'], { clientes: new Set(['alfa']) })).toEqual(['Ana B.']);
  });
});

describe('opcoesFiltrosTabela', () => {
  const o = opcoesFiltrosTabela(estado, ind, linhas);

  it('clientes pela ordem, com a sigla na pesquisa e o nº de pessoas', () => {
    expect(o.clientes.map((c) => c.valor)).toEqual(['alfa', 'beta']);
    expect(o.clientes.map((c) => c.contagem)).toEqual([5, 3]);
    expect(o.clientes[0]?.termos).toBe('AL');
  });

  it('casas pela ordem e "fora das casas" no fim, à parte', () => {
    expect(o.casas.map((c) => c.valor)).toEqual(['casa-l1', 'casa-l2', 'casa-o1', 'casa-a', 'casa-m', SEM]);
    expect(o.casas.at(-1)).toMatchObject({
      rotulo: ROTULO_FORA_DAS_CASAS,
      grupo: GRUPO_ESPECIAIS,
      contagem: 2,
    });
    expect(o.casas[0]?.contagem).toBe(2);
    expect(o.casas[1]?.contagem).toBe(0);
  });

  it('carrinhas pela matrícula e "sem transporte" no fim, à parte', () => {
    expect(o.carrinhas.map((c) => c.rotulo).slice(0, 2)).toEqual(['XX 1001', 'XX 1002']);
    // O XX1005 é um carro.
    expect(o.carrinhas.find((c) => c.valor === 'XX1005')?.detalhe).toBe('carro');
    expect(o.carrinhas[0]?.detalhe).toBeUndefined();
    expect(o.carrinhas.at(-1)).toMatchObject({
      valor: SEM,
      rotulo: ROTULO_SEM_TRANSPORTE,
      grupo: GRUPO_ESPECIAIS,
      contagem: 2,
    });
  });

  it('sem obras, a lista das obras fica vazia (o filtro fica desativado)', () => {
    expect(o.obras).toEqual([]);
  });

  it('obras numa secção por cliente (pela ordem dos clientes e pelo nome) e "Sem obra" no fim', () => {
    const obras = opcoesFiltrosTabela(comObras, indObras, linhasObras).obras;
    expect(obras.map((x) => [x.rotulo, x.grupo, x.contagem])).toEqual([
      ['Ponte Norte', 'Alfa Obras', 1],
      ['Armazém', 'Beta Construções', 0],
      ['Escola Sul', 'Beta Construções', 1],
      ['Sem obra', GRUPO_ESPECIAIS, linhasObras.length - 2],
    ]);
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

  it('a linha em que se clicou: marcada (a da ficha ganha; a marcada ganha à ligada)', () => {
    expect(realceDaLinha(ze, null, 'p-1')).toBe('marcada');
    expect(realceDaLinha(oscar, null, 'p-1')).toBeNull();
    expect(realceDaLinha(ze, { tipo: 'pessoa', id: 'p-1' }, 'p-1')).toBe('foco');
    expect(realceDaLinha(ze, { tipo: 'casa', id: 'casa-l1' }, 'p-1')).toBe('marcada');
    expect(realceDaLinha(ze, { tipo: 'pessoa', id: 'p-2' }, 'p-1')).toBe('marcada');
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

describe('marcadaDepoisDoClique', () => {
  it('só realça a linha (nunca abre nem muda a ficha); outro clique na mesma tira o realce', () => {
    expect(marcadaDepoisDoClique('p-1', null, false)).toBe('p-1');
    expect(marcadaDepoisDoClique('p-1', 'p-1', false)).toBeNull();
    expect(marcadaDepoisDoClique('p-2', 'p-1', false)).toBe('p-2');
  });

  it('na linha da pessoa da ficha, o clique não tira o realce (fica realçada ao fechar a ficha)', () => {
    expect(marcadaDepoisDoClique('p-1', 'p-1', false, 'p-1')).toBe('p-1');
    expect(marcadaDepoisDoClique('p-1', null, false, 'p-1')).toBe('p-1');
    // As outras linhas alternam como sempre, com a ficha aberta.
    expect(marcadaDepoisDoClique('p-2', 'p-2', false, 'p-1')).toBeNull();
    expect(marcadaDepoisDoClique('p-2', 'p-1', false, 'p-1')).toBe('p-2');
  });

  it('no modo de edição o realce é a seleção: nenhuma marcada', () => {
    expect(marcadaDepoisDoClique('p-1', 'p-2', true)).toBeNull();
    expect(marcadaDepoisDoClique('p-1', null, true)).toBeNull();
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

describe('reservaDaFicha', () => {
  it('sem ficha, a tabela não reserva nada', () => {
    expect(reservaDaFicha(false, false)).toEqual({ baixo: false, direita: false });
    expect(reservaDaFicha(false, true)).toEqual({ baixo: false, direita: false });
  });

  it('com a ficha na origem, reserva à direita (PC) e em baixo (telemóvel)', () => {
    expect(reservaDaFicha(true, false)).toEqual({ baixo: true, direita: true });
  });

  it('com a ficha arrastada para outro sítio, deixa de reservar à direita', () => {
    expect(reservaDaFicha(true, true)).toEqual({ baixo: true, direita: false });
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

  it('no PC, a ficha arrastada para cima dos nomes encurta a zona', () => {
    const arrastada = { top: 600, bottom: 760, left: 140, right: 492 };
    const nome = { left: 0, right: 300 };
    expect(zonaLivreDaTabela({ ...contentor, right: 1366 }, 508, arrastada, nome)).toEqual({
      top: 508,
      bottom: 600,
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

describe('indisponível na Tabela (M2)', () => {
  // Hoje 04/10: a Ana fora até 12/10, o Rui sem data de regresso, a Eva só a partir de 20/10 e o Zé já
  // voltou (acabou a 02/10). Dados fictícios.
  const comPeriodos = {
    ...estado,
    indisponibilidades: [
      criarIndisponibilidade({ pessoaId: 'p-2', inicio: '2026-10-01', fim: '2026-10-12' }),
      criarIndisponibilidade({ pessoaId: 'p-3', inicio: '2026-10-03', fim: null }),
      criarIndisponibilidade({ pessoaId: 'p-4', inicio: '2026-10-20', fim: '2026-10-22' }),
      criarIndisponibilidade({ pessoaId: 'p-1', inicio: '2026-09-28', fim: '2026-10-02' }),
    ],
  };
  const indP = indexar(comPeriodos, '2026-10-04');
  const linhasP = linhasDaTabela(comPeriodos, indP);
  const linha = (id: string) => linhasP.find((l) => l.pessoa.id === id);
  const filtrarP = (valores: string[]) =>
    filtrarLinhas(linhasP, { ...FILTROS_INICIAIS, indisponivel: new Set(valores) }).map((l) => l.pessoa.id);

  it('cada linha sabe o período de hoje e o início do próximo', () => {
    expect(linha('p-2')?.indisponivel?.fim).toBe('2026-10-12');
    expect(linha('p-3')?.indisponivel?.fim).toBeNull();
    expect(linha('p-4')).toMatchObject({ indisponivel: null, proximoInicio: '2026-10-20' });
    expect(linha('p-1')).toMatchObject({ indisponivel: null, proximoInicio: null });
  });

  it('textos: "até 12/10", "sem regresso"; no title e no Excel, mais completos', () => {
    expect(textoAteCurto({ fim: '2026-10-12' })).toBe('até 12/10');
    expect(textoAteCurto({ fim: null })).toBe('sem regresso');
    expect(descricaoIndisponivel({ inicio: '2026-10-01', fim: '2026-10-12' })).toBe('Indisponível até 12/10');
    expect(descricaoIndisponivel({ inicio: '2026-10-03', fim: null })).toBe(
      'Indisponível desde 03/10, sem data de regresso',
    );
    expect(textoIndisponivelExcel({ fim: '2026-10-12' })).toBe('12/10/2026');
    expect(textoIndisponivelExcel({ fim: null })).toBe('sem data');
    expect(textoIndisponivelExcel(null)).toBe('');
  });

  it('ordena pela data de regresso: quem volta primeiro, sem data depois, os disponíveis no fim', () => {
    const asc = ordenarLinhas(linhasP, { coluna: 'indisponivel', direcao: 'asc' }).map((l) => l.pessoa.id);
    expect(asc.slice(0, 2)).toEqual(['p-2', 'p-3']);
    const desc = ordenarLinhas(linhasP, { coluna: 'indisponivel', direcao: 'desc' }).map((l) => l.pessoa.id);
    expect(desc.slice(0, 2)).toEqual(['p-3', 'p-2']);
  });

  it('filtro: indisponíveis hoje, disponíveis hoje, com períodos futuros (OU entre eles)', () => {
    expect(filtrarP([INDISPONIVEL_HOJE]).sort()).toEqual(['p-2', 'p-3']);
    expect(filtrarP([DISPONIVEL_HOJE])).toHaveLength(6);
    expect(filtrarP([COM_FUTUROS])).toEqual(['p-4']);
    expect(filtrarP([INDISPONIVEL_HOJE, COM_FUTUROS]).sort()).toEqual(['p-2', 'p-3', 'p-4']);
    expect(filtrosTabelaAtivos({ ...FILTROS_INICIAIS, indisponivel: new Set([COM_FUTUROS]) })).toBe(true);
  });

  it('as opções do filtro, com o nº de pessoas', () => {
    const o = opcoesFiltrosTabela(comPeriodos, indP, linhasP).indisponivel;
    expect(o.map((x) => [x.valor, x.rotulo, x.contagem])).toEqual([
      [INDISPONIVEL_HOJE, 'Indisponíveis hoje', 2],
      [DISPONIVEL_HOJE, 'Disponíveis hoje', 6],
      [COM_FUTUROS, 'Com períodos futuros', 1],
    ]);
  });

  it('sem o hoje (índices do servidor) ninguém está indisponível', () => {
    const semHoje = linhasDaTabela(comPeriodos, indexar(comPeriodos, null));
    expect(semHoje.every((l) => l.indisponivel === null && l.proximoInicio === null)).toBe(true);
  });
});

describe('"Mostrar quem saiu" (M2)', () => {
  it('sem a caixa só as ativas; com ela também quem saiu, marcado', () => {
    expect(linhas.some((l) => l.saiu)).toBe(false);
    const todas = linhasDaTabela(estado, ind, { comQuemSaiu: true });
    expect(todas).toHaveLength(9);
    expect(todas.filter((l) => l.saiu).map((l) => l.nome)).toEqual(['Velho I.']);
  });
});
