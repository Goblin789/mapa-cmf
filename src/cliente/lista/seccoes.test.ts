import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import { aplicarOperacoes } from '../../dominio/operacoes';
import { criarPessoa, estadoExemplo } from '../../dominio/teste-fabrica';
import {
  aConfirmarNaVista,
  condutorPrimeiro,
  criarFiltro,
  type Filtros,
  filtrosAtivos,
  juntarEmBlocos,
  lugaresVazios,
  ordenarPorClienteENome,
  SEM_FILTROS,
  type Seccao,
  seccaoDaPessoa,
  seccoesDaVista,
  seccoesVisiveis,
} from './seccoes';

const estado = estadoExemplo();
const ind = indexar(estado);

/** [chave, ids das pessoas] de cada secção. */
function resumo(seccoes: Seccao[]) {
  return seccoes.map((s) => [s.chave, s.pessoas.map((p) => p.id)]);
}

function filtros(f: Partial<Filtros>): Filtros {
  return { ...SEM_FILTROS, ...f };
}

describe('seccoesDaVista: casas', () => {
  const seccoes = seccoesDaVista('casas', estado, ind, SEM_FILTROS);

  it('uma secção por casa, pela ordem, e no fim "Fora das casas CMF"', () => {
    // Dentro de cada casa: pela ordem dos clientes (cor) e depois pelo nome.
    expect(resumo(seccoes)).toEqual([
      ['casa:casa-1', ['p-bruno', 'p-ana', 'p-celia']],
      ['casa:casa-2', ['p-duarte', 'p-filipe', 'p-elsa']],
      ['casa:casa-3', []],
      ['fora', ['p-gil', 'p-helena']],
    ]);
  });

  it('as casas da mesma morada levam o nome da morada; as outras não', () => {
    expect(seccoes.map((s) => s.grupo?.titulo ?? null)).toEqual(['Morada A', 'Morada A', null, null]);
  });

  it('alvos, lugares e totais', () => {
    const [um, , tres, fora] = seccoes;
    expect(um).toMatchObject({
      alvo: { tipo: 'casa', id: 'casa-1' },
      lugares: 3,
      total: 3,
      porCliente: false,
    });
    // A pessoa inativa da Casa Três não conta.
    expect(tres).toMatchObject({ total: 0, lugares: 4 });
    expect(fora).toMatchObject({
      alvo: { tipo: 'fora' },
      lugares: null,
      porCliente: true,
      titulo: 'Fora das casas CMF',
    });
  });
});

describe('seccoesDaVista: carrinhas, obras e clientes', () => {
  it('carrinhas pela ordem, e no fim "Sem transporte da empresa"', () => {
    const seccoes = seccoesDaVista('carrinhas', estado, ind, SEM_FILTROS);
    expect(resumo(seccoes)).toEqual([
      ['carrinha:zz1001', ['p-bruno', 'p-filipe', 'p-ana', 'p-gil']],
      ['carrinha:zz1002', ['p-duarte', 'p-celia']],
      ['carrinha:zz1003', []],
      ['sem-transporte', ['p-helena', 'p-elsa']],
    ]);
    expect(seccoes[0]).toMatchObject({ lugares: 5, alvo: { tipo: 'carrinha', id: 'zz1001' } });
    expect(seccoes[3]?.alvo).toEqual({ tipo: 'sem-transporte' });
  });

  it('nas carrinhas o condutor vem sempre em primeiro (os outros pela ordem de sempre)', () => {
    // O Gil seria o último (cliente Alfa, "G"); como condutor passa para cima.
    const comCondutor = aplicarOperacoes(estado, [
      { tipo: 'condutor', carrinhaId: 'zz1001', de: null, para: 'p-gil' },
    ]);
    const seccoes = seccoesDaVista('carrinhas', comCondutor, indexar(comCondutor), SEM_FILTROS);
    expect(resumo(seccoes)[0]).toEqual(['carrinha:zz1001', ['p-gil', 'p-bruno', 'p-filipe', 'p-ana']]);
    // Com filtros, se o condutor não passa, a ordem dos outros fica igual.
    // (O cliente da cor do Gil é o da obra, Beta; Bruno e Filipe são Alfa.)
    const soAlfa = seccoesDaVista(
      'carrinhas',
      comCondutor,
      indexar(comCondutor),
      filtros({ clientes: new Set(['cliente-a']) }),
    );
    expect(resumo(soAlfa)[0]).toEqual(['carrinha:zz1001', ['p-bruno', 'p-filipe']]);
  });

  it('obras pela ordem do cliente e depois "Sem obra"', () => {
    const seccoes = seccoesDaVista('obras', estado, ind, SEM_FILTROS);
    expect(resumo(seccoes)).toEqual([
      ['obra:obra-a', ['p-filipe']],
      ['obra:obra-b', ['p-ana', 'p-gil']],
      ['sem-obra', ['p-bruno', 'p-duarte', 'p-celia', 'p-helena', 'p-elsa']],
    ]);
    expect(seccoes.map((s) => s.alvo)).toEqual([
      { tipo: 'obra', id: 'obra-a' },
      { tipo: 'obra', id: 'obra-b' },
      { tipo: 'sem-obra' },
    ]);
  });

  it('sem obras: só "Sem obra", com toda a gente ativa', () => {
    const semObras = { ...estado, obras: [] };
    const seccoes = seccoesDaVista('obras', semObras, indexar(semObras), SEM_FILTROS);
    expect(seccoes.map((s) => s.chave)).toEqual(['sem-obra']);
    expect(seccoes[0]?.total).toBe(8);
  });

  it('clientes pela ordem, com o cliente que dá a cor (o da obra), sem alvo', () => {
    const seccoes = seccoesDaVista('clientes', estado, ind, SEM_FILTROS);
    expect(resumo(seccoes)).toEqual([
      ['cliente:cliente-a', ['p-bruno', 'p-duarte', 'p-filipe']],
      ['cliente:cliente-b', ['p-ana', 'p-celia', 'p-gil', 'p-helena']],
      ['cliente:cliente-i', ['p-elsa']],
    ]);
    expect(seccoes.every((s) => s.alvo === null)).toBe(true);
  });

  it('pessoas de um cliente que não existe ficam numa secção à parte', () => {
    const comDesconhecido = {
      ...estado,
      pessoas: [...estado.pessoas, criarPessoa({ id: 'p-zeta', nomeCurto: 'Zeta Z.', clienteId: 'zeta' })],
    };
    const seccoes = seccoesDaVista('clientes', comDesconhecido, indexar(comDesconhecido), SEM_FILTROS);
    expect(seccoes.at(-1)).toMatchObject({ chave: 'cliente:?', titulo: 'Cliente desconhecido', total: 1 });
  });
});

describe('filtros', () => {
  it('filtrosAtivos', () => {
    expect(filtrosAtivos(SEM_FILTROS)).toBe(false);
    expect(filtrosAtivos(filtros({ texto: '   ' }))).toBe(false);
    expect(filtrosAtivos(filtros({ texto: 'a' }))).toBe(true);
    expect(filtrosAtivos(filtros({ soAConfirmar: true }))).toBe(true);
    expect(filtrosAtivos(filtros({ clientes: new Set(['x']) }))).toBe(true);
  });

  it('por cliente (o da cor): os nomes saem, as secções e os totais ficam', () => {
    const seccoes = seccoesDaVista('casas', estado, ind, filtros({ clientes: new Set(['cliente-a']) }));
    expect(resumo(seccoes)).toEqual([
      ['casa:casa-1', ['p-bruno']],
      ['casa:casa-2', ['p-duarte', 'p-filipe']],
      ['casa:casa-3', []],
      ['fora', []],
    ]);
    expect(seccoes[0]?.total).toBe(3);
  });

  it('vários clientes de uma vez', () => {
    const seccoes = seccoesDaVista(
      'carrinhas',
      estado,
      ind,
      filtros({ clientes: new Set(['cliente-i', 'cliente-b']) }),
    );
    expect(seccoes.find((s) => s.chave === 'sem-transporte')?.pessoas.map((p) => p.id)).toEqual([
      'p-helena',
      'p-elsa',
    ]);
  });

  it('"a confirmar" depende da vista: a casa, a carrinha ou qualquer das duas', () => {
    const duarte = ind.pessoas.get('p-duarte');
    const gil = ind.pessoas.get('p-gil');
    if (!duarte || !gil) throw new Error('Faltam pessoas no exemplo');
    expect(aConfirmarNaVista(gil, 'casas')).toBe(true);
    expect(aConfirmarNaVista(duarte, 'casas')).toBe(false);
    expect(aConfirmarNaVista(duarte, 'carrinhas')).toBe(true);
    expect(aConfirmarNaVista(duarte, 'clientes')).toBe(true);

    const nasCasas = seccoesDaVista('casas', estado, ind, filtros({ soAConfirmar: true }));
    expect(nasCasas.flatMap((s) => s.pessoas.map((p) => p.id))).toEqual(['p-gil']);
    const nasCarrinhas = seccoesDaVista('carrinhas', estado, ind, filtros({ soAConfirmar: true }));
    expect(nasCarrinhas.flatMap((s) => s.pessoas.map((p) => p.id))).toEqual(['p-duarte']);
  });

  it('por nome, sem acentos nem maiúsculas, também pelo nome completo e pelos alternativos', () => {
    const filtro = (texto: string) =>
      estado.pessoas.filter(criarFiltro(filtros({ texto }), 'casas', ind)).map((p) => p.id);
    expect(filtro('CELIA')).toEqual(['p-celia']);
    expect(filtro('exemplo')).toEqual(['p-bruno']);
    const comAlternativo = criarPessoa({
      nomeCurto: 'Xavier P.',
      nomesAlternativos: ['Xico Pinto'],
      numero: '900-123_2',
    });
    const f = (texto: string) => criarFiltro(filtros({ texto }), 'casas', ind)(comAlternativo);
    expect(f('xico')).toBe(true);
    expect(f('900 123')).toBe(true);
    expect(f('nada')).toBe(false);
  });
});

describe('ordenarPorClienteENome', () => {
  it('pela ordem dos clientes; clientes desconhecidos no fim', () => {
    const pessoas = [
      criarPessoa({ nomeCurto: 'Zé', clienteId: 'cliente-b' }),
      criarPessoa({ nomeCurto: 'Abel', clienteId: 'desconhecido' }),
      criarPessoa({ nomeCurto: 'Óscar', clienteId: 'cliente-a' }),
      criarPessoa({ nomeCurto: 'Ana', clienteId: 'cliente-a' }),
    ];
    expect(ordenarPorClienteENome(pessoas, ind).map((p) => p.nomeCurto)).toEqual([
      'Ana',
      'Óscar',
      'Zé',
      'Abel',
    ]);
  });
});

describe('seccoesVisiveis', () => {
  const comFiltro = seccoesDaVista('casas', estado, ind, filtros({ texto: 'gil' }));

  it('sem filtros mostra tudo', () => {
    const todas = seccoesDaVista('casas', estado, ind, SEM_FILTROS);
    expect(seccoesVisiveis(todas, false, false)).toHaveLength(4);
  });

  it('com filtros esconde as secções sem ninguém', () => {
    expect(seccoesVisiveis(comFiltro, true, false).map((v) => v.seccao.chave)).toEqual(['fora']);
  });

  it('no modo de edição ficam só com o cabeçalho, para se poder largar lá', () => {
    expect(seccoesVisiveis(comFiltro, true, true).map((v) => [v.seccao.chave, v.soCabecalho])).toEqual([
      ['casa:casa-1', true],
      ['casa:casa-2', true],
      ['casa:casa-3', true],
      ['fora', false],
    ]);
  });

  it('as secções por cliente não são alvos: escondem-se mesmo no modo de edição', () => {
    const clientes = seccoesDaVista('clientes', estado, ind, filtros({ texto: 'gil' }));
    expect(seccoesVisiveis(clientes, true, true).map((v) => v.seccao.chave)).toEqual(['cliente:cliente-b']);
  });
});

describe('condutorPrimeiro', () => {
  const [a, b, c] = [criarPessoa({ id: 'a' }), criarPessoa({ id: 'b' }), criarPessoa({ id: 'c' })];

  it('passa o condutor para o início sem mexer nos outros', () => {
    expect(condutorPrimeiro([a, b, c], { condutorId: 'c' }).map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(condutorPrimeiro([a, b, c], { condutorId: 'a' }).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('sem condutor, ou com um condutor que não está na lista, fica igual (numa cópia)', () => {
    const lista = [a, b, c];
    expect(condutorPrimeiro(lista, { condutorId: null })).toEqual(lista);
    expect(condutorPrimeiro(lista, { condutorId: 'x' })).toEqual(lista);
    expect(condutorPrimeiro(lista, { condutorId: null })).not.toBe(lista);
  });
});

describe('casas que contam sempre como cheias', () => {
  // casa-3 tem 4 lugares e ninguém; casa-2 tem 2 lugares e 3 moradores.
  const sempreCheias = {
    ...estado,
    casas: estado.casas.map((c) =>
      c.id === 'casa-3' || c.id === 'casa-2' ? { ...c, sempreCheia: true } : c,
    ),
  };
  const seccoes = seccoesDaVista('casas', sempreCheias, indexar(sempreCheias), SEM_FILTROS);

  it('os lugares são os moradores: sem lugares livres desenhados', () => {
    const [, dois, tres] = seccoes;
    if (!dois || !tres) throw new Error('Faltam secções');
    expect([dois.lugares, dois.total, lugaresVazios(dois, false)]).toEqual([3, 3, 0]);
    expect([tres.lugares, tres.total, lugaresVazios(tres, false)]).toEqual([0, 0, 0]);
  });
});

describe('lugaresVazios', () => {
  const [um, dois, tres, fora] = seccoesDaVista('casas', estado, ind, SEM_FILTROS);

  it('lotação menos quem lá está; nunca negativo; nada nos grupos sem lugares', () => {
    if (!um || !dois || !tres || !fora) throw new Error('Faltam secções');
    expect(lugaresVazios(um, false)).toBe(0);
    expect(lugaresVazios(dois, false)).toBe(0);
    expect(lugaresVazios(tres, false)).toBe(4);
    expect(lugaresVazios(fora, false)).toBe(0);
  });

  it('com filtros não se desenham (a lista não está completa)', () => {
    if (!tres) throw new Error('Falta a secção');
    expect(lugaresVazios(tres, true)).toBe(0);
  });
});

describe('juntarEmBlocos', () => {
  it('junta as casas da mesma morada e as soltas seguidas', () => {
    const seccoes = seccoesDaVista('casas', estado, ind, SEM_FILTROS);
    const blocos = juntarEmBlocos(seccoes, (s) => s.grupo);
    expect(blocos.map((b) => [b.titulo, b.itens.map((s) => s.chave)])).toEqual([
      ['Morada A', ['casa:casa-1', 'casa:casa-2']],
      [null, ['casa:casa-3', 'fora']],
    ]);
    expect(new Set(blocos.map((b) => b.chave)).size).toBe(blocos.length);
  });

  it('grupos diferentes seguidos ficam em blocos diferentes', () => {
    const g = (chave: string | null) => (chave ? { chave, titulo: chave.toUpperCase() } : null);
    const blocos = juntarEmBlocos(['a', 'a', 'b', null, null, 'a'], g);
    expect(blocos.map((b) => [b.titulo, b.itens.length])).toEqual([
      ['A', 2],
      ['B', 1],
      [null, 2],
      ['A', 1],
    ]);
    expect(new Set(blocos.map((b) => b.chave)).size).toBe(blocos.length);
  });
});

describe('seccaoDaPessoa', () => {
  it('a secção onde a pessoa aparece nesta vista', () => {
    const casas = seccoesDaVista('casas', estado, ind, SEM_FILTROS);
    expect(seccaoDaPessoa(casas, 'p-gil')).toBe('fora');
    expect(seccaoDaPessoa(casas, 'p-elsa')).toBe('casa:casa-2');
    expect(seccaoDaPessoa(casas, 'p-ivo')).toBeNull();
  });
});
