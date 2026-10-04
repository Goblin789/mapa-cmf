import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import type { Operacao } from '../../dominio/operacoes';
import { criarObra, criarProblema } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import { estadoVistas } from './estadoTeste';
import {
  avisoSemNadaNoQuadro,
  blocoTemAlteracoes,
  chavesNoQuadro,
  filtroEscondeTudo,
  obraTemAlteracoes,
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
  const mover = (pessoaId: string, campo: 'casaId' | 'carrinhaId', de: string | null, para: string | null) =>
    ({ tipo: 'mover', pessoaId, campo, de, para }) as const satisfies Operacao;

  it('casa e carrinha: alguém entra ou sai', () => {
    const ops = [mover('p-2', 'casaId', 'casa-l1', 'casa-o1')];
    expect(blocoTemAlteracoes(ops, { tipo: 'casa', id: 'casa-l1' }, null)).toBe(true);
    expect(blocoTemAlteracoes(ops, { tipo: 'casa', id: 'casa-o1' }, null)).toBe(true);
    expect(blocoTemAlteracoes(ops, { tipo: 'casa', id: 'casa-a' }, null)).toBe(false);
    // Mudar de casa não mexe nas carrinhas.
    expect(blocoTemAlteracoes(ops, { tipo: 'carrinha', id: 'XX1001' }, null)).toBe(false);
  });

  it('carrinha: também o condutor e onde dorme', () => {
    const condutor: Operacao = { tipo: 'condutor', carrinhaId: 'XX1001', de: 'p-1', para: 'p-2' };
    const dormida: Operacao = { tipo: 'dormida', carrinhaId: 'XX1002', de: null, para: 'casa:casa-a' };
    expect(blocoTemAlteracoes([condutor], { tipo: 'carrinha', id: 'XX1001' }, null)).toBe(true);
    expect(blocoTemAlteracoes([dormida], { tipo: 'carrinha', id: 'XX1002' }, null)).toBe(true);
    expect(blocoTemAlteracoes([condutor, dormida], { tipo: 'carrinha', id: 'XX1003' }, null)).toBe(false);
  });

  it('"Fora das casas CMF" e "Sem transporte": alguém entra ou sai do grupo', () => {
    const sai = [mover('p-2', 'casaId', 'casa-l1', null)];
    expect(blocoTemAlteracoes(sai, { tipo: 'fora', id: null }, null)).toBe(true);
    expect(blocoTemAlteracoes(sai, { tipo: 'sem-transporte', id: null }, null)).toBe(false);
    const entra = [mover('p-7', 'carrinhaId', null, 'XX1004')];
    expect(blocoTemAlteracoes(entra, { tipo: 'sem-transporte', id: null }, null)).toBe(true);
    expect(blocoTemAlteracoes(entra, { tipo: 'fora', id: null }, null)).toBe(false);
    expect(blocoTemAlteracoes([], { tipo: 'fora', id: null }, null)).toBe(false);
  });
});

describe('obras no Quadro (M2)', () => {
  // Obra fictícia com o Zé A. (Casa L1, XX1001) e o Rui C. (Casa O1, XX1005); outra sem ninguém.
  const comObras: Estado = {
    ...estadoVistas(),
    obras: [
      criarObra({ id: 'obra-a', nome: 'Obra Fictícia A', clienteId: 'alfa', localId: 'aldeia' }),
      criarObra({ id: 'obra-v', nome: 'Obra Vazia', clienteId: 'beta', localId: 'monte' }),
    ],
    pessoas: estadoVistas().pessoas.map((p) =>
      p.id === 'p-1' || p.id === 'p-3' ? { ...p, obraId: 'obra-a' } : p,
    ),
  };
  const indO = indexar(comObras);
  const dormO = dormidasDasCarrinhas(comObras, indO);

  it('a obra é o seu bloco no Quadro por obras (mesmo vazia) e as pessoas dela nos outros', () => {
    expect(chavesNoQuadro({ tipo: 'obra', id: 'obra-a' }, 'obras', indO, dormO)).toEqual(['obra:obra-a']);
    expect(chavesNoQuadro({ tipo: 'obra', id: 'obra-v' }, 'obras', indO, dormO)).toEqual(['obra:obra-v']);
    expect(chavesNoQuadro({ tipo: 'obra', id: 'obra-a' }, 'casas', indO, dormO).sort()).toEqual([
      'pessoa:p-1',
      'pessoa:p-3',
    ]);
    expect(chavesNoQuadro({ tipo: 'obra', id: 'obra-v' }, 'carrinhas', indO, dormO)).toEqual([]);
    expect(chavesNoQuadro({ tipo: 'obra', id: 'nao-existe' }, 'obras', indO, dormO)).toEqual([]);
  });

  it('no Quadro por obras, uma casa ou carrinha acende os moradores ou os passageiros (sem ligações)', () => {
    expect(chavesNoQuadro({ tipo: 'casa', id: 'casa-l1' }, 'obras', indO, dormO).sort()).toEqual([
      'pessoa:p-1',
      'pessoa:p-2',
    ]);
    expect(chavesNoQuadro({ tipo: 'carrinha', id: 'XX1002' }, 'obras', indO, dormO).sort()).toEqual([
      'pessoa:p-4',
      'pessoa:p-5',
    ]);
    // Sem ninguém: nada (as carrinhas e as casas não têm bloco aqui).
    expect(chavesNoQuadro({ tipo: 'casa', id: 'casa-l2' }, 'obras', indO, dormO)).toEqual([]);
    expect(chavesNoQuadro({ tipo: 'carrinha', id: 'XX1004' }, 'obras', indO, dormO)).toEqual([]);
  });

  it('avisoSemNadaNoQuadro: obra sem ninguém fora do Quadro por obras; casa e carrinha vazias nas obras', () => {
    expect(avisoSemNadaNoQuadro({ tipo: 'obra', id: 'obra-v' }, 'casas', indO, dormO)).toBe(
      'Obra Vazia: ninguém trabalha nesta obra.',
    );
    expect(avisoSemNadaNoQuadro({ tipo: 'obra', id: 'obra-v' }, 'obras', indO, dormO)).toBeNull();
    expect(avisoSemNadaNoQuadro({ tipo: 'obra', id: 'obra-a' }, 'carrinhas', indO, dormO)).toBeNull();
    expect(avisoSemNadaNoQuadro({ tipo: 'casa', id: 'casa-l2' }, 'obras', indO, dormO)).toBe(
      'Casa L2: ninguém mora lá.',
    );
    expect(avisoSemNadaNoQuadro({ tipo: 'carrinha', id: 'XX1004' }, 'obras', indO, dormO)).toBe(
      'Carrinha XX 1004: ninguém vai nela.',
    );
  });

  it('pessoasDoFocoSemBloco: a obra em foco realça as pessoas dela fora do Quadro por obras', () => {
    expect([...pessoasDoFocoSemBloco({ tipo: 'obra', id: 'obra-a' }, 'casas', indO)].sort()).toEqual([
      'p-1',
      'p-3',
    ]);
    expect(pessoasDoFocoSemBloco({ tipo: 'obra', id: 'obra-a' }, 'obras', indO).size).toBe(0);
    // No Quadro por obras, a casa e a carrinha não têm bloco: realçam-se os moradores e os passageiros.
    expect([...pessoasDoFocoSemBloco({ tipo: 'casa', id: 'casa-l1' }, 'obras', indO)].sort()).toEqual([
      'p-1',
      'p-2',
    ]);
    expect([...pessoasDoFocoSemBloco({ tipo: 'carrinha', id: 'XX1005' }, 'obras', indO)]).toEqual(['p-3']);
  });

  it('blocoTemAlteracoes: a obra (entra ou sai alguém, a ficha, a morada) e "Sem obra"', () => {
    const entra: Operacao[] = [{ tipo: 'mover', pessoaId: 'p-2', campo: 'obraId', de: null, para: 'obra-a' }];
    expect(blocoTemAlteracoes(entra, { tipo: 'obra', id: 'obra-a' }, comObras)).toBe(true);
    expect(blocoTemAlteracoes(entra, { tipo: 'obra', id: 'obra-v' }, comObras)).toBe(false);
    expect(blocoTemAlteracoes(entra, { tipo: 'sem-obra', id: null }, comObras)).toBe(true);
    expect(blocoTemAlteracoes(entra, { tipo: 'fora', id: null }, comObras)).toBe(false);
    const nome: Operacao[] = [
      { tipo: 'campo', entidade: 'obra', id: 'obra-v', campo: 'nome', de: 'Obra Vazia', para: 'Obra Nova' },
    ];
    expect(blocoTemAlteracoes(nome, { tipo: 'obra', id: 'obra-v' }, comObras)).toBe(true);
    // O pino da obra muda no local dela: precisa do estado visível para saber de quem é o local.
    const pino: Operacao[] = [
      { tipo: 'campo', entidade: 'local', id: 'monte', campo: 'lat', de: 49.8, para: 49.81 },
    ];
    expect(blocoTemAlteracoes(pino, { tipo: 'obra', id: 'obra-v' }, comObras)).toBe(true);
    expect(blocoTemAlteracoes(pino, { tipo: 'obra', id: 'obra-v' }, null)).toBe(false);
  });

  it('obraTemAlteracoes: a morada ou o pino do estacionamento (outro local) também marca a obra', () => {
    const comEst: Estado = {
      ...comObras,
      obras: comObras.obras.map((o) => (o.id === 'obra-v' ? { ...o, estacionamentoLocalId: 'parque' } : o)),
    };
    const pinoEst: Operacao[] = [
      { tipo: 'campo', entidade: 'local', id: 'parque', campo: 'lng', de: 6.1, para: 6.11 },
    ];
    expect(obraTemAlteracoes(pinoEst, 'obra-v', comEst)).toBe(true);
    expect(blocoTemAlteracoes(pinoEst, { tipo: 'obra', id: 'obra-v' }, comEst)).toBe(true);
    expect(obraTemAlteracoes(pinoEst, 'obra-a', comEst)).toBe(false);
    expect(obraTemAlteracoes(pinoEst, 'obra-v', comObras)).toBe(false);
    expect(obraTemAlteracoes(pinoEst, 'obra-v', null)).toBe(false);
  });

  it('blocoTemAlteracoes: um problema mudado na casa conta com o estado visível', () => {
    const comProblema: Estado = {
      ...estadoVistas(),
      problemas: [
        criarProblema({ id: 'problema-ficticio-1', casaId: 'casa-l1', texto: 'torneira a pingar' }),
      ],
    };
    const resolver: Operacao[] = [
      {
        tipo: 'campo',
        entidade: 'problema',
        id: 'problema-ficticio-1',
        campo: 'resolvidoEm',
        de: null,
        para: '2026-10-04',
      },
    ];
    expect(blocoTemAlteracoes(resolver, { tipo: 'casa', id: 'casa-l1' }, comProblema)).toBe(true);
    expect(blocoTemAlteracoes(resolver, { tipo: 'casa', id: 'casa-o1' }, comProblema)).toBe(false);
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
