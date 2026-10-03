import { describe, expect, it } from 'vitest';
import { indexar } from './indices';
import { criarCasa, criarEstado, criarPessoa, estadoAleatorio, estadoExemplo } from './teste-fabrica';

const nomes = (lista: { nomeCurto: string }[] | undefined) => (lista ?? []).map((p) => p.nomeCurto);

describe('indexar', () => {
  it('estado vazio não rebenta e devolve listas vazias', () => {
    const ind = indexar(criarEstado());
    expect(ind.foraDasCasas).toEqual([]);
    expect(ind.semTransporte).toEqual([]);
    expect(ind.moradores.size).toBe(0);
    expect(ind.casasPorLocal.size).toBe(0);
  });

  it('todas as casas, carrinhas e obras têm entrada, mesmo sem ninguém', () => {
    const estado = estadoExemplo();
    const ind = indexar(estado);
    for (const c of estado.casas) expect(ind.moradores.get(c.id)).toBeDefined();
    for (const c of estado.carrinhas) expect(ind.passageiros.get(c.id)).toBeDefined();
    for (const o of estado.obras) expect(ind.trabalhadores.get(o.id)).toBeDefined();
    expect(ind.moradores.get('casa-3')).toEqual([]);
    expect(ind.passageiros.get('zz1003')).toEqual([]);
  });

  it('distribui as pessoas do exemplo pelas casas, carrinhas, obras e caixas', () => {
    const ind = indexar(estadoExemplo());
    expect(nomes(ind.moradores.get('casa-1'))).toEqual(['Ana T.', 'Bruno E.', 'Célia F.']);
    expect(nomes(ind.moradores.get('casa-2'))).toEqual(['Duarte S.', 'Elsa I.', 'Filipe Q.']);
    expect(nomes(ind.passageiros.get('zz1001'))).toEqual(['Ana T.', 'Bruno E.', 'Filipe Q.', 'Gil N.']);
    expect(nomes(ind.trabalhadores.get('obra-b'))).toEqual(['Ana T.', 'Gil N.']);
    expect(nomes(ind.foraDasCasas)).toEqual(['Gil N.', 'Helena Z.']);
    expect(nomes(ind.semTransporte)).toEqual(['Elsa I.', 'Helena Z.']);
  });

  it('pessoas inativas não aparecem em nenhuma lista, mas continuam no mapa de pessoas', () => {
    const estado = criarEstado({
      casas: [criarCasa({ id: 'c1' })],
      pessoas: [criarPessoa({ id: 'x', casaId: 'c1', carrinhaId: null, obraId: null, ativa: false })],
    });
    const ind = indexar(estado);
    expect(ind.moradores.get('c1')).toEqual([]);
    expect(ind.foraDasCasas).toEqual([]);
    expect(ind.semTransporte).toEqual([]);
    expect(ind.pessoas.get('x')?.ativa).toBe(false);
  });

  it('casaId, carrinhaId ou obraId que não existem: a pessoa vai para as caixas e não cria entradas', () => {
    const estado = criarEstado({
      pessoas: [
        criarPessoa({ id: 'x', casaId: 'nao-existe', carrinhaId: 'nao-existe', obraId: 'nao-existe' }),
      ],
    });
    const ind = indexar(estado);
    expect(nomes(ind.foraDasCasas)).toEqual(['Pessoa x']);
    expect(nomes(ind.semTransporte)).toEqual(['Pessoa x']);
    expect(ind.moradores.has('nao-existe')).toBe(false);
    expect(ind.passageiros.has('nao-existe')).toBe(false);
    expect(ind.trabalhadores.has('nao-existe')).toBe(false);
  });

  it('ordena por nome curto ignorando acentos e maiúsculas (português)', () => {
    const estado = criarEstado({
      casas: [criarCasa({ id: 'c1' })],
      pessoas: ['Zé', 'élio', 'Álvaro', 'bruno', 'Eva', 'ana'].map((n, i) =>
        criarPessoa({ id: `p${i}`, nomeCurto: n, casaId: 'c1' }),
      ),
    });
    expect(nomes(indexar(estado).moradores.get('c1'))).toEqual([
      'Álvaro',
      'ana',
      'bruno',
      'élio',
      'Eva',
      'Zé',
    ]);
  });

  it('não altera a ordem nem o conteúdo do estado recebido', () => {
    const estado = estadoExemplo();
    const copia = structuredClone(estado);
    indexar(estado);
    expect(estado).toEqual(copia);
  });

  it('casasPorLocal: ordenadas por ordem, empates pela ordem de entrada, só locais com casas', () => {
    const estado = criarEstado({
      casas: [
        criarCasa({ id: 'c3', localId: 'L1', ordem: 3 }),
        criarCasa({ id: 'c1b', localId: 'L1', ordem: 1 }),
        criarCasa({ id: 'c1a', localId: 'L1', ordem: 1 }),
        criarCasa({ id: 'c0', localId: 'L2', ordem: 0 }),
      ],
    });
    const ind = indexar(estado);
    expect(ind.casasPorLocal.get('L1')?.map((c) => c.id)).toEqual(['c1b', 'c1a', 'c3']);
    expect(ind.casasPorLocal.get('L2')?.map((c) => c.id)).toEqual(['c0']);
    expect(ind.casasPorLocal.has('L3')).toBe(false);
  });

  it.each(Array.from({ length: 40 }, (_, i) => i + 1))(
    'invariante (semente %i): cada pessoa ativa está numa só casa/caixa e numa só carrinha/caixa',
    (semente) => {
      const estado = estadoAleatorio(semente);
      const ind = indexar(estado);
      const ativas = estado.pessoas.filter((p) => p.ativa).map((p) => p.id);

      const emCasas = [...ind.moradores.values()]
        .flat()
        .concat(ind.foraDasCasas)
        .map((p) => p.id);
      expect(emCasas.toSorted()).toEqual(ativas.toSorted());

      const emCarrinhas = [...ind.passageiros.values()]
        .flat()
        .concat(ind.semTransporte)
        .map((p) => p.id);
      expect(emCarrinhas.toSorted()).toEqual(ativas.toSorted());

      for (const [obraId, lista] of ind.trabalhadores) {
        for (const p of lista) expect(p.obraId).toBe(obraId);
      }
      // Mesmos ids de casas, carrinhas e obras que no estado.
      expect([...ind.moradores.keys()]).toEqual(estado.casas.map((c) => c.id));
      expect([...ind.passageiros.keys()]).toEqual(estado.carrinhas.map((c) => c.id));
      expect([...ind.trabalhadores.keys()]).toEqual(estado.obras.map((o) => o.id));
    },
  );
});
