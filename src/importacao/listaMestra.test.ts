import { describe, expect, it } from 'vitest';
import { CABECALHO_PESSOAL, folhaExtraFicticia, folhaPessoalFicticia } from './dadosFicticios';
import { lerFolhaExtra, lerFolhaPessoal, partirNomeCurto } from './listaMestra';

describe('folha Pessoal', () => {
  it('lê as linhas pelo cabeçalho e ignora linhas vazias', () => {
    const { linhas, erros } = lerFolhaPessoal(folhaPessoalFicticia());
    expect(erros).toEqual([]);
    expect(linhas).toHaveLength(5);
    expect(linhas[0]).toEqual({
      folha: 'Pessoal',
      linha: 2,
      numero: '900-001',
      apelidos: 'Silva Teste',
      nome: 'João',
      nomeCurto: 'João Teste',
      cliente: 'ALFA',
      casa: 'Casa 1 Rue de la Foret',
      carrinha: 'AA1111',
      observacoes: null,
    });
    // O Nº original guarda os espaços do meio.
    expect(linhas[2]?.numero).toBe('900- 002_3');
    expect(linhas[3]).toMatchObject({ numero: null, casa: null, carrinha: null, observacoes: 'sem dados' });
  });

  it('encontra o cabeçalho mesmo que não esteja na primeira linha e com outra ordem de colunas', () => {
    const { linhas } = lerFolhaPessoal([
      ['Lista de pessoal'],
      [],
      ['Nome no mapa', 'Cliente', 'Casa', 'Carrinha', 'Nº', 'Apelidos', 'Nome'],
      ['Ana Teste', 'ALFA', 'Casa B', 'BB2222', 900123, 'Teste', 'Ana'],
    ]);
    expect(linhas).toEqual([
      expect.objectContaining({ linha: 4, nomeCurto: 'Ana Teste', numero: '900123', casa: 'Casa B' }),
    ]);
  });

  it('erro bloqueante sem cabeçalho, com colunas em falta ou sem nome no mapa', () => {
    expect(lerFolhaPessoal([['a', 'b']]).erros[0]?.bloqueante).toBe(true);
    const semCasa = lerFolhaPessoal([CABECALHO_PESSOAL.filter((c) => c !== 'Casa')]);
    expect(semCasa.erros[0]).toMatchObject({ bloqueante: true, mensagem: expect.stringContaining('casa') });
    const semNome = lerFolhaPessoal([CABECALHO_PESSOAL, ['900-1', 'X', 'Y', null, 'ALFA', null, null, null]]);
    expect(semNome.linhas).toEqual([]);
    expect(semNome.erros[0]).toMatchObject({ bloqueante: true, onde: 'Pessoal, linha 2' });
  });
});

describe('folha "Não estão na lista"', () => {
  it('parte o nome curto em nome e apelidos e não tem Nº', () => {
    const { linhas, erros } = lerFolhaExtra(folhaExtraFicticia());
    expect(erros).toEqual([]);
    expect(linhas[0]).toMatchObject({
      folha: 'Não estão na lista',
      numero: null,
      nome: 'Ana',
      apelidos: 'Extra',
      nomeCurto: 'Ana Extra',
      cliente: 'BÊTA',
      casa: 'Casa B',
      carrinha: 'BB2222',
    });
    expect(linhas).toHaveLength(2);
  });

  it('partirNomeCurto', () => {
    expect(partirNomeCurto('Ana Maria Teste')).toEqual({ nome: 'Ana', apelidos: 'Maria Teste' });
    expect(partirNomeCurto('Ana')).toEqual({ nome: 'Ana', apelidos: '' });
  });
});
