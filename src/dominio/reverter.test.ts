// Testes de dominio/reverter.ts (M2, docs/m2.md, "Reverter"). Dados fictícios.

import { describe, expect, it } from 'vitest';
import { CAMPO_CONDUTOR, CAMPO_DORMIDA, CAMPO_REGISTO, type Operacao } from './operacoes';
import { type AlteracaoGravada, operacaoDaAlteracao, planearReversao, podeReverter } from './reverter';
import {
  criarIndisponibilidade,
  criarLocal,
  criarObra,
  criarPessoa,
  criarProblema,
  estadoExemplo,
} from './teste-fabrica';
import type { Estado } from './tipos';

const ID = '1b2c3d4e-0000-4000-8000-0000000000';

function linha(
  entidade: string,
  entidadeId: string,
  campo: string,
  antes: unknown,
  depois: unknown,
): AlteracaoGravada {
  return {
    entidade,
    entidadeId,
    campo,
    antes: antes === undefined ? null : JSON.stringify(antes),
    depois: depois === undefined ? null : JSON.stringify(depois),
  };
}

const localNovo = criarLocal({
  id: `local-${ID}01`,
  tipo: 'obra',
  nome: 'Obra Nova',
  morada: 'Rue X',
  raioM: 150,
});
const obraNova = criarObra({
  id: `obra-${ID}01`,
  nome: 'Obra Nova',
  clienteId: 'cliente-a',
  localId: localNovo.id,
});

/** O estado depois de um lote que criou a Obra Nova e levou para lá a Helena e a Ana. */
function comObraNova(): Estado {
  const e = estadoExemplo();
  return {
    ...e,
    locais: [...e.locais, localNovo],
    obras: [...e.obras, obraNova],
    pessoas: e.pessoas.map((p) =>
      p.id === 'p-helena' || p.id === 'p-ana' ? { ...p, obraId: obraNova.id } : p,
    ),
  };
}

const loteDaObra: AlteracaoGravada[] = [
  linha('local', localNovo.id, CAMPO_REGISTO, undefined, localNovo),
  linha('obra', obraNova.id, CAMPO_REGISTO, undefined, obraNova),
  linha('pessoa', 'p-helena', 'obraId', null, obraNova.id),
  linha('pessoa', 'p-ana', 'obraId', 'obra-b', obraNova.id),
];

describe('podeReverter', () => {
  it('só lotes aplicados, gravados no programa', () => {
    expect(podeReverter({ autor: 'ana@exemplo.lu', estado: 'aplicado', tipo: 'mudanca' })).toBe(true);
    expect(podeReverter({ autor: 'local', estado: 'aplicado', tipo: 'ficha' })).toBe(true);
    expect(podeReverter({ autor: 'importacao', estado: 'aplicado', tipo: 'importacao' })).toBe(false);
    expect(podeReverter({ autor: 'dados-iniciais', estado: 'aplicado', tipo: 'ficha' })).toBe(false);
    expect(podeReverter({ autor: 'local', estado: 'agendado', tipo: 'mudanca' })).toBe(false);
  });
});

describe('operacaoDaAlteracao', () => {
  it('cada linha volta a ser a operação que a gravou', () => {
    expect(operacaoDaAlteracao(linha('pessoa', 'p-ana', 'casaId', 'casa-1', null))).toEqual({
      tipo: 'mover',
      pessoaId: 'p-ana',
      campo: 'casaId',
      de: 'casa-1',
      para: null,
    });
    expect(operacaoDaAlteracao(linha('carrinha', 'zz1001', CAMPO_CONDUTOR, null, 'p-ana'))).toMatchObject({
      tipo: 'condutor',
      para: 'p-ana',
    });
    expect(
      operacaoDaAlteracao(linha('carrinha', 'zz1001', CAMPO_DORMIDA, 'casa:casa-1', null)),
    ).toMatchObject({
      tipo: 'dormida',
      de: 'casa:casa-1',
    });
    expect(operacaoDaAlteracao(linha('casa', 'casa-1', 'lotacao', 3, 4))).toEqual({
      tipo: 'campo',
      entidade: 'casa',
      id: 'casa-1',
      campo: 'lotacao',
      de: 3,
      para: 4,
    });
    expect(operacaoDaAlteracao(linha('obra', obraNova.id, CAMPO_REGISTO, undefined, obraNova))).toEqual({
      tipo: 'registo',
      entidade: 'obra',
      id: obraNova.id,
      de: null,
      para: obraNova,
    });
  });

  it('as que não são do programa dão null', () => {
    expect(operacaoDaAlteracao(linha('cliente', 'cliente-a', 'cor', '#000000', '#FFFFFF'))).toBeNull();
    expect(operacaoDaAlteracao(linha('carrinha', 'zz1001', 'ordem', 1, 2))).toBeNull();
    // Um veículo que entrou pelos dados iniciais (antes sem valor) não é um 'campo'.
    expect(operacaoDaAlteracao(linha('carrinha', 'zz1001', 'marca', undefined, 'Ford'))).toBeNull();
    expect(
      operacaoDaAlteracao(linha('casa', 'casa-1', CAMPO_REGISTO, undefined, { id: 'casa-1' })),
    ).toBeNull();
  });
});

describe('planearReversao', () => {
  it('uma pessoa nova não se apaga, mas as lotações e a mudança de casa revertem', () => {
    const nova = criarPessoa({ id: `pessoa-${ID}02`, nomeCurto: 'Zé N.', clienteId: 'cliente-a' });
    const e = estadoExemplo();
    const estado: Estado = {
      ...e,
      pessoas: [...e.pessoas, { ...nova, casaId: 'casa-3' }],
      casas: e.casas.map((c) => (c.id === 'casa-1' ? { ...c, lotacao: 4 } : c)),
    };
    const plano = planearReversao(estado, [
      linha('pessoa', nova.id, CAMPO_REGISTO, undefined, nova),
      linha('pessoa', nova.id, 'casaId', null, 'casa-3'),
      linha('pessoa', nova.id, 'casaAConfirmar', true, false),
      linha('casa', 'casa-1', 'lotacao', 3, 4),
    ]);
    expect(plano.operacoes).toEqual<Operacao[]>([
      { tipo: 'campo', entidade: 'casa', id: 'casa-1', campo: 'lotacao', de: 4, para: 3 },
      { tipo: 'mover', pessoaId: nova.id, campo: 'casaId', de: 'casa-3', para: null },
    ]);
    expect(plano.impossiveis).toEqual([
      {
        descricao: 'Zé N. — entrou (Alfa Construções)',
        motivo: 'uma pessoa nova não se apaga: usa Saiu da empresa',
      },
    ]);
    expect(plano.erros).toEqual([]);
  });

  it('uma obra criada com pessoas reverte tudo num passo', () => {
    const plano = planearReversao(comObraNova(), loteDaObra);
    expect(plano.impossiveis).toEqual([]);
    expect(plano.erros).toEqual([]);
    expect(plano.operacoes).toEqual<Operacao[]>([
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'obraId', de: obraNova.id, para: 'obra-b' },
      { tipo: 'mover', pessoaId: 'p-helena', campo: 'obraId', de: obraNova.id, para: null },
      { tipo: 'registo', entidade: 'obra', id: obraNova.id, de: obraNova, para: null },
      { tipo: 'registo', entidade: 'local', id: localNovo.id, de: localNovo, para: null },
    ]);
  });

  it('a obra que entretanto ganhou pessoas fica nos erros (tirar uma inversa não resolve)', () => {
    const e = comObraNova();
    const estado = {
      ...e,
      pessoas: e.pessoas.map((p) => (p.id === 'p-bruno' ? { ...p, obraId: obraNova.id } : p)),
    };
    const plano = planearReversao(estado, loteDaObra);
    expect(plano.erros).toEqual([
      'Obra Nova — ainda tem 1 pessoa: muda-as para outra obra antes de a apagar.',
    ]);
    expect(plano.impossiveis).toEqual([]);
  });

  it('o que mudou entretanto fica de fora, com o porquê', () => {
    const e = estadoExemplo();
    const estado: Estado = {
      ...e,
      casas: e.casas.map((c) => (c.id === 'casa-1' ? { ...c, lotacao: 5 } : c)),
      pessoas: e.pessoas.map((p) => (p.id === 'p-ana' ? { ...p, casaId: 'casa-3' } : p)),
    };
    const plano = planearReversao(estado, [
      linha('casa', 'casa-1', 'lotacao', 3, 4),
      linha('pessoa', 'p-ana', 'casaId', 'casa-2', 'casa-1'),
      linha('carrinha', 'zz1001', CAMPO_CONDUTOR, null, 'p-ana'),
      linha('carrinha', 'zz1002', CAMPO_DORMIDA, null, 'casa:casa-1'),
      linha('casa', 'casa-2', 'lotacao', 1, 2),
    ]);
    expect(plano.operacoes).toEqual([
      { tipo: 'campo', entidade: 'casa', id: 'casa-2', campo: 'lotacao', de: 2, para: 1 },
    ]);
    expect(plano.impossiveis).toEqual([
      {
        descricao: 'ZZ 1002 — onde dorme: por definir → Casa Um',
        motivo: 'entretanto mudou: agora dorme em Parque',
      },
      {
        descricao: 'ZZ 1001 — condutor: sem condutor → Ana T.',
        motivo: 'entretanto mudou: agora não tem condutor',
      },
      {
        descricao: 'Ana T. — casa: Casa Dois → Casa Um',
        motivo: 'entretanto mudou: agora está em Casa Três',
      },
      { descricao: 'Casa Um — lotação: 3 → 4', motivo: 'entretanto mudou: agora é 5' },
    ]);
  });

  it('registos que já não estão no Estado e linhas que não são do programa', () => {
    const periodo = criarIndisponibilidade({
      id: `indisp-${ID}03`,
      pessoaId: 'p-ana',
      inicio: '2026-01-01',
      fim: '2026-01-02',
    });
    const plano = planearReversao(estadoExemplo(), [
      linha('indisponibilidade', periodo.id, CAMPO_REGISTO, undefined, periodo),
      linha('obra', obraNova.id, 'nome', 'Obra', 'Obra Nova'),
      linha('cliente', 'cliente-a', 'cor', '#000000', '#ED7D31'),
      { ...linha('carrinha', 'zz1001', 'ordem', 1, 2), descricao: 'ZZ 1001 — ordem: 1 → 2' },
    ]);
    expect(plano.operacoes).toEqual([]);
    expect(plano.impossiveis.map((i) => i.motivo)).toEqual([
      'não se reverte no programa',
      'não se reverte no programa',
      'já não existe',
      'já não aparece no mapa (acabou há mais de 30 dias)',
    ]);
    expect(plano.impossiveis[0]?.descricao).toBe('ZZ 1001 — ordem: 1 → 2');
  });

  it('com erros, tira a inversa que os causa (com a frase do erro como motivo) e reverte o resto', () => {
    // O lote apagou o período P da Ana e mudou a lotação; depois alguém marcou-a indisponível por cima de P.
    const p = criarIndisponibilidade({
      id: `indisp-${ID}04`,
      pessoaId: 'p-ana',
      inicio: '2026-10-01',
      fim: '2026-10-10',
    });
    const q = criarIndisponibilidade({
      id: `indisp-${ID}05`,
      pessoaId: 'p-ana',
      inicio: '2026-10-05',
      fim: '2026-10-12',
    });
    const e = estadoExemplo();
    const estado: Estado = {
      ...e,
      indisponibilidades: [q],
      casas: e.casas.map((c) => (c.id === 'casa-1' ? { ...c, lotacao: 4 } : c)),
    };
    const plano = planearReversao(estado, [
      linha('indisponibilidade', p.id, CAMPO_REGISTO, p, undefined),
      linha('casa', 'casa-1', 'lotacao', 3, 4),
    ]);
    expect(plano.operacoes).toEqual([
      { tipo: 'campo', entidade: 'casa', id: 'casa-1', campo: 'lotacao', de: 4, para: 3 },
    ]);
    expect(plano.impossiveis).toEqual([
      {
        descricao: 'Ana T. — período de indisponibilidade apagado',
        motivo:
          'Ana T. — já está indisponível de 05/10/2026 a 12/10/2026: os períodos não se podem sobrepor.',
      },
    ]);
    expect(plano.erros).toEqual([]);
    // Sem o Q, o período volta.
    expect(
      planearReversao({ ...estado, indisponibilidades: [] }, [
        linha('indisponibilidade', p.id, CAMPO_REGISTO, p, undefined),
      ]).operacoes,
    ).toEqual([{ tipo: 'registo', entidade: 'indisponibilidade', id: p.id, de: null, para: p }]);
  });

  it('reverter um "Saiu da empresa" é válido (as marcas "a confirmar" ignoram-se)', () => {
    const e = estadoExemplo();
    const estado: Estado = {
      ...e,
      pessoas: e.pessoas.map((p) =>
        p.id === 'p-ana' ? { ...p, ativa: false, casaId: null, carrinhaId: null, obraId: null } : p,
      ),
    };
    const plano = planearReversao(estado, [
      linha('pessoa', 'p-ana', 'casaId', 'casa-1', null),
      linha('pessoa', 'p-ana', 'carrinhaId', 'zz1001', null),
      linha('pessoa', 'p-ana', 'carrinhaAConfirmar', true, false),
      linha('pessoa', 'p-ana', 'obraId', 'obra-b', null),
      linha('pessoa', 'p-ana', 'ativa', true, false),
    ]);
    expect(plano.erros).toEqual([]);
    expect(plano.impossiveis).toEqual([]);
    expect(plano.operacoes.map((op) => (op.tipo === 'mover' ? op.campo : op.tipo))).toEqual([
      'campo',
      'obraId',
      'carrinhaId',
      'casaId',
    ]);
  });

  it('um problema apagado volta (se ainda não existir)', () => {
    const problema = criarProblema({ id: `problema-${ID}06`, casaId: 'casa-1' });
    const linhas = [linha('problema', problema.id, CAMPO_REGISTO, problema, undefined)];
    expect(planearReversao(estadoExemplo(), linhas).operacoes).toEqual([
      { tipo: 'registo', entidade: 'problema', id: problema.id, de: null, para: problema },
    ]);
    const comEle = { ...estadoExemplo(), problemas: [problema] };
    expect(planearReversao(comEle, linhas).impossiveis[0]?.motivo).toBe('já existe outra vez');
  });

  it('um problema aberto e resolvido no mesmo lote apaga-se (o "resolvido" é do próprio lote)', () => {
    const problema = criarProblema({ id: `problema-${ID}07`, casaId: 'casa-1', resolvidoEm: null });
    const resolvido = { ...problema, resolvidoEm: '2026-10-04' };
    const linhas = [
      linha('problema', problema.id, CAMPO_REGISTO, undefined, problema),
      linha('problema', problema.id, 'resolvidoEm', null, '2026-10-04'),
    ];
    const estado = { ...estadoExemplo(), problemas: [resolvido] };
    const plano = planearReversao(estado, linhas);
    expect(plano.impossiveis).toEqual([]);
    expect(plano.erros).toEqual([]);
    expect(plano.operacoes).toEqual([
      { tipo: 'registo', entidade: 'problema', id: problema.id, de: resolvido, para: null },
    ]);
    // Reaberto depois: aí sim, "foi editado depois".
    const reaberto = { ...estadoExemplo(), problemas: [problema] };
    expect(planearReversao(reaberto, linhas).impossiveis.map((i) => i.motivo)).toContain(
      'entretanto mudou (foi editado depois)',
    );
  });
});
