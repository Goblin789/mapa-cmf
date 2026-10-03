import { describe, expect, it } from 'vitest';
import { folha, michaelFicticio } from './dadosFicticios';
import { lerBlocoComTitulo, lerGrelha, lerMichael, lerSemCasa, linhaContagens } from './michael';

describe('grelhas do Michael', () => {
  it('uma coluna por cabeçalho da linha 3, nomes até à linha das contagens', () => {
    const casas = michaelFicticio().get('CMF Sarl-CASAS APÓS CONGÉ') ?? [];
    expect(lerGrelha(casas)).toEqual([
      { rotulo: 'Casa 1 Rue de la Foret', celula: 'B3', nomes: ['João Teste'], contagem: 1 },
      // Célula só com espaços ignorada; contagem escrita (3) diferente dos nomes (2).
      { rotulo: 'Casa B', celula: 'C3', nomes: ['Maria Teste', 'Ana Extra'], contagem: 3 },
    ]);
  });

  it('a linha das contagens é a primeira com números', () => {
    const linhas = folha({ B3: 'X', B4: 'Ana', B5: ' ', B7: 2 });
    expect(linhaContagens(linhas, 3, [1])).toBe(6);
    expect(linhaContagens(linhas, 3, [2])).toBeNull();
  });

  it('bloco com título junta as colunas com nomes e soma as contagens', () => {
    const casas = michaelFicticio().get('CMF Sarl-CASAS APÓS CONGÉ') ?? [];
    expect(lerBlocoComTitulo(casas, 'fora casas')).toEqual({
      rotulo: 'FORA CASAS CMF',
      celula: 'E2',
      nomes: ['Rui Teste', 'Joao Teste', 'Pedro Teste'],
      contagem: 2,
    });
    expect(lerBlocoComTitulo(casas, 'nao existe')).toBeNull();
  });

  it('lista a salmão: de F24 para baixo até à primeira célula vazia', () => {
    const casas = michaelFicticio().get('CMF Sarl-CASAS APÓS CONGÉ') ?? [];
    expect(lerSemCasa(casas)).toMatchObject({ celula: 'F24', nomes: ['Zé Teste', 'Bruno Fora'] });
    expect(lerSemCasa(folha({ A1: 'x' }))).toBeNull();
  });

  it('lê as três folhas', () => {
    const m = lerMichael(michaelFicticio());
    expect(m.avisos).toEqual([]);
    expect(m.folhas).toEqual({
      casas: 'CMF Sarl-CASAS APÓS CONGÉ',
      empresas: 'CMF Sarl - EMPRESAS',
      viaturas: 'CMF Sarl - VIATURAS',
    });
    expect(m.empresas.map((g) => [g.rotulo, g.nomes.length, g.contagem])).toEqual([
      ['ALFA', 4, 4],
      ['BÊTA', 3, 3],
      ['GAMA', 1, 1],
    ]);
    expect(m.viaturas.map((g) => [g.rotulo, g.nomes])).toEqual([
      ['AA1111', ['João Teste', 'Rui Outro']],
      ['BB2222', ['Ana Extra']],
      ['QQ0000', ['Pedro Teste']],
    ]);
    expect(m.semTransporte).toEqual({
      rotulo: 'SEM TRANSPORTE DA EMPRESA!',
      celula: 'B11',
      nomes: ['Rui Teste', 'Zé Teste'],
      contagem: 2,
    });
  });

  it('folhas em falta → avisos (não bloqueiam)', () => {
    const m = lerMichael(new Map([['Outra', [[null]]]]));
    expect(m.casas).toEqual([]);
    expect(m.folhas).toEqual({ casas: null, empresas: null, viaturas: null });
    expect(m.avisos).toHaveLength(3);
    expect(m.avisos.every((a) => !a.bloqueante)).toBe(true);
  });
});
