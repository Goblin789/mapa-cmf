import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import { agruparPorCliente, clientesPorOrdem, contagemDoCliente, divisaoPorCliente } from './agrupar';
import { estadoFicticio } from './dadosFicticios';

describe('clientesPorOrdem', () => {
  it('ordena pela ordem dos clientes', () => {
    expect(clientesPorOrdem(estadoFicticio().clientes).map((c) => c.id)).toEqual(['beta', 'alfa', 'gama']);
  });
});

describe('agruparPorCliente', () => {
  const estado = estadoFicticio();
  const ind = indexar(estado);

  it('agrupa pela ordem dos clientes e mantém a ordem das pessoas dentro de cada grupo', () => {
    const grupos = agruparPorCliente(ind.semTransporte, ind);
    expect(grupos.map((g) => [g.clienteId, g.pessoas.map((p) => p.nomeCurto)])).toEqual([
      ['beta', ['Filipe I.']],
      ['alfa', ['Gil J.', 'Hugo K.']],
    ]);
    expect(grupos[0]?.cliente?.nome).toBe('Beta');
  });

  it('usa o cliente da obra quando a pessoa tem obra', () => {
    const grupos = agruparPorCliente(ind.foraDasCasas, ind);
    expect(grupos.map((g) => [g.clienteId, g.pessoas.map((p) => p.id)])).toEqual([
      ['alfa', ['p7']],
      ['gama', ['p5']],
    ]);
  });

  it('põe clientes desconhecidos no fim, sem cliente', () => {
    const [a, b] = estado.pessoas;
    if (!a || !b) throw new Error('Faltam pessoas nos dados fictícios');
    const grupos = agruparPorCliente([{ ...a, clienteId: 'zeta' }, b], ind);
    expect(grupos.map((g) => g.clienteId)).toEqual(['beta', 'zeta']);
    expect(grupos[1]?.cliente).toBeNull();
  });

  it('devolve lista vazia sem pessoas', () => {
    expect(agruparPorCliente([], ind)).toEqual([]);
  });
});

describe('divisaoPorCliente', () => {
  const ind = indexar(estadoFicticio());

  it('tira os zeros e ordena pela ordem dos clientes', () => {
    const divisao = divisaoPorCliente({ alfa: 3, gama: 1, beta: 0, outro: 2 }, ind.clientes);
    expect(divisao.map((d) => [d.clienteId, d.n])).toEqual([
      ['alfa', 3],
      ['gama', 1],
      ['outro', 2],
    ]);
    expect(divisao[2]?.cliente).toBeNull();
  });
});

describe('contagemDoCliente', () => {
  it('lê o número do cliente e devolve 0 para os que faltam, mesmo com nomes do protótipo', () => {
    const porCliente = Object.fromEntries([['alfa', 4]]);
    expect(contagemDoCliente(porCliente, 'alfa')).toBe(4);
    expect(contagemDoCliente(porCliente, 'beta')).toBe(0);
    expect(contagemDoCliente(porCliente, 'constructor')).toBe(0);
    expect(contagemDoCliente(porCliente, 'toString')).toBe(0);
  });
});
