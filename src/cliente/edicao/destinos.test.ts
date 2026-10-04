import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import { criarIndisponibilidade, criarObra, estadoExemplo } from '../../dominio/teste-fabrica';
import {
  ativoValido,
  destinosEscolhiveis,
  filtrarDestinos,
  montarDestinos,
  proximoAtivo,
  textoLivres,
  tituloMover,
} from './destinos';

function destinosDe(pessoaIds: string[], estado = estadoExemplo()) {
  return montarDestinos(estado, indexar(estado), pessoaIds);
}

describe('textoLivres', () => {
  it('livres, cheia ou a mais', () => {
    expect(textoLivres(6, 9)).toBe('3 livres');
    expect(textoLivres(8, 9)).toBe('1 livre');
    expect(textoLivres(9, 9)).toBe('cheia');
    expect(textoLivres(11, 9)).toBe('2 a mais');
  });
});

describe('montarDestinos', () => {
  it('agrupa casas, carrinhas e obras, cada grupo com o seu destino especial no fim', () => {
    const grupos = destinosDe(['p-helena']);
    expect(grupos.map((g) => g.titulo)).toEqual(['Casas', 'Carrinhas', 'Obras']);
    expect(grupos[0]?.destinos.map((d) => d.rotulo)).toEqual([
      'Casa Um',
      'Casa Dois',
      'Casa Três',
      'Fora das casas CMF',
    ]);
    expect(grupos[1]?.destinos.map((d) => d.rotulo)).toEqual([
      'ZZ 1001',
      'ZZ 1002',
      'ZZ 1003',
      'Sem transporte da empresa',
    ]);
    // Obras por ordem alfabética.
    expect(grupos[2]?.destinos.map((d) => d.rotulo)).toEqual(['Obra Alfa', 'Obra Beta', 'Sem obra']);
  });

  it('sem obras não há grupo de obras', () => {
    const estado = { ...estadoExemplo(), obras: [] };
    expect(destinosDe(['p-helena'], estado).map((g) => g.tipo)).toEqual(['casa', 'carrinha']);
  });

  it('calcula a lotação de agora e a de depois (quem já lá está não conta duas vezes)', () => {
    // Ana já está na casa-1 (3/3); Helena não.
    const [casas] = destinosDe(['p-ana', 'p-helena']);
    const casaUm = casas?.destinos.find((d) => d.rotulo === 'Casa Um');
    expect(casaUm?.lotacao).toEqual({
      ocupados: 3,
      lugares: 3,
      nivel: 'cheio',
      depois: 4,
      nivelDepois: 'excesso',
      temporarios: null,
    });
    expect(casaUm?.jaLa).toBe(1);
    expect(casaUm?.todosJaLa).toBe(false);
    const fora = casas?.destinos.find((d) => d.especial);
    expect(fora).toMatchObject({ pessoas: 2, jaLa: 1, lotacao: null });
  });

  it('marca o destino onde todas as pessoas já estão', () => {
    const [casas, carrinhas] = destinosDe(['p-ana', 'p-bruno']);
    expect(casas?.destinos.filter((d) => d.todosJaLa).map((d) => d.rotulo)).toEqual(['Casa Um']);
    expect(carrinhas?.destinos.filter((d) => d.todosJaLa).map((d) => d.rotulo)).toEqual(['ZZ 1001']);
  });

  it('ignora ids de pessoas que não existem', () => {
    const [casas] = destinosDe(['nao-existe', 'p-helena']);
    expect(casas?.destinos.find((d) => d.especial)?.todosJaLa).toBe(true);
  });

  it('obra: o cliente vai no detalhe e na marca de cor', () => {
    const estado = estadoExemplo();
    estado.obras.push(criarObra({ id: 'obra-c', nome: 'Armazém', clienteId: 'cliente-i' }));
    const obras = destinosDe(['p-ana'], estado)[2];
    expect(obras?.destinos[0]).toMatchObject({
      rotulo: 'Armazém',
      detalhe: 'Interno',
      clienteId: 'cliente-i',
    });
  });
});

describe('montarDestinos com indisponíveis (M2)', () => {
  // Hoje 04/10: o Bruno (ZZ 1001) está fora até 12/10 e o Gil (ZZ 1001) sem data de regresso; a Célia
  // (ZZ 1002) só a partir de 20/10 (ainda conta). Dados fictícios.
  const estado = {
    ...estadoExemplo(),
    indisponibilidades: [
      criarIndisponibilidade({ pessoaId: 'p-bruno', inicio: '2026-10-01', fim: '2026-10-12' }),
      criarIndisponibilidade({ pessoaId: 'p-gil', inicio: '2026-10-03', fim: null }),
      criarIndisponibilidade({ pessoaId: 'p-celia', inicio: '2026-10-20', fim: '2026-10-25' }),
    ],
  };
  const ind = indexar(estado, '2026-10-04');
  const carrinha = (ids: string[], rotulo: string) =>
    montarDestinos(estado, ind, ids)[1]?.destinos.find((d) => d.rotulo === rotulo);

  it('na carrinha, quem está indisponível hoje não ocupa lugar; diz até quando o lugar está livre', () => {
    // ZZ 1001: Ana, Bruno, Filipe e Gil (4/5) → 2/5, com 2 lugares livres só até 12/10 (o Bruno volta primeiro).
    expect(carrinha(['p-helena'], 'ZZ 1001')?.lotacao).toEqual({
      ocupados: 2,
      lugares: 5,
      nivel: 'livre',
      depois: 3,
      nivelDepois: 'livre',
      temporarios: '2 livres até 12/10',
    });
    // A lista continua a ter toda a gente.
    expect(carrinha(['p-helena'], 'ZZ 1001')?.pessoas).toBe(4);
  });

  it('quem vai e está indisponível hoje também não conta no "fica"', () => {
    // O Bruno (indisponível) e a Helena vão para a ZZ 1002 (2/2): fica 3/2, não 4/2.
    const zz1002 = carrinha(['p-bruno', 'p-helena'], 'ZZ 1002');
    expect(zz1002?.lotacao).toMatchObject({ ocupados: 2, depois: 3, temporarios: null });
  });

  it('nas casas a cama não se liberta', () => {
    const casaUm = montarDestinos(estado, ind, ['p-helena'])[0]?.destinos.find((d) => d.rotulo === 'Casa Um');
    expect(casaUm?.lotacao).toMatchObject({ ocupados: 3, depois: 4, temporarios: null });
  });
});

describe('filtrarDestinos', () => {
  const grupos = destinosDe(['p-helena']);

  it('sem texto nem tipo devolve tudo', () => {
    expect(filtrarDestinos(grupos, '', null)).toEqual(grupos);
  });

  it('filtra por tipo', () => {
    expect(filtrarDestinos(grupos, '', 'carrinha').map((g) => g.tipo)).toEqual(['carrinha']);
  });

  it('pesquisa sem acentos nem maiúsculas, também na morada e no nome do local', () => {
    expect(filtrarDestinos(grupos, 'tres', null)[0]?.destinos.map((d) => d.rotulo)).toEqual(['Casa Três']);
    expect(
      filtrarDestinos(grupos, 'morada b', 'casa')
        .flatMap((g) => g.destinos)
        .map((d) => d.rotulo),
    ).toEqual(['Casa Três']);
  });

  it('matrículas com ou sem espaço, e as alternativas', () => {
    const rotulos = (texto: string) =>
      filtrarDestinos(grupos, texto, null)
        .flatMap((g) => g.destinos)
        .map((d) => d.rotulo);
    expect(rotulos('zz 1002')).toEqual(['ZZ 1002']);
    expect(rotulos('ZZ1002')).toEqual(['ZZ 1002']);
    expect(rotulos('qq9999')).toEqual(['ZZ 1003']);
  });

  it('encontra os grupos especiais por sinónimos', () => {
    expect(filtrarDestinos(grupos, 'sem casa', null).flatMap((g) => g.destinos.map((d) => d.rotulo))).toEqual(
      ['Fora das casas CMF'],
    );
    expect(
      filtrarDestinos(grupos, 'sem carrinha', null).flatMap((g) => g.destinos.map((d) => d.rotulo)),
    ).toEqual(['Sem transporte da empresa']);
  });

  it('grupos sem resultados desaparecem', () => {
    expect(filtrarDestinos(grupos, 'xyz', null)).toEqual([]);
  });
});

describe('navegação com o teclado', () => {
  // Helena está fora das casas e sem transporte: esses dois não se podem escolher.
  const escolhiveis = destinosEscolhiveis(filtrarDestinos(destinosDe(['p-helena']), '', 'carrinha'));

  it('só os destinos que mudam alguma coisa', () => {
    expect(escolhiveis.map((d) => d.rotulo)).toEqual(['ZZ 1001', 'ZZ 1002', 'ZZ 1003']);
  });

  it('setas dão a volta; Home e End vão às pontas', () => {
    expect(proximoAtivo(escolhiveis, null, 'ArrowDown')).toBe('carrinha:zz1001');
    expect(proximoAtivo(escolhiveis, null, 'ArrowUp')).toBe('carrinha:zz1003');
    expect(proximoAtivo(escolhiveis, 'carrinha:zz1003', 'ArrowDown')).toBe('carrinha:zz1001');
    expect(proximoAtivo(escolhiveis, 'carrinha:zz1001', 'ArrowUp')).toBe('carrinha:zz1003');
    expect(proximoAtivo(escolhiveis, 'carrinha:zz1001', 'End')).toBe('carrinha:zz1003');
    expect(proximoAtivo(escolhiveis, 'carrinha:zz1003', 'Home')).toBe('carrinha:zz1001');
    expect(proximoAtivo(escolhiveis, 'casa:desapareceu', 'ArrowDown')).toBe('carrinha:zz1001');
    expect(proximoAtivo([], null, 'ArrowDown')).toBeNull();
  });

  it('ativoValido mantém o ativo se ainda existir; senão vai para o primeiro', () => {
    expect(ativoValido(escolhiveis, 'carrinha:zz1002')).toBe('carrinha:zz1002');
    expect(ativoValido(escolhiveis, 'casa:casa-1')).toBe('carrinha:zz1001');
    expect(ativoValido([], 'carrinha:zz1002')).toBeNull();
  });
});

describe('tituloMover', () => {
  it('uma pessoa com tipo: "Mudar a casa de …"; senão "Mover … para…"', () => {
    expect(tituloMover(['Ana T.'], 'casa')).toBe('Mudar a casa de Ana T.');
    expect(tituloMover(['Ana T.'], 'carrinha')).toBe('Mudar a carrinha de Ana T.');
    expect(tituloMover(['Ana T.'], 'obra')).toBe('Mudar a obra de Ana T.');
    expect(tituloMover(['Ana T.'], null)).toBe('Mover Ana T. para…');
    expect(tituloMover(['Ana T.', 'Bruno E.'], 'casa')).toBe('Mover 2 pessoas para…');
  });
});

describe('montarDestinos: marca e modelo das carrinhas', () => {
  it('o detalhe é a marca com o modelo e a pesquisa encontra pela marca', () => {
    const base = estadoExemplo();
    const estado = {
      ...base,
      carrinhas: base.carrinhas.map((c) =>
        c.id === 'zz1003' ? { ...c, tipo: 'carro' as const, marca: 'Marca Fictícia', modelo: 'Modelo X' } : c,
      ),
    };
    const grupos = destinosDe(['p-helena'], estado);
    const carro = grupos[1]?.destinos.find((d) => d.rotulo === 'ZZ 1003');
    expect(carro?.detalhe).toBe('Marca Fictícia Modelo X');
    expect(
      filtrarDestinos(grupos, 'marca ficticia', 'carrinha').flatMap((g) => g.destinos.map((d) => d.rotulo)),
    ).toEqual(['ZZ 1003']);
  });
});
