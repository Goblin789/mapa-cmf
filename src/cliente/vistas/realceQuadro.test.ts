import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import type { Operacao } from '../../dominio/operacoes';
import type { Estado } from '../../dominio/tipos';
import { estadoVistas } from './estadoTeste';
import { blocoTemAlteracoes, chavesNoQuadro, pessoasDoFocoSemBloco } from './realceQuadro';

const ind = indexar(estadoVistas());
const dorm = dormidasDasCarrinhas(estadoVistas(), ind);

describe('chavesNoQuadro', () => {
  it('uma pessoa ativa é o seu nome, em qualquer agrupamento; uma inativa ou desconhecida, nada', () => {
    expect(chavesNoQuadro({ tipo: 'pessoa', id: 'p-2' }, 'casas', ind, dorm)).toEqual(['pessoa:p-2']);
    expect(chavesNoQuadro({ tipo: 'pessoa', id: 'p-7' }, 'carrinhas', ind, dorm)).toEqual(['pessoa:p-7']);
    expect(chavesNoQuadro({ tipo: 'pessoa', id: 'p-9' }, 'casas', ind, dorm)).toEqual([]);
    expect(chavesNoQuadro({ tipo: 'pessoa', id: 'nao-existe' }, 'casas', ind, dorm)).toEqual([]);
  });

  it('uma casa é o seu bloco no Quadro por casas e os moradores no Quadro por carrinhas', () => {
    expect(chavesNoQuadro({ tipo: 'casa', id: 'casa-l1' }, 'casas', ind, dorm)).toEqual(['casa:casa-l1']);
    expect(chavesNoQuadro({ tipo: 'casa', id: 'casa-l1' }, 'carrinhas', ind, dorm).sort()).toEqual([
      'pessoa:p-1',
      'pessoa:p-2',
    ]);
    // Sem moradores ativos (a Casa L2 só tem um inativo) e sem carrinhas a dormir lá: nada para acender.
    expect(chavesNoQuadro({ tipo: 'casa', id: 'casa-l2' }, 'carrinhas', ind, dorm)).toEqual([]);
    expect(chavesNoQuadro({ tipo: 'casa', id: 'nao-existe' }, 'casas', ind, dorm)).toEqual([]);
  });

  it('uma carrinha é o seu bloco no Quadro por carrinhas e os passageiros no Quadro por casas', () => {
    expect(chavesNoQuadro({ tipo: 'carrinha', id: 'XX1002' }, 'carrinhas', ind, dorm)).toEqual([
      'carrinha:XX1002',
    ]);
    expect(chavesNoQuadro({ tipo: 'carrinha', id: 'XX1002' }, 'casas', ind, dorm).sort()).toEqual([
      'pessoa:p-4',
      'pessoa:p-5',
    ]);
    // Vazia e sem onde dormir: nada para acender.
    expect(chavesNoQuadro({ tipo: 'carrinha', id: 'XX1004' }, 'casas', ind, dorm)).toEqual([]);
    expect(chavesNoQuadro({ tipo: 'carrinha', id: 'nao-existe' }, 'carrinhas', ind, dorm)).toEqual([]);
  });

  it('sem ninguém, acende a ligação: a casa onde a carrinha dorme, as carrinhas que dormem na casa', () => {
    // A XX1004 (vazia) passa a dormir na Casa L2 (sem moradores ativos).
    const estado: Estado = {
      ...estadoVistas(),
      carrinhas: estadoVistas().carrinhas.map((c) =>
        c.id === 'XX1004' ? { ...c, dormeCasaId: 'casa-l2' } : c,
      ),
    };
    const ind2 = indexar(estado);
    const dorm2 = dormidasDasCarrinhas(estado, ind2);
    expect(chavesNoQuadro({ tipo: 'carrinha', id: 'XX1004' }, 'casas', ind2, dorm2)).toEqual([
      'casa:casa-l2',
    ]);
    expect(chavesNoQuadro({ tipo: 'casa', id: 'casa-l2' }, 'carrinhas', ind2, dorm2)).toEqual([
      'carrinha:XX1004',
    ]);
    // Com moradores ou passageiros, continuam a ser eles (a ligação não se junta).
    expect(chavesNoQuadro({ tipo: 'casa', id: 'casa-l1' }, 'carrinhas', ind2, dorm2)).not.toContain(
      'carrinha:XX1001',
    );
    // Uma carrinha vazia a dormir num parque (não é casa): nada.
    const semNinguem: Estado = {
      ...estadoVistas(),
      pessoas: estadoVistas().pessoas.map((p) =>
        p.carrinhaId === 'XX1003' ? { ...p, carrinhaId: null } : p,
      ),
    };
    const ind3 = indexar(semNinguem);
    expect(
      chavesNoQuadro(
        { tipo: 'carrinha', id: 'XX1003' },
        'casas',
        ind3,
        dormidasDasCarrinhas(semNinguem, ind3),
      ),
    ).toEqual([]);
  });
});

describe('pessoasDoFocoSemBloco', () => {
  it('casa em foco no Quadro por carrinhas: os moradores; carrinha no Quadro por casas: os passageiros', () => {
    expect([...pessoasDoFocoSemBloco({ tipo: 'casa', id: 'casa-a' }, 'carrinhas', ind)].sort()).toEqual([
      'p-4',
      'p-5',
    ]);
    expect([...pessoasDoFocoSemBloco({ tipo: 'carrinha', id: 'XX1001' }, 'casas', ind)].sort()).toEqual([
      'p-1',
      'p-2',
    ]);
  });

  it('nada quando o foco tem bloco, é uma pessoa ou não há foco', () => {
    expect(pessoasDoFocoSemBloco({ tipo: 'casa', id: 'casa-a' }, 'casas', ind).size).toBe(0);
    expect(pessoasDoFocoSemBloco({ tipo: 'carrinha', id: 'XX1001' }, 'carrinhas', ind).size).toBe(0);
    expect(pessoasDoFocoSemBloco({ tipo: 'pessoa', id: 'p-1' }, 'casas', ind).size).toBe(0);
    expect(pessoasDoFocoSemBloco(null, 'carrinhas', ind).size).toBe(0);
  });
});

describe('blocoTemAlteracoes', () => {
  const mover = (pessoaId: string, campo: 'casaId' | 'carrinhaId', de: string | null, para: string | null) =>
    ({ tipo: 'mover', pessoaId, campo, de, para }) as const satisfies Operacao;

  it('casa e carrinha: alguém entra ou sai', () => {
    const ops = [mover('p-2', 'casaId', 'casa-l1', 'casa-o1')];
    expect(blocoTemAlteracoes(ops, { tipo: 'casa', id: 'casa-l1' })).toBe(true);
    expect(blocoTemAlteracoes(ops, { tipo: 'casa', id: 'casa-o1' })).toBe(true);
    expect(blocoTemAlteracoes(ops, { tipo: 'casa', id: 'casa-a' })).toBe(false);
    // Mudar de casa não mexe nas carrinhas.
    expect(blocoTemAlteracoes(ops, { tipo: 'carrinha', id: 'XX1001' })).toBe(false);
  });

  it('carrinha: também o condutor e onde dorme', () => {
    const condutor: Operacao = { tipo: 'condutor', carrinhaId: 'XX1001', de: 'p-1', para: 'p-2' };
    const dormida: Operacao = { tipo: 'dormida', carrinhaId: 'XX1002', de: null, para: 'casa:casa-a' };
    expect(blocoTemAlteracoes([condutor], { tipo: 'carrinha', id: 'XX1001' })).toBe(true);
    expect(blocoTemAlteracoes([dormida], { tipo: 'carrinha', id: 'XX1002' })).toBe(true);
    expect(blocoTemAlteracoes([condutor, dormida], { tipo: 'carrinha', id: 'XX1003' })).toBe(false);
  });

  it('"Fora das casas CMF" e "Sem transporte": alguém entra ou sai do grupo', () => {
    const sai = [mover('p-2', 'casaId', 'casa-l1', null)];
    expect(blocoTemAlteracoes(sai, { tipo: 'fora', id: null })).toBe(true);
    expect(blocoTemAlteracoes(sai, { tipo: 'sem-transporte', id: null })).toBe(false);
    const entra = [mover('p-7', 'carrinhaId', null, 'XX1004')];
    expect(blocoTemAlteracoes(entra, { tipo: 'sem-transporte', id: null })).toBe(true);
    expect(blocoTemAlteracoes(entra, { tipo: 'fora', id: null })).toBe(false);
    expect(blocoTemAlteracoes([], { tipo: 'fora', id: null })).toBe(false);
  });
});
