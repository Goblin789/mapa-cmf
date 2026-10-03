import { describe, expect, it } from 'vitest';
import {
  type EstadoArrasto,
  type EventoArrasto,
  INATIVO,
  LIMIAR_RATO_PX,
  TOLERANCIA_TOQUE_PX,
  TOQUE_LONGO_MS,
  transitar,
} from './maquina';

/** Aplica os eventos por ordem e devolve o estado final e os efeitos que foram saindo. */
function correr(eventos: EventoArrasto[], inicial: EstadoArrasto = INATIVO) {
  let estado = inicial;
  const efeitos: (string | null)[] = [];
  for (const e of eventos) {
    const r = transitar(estado, e);
    estado = r.estado;
    efeitos.push(r.efeito);
  }
  return { estado, efeitos };
}

const baixarRato: EventoArrasto = {
  tipo: 'baixar',
  ponteiro: 'rato',
  pointerId: 1,
  pessoaId: 'p1',
  x: 100,
  y: 100,
  t: 0,
};
const baixarDedo: EventoArrasto = { ...baixarRato, ponteiro: 'toque', pointerId: 7 };

describe('rato', () => {
  it('só começa a arrastar depois de andar o limiar', () => {
    const r = correr([
      baixarRato,
      { tipo: 'mover', pointerId: 1, x: 103, y: 100 },
      { tipo: 'mover', pointerId: 1, x: 100 + LIMIAR_RATO_PX, y: 100 },
    ]);
    expect(r.efeitos).toEqual([null, null, 'comecar']);
    expect(r.estado).toMatchObject({ fase: 'aArrastar', pessoaId: 'p1', x: 105, y: 100 });
  });

  it('levantar sem andar é um clique: volta a inativo sem efeitos', () => {
    const r = correr([
      baixarRato,
      { tipo: 'mover', pointerId: 1, x: 102, y: 101 },
      { tipo: 'levantar', pointerId: 1, x: 102, y: 101 },
    ]);
    expect(r.efeitos).toEqual([null, null, null]);
    expect(r.estado).toEqual(INATIVO);
  });

  it('o tempo não levanta o nome com o rato', () => {
    const r = correr([baixarRato, { tipo: 'tempo', t: TOQUE_LONGO_MS * 3 }]);
    expect(r.estado.fase).toBe('pendente');
  });

  it('a arrastar: mover segue o ponteiro e levantar larga', () => {
    const r = correr([
      baixarRato,
      { tipo: 'mover', pointerId: 1, x: 120, y: 100 },
      { tipo: 'mover', pointerId: 1, x: 200, y: 150 },
      { tipo: 'levantar', pointerId: 1, x: 200, y: 150 },
    ]);
    expect(r.efeitos).toEqual([null, 'comecar', 'mover', 'largar']);
    expect(r.estado).toEqual(INATIVO);
  });

  it('cancelar a meio do arrasto (Esc) dá o efeito cancelar', () => {
    const r = correr([baixarRato, { tipo: 'mover', pointerId: 1, x: 120, y: 100 }, { tipo: 'cancelar' }]);
    expect(r.efeitos).toEqual([null, 'comecar', 'cancelar']);
    expect(r.estado).toEqual(INATIVO);
  });

  it('cancelar antes de arrastar não tem efeito', () => {
    const r = correr([baixarRato, { tipo: 'cancelar' }]);
    expect(r.efeitos).toEqual([null, null]);
    expect(r.estado).toEqual(INATIVO);
  });

  it('ignora movimentos e levantamentos de outros ponteiros', () => {
    const r = correr([
      baixarRato,
      { tipo: 'mover', pointerId: 2, x: 300, y: 300 },
      { tipo: 'mover', pointerId: 1, x: 120, y: 100 },
      { tipo: 'levantar', pointerId: 2, x: 0, y: 0 },
    ]);
    expect(r.efeitos).toEqual([null, null, 'comecar', null]);
    expect(r.estado.fase).toBe('aArrastar');
  });
});

describe('toque', () => {
  it('só um toque longo levanta o nome, na última posição do dedo', () => {
    const r = correr([
      baixarDedo,
      { tipo: 'mover', pointerId: 7, x: 104, y: 103 },
      { tipo: 'tempo', t: TOQUE_LONGO_MS - 1 },
      { tipo: 'tempo', t: TOQUE_LONGO_MS },
    ]);
    expect(r.efeitos).toEqual([null, null, null, 'comecar']);
    expect(r.estado).toMatchObject({ fase: 'aArrastar', ponteiro: 'toque', x: 104, y: 103 });
  });

  it('mexer o dedo antes do toque longo é deslocar o mapa: cancela sem efeitos', () => {
    const r = correr([
      baixarDedo,
      { tipo: 'mover', pointerId: 7, x: 100 + TOLERANCIA_TOQUE_PX + 1, y: 100 },
      { tipo: 'tempo', t: TOQUE_LONGO_MS },
    ]);
    expect(r.efeitos).toEqual([null, null, null]);
    expect(r.estado).toEqual(INATIVO);
  });

  it('um segundo dedo cancela (antes e depois de levantar o nome)', () => {
    const antes = correr([baixarDedo, { tipo: 'baixarOutro', pointerId: 8 }]);
    expect(antes.efeitos).toEqual([null, null]);
    expect(antes.estado).toEqual(INATIVO);

    const depois = correr([
      baixarDedo,
      { tipo: 'tempo', t: TOQUE_LONGO_MS },
      { tipo: 'baixarOutro', pointerId: 8 },
    ]);
    expect(depois.efeitos).toEqual([null, 'comecar', 'cancelar']);
    expect(depois.estado).toEqual(INATIVO);
  });

  it('depois de levantado, o dedo arrasta e larga', () => {
    const r = correr([
      baixarDedo,
      { tipo: 'tempo', t: TOQUE_LONGO_MS + 5 },
      { tipo: 'mover', pointerId: 7, x: 40, y: 400 },
      { tipo: 'levantar', pointerId: 7, x: 40, y: 400 },
    ]);
    expect(r.efeitos).toEqual([null, 'comecar', 'mover', 'largar']);
  });
});

describe('inativo', () => {
  it('ignora tudo menos carregar num nome', () => {
    const r = correr([
      { tipo: 'mover', pointerId: 1, x: 1, y: 1 },
      { tipo: 'levantar', pointerId: 1, x: 1, y: 1 },
      { tipo: 'tempo', t: 1000 },
      { tipo: 'cancelar' },
      { tipo: 'baixarOutro', pointerId: 3 },
    ]);
    expect(r.efeitos).toEqual([null, null, null, null, null]);
    expect(r.estado).toEqual(INATIVO);
  });
});
