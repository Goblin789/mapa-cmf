import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Alvo,
  aplicarOperacoes,
  type CampoMovivel,
  compactarOperacoes,
  encontrarConflitos,
  type Operacao,
  operacaoCondutor,
  operacoesParaAlvo,
} from '../dominio/operacoes';
import { estadoExemplo } from '../dominio/teste-fabrica';
import type { Estado, Pessoa } from '../dominio/tipos';
import { inserirDadosFicticios, inserirLotes } from './dados-de-teste';
import * as esquema from './db/esquema';
import { abrirBd, type Bd } from './db/ligacao';
import { carregarEstado } from './estado';
import {
  alteracoesDasOperacoes,
  alteracoesDeCondutor,
  descreverAlteracao,
  descreverConflito,
  gravarLote,
  lerHistorico,
} from './lotes';

const AGORA = new Date('2026-10-03T08:30:00.000Z');

function mover(pessoaId: string, campo: CampoMovivel, de: string | null, para: string | null): Operacao {
  return { tipo: 'mover', pessoaId, campo, de, para };
}

function condutor(carrinhaId: string, de: string | null, para: string | null): Operacao {
  return { tipo: 'condutor', carrinhaId, de, para };
}

describe('alteracoesDasOperacoes', () => {
  it('um campo por linha, com as marcas "a confirmar" que a mudança limpa', () => {
    const estado = estadoExemplo();
    expect(
      alteracoesDasOperacoes(estado, [
        mover('p-gil', 'casaId', null, 'casa-3'),
        mover('p-duarte', 'carrinhaId', 'zz1002', 'zz1003'),
        mover('p-ana', 'obraId', 'obra-b', null),
      ]),
    ).toStrictEqual([
      { pessoaId: 'p-gil', campo: 'casaId', antes: null, depois: 'casa-3' },
      { pessoaId: 'p-gil', campo: 'casaAConfirmar', antes: true, depois: false },
      { pessoaId: 'p-duarte', campo: 'carrinhaId', antes: 'zz1002', depois: 'zz1003' },
      { pessoaId: 'p-duarte', campo: 'carrinhaAConfirmar', antes: true, depois: false },
      { pessoaId: 'p-ana', campo: 'obraId', antes: 'obra-b', depois: null },
    ]);
  });

  it('a mesma pessoa em vários campos fica junta, por ordem fixa dos campos', () => {
    const estado = estadoExemplo();
    expect(
      alteracoesDasOperacoes(estado, [
        mover('p-ana', 'obraId', 'obra-b', 'obra-a'),
        mover('p-helena', 'casaId', null, 'casa-3'),
        mover('p-ana', 'casaId', 'casa-1', 'casa-2'),
      ]),
    ).toStrictEqual([
      { pessoaId: 'p-ana', campo: 'casaId', antes: 'casa-1', depois: 'casa-2' },
      { pessoaId: 'p-ana', campo: 'obraId', antes: 'obra-b', depois: 'obra-a' },
      { pessoaId: 'p-helena', campo: 'casaId', antes: null, depois: 'casa-3' },
    ]);
  });

  it('sem marca ligada não há linha para a marca; operações sem efeito e pessoas inexistentes não contam', () => {
    const estado = estadoExemplo();
    expect(
      alteracoesDasOperacoes(estado, [
        mover('p-ana', 'casaId', 'casa-1', 'casa-1'),
        mover('nao-existe', 'casaId', null, 'casa-1'),
        mover('p-bruno', 'carrinhaId', 'zz1001', null),
      ]),
    ).toStrictEqual([{ pessoaId: 'p-bruno', campo: 'carrinhaId', antes: 'zz1001', depois: null }]);
  });
});

describe('descreverConflito', () => {
  const estado = estadoExemplo();

  it('com valores nos dois lados', () => {
    expect(
      descreverConflito(estado, {
        tipo: 'mover',
        pessoaId: 'p-ana',
        campo: 'carrinhaId',
        esperado: 'zz1002',
        atual: 'zz1001',
      }),
    ).toBe('Ana T. — carrinha: esperavas ZZ 1002, mas agora está em ZZ 1001 (alguém mudou entretanto)');
    expect(
      descreverConflito(estado, {
        tipo: 'mover',
        pessoaId: 'p-ana',
        campo: 'casaId',
        esperado: 'casa-2',
        atual: 'casa-1',
      }),
    ).toBe('Ana T. — casa: esperavas Casa Dois, mas agora está em Casa Um (alguém mudou entretanto)');
  });

  it('quando agora não tem valor, diz onde está por palavras', () => {
    expect(
      descreverConflito(estado, {
        tipo: 'mover',
        pessoaId: 'p-helena',
        campo: 'casaId',
        esperado: 'casa-2',
        atual: null,
      }),
    ).toBe(
      'Helena Z. — casa: esperavas Casa Dois, mas agora está fora das casas CMF (alguém mudou entretanto)',
    );
    expect(
      descreverConflito(estado, {
        tipo: 'mover',
        pessoaId: 'p-helena',
        campo: 'carrinhaId',
        esperado: 'zz1001',
        atual: null,
      }),
    ).toBe(
      'Helena Z. — carrinha: esperavas ZZ 1001, mas agora está sem transporte da empresa (alguém mudou entretanto)',
    );
    expect(
      descreverConflito(estado, {
        tipo: 'mover',
        pessoaId: 'p-helena',
        campo: 'obraId',
        esperado: 'obra-a',
        atual: null,
      }),
    ).toBe('Helena Z. — obra: esperavas Obra Alfa, mas agora está sem obra (alguém mudou entretanto)');
  });

  it('quando esperava "sem valor" e ids desconhecidos', () => {
    expect(
      descreverConflito(estado, {
        tipo: 'mover',
        pessoaId: 'p-gil',
        campo: 'obraId',
        esperado: null,
        atual: 'obra-b',
      }),
    ).toBe('Gil N. — obra: esperavas sem obra, mas agora está em Obra Beta (alguém mudou entretanto)');
    expect(
      descreverConflito(estado, {
        tipo: 'mover',
        pessoaId: 'p-x',
        campo: 'casaId',
        esperado: null,
        atual: 'casa-x',
      }),
    ).toBe('p-x — casa: esperavas Fora das casas CMF, mas agora está em casa-x (alguém mudou entretanto)');
  });

  it('condutor: quem se esperava e quem conduz agora', () => {
    const conflito = (esperado: string | null, atual: string | null) =>
      descreverConflito(estado, { tipo: 'condutor', carrinhaId: 'zz1001', esperado, atual });
    expect(conflito('p-ana', 'p-gil')).toBe(
      'ZZ 1001 — condutor: esperavas Ana T., mas agora é Gil N. (alguém mudou entretanto)',
    );
    expect(conflito(null, 'p-ana')).toBe(
      'ZZ 1001 — condutor: esperavas que não tivesse condutor, mas agora é Ana T. (alguém mudou entretanto)',
    );
    expect(conflito('p-ana', null)).toBe(
      'ZZ 1001 — condutor: esperavas Ana T., mas agora não tem condutor (alguém mudou entretanto)',
    );
    expect(
      descreverConflito(estado, { tipo: 'condutor', carrinhaId: 'zz-x', esperado: 'p-x', atual: null }),
    ).toBe('zz-x — condutor: esperavas p-x, mas agora não tem condutor (alguém mudou entretanto)');
  });
});

describe('alteracoesDeCondutor', () => {
  const estado = estadoExemplo();

  it('uma linha por carrinha cujo condutor muda; as operações de pessoas não contam', () => {
    expect(
      alteracoesDeCondutor(estado, [
        mover('p-ana', 'casaId', 'casa-1', 'casa-2'),
        condutor('zz1001', null, 'p-ana'),
        condutor('nao-existe', null, 'p-ana'),
        condutor('zz1002', null, 'p-celia'),
      ]),
    ).toStrictEqual([
      { carrinhaId: 'zz1001', antes: null, depois: 'p-ana' },
      { carrinhaId: 'zz1002', antes: null, depois: 'p-celia' },
    ]);
  });

  it('a última operação da mesma carrinha ganha; voltar ao início não é alteração', () => {
    const comCondutor = aplicarOperacoes(estado, [condutor('zz1001', null, 'p-ana')]);
    expect(
      alteracoesDeCondutor(comCondutor, [
        condutor('zz1001', 'p-ana', 'p-bruno'),
        condutor('zz1001', 'p-bruno', null),
      ]),
    ).toStrictEqual([{ carrinhaId: 'zz1001', antes: 'p-ana', depois: null }]);
    expect(
      alteracoesDeCondutor(comCondutor, [
        condutor('zz1001', 'p-ana', 'p-bruno'),
        condutor('zz1001', 'p-bruno', 'p-ana'),
      ]),
    ).toStrictEqual([]);
  });
});

describe('descreverAlteracao', () => {
  const estado = estadoExemplo();
  const linha = (campo: string, antes: string | null, depois: string | null, entidadeId = 'p-gil') => ({
    entidade: 'pessoa',
    entidadeId,
    campo,
    antes,
    depois,
  });

  it('casa, carrinha e obra com os nomes atuais', () => {
    expect(descreverAlteracao(estado, linha('casaId', 'null', '"casa-3"'))).toBe(
      'Gil N. — casa: Fora das casas CMF → Casa Três',
    );
    expect(descreverAlteracao(estado, linha('carrinhaId', '"zz1001"', 'null'))).toBe(
      'Gil N. — carrinha: ZZ 1001 → Sem transporte da empresa',
    );
    expect(descreverAlteracao(estado, linha('obraId', '"obra-b"', '"obra-a"'))).toBe(
      'Gil N. — obra: Obra Beta → Obra Alfa',
    );
  });

  it('marcas "a confirmar"', () => {
    expect(descreverAlteracao(estado, linha('casaAConfirmar', 'true', 'false'))).toBe(
      'Gil N. — casa a confirmar: sim → não',
    );
    expect(descreverAlteracao(estado, linha('carrinhaAConfirmar', 'false', 'true', 'p-duarte'))).toBe(
      'Duarte S. — carrinha a confirmar: não → sim',
    );
  });

  it('valores em falta, JSON estragado e pessoas que já não existem não rebentam', () => {
    expect(descreverAlteracao(estado, linha('casaId', null, 'casa-3'))).toBe(
      'Gil N. — casa: Fora das casas CMF → Casa Três',
    );
    expect(descreverAlteracao(estado, linha('casaAConfirmar', null, '1', 'p-x'))).toBe(
      'p-x — casa a confirmar: — → 1',
    );
  });

  it('condutor de uma carrinha, com a matrícula e os nomes atuais', () => {
    const carrinha = (antes: string | null, depois: string | null, entidadeId = 'zz1001') => ({
      entidade: 'carrinha',
      entidadeId,
      campo: 'condutorId',
      antes,
      depois,
    });
    expect(descreverAlteracao(estado, carrinha('null', '"p-gil"'))).toBe(
      'ZZ 1001 — condutor: sem condutor → Gil N.',
    );
    expect(descreverAlteracao(estado, carrinha('"p-ana"', '"p-gil"'))).toBe(
      'ZZ 1001 — condutor: Ana T. → Gil N.',
    );
    expect(descreverAlteracao(estado, carrinha('"p-x"', 'null', 'zz-x'))).toBe(
      'zz-x — condutor: p-x → sem condutor',
    );
  });

  it('outras entidades ou campos: frase genérica com os valores em bruto', () => {
    expect(
      descreverAlteracao(estado, {
        entidade: 'casa',
        entidadeId: 'casa-1',
        campo: 'lotacao',
        antes: '3',
        depois: null,
      }),
    ).toBe('casa casa-1 — lotacao: 3 → —');
    expect(descreverAlteracao(estado, linha('telefone', 'null', '"000"'))).toBe(
      'pessoa p-gil — telefone: null → "000"',
    );
  });
});

describe('gravarLote e lerHistorico na base de dados', () => {
  let bd: Bd;

  beforeEach(() => {
    bd = abrirBd(':memory:');
    inserirDadosFicticios(bd);
    inserirLotes(bd, 1);
  });

  afterEach(() => {
    bd.$client.close();
  });

  const pedido = (operacoes: Operacao[], comentario: string | null = null) => ({
    operacoes,
    comentario,
    autor: 'local',
    agora: AGORA,
  });

  it('grava e devolve a nova versão; o histórico mostra-o primeiro', () => {
    const r = gravarLote(bd, pedido([mover('p-alvaro', 'casaId', null, 'casa-monte')], 'Teste'));
    expect(r).toStrictEqual({ tipo: 'gravado', loteId: 2, versao: 2, alteracoes: 2 });
    expect(carregarEstado(bd).pessoas.find((p) => p.id === 'p-alvaro')).toMatchObject({
      casaId: 'casa-monte',
      casaAConfirmar: false,
      carrinhaAConfirmar: true,
    });

    const historico = lerHistorico(bd, 10);
    expect(historico.map((h) => h.loteId)).toStrictEqual([2, 1]);
    expect(historico[0]).toStrictEqual({
      loteId: 2,
      autor: 'local',
      criadoEm: AGORA.toISOString(),
      efetivoEm: AGORA.toISOString(),
      tipo: 'mudanca',
      estado: 'aplicado',
      comentario: 'Teste',
      alteracoes: [
        {
          entidade: 'pessoa',
          entidadeId: 'p-alvaro',
          campo: 'casaId',
          antes: 'null',
          depois: '"casa-monte"',
          descricao: 'Álvaro Exemplo — casa: Fora das casas CMF → Casa Monte',
        },
        {
          entidade: 'pessoa',
          entidadeId: 'p-alvaro',
          campo: 'casaAConfirmar',
          antes: 'true',
          depois: 'false',
          descricao: 'Álvaro Exemplo — casa a confirmar: sim → não',
        },
      ],
    });
  });

  it('conflito, inválido e vazio não gravam nada', () => {
    const antes = { ...carregarEstado(bd, AGORA) };
    expect(gravarLote(bd, pedido([mover('p-ze', 'casaId', 'casa-monte', null)]))).toMatchObject({
      tipo: 'conflito',
    });
    expect(gravarLote(bd, pedido([mover('p-bruno', 'casaId', 'casa-monte', null)]))).toStrictEqual({
      tipo: 'invalido',
      erros: ['Bruno Fictício não está ativa.'],
    });
    expect(
      gravarLote(
        bd,
        pedido([
          mover('p-ze', 'casaId', 'casa-ribeira', 'casa-monte'),
          mover('p-ze', 'casaId', 'casa-monte', 'casa-ribeira'),
        ]),
      ),
    ).toStrictEqual({ tipo: 'vazio' });
    expect(carregarEstado(bd, AGORA)).toStrictEqual(antes);
    expect(bd.select().from(esquema.alteracoes).all()).toStrictEqual([]);
  });

  // A simulação do browser tem de dar exatamente o que a gravação dá. A gravação compacta as operações,
  // por isso quem vai e volta (A → B → A) não muda nada, nem a marca "a confirmar": a simulação tem de
  // aplicar as operações já compactadas (os `pendentes` da loja), não todos os passos.
  it('o que fica gravado é a simulação com as operações compactadas, marcas incluídas', () => {
    const antes = carregarEstado(bd, AGORA);
    const ops = [
      mover('p-alvaro', 'casaId', null, 'casa-monte'),
      mover('p-alvaro', 'carrinhaId', null, 'car-1'),
      mover('p-alvaro', 'casaId', 'casa-monte', null),
      mover('p-ze', 'casaId', 'casa-ribeira', 'casa-monte'),
    ];
    expect(gravarLote(bd, pedido(ops))).toMatchObject({ tipo: 'gravado' });
    const gravado = carregarEstado(bd, AGORA).pessoas;
    expect(gravado).toStrictEqual(aplicarOperacoes(antes, compactarOperacoes(ops)).pessoas);
    expect(gravado.find((p) => p.id === 'p-alvaro')).toMatchObject({
      casaId: null,
      casaAConfirmar: true,
      carrinhaId: 'car-1',
      carrinhaAConfirmar: false,
    });
    // Sem compactar, a marca da casa do Álvaro desaparecia na simulação mas não na base de dados.
    expect(aplicarOperacoes(antes, ops).pessoas).not.toStrictEqual(gravado);
  });

  it('em sequências aleatórias de mudanças, gravado = simulação compactada', () => {
    const destinos: Record<CampoMovivel, (string | null)[]> = {
      casaId: [null, 'casa-monte', 'casa-ribeira'],
      carrinhaId: [null, 'car-1', 'car-2'],
      obraId: [null, 'obra-vale'],
    };
    const campos = Object.keys(destinos) as CampoMovivel[];
    const pessoas = ['p-ze', 'p-alvaro', 'p-elia'];
    const resultados = new Set<string>();
    for (let semente = 1; semente <= 30; semente++) {
      let s = semente;
      const sortear = (n: number) => {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        return (s >>> 16) % n;
      };
      const bdAleatoria = abrirBd(':memory:');
      inserirDadosFicticios(bdAleatoria);
      const antes = carregarEstado(bdAleatoria, AGORA);
      // Como no browser: cada mudança parte de onde a pessoa está na simulação.
      const atual = new Map(antes.pessoas.map((p) => [p.id, { ...p }]));
      const ops: Operacao[] = [];
      for (let i = 0; i < 2 + sortear(8); i++) {
        const pessoaId = pessoas[sortear(pessoas.length)] as string;
        const campo = campos[sortear(campos.length)] as CampoMovivel;
        const opcoes = destinos[campo];
        const para = opcoes[sortear(opcoes.length)] ?? null;
        const p = atual.get(pessoaId) as Pessoa;
        if (p[campo] === para) continue;
        ops.push(mover(pessoaId, campo, p[campo], para));
        p[campo] = para;
      }
      const r = gravarLote(bdAleatoria, pedido(ops));
      resultados.add(r.tipo);
      expect(carregarEstado(bdAleatoria, AGORA).pessoas, `semente ${semente}`).toStrictEqual(
        aplicarOperacoes(antes, compactarOperacoes(ops)).pessoas,
      );
      bdAleatoria.$client.close();
    }
    // As sementes cobrem os dois casos: há lotes gravados e lotes em que tudo se anula.
    expect(resultados).toStrictEqual(new Set(['gravado', 'vazio']));
  });

  it('se uma escrita falhar a meio, nada fica gravado (transação)', () => {
    const antes = carregarEstado(bd, AGORA);
    bd.$client.exec(
      "CREATE TRIGGER falhar BEFORE INSERT ON alteracoes BEGIN SELECT RAISE(ABORT, 'falha de teste'); END",
    );
    expect(() =>
      gravarLote(
        bd,
        pedido([
          mover('p-alvaro', 'casaId', null, 'casa-monte'),
          mover('p-ze', 'carrinhaId', 'car-2', 'car-1'),
        ]),
      ),
    ).toThrow(/falha de teste/);
    expect(carregarEstado(bd, AGORA)).toStrictEqual(antes);
  });

  const condutorDe = (carrinhaId: string, b: Bd = bd) =>
    carregarEstado(b, AGORA).carrinhas.find((c) => c.id === carrinhaId)?.condutorId;

  it('condutor: grava a carrinha, uma linha no histórico e sobe a versão', () => {
    const r = gravarLote(bd, pedido([condutor('car-2', null, 'p-ze')]));
    expect(r).toStrictEqual({ tipo: 'gravado', loteId: 2, versao: 2, alteracoes: 1 });
    expect(condutorDe('car-2')).toBe('p-ze');
    expect(lerHistorico(bd, 1)[0]?.alteracoes).toStrictEqual([
      {
        entidade: 'carrinha',
        entidadeId: 'car-2',
        campo: 'condutorId',
        antes: 'null',
        depois: '"p-ze"',
        descricao: 'ZZ 0002 — condutor: sem condutor → Zé Teste',
      },
    ]);

    // Tirar o condutor também fica no histórico.
    expect(gravarLote(bd, pedido([condutor('car-2', 'p-ze', null)]))).toMatchObject({ tipo: 'gravado' });
    expect(condutorDe('car-2')).toBeNull();
    expect(lerHistorico(bd, 1)[0]?.alteracoes.map((a) => a.descricao)).toStrictEqual([
      'ZZ 0002 — condutor: Zé Teste → sem condutor',
    ]);
  });

  it('condutor que não vai na carrinha (ou inativo, ou inexistente) é inválido e nada fica gravado', () => {
    const antes = carregarEstado(bd, AGORA);
    expect(gravarLote(bd, pedido([condutor('car-1', null, 'p-ze')]))).toStrictEqual({
      tipo: 'invalido',
      erros: ['Zé Teste não vai na carrinha ZZ 0001: não pode ser o condutor.'],
    });
    expect(gravarLote(bd, pedido([condutor('car-1', null, 'p-alvaro')]))).toStrictEqual({
      tipo: 'invalido',
      erros: ['Álvaro Exemplo não vai na carrinha ZZ 0001: não pode ser o condutor.'],
    });
    expect(gravarLote(bd, pedido([condutor('car-1', null, 'p-bruno')]))).toStrictEqual({
      tipo: 'invalido',
      erros: ['Bruno Fictício não está ativa.'],
    });
    expect(gravarLote(bd, pedido([condutor('car-9', null, 'p-ze')]))).toStrictEqual({
      tipo: 'invalido',
      erros: ['A carrinha car-9 não existe.'],
    });
    expect(carregarEstado(bd, AGORA)).toStrictEqual(antes);
    expect(bd.select().from(esquema.alteracoes).all()).toStrictEqual([]);
  });

  it('entrar na carrinha e passar a conduzir no mesmo lote é válido', () => {
    const ops = [mover('p-alvaro', 'carrinhaId', null, 'car-1'), condutor('car-1', null, 'p-alvaro')];
    expect(gravarLote(bd, pedido(ops))).toMatchObject({ tipo: 'gravado', alteracoes: 3 });
    expect(condutorDe('car-1')).toBe('p-alvaro');
  });

  it('mover o condutor para fora da carrinha no mesmo lote tira-o de condutor', () => {
    gravarLote(bd, pedido([condutor('car-2', null, 'p-ze')]));
    const estado = carregarEstado(bd, AGORA);

    // Sem a operação que o tira de condutor, a carrinha ficava com um condutor que não vai nela.
    expect(gravarLote(bd, pedido([mover('p-ze', 'carrinhaId', 'car-2', 'car-1')]))).toStrictEqual({
      tipo: 'invalido',
      erros: ['Zé Teste não vai na carrinha ZZ 0002: não pode ser o condutor.'],
    });

    // O browser junta-a sozinho (operacoesParaAlvo).
    const ops = operacoesParaAlvo(estado, ['p-ze'], { tipo: 'carrinha', id: 'car-1' });
    expect(ops).toStrictEqual([
      mover('p-ze', 'carrinhaId', 'car-2', 'car-1'),
      condutor('car-2', 'p-ze', null),
    ]);
    expect(gravarLote(bd, pedido(ops))).toMatchObject({ tipo: 'gravado', loteId: 3 });
    expect(condutorDe('car-2')).toBeNull();
    expect(carregarEstado(bd, AGORA).pessoas.find((p) => p.id === 'p-ze')?.carrinhaId).toBe('car-1');
    expect(lerHistorico(bd, 1)[0]?.alteracoes.map((a) => a.descricao)).toStrictEqual([
      'Zé Teste — carrinha: ZZ 0002 → ZZ 0001',
      'ZZ 0002 — condutor: Zé Teste → sem condutor',
    ]);
  });

  it('conflito de condutor: alguém mudou entretanto o condutor da mesma carrinha', () => {
    gravarLote(bd, pedido([condutor('car-2', null, 'p-ze')]));
    const depois = carregarEstado(bd, AGORA);
    // Outro browser, com o estado antigo, também escolhe o Zé (a mesma mudança também é conflito).
    expect(gravarLote(bd, pedido([condutor('car-2', null, 'p-ze')]))).toStrictEqual({
      tipo: 'conflito',
      conflitos: [
        {
          tipo: 'condutor',
          carrinhaId: 'car-2',
          esperado: null,
          atual: 'p-ze',
          descricao:
            'ZZ 0002 — condutor: esperavas que não tivesse condutor, mas agora é Zé Teste (alguém mudou entretanto)',
        },
      ],
    });
    expect(carregarEstado(bd, AGORA)).toStrictEqual(depois);
  });

  it('com conflito e erro ao mesmo tempo, responde o conflito (recarregar resolve os dois)', () => {
    // Alguém tirou o Zé da carrinha car-2. Um browser antigo ainda o faz condutor da car-2 e muda-lhe a casa.
    gravarLote(
      bd,
      pedido([mover('p-ze', 'carrinhaId', 'car-2', 'car-1'), mover('p-ze', 'casaId', 'casa-ribeira', null)]),
    );
    const antes = carregarEstado(bd, AGORA);
    // Sobre o estado novo também seria inválido (o Zé já não vai na car-2), mas o que interessa é recarregar.
    const r = gravarLote(
      bd,
      pedido([mover('p-ze', 'casaId', 'casa-ribeira', 'casa-monte'), condutor('car-2', null, 'p-ze')]),
    );
    expect(r).toMatchObject({
      tipo: 'conflito',
      conflitos: [
        { tipo: 'mover', pessoaId: 'p-ze', campo: 'casaId', esperado: 'casa-ribeira', atual: null },
      ],
    });
    expect(carregarEstado(bd, AGORA)).toStrictEqual(antes);
  });

  describe('conflitos escondidos pela regra do condutor (com versaoBase)', () => {
    const pedidoSobre = (versaoBase: number, operacoes: Operacao[]) => ({ ...pedido(operacoes), versaoBase });

    it('tirar da carrinha quem entretanto passou a conduzi-la é um conflito do condutor, não um erro', () => {
      // Versão 1: a car-2 não tem condutor. Versão 2: alguém põe o Zé a conduzi-la.
      gravarLote(bd, pedido([condutor('car-2', null, 'p-ze')]));
      const antes = carregarEstado(bd, AGORA);
      // Um browser na versão 1 tira o Zé da car-2 (para ele, o Zé não conduzia: não há operação de condutor).
      expect(gravarLote(bd, pedidoSobre(1, [mover('p-ze', 'carrinhaId', 'car-2', 'car-1')]))).toStrictEqual({
        tipo: 'conflito',
        conflitos: [
          {
            tipo: 'condutor',
            carrinhaId: 'car-2',
            esperado: null,
            atual: 'p-ze',
            descricao:
              'ZZ 0002 — condutor: esperavas que não tivesse condutor, mas agora é Zé Teste (alguém mudou entretanto)',
          },
        ],
      });
      expect(carregarEstado(bd, AGORA)).toStrictEqual(antes);
      // Feito sobre a versão atual (já se sabia que conduzia), o mesmo pedido continua a ser inválido.
      expect(gravarLote(bd, pedidoSobre(2, [mover('p-ze', 'carrinhaId', 'car-2', 'car-1')]))).toMatchObject({
        tipo: 'invalido',
      });
    });

    it('o condutor que se esperava vem do histórico (o primeiro valor depois da versão do rascunho)', () => {
      // Versão 2: o Álvaro entra na car-2 e conduz. Depois: o Zé (3), ninguém (4) e o Zé outra vez (5).
      gravarLote(
        bd,
        pedido([mover('p-alvaro', 'carrinhaId', null, 'car-2'), condutor('car-2', null, 'p-alvaro')]),
      );
      gravarLote(bd, pedido([condutor('car-2', 'p-alvaro', 'p-ze')]));
      gravarLote(bd, pedido([condutor('car-2', 'p-ze', null)]));
      gravarLote(bd, pedido([condutor('car-2', null, 'p-ze')]));
      expect(gravarLote(bd, pedidoSobre(2, [mover('p-ze', 'carrinhaId', 'car-2', null)]))).toMatchObject({
        tipo: 'conflito',
        conflitos: [{ tipo: 'condutor', carrinhaId: 'car-2', esperado: 'p-alvaro', atual: 'p-ze' }],
      });
      // Na versão 3 o Zé já conduzia: o browser tinha mandado a operação de condutor (pedido mal feito).
      expect(gravarLote(bd, pedidoSobre(3, [mover('p-ze', 'carrinhaId', 'car-2', null)]))).toMatchObject({
        tipo: 'invalido',
      });
    });

    it('escolher para condutor quem entretanto mudou de carrinha é um conflito da carrinha dessa pessoa', () => {
      // Versão 2: alguém passa o Zé da car-2 para a car-1.
      gravarLote(bd, pedido([mover('p-ze', 'carrinhaId', 'car-2', 'car-1')]));
      const antes = carregarEstado(bd, AGORA);
      // Um browser na versão 1 (o Zé ainda na car-2) fá-lo condutor da car-2.
      expect(gravarLote(bd, pedidoSobre(1, [condutor('car-2', null, 'p-ze')]))).toStrictEqual({
        tipo: 'conflito',
        conflitos: [
          {
            tipo: 'mover',
            pessoaId: 'p-ze',
            campo: 'carrinhaId',
            esperado: 'car-2',
            atual: 'car-1',
            descricao:
              'Zé Teste — carrinha: esperavas ZZ 0002, mas agora está em ZZ 0001 (alguém mudou entretanto)',
          },
        ],
      });
      expect(carregarEstado(bd, AGORA)).toStrictEqual(antes);
      // Sobre a versão atual é só um condutor que não vai na carrinha: 400.
      expect(gravarLote(bd, pedidoSobre(2, [condutor('car-2', null, 'p-ze')]))).toStrictEqual({
        tipo: 'invalido',
        erros: ['Zé Teste não vai na carrinha ZZ 0002: não pode ser o condutor.'],
      });
    });

    it('mudanças de outros depois da versão do rascunho que não tocam no que ele supõe não contam', () => {
      // Versões 2 e 3: a Élia passa para a car-2 e fica a conduzi-la.
      gravarLote(bd, pedido([mover('p-elia', 'carrinhaId', 'car-1', 'car-2')]));
      gravarLote(bd, pedido([condutor('car-2', null, 'p-elia')]));
      // Um browser na versão 1 tira o Zé da car-2 (não é ele quem conduz) e põe o Álvaro a conduzir a car-1.
      const r = gravarLote(
        bd,
        pedidoSobre(1, [
          mover('p-ze', 'carrinhaId', 'car-2', null),
          mover('p-alvaro', 'carrinhaId', null, 'car-1'),
          condutor('car-1', null, 'p-alvaro'),
        ]),
      );
      expect(r).toMatchObject({ tipo: 'gravado' });
    });
  });

  // Dois browsers partem da mesma versão e fazem rascunhos "como no browser" (ver o teste seguinte). O
  // primeiro grava; o segundo nunca pode receber um erro de validação (400): ou grava, ou é um conflito.
  it('em rascunhos concorrentes com condutores, o segundo grava ou dá conflito, nunca 400', () => {
    const alvos = [
      { tipo: 'carrinha', id: 'car-1' },
      { tipo: 'carrinha', id: 'car-2' },
      { tipo: 'sem-transporte' },
    ] as const;
    const pessoas = ['p-ze', 'p-alvaro', 'p-elia'];
    const resultados = new Set<string>();
    let escondidos = 0;
    for (let semente = 1; semente <= 150; semente++) {
      let s = semente * 7919;
      const sortear = (n: number) => {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        return (s >>> 16) % n;
      };
      const rascunho = (base: Estado) => {
        const passos: Operacao[][] = [];
        for (let i = 0; i < 1 + sortear(4); i++) {
          const visivel = aplicarOperacoes(base, passos.flat());
          const pessoaId = pessoas[sortear(pessoas.length)] as string;
          if (sortear(2) === 0) {
            passos.push(operacoesParaAlvo(visivel, [pessoaId], alvos[sortear(alvos.length)] as Alvo));
            continue;
          }
          const carrinha = visivel.pessoas.find((p) => p.id === pessoaId)?.carrinhaId;
          const op = carrinha
            ? operacaoCondutor(visivel, carrinha, sortear(4) === 0 ? null : pessoaId)
            : null;
          if (op) passos.push([op]);
        }
        return passos.flat();
      };
      const b = abrirBd(':memory:');
      inserirDadosFicticios(b);
      inserirLotes(b, 1);
      if (semente % 3 === 0) gravarLote(b, pedido([condutor('car-2', null, 'p-ze')]));
      const base = carregarEstado(b, AGORA);
      const primeiro = rascunho(base);
      const segundo = rascunho(base);
      gravarLote(b, { ...pedido(primeiro), versaoBase: base.versao });
      const intermedio = carregarEstado(b, AGORA);
      const r = gravarLote(b, { ...pedido(segundo), versaoBase: base.versao });
      resultados.add(r.tipo);
      expect(r.tipo, `semente ${semente}: ${JSON.stringify(r)}`).not.toBe('invalido');
      if (r.tipo === 'conflito' && encontrarConflitos(intermedio, compactarOperacoes(segundo)).length === 0) {
        escondidos++;
      }
      // E a regra fica sempre cumprida na base de dados: quem conduz vai nessa carrinha.
      const final = carregarEstado(b, AGORA);
      for (const c of final.carrinhas) {
        if (c.condutorId === null) continue;
        expect(final.pessoas.find((p) => p.id === c.condutorId)?.carrinhaId, `semente ${semente}`).toBe(c.id);
      }
      b.$client.close();
    }
    expect(resultados.has('gravado') && resultados.has('conflito')).toBe(true);
    expect(escondidos).toBeGreaterThan(0);
  });

  // Como no browser: cada passo parte do estado visível (o gravado com o rascunho aplicado), as pessoas
  // mudam com operacoesParaAlvo (que tira o condutor a quem sai da carrinha que conduz) e o condutor com
  // operacaoCondutor (só a quem vai na carrinha). O servidor nunca pode recusar um rascunho assim, e o que
  // grava tem de ser a simulação compactada, também nas carrinhas.
  it('em sequências aleatórias com condutores, nada é recusado e gravado = simulação', () => {
    const alvos = [
      { tipo: 'carrinha', id: 'car-1' },
      { tipo: 'carrinha', id: 'car-2' },
      { tipo: 'sem-transporte' },
      { tipo: 'casa', id: 'casa-monte' },
    ] as const;
    const pessoas = ['p-ze', 'p-alvaro', 'p-elia'];
    const resultados = new Set<string>();
    let comCondutorNoFim = 0;
    for (let semente = 1; semente <= 60; semente++) {
      let s = semente;
      const sortear = (n: number) => {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        return (s >>> 16) % n;
      };
      const bdAleatoria = abrirBd(':memory:');
      inserirDadosFicticios(bdAleatoria);
      if (semente % 2 === 0) gravarLote(bdAleatoria, pedido([condutor('car-2', null, 'p-ze')]));
      const antes = carregarEstado(bdAleatoria, AGORA);
      const passos: Operacao[][] = [];
      for (let i = 0; i < 3 + sortear(8); i++) {
        const visivel = aplicarOperacoes(antes, passos.flat());
        const pessoaId = pessoas[sortear(pessoas.length)] as string;
        if (sortear(2) === 0) {
          passos.push(operacoesParaAlvo(visivel, [pessoaId], alvos[sortear(alvos.length)] as Alvo));
          continue;
        }
        const carrinha = visivel.pessoas.find((p) => p.id === pessoaId)?.carrinhaId;
        const op = carrinha ? operacaoCondutor(visivel, carrinha, sortear(3) === 0 ? null : pessoaId) : null;
        if (op) passos.push([op]);
      }
      const ops = passos.flat();
      const r = gravarLote(bdAleatoria, pedido(ops));
      resultados.add(r.tipo);
      const gravado = carregarEstado(bdAleatoria, AGORA);
      const simulado = aplicarOperacoes(antes, compactarOperacoes(ops));
      expect(gravado.pessoas, `semente ${semente}`).toStrictEqual(simulado.pessoas);
      expect(gravado.carrinhas, `semente ${semente}`).toStrictEqual(simulado.carrinhas);
      // Os condutores da simulação (todos os passos) são os gravados.
      expect(aplicarOperacoes(antes, ops).carrinhas, `semente ${semente}`).toStrictEqual(gravado.carrinhas);
      if (gravado.carrinhas.some((c) => c.condutorId !== null)) comCondutorNoFim++;
      bdAleatoria.$client.close();
    }
    expect(resultados).toStrictEqual(new Set(['gravado', 'vazio']));
    expect(comCondutorNoFim).toBeGreaterThan(5);
  });

  it('o histórico usa os nomes atuais e respeita o limite', () => {
    gravarLote(bd, pedido([mover('p-ze', 'carrinhaId', 'car-2', 'car-1')]));
    gravarLote(bd, pedido([mover('p-ze', 'obraId', 'obra-vale', null)]));
    bd.$client.prepare("UPDATE carrinhas SET matricula = 'ZZ0101' WHERE id = 'car-1'").run();

    const historico = lerHistorico(bd, 2);
    expect(historico.map((h) => h.loteId)).toStrictEqual([3, 2]);
    expect(historico.map((h) => h.alteracoes.map((a) => a.descricao))).toStrictEqual([
      ['Zé Teste — obra: Obra do Vale → sem obra'],
      ['Zé Teste — carrinha: ZZ 0002 → ZZ 0101'],
    ]);
    expect(lerHistorico(bd, 1).map((h) => h.loteId)).toStrictEqual([3]);
  });

  it('sem lotes, o histórico é uma lista vazia', () => {
    const vazia = abrirBd(':memory:');
    expect(lerHistorico(vazia, 50)).toStrictEqual([]);
    vazia.$client.close();
  });
});
