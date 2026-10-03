import { describe, expect, it } from 'vitest';
import {
  type Alvo,
  aplicarOperacoes,
  type CampoMovivel,
  campoDoAlvo,
  chaveAlvo,
  chaveDormida,
  compactarOperacoes,
  descreverOperacao,
  encontrarConflitos,
  lerChaveAlvo,
  lerChaveDormida,
  nomeDaDormida,
  nomeDoValor,
  type Operacao,
  operacaoCondutor,
  operacaoDormida,
  operacoesParaAlvo,
  validarOperacoes,
  valorDoAlvo,
} from './operacoes';
import { criarCarrinha, estadoAleatorio, estadoExemplo } from './teste-fabrica';
import type { Estado } from './tipos';

function mover(pessoaId: string, campo: CampoMovivel, de: string | null, para: string | null): Operacao {
  return { tipo: 'mover', pessoaId, campo, de, para };
}

function condutor(carrinhaId: string, de: string | null, para: string | null): Operacao {
  return { tipo: 'condutor', carrinhaId, de, para };
}

function dormida(carrinhaId: string, de: string | null, para: string | null): Operacao {
  return { tipo: 'dormida', carrinhaId, de, para };
}

/** estadoExemplo com a Ana a conduzir a ZZ 1001 (onde vai) e a Célia a ZZ 1002. */
function comCondutores(): Estado {
  const estado = estadoExemplo();
  return {
    ...estado,
    carrinhas: estado.carrinhas.map((c) =>
      c.id === 'zz1001'
        ? { ...c, condutorId: 'p-ana' }
        : c.id === 'zz1002'
          ? { ...c, condutorId: 'p-celia' }
          : c,
    ),
  };
}

/** Cópia profunda, para provar que uma função não mexe no que recebe. */
function copia(estado: Estado): Estado {
  return structuredClone(estado);
}

const TODOS_OS_ALVOS: Alvo[] = [
  { tipo: 'casa', id: 'casa-1' },
  { tipo: 'fora' },
  { tipo: 'carrinha', id: 'zz1001' },
  { tipo: 'sem-transporte' },
  { tipo: 'obra', id: 'obra-a' },
  { tipo: 'sem-obra' },
];

describe('campoDoAlvo e valorDoAlvo', () => {
  it.each([
    [{ tipo: 'casa', id: 'c' }, 'casaId', 'c'],
    [{ tipo: 'fora' }, 'casaId', null],
    [{ tipo: 'carrinha', id: 'v' }, 'carrinhaId', 'v'],
    [{ tipo: 'sem-transporte' }, 'carrinhaId', null],
    [{ tipo: 'obra', id: 'o' }, 'obraId', 'o'],
    [{ tipo: 'sem-obra' }, 'obraId', null],
  ] as const)('%o → %s = %s', (alvo, campo, valor) => {
    expect(campoDoAlvo(alvo)).toBe(campo);
    expect(valorDoAlvo(alvo)).toBe(valor);
  });
});

describe('chaveAlvo e lerChaveAlvo', () => {
  it('formato estável da chave', () => {
    expect(TODOS_OS_ALVOS.map(chaveAlvo)).toStrictEqual([
      'casa:casa-1',
      'fora',
      'carrinha:zz1001',
      'sem-transporte',
      'obra:obra-a',
      'sem-obra',
    ]);
  });

  it('ida e volta para todos os tipos de alvo', () => {
    for (const alvo of TODOS_OS_ALVOS) expect(lerChaveAlvo(chaveAlvo(alvo))).toStrictEqual(alvo);
  });

  it('ids com ":" e caracteres especiais sobrevivem à ida e volta', () => {
    for (const id of ['a:b', 'x:y:z', ':', 'com espaço', 'açúcar-ç', '"aspas"', '0']) {
      for (const tipo of ['casa', 'carrinha', 'obra'] as const) {
        const alvo: Alvo = { tipo, id };
        expect(lerChaveAlvo(chaveAlvo(alvo)), `${tipo} ${id}`).toStrictEqual(alvo);
      }
    }
  });

  it.each([
    '',
    'casa',
    'casa:',
    ':casa-1',
    ':',
    'CASA:casa-1',
    'pessoa:p-1',
    'fora:x',
    'sem-transporte:x',
    'Fora',
    ' fora',
    'fora ',
    'grupo:local-a',
  ])('chave inválida %j → null', (chave) => {
    expect(lerChaveAlvo(chave)).toBeNull();
  });
});

describe('operacoesParaAlvo', () => {
  it('cria uma operação por pessoa com o valor de partida', () => {
    const estado = estadoExemplo();
    expect(operacoesParaAlvo(estado, ['p-ana', 'p-gil'], { tipo: 'casa', id: 'casa-3' })).toStrictEqual([
      mover('p-ana', 'casaId', 'casa-1', 'casa-3'),
      mover('p-gil', 'casaId', null, 'casa-3'),
    ]);
  });

  it('ignora quem já lá está, quem não existe e ids repetidos (mantém a ordem)', () => {
    const estado = estadoExemplo();
    const ops = operacoesParaAlvo(
      estado,
      ['p-helena', 'p-ana', 'nao-existe', 'p-ana', 'p-bruno', 'p-helena'],
      { tipo: 'carrinha', id: 'zz1001' },
    );
    // p-ana e p-bruno já estão na zz1001.
    expect(ops).toStrictEqual([mover('p-helena', 'carrinhaId', null, 'zz1001')]);
  });

  it('alvos "vazios" (fora, sem transporte, sem obra) levam a null', () => {
    const estado = estadoExemplo();
    expect(operacoesParaAlvo(estado, ['p-ana', 'p-helena'], { tipo: 'fora' })).toStrictEqual([
      mover('p-ana', 'casaId', 'casa-1', null),
    ]);
    expect(operacoesParaAlvo(estado, ['p-celia'], { tipo: 'sem-transporte' })).toStrictEqual([
      mover('p-celia', 'carrinhaId', 'zz1002', null),
    ]);
    expect(operacoesParaAlvo(estado, ['p-filipe', 'p-bruno'], { tipo: 'sem-obra' })).toStrictEqual([
      mover('p-filipe', 'obraId', 'obra-a', null),
    ]);
  });

  it('lista vazia ou só gente que já lá está não dá operações', () => {
    const estado = estadoExemplo();
    expect(operacoesParaAlvo(estado, [], { tipo: 'casa', id: 'casa-1' })).toStrictEqual([]);
    expect(operacoesParaAlvo(estado, ['p-ana', 'p-bruno'], { tipo: 'casa', id: 'casa-1' })).toStrictEqual([]);
  });

  it('não verifica se o destino existe (isso é do validarOperacoes)', () => {
    const estado = estadoExemplo();
    expect(operacoesParaAlvo(estado, ['p-ana'], { tipo: 'obra', id: 'obra-x' })).toStrictEqual([
      mover('p-ana', 'obraId', 'obra-b', 'obra-x'),
    ]);
  });

  it('não altera o estado recebido', () => {
    const estado = estadoExemplo();
    const antes = copia(estado);
    operacoesParaAlvo(estado, ['p-ana'], { tipo: 'fora' });
    expect(estado).toStrictEqual(antes);
  });
});

describe('aplicarOperacoes', () => {
  it('muda o campo e não altera o estado recebido', () => {
    const estado = estadoExemplo();
    const antes = copia(estado);
    const novo = aplicarOperacoes(estado, [mover('p-ana', 'casaId', 'casa-1', 'casa-3')]);
    expect(estado).toStrictEqual(antes);
    expect(novo).not.toBe(estado);
    expect(novo.pessoas.find((p) => p.id === 'p-ana')?.casaId).toBe('casa-3');
    // As outras pessoas e o resto do estado ficam iguais (e são as mesmas referências).
    expect(novo.casas).toBe(estado.casas);
    const bruno = estado.pessoas.find((p) => p.id === 'p-bruno');
    expect(novo.pessoas.find((p) => p.id === 'p-bruno')).toBe(bruno);
    expect(novo.pessoas.map((p) => p.id)).toStrictEqual(estado.pessoas.map((p) => p.id));
  });

  it('sem operações devolve o próprio estado', () => {
    const estado = estadoExemplo();
    expect(aplicarOperacoes(estado, [])).toBe(estado);
  });

  it('mudar a casa limpa a marca "casa a confirmar" (e só essa)', () => {
    const estado = estadoExemplo();
    const gil = aplicarOperacoes(estado, [mover('p-gil', 'casaId', null, 'casa-3')]).pessoas.find(
      (p) => p.id === 'p-gil',
    );
    expect(gil).toMatchObject({ casaId: 'casa-3', casaAConfirmar: false });
    expect(estado.pessoas.find((p) => p.id === 'p-gil')?.casaAConfirmar).toBe(true);

    // Mudar a carrinha ou a obra não mexe na marca da casa.
    const gil2 = aplicarOperacoes(estado, [
      mover('p-gil', 'carrinhaId', 'zz1001', null),
      mover('p-gil', 'obraId', 'obra-b', 'obra-a'),
    ]).pessoas.find((p) => p.id === 'p-gil');
    expect(gil2).toMatchObject({ casaAConfirmar: true, carrinhaId: null, obraId: 'obra-a' });
  });

  it('mudar a carrinha limpa a marca "carrinha a confirmar" (também para "sem transporte")', () => {
    const estado = estadoExemplo();
    const duarte = aplicarOperacoes(estado, [mover('p-duarte', 'carrinhaId', 'zz1002', null)]).pessoas.find(
      (p) => p.id === 'p-duarte',
    );
    expect(duarte).toMatchObject({ carrinhaId: null, carrinhaAConfirmar: false });
  });

  it('aplica por ordem: a última operação da mesma pessoa e campo ganha', () => {
    const estado = estadoExemplo();
    const novo = aplicarOperacoes(estado, [
      mover('p-ana', 'casaId', 'casa-1', 'casa-2'),
      mover('p-ana', 'casaId', 'casa-2', 'casa-3'),
      mover('p-ana', 'carrinhaId', 'zz1001', 'zz1003'),
    ]);
    expect(novo.pessoas.find((p) => p.id === 'p-ana')).toMatchObject({
      casaId: 'casa-3',
      carrinhaId: 'zz1003',
    });
  });

  it('aplica sem olhar para o "de" e ignora pessoas que não existem', () => {
    const estado = estadoExemplo();
    const novo = aplicarOperacoes(estado, [
      mover('p-ana', 'casaId', 'outra-coisa', 'casa-2'),
      mover('nao-existe', 'casaId', null, 'casa-2'),
    ]);
    expect(novo.pessoas.find((p) => p.id === 'p-ana')?.casaId).toBe('casa-2');
    expect(novo.pessoas).toHaveLength(estado.pessoas.length);
  });

  it('em estados aleatórios: só mudam as pessoas e os campos das operações', () => {
    for (let semente = 1; semente <= 40; semente++) {
      const estado = estadoAleatorio(semente);
      const antes = copia(estado);
      const ops = estado.pessoas
        .filter((_, i) => i % 3 === 0)
        .map((p) => mover(p.id, 'carrinhaId', p.carrinhaId, null));
      const novo = aplicarOperacoes(estado, ops);
      expect(estado, `semente ${semente}`).toStrictEqual(antes);
      novo.pessoas.forEach((p, i) => {
        const original = estado.pessoas[i];
        if (i % 3 === 0)
          expect(p).toStrictEqual({ ...original, carrinhaId: null, carrinhaAConfirmar: false });
        else expect(p).toBe(original);
      });
    }
  });
});

describe('compactarOperacoes', () => {
  it('A → B → C fica A → C', () => {
    expect(
      compactarOperacoes([mover('p1', 'casaId', 'a', 'b'), mover('p1', 'casaId', 'b', 'c')]),
    ).toStrictEqual([mover('p1', 'casaId', 'a', 'c')]);
  });

  it('A → B → A desaparece (também com null)', () => {
    expect(
      compactarOperacoes([mover('p1', 'casaId', 'a', 'b'), mover('p1', 'casaId', 'b', 'a')]),
    ).toStrictEqual([]);
    expect(
      compactarOperacoes([mover('p1', 'carrinhaId', null, 'v'), mover('p1', 'carrinhaId', 'v', null)]),
    ).toStrictEqual([]);
  });

  it('A → A (sem mudança) desaparece', () => {
    expect(compactarOperacoes([mover('p1', 'obraId', 'o', 'o')])).toStrictEqual([]);
  });

  it('mantém separados campos e pessoas diferentes, pela ordem da primeira ocorrência', () => {
    const ops = [
      mover('p1', 'casaId', 'a', 'b'),
      mover('p2', 'casaId', 'a', 'b'),
      mover('p1', 'carrinhaId', null, 'v'),
      mover('p1', 'casaId', 'b', 'c'),
      mover('p2', 'casaId', 'b', 'a'),
    ];
    expect(compactarOperacoes(ops)).toStrictEqual([
      mover('p1', 'casaId', 'a', 'c'),
      mover('p1', 'carrinhaId', null, 'v'),
    ]);
  });

  it('A → B → A → C fica A → C (no sítio da primeira ocorrência)', () => {
    const ops = [
      mover('p1', 'casaId', 'a', 'b'),
      mover('p2', 'obraId', null, 'o'),
      mover('p1', 'casaId', 'b', 'a'),
      mover('p1', 'casaId', 'a', 'c'),
    ];
    expect(compactarOperacoes(ops)).toStrictEqual([
      mover('p1', 'casaId', 'a', 'c'),
      mover('p2', 'obraId', null, 'o'),
    ]);
  });

  it('não altera as operações recebidas', () => {
    const ops = [mover('p1', 'casaId', 'a', 'b'), mover('p1', 'casaId', 'b', 'c')];
    const antes = structuredClone(ops);
    const compactas = compactarOperacoes(ops);
    expect(ops).toStrictEqual(antes);
    expect(compactas[0]).not.toBe(ops[0]);
  });

  it('lista vazia → lista vazia', () => {
    expect(compactarOperacoes([])).toStrictEqual([]);
  });

  it('aplicar as compactadas dá o mesmo estado que aplicar todas (exceto marcas de quem volta ao início)', () => {
    for (let semente = 1; semente <= 40; semente++) {
      const estado = estadoAleatorio(semente);
      const destinos = [null, ...estado.casas.map((c) => c.id)];
      const ops: Operacao[] = [];
      const atual = new Map(estado.pessoas.map((p) => [p.id, p.casaId]));
      estado.pessoas.forEach((p, i) => {
        for (let k = 0; k < i % 4; k++) {
          const para = destinos[(i + k) % destinos.length] ?? null;
          ops.push(mover(p.id, 'casaId', atual.get(p.id) ?? null, para));
          atual.set(p.id, para);
        }
      });
      const todas = aplicarOperacoes(estado, ops);
      const compactas = aplicarOperacoes(estado, compactarOperacoes(ops));
      expect(
        compactas.pessoas.map((p) => p.casaId),
        `semente ${semente}`,
      ).toStrictEqual(todas.pessoas.map((p) => p.casaId));
    }
  });
});

describe('encontrarConflitos', () => {
  it('sem conflitos quando o "de" corresponde ao estado', () => {
    const estado = estadoExemplo();
    expect(
      encontrarConflitos(estado, [
        mover('p-ana', 'casaId', 'casa-1', 'casa-2'),
        mover('p-helena', 'carrinhaId', null, 'zz1001'),
        mover('p-filipe', 'obraId', 'obra-a', null),
      ]),
    ).toStrictEqual([]);
  });

  it('o "de" diferente do atual é conflito, com o esperado e o atual', () => {
    const estado = estadoExemplo();
    expect(
      encontrarConflitos(estado, [
        mover('p-ana', 'carrinhaId', 'zz1002', 'zz1003'),
        mover('p-bruno', 'casaId', 'casa-1', 'casa-2'),
        mover('p-helena', 'casaId', 'casa-2', null),
        mover('p-gil', 'obraId', null, 'obra-a'),
      ]),
    ).toStrictEqual([
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'carrinhaId', esperado: 'zz1002', atual: 'zz1001' },
      { tipo: 'mover', pessoaId: 'p-helena', campo: 'casaId', esperado: 'casa-2', atual: null },
      { tipo: 'mover', pessoaId: 'p-gil', campo: 'obraId', esperado: null, atual: 'obra-b' },
    ]);
  });

  it('é conflito mesmo que a pessoa já esteja no destino (alguém fez a mesma mudança)', () => {
    const estado = estadoExemplo();
    expect(encontrarConflitos(estado, [mover('p-ana', 'casaId', 'casa-2', 'casa-1')])).toStrictEqual([
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'casaId', esperado: 'casa-2', atual: 'casa-1' },
    ]);
  });

  it('pessoas que não existem não são conflito (são erro de validação)', () => {
    expect(encontrarConflitos(estadoExemplo(), [mover('nao-existe', 'casaId', 'x', 'y')])).toStrictEqual([]);
  });

  it('condutor: o "de" tem de ser o condutor atual da carrinha', () => {
    const estado = comCondutores();
    expect(
      encontrarConflitos(estado, [
        condutor('zz1001', 'p-ana', 'p-bruno'),
        condutor('zz1002', null, 'p-duarte'),
        condutor('zz1003', 'p-ivo', null),
        condutor('nao-existe', null, 'p-ana'),
      ]),
    ).toStrictEqual([
      { tipo: 'condutor', carrinhaId: 'zz1002', esperado: null, atual: 'p-celia' },
      { tipo: 'condutor', carrinhaId: 'zz1003', esperado: 'p-ivo', atual: null },
    ]);
  });
});

describe('validarOperacoes', () => {
  it('operações válidas (incluindo para null) não dão erros', () => {
    const estado = estadoExemplo();
    expect(
      validarOperacoes(estado, [
        mover('p-ana', 'casaId', 'casa-1', 'casa-3'),
        mover('p-ana', 'carrinhaId', 'zz1001', null),
        mover('p-helena', 'obraId', null, 'obra-a'),
        mover('p-gil', 'casaId', null, null),
      ]),
    ).toStrictEqual([]);
  });

  it('pessoa inexistente, pessoa inativa e destino inexistente', () => {
    const estado = estadoExemplo();
    expect(
      validarOperacoes(estado, [
        mover('nao-existe', 'casaId', null, 'casa-1'),
        mover('p-ivo', 'casaId', 'casa-3', 'casa-1'),
        mover('p-ana', 'casaId', 'casa-1', 'casa-x'),
        mover('p-ana', 'carrinhaId', 'zz1001', 'zz9999'),
        mover('p-ana', 'obraId', 'obra-b', 'obra-x'),
      ]),
    ).toStrictEqual([
      'A pessoa nao-existe não existe.',
      'Ivo X. não está ativa.',
      'Ana T.: o destino casa-x não existe.',
      'Ana T.: o destino zz9999 não existe.',
      'Ana T.: o destino obra-x não existe.',
    ]);
  });

  it('pessoa inativa com destino inexistente dá os dois erros', () => {
    expect(validarOperacoes(estadoExemplo(), [mover('p-ivo', 'obraId', null, 'obra-x')])).toStrictEqual([
      'Ivo X. não está ativa.',
      'Ivo X.: o destino obra-x não existe.',
    ]);
  });

  it('o destino tem de existir no tipo certo (um id de casa não serve como carrinha)', () => {
    expect(
      validarOperacoes(estadoExemplo(), [mover('p-ana', 'carrinhaId', 'zz1001', 'casa-1')]),
    ).toStrictEqual(['Ana T.: o destino casa-1 não existe.']);
  });

  it('sem operações não há erros', () => {
    expect(validarOperacoes(estadoExemplo(), [])).toStrictEqual([]);
  });
});

describe('validarOperacoes: condutor', () => {
  it('o condutor tem de ir na carrinha (ou entrar nela no mesmo lote)', () => {
    const estado = estadoExemplo();
    expect(validarOperacoes(estado, [condutor('zz1001', null, 'p-ana')])).toStrictEqual([]);
    expect(validarOperacoes(estado, [condutor('zz1001', null, 'p-celia')])).toStrictEqual([
      'Célia F. não vai na carrinha ZZ 1001: não pode ser o condutor.',
    ]);
    expect(
      validarOperacoes(estado, [
        mover('p-helena', 'carrinhaId', null, 'zz1001'),
        condutor('zz1001', null, 'p-helena'),
      ]),
    ).toStrictEqual([]);
    // A ordem não importa: o que conta é o fim.
    expect(
      validarOperacoes(estado, [
        condutor('zz1001', null, 'p-helena'),
        mover('p-helena', 'carrinhaId', null, 'zz1001'),
      ]),
    ).toStrictEqual([]);
  });

  it('o condutor que sai da carrinha tem de deixar de ser condutor no mesmo lote', () => {
    const estado = comCondutores();
    expect(validarOperacoes(estado, [mover('p-ana', 'carrinhaId', 'zz1001', 'zz1003')])).toStrictEqual([
      'Ana T. não vai na carrinha ZZ 1001: não pode ser o condutor.',
    ]);
    expect(
      validarOperacoes(estado, operacoesParaAlvo(estado, ['p-ana'], { tipo: 'sem-transporte' })),
    ).toStrictEqual([]);
    // Mudar de casa ou de obra não mexe na carrinha.
    expect(validarOperacoes(estado, [mover('p-ana', 'casaId', 'casa-1', 'casa-3')])).toStrictEqual([]);
  });

  it('tirar o condutor é sempre válido; pessoa inexistente, inativa ou carrinha inexistente não', () => {
    const estado = comCondutores();
    expect(validarOperacoes(estado, [condutor('zz1001', 'p-ana', null)])).toStrictEqual([]);
    expect(validarOperacoes(estado, [condutor('zz1001', 'p-ana', 'nao-existe')])).toStrictEqual([
      'A pessoa nao-existe não existe.',
    ]);
    expect(validarOperacoes(estado, [condutor('zz1003', null, 'p-ivo')])).toStrictEqual([
      'Ivo X. não está ativa.',
    ]);
    expect(validarOperacoes(estado, [condutor('zz9999', null, 'p-ana')])).toStrictEqual([
      'A carrinha zz9999 não existe.',
    ]);
  });

  it('só verifica as carrinhas mexidas (um condutor antigo incoerente não bloqueia outras mudanças)', () => {
    const estado = estadoExemplo();
    const incoerente = {
      ...estado,
      carrinhas: estado.carrinhas.map((c) => (c.id === 'zz1003' ? { ...c, condutorId: 'p-helena' } : c)),
    };
    expect(validarOperacoes(incoerente, [mover('p-ana', 'casaId', 'casa-1', 'casa-3')])).toStrictEqual([]);
    expect(validarOperacoes(incoerente, [mover('p-gil', 'carrinhaId', 'zz1001', 'zz1003')])).toStrictEqual([
      'Helena Z. não vai na carrinha ZZ 1003: não pode ser o condutor.',
    ]);
  });
});

describe('operacoesParaAlvo e operacaoCondutor', () => {
  it('quem sai da carrinha que conduz deixa de ser o condutor (vai junto uma operação)', () => {
    const estado = comCondutores();
    expect(operacoesParaAlvo(estado, ['p-ana', 'p-bruno'], { tipo: 'carrinha', id: 'zz1003' })).toStrictEqual(
      [
        mover('p-ana', 'carrinhaId', 'zz1001', 'zz1003'),
        condutor('zz1001', 'p-ana', null),
        mover('p-bruno', 'carrinhaId', 'zz1001', 'zz1003'),
      ],
    );
    expect(operacoesParaAlvo(estado, ['p-celia'], { tipo: 'sem-transporte' })).toStrictEqual([
      mover('p-celia', 'carrinhaId', 'zz1002', null),
      condutor('zz1002', 'p-celia', null),
    ]);
  });

  it('mudar o condutor de casa ou de obra, ou para a mesma carrinha, não mexe no condutor', () => {
    const estado = comCondutores();
    expect(operacoesParaAlvo(estado, ['p-ana'], { tipo: 'casa', id: 'casa-3' })).toStrictEqual([
      mover('p-ana', 'casaId', 'casa-1', 'casa-3'),
    ]);
    expect(operacoesParaAlvo(estado, ['p-ana'], { tipo: 'sem-obra' })).toStrictEqual([
      mover('p-ana', 'obraId', 'obra-b', null),
    ]);
    expect(operacoesParaAlvo(estado, ['p-ana'], { tipo: 'carrinha', id: 'zz1001' })).toStrictEqual([]);
  });

  it('operacaoCondutor: definir, trocar e tirar; null se já for assim ou a carrinha não existir', () => {
    const estado = comCondutores();
    expect(operacaoCondutor(estadoExemplo(), 'zz1001', 'p-gil')).toStrictEqual(
      condutor('zz1001', null, 'p-gil'),
    );
    expect(operacaoCondutor(estado, 'zz1001', 'p-gil')).toStrictEqual(condutor('zz1001', 'p-ana', 'p-gil'));
    expect(operacaoCondutor(estado, 'zz1001', null)).toStrictEqual(condutor('zz1001', 'p-ana', null));
    expect(operacaoCondutor(estado, 'zz1001', 'p-ana')).toBeNull();
    expect(operacaoCondutor(estado, 'zz1003', null)).toBeNull();
    expect(operacaoCondutor(estado, 'nao-existe', 'p-ana')).toBeNull();
  });
});

describe('aplicarOperacoes e compactarOperacoes: condutor', () => {
  it('muda o condutor (a última operação da carrinha ganha) sem alterar o estado recebido', () => {
    const estado = estadoExemplo();
    const antes = copia(estado);
    const novo = aplicarOperacoes(estado, [
      condutor('zz1001', null, 'p-ana'),
      condutor('zz1002', null, 'p-celia'),
      condutor('zz1001', 'p-ana', 'p-gil'),
      condutor('nao-existe', null, 'p-ana'),
    ]);
    expect(novo.carrinhas.map((c) => [c.id, c.condutorId])).toStrictEqual([
      ['zz1001', 'p-gil'],
      ['zz1002', 'p-celia'],
      ['zz1003', null],
    ]);
    expect(estado).toStrictEqual(antes);
    // Só com operações de condutor, as pessoas ficam as mesmas (a mesma lista).
    expect(novo.pessoas).toBe(estado.pessoas);
  });

  it('compacta por carrinha: A → B → C fica A → C; A → B → A desaparece', () => {
    expect(
      compactarOperacoes([
        condutor('zz1001', null, 'p-ana'),
        mover('p-ana', 'casaId', 'casa-1', 'casa-2'),
        condutor('zz1001', 'p-ana', 'p-gil'),
        condutor('zz1002', 'p-celia', null),
        condutor('zz1002', null, 'p-celia'),
      ]),
    ).toStrictEqual([condutor('zz1001', null, 'p-gil'), mover('p-ana', 'casaId', 'casa-1', 'casa-2')]);
  });

  it('o condutor que sai e volta: a pessoa fica onde estava e a carrinha sem condutor (como na simulação)', () => {
    const estado = comCondutores();
    const sai = operacoesParaAlvo(estado, ['p-ana'], { tipo: 'carrinha', id: 'zz1003' });
    const volta = operacoesParaAlvo(aplicarOperacoes(estado, sai), ['p-ana'], {
      tipo: 'carrinha',
      id: 'zz1001',
    });
    const todas = [...sai, ...volta];
    expect(compactarOperacoes(todas)).toStrictEqual([condutor('zz1001', 'p-ana', null)]);
    expect(aplicarOperacoes(estado, compactarOperacoes(todas)).carrinhas).toStrictEqual(
      aplicarOperacoes(estado, todas).carrinhas,
    );
    expect(validarOperacoes(estado, compactarOperacoes(todas))).toStrictEqual([]);
  });
});

describe('nomeDoValor', () => {
  it('nomes de casa, carrinha (matrícula) e obra', () => {
    const estado = estadoExemplo();
    expect(nomeDoValor(estado, 'casaId', 'casa-2')).toBe('Casa Dois');
    expect(nomeDoValor(estado, 'carrinhaId', 'zz1003')).toBe('ZZ 1003');
    expect(nomeDoValor(estado, 'obraId', 'obra-a')).toBe('Obra Alfa');
  });

  it('null tem o nome da caixa correspondente', () => {
    const estado = estadoExemplo();
    expect(nomeDoValor(estado, 'casaId', null)).toBe('Fora das casas CMF');
    expect(nomeDoValor(estado, 'carrinhaId', null)).toBe('Sem transporte da empresa');
    expect(nomeDoValor(estado, 'obraId', null)).toBe('sem obra');
  });

  it('ids que não existem aparecem tal como estão', () => {
    const estado = estadoExemplo();
    expect(nomeDoValor(estado, 'casaId', 'casa-x')).toBe('casa-x');
    expect(nomeDoValor(estado, 'carrinhaId', 'zz9999')).toBe('zz9999');
    expect(nomeDoValor(estado, 'obraId', 'obra-x')).toBe('obra-x');
  });
});

describe('descreverOperacao', () => {
  it('frase com o nome curto e os nomes de partida e de chegada', () => {
    const estado = estadoExemplo();
    expect(descreverOperacao(estado, mover('p-ana', 'casaId', 'casa-1', 'casa-3'))).toBe(
      'Ana T. — casa: Casa Um → Casa Três',
    );
    expect(descreverOperacao(estado, mover('p-helena', 'carrinhaId', null, 'zz1001'))).toBe(
      'Helena Z. — carrinha: Sem transporte da empresa → ZZ 1001',
    );
    expect(descreverOperacao(estado, mover('p-filipe', 'obraId', 'obra-a', null))).toBe(
      'Filipe Q. — obra: Obra Alfa → sem obra',
    );
    expect(descreverOperacao(estado, mover('p-gil', 'casaId', null, 'casa-2'))).toBe(
      'Gil N. — casa: Fora das casas CMF → Casa Dois',
    );
  });

  it('pessoa ou valores que não existem aparecem pelo id', () => {
    expect(descreverOperacao(estadoExemplo(), mover('nao-existe', 'obraId', 'obra-x', 'obra-a'))).toBe(
      'nao-existe — obra: obra-x → Obra Alfa',
    );
  });

  it('condutor: matrícula da carrinha e os nomes (ou "sem condutor")', () => {
    const estado = estadoExemplo();
    expect(descreverOperacao(estado, condutor('zz1001', null, 'p-ana'))).toBe(
      'ZZ 1001 — condutor: sem condutor → Ana T.',
    );
    expect(descreverOperacao(estado, condutor('zz1001', 'p-ana', 'p-gil'))).toBe(
      'ZZ 1001 — condutor: Ana T. → Gil N.',
    );
    expect(descreverOperacao(estado, condutor('zz-x', 'p-x', null))).toBe(
      'zz-x — condutor: p-x → sem condutor',
    );
  });
});

describe('onde dorme: chaves', () => {
  it('chaveDormida: a casa manda sobre o local; sem nenhum, null', () => {
    expect(chaveDormida(criarCarrinha({ dormeCasaId: 'casa-1' }))).toBe('casa:casa-1');
    expect(chaveDormida(criarCarrinha({ dormeLocalId: 'local-parque' }))).toBe('local:local-parque');
    expect(chaveDormida(criarCarrinha({ dormeCasaId: 'casa-1', dormeLocalId: 'local-parque' }))).toBe(
      'casa:casa-1',
    );
    expect(chaveDormida(criarCarrinha())).toBeNull();
  });

  it('lerChaveDormida: casa ou local com id (que pode ter ":"); o resto é null', () => {
    expect(lerChaveDormida('casa:casa-1')).toStrictEqual({ tipo: 'casa', id: 'casa-1' });
    expect(lerChaveDormida('local:a:b')).toStrictEqual({ tipo: 'local', id: 'a:b' });
    for (const errada of ['casa:', ':casa-1', 'casa-1', 'obra:obra-a', 'carrinha:zz1001', '']) {
      expect(lerChaveDormida(errada), errada).toBeNull();
    }
  });

  it('nomeDaDormida: nome da casa ou do local; "por definir"; ids desconhecidos aparecem como vieram', () => {
    const estado = estadoExemplo();
    expect(nomeDaDormida(estado, 'casa:casa-2')).toBe('Casa Dois');
    expect(nomeDaDormida(estado, 'local:local-parque')).toBe('Parque');
    expect(nomeDaDormida(estado, null)).toBe('por definir');
    expect(nomeDaDormida(estado, 'casa:casa-x')).toBe('casa-x');
    expect(nomeDaDormida(estado, 'lixo')).toBe('lixo');
  });
});

describe('onde dorme: operações', () => {
  it('operacaoDormida parte do que está gravado (não da sugestão); null se já for assim', () => {
    const estado = estadoExemplo();
    expect(operacaoDormida(estado, 'zz1001', 'casa:casa-1')).toStrictEqual(
      dormida('zz1001', null, 'casa:casa-1'),
    );
    expect(operacaoDormida(estado, 'zz1002', null)).toStrictEqual(
      dormida('zz1002', 'local:local-parque', null),
    );
    expect(operacaoDormida(estado, 'zz1002', 'local:local-parque')).toBeNull();
    expect(operacaoDormida(estado, 'zz1001', null)).toBeNull();
    expect(operacaoDormida(estado, 'nao-existe', 'casa:casa-1')).toBeNull();
  });

  it('aplicarOperacoes: muda as duas colunas (uma ou nenhuma) e mais nada; não altera o estado recebido', () => {
    const estado = estadoExemplo();
    const copia = structuredClone(estado);
    const depois = aplicarOperacoes(estado, [
      dormida('zz1001', null, 'casa:casa-3'),
      dormida('zz1002', 'local:local-parque', null),
      dormida('zz1003', null, 'local:local-parque'),
    ]);
    expect(depois.carrinhas.map((c) => [c.id, c.dormeCasaId, c.dormeLocalId])).toStrictEqual([
      ['zz1001', 'casa-3', null],
      ['zz1002', null, null],
      ['zz1003', null, 'local-parque'],
    ]);
    expect(depois.pessoas).toBe(estado.pessoas);
    expect(estado).toStrictEqual(copia);
    // Uma carrinha que também tinha local definido fica só com o novo sítio.
    const ambos = {
      ...estado,
      carrinhas: [criarCarrinha({ id: 'v', dormeCasaId: 'casa-1', dormeLocalId: 'x' })],
    };
    expect(aplicarOperacoes(ambos, [dormida('v', 'casa:casa-1', 'casa:casa-2')]).carrinhas[0]).toMatchObject({
      dormeCasaId: 'casa-2',
      dormeLocalId: null,
    });
  });

  it('compactarOperacoes: junta as da mesma carrinha e tira as que voltam ao início', () => {
    expect(
      compactarOperacoes([
        dormida('zz1001', null, 'casa:casa-1'),
        condutor('zz1001', null, 'p-ana'),
        dormida('zz1001', 'casa:casa-1', 'casa:casa-2'),
        dormida('zz1002', 'local:local-parque', null),
        dormida('zz1002', null, 'local:local-parque'),
      ]),
    ).toStrictEqual([dormida('zz1001', null, 'casa:casa-2'), condutor('zz1001', null, 'p-ana')]);
  });

  it('encontrarConflitos: o "de" tem de ser o sítio gravado (por definir incluído)', () => {
    const estado = estadoExemplo();
    expect(
      encontrarConflitos(estado, [
        dormida('zz1001', null, 'casa:casa-1'),
        dormida('zz1002', 'local:local-parque', null),
        dormida('nao-existe', null, 'casa:casa-1'),
      ]),
    ).toStrictEqual([]);
    expect(
      encontrarConflitos(estado, [
        dormida('zz1001', 'casa:casa-2', 'casa:casa-1'),
        dormida('zz1002', null, 'casa:casa-1'),
      ]),
    ).toStrictEqual([
      { tipo: 'dormida', carrinhaId: 'zz1001', esperado: 'casa:casa-2', atual: null },
      { tipo: 'dormida', carrinhaId: 'zz1002', esperado: null, atual: 'local:local-parque' },
    ]);
  });

  it('validarOperacoes: a carrinha e o sítio têm de existir (casa entre as casas, local entre os locais)', () => {
    const estado = estadoExemplo();
    expect(
      validarOperacoes(estado, [
        dormida('zz1001', null, 'casa:casa-1'),
        dormida('zz1002', 'local:local-parque', null),
        dormida('zz1003', null, 'local:local-a'),
      ]),
    ).toStrictEqual([]);
    expect(validarOperacoes(estado, [dormida('zz-x', null, 'casa:casa-1')])).toStrictEqual([
      'A carrinha zz-x não existe.',
    ]);
    expect(
      validarOperacoes(estado, [
        dormida('zz1001', null, 'casa:local-a'),
        dormida('zz1003', null, 'local:casa-1'),
        dormida('zz1002', null, 'obra:obra-a'),
      ]),
    ).toStrictEqual([
      'O sítio onde dormir "casa:local-a" não existe.',
      'O sítio onde dormir "local:casa-1" não existe.',
      'O sítio onde dormir "obra:obra-a" não existe.',
    ]);
  });

  it('onde dorme não mexe na regra do condutor (a carrinha não conta como mexida)', () => {
    // A Ana conduz a ZZ 1003 sem ir nela: mudar onde dorme a ZZ 1003 não faz disso um erro.
    const estado = aplicarOperacoes(estadoExemplo(), [condutor('zz1003', null, 'p-ana')]);
    expect(validarOperacoes(estado, [dormida('zz1003', null, 'casa:casa-3')])).toStrictEqual([]);
  });

  it('descreverOperacao: matrícula e os nomes dos sítios (ou "por definir")', () => {
    const estado = estadoExemplo();
    expect(descreverOperacao(estado, dormida('zz1001', null, 'casa:casa-1'))).toBe(
      'ZZ 1001 — onde dorme: por definir → Casa Um',
    );
    expect(descreverOperacao(estado, dormida('zz1002', 'local:local-parque', 'casa:casa-3'))).toBe(
      'ZZ 1002 — onde dorme: Parque → Casa Três',
    );
    expect(descreverOperacao(estado, dormida('zz-x', 'casa:casa-x', null))).toBe(
      'zz-x — onde dorme: casa-x → por definir',
    );
  });

  it('em estados aleatórios, aplicar e depois ler a chave dá o sítio pedido', () => {
    for (let semente = 1; semente <= 40; semente++) {
      const estado = estadoAleatorio(semente);
      const sitios = [
        null,
        ...estado.casas.map((c) => `casa:${c.id}`),
        ...estado.locais.map((l) => `local:${l.id}`),
      ];
      for (const [i, carrinha] of estado.carrinhas.entries()) {
        const para = sitios[(semente + i) % sitios.length] ?? null;
        const op = operacaoDormida(estado, carrinha.id, para);
        const depois = aplicarOperacoes(estado, op ? [op] : []);
        const final = depois.carrinhas.find((c) => c.id === carrinha.id);
        expect(final && chaveDormida(final), `semente ${semente}`).toBe(para);
        expect(validarOperacoes(estado, op ? [op] : []), `semente ${semente}`).toStrictEqual([]);
      }
    }
  });
});
