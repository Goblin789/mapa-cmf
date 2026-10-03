import { describe, expect, it } from 'vitest';
import { compararComMichael, distancia } from './comparar';
import { dadosFicticios, folhaExtraFicticia, folhaPessoalFicticia, michaelFicticio } from './dadosFicticios';
import { lerFolhaExtra, lerFolhaPessoal } from './listaMestra';
import { lerMichael } from './michael';
import { montarEntidades } from './montar';
import type { LinhaContagem } from './tipos';

function comparar(comMichael = true) {
  const dados = dadosFicticios();
  const m = montarEntidades(
    lerFolhaPessoal(folhaPessoalFicticia()).linhas,
    lerFolhaExtra(folhaExtraFicticia()).linhas,
    dados,
  );
  return compararComMichael(
    m.entidades,
    dados,
    comMichael ? lerMichael(michaelFicticio()) : null,
    m.extrasExcluidos,
  );
}

const resumo = (linhas: LinhaContagem[]) =>
  linhas.map((l) => [l.rotulo, l.capacidade, l.documento, l.lista, l.michael, l.michaelDeclarado]);

describe('contagens', () => {
  it('por casa: lotação | documento | lista | Michael, com "Fora das casas"', () => {
    expect(resumo(comparar().contagensCasas)).toEqual([
      ['Casa 1 Rue de la Forêt', 2, 1, 1, 1, 1],
      ['Casa B', 4, 2, 2, 2, 3],
      ['Fora das casas CMF', null, null, 3, 3, 2],
    ]);
  });

  it('por carrinha: inclui as vazias e as matrículas só do Michael', () => {
    expect(resumo(comparar().contagensCarrinhas)).toEqual([
      ['AA1111', 5, 2, 2, 2, 2],
      ['BB2222', 9, 1, 1, 1, 1],
      ['CC3333', 5, 0, 0, 0, null],
      ['QQ0000 (só no Michael, D3)', null, null, 0, 1, 1],
      ['Sem transporte da empresa', null, null, 3, 2, 2],
    ]);
  });

  it('por cliente: documento | lista | Michael (EMPRESAS)', () => {
    expect(resumo(comparar().contagensClientes)).toEqual([
      ['Alfa', null, 4, 4, 4, 4],
      ['Bêta', null, 2, 2, 3, 3],
      ['GAMA (só no Michael, D3)', null, null, 0, 1, 1],
    ]);
  });

  it('sem ficheiro do Michael: só lista e documento', () => {
    const d = comparar(false);
    expect(d.michaelDisponivel).toBe(false);
    expect(d.contagensCasas.every((l) => l.michael === null)).toBe(true);
    expect(d.diferencas).toEqual([]);
  });
});

describe('diferenças por pessoa', () => {
  it('casa, carrinha e cliente diferentes ou em falta', () => {
    const d = comparar();
    expect(d.diferencas.map((x) => [x.nomeCurto, x.campo, x.lista, x.michael])).toEqual([
      ['João Teste', 'casa', 'Casa 1 Rue de la Forêt', 'Casa 1 Rue de la Forêt + Fora das casas CMF'],
      ['Maria Teste', 'carrinha', 'AA1111', '— (não aparece nesta folha)'],
      ['Maria Teste', 'cliente', 'Alfa', '— (não aparece nesta folha)'],
      ['Pedro Teste', 'carrinha', 'Sem transporte da empresa (a confirmar)', '"QQ0000" (desconhecido)'],
      ['Rui Teste', 'carrinha', 'Sem transporte da empresa', 'AA1111 + Sem transporte da empresa'],
      ['Zé Teste', 'cliente', 'Alfa', 'Bêta'],
    ]);
  });

  it('a lista a salmão do Michael conta como "fora das casas"', () => {
    const d = comparar();
    expect(d.diferencas.some((x) => x.nomeCurto === 'Zé Teste' && x.campo === 'casa')).toBe(false);
    expect(d.semCasaMichael).toEqual([
      {
        nomeMichael: 'Zé Teste',
        pessoaId: 'p-900-003',
        nomeCurto: 'Zé Teste',
        casaLista: 'Fora das casas CMF (a confirmar)',
      },
      { nomeMichael: 'Bruno Fora', pessoaId: null, nomeCurto: null, casaLista: null },
    ]);
  });

  it('casa por aliasesMichael e por nomes alternativos', () => {
    expect(comparar().aliasesUsados).toEqual([
      { nomeMichael: 'Rui Outro', nomeCurto: 'Rui Teste' },
      { nomeMichael: 'Ruy Teste', nomeCurto: 'Rui Teste' },
    ]);
  });

  it('só no Michael (com nota para os extras excluídos e sugestão para nomes parecidos)', () => {
    expect(comparar().soNoMichael).toEqual([
      {
        nomeMichael: 'Bruno Fora',
        onde: [
          'CMF Sarl-CASAS APÓS CONGÉ › Sem casa (lista à parte, a salmão)',
          'CMF Sarl - EMPRESAS › ALFA',
        ],
        naFolhaExtra: true,
        parecido: null,
      },
      {
        nomeMichael: 'Carla Nova',
        onde: ['CMF Sarl - EMPRESAS › GAMA'],
        naFolhaExtra: false,
        parecido: null,
      },
      {
        nomeMichael: 'Mariia Teste',
        onde: ['CMF Sarl - EMPRESAS › ALFA'],
        naFolhaExtra: false,
        parecido: 'Maria Teste',
      },
    ]);
  });

  it('só na lista e repetidos numa folha do Michael', () => {
    const d = comparar();
    expect(d.soNaLista).toEqual([]);
    expect(d.repetidosNoMichael.map((x) => [x.nomeMichael, x.folha, x.onde.length])).toEqual([
      ['João Teste / Joao Teste', 'CMF Sarl-CASAS APÓS CONGÉ', 2],
      ['Rui Teste / Ruy Teste / Rui Outro', 'CMF Sarl - VIATURAS', 2],
    ]);
  });

  it('pessoa que não aparece em nenhuma folha do Michael fica em "só na lista"', () => {
    const dados = dadosFicticios();
    const m = montarEntidades(lerFolhaPessoal(folhaPessoalFicticia()).linhas, [], dados);
    const michael = lerMichael(michaelFicticio());
    for (const g of [...michael.casas, ...michael.empresas, ...michael.viaturas]) {
      g.nomes = g.nomes.filter((n) => n !== 'Maria Teste');
    }
    const d = compararComMichael(m.entidades, dados, michael);
    expect(d.soNaLista).toEqual([{ pessoaId: 'p-900-001_2', nomeCurto: 'Maria Teste' }]);
    expect(d.diferencas.some((x) => x.nomeCurto === 'Maria Teste')).toBe(false);
  });
});

describe('distancia', () => {
  it('conta as letras diferentes', () => {
    expect(distancia('mariia teste', 'maria teste')).toBe(1);
    expect(distancia('abc', 'abc')).toBe(0);
    expect(distancia('', 'abc')).toBe(3);
  });
});
