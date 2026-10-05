// M2: frases iguais juntas só ao mostrar, etiquetas "Reverte…"/"Revertida", o botão "Reverter…" e a lógica
// do diálogo de reverter (prepararReversao). Dados fictícios.

import { describe, expect, it } from 'vitest';
import type { AlteracaoHistorico, EntradaHistorico } from '../../dominio/api';
import { aplicarOperacoes, CAMPO_REGISTO, chaveOperacao, type Operacao } from '../../dominio/operacoes';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import {
  avisoReversaoNoRascunho,
  etiquetaReverte,
  etiquetaRevertida,
  formatarDiaHoraCurto,
  gravacoesConhecidas,
  gravacoesDasReversoes,
  juntarFrasesIguais,
  lembrarGravacoes,
  lotesDaReversaoAEnviar,
  mostraReverter,
  notaReversaoNoGuardar,
  prepararReversao,
} from './historico';

function linha(
  entidade: string,
  entidadeId: string,
  campo: string,
  antes: unknown,
  depois: unknown,
  descricao: string,
): AlteracaoHistorico {
  return {
    entidade,
    entidadeId,
    campo,
    antes: antes === null ? null : JSON.stringify(antes),
    depois: depois === null ? null : JSON.stringify(depois),
    descricao,
  };
}

function entrada(parcial: Partial<EntradaHistorico> = {}): EntradaHistorico {
  return {
    loteId: 7,
    autor: 'ana.exemplo@exemplo.test',
    autorNome: 'Ana Exemplo',
    criadoEm: '2026-10-03T15:01:00.000Z',
    efetivoEm: '2026-10-03T15:01:00.000Z',
    tipo: 'mudanca',
    estado: 'aplicado',
    comentario: null,
    alteracoes: [],
    reverte: [],
    revertidoPor: [],
    ...parcial,
  };
}

/** Um lote que pôs o Gil na Casa Três e mudou o pino da obra (latitude e longitude: duas linhas). */
const LINHAS = [
  linha('pessoa', 'p-gil', 'casaId', null, 'casa-3', 'Gil N. — casa: Fora das casas CMF → Casa Três'),
  linha('local', 'local-obra', 'lat', 49.6, 49.65, 'Obra Beta — pino mudado de sítio'),
  linha('local', 'local-obra', 'lng', 6.1, 6.2, 'Obra Beta — pino mudado de sítio'),
];

/** O estado depois desse lote. */
function depoisDoLote(): Estado {
  return aplicarOperacoes(estadoExemplo(), [
    { tipo: 'mover', pessoaId: 'p-gil', campo: 'casaId', de: null, para: 'casa-3' },
    { tipo: 'campo', entidade: 'local', id: 'local-obra', campo: 'lat', de: 49.6, para: 49.65 },
    { tipo: 'campo', entidade: 'local', id: 'local-obra', campo: 'lng', de: 6.1, para: 6.2 },
  ]);
}

describe('juntarFrasesIguais (só para mostrar)', () => {
  it('junta as seguidas iguais e conta as linhas; não mexe na lista original', () => {
    const frases = juntarFrasesIguais(LINHAS);
    expect(frases).toEqual([
      { descricao: 'Gil N. — casa: Fora das casas CMF → Casa Três', linhas: 1 },
      { descricao: 'Obra Beta — pino mudado de sítio', linhas: 2 },
    ]);
    expect(LINHAS).toHaveLength(3);
  });

  it('iguais mas não seguidas ficam separadas', () => {
    const a = { descricao: 'A — x' };
    const b = { descricao: 'B — y' };
    expect(juntarFrasesIguais([a, b, a]).map((f) => f.linhas)).toEqual([1, 1, 1]);
    expect(juntarFrasesIguais([])).toEqual([]);
  });
});

describe('etiquetas de reversão', () => {
  const carregadas = [
    entrada({ loteId: 7 }),
    entrada({ loteId: 9, criadoEm: '2026-10-04T07:12:00Z', autor: 'local', autorNome: '' }),
  ];

  it('"Reverte a gravação de 03/10 17:01 (Ana Exemplo)" ou "nº N" se não estiver carregada', () => {
    expect(formatarDiaHoraCurto('2026-10-03T15:01:00.000Z')).toBe('03/10 17:01');
    expect(formatarDiaHoraCurto('nada')).toBe('nada');
    expect(etiquetaReverte(entrada({ reverte: [7] }), carregadas)).toBe(
      'Reverte a gravação de 03/10 17:01 (Ana Exemplo)',
    );
    expect(etiquetaReverte(entrada({ reverte: [3] }), carregadas)).toBe('Reverte a gravação nº 3');
    expect(etiquetaReverte(entrada({ reverte: [7, 9] }), carregadas)).toBe(
      'Reverte a gravação de 03/10 17:01 (Ana Exemplo) e a gravação de 04/10 09:12 (Este computador)',
    );
    expect(etiquetaReverte(entrada({ reverte: [] }), carregadas)).toBeNull();
    expect(etiquetaReverte(entrada({ reverte: undefined }), carregadas)).toBeNull();
  });

  it('"Revertida", com a gravação que reverteu na dica', () => {
    expect(etiquetaRevertida(entrada({ revertidoPor: [9] }), carregadas)).toEqual({
      texto: 'Revertida',
      dica: 'Revertida pela gravação de 04/10 09:12 (Este computador)',
    });
    expect(etiquetaRevertida(entrada({ revertidoPor: [12] }), [])?.dica).toBe(
      'Revertida pela gravação nº 12',
    );
    expect(etiquetaRevertida(entrada({ revertidoPor: [] }), carregadas)).toBeNull();
  });
});

describe('mostraReverter', () => {
  it('só nos lotes do programa, aplicados, e nunca na reunião', () => {
    expect(mostraReverter(entrada(), false)).toBe(true);
    expect(mostraReverter(entrada({ tipo: 'ficha' }), false)).toBe(true);
    expect(mostraReverter(entrada(), true)).toBe(false);
    expect(mostraReverter(entrada({ autor: 'importacao', tipo: 'importacao' }), false)).toBe(false);
    expect(mostraReverter(entrada({ autor: 'dados-iniciais', tipo: 'ficha' }), false)).toBe(false);
    expect(mostraReverter(entrada({ estado: 'agendado' }), false)).toBe(false);
  });

  it('uma gravação já revertida não mostra "Reverter…" (nem o diálogo a deixa pôr no rascunho)', () => {
    expect(mostraReverter(entrada({ revertidoPor: [12] }), false)).toBe(false);
    expect(mostraReverter(entrada({ revertidoPor: [] }), false)).toBe(true);
    const vista = prepararReversao(estadoExemplo(), entrada({ revertidoPor: [12] }));
    expect(vista.podePorNoRascunho).toBe(false);
    expect(vista.explicacao).toBe('Esta gravação já foi revertida: não se reverte outra vez.');
  });
});

describe('prepararReversao (o diálogo "Reverter")', () => {
  it('volta tudo atrás, com as DUAS linhas do pino (lat e lng); a frase do pino aparece uma vez', () => {
    const vista = prepararReversao(depoisDoLote(), entrada({ alteracoes: LINHAS }));
    expect(vista.podePorNoRascunho).toBe(true);
    expect(vista.explicacao).toBeNull();
    expect(vista.impossiveis).toEqual([]);
    expect(vista.erros).toEqual([]);
    expect(vista.operacoes).toEqual(
      expect.arrayContaining([
        { tipo: 'mover', pessoaId: 'p-gil', campo: 'casaId', de: 'casa-3', para: null },
        { tipo: 'campo', entidade: 'local', id: 'local-obra', campo: 'lat', de: 49.65, para: 49.6 },
        { tipo: 'campo', entidade: 'local', id: 'local-obra', campo: 'lng', de: 6.2, para: 6.1 },
      ]),
    );
    expect(vista.operacoes).toHaveLength(3);
    // O título e o aviso anunciam o que a lista mostra: o pino conta uma vez.
    expect(vista.nAlteracoes).toBe(2);
    expect(vista.voltaAtras).toEqual([
      { descricao: 'Obra Beta — pino mudado de sítio', linhas: 2 },
      { descricao: 'Gil N. — casa: Casa Três → Fora das casas CMF', linhas: 1 },
    ]);
    // Aplicadas, o estado volta ao de antes do lote.
    const voltou = aplicarOperacoes(depoisDoLote(), vista.operacoes);
    expect(voltou.pessoas.find((p) => p.id === 'p-gil')?.casaId).toBeNull();
    expect(voltou.locais.find((l) => l.id === 'local-obra')).toMatchObject({ lat: 49.6, lng: 6.1 });
  });

  it('o que mudou entretanto fica em "Já não se pode reverter", com o motivo; o resto reverte', () => {
    const mudou = aplicarOperacoes(depoisDoLote(), [
      { tipo: 'mover', pessoaId: 'p-gil', campo: 'casaId', de: 'casa-3', para: 'casa-1' },
    ]);
    const vista = prepararReversao(mudou, entrada({ alteracoes: LINHAS }));
    expect(vista.impossiveis).toEqual([
      {
        descricao: 'Gil N. — casa: Fora das casas CMF → Casa Três',
        motivo: 'entretanto mudou: agora está em Casa Um',
      },
    ]);
    expect(vista.operacoes).toHaveLength(2);
    expect(vista.podePorNoRascunho).toBe(true);
  });

  it('nada para reverter: explica porquê', () => {
    const estado = estadoExemplo();
    const tudoMudou = prepararReversao(estado, entrada({ alteracoes: LINHAS }));
    expect(tudoMudou.operacoes).toEqual([]);
    expect(tudoMudou.impossiveis).toHaveLength(3);
    expect(tudoMudou.podePorNoRascunho).toBe(false);
    expect(tudoMudou.explicacao).toMatch(/^Não há nada para reverter/);

    const vazio = prepararReversao(estado, entrada({ alteracoes: [] }));
    expect(vazio.podePorNoRascunho).toBe(false);
    expect(vazio.explicacao).toBe('Esta gravação não tem alterações registadas: não há nada para reverter.');
  });

  it('a reversão já no rascunho não se põe outra vez', () => {
    const vista = prepararReversao(depoisDoLote(), entrada({ alteracoes: LINHAS }), true);
    expect(vista.podePorNoRascunho).toBe(false);
    expect(vista.explicacao).toMatch(/já está no rascunho/);
  });

  it('uma pessoa nova não se apaga (vai para impossíveis); um problema criado apaga-se', () => {
    const problema = {
      id: 'problema-00000000-a',
      casaId: 'casa-1',
      carrinhaId: null,
      texto: 'Torneira a pingar',
      abertoEm: '2026-10-03',
      resolvidoEm: null,
    };
    const pessoa = { ...estadoExemplo().pessoas[7], id: 'pessoa-00000000-a', nomeCurto: 'Nuno N.' };
    const estado = {
      ...estadoExemplo(),
      problemas: [problema],
      pessoas: [...estadoExemplo().pessoas, pessoa],
    };
    const vista = prepararReversao(
      estado as Estado,
      entrada({
        tipo: 'ficha',
        alteracoes: [
          linha('pessoa', pessoa.id as string, CAMPO_REGISTO, null, pessoa, 'Nuno N. — entrou (Beta Obras)'),
          linha(
            'problema',
            problema.id,
            CAMPO_REGISTO,
            null,
            problema,
            'Casa Um — problema aberto: «Torneira a pingar»',
          ),
        ],
      }),
    );
    expect(vista.impossiveis).toEqual([
      {
        descricao: 'Nuno N. — entrou (Beta Obras)',
        motivo: 'uma pessoa nova não se apaga: usa Saiu da empresa',
      },
    ]);
    expect(vista.voltaAtras).toEqual([
      { descricao: 'Casa Um — problema apagado: «Torneira a pingar»', linhas: 1 },
    ]);
  });

  it('o aviso depois de pôr no rascunho', () => {
    expect(avisoReversaoNoRascunho(5)).toBe(
      'Reversão no rascunho: 5 alterações. Guardar para gravar; Ctrl+Z desfaz.',
    );
    expect(avisoReversaoNoRascunho(1)).toBe(
      'Reversão no rascunho: 1 alteração. Guardar para gravar; Ctrl+Z desfaz.',
    );
  });
});

describe('reversões que vão no Guardar e os nomes das gravações', () => {
  const ida: Operacao = { tipo: 'mover', pessoaId: 'p-gil', campo: 'casaId', de: 'casa-3', para: null };
  const reversao = { loteId: 8, passo: 0, chaves: [chaveOperacao(ida)] };

  it('só os lotes com alguma operação ainda nos pendentes (a regra da loja)', () => {
    expect(lotesDaReversaoAEnviar([reversao], [ida])).toEqual([8]);
    // A pessoa voltou para onde estava: a compactação anulou a reversão; o lote já não vai no Guardar.
    expect(lotesDaReversaoAEnviar([reversao], [])).toEqual([]);
    const outra: Operacao = { tipo: 'mover', pessoaId: 'p-ana', campo: 'casaId', de: null, para: 'casa-1' };
    expect(lotesDaReversaoAEnviar([reversao], [outra])).toEqual([]);
    // O mesmo lote duas vezes (posto de novo depois de anulado): uma só vez.
    expect(lotesDaReversaoAEnviar([reversao, { ...reversao, passo: 3 }], [ida])).toEqual([8]);
  });

  it('a nota do Guardar fala da gravação pela data e pelo autor; "nº N" só se não for conhecida', () => {
    const carregadas = [entrada({ loteId: 8, criadoEm: '2026-10-04T22:02:00.000Z' })];
    expect(notaReversaoNoGuardar([], carregadas)).toBeNull();
    expect(notaReversaoNoGuardar([8], carregadas)).toBe(
      'Inclui a reversão da gravação de 05/10 00:02 (Ana Exemplo).',
    );
    expect(notaReversaoNoGuardar([8, 12], carregadas)).toBe(
      'Inclui a reversão da gravação de 05/10 00:02 (Ana Exemplo) e da gravação nº 12.',
    );
  });

  it('depois de recarregar, a nota do Guardar continua com a data e o autor (guardados na reversão)', () => {
    const reversoes = [
      {
        loteId: 12,
        passo: 0,
        chaves: ['x'],
        gravacao: {
          criadoEm: '2026-10-05T07:12:00.000Z',
          autor: 'rui@exemplo.test',
          autorNome: 'Rui Exemplo',
        },
      },
      { loteId: 13, passo: 0, chaves: ['y'] },
    ];
    expect(gravacoesDasReversoes(reversoes)).toEqual([
      {
        loteId: 12,
        criadoEm: '2026-10-05T07:12:00.000Z',
        autor: 'rui@exemplo.test',
        autorNome: 'Rui Exemplo',
      },
    ]);
    expect(notaReversaoNoGuardar([12, 13], gravacoesDasReversoes(reversoes))).toBe(
      'Inclui a reversão da gravação de 05/10 09:12 (Rui Exemplo) e da gravação nº 13.',
    );
  });

  it('as gravações que o Histórico mostrou ficam conhecidas (para o Reverter e o Guardar)', () => {
    lembrarGravacoes([
      entrada({ loteId: 41, criadoEm: '2026-10-04T22:17:00.000Z', autorNome: 'Rui Exemplo' }),
    ]);
    const conhecida = gravacoesConhecidas().find((g) => g.loteId === 41);
    expect(conhecida).toEqual({
      loteId: 41,
      criadoEm: '2026-10-04T22:17:00.000Z',
      autor: 'ana.exemplo@exemplo.test',
      autorNome: 'Rui Exemplo',
    });
    expect(etiquetaRevertida(entrada({ revertidoPor: [41] }), gravacoesConhecidas())?.dica).toBe(
      'Revertida pela gravação de 05/10 00:17 (Rui Exemplo)',
    );
  });
});
