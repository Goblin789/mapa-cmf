// Testes de dominio/campos.ts: valores de cada campo editável e forma dos registos novos (M2). Dados fictícios.

import { describe, expect, it } from 'vitest';
import {
  CAMPOS_EDITAVEIS,
  chaveMatricula,
  ENTIDADES_EDITAVEIS,
  eCampoEditavel,
  encontrarRegisto,
  LIMITES,
  PADRAO_ID_NOVO,
  ROTULO_CAMPO,
  registosDe,
  type ValorCampo,
  validarRegisto,
  validarValorCampo,
} from './campos';
import {
  criarIndisponibilidade,
  criarLocal,
  criarObra,
  criarPessoa,
  criarProblema,
  estadoExemplo,
} from './teste-fabrica';

describe('validarValorCampo', () => {
  it('números inteiros dentro dos limites', () => {
    expect(validarValorCampo('casa', 'lotacao', 9)).toBeNull();
    expect(validarValorCampo('casa', 'lotacao', 0)).toBeNull();
    for (const mau of [-1, 61, 2.5, '9', null]) {
      expect(validarValorCampo('casa', 'lotacao', mau as never)).toBe(
        mau === null ? 'Lotação: não pode ficar vazio.' : 'Lotação: tem de ser um número inteiro de 0 a 60.',
      );
    }
    expect(validarValorCampo('casa', 'maxContrato', null)).toBeNull();
    expect(validarValorCampo('casa', 'tolerado', LIMITES.lotacaoMaxima + 1)).not.toBeNull();
    expect(validarValorCampo('carrinha', 'lugares', LIMITES.lugaresMaximos)).toBeNull();
    expect(validarValorCampo('carrinha', 'lugares', LIMITES.lugaresMaximos + 1)).toBe(
      'Lugares: tem de ser um número inteiro de 0 a 20.',
    );
  });

  it('textos: obrigatórios, opcionais (null, nunca ""), aparados, sem quebras de linha, com tamanho', () => {
    expect(validarValorCampo('pessoa', 'nomeCurto', 'Ana T.')).toBeNull();
    expect(validarValorCampo('pessoa', 'nomeCurto', '')).toBe('Nome no mapa: não pode ficar vazio.');
    expect(validarValorCampo('pessoa', 'nomeCurto', null)).toBe('Nome no mapa: não pode ficar vazio.');
    expect(validarValorCampo('pessoa', 'nomeCurto', ' Ana')).toBe('Nome no mapa: sem espaços nas pontas.');
    expect(validarValorCampo('pessoa', 'nome', 'Ana\nTeste')).toBe('Nome: sem quebras de linha.');
    expect(validarValorCampo('pessoa', 'nome', 'x'.repeat(LIMITES.textoCurto + 1))).toBe(
      'Nome: tem no máximo 80 caracteres.',
    );
    expect(validarValorCampo('pessoa', 'telefone', null)).toBeNull();
    expect(validarValorCampo('pessoa', 'telefone', '')).toBe('Telefone: fica vazio com null, não com "".');
    expect(validarValorCampo('pessoa', 'telefone', '6'.repeat(LIMITES.telefone + 1))).not.toBeNull();
    expect(validarValorCampo('casa', 'equipamento', 'x'.repeat(LIMITES.textoLongo))).toBeNull();
    // A morada de um local pode ficar vazia (obra escolhida só no mapa).
    expect(validarValorCampo('local', 'morada', '')).toBeNull();
    expect(validarValorCampo('local', 'morada', null)).toBe('Morada: não pode ficar vazio.');
    expect(validarValorCampo('problema', 'texto', 'x'.repeat(LIMITES.textoProblema + 1))).toBe(
      'Problema: tem no máximo 120 caracteres.',
    );
    expect(validarValorCampo('pessoa', 'nome', 5 as never)).toBe('Nome: tem de ser um texto.');
  });

  it('booleanos, sim/não/não sei e escolhas', () => {
    expect(validarValorCampo('pessoa', 'ativa', false)).toBeNull();
    expect(validarValorCampo('pessoa', 'ativa', null)).toBe('Na empresa: tem de ser sim ou não.');
    expect(validarValorCampo('pessoa', 'temCarta', null)).toBeNull();
    expect(validarValorCampo('pessoa', 'temCarta', 'sim' as never)).toBe(
      'Carta: tem de ser sim, não ou não sei.',
    );
    expect(validarValorCampo('carrinha', 'tipo', 'carro')).toBeNull();
    expect(validarValorCampo('carrinha', 'tipo', 'mota')).toBe('Tipo: tem de ser carrinha, carro.');
    expect(validarValorCampo('local', 'pais', 'FR')).toBeNull();
    expect(validarValorCampo('local', 'pais', 'PT')).toBe('País: tem de ser LU, FR, BE, DE.');
  });

  it('dias que existem', () => {
    expect(validarValorCampo('pessoa', 'cartaValidade', '2027-02-28')).toBeNull();
    expect(validarValorCampo('pessoa', 'cartaValidade', null)).toBeNull();
    expect(validarValorCampo('pessoa', 'cartaValidade', '2027-02-30')).toBe(
      'Carta válida até: tem de ser um dia que exista (AAAA-MM-DD).',
    );
    expect(validarValorCampo('indisponibilidade', 'inicio', null)).toBe('Indisponível desde: falta o dia.');
    expect(validarValorCampo('indisponibilidade', 'fim', null)).toBeNull();
    expect(validarValorCampo('problema', 'resolvidoEm', '04/10/2026')).not.toBeNull();
  });

  it('coordenadas dentro da região do mapa (nunca null)', () => {
    expect(validarValorCampo('local', 'lat', 49.61)).toBeNull();
    expect(validarValorCampo('local', 'lng', 6.13)).toBeNull();
    expect(validarValorCampo('local', 'lat', 48.86)).toBe('Latitude: a posição fica fora da região do mapa.');
    expect(validarValorCampo('local', 'lng', 2.35)).toBe('Longitude: a posição fica fora da região do mapa.');
    expect(validarValorCampo('local', 'lat', null)).not.toBeNull();
    expect(validarValorCampo('local', 'lat', Number.NaN)).not.toBeNull();
  });

  it('matrículas: maiúsculas, algarismos, espaços e hífenes; até 5 outras, sem repetidas', () => {
    expect(validarValorCampo('carrinha', 'matricula', 'CF 5001')).toBeNull();
    expect(validarValorCampo('carrinha', 'matricula', 'CF5001')).toBeNull();
    expect(validarValorCampo('carrinha', 'matricula', 'AB-123-CD')).toBeNull();
    expect(validarValorCampo('carrinha', 'matricula', 'cf5001')).toBe(
      'Matrícula: só letras maiúsculas, algarismos, espaços e hífenes (ex.: CF 5001).',
    );
    expect(validarValorCampo('carrinha', 'matricula', 'ABC')).not.toBeNull();
    expect(validarValorCampo('carrinha', 'matricula', '')).toBe('Matrícula: não pode ficar vazia.');
    expect(validarValorCampo('carrinha', 'matricula', 'CF 5001 12345')).toBe(
      'Matrícula: tem no máximo 12 caracteres.',
    );
    expect(validarValorCampo('carrinha', 'matriculasAlternativas', [])).toBeNull();
    expect(validarValorCampo('carrinha', 'matriculasAlternativas', ['VD6376', 'DS 4264'])).toBeNull();
    expect(validarValorCampo('carrinha', 'matriculasAlternativas', ['VD6376', 'VD 6376'])).toBe(
      'Outras matrículas: há matrículas repetidas.',
    );
    expect(
      validarValorCampo('carrinha', 'matriculasAlternativas', ['A1', 'B2', 'C3', 'D4', 'E5', 'F6']),
    ).toBe('Outras matrículas: no máximo 5 matrículas.');
    expect(validarValorCampo('carrinha', 'matriculasAlternativas', ['ok1', 'B2'])).toMatch(
      /^Outras matrículas: ok1/,
    );
    expect(validarValorCampo('carrinha', 'matriculasAlternativas', 'VD6376')).not.toBeNull();
    expect(chaveMatricula('CF 5001')).toBe(chaveMatricula('cf-5001'));
  });

  it('campos que não se editam e objetos', () => {
    expect(validarValorCampo('carrinha', 'ordem' as never, 1)).toBe('O campo ordem não se pode mudar.');
    expect(validarValorCampo('pessoa', 'casaId' as never, 'casa-1')).not.toBeNull();
    expect(validarValorCampo('casa', 'nome', { a: 1 } as never)).toBe('Valor inválido.');
  });

  it('todos os campos editáveis têm regra, rótulo e um valor que serve', () => {
    const estado = estadoExemplo();
    for (const entidade of ENTIDADES_EDITAVEIS) {
      for (const campo of CAMPOS_EDITAVEIS[entidade]) {
        expect(eCampoEditavel(entidade, campo)).toBe(true);
        expect((ROTULO_CAMPO[entidade] as Record<string, string>)[campo]).toBeTruthy();
      }
    }
    // Os registos do exemplo servem campo a campo (salvo as matrículas fictícias, que servem também).
    for (const entidade of ['pessoa', 'casa', 'carrinha', 'obra', 'local'] as const) {
      for (const registo of registosDe(estado, entidade)) {
        for (const campo of CAMPOS_EDITAVEIS[entidade]) {
          const valor = (registo as unknown as Record<string, ValorCampo>)[campo] ?? null;
          expect(validarValorCampo(entidade, campo as never, valor), `${entidade}.${campo}`).toBeNull();
        }
      }
    }
    expect(encontrarRegisto(estado, 'casa', 'casa-1')?.nome).toBe('Casa Um');
  });
});

describe('validarRegisto (registos novos)', () => {
  const ID = '1b2c3d4e-0000-4000-8000-000000000001';

  it('o id é o gerado no browser, com o prefixo da entidade', () => {
    expect(PADRAO_ID_NOVO.test(`obra-${ID}`)).toBe(true);
    expect(PADRAO_ID_NOVO.test('obra-curto')).toBe(false);
    expect(validarRegisto('obra', criarObra({ id: `obra-${ID}` }))).toEqual([]);
    expect(validarRegisto('obra', criarObra({ id: 'obra-a' }))).toEqual([
      'Identificador inválido (tem de ser "obra-…", gerado pelo programa).',
    ]);
    expect(validarRegisto('obra', criarObra({ id: `local-${ID}` }))).toHaveLength(1);
    expect(validarRegisto('obra', null)).toEqual(['Registo inválido.']);
  });

  it('obra manual, com nome', () => {
    expect(validarRegisto('obra', criarObra({ id: `obra-${ID}`, origem: 'gps' }))).toEqual([
      'Uma obra criada no programa é "manual".',
    ]);
    expect(validarRegisto('obra', criarObra({ id: `obra-${ID}`, nome: '' }))).toEqual([
      'Nome: não pode ficar vazio.',
    ]);
  });

  it('local: só obra ou estacionamento, raio dentro dos limites, posição na região', () => {
    const local = criarLocal({ id: `local-${ID}`, tipo: 'obra', raioM: 150, lat: 49.6, lng: 6.1 });
    expect(validarRegisto('local', local)).toEqual([]);
    expect(validarRegisto('local', { ...local, tipo: 'estacionamento' })).toEqual([]);
    expect(validarRegisto('local', { ...local, tipo: 'oficina' })).toEqual([
      'Só se criam locais de obra ou estacionamento.',
    ]);
    expect(validarRegisto('local', { ...local, raioM: 50000 })).toEqual([
      'Raio: tem de ser um número inteiro de 50 a 300 m.',
    ]);
    expect(validarRegisto('local', { ...local, raioM: 10 })).toHaveLength(1);
    expect(validarRegisto('local', { ...local, lat: null })).toEqual([
      'Latitude: a posição fica fora da região do mapa.',
    ]);
    expect(validarRegisto('local', { ...local, lng: 2.35 })).toHaveLength(1);
  });

  it('pessoa nova: sem casa, carrinha nem obra, ativa, sem marcas, sem nomes alternativos', () => {
    const nova = criarPessoa({ id: `pessoa-${ID}`, nomeCurto: 'Nova P.' });
    expect(validarRegisto('pessoa', nova)).toEqual([]);
    expect(validarRegisto('pessoa', { ...nova, casaId: 'casa-1' })).toEqual([
      'Uma pessoa nova entra sem casa, carrinha nem obra (põe-se lá a seguir).',
    ]);
    expect(validarRegisto('pessoa', { ...nova, ativa: false })).toEqual([
      'Uma pessoa nova entra na empresa (ativa).',
    ]);
    expect(validarRegisto('pessoa', { ...nova, casaAConfirmar: true })).toHaveLength(1);
    expect(validarRegisto('pessoa', { ...nova, nomesAlternativos: ['X'] })).toHaveLength(1);
    expect(validarRegisto('pessoa', { ...nova, numeroOriginal: '1' })).toHaveLength(1);
  });

  it('problema: exatamente um alvo, aberto, com o dia em que se abriu', () => {
    const p = criarProblema({ id: `problema-${ID}`, casaId: 'casa-1', abertoEm: '2026-10-04' });
    expect(validarRegisto('problema', p)).toEqual([]);
    expect(validarRegisto('problema', { ...p, carrinhaId: 'zz1001' })).toEqual([
      'Um problema é de uma casa ou de uma carrinha (exatamente uma).',
    ]);
    expect(validarRegisto('problema', { ...p, casaId: null })).toHaveLength(1);
    expect(validarRegisto('problema', { ...p, resolvidoEm: '2026-10-05' })).toEqual([
      'Um problema novo começa aberto.',
    ]);
    expect(validarRegisto('problema', { ...p, abertoEm: 'ontem' })).toHaveLength(1);
    expect(validarRegisto('problema', { ...p, texto: '' })).toEqual(['Problema: não pode ficar vazio.']);
  });

  it('indisponibilidade: pessoa e dias', () => {
    const i = criarIndisponibilidade({ id: `indisp-${ID}`, pessoaId: 'p-ana', inicio: '2026-10-06' });
    expect(validarRegisto('indisponibilidade', i)).toEqual([]);
    expect(validarRegisto('indisponibilidade', { ...i, pessoaId: '' })).toEqual(['Falta a pessoa.']);
    expect(validarRegisto('indisponibilidade', { ...i, inicio: '2026-13-01' })).toHaveLength(1);
  });
});
