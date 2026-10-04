import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import type { Operacao } from '../../dominio/operacoes';
import {
  aplicarOperacoes,
  compactarOperacoes,
  operacaoCondutor,
  operacoesParaAlvo,
} from '../../dominio/operacoes';
import { criarObra } from '../../dominio/teste-fabrica';
import {
  acaoTeclaLista,
  alvoDaEscolha,
  antesDaCelula,
  antesDasLinhas,
  antesDoCondutor,
  mesmasOpcoes,
  opcoesCarrinha,
  opcoesCasa,
  opcoesObra,
  rotuloBotaoCondutor,
  rotuloDaCelula,
  type TeclaLista,
  teclaMudaLista,
  valorDaCelula,
} from './celulasTabela';
import { estadoVistas } from './estadoTeste';
import { linhasDaTabela, SEM } from './linhasTabela';

const servidor = estadoVistas();
const ind = indexar(servidor);

/** Estado visível depois de aplicar as operações (como a loja faz com o rascunho). */
function simular(ops: readonly Operacao[]) {
  const estado = aplicarOperacoes(servidor, ops);
  return { estado, ind: indexar(estado), pendentes: compactarOperacoes(ops) };
}

describe('opcoesCasa', () => {
  it('casas pela ordem, com a lotação, e no fim Fora das casas CMF', () => {
    expect(opcoesCasa(servidor, ind)).toEqual([
      { valor: 'casa-l1', rotulo: 'Casa L1 · 2/3' },
      { valor: 'casa-l2', rotulo: 'Casa L2 · 0/2' },
      { valor: 'casa-o1', rotulo: 'Casa O1 · 1/4' },
      { valor: 'casa-a', rotulo: 'Aldeia · 2/2' },
      // Conta sempre como cheia: a lotação são os moradores.
      { valor: 'casa-m', rotulo: 'Monte · 1/1' },
      { valor: SEM, rotulo: 'Fora das casas CMF' },
    ]);
  });

  it('a lotação é a da simulação', () => {
    const { estado, ind: i } = simular(operacoesParaAlvo(servidor, ['p-7'], { tipo: 'casa', id: 'casa-l1' }));
    expect(opcoesCasa(estado, i)[0]).toEqual({ valor: 'casa-l1', rotulo: 'Casa L1 · 3/3' });
  });
});

describe('opcoesCarrinha', () => {
  it('pela matrícula formatada, com os lugares, e no fim Sem transporte da empresa', () => {
    expect(opcoesCarrinha(servidor, ind)).toEqual([
      { valor: 'XX1001', rotulo: 'XX 1001 · 2/5' },
      { valor: 'XX1002', rotulo: 'XX 1002 · 2/3' },
      { valor: 'XX1003', rotulo: 'XX 1003 · 1/2' },
      { valor: 'XX1004', rotulo: 'XX 1004 · 0/5' },
      { valor: 'XX1005', rotulo: 'XX 1005 · 1/5' },
      { valor: SEM, rotulo: 'Sem transporte da empresa' },
    ]);
  });
});

describe('opcoesObra', () => {
  it('sem obras no estado, só Sem obra', () => {
    expect(opcoesObra(servidor, ind)).toEqual([{ valor: SEM, rotulo: 'Sem obra' }]);
  });

  it('obras pelo nome (indiferente a acentos) e no fim Sem obra', () => {
    const estado = {
      ...servidor,
      obras: [
        criarObra({ id: 'o-2', nome: 'Ponte', clienteId: 'alfa' }),
        criarObra({ id: 'o-1', nome: 'Átrio', clienteId: 'beta' }),
      ],
    };
    expect(opcoesObra(estado, indexar(estado)).map((o) => o.rotulo)).toEqual(['Átrio', 'Ponte', 'Sem obra']);
  });
});

describe('mesmasOpcoes', () => {
  it('compara valores e textos', () => {
    const a = opcoesCasa(servidor, ind);
    expect(mesmasOpcoes(a, opcoesCasa(servidor, ind))).toBe(true);
    const { estado, ind: i } = simular(operacoesParaAlvo(servidor, ['p-7'], { tipo: 'casa', id: 'casa-l1' }));
    expect(mesmasOpcoes(a, opcoesCasa(estado, i))).toBe(false);
    expect(mesmasOpcoes(a, a.slice(1))).toBe(false);
  });
});

describe('valorDaCelula e alvoDaEscolha', () => {
  const linhas = linhasDaTabela(servidor, ind);
  const linha = (id: string) => linhas.find((l) => l.pessoa.id === id);

  it('o valor é o id ou SEM', () => {
    const ze = linha('p-1');
    const oscar = linha('p-7');
    if (!ze || !oscar) throw new Error('linhas em falta');
    expect(valorDaCelula(ze, 'casa')).toBe('casa-l1');
    expect(valorDaCelula(ze, 'carrinha')).toBe('XX1001');
    expect(valorDaCelula(ze, 'obra')).toBe(SEM);
    expect(valorDaCelula(oscar, 'casa')).toBe(SEM);
    expect(valorDaCelula(oscar, 'carrinha')).toBe(SEM);
  });

  it('o texto da lista fechada é o nome, sem a lotação', () => {
    const ze = linha('p-1');
    const oscar = linha('p-7');
    if (!ze || !oscar) throw new Error('linhas em falta');
    expect(rotuloDaCelula(ze, 'casa')).toBe('Casa L1');
    expect(rotuloDaCelula(ze, 'carrinha')).toBe('XX 1001');
    expect(rotuloDaCelula(ze, 'obra')).toBe('Sem obra');
    expect(rotuloDaCelula(oscar, 'casa')).toBe('Fora das casas CMF');
    expect(rotuloDaCelula(oscar, 'carrinha')).toBe('Sem transporte da empresa');
  });

  it('cada escolha leva ao alvo certo', () => {
    expect(alvoDaEscolha('casa', 'casa-l1')).toEqual({ tipo: 'casa', id: 'casa-l1' });
    expect(alvoDaEscolha('casa', SEM)).toEqual({ tipo: 'fora' });
    expect(alvoDaEscolha('carrinha', 'XX1004')).toEqual({ tipo: 'carrinha', id: 'XX1004' });
    expect(alvoDaEscolha('carrinha', SEM)).toEqual({ tipo: 'sem-transporte' });
    expect(alvoDaEscolha('obra', 'o-1')).toEqual({ tipo: 'obra', id: 'o-1' });
    expect(alvoDaEscolha('obra', SEM)).toEqual({ tipo: 'sem-obra' });
  });
});

describe('antesDaCelula', () => {
  it('o valor gravado de uma célula que mudou; null nas outras', () => {
    const { pendentes } = simular([
      ...operacoesParaAlvo(servidor, ['p-2'], { tipo: 'casa', id: 'casa-o1' }),
      ...operacoesParaAlvo(servidor, ['p-7'], { tipo: 'carrinha', id: 'XX1004' }),
    ]);
    expect(antesDaCelula(pendentes, servidor, 'p-2', 'casa')).toBe('antes: Casa L1');
    expect(antesDaCelula(pendentes, servidor, 'p-2', 'carrinha')).toBeNull();
    expect(antesDaCelula(pendentes, servidor, 'p-7', 'carrinha')).toBe('antes: Sem transporte da empresa');
    expect(antesDaCelula(pendentes, servidor, 'p-1', 'casa')).toBeNull();
  });

  it('ir e voltar não deixa marca (o rascunho compacta)', () => {
    const ida = operacoesParaAlvo(servidor, ['p-2'], { tipo: 'casa', id: 'casa-o1' });
    const meio = aplicarOperacoes(servidor, ida);
    const volta = operacoesParaAlvo(meio, ['p-2'], { tipo: 'casa', id: 'casa-l1' });
    const { pendentes } = simular([...ida, ...volta]);
    expect(antesDaCelula(pendentes, servidor, 'p-2', 'casa')).toBeNull();
  });
});

describe('antesDoCondutor', () => {
  it('o novo condutor e o antigo mostram quem conduzia', () => {
    const op = operacaoCondutor(servidor, 'XX1001', 'p-2');
    if (!op) throw new Error('operação em falta');
    const { estado } = simular([op]);
    expect(antesDoCondutor(servidor, estado, 'p-2')).toBe('antes: Zé A.');
    expect(antesDoCondutor(servidor, estado, 'p-1')).toBe('antes: Zé A.');
  });

  it('tirar o condutor: "antes: Zé A."; pôr numa carrinha sem condutor: "antes: sem condutor"', () => {
    const tirar = operacaoCondutor(servidor, 'XX1001', null);
    const por = operacaoCondutor(servidor, 'XX1003', 'p-6');
    if (!tirar || !por) throw new Error('operação em falta');
    const { estado } = simular([tirar, por]);
    expect(antesDoCondutor(servidor, estado, 'p-1')).toBe('antes: Zé A.');
    expect(antesDoCondutor(servidor, estado, 'p-6')).toBe('antes: sem condutor');
  });

  it('quem sai da carrinha que conduzia: "antes: condutor da XX 1001"', () => {
    const { estado } = simular(operacoesParaAlvo(servidor, ['p-1'], { tipo: 'carrinha', id: 'XX1004' }));
    expect(antesDoCondutor(servidor, estado, 'p-1')).toBe('antes: condutor da XX 1001');
    expect(antesDoCondutor(servidor, estado, 'p-2')).toBeNull();
  });

  it('sem mudanças, null', () => {
    expect(antesDoCondutor(servidor, servidor, 'p-1')).toBeNull();
    expect(antesDoCondutor(servidor, servidor, 'p-7')).toBeNull();
  });
});

describe('antesDasLinhas', () => {
  it('só as pessoas com alterações, só os campos que mudaram', () => {
    const op = operacaoCondutor(servidor, 'XX1002', 'p-4');
    if (!op) throw new Error('operação em falta');
    const { estado, pendentes } = simular([
      ...operacoesParaAlvo(servidor, ['p-2'], { tipo: 'casa', id: 'casa-o1' }),
      op,
    ]);
    const antes = antesDasLinhas(pendentes, servidor, estado);
    expect([...antes.keys()].sort()).toEqual(['p-2', 'p-4', 'p-5']);
    expect(antes.get('p-2')).toEqual({ casa: 'antes: Casa L1' });
    expect(antes.get('p-4')).toEqual({ condutor: 'antes: Luís E.' });
    expect(antes.get('p-5')).toEqual({ condutor: 'antes: Luís E.' });
  });

  it('sem rascunho, vazio', () => {
    expect(antesDasLinhas([], servidor, servidor).size).toBe(0);
  });
});

describe('rotuloBotaoCondutor', () => {
  it('tornar e tirar, com o artigo do veículo', () => {
    expect(rotuloBotaoCondutor('Ana B.', { tipo: 'carrinha', matricula: 'XX1001' }, false)).toBe(
      'Tornar Ana B. condutor da XX 1001',
    );
    expect(rotuloBotaoCondutor('Rui C.', { tipo: 'carro', matricula: 'XX1005' }, true)).toBe(
      'Tirar Rui C. de condutor do XX 1005',
    );
  });
});

describe('teclado nas listas', () => {
  const tecla = (key: string, extra: Partial<TeclaLista> = {}): TeclaLista => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...extra,
  });
  const fechada = { aberta: false, provisoria: false, temSelecao: false, dialogoAberto: false };

  it('setas, Home/End, página e letras mudariam a lista fechada; Alt+↓, espaço e Ctrl não', () => {
    for (const k of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'c', 'Ç', '2']) {
      expect(teclaMudaLista(tecla(k))).toBe(true);
    }
    expect(teclaMudaLista(tecla('ArrowDown', { altKey: true }))).toBe(false);
    expect(teclaMudaLista(tecla(' '))).toBe(false);
    expect(teclaMudaLista(tecla('Tab'))).toBe(false);
    expect(teclaMudaLista(tecla('z', { ctrlKey: true }))).toBe(false);
  });

  it('com a lista fechada, ↓ e as letras abrem-na em vez de mudar a pessoa', () => {
    expect(acaoTeclaLista(tecla('ArrowDown'), fechada)).toBe('abrir');
    expect(acaoTeclaLista(tecla('c'), fechada)).toBe('abrir');
    expect(acaoTeclaLista(tecla('Tab'), fechada)).toBeNull();
    expect(acaoTeclaLista(tecla('Enter'), fechada)).toBeNull();
  });

  it('com a lista aberta as teclas são dela', () => {
    expect(acaoTeclaLista(tecla('ArrowDown'), { ...fechada, aberta: true })).toBeNull();
  });

  it('os atalhos do modo de edição também funcionam na lista', () => {
    expect(acaoTeclaLista(tecla('z', { ctrlKey: true }), fechada)).toBe('desfazer');
    expect(acaoTeclaLista(tecla('Z', { metaKey: true, shiftKey: true }), fechada)).toBe('refazer');
    expect(acaoTeclaLista(tecla('y', { ctrlKey: true }), fechada)).toBe('refazer');
    expect(acaoTeclaLista(tecla('Escape'), { ...fechada, temSelecao: true })).toBe('limpar-selecao');
    expect(acaoTeclaLista(tecla('Escape'), fechada)).toBeNull();
    // Com um diálogo aberto os atalhos são dele.
    expect(acaoTeclaLista(tecla('z', { ctrlKey: true }), { ...fechada, dialogoAberto: true })).toBeNull();
  });

  it('uma escolha provisória: Enter grava; Esc e Ctrl+Z anulam-na (antes de desfazer outra coisa)', () => {
    const provisoria = { ...fechada, provisoria: true, temSelecao: true };
    expect(acaoTeclaLista(tecla('Enter'), provisoria)).toBe('confirmar');
    expect(acaoTeclaLista(tecla('Escape'), provisoria)).toBe('anular');
    expect(acaoTeclaLista(tecla('z', { ctrlKey: true }), provisoria)).toBe('anular');
    expect(acaoTeclaLista(tecla('y', { ctrlKey: true }), provisoria)).toBe('refazer');
  });
});
