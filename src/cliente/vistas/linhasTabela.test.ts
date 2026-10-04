import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import { estadoVistas } from './estadoTeste';
import {
  ariaSort,
  FILTROS_INICIAIS,
  type FiltrosTabela,
  filtrarLinhas,
  filtrosTabelaAtivos,
  linhasDaTabela,
  ORDEM_INICIAL,
  ordenarLinhas,
  proximaOrdem,
  SEM,
  textoAConfirmar,
  textoContagem,
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

describe('ordenarLinhas', () => {
  it('por omissão, pelo nome (indiferente a acentos e maiúsculas)', () => {
    expect(nomes(ordenarLinhas(linhas, ORDEM_INICIAL))).toEqual([
      'Ana B.',
      'Eva D.',
      'Inês H.',
      'Ivo F.',
      'Luís E.',
      'Óscar G.',
      'Rui C.',
      'Zé A.',
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
      'Luís E.',
      'Rui C.',
      'Zé A.',
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
