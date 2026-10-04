// M2: o Guardar e as frases dos passos com as operações novas (fichas, pessoas novas e saídas, indisponível,
// problemas, obras e reverter). Dados fictícios (estadoExemplo).

import { describe, expect, it } from 'vitest';
import type { EntidadeEditavel, ValorCampo } from '../../dominio/campos';
import { indexar } from '../../dominio/indices';
import {
  aplicarOperacoes,
  type Operacao,
  operacaoApagar,
  operacaoCampo,
  operacaoCondutor,
  operacaoCriar,
  operacoesParaAlvo,
} from '../../dominio/operacoes';
import { AVISO_COMENTARIO_SEM_MOTIVO } from '../../dominio/problemas';
import { criarIndisponibilidade, criarProblema, estadoExemplo } from '../../dominio/teste-fabrica';
import type { Estado, Local, Obra, Pessoa } from '../../dominio/tipos';
import {
  agruparAlteracoes,
  agruparAlteracoesM2,
  avisoDoComentario,
  calcularAvisos,
  contarAlteracoes,
  fraseFixaDoComentario,
  frasesDosConflitos,
  pessoaTemAlteracoes,
  resumirPasso,
  sitioTemAlteracoes,
  temIndisponivelOuProblemas,
} from './resumo';

const HOJE = '2026-10-04';

const LOCAL_NOVO: Local = {
  id: 'local-00000000-novo',
  tipo: 'obra',
  nome: 'Obra Nova',
  morada: '5 Rua Inventada, L-0000 Lugar',
  pais: 'LU',
  lat: 49.62,
  lng: 6.14,
  raioM: 150,
};

const PARQUE_NOVO: Local = {
  ...LOCAL_NOVO,
  id: 'local-00000000-parque',
  tipo: 'estacionamento',
  nome: 'Parque da Obra Nova',
  morada: '9 Rua Inventada, L-0000 Lugar',
};

const OBRA_NOVA: Obra = {
  id: 'obra-00000000-nova',
  nome: 'Obra Nova',
  clienteId: 'cliente-a',
  localId: LOCAL_NOVO.id,
  estacionamentoLocalId: null,
  origem: 'manual',
};

const PESSOA_NOVA: Pessoa = {
  id: 'pessoa-00000000-nova',
  numero: null,
  numeroOriginal: null,
  nome: 'Nuno',
  apelidos: 'Novo',
  nomeCurto: 'Nuno N.',
  nomesAlternativos: [],
  clienteId: 'cliente-a',
  obraId: null,
  casaId: null,
  carrinhaId: null,
  casaAConfirmar: false,
  carrinhaAConfirmar: false,
  telefone: null,
  temCarta: null,
  cartaValidade: null,
  ativa: true,
};

/** Os dados que o Guardar usa: o estado visível e os dois índices com o hoje. */
function guardar(servidor: Estado, pendentes: Operacao[], hoje: string | null = HOJE) {
  const visivel = aplicarOperacoes(servidor, pendentes);
  return {
    visivel,
    avisos: calcularAvisos(
      servidor,
      visivel,
      pendentes,
      indexar(servidor, hoje),
      indexar(visivel, hoje),
      hoje,
    ),
  };
}

/** operacaoCampo sem os tipos genéricos (os testes passam a entidade e o campo em texto). */
function campo(e: Estado, entidade: EntidadeEditavel, id: string, nome: string, para: ValorCampo): Operacao {
  const op = operacaoCampo(e, entidade, id, nome as never, para as never);
  if (!op) throw new Error('operação sem efeito');
  return op;
}

describe('agruparAlteracoesM2 (Guardar: Fichas, Pessoas novas e saídas, Indisponível, Problemas, Obras)', () => {
  it('agrupa por secção e por quem, com as frases do histórico', () => {
    const servidor = estadoExemplo();
    const pendentes: Operacao[] = [
      campo(servidor, 'casa', 'casa-1', 'lotacao', 4),
      campo(servidor, 'pessoa', 'p-bruno', 'telefone', '691 000 000'),
      campo(servidor, 'carrinha', 'zz1001', 'lugares', 6),
      campo(servidor, 'casa', 'casa-1', 'senhorio', 'Senhorio Fictício'),
      operacaoCriar('indisponibilidade', {
        id: 'indisp-00000000-a',
        pessoaId: 'p-ana',
        inicio: '2026-10-06',
        fim: '2026-10-10',
      }),
      operacaoCriar('problema', {
        id: 'problema-00000000-a',
        casaId: 'casa-2',
        carrinhaId: null,
        texto: 'Esquentador avariado',
        abertoEm: HOJE,
        resolvidoEm: null,
      }),
      operacaoCriar('pessoa', PESSOA_NOVA),
      campo(servidor, 'pessoa', 'p-helena', 'ativa', false),
    ];
    const grupos = agruparAlteracoesM2(servidor, aplicarOperacoes(servidor, pendentes), pendentes);
    expect(grupos.map((g) => [g.seccao, g.titulo])).toEqual([
      ['fichas', 'Fichas'],
      ['pessoas', 'Pessoas novas e saídas'],
      ['indisponivel', 'Indisponível'],
      ['problemas', 'Problemas'],
    ]);
    expect(grupos[0]?.itens).toEqual([
      { quem: 'Casa Um', frases: ['lotação: 3 → 4', 'senhorio: — → Senhorio Fictício'] },
      { quem: 'Bruno E.', frases: ['telefone: — → 691 000 000'] },
      { quem: 'ZZ 1001', frases: ['lugares: 5 → 6'] },
    ]);
    expect(grupos[1]?.itens).toEqual([
      { quem: 'Nuno N.', frases: ['entrou (Alfa Construções)'] },
      { quem: 'Helena Z.', frases: ['saiu da empresa'] },
    ]);
    expect(grupos[2]?.itens).toEqual([
      { quem: 'Ana T.', frases: ['indisponível de 06/10/2026 a 10/10/2026'] },
    ]);
    expect(grupos[3]?.itens).toEqual([
      { quem: 'Casa Dois', frases: ['problema aberto: «Esquentador avariado»'] },
    ]);
  });

  it('a obra criada e o seu local (e o estacionamento) dão uma só entrada; o pino (lat e lng) uma frase', () => {
    const servidor = estadoExemplo();
    const obra = { ...OBRA_NOVA, estacionamentoLocalId: PARQUE_NOVO.id };
    const criar: Operacao[] = [
      operacaoCriar('local', LOCAL_NOVO),
      operacaoCriar('local', PARQUE_NOVO),
      operacaoCriar('obra', obra),
    ];
    const [grupo] = agruparAlteracoesM2(servidor, aplicarOperacoes(servidor, criar), criar);
    expect(grupo).toEqual({
      seccao: 'obras',
      titulo: 'Obras',
      itens: [
        {
          quem: 'Obra Nova',
          frases: [
            'criada (Alfa Construções, 5 Rua Inventada, L-0000 Lugar)',
            'estacionamento: 9 Rua Inventada, L-0000 Lugar',
          ],
        },
      ],
    });

    // Mudar o pino da Obra Alfa (o local dela é o "local-obra"): a latitude e a longitude dão uma frase.
    const pino: Operacao[] = [
      campo(servidor, 'local', 'local-obra', 'lat', 49.65),
      campo(servidor, 'local', 'local-obra', 'lng', 6.2),
      campo(servidor, 'obra', 'obra-a', 'clienteId', 'cliente-b'),
    ];
    const grupos = agruparAlteracoesM2(servidor, aplicarOperacoes(servidor, pino), pino);
    expect(grupos).toEqual([
      {
        seccao: 'obras',
        titulo: 'Obras',
        itens: [
          { quem: 'Obra Beta', frases: ['pino mudado de sítio'] },
          { quem: 'Obra Alfa', frases: ['cliente: Alfa Construções → Beta Obras'] },
        ],
      },
    ]);
  });

  it('tirar o estacionamento (e apagar o local dele) dá uma só frase da obra, com a morada e não o id', () => {
    const obra = { ...OBRA_NOVA, estacionamentoLocalId: PARQUE_NOVO.id };
    const servidor = aplicarOperacoes(estadoExemplo(), [
      operacaoCriar('local', LOCAL_NOVO),
      operacaoCriar('local', PARQUE_NOVO),
      operacaoCriar('obra', obra),
    ]);
    const tirar: Operacao[] = [
      campo(servidor, 'obra', obra.id, 'estacionamentoLocalId', null),
      operacaoApagar(servidor, 'local', PARQUE_NOVO.id) as Operacao,
    ];
    expect(agruparAlteracoesM2(servidor, aplicarOperacoes(servidor, tirar), tirar)).toEqual([
      {
        seccao: 'obras',
        titulo: 'Obras',
        itens: [
          {
            quem: 'Obra Nova',
            frases: ['estacionamento: 9 Rua Inventada, L-0000 Lugar → sem estacionamento'],
          },
        ],
      },
    ]);
  });

  it('a obra apagada leva os seus locais numa frase; a morada de uma casa é uma ficha', () => {
    const base = aplicarOperacoes(estadoExemplo(), [
      operacaoCriar('local', LOCAL_NOVO),
      operacaoCriar('obra', OBRA_NOVA),
    ]);
    const apagarObra = operacaoApagar(base, 'obra', OBRA_NOVA.id);
    const apagarLocal = operacaoApagar(base, 'local', LOCAL_NOVO.id);
    if (!apagarObra || !apagarLocal) throw new Error('falta');
    const morada = campo(base, 'local', 'local-b', 'morada', '1 Rua Nova Fictícia');
    const pendentes = [apagarObra, apagarLocal, morada];
    const grupos = agruparAlteracoesM2(base, aplicarOperacoes(base, pendentes), pendentes);
    expect(grupos).toEqual([
      {
        seccao: 'fichas',
        titulo: 'Fichas',
        itens: [{ quem: 'Casa Três', frases: [expect.stringContaining('morada: ')] }],
      },
      { seccao: 'obras', titulo: 'Obras', itens: [{ quem: 'Obra Nova', frases: ['apagada'] }] },
    ]);
  });

  it('sem operações do M2 não há secções novas (as de sempre ficam nos grupos de pessoas)', () => {
    const s = estadoExemplo();
    const ops = operacoesParaAlvo(s, ['p-gil'], { tipo: 'casa', id: 'casa-3' });
    expect(agruparAlteracoesM2(s, aplicarOperacoes(s, ops), ops)).toEqual([]);
  });
});

describe('agruparAlteracoes com o estado visível (M2)', () => {
  it('a pessoa nova e a obra nova têm nome, não o id', () => {
    const servidor = estadoExemplo();
    const passo: Operacao[] = [
      operacaoCriar('local', LOCAL_NOVO),
      operacaoCriar('obra', OBRA_NOVA),
      operacaoCriar('pessoa', PESSOA_NOVA),
      { tipo: 'mover', pessoaId: PESSOA_NOVA.id, campo: 'casaId', de: null, para: 'casa-3' },
      { tipo: 'mover', pessoaId: 'p-helena', campo: 'obraId', de: null, para: OBRA_NOVA.id },
    ];
    const visivel = aplicarOperacoes(servidor, passo);
    const grupos = agruparAlteracoes(servidor, passo, visivel);
    expect(grupos.map((g) => [g.nome, g.alteracoes.map((a) => `${a.de} → ${a.para}`)])).toEqual([
      ['Helena Z.', ['sem obra → Obra Nova']],
      ['Nuno N.', ['Fora das casas CMF → Casa Três']],
    ]);
    // Sem o estado visível fica como antes (o id).
    expect(agruparAlteracoes(servidor, passo).map((g) => g.nome)).toContain(PESSOA_NOVA.id);
  });
});

describe('calcularAvisos — M2', () => {
  it('lotação reduzida que deixa gente a mais: forte', () => {
    const s = estadoExemplo();
    const { avisos } = guardar(s, [campo(s, 'casa', 'casa-1', 'lotacao', 2)]);
    expect(avisos).toContainEqual({
      chave: 'casa-excesso:casa-1',
      gravidade: 'forte',
      texto: 'Casa Um fica com 3 pessoas para 2 lugares (1 a mais).',
    });
  });

  it('lugares da carrinha reduzidos: forte; subir a lotação não avisa', () => {
    const s = estadoExemplo();
    const { avisos } = guardar(s, [campo(s, 'carrinha', 'zz1001', 'lugares', 3)]);
    expect(avisos).toEqual([
      {
        chave: 'carrinha-excesso:zz1001',
        gravidade: 'forte',
        texto: 'ZZ 1001 fica com 4 pessoas para 3 lugares (1 a mais).',
      },
    ]);
    expect(guardar(s, [campo(s, 'carrinha', 'zz1001', 'lugares', 9)]).avisos).toEqual([]);
  });

  it('máx. do contrato mudado para baixo do que lá está: simples; abaixo do tolerado: forte', () => {
    const s = estadoExemplo();
    expect(guardar(s, [campo(s, 'casa', 'casa-2', 'maxContrato', 2)]).avisos).toContainEqual({
      chave: 'casa-contrato:casa-2',
      gravidade: 'simples',
      texto: 'Casa Dois passa o máximo do contrato: 3 lugares usados para 2.',
    });
    expect(guardar(s, [campo(s, 'casa', 'casa-1', 'tolerado', 2)]).avisos).toContainEqual({
      chave: 'casa-contrato:casa-1',
      gravidade: 'forte',
      texto: 'Casa Um passa o tolerado do contrato: 3 lugares usados para 2.',
    });
  });

  it('o condutor fica indisponível hoje por um período do rascunho: simples', () => {
    const s = aplicarOperacoes(estadoExemplo(), [
      operacaoCondutor(estadoExemplo(), 'zz1001', 'p-ana') as Operacao,
    ]);
    const periodo = operacaoCriar('indisponibilidade', {
      id: 'indisp-00000000-ana',
      pessoaId: 'p-ana',
      inicio: HOJE,
      fim: '2026-10-12',
    });
    expect(guardar(s, [periodo]).avisos).toEqual([
      {
        chave: 'condutor-indisponivel:zz1001',
        gravidade: 'simples',
        texto: 'ZZ 1001: o condutor, Ana T., fica indisponível até 12/10.',
      },
    ]);
    // Um período que só começa amanhã não avisa hoje; sem o hoje, ninguém está indisponível.
    const amanha = operacaoCriar('indisponibilidade', {
      id: 'indisp-00000000-ana2',
      pessoaId: 'p-ana',
      inicio: '2026-10-05',
      fim: null,
    });
    expect(guardar(s, [amanha]).avisos).toEqual([]);
    expect(guardar(s, [periodo], null).avisos).toEqual([]);
    // Já estava indisponível (gravado): mudar outra coisa não volta a avisar.
    const gravado = aplicarOperacoes(s, [periodo]);
    expect(guardar(gravado, [campo(gravado, 'carrinha', 'zz1001', 'nota', 'Nota fictícia')]).avisos).toEqual(
      [],
    );
  });

  it('os indisponíveis hoje não ocupam lugar; avisa quando a carrinha passa dos lugares no regresso', () => {
    // ZZ 1002: 2 lugares, Célia e Duarte. A Célia está fora até 12/10 (gravado).
    const s = {
      ...estadoExemplo(),
      indisponibilidades: [
        criarIndisponibilidade({
          id: 'indisp-celia',
          pessoaId: 'p-celia',
          inicio: '2026-10-01',
          fim: '2026-10-12',
        }),
      ],
    };
    const helena = operacoesParaAlvo(s, ['p-helena'], { tipo: 'carrinha', id: 'zz1002' });
    expect(guardar(s, helena).avisos).toEqual([
      {
        chave: 'carrinha-regresso:zz1002',
        gravidade: 'simples',
        texto: 'ZZ 1002 fica com 3/2 quando Célia F. voltar, a 13/10.',
      },
    ]);
    // Sem o período, é gente a mais já hoje (forte) e não há aviso de regresso.
    const semPeriodo = { ...s, indisponibilidades: [] };
    expect(guardar(semPeriodo, helena).avisos.map((a) => a.chave)).toEqual(['carrinha-excesso:zz1002']);
    // Sem data de regresso, não há dia para avisar.
    const semFim = {
      ...s,
      indisponibilidades: [
        criarIndisponibilidade({ id: 'i', pessoaId: 'p-celia', inicio: '2026-10-01', fim: null }),
      ],
    };
    expect(guardar(semFim, helena).avisos).toEqual([]);
  });

  it('regresso: conta quem volta antes e junta quem volta no mesmo dia', () => {
    // ZZ 1001: 5 lugares; Ana, Bruno, Filipe e Gil. Bruno volta a 10/10 e Filipe e Gil a 12/10.
    const s = {
      ...estadoExemplo(),
      indisponibilidades: [
        criarIndisponibilidade({ id: 'i1', pessoaId: 'p-bruno', inicio: '2026-10-01', fim: '2026-10-09' }),
        criarIndisponibilidade({ id: 'i2', pessoaId: 'p-filipe', inicio: '2026-10-01', fim: '2026-10-11' }),
        criarIndisponibilidade({ id: 'i3', pessoaId: 'p-gil', inicio: '2026-10-01', fim: '2026-10-11' }),
      ],
    };
    // Hoje: Ana + Duarte + Helena = 3/5. A 10/10 (Bruno) 4/5; a 12/10 (Filipe e Gil) 6/5.
    const ops = operacoesParaAlvo(s, ['p-duarte', 'p-helena'], { tipo: 'carrinha', id: 'zz1001' });
    expect(guardar(s, ops).avisos.map((a) => a.texto)).toContain(
      'ZZ 1001 fica com 6/5 quando Filipe Q. e Gil N. voltarem, a 12/10.',
    );
  });

  it('uma obra criada sem ninguém não avisa', () => {
    const s = estadoExemplo();
    expect(guardar(s, [operacaoCriar('local', LOCAL_NOVO), operacaoCriar('obra', OBRA_NOVA)]).avisos).toEqual(
      [],
    );
  });

  it('quem sai da empresa não dá "fica fora das casas" (só a carrinha sem condutor, se conduzia)', () => {
    const s = aplicarOperacoes(estadoExemplo(), [
      operacaoCondutor(estadoExemplo(), 'zz1001', 'p-ana') as Operacao,
    ]);
    const saida: Operacao[] = [
      { tipo: 'condutor', carrinhaId: 'zz1001', de: 'p-ana', para: null },
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'casaId', de: 'casa-1', para: null },
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'carrinhaId', de: 'zz1001', para: null },
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'obraId', de: 'obra-b', para: null },
      campo(s, 'pessoa', 'p-ana', 'ativa', false),
    ];
    expect(guardar(s, saida).avisos.map((a) => a.chave)).toEqual(['carrinha-sem-condutor:zz1001']);
  });
});

describe('comentário do Guardar', () => {
  it('frase fixa só com indisponibilidades ou problemas no rascunho', () => {
    const s = estadoExemplo();
    const periodo = operacaoCriar('indisponibilidade', {
      id: 'indisp-00000000-x',
      pessoaId: 'p-ana',
      inicio: HOJE,
      fim: null,
    });
    const problema = operacaoCriar('problema', {
      id: 'problema-00000000-x',
      casaId: null,
      carrinhaId: 'zz1001',
      texto: 'Pneu furado',
      abertoEm: HOJE,
      resolvidoEm: null,
    });
    const lotacao = campo(s, 'casa', 'casa-1', 'lotacao', 4);
    expect(temIndisponivelOuProblemas([lotacao])).toBe(false);
    expect(fraseFixaDoComentario([lotacao])).toBeNull();
    expect(fraseFixaDoComentario([lotacao, periodo])).toBe(AVISO_COMENTARIO_SEM_MOTIVO);
    expect(fraseFixaDoComentario([problema])).toBe(AVISO_COMENTARIO_SEM_MOTIVO);
  });

  it('aviso enquanto se escreve: palavras de saúde sim, nomes e lotação mais baixa não', () => {
    expect(avisoDoComentario('João de baixa até sexta')).toBe(
      `Isto parece um dado de saúde. ${AVISO_COMENTARIO_SEM_MOTIVO}`,
    );
    expect(avisoDoComentario('')).toBeNull();
    expect(avisoDoComentario('Troca combinada com o Ana T. e o encarregado')).toBeNull();
    expect(avisoDoComentario('Lotação mais baixa na Casa Um')).toBeNull();
  });
});

describe('resumirPasso — M2', () => {
  const s = estadoExemplo();

  it('nova obra (com o local no mesmo passo)', () => {
    expect(resumirPasso(s, [operacaoCriar('local', LOCAL_NOVO), operacaoCriar('obra', OBRA_NOVA)])).toBe(
      'Nova obra: Obra Nova',
    );
  });

  it('indisponível: uma pessoa e várias', () => {
    const periodo = (id: string, pessoaId: string, fim: string | null) =>
      operacaoCriar('indisponibilidade', { id, pessoaId, inicio: HOJE, fim });
    expect(resumirPasso(s, [periodo('indisp-00000000-1', 'p-ana', '2026-10-12')])).toBe(
      'Ana T. indisponível até 12/10',
    );
    expect(resumirPasso(s, [periodo('indisp-00000000-1', 'p-ana', null)])).toBe(
      'Ana T. indisponível (sem data de regresso)',
    );
    expect(
      resumirPasso(s, [
        periodo('indisp-00000000-1', 'p-ana', '2026-10-12'),
        periodo('indisp-00000000-2', 'p-gil', '2026-10-12'),
        periodo('indisp-00000000-3', 'p-bruno', '2026-10-12'),
      ]),
    ).toBe('3 pessoas indisponíveis até 12/10');
    expect(
      resumirPasso(s, [
        periodo('indisp-00000000-1', 'p-ana', '2026-10-12'),
        periodo('indisp-00000000-2', 'p-gil', null),
      ]),
    ).toBe('2 pessoas indisponíveis');
  });

  it('uma ficha; o pino (lat e lng) dá uma frase; várias fichas: N alterações', () => {
    expect(resumirPasso(s, [campo(s, 'casa', 'casa-1', 'lotacao', 4)])).toBe('Casa Um — lotação: 3 → 4');
    expect(
      resumirPasso(s, [
        campo(s, 'local', 'local-obra', 'lat', 49.65),
        campo(s, 'local', 'local-obra', 'lng', 6.2),
      ]),
    ).toBe('Obra Beta — pino mudado de sítio');
    expect(
      resumirPasso(s, [campo(s, 'casa', 'casa-1', 'lotacao', 4), campo(s, 'casa', 'casa-2', 'lotacao', 3)]),
    ).toBe('2 alterações');
  });

  it('pessoa nova (com a casa no mesmo passo), saída da empresa e problema', () => {
    expect(
      resumirPasso(s, [
        operacaoCriar('pessoa', PESSOA_NOVA),
        { tipo: 'mover', pessoaId: PESSOA_NOVA.id, campo: 'casaId', de: null, para: 'casa-3' },
      ]),
    ).toBe('Nuno N. — entrou (Alfa Construções)');
    expect(
      resumirPasso(s, [
        { tipo: 'mover', pessoaId: 'p-gil', campo: 'carrinhaId', de: 'zz1001', para: null },
        campo(s, 'pessoa', 'p-gil', 'ativa', false),
      ]),
    ).toBe('Gil N. — saiu da empresa');
    expect(
      resumirPasso(s, [
        operacaoCriar('problema', {
          id: 'problema-00000000-y',
          casaId: 'casa-1',
          carrinhaId: null,
          texto: 'Janela partida',
          abertoEm: HOJE,
          resolvidoEm: null,
        }),
      ]),
    ).toBe('Casa Um — problema aberto: «Janela partida»');
  });

  it('reversão: "Reversão: N alterações"', () => {
    const passo = [
      campo(s, 'casa', 'casa-1', 'lotacao', 4),
      ...operacoesParaAlvo(s, ['p-gil'], { tipo: 'casa', id: 'casa-3' }),
    ];
    expect(resumirPasso(s, passo, { reversao: true })).toBe(`Reversão: ${passo.length} alterações`);
    expect(resumirPasso(s, passo.slice(0, 1), { reversao: true })).toBe('Reversão: 1 alteração');
  });

  it('reversão com um pino: a lat e a lng contam como uma alteração', () => {
    const passo = [
      campo(s, 'casa', 'casa-1', 'lotacao', 4),
      campo(s, 'local', 'local-obra', 'lat', 49.65),
      campo(s, 'local', 'local-obra', 'lng', 6.2),
    ];
    expect(resumirPasso(s, passo, { reversao: true })).toBe('Reversão: 2 alterações');
    expect(resumirPasso(s, passo)).toBe('2 alterações');
  });

  it('os passos de sempre ficam iguais', () => {
    expect(resumirPasso(s, operacoesParaAlvo(s, ['p-gil'], { tipo: 'casa', id: 'casa-3' }))).toBe(
      'Gil N. — casa: Fora das casas CMF → Casa Três',
    );
  });
});

describe('marcas "alterado" com períodos e problemas (pessoaTemAlteracoes / sitioTemAlteracoes)', () => {
  const s = {
    ...estadoExemplo(),
    indisponibilidades: [
      criarIndisponibilidade({ id: 'indisp-ana', pessoaId: 'p-ana', inicio: HOJE, fim: null }),
    ],
    problemas: [
      criarProblema({ id: 'problema-c1', casaId: 'casa-1' }),
      criarProblema({ id: 'problema-z', casaId: null, carrinhaId: 'zz1002' }),
    ],
  };

  it('um período criado, mudado ou apagado marca a pessoa (o mudado só com o estado visível)', () => {
    const fim = campo(s, 'indisponibilidade', 'indisp-ana', 'fim', '2026-10-20');
    expect(pessoaTemAlteracoes([fim], 'p-ana', s)).toBe(true);
    expect(pessoaTemAlteracoes([fim], 'p-ana')).toBe(false);
    expect(pessoaTemAlteracoes([fim], 'p-gil', s)).toBe(false);
    const apagar = operacaoApagar(s, 'indisponibilidade', 'indisp-ana') as Operacao;
    expect(pessoaTemAlteracoes([apagar], 'p-ana', s)).toBe(true);
    const criar = operacaoCriar('indisponibilidade', {
      id: 'indisp-00000000-g',
      pessoaId: 'p-gil',
      inicio: HOJE,
      fim: null,
    });
    expect(pessoaTemAlteracoes([criar], 'p-gil', s)).toBe(true);
    expect(pessoaTemAlteracoes([campo(s, 'pessoa', 'p-gil', 'telefone', '1')], 'p-gil', s)).toBe(true);
  });

  it('um problema resolvido ou novo marca a casa ou a carrinha; a morada (local) marca a casa', () => {
    const resolver = campo(s, 'problema', 'problema-c1', 'resolvidoEm', HOJE);
    expect(sitioTemAlteracoes([resolver], 'casaId', 'casa-1', s)).toBe(true);
    expect(sitioTemAlteracoes([resolver], 'casaId', 'casa-2', s)).toBe(false);
    expect(sitioTemAlteracoes([resolver], 'carrinhaId', 'zz1002', s)).toBe(false);
    const texto = campo(s, 'problema', 'problema-z', 'texto', 'Pneu gasto');
    expect(sitioTemAlteracoes([texto], 'carrinhaId', 'zz1002', s)).toBe(true);
    const novo = operacaoCriar('problema', {
      id: 'problema-00000000-n',
      casaId: null,
      carrinhaId: 'zz1001',
      texto: 'Luz avariada',
      abertoEm: HOJE,
      resolvidoEm: null,
    });
    expect(sitioTemAlteracoes([novo], 'carrinhaId', 'zz1001', s)).toBe(true);
    const morada = campo(s, 'local', 'local-b', 'morada', '2 Rua Fictícia');
    expect(sitioTemAlteracoes([morada], 'casaId', 'casa-3', s)).toBe(true);
    expect(sitioTemAlteracoes([morada], 'casaId', 'casa-1', s)).toBe(false);
    expect(sitioTemAlteracoes([campo(s, 'casa', 'casa-2', 'lotacao', 5)], 'casaId', 'casa-2', s)).toBe(true);
  });
});

describe('contarAlteracoes e frasesDosConflitos (o número bate com as linhas)', () => {
  const s = estadoExemplo();

  it('a lat e a lng do mesmo pino contam uma vez; pinos diferentes contam cada um', () => {
    const lat = campo(s, 'local', 'local-obra', 'lat', 49.65);
    const lng = campo(s, 'local', 'local-obra', 'lng', 6.2);
    const lotacao = campo(s, 'casa', 'casa-1', 'lotacao', 4);
    const mover = operacoesParaAlvo(s, ['p-gil'], { tipo: 'casa', id: 'casa-3' });
    expect(contarAlteracoes([])).toBe(0);
    expect(contarAlteracoes([lat, lng])).toBe(1);
    expect(contarAlteracoes([lat])).toBe(1);
    expect(contarAlteracoes([lotacao, lat, ...mover, lng])).toBe(2 + mover.length);
    const outroPino = { ...lat, id: 'local-outro' } as Operacao;
    expect(contarAlteracoes([lat, lng, outroPino])).toBe(2);
  });

  it('conflitos com a mesma frase (a lat e a lng de um pino) aparecem uma vez', () => {
    const conflitos = [
      { descricao: 'Obra Beta — pino mudado de sítio', campo: 'lat' },
      { descricao: 'Obra Beta — pino mudado de sítio', campo: 'lng' },
      { descricao: 'Casa Um — lotação', campo: 'lotacao' },
    ];
    expect(frasesDosConflitos(conflitos)).toEqual([conflitos[0], conflitos[2]]);
  });
});
