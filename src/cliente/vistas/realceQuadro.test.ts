import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import type { Operacao } from '../../dominio/operacoes';
import type { Estado } from '../../dominio/tipos';
import { estadoVistas } from './estadoTeste';
import {
  avisoSemNadaNoQuadro,
  blocoTemAlteracoes,
  chavesNoQuadro,
  filtroEscondeTudo,
  pessoasDoFocoSemBloco,
  selecaoSemEscondidos,
} from './realceQuadro';

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

describe('no Quadro por obras (sem blocos de casas nem de carrinhas)', () => {
  it('uma casa são os moradores e uma carrinha os passageiros; sem ninguém, nada (não há ligações)', () => {
    expect(chavesNoQuadro({ tipo: 'casa', id: 'casa-l1' }, 'obras', ind, dorm).sort()).toEqual([
      'pessoa:p-1',
      'pessoa:p-2',
    ]);
    expect(chavesNoQuadro({ tipo: 'carrinha', id: 'XX1002' }, 'obras', ind, dorm).sort()).toEqual([
      'pessoa:p-4',
      'pessoa:p-5',
    ]);
    // A XX1004 (vazia) a dormir na Casa L2 (sem moradores ativos): por obras não há blocos para a ligação.
    const estado: Estado = {
      ...estadoVistas(),
      carrinhas: estadoVistas().carrinhas.map((c) =>
        c.id === 'XX1004' ? { ...c, dormeCasaId: 'casa-l2' } : c,
      ),
    };
    const ind2 = indexar(estado);
    const dorm2 = dormidasDasCarrinhas(estado, ind2);
    expect(chavesNoQuadro({ tipo: 'carrinha', id: 'XX1004' }, 'obras', ind2, dorm2)).toEqual([]);
    expect(chavesNoQuadro({ tipo: 'casa', id: 'casa-l2' }, 'obras', ind2, dorm2)).toEqual([]);
    expect(avisoSemNadaNoQuadro({ tipo: 'casa', id: 'casa-l2' }, 'obras', ind2, dorm2)).toBe(
      'Casa L2: ninguém mora lá.',
    );
    expect(avisoSemNadaNoQuadro({ tipo: 'carrinha', id: 'XX1004' }, 'obras', ind2, dorm2)).toBe(
      'Carrinha XX 1004: ninguém vai nela.',
    );
    expect(avisoSemNadaNoQuadro({ tipo: 'casa', id: 'casa-l1' }, 'obras', ind, dorm)).toBeNull();
  });

  it('casa ou carrinha em foco: realça os moradores ou os passageiros', () => {
    expect([...pessoasDoFocoSemBloco({ tipo: 'casa', id: 'casa-a' }, 'obras', ind)].sort()).toEqual([
      'p-4',
      'p-5',
    ]);
    expect([...pessoasDoFocoSemBloco({ tipo: 'carrinha', id: 'XX1001' }, 'obras', ind)].sort()).toEqual([
      'p-1',
      'p-2',
    ]);
  });
});

describe('avisoSemNadaNoQuadro', () => {
  it('casa sem moradores e sem carrinhas a dormir lá, no Quadro por carrinhas: diz porquê', () => {
    expect(avisoSemNadaNoQuadro({ tipo: 'casa', id: 'casa-l2' }, 'carrinhas', ind, dorm)).toBe(
      'Casa L2: ninguém mora lá e nenhuma carrinha dorme lá.',
    );
    // No Quadro por casas tem o seu bloco: nada a dizer.
    expect(avisoSemNadaNoQuadro({ tipo: 'casa', id: 'casa-l2' }, 'casas', ind, dorm)).toBeNull();
  });

  it('carrinha sem passageiros e sem casa onde dormir, no Quadro por casas: diz porquê', () => {
    expect(avisoSemNadaNoQuadro({ tipo: 'carrinha', id: 'XX1004' }, 'casas', ind, dorm)).toBe(
      'Carrinha XX 1004: ninguém vai nela e não dorme em nenhuma casa.',
    );
    expect(avisoSemNadaNoQuadro({ tipo: 'carrinha', id: 'XX1004' }, 'carrinhas', ind, dorm)).toBeNull();
    // Um carro: "nele".
    const estado: Estado = {
      ...estadoVistas(),
      carrinhas: estadoVistas().carrinhas.map((c) => (c.id === 'XX1004' ? { ...c, tipo: 'carro' } : c)),
    };
    const ind2 = indexar(estado);
    expect(
      avisoSemNadaNoQuadro(
        { tipo: 'carrinha', id: 'XX1004' },
        'casas',
        ind2,
        dormidasDasCarrinhas(estado, ind2),
      ),
    ).toBe('Carro XX 1004: ninguém vai nele e não dorme em nenhuma casa.');
  });

  it('nada quando há o que acender, numa pessoa ou num elemento que não existe', () => {
    expect(avisoSemNadaNoQuadro({ tipo: 'casa', id: 'casa-l1' }, 'carrinhas', ind, dorm)).toBeNull();
    expect(avisoSemNadaNoQuadro({ tipo: 'carrinha', id: 'XX1002' }, 'casas', ind, dorm)).toBeNull();
    expect(avisoSemNadaNoQuadro({ tipo: 'pessoa', id: 'p-9' }, 'casas', ind, dorm)).toBeNull();
    expect(avisoSemNadaNoQuadro({ tipo: 'casa', id: 'nao-existe' }, 'carrinhas', ind, dorm)).toBeNull();
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
  const mover = (
    pessoaId: string,
    campo: 'casaId' | 'carrinhaId' | 'obraId',
    de: string | null,
    para: string | null,
  ) => ({ tipo: 'mover', pessoaId, campo, de, para }) as const satisfies Operacao;

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

  it('obra e "Sem obra": alguém entra ou sai', () => {
    const muda = [mover('p-2', 'obraId', 'obra-a', 'obra-b')];
    expect(blocoTemAlteracoes(muda, { tipo: 'obra', id: 'obra-a' })).toBe(true);
    expect(blocoTemAlteracoes(muda, { tipo: 'obra', id: 'obra-b' })).toBe(true);
    expect(blocoTemAlteracoes(muda, { tipo: 'obra', id: 'obra-c' })).toBe(false);
    expect(blocoTemAlteracoes(muda, { tipo: 'sem-obra', id: null })).toBe(false);
    const entra = [mover('p-7', 'obraId', null, 'obra-a')];
    expect(blocoTemAlteracoes(entra, { tipo: 'sem-obra', id: null })).toBe(true);
    // Mudar de casa não mexe nas obras.
    expect(
      blocoTemAlteracoes([mover('p-2', 'casaId', 'casa-l1', null)], { tipo: 'sem-obra', id: null }),
    ).toBe(false);
  });
});

describe('filtroEscondeTudo', () => {
  const passa = (id: string) => id === 'p-2';
  it('só quando tudo o que se ia acender são pessoas escondidas pelo filtro', () => {
    expect(filtroEscondeTudo(['pessoa:p-1'], passa)).toBe(true);
    expect(filtroEscondeTudo(['pessoa:p-1', 'pessoa:p-4'], passa)).toBe(true);
    // Uma à vista: acende-se essa, o filtro fica.
    expect(filtroEscondeTudo(['pessoa:p-1', 'pessoa:p-2'], passa)).toBe(false);
    // Os blocos ficam sempre (recolhidos, se for preciso).
    expect(filtroEscondeTudo(['casa:casa-l1'], passa)).toBe(false);
    expect(filtroEscondeTudo(['carrinha:XX1001', 'pessoa:p-1'], passa)).toBe(false);
    expect(filtroEscondeTudo([], passa)).toBe(false);
  });
});

describe('selecaoSemEscondidos', () => {
  const passa = (id: string) => id !== 'p-1' && id !== 'p-4';
  it('tira da seleção quem o filtro esconde, com o aviso no singular ou no plural', () => {
    expect(selecaoSemEscondidos(new Set(['p-2', 'p-1']), passa)).toEqual({
      fica: ['p-2'],
      aviso: '1 pessoa escondida pelo filtro saiu da seleção.',
    });
    expect(selecaoSemEscondidos(new Set(['p-1', 'p-3', 'p-4']), passa)).toEqual({
      fica: ['p-3'],
      aviso: '2 pessoas escondidas pelo filtro saíram da seleção.',
    });
  });

  it('ninguém sai (ou seleção vazia): null, a seleção fica igual', () => {
    expect(selecaoSemEscondidos(new Set(['p-2', 'p-3']), passa)).toBeNull();
    expect(selecaoSemEscondidos(new Set(), passa)).toBeNull();
  });
});
