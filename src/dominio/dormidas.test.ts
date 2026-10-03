import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from './dormidas';
import { indexar } from './indices';
import {
  criarCarrinha,
  criarCasa,
  criarEstado,
  criarPessoa,
  estadoAleatorio,
  estadoExemplo,
} from './teste-fabrica';
import type { Estado } from './tipos';

const dormidas = (estado: Estado) => dormidasDasCarrinhas(estado, indexar(estado));

/** Casas c1 (local L1, ordem 2) e c2 (local L2, ordem 1). */
const casas = () => [
  criarCasa({ id: 'c1', localId: 'L1', ordem: 2 }),
  criarCasa({ id: 'c2', localId: 'L2', ordem: 1 }),
];

describe('dormidasDasCarrinhas', () => {
  it('exemplo: sugerida pela maioria, definida por local, desconhecida sem passageiros', () => {
    const d = dormidas(estadoExemplo());
    expect(d.get('zz1001')).toEqual({
      carrinhaId: 'zz1001',
      casaId: 'casa-1',
      localId: 'local-a',
      confianca: 'sugerida',
    });
    expect(d.get('zz1002')).toEqual({
      carrinhaId: 'zz1002',
      casaId: null,
      localId: 'local-parque',
      confianca: 'definida',
    });
    expect(d.get('zz1003')).toEqual({
      carrinhaId: 'zz1003',
      casaId: null,
      localId: null,
      confianca: 'desconhecida',
    });
  });

  it('casa definida: usa o local da casa, mesmo que os passageiros morem noutra', () => {
    const estado = criarEstado({
      casas: casas(),
      carrinhas: [criarCarrinha({ id: 'v', dormeCasaId: 'c1' })],
      pessoas: [
        criarPessoa({ casaId: 'c2', carrinhaId: 'v' }),
        criarPessoa({ casaId: 'c2', carrinhaId: 'v' }),
      ],
    });
    expect(dormidas(estado).get('v')).toMatchObject({ casaId: 'c1', localId: 'L1', confianca: 'definida' });
  });

  it('casa e local definidos ao mesmo tempo: manda a casa', () => {
    const estado = criarEstado({
      casas: casas(),
      carrinhas: [criarCarrinha({ id: 'v', dormeCasaId: 'c2', dormeLocalId: 'parque' })],
    });
    expect(dormidas(estado).get('v')).toMatchObject({ casaId: 'c2', localId: 'L2', confianca: 'definida' });
  });

  it('casa definida que não existe: fica "definida" mas sem local (não cai para o dormeLocalId)', () => {
    const estado = criarEstado({
      casas: casas(),
      carrinhas: [criarCarrinha({ id: 'v', dormeCasaId: 'fantasma', dormeLocalId: 'parque' })],
    });
    expect(dormidas(estado).get('v')).toEqual({
      carrinhaId: 'v',
      casaId: 'fantasma',
      localId: null,
      confianca: 'definida',
    });
  });

  it('sugestão: a casa com mais passageiros, mesmo sem maioria absoluta', () => {
    const estado = criarEstado({
      casas: casas(),
      carrinhas: [criarCarrinha({ id: 'v' })],
      pessoas: [
        criarPessoa({ nomeCurto: 'A', casaId: 'c1', carrinhaId: 'v' }),
        criarPessoa({ nomeCurto: 'B', casaId: 'c2', carrinhaId: 'v' }),
        criarPessoa({ nomeCurto: 'C', casaId: 'c2', carrinhaId: 'v' }),
        criarPessoa({ nomeCurto: 'D', casaId: null, carrinhaId: 'v' }),
        criarPessoa({ nomeCurto: 'E', casaId: null, carrinhaId: 'v' }),
        criarPessoa({ nomeCurto: 'F', casaId: null, carrinhaId: 'v' }),
      ],
    });
    expect(dormidas(estado).get('v')).toMatchObject({ casaId: 'c2', localId: 'L2', confianca: 'sugerida' });
  });

  it('empate: ganha a casa com menor ordem, seja qual for a ordem dos passageiros', () => {
    // "A" mora em c1 (ordem 2) e aparece primeiro; "B" mora em c2 (ordem 1).
    const pessoas = [
      criarPessoa({ nomeCurto: 'A', casaId: 'c1', carrinhaId: 'v' }),
      criarPessoa({ nomeCurto: 'B', casaId: 'c2', carrinhaId: 'v' }),
    ];
    const estado = criarEstado({ casas: casas(), carrinhas: [criarCarrinha({ id: 'v' })], pessoas });
    expect(dormidas(estado).get('v')?.casaId).toBe('c2');
    const invertido = { ...estado, pessoas: pessoas.toReversed() };
    expect(dormidas(invertido).get('v')?.casaId).toBe('c2');
  });

  it('empate com a mesma ordem: resultado determinista (não depende da ordem das pessoas no estado)', () => {
    const pessoas = [
      criarPessoa({ nomeCurto: 'Bea', casaId: 'x2', carrinhaId: 'v' }),
      criarPessoa({ nomeCurto: 'Abel', casaId: 'x1', carrinhaId: 'v' }),
    ];
    const base = {
      casas: [criarCasa({ id: 'x1', ordem: 0 }), criarCasa({ id: 'x2', ordem: 0 })],
      carrinhas: [criarCarrinha({ id: 'v' })],
    };
    const a = dormidas(criarEstado({ ...base, pessoas })).get('v');
    const b = dormidas(criarEstado({ ...base, pessoas: pessoas.toReversed() })).get('v');
    expect(a).toEqual(b);
    expect(a?.confianca).toBe('sugerida');
  });

  it('passageiros inativos, sem casa ou com casa inexistente não votam', () => {
    const estado = criarEstado({
      casas: casas(),
      carrinhas: [criarCarrinha({ id: 'v' })],
      pessoas: [
        criarPessoa({ casaId: 'c1', carrinhaId: 'v' }),
        criarPessoa({ casaId: 'c2', carrinhaId: 'v', ativa: false }),
        criarPessoa({ casaId: 'c2', carrinhaId: 'v', ativa: false }),
        criarPessoa({ casaId: 'fantasma', carrinhaId: 'v' }),
        criarPessoa({ casaId: 'fantasma', carrinhaId: 'v' }),
        criarPessoa({ casaId: null, carrinhaId: 'v' }),
      ],
    });
    expect(dormidas(estado).get('v')).toMatchObject({ casaId: 'c1', confianca: 'sugerida' });
  });

  it('todos os passageiros sem casa: desconhecida', () => {
    const estado = criarEstado({
      casas: casas(),
      carrinhas: [criarCarrinha({ id: 'v' })],
      pessoas: [
        criarPessoa({ casaId: null, carrinhaId: 'v' }),
        criarPessoa({ casaId: null, carrinhaId: 'v' }),
      ],
    });
    expect(dormidas(estado).get('v')).toEqual({
      carrinhaId: 'v',
      casaId: null,
      localId: null,
      confianca: 'desconhecida',
    });
  });

  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('invariantes (semente %i)', (semente) => {
    const estado = estadoAleatorio(semente);
    const ind = indexar(estado);
    const d = dormidasDasCarrinhas(estado, ind);
    expect([...d.keys()]).toEqual(estado.carrinhas.map((c) => c.id));
    for (const carrinha of estado.carrinhas) {
      const x = d.get(carrinha.id);
      expect(x?.carrinhaId).toBe(carrinha.id);
      expect(x?.confianca === 'definida').toBe(Boolean(carrinha.dormeCasaId || carrinha.dormeLocalId));
      if (carrinha.dormeCasaId) expect(x?.casaId).toBe(carrinha.dormeCasaId);
      else if (carrinha.dormeLocalId) expect(x?.localId).toBe(carrinha.dormeLocalId);
      if (x?.confianca === 'sugerida') {
        // Uma casa que existe e onde mora pelo menos um passageiro ativo, com o máximo de votos.
        const votos = (casaId: string) =>
          (ind.passageiros.get(carrinha.id) ?? []).filter((p) => p.casaId === casaId).length;
        expect(x.casaId && ind.casas.has(x.casaId)).toBeTruthy();
        const melhor = Math.max(...estado.casas.map((c) => votos(c.id)));
        expect(votos(x.casaId as string)).toBe(melhor);
        // Entre as empatadas, a de menor ordem.
        const menorOrdem = Math.min(
          ...estado.casas.filter((c) => votos(c.id) === melhor).map((c) => c.ordem),
        );
        expect(ind.casas.get(x.casaId as string)?.ordem).toBe(menorOrdem);
        expect(x.localId).toBe(ind.casas.get(x.casaId as string)?.localId);
      }
      if (x?.confianca === 'desconhecida') {
        expect(x.casaId).toBeNull();
        expect(x.localId).toBeNull();
      }
    }
  });
});
