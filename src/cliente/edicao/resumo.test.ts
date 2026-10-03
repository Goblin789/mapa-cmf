import { describe, expect, it } from 'vitest';
import {
  aplicarOperacoes,
  type CampoMovivel,
  type Operacao,
  operacaoCondutor,
  operacoesParaAlvo,
} from '../../dominio/operacoes';
import { criarCasa, criarEstado, criarPessoa, estadoExemplo } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import {
  agruparAlteracoes,
  agruparCondutores,
  alteracoesDaPessoa,
  calcularAvisos,
  condutorPendente,
  movimentosDoSitio,
  pessoaTemAlteracoes,
  resumirPasso,
  sitioTemAlteracoes,
  valorAnterior,
} from './resumo';

const mover = (pessoaId: string, campo: CampoMovivel, de: string | null, para: string | null): Operacao => ({
  tipo: 'mover',
  pessoaId,
  campo,
  de,
  para,
});

const condutor = (carrinhaId: string, de: string | null, para: string | null): Operacao => ({
  tipo: 'condutor',
  carrinhaId,
  de,
  para,
});

/** estadoExemplo com a Ana a conduzir a ZZ 1001 (onde vai). */
function comCondutor(): Estado {
  return aplicarOperacoes(estadoExemplo(), [condutor('zz1001', null, 'p-ana')]);
}

describe('agruparAlteracoes', () => {
  it('agrupa por pessoa, por ordem alfabética, e ordena os campos casa → carrinha → obra', () => {
    const estado = estadoExemplo();
    const grupos = agruparAlteracoes(estado, [
      mover('p-gil', 'carrinhaId', 'zz1001', null),
      mover('p-bruno', 'obraId', null, 'obra-a'),
      mover('p-bruno', 'casaId', 'casa-1', 'casa-3'),
    ]);
    expect(grupos.map((g) => g.nome)).toEqual(['Bruno E.', 'Gil N.']);
    expect(grupos[0]?.alteracoes.map((a) => [a.rotuloCampo, a.de, a.para])).toEqual([
      ['Casa', 'Casa Um', 'Casa Três'],
      ['Obra', 'sem obra', 'Obra Alfa'],
    ]);
    expect(grupos[1]?.alteracoes[0]).toMatchObject({
      rotuloCampo: 'Carrinha',
      de: 'ZZ 1001',
      para: 'Sem transporte da empresa',
      descricao: 'Gil N. — carrinha: ZZ 1001 → Sem transporte da empresa',
    });
  });

  it('sem alterações devolve lista vazia; as de condutor não entram nos grupos de pessoas', () => {
    expect(agruparAlteracoes(estadoExemplo(), [])).toEqual([]);
    expect(agruparAlteracoes(estadoExemplo(), [condutor('zz1001', null, 'p-ana')])).toEqual([]);
  });
});

describe('agruparCondutores', () => {
  it('agrupa por carrinha, pela ordem das carrinhas, com a frase do histórico', () => {
    const estado = comCondutor();
    const grupos = agruparCondutores(estado, [
      mover('p-gil', 'carrinhaId', 'zz1001', null),
      condutor('zz1002', null, 'p-celia'),
      condutor('zz1001', 'p-ana', 'p-bruno'),
    ]);
    expect(grupos).toEqual([
      {
        carrinhaId: 'zz1001',
        matricula: 'ZZ 1001',
        alteracoes: [{ de: 'Ana T.', para: 'Bruno E.', descricao: 'ZZ 1001 — condutor: Ana T. → Bruno E.' }],
      },
      {
        carrinhaId: 'zz1002',
        matricula: 'ZZ 1002',
        alteracoes: [
          { de: 'sem condutor', para: 'Célia F.', descricao: 'ZZ 1002 — condutor: sem condutor → Célia F.' },
        ],
      },
    ]);
  });

  it('sem mudanças de condutor devolve lista vazia', () => {
    expect(agruparCondutores(estadoExemplo(), [mover('p-gil', 'carrinhaId', 'zz1001', null)])).toEqual([]);
  });
});

describe('calcularAvisos', () => {
  function simular(ops: Operacao[]) {
    const servidor = estadoExemplo();
    return calcularAvisos(servidor, aplicarOperacoes(servidor, ops), ops);
  }

  it('sem alterações não há avisos (mesmo com casas já em excesso)', () => {
    expect(simular([])).toEqual([]);
  });

  it('avisa quando uma casa recebe gente e fica com gente a mais, e quando passa o contrato', () => {
    // casa-1: 3/3, máximo 2, tolerado 3. Entra mais uma → 4/3, acima do tolerado.
    const avisos = simular([mover('p-helena', 'casaId', null, 'casa-1')]);
    expect(avisos.map((a) => [a.gravidade, a.texto])).toEqual([
      ['forte', 'Casa Um fica com 4 pessoas para 3 lugares (1 a mais).'],
      ['forte', 'Casa Um passa o tolerado do contrato: 4 lugares usados para 2 (tolerado 3).'],
    ]);
  });

  it('não avisa de excesso numa casa que já estava em excesso e não piorou', () => {
    // casa-2 está 3/2. Sai o Duarte e entra a Helena: continua 3/2.
    const avisos = simular([
      mover('p-duarte', 'casaId', 'casa-2', 'casa-3'),
      mover('p-helena', 'casaId', null, 'casa-2'),
    ]);
    expect(avisos.filter((a) => a.chave.startsWith('casa-excesso'))).toEqual([]);
  });

  it('casa com lugares livres e dentro do contrato não dá aviso', () => {
    // casa-3: 0/4, máximo 6.
    expect(simular([mover('p-helena', 'casaId', null, 'casa-3')])).toEqual([]);
  });

  it('acima do máximo (sem tolerado) é aviso simples', () => {
    const servidor = criarEstado({
      casas: [criarCasa({ id: 'c', nome: 'Casa C', lotacao: 2, maxContrato: 2 })],
      pessoas: [
        criarPessoa({ id: 'a', casaId: 'c' }),
        criarPessoa({ id: 'b', casaId: 'c' }),
        criarPessoa({ id: 'x' }),
      ],
    });
    const ops = operacoesParaAlvo(servidor, ['x'], { tipo: 'casa', id: 'c' });
    const avisos = calcularAvisos(servidor, aplicarOperacoes(servidor, ops), ops);
    expect(avisos.map((a) => a.gravidade)).toEqual(['forte', 'simples']);
    expect(avisos[1]?.texto).toBe('Casa C passa o máximo do contrato: 3 lugares usados para 2.');
  });

  it('avisa quando uma carrinha fica com gente a mais', () => {
    // zz1002: 2 lugares, 2 passageiros.
    const avisos = simular([mover('p-helena', 'carrinhaId', null, 'zz1002')]);
    expect(avisos).toEqual([
      {
        chave: 'carrinha-excesso:zz1002',
        gravidade: 'forte',
        texto: 'ZZ 1002 fica com 3 pessoas para 2 lugares (1 a mais).',
      },
    ]);
  });

  it('avisa quando o condutor escolhido não tem carta (forte); carta desconhecida não avisa', () => {
    const servidor = estadoExemplo();
    const semCarta = {
      ...servidor,
      pessoas: servidor.pessoas.map((p) => (p.id === 'p-bruno' ? { ...p, temCarta: false } : p)),
    };
    const ops = [condutor('zz1001', null, 'p-bruno')];
    expect(calcularAvisos(semCarta, aplicarOperacoes(semCarta, ops), ops)).toEqual([
      {
        chave: 'condutor-sem-carta:zz1001',
        gravidade: 'forte',
        texto: 'Bruno E. fica a conduzir a ZZ 1001, mas não tem carta.',
      },
    ]);
    // A Ana tem temCarta = null (desconhecido): sem aviso.
    const opsAna = [condutor('zz1001', null, 'p-ana')];
    expect(calcularAvisos(servidor, aplicarOperacoes(servidor, opsAna), opsAna)).toEqual([]);
  });

  it('carta caducada só avisa quando se sabe a data de hoje (aviso simples)', () => {
    const servidor = estadoExemplo();
    const caducada = {
      ...servidor,
      pessoas: servidor.pessoas.map((p) =>
        p.id === 'p-ana' ? { ...p, temCarta: true, cartaValidade: '2026-01-31' } : p,
      ),
    };
    const ops = [condutor('zz1001', null, 'p-ana')];
    const visivel = aplicarOperacoes(caducada, ops);
    expect(calcularAvisos(caducada, visivel, ops)).toEqual([]);
    expect(calcularAvisos(caducada, visivel, ops, undefined, undefined, '2026-10-03')).toEqual([
      {
        chave: 'condutor-carta-caducada:zz1001',
        gravidade: 'simples',
        texto: 'Ana T. fica a conduzir a ZZ 1001, mas a carta caducou a 31/01/2026.',
      },
    ]);
    expect(calcularAvisos(caducada, visivel, ops, undefined, undefined, '2026-01-31')).toEqual([]);
  });

  it('avisa quando uma carrinha que tinha condutor fica com passageiros e sem condutor', () => {
    const servidor = comCondutor();
    // A Ana sai da ZZ 1001 (operacoesParaAlvo tira-a de condutor): ficam 3 passageiros sem condutor.
    const ops = operacoesParaAlvo(servidor, ['p-ana'], { tipo: 'carrinha', id: 'zz1003' });
    expect(ops).toHaveLength(2);
    expect(calcularAvisos(servidor, aplicarOperacoes(servidor, ops), ops)).toEqual([
      {
        chave: 'carrinha-sem-condutor:zz1001',
        gravidade: 'simples',
        texto: 'ZZ 1001 fica sem condutor (3 passageiros).',
      },
    ]);
    // Tirar o condutor à mão também.
    const tirar = [condutor('zz1001', 'p-ana', null)];
    expect(calcularAvisos(servidor, aplicarOperacoes(servidor, tirar), tirar).map((a) => a.texto)).toEqual([
      'ZZ 1001 fica sem condutor (4 passageiros).',
    ]);
    // Trocar de condutor não avisa; carrinhas que nunca tiveram condutor também não.
    const trocar = [condutor('zz1001', 'p-ana', 'p-gil')];
    expect(calcularAvisos(servidor, aplicarOperacoes(servidor, trocar), trocar)).toEqual([]);
    const entrar = [mover('p-helena', 'carrinhaId', null, 'zz1003')];
    expect(calcularAvisos(servidor, aplicarOperacoes(servidor, entrar), entrar)).toEqual([]);
  });

  it('um condutor que não vai na carrinha (ex.: inativo) já era "sem condutor": não avisa', () => {
    // A ZZ 1002 tem como condutor o Ivo, inativo (e noutra carrinha): a lista e a ficha dizem "sem condutor".
    const base = estadoExemplo();
    const servidor = {
      ...base,
      carrinhas: base.carrinhas.map((c) => (c.id === 'zz1002' ? { ...c, condutorId: 'p-ivo' } : c)),
    };
    const ops = operacoesParaAlvo(servidor, ['p-duarte'], { tipo: 'sem-transporte' });
    const avisos = calcularAvisos(servidor, aplicarOperacoes(servidor, ops), ops);
    expect(avisos.filter((a) => a.chave.startsWith('carrinha-sem-condutor'))).toEqual([]);
  });

  it('a carrinha que fica vazia não precisa de condutor', () => {
    const servidor = aplicarOperacoes(estadoExemplo(), [condutor('zz1002', null, 'p-celia')]);
    const ops = operacoesParaAlvo(servidor, ['p-celia', 'p-duarte'], { tipo: 'carrinha', id: 'zz1003' });
    expect(calcularAvisos(servidor, aplicarOperacoes(servidor, ops), ops)).toEqual([]);
  });

  it('avisa quem fica fora das casas ou sem transporte, depois dos avisos fortes', () => {
    const avisos = simular([
      mover('p-bruno', 'carrinhaId', 'zz1001', null),
      mover('p-ana', 'casaId', 'casa-1', null),
      mover('p-helena', 'carrinhaId', null, 'zz1002'),
    ]);
    expect(avisos.map((a) => a.texto)).toEqual([
      'ZZ 1002 fica com 3 pessoas para 2 lugares (1 a mais).',
      'Ana T. fica fora das casas CMF.',
      'Bruno E. fica sem transporte da empresa.',
    ]);
  });
});

describe('alteracoesDaPessoa e movimentosDoSitio', () => {
  const pendentes = [
    mover('p-ana', 'casaId', 'casa-1', 'casa-3'),
    mover('p-ana', 'carrinhaId', 'zz1001', 'zz1003'),
    mover('p-elsa', 'casaId', 'casa-2', 'casa-1'),
  ];

  it('alterações de uma pessoa, por campo', () => {
    const m = alteracoesDaPessoa(pendentes, 'p-ana');
    expect([...m.keys()]).toEqual(['casaId', 'carrinhaId']);
    expect(alteracoesDaPessoa(pendentes, 'p-gil').size).toBe(0);
  });

  it('quem entra e quem sai de uma casa', () => {
    const m = movimentosDoSitio(pendentes, 'casaId', 'casa-1');
    expect(m.entram.map((op) => op.pessoaId)).toEqual(['p-elsa']);
    expect(m.saem.map((op) => op.pessoaId)).toEqual(['p-ana']);
    expect(movimentosDoSitio(pendentes, 'carrinhaId', 'casa-1')).toEqual({ entram: [], saem: [] });
  });

  it('as mudanças de condutor não são movimentos de pessoas', () => {
    const comCondutores = [...pendentes, condutor('zz1003', null, 'p-ana')];
    expect([...alteracoesDaPessoa(comCondutores, 'p-ana').keys()]).toEqual(['casaId', 'carrinhaId']);
    expect(movimentosDoSitio(comCondutores, 'carrinhaId', 'zz1003').entram.map((op) => op.pessoaId)).toEqual([
      'p-ana',
    ]);
  });
});

describe('condutorPendente, pessoaTemAlteracoes e sitioTemAlteracoes', () => {
  const pendentes = [mover('p-gil', 'casaId', null, 'casa-3'), condutor('zz1001', 'p-ana', 'p-bruno')];

  it('a mudança de condutor de uma carrinha', () => {
    expect(condutorPendente(pendentes, 'zz1001')).toEqual(condutor('zz1001', 'p-ana', 'p-bruno'));
    expect(condutorPendente(pendentes, 'zz1002')).toBeNull();
  });

  it('quem deixa de conduzir e quem passa a conduzir também tem alterações', () => {
    expect(['p-gil', 'p-ana', 'p-bruno', 'p-celia'].map((id) => pessoaTemAlteracoes(pendentes, id))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('a carrinha cujo condutor muda tem alterações (como sítio de carrinhas, não de casas)', () => {
    expect(sitioTemAlteracoes(pendentes, 'carrinhaId', 'zz1001')).toBe(true);
    expect(sitioTemAlteracoes(pendentes, 'carrinhaId', 'zz1002')).toBe(false);
    expect(sitioTemAlteracoes(pendentes, 'casaId', 'casa-3')).toBe(true);
    expect(sitioTemAlteracoes(pendentes, 'casaId', 'zz1001')).toBe(false);
  });
});

describe('resumirPasso', () => {
  const estado = estadoExemplo();

  it('uma alteração: a frase completa', () => {
    expect(resumirPasso(estado, [mover('p-ana', 'casaId', 'casa-1', 'casa-3')])).toBe(
      'Ana T. — casa: Casa Um → Casa Três',
    );
    expect(resumirPasso(estado, [mover('p-ana', 'carrinhaId', 'zz1001', null)])).toBe(
      'Ana T. — carrinha: ZZ 1001 → Sem transporte da empresa',
    );
  });

  it('várias pessoas para o mesmo sítio', () => {
    const passo = operacoesParaAlvo(estado, ['p-ana', 'p-bruno'], { tipo: 'carrinha', id: 'zz1003' });
    expect(resumirPasso(estado, passo)).toBe('2 pessoas → ZZ 1003');
    const fora = operacoesParaAlvo(estado, ['p-ana', 'p-bruno'], { tipo: 'fora' });
    expect(resumirPasso(estado, fora)).toBe('2 pessoas → Fora das casas CMF');
  });

  it('alterações misturadas: só o número', () => {
    expect(
      resumirPasso(estado, [
        mover('p-ana', 'casaId', 'casa-1', 'casa-3'),
        mover('p-bruno', 'carrinhaId', 'zz1001', null),
      ]),
    ).toBe('2 alterações');
    expect(resumirPasso(estado, [])).toBe('nada');
  });

  it('só o condutor: a frase do histórico', () => {
    const op = operacaoCondutor(estado, 'zz1001', 'p-ana');
    expect(op && resumirPasso(estado, [op])).toBe('ZZ 1001 — condutor: sem condutor → Ana T.');
    expect(resumirPasso(estado, [condutor('zz1001', 'p-ana', null)])).toBe(
      'ZZ 1001 — condutor: Ana T. → sem condutor',
    );
    expect(
      resumirPasso(estado, [condutor('zz1001', null, 'p-ana'), condutor('zz1002', null, 'p-celia')]),
    ).toBe('2 alterações');
  });

  it('quem sai da carrinha que conduzia: a mudança e a consequência', () => {
    const servidor = comCondutor();
    const passo = operacoesParaAlvo(servidor, ['p-ana'], { tipo: 'carrinha', id: 'zz1003' });
    expect(resumirPasso(servidor, passo)).toBe(
      'Ana T. — carrinha: ZZ 1001 → ZZ 1003 · ZZ 1001 fica sem condutor',
    );
    const dois = operacoesParaAlvo(servidor, ['p-ana', 'p-bruno'], { tipo: 'sem-transporte' });
    expect(resumirPasso(servidor, dois)).toBe(
      '2 pessoas → Sem transporte da empresa · ZZ 1001 fica sem condutor',
    );
    expect(
      resumirPasso(servidor, [
        mover('p-gil', 'carrinhaId', null, 'zz1002'),
        condutor('zz1002', null, 'p-gil'),
      ]),
    ).toBe('Gil N. — carrinha: Sem transporte da empresa → ZZ 1002 · Gil N. passa a conduzir a ZZ 1002');
  });
});

describe('valorAnterior', () => {
  it('só no modo de edição e só quando mudou', () => {
    expect(valorAnterior(true, 6, 4)).toBe(6);
    expect(valorAnterior(true, 4, 4)).toBeNull();
    expect(valorAnterior(false, 6, 4)).toBeNull();
    expect(valorAnterior(true, undefined, 4)).toBeNull();
    expect(valorAnterior(true, 0, 1)).toBe(0);
  });
});
