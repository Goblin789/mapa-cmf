import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import { aplicarOperacoes } from '../../dominio/operacoes';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import { carrinhaConduzida, condutorDaCarrinha, ehCondutor, semCondutor } from './condutor';

/** Ana conduz a ZZ 1001 (onde vai); a ZZ 1002 tem como condutor o Ivo, que está inativo e vai na ZZ 1003. */
function cenario(): Estado {
  const base = aplicarOperacoes(estadoExemplo(), [
    { tipo: 'condutor', carrinhaId: 'zz1001', de: null, para: 'p-ana' },
  ]);
  return {
    ...base,
    carrinhas: base.carrinhas.map((c) => (c.id === 'zz1002' ? { ...c, condutorId: 'p-ivo' } : c)),
  };
}

const estado = cenario();
const ind = indexar(estado);
const pessoa = (id: string) => {
  const p = ind.pessoas.get(id);
  if (!p) throw new Error(id);
  return p;
};
const carrinha = (id: string) => {
  const c = ind.carrinhas.get(id);
  if (!c) throw new Error(id);
  return c;
};

describe('ehCondutor e carrinhaConduzida', () => {
  it('só quem é o condutor da carrinha onde vai', () => {
    expect(ehCondutor(pessoa('p-ana'), ind)).toBe(true);
    expect(carrinhaConduzida(pessoa('p-ana'), ind)?.id).toBe('zz1001');
    expect(ehCondutor(pessoa('p-bruno'), ind)).toBe(false);
    expect(carrinhaConduzida(pessoa('p-helena'), ind)).toBeNull();
    // O Ivo está marcado como condutor da ZZ 1002, mas vai na ZZ 1003: não conduz nenhuma.
    expect(ehCondutor(pessoa('p-ivo'), ind)).toBe(false);
  });

  it('uma pessoa inativa não conduz, mesmo marcada como condutora da carrinha onde vai', () => {
    // O Ivo (inativo) vai na ZZ 1003; marcado como condutor dela, a ficha da carrinha diz "sem condutor".
    const comIvo = {
      ...estado,
      carrinhas: estado.carrinhas.map((c) => (c.id === 'zz1003' ? { ...c, condutorId: 'p-ivo' } : c)),
    };
    const indIvo = indexar(comIvo);
    const ivo = indIvo.pessoas.get('p-ivo');
    const zz1003 = indIvo.carrinhas.get('zz1003');
    if (!ivo || !zz1003) throw new Error('Faltam o Ivo ou a ZZ 1003');
    expect(ivo.ativa).toBe(false);
    expect(carrinhaConduzida(ivo, indIvo)).toBeNull();
    expect(condutorDaCarrinha(zz1003, indIvo)).toBeNull();
  });
});

describe('condutorDaCarrinha e semCondutor', () => {
  it('o condutor tem de ser um dos passageiros ativos', () => {
    expect(condutorDaCarrinha(carrinha('zz1001'), ind)?.id).toBe('p-ana');
    expect(condutorDaCarrinha(carrinha('zz1002'), ind)).toBeNull();
    expect(condutorDaCarrinha(carrinha('zz1003'), ind)).toBeNull();
  });

  it('sem condutor = leva passageiros e nenhum conduz; vazia não conta', () => {
    expect(semCondutor(carrinha('zz1001'), ind)).toBe(false);
    expect(semCondutor(carrinha('zz1002'), ind)).toBe(true);
    // A ZZ 1003 só tem o Ivo, inativo: não leva ninguém.
    expect(semCondutor(carrinha('zz1003'), ind)).toBe(false);
  });

  it('os índices põem o condutor em primeiro nos passageiros', () => {
    expect(ind.passageiros.get('zz1001')?.map((p) => p.id)).toEqual([
      'p-ana',
      'p-bruno',
      'p-filipe',
      'p-gil',
    ]);
  });
});
