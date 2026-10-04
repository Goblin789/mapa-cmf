// Testes de dominio/indisponibilidade.ts (M2). Só a pessoa e as datas, nunca o motivo. Dados fictícios.

import { describe, expect, it } from 'vitest';
import {
  indisponiveisEm,
  operacoesMarcarIndisponivel,
  operacoesTerminarPeriodo,
  periodoEm,
  periodoInclui,
  periodosDaPessoa,
  periodosFuturos,
  periodosSobrepoem,
  textoAte,
  textoPeriodo,
} from './indisponibilidade';
import { criarEstado, criarIndisponibilidade, criarPessoa } from './teste-fabrica';

const ana = criarPessoa({ id: 'p-ana', nomeCurto: 'Ana T.' });
const ivo = criarPessoa({ id: 'p-ivo', nomeCurto: 'Ivo X.', ativa: false });
const agosto = criarIndisponibilidade({
  id: 'i-ago',
  pessoaId: 'p-ana',
  inicio: '2026-08-01',
  fim: '2026-08-15',
});
const outubro = criarIndisponibilidade({
  id: 'i-out',
  pessoaId: 'p-ana',
  inicio: '2026-10-01',
  fim: '2026-10-12',
});
const dezembro = criarIndisponibilidade({ id: 'i-dez', pessoaId: 'p-ana', inicio: '2026-12-20', fim: null });
const doIvo = criarIndisponibilidade({ id: 'i-ivo', pessoaId: 'p-ivo', inicio: '2026-10-01', fim: null });
const estado = criarEstado({ pessoas: [ana, ivo], indisponibilidades: [dezembro, outubro, doIvo, agosto] });

describe('períodos', () => {
  it('o período inclui o primeiro e o último dia; sem fim, inclui tudo o que vem depois', () => {
    expect(periodoInclui(outubro, '2026-10-01')).toBe(true);
    expect(periodoInclui(outubro, '2026-10-12')).toBe(true);
    expect(periodoInclui(outubro, '2026-09-30')).toBe(false);
    expect(periodoInclui(outubro, '2026-10-13')).toBe(false);
    expect(periodoInclui(dezembro, '2030-01-01')).toBe(true);
  });

  it('sobreposições: um dia em comum chega; dois sem fim sobrepõem-se sempre', () => {
    expect(periodosSobrepoem(outubro, { ...outubro, inicio: '2026-10-12', fim: '2026-10-12' })).toBe(true);
    expect(periodosSobrepoem(outubro, agosto)).toBe(false);
    expect(periodosSobrepoem(dezembro, { ...dezembro, inicio: '2027-05-01' })).toBe(true);
    expect(periodosSobrepoem(dezembro, outubro)).toBe(false);
  });

  it('os da pessoa vêm pelo início; o de um dia; os futuros', () => {
    expect(periodosDaPessoa(estado, 'p-ana').map((p) => p.id)).toEqual(['i-ago', 'i-out', 'i-dez']);
    expect(periodoEm(estado, 'p-ana', '2026-10-04')?.id).toBe('i-out');
    expect(periodoEm(estado, 'p-ana', '2026-10-20')).toBeNull();
    expect(periodosFuturos(estado, 'p-ana', '2026-10-04').map((p) => p.id)).toEqual(['i-dez']);
  });

  it('quem está indisponível num dia: só pessoas ativas', () => {
    expect([...indisponiveisEm(estado, '2026-10-04').keys()]).toEqual(['p-ana']);
    expect(indisponiveisEm(estado, '2026-11-01').size).toBe(0);
  });

  it('textos', () => {
    expect(textoAte(outubro)).toBe('até 12/10');
    expect(textoAte(dezembro)).toBe('sem data de regresso');
    expect(textoPeriodo(dezembro)).toBe('desde 20/12 (sem data de regresso)');
    expect(textoPeriodo({ ...outubro, fim: '2026-10-01' })).toBe('só 01/10');
  });
});

describe('operações de indisponibilidade', () => {
  it('marcar: um período por pessoa (sem repetidas), sem motivo', () => {
    let n = 0;
    const ops = operacoesMarcarIndisponivel(['p-ana', 'p-rui', 'p-ana'], '2026-10-06', '2026-10-10', () => {
      n += 1;
      return `0000000${n}`;
    });
    expect(ops.map((op) => (op.tipo === 'registo' ? op.para : null))).toEqual([
      { id: 'indisp-00000001', pessoaId: 'p-ana', inicio: '2026-10-06', fim: '2026-10-10' },
      { id: 'indisp-00000002', pessoaId: 'p-rui', inicio: '2026-10-06', fim: '2026-10-10' },
    ]);
  });

  it('"Já voltou": acaba ontem; o que começou hoje ou ainda não começou apaga-se; o que já acabou fica', () => {
    expect(operacoesTerminarPeriodo(estado, 'i-out', '2026-10-05')).toEqual([
      {
        tipo: 'campo',
        entidade: 'indisponibilidade',
        id: 'i-out',
        campo: 'fim',
        de: '2026-10-12',
        para: '2026-10-04',
      },
    ]);
    expect(operacoesTerminarPeriodo(estado, 'i-dez', '2026-10-05')).toEqual([
      { tipo: 'registo', entidade: 'indisponibilidade', id: 'i-dez', de: dezembro, para: null },
    ]);
    expect(operacoesTerminarPeriodo(estado, 'i-out', '2026-10-01')[0]).toMatchObject({ para: null });
    expect(operacoesTerminarPeriodo(estado, 'i-ago', '2026-10-05')).toEqual([]);
    expect(operacoesTerminarPeriodo(estado, 'nao-existe', '2026-10-05')).toEqual([]);
    // Sem fim: acaba ontem.
    expect(operacoesTerminarPeriodo(estado, 'i-ivo', '2026-10-05')[0]).toMatchObject({
      campo: 'fim',
      de: null,
    });
  });
});
