// Funções puras dos diálogos e das secções do Indisponível e dos Problemas (M2): datas, sobreposições,
// operações, o texto do problema e os resolvidos que a ficha mostra. Dados fictícios.

import { describe, expect, it } from 'vitest';
import { aplicarOperacoes, validarOperacoes } from '../../dominio/operacoes';
import { criarIndisponibilidade, criarProblema, estadoExemplo } from '../../dominio/teste-fabrica';
import { descricaoProblemas, textoProblemasAbertos } from '../comum/IconeProblemas';
import {
  NOTA_JA_ACABOU,
  NOTA_SAIU,
  periodosDaFicha,
  textoPeriodoDeHoje,
} from '../paineis/SeccaoIndisponivel';
import { problemasDaFicha } from '../paineis/SeccaoProblemas';
import {
  avisoPeriodoPassado,
  erroDatas,
  FRASE_SO_DATAS,
  frasesSobreposicoes,
  operacoesDoDialogo,
  sobreposicoes,
} from './DialogoIndisponivel';
import { fraseSobreOAlvo, limparTextoProblema, nomeDoAlvo } from './DialogoProblema';

/** Ids previsíveis para as operações. */
function gerador(): () => string {
  let n = 0;
  return () => `teste-${String(++n).padStart(8, '0')}`;
}

describe('erroDatas', () => {
  it('aceita um período com fim ≥ início, ou sem data de regresso', () => {
    expect(erroDatas('2026-10-04', '2026-10-09')).toBeNull();
    expect(erroDatas('2026-10-04', '2026-10-04')).toBeNull();
    expect(erroDatas('2026-10-04', null)).toBeNull();
  });

  it('recusa o fim antes do início, com as datas na frase', () => {
    expect(erroDatas('2026-10-14', '2026-10-12')).toBe(
      'O último dia (12/10) não pode ser antes do primeiro (14/10).',
    );
  });

  it('recusa dias que não existem ou em falta', () => {
    expect(erroDatas('', null)).toBe('Escolhe o primeiro dia.');
    expect(erroDatas('2026-02-30', null)).toBe('Escolhe o primeiro dia.');
    expect(erroDatas('2026-10-04', 'sem dia')).toBe('Escolhe o último dia ou marca "Sem data de regresso".');
  });

  it('a frase fixa só fala de datas (nunca de motivo)', () => {
    expect(FRASE_SO_DATAS).toBe('Só se guardam as datas.');
  });
});

describe('sobreposicoes', () => {
  const estado = {
    ...estadoExemplo(),
    indisponibilidades: [
      criarIndisponibilidade({ id: 'indisp-a', pessoaId: 'p-ana', inicio: '2026-10-06', fim: '2026-10-12' }),
      criarIndisponibilidade({ id: 'indisp-b', pessoaId: 'p-bruno', inicio: '2026-10-20', fim: null }),
    ],
  };

  it('encontra os períodos de cada pessoa que têm um dia em comum', () => {
    const lista = sobreposicoes(estado, ['p-ana', 'p-bruno', 'p-gil'], '2026-10-12', '2026-10-25');
    expect(lista.map((s) => [s.pessoa.id, s.periodo.id])).toEqual([
      ['p-ana', 'indisp-a'],
      ['p-bruno', 'indisp-b'],
    ]);
    expect(frasesSobreposicoes(lista)).toEqual([
      'Ana T. já está indisponível 06/10 a 12/10.',
      'Bruno E. já está indisponível desde 20/10 (sem data de regresso).',
    ]);
  });

  it('sem fim (sem data de regresso) sobrepõe-se a tudo o que vem depois', () => {
    expect(sobreposicoes(estado, ['p-bruno'], '2027-01-01', null)).toHaveLength(1);
    expect(sobreposicoes(estado, ['p-bruno'], '2026-10-01', '2026-10-19')).toEqual([]);
  });

  it('ao mudar as datas, o próprio período não conta', () => {
    expect(sobreposicoes(estado, ['p-ana'], '2026-10-05', '2026-10-13', 'indisp-a')).toEqual([]);
  });

  it('dias encostados não se sobrepõem', () => {
    expect(sobreposicoes(estado, ['p-ana'], '2026-10-13', '2026-10-15')).toEqual([]);
  });
});

describe('operacoesDoDialogo', () => {
  const estado = {
    ...estadoExemplo(),
    indisponibilidades: [
      criarIndisponibilidade({ id: 'indisp-a', pessoaId: 'p-ana', inicio: '2026-10-06', fim: '2026-10-12' }),
    ],
  };

  it('marcar: um período novo por pessoa, só com a pessoa e as datas', () => {
    const ops = operacoesDoDialogo(estado, ['p-bruno', 'p-gil'], null, '2026-10-04', '2026-10-09', gerador());
    expect(ops).toHaveLength(2);
    for (const op of ops) {
      expect(op.tipo).toBe('registo');
      if (op.tipo === 'registo')
        expect(Object.keys(op.para ?? {}).sort()).toEqual(['fim', 'id', 'inicio', 'pessoaId']);
    }
    expect(validarOperacoes(estado, ops)).toEqual([]);
    const final = aplicarOperacoes(estado, ops);
    expect(final.indisponibilidades.filter((p) => p.inicio === '2026-10-04')).toHaveLength(2);
  });

  it('mudar datas: só os campos que mudam', () => {
    const ops = operacoesDoDialogo(estado, [], 'indisp-a', '2026-10-06', null);
    expect(ops).toEqual([
      {
        tipo: 'campo',
        entidade: 'indisponibilidade',
        id: 'indisp-a',
        campo: 'fim',
        de: '2026-10-12',
        para: null,
      },
    ]);
    expect(operacoesDoDialogo(estado, [], 'indisp-a', '2026-10-06', '2026-10-12')).toEqual([]);
  });

  it('o domínio recusa a sobreposição (o diálogo explica antes)', () => {
    const ops = operacoesDoDialogo(estado, ['p-ana'], null, '2026-10-10', null, gerador());
    expect(validarOperacoes(estado, ops).join(' ')).toContain('não se podem sobrepor');
  });
});

describe('textos da ficha', () => {
  it('Indisponível hoje', () => {
    expect(textoPeriodoDeHoje({ inicio: '2026-10-01', fim: '2026-10-12' })).toBe('Indisponível até 12/10');
    expect(textoPeriodoDeHoje({ inicio: '2026-10-06', fim: null })).toBe(
      'Indisponível desde 06/10, sem data de regresso',
    );
  });

  it('os períodos da ficha: o de hoje, os próximos e os passados só se estiverem por guardar', () => {
    const estado = {
      indisponibilidades: [
        criarIndisponibilidade({ id: 'velho', pessoaId: 'p-1', inicio: '2025-10-01', fim: '2025-10-05' }),
        criarIndisponibilidade({ id: 'hoje', pessoaId: 'p-1', inicio: '2026-10-01', fim: '2026-10-06' }),
        criarIndisponibilidade({ id: 'prox', pessoaId: 'p-1', inicio: '2026-10-20', fim: null }),
        criarIndisponibilidade({ id: 'outra', pessoaId: 'p-2', inicio: '2026-10-01', fim: null }),
      ],
    };
    const ativa = { id: 'p-1', ativa: true };
    const ler = periodosDaFicha(estado, ativa, '2026-10-04', new Set());
    expect(ler.deHoje?.id).toBe('hoje');
    expect(ler.futuros.map((p) => p.id)).toEqual(['prox']);
    expect(ler.outros).toEqual([]);
    // O passado por guardar (ex.: engano no ano) aparece, para se poder mudar ou apagar.
    const editar = periodosDaFicha(estado, ativa, '2026-10-04', new Set(['velho']));
    expect(editar.outros.map((o) => [o.periodo.id, o.nota])).toEqual([['velho', NOTA_JA_ACABOU]]);
    // Quem saiu da empresa não está indisponível (como nos índices): o de hoje vai para os outros.
    const saiu = periodosDaFicha(estado, { id: 'p-1', ativa: false }, '2026-10-04', new Set());
    expect(saiu.deHoje).toBeNull();
    expect(saiu.outros.map((o) => [o.periodo.id, o.nota])).toEqual([['hoje', NOTA_SAIU]]);
    expect(saiu.futuros.map((p) => p.id)).toEqual(['prox']);
  });

  it('o diálogo avisa quando o período já acabou (engano no ano ou no mês)', () => {
    expect(avisoPeriodoPassado('2025-10-05', '2026-10-04')).toContain('05/10/2025');
    expect(avisoPeriodoPassado('2026-10-03', '2026-10-04')).toContain('já acabou');
    expect(avisoPeriodoPassado('2026-10-04', '2026-10-04')).toBeNull();
    expect(avisoPeriodoPassado(null, '2026-10-04')).toBeNull();
    expect(avisoPeriodoPassado('', '2026-10-04')).toBeNull();
  });

  it('problemas: o número e a lista para o title', () => {
    expect(textoProblemasAbertos(1)).toBe('1 problema por resolver');
    expect(textoProblemasAbertos(2)).toBe('2 problemas por resolver');
    expect(descricaoProblemas([{ texto: 'Pneu furado' }, { texto: 'Porta não fecha' }])).toBe(
      '2 problemas por resolver: Pneu furado; Porta não fecha',
    );
    expect(descricaoProblemas([])).toBe('');
  });

  it('a ficha mostra os abertos e os resolvidos dos últimos 30 dias (os mais recentes primeiro)', () => {
    const problemas = [
      criarProblema({ id: 'a', abertoEm: '2026-10-03' }),
      criarProblema({ id: 'r1', abertoEm: '2026-09-01', resolvidoEm: '2026-09-03' }),
      criarProblema({ id: 'r0', abertoEm: '2026-09-01', resolvidoEm: '2026-09-04' }),
      criarProblema({ id: 'r2', abertoEm: '2026-09-01', resolvidoEm: '2026-09-10' }),
      criarProblema({ id: 'r3', abertoEm: '2026-09-01', resolvidoEm: '2026-10-02' }),
    ];
    const { abertos, resolvidos } = problemasDaFicha(problemas, '2026-10-04');
    expect(abertos.map((p) => p.id)).toEqual(['a']);
    // Há 30 dias (04/09) ainda aparece; há 31 (03/09) já não.
    expect(resolvidos.map((p) => p.id)).toEqual(['r3', 'r2', 'r0']);
  });
});

describe('DialogoProblema', () => {
  it('o texto grava-se numa só linha, sem espaços a mais', () => {
    expect(limparTextoProblema('  Esquentador \n avariado  ')).toBe('Esquentador avariado');
    expect(limparTextoProblema('   ')).toBe('');
  });

  it('a frase fixa diz sobre o que é', () => {
    expect(fraseSobreOAlvo({ tipo: 'casa' })).toBe('É sobre a casa: não escrevas nomes nem dados de saúde.');
    expect(fraseSobreOAlvo({ tipo: 'carrinha' })).toBe(
      'É sobre a carrinha: não escrevas nomes nem dados de saúde.',
    );
  });

  it('o título usa o nome da casa ou a matrícula', () => {
    const estado = estadoExemplo();
    expect(nomeDoAlvo(estado, { tipo: 'casa', id: 'casa-1' })).toBe('Casa Um');
    expect(nomeDoAlvo(estado, { tipo: 'carrinha', id: 'zz1001' })).toBe('ZZ 1001');
  });
});
