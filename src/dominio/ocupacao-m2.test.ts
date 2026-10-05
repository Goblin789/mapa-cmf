// Testes do M2 em indices.ts, ocupacao.ts, contadores.ts e pesquisa.ts: quem está indisponível liberta o lugar
// na carrinha (mas não a cama na casa), os problemas abertos e as obras na pesquisa. Dados fictícios.

import { describe, expect, it } from 'vitest';
import { calcularContadores } from './contadores';
import { indexar } from './indices';
import {
  lugaresTemporarios,
  ocupacaoCasa,
  ocupacaoDaCarrinha,
  ocupacaoDaCasa,
  textoLugaresTemporarios,
} from './ocupacao';
import { pesquisar } from './pesquisa';
import { criarIndisponibilidade, criarProblema, estadoExemplo } from './teste-fabrica';
import type { Estado } from './tipos';

/** estadoExemplo com: Ana (zz1001, casa-1) fora de 01/10 a 12/10, Bruno (zz1001) sem data, Ivo (inativo). */
function comIndisponiveis(): Estado {
  const estado = estadoExemplo();
  return {
    ...estado,
    carrinhas: estado.carrinhas.map((c) => (c.id === 'zz1001' ? { ...c, condutorId: 'p-gil' } : c)),
    indisponibilidades: [
      criarIndisponibilidade({ id: 'i1', pessoaId: 'p-ana', inicio: '2026-10-01', fim: '2026-10-12' }),
      criarIndisponibilidade({ id: 'i2', pessoaId: 'p-bruno', inicio: '2026-09-01', fim: null }),
      criarIndisponibilidade({ id: 'i3', pessoaId: 'p-ivo', inicio: '2026-09-01', fim: null }),
      criarIndisponibilidade({ id: 'i4', pessoaId: 'p-filipe', inicio: '2026-10-08', fim: '2026-10-09' }),
    ],
    problemas: [
      criarProblema({ id: 'pr1', casaId: 'casa-1' }),
      criarProblema({ id: 'pr2', casaId: null, carrinhaId: 'zz1002', resolvidoEm: '2026-02-01' }),
    ],
  };
}

describe('índices e ocupação com indisponíveis (M2)', () => {
  it('na carrinha o lugar fica livre; na casa a cama não; o condutor continua em primeiro', () => {
    const estado = comIndisponiveis();
    const ind = indexar(estado, '2026-10-04');
    expect([...ind.indisponiveis.keys()].sort()).toEqual(['p-ana', 'p-bruno']);
    const zz1001 = estado.carrinhas.find((c) => c.id === 'zz1001');
    if (!zz1001) throw new Error('falta a carrinha');
    // zz1001: Ana, Bruno, Filipe, Gil (4); sem Ana e Bruno ficam 2.
    expect(ind.passageiros.get('zz1001')?.map((p) => p.id)[0]).toBe('p-gil');
    expect(ind.passageiros.get('zz1001')?.length).toBe(4);
    expect(ocupacaoDaCarrinha(ind, zz1001)).toEqual({ ocupados: 2, lugares: 5, livres: 3, nivel: 'livre' });
    const casa1 = estado.casas.find((c) => c.id === 'casa-1');
    if (!casa1) throw new Error('falta a casa');
    expect(ocupacaoDaCasa(ind, casa1)).toEqual(ocupacaoCasa(casa1, 3));
    expect(ind.hoje).toBe('2026-10-04');
  });

  it('os lugares temporários: o primeiro a voltar à frente, os sem data no fim', () => {
    const ind = indexar(comIndisponiveis(), '2026-10-08');
    const lugares = lugaresTemporarios(ind, 'zz1001');
    expect(lugares).toEqual([
      { pessoaId: 'p-filipe', ate: '2026-10-09' },
      { pessoaId: 'p-ana', ate: '2026-10-12' },
      { pessoaId: 'p-bruno', ate: null },
    ]);
    // Quem não tem data de regresso não está livre "até 09/10": vai à parte.
    expect(textoLugaresTemporarios(lugares)).toBe('2 livres até 09/10 · 1 sem data de regresso');
    expect(textoLugaresTemporarios(lugares.slice(0, 2))).toBe('2 livres até 09/10');
    expect(textoLugaresTemporarios(lugares.slice(1))).toBe('1 livre até 12/10 · 1 sem data de regresso');
    expect(
      textoLugaresTemporarios([
        { pessoaId: 'a', ate: null },
        { pessoaId: 'b', ate: null },
      ]),
    ).toBe('2 livres (sem data de regresso)');
    expect(lugaresTemporarios(ind, 'zz1003')).toEqual([]);
    expect(lugaresTemporarios(ind, 'nao-existe')).toEqual([]);
  });

  it('sem hoje (servidor, importação) ninguém está indisponível', () => {
    const ind = indexar(comIndisponiveis(), null);
    expect(ind.indisponiveis.size).toBe(0);
    expect(ind.ocupadosCarrinha.get('zz1001')).toBe(4);
    expect(ind.hoje).toBeNull();
  });

  it('problemas abertos por casa e por carrinha (os resolvidos não)', () => {
    const ind = indexar(comIndisponiveis(), '2026-10-04');
    expect(ind.problemasAbertos.get('casa:casa-1')?.map((p) => p.id)).toEqual(['pr1']);
    expect(ind.problemasAbertos.has('carrinha:zz1002')).toBe(false);
  });

  it('os contadores das carrinhas contam como o ecrã (sem os indisponíveis)', () => {
    const estado = comIndisponiveis();
    const semHoje = calcularContadores(estado, indexar(estado, null));
    const comHoje = calcularContadores(estado, indexar(estado, '2026-10-04'));
    expect(comHoje.lugaresLivresCarrinhas - semHoje.lugaresLivresCarrinhas).toBe(2);
    // As casas não mudam: a cama não se liberta.
    expect(comHoje.lugaresLivresCasas).toBe(semHoje.lugaresLivresCasas);
    // Uma carrinha só com quem está indisponível conta como sem passageiros.
    const soAna: Estado = {
      ...estado,
      pessoas: estado.pessoas.map((p) => (p.carrinhaId === 'zz1002' ? { ...p, carrinhaId: null } : p)),
      indisponibilidades: [
        ...estado.indisponibilidades,
        criarIndisponibilidade({ id: 'i5', pessoaId: 'p-helena', inicio: '2026-10-01', fim: null }),
      ],
    };
    const helena: Estado = {
      ...soAna,
      pessoas: soAna.pessoas.map((p) => (p.id === 'p-helena' ? { ...p, carrinhaId: 'zz1002' } : p)),
    };
    // A zz1003 só leva o Ivo (inativo): já conta como sem passageiros; a zz1002 só leva a Helena, indisponível.
    expect(calcularContadores(helena, indexar(helena, null)).carrinhasSemPassageiros).toBe(1);
    expect(calcularContadores(helena, indexar(helena, '2026-10-04')).carrinhasSemPassageiros).toBe(2);
  });
});

describe('pesquisa de obras (M2)', () => {
  it('encontra obras pelo nome, com o cliente e quantas pessoas lá estão', () => {
    const estado = estadoExemplo();
    const ind = indexar(estado, null);
    expect(pesquisar(estado, ind, 'obra alfa')).toEqual([
      {
        tipo: 'obra',
        id: 'obra-a',
        rotulo: 'Obra Alfa',
        detalhe: 'Alfa Construções · 1 pessoa',
        pontuacao: 3,
      },
    ]);
    const beta = pesquisar(estado, ind, 'beta').find((r) => r.tipo === 'obra');
    expect(beta).toMatchObject({ id: 'obra-b', detalhe: 'Beta Obras · 2 pessoas', pontuacao: 1 });
    expect(pesquisar(estado, ind, 'obra').filter((r) => r.tipo === 'obra')).toHaveLength(2);
  });
});
