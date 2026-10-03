import { describe, expect, it } from 'vitest';
import { calcularContadores } from './contadores';
import { clienteEfetivoId } from './cores';
import { indexar } from './indices';
import { ocupacaoCasa } from './ocupacao';
import {
  criarCarrinha,
  criarCasa,
  criarCliente,
  criarEstado,
  criarObra,
  criarPessoa,
  estadoAleatorio,
  estadoExemplo,
} from './teste-fabrica';

const soma = (r: Record<string, number>) => Object.values(r).reduce((s, n) => s + n, 0);

describe('calcularContadores', () => {
  it('estado vazio: tudo a zero', () => {
    expect(calcularContadores(criarEstado())).toEqual({
      totalPessoas: 0,
      pessoasPorCliente: {},
      lugaresLivresCasas: 0,
      casasCheias: 0,
      casasEmExcesso: 0,
      casasAcimaContrato: 0,
      foraDasCasas: { total: 0, porCliente: {} },
      semTransporte: { total: 0, porCliente: {} },
      lugaresLivresCarrinhas: 0,
      carrinhasSemPassageiros: 0,
      carrinhasParadas: 0,
      aConfirmar: 0,
    });
  });

  it('valores do estado de exemplo (contados à mão)', () => {
    expect(calcularContadores(estadoExemplo())).toEqual({
      totalPessoas: 8,
      // Com obra manda o cliente da obra: Ana e Gil (cliente-a, obra-b) contam em cliente-b; Filipe ao contrário.
      pessoasPorCliente: { 'cliente-a': 3, 'cliente-b': 4, 'cliente-i': 1 },
      lugaresLivresCasas: 4,
      casasCheias: 1,
      casasEmExcesso: 1,
      casasAcimaContrato: 1,
      foraDasCasas: { total: 2, porCliente: { 'cliente-b': 2 } },
      semTransporte: { total: 2, porCliente: { 'cliente-i': 1, 'cliente-b': 1 } },
      lugaresLivresCarrinhas: 10,
      carrinhasSemPassageiros: 1,
      carrinhasParadas: 0,
      aConfirmar: 2,
    });
  });

  it('pessoas inativas não contam em lado nenhum (nem em "a confirmar")', () => {
    const estado = criarEstado({
      casas: [criarCasa({ id: 'c1', lotacao: 1 })],
      carrinhas: [criarCarrinha({ id: 'v1', lugares: 1 })],
      pessoas: [criarPessoa({ casaId: 'c1', carrinhaId: 'v1', casaAConfirmar: true, ativa: false })],
    });
    const c = calcularContadores(estado);
    expect(c.totalPessoas).toBe(0);
    expect(c.aConfirmar).toBe(0);
    expect(c.lugaresLivresCasas).toBe(1);
    expect(c.lugaresLivresCarrinhas).toBe(1);
    expect(c.carrinhasSemPassageiros).toBe(1);
  });

  it('pessoa com obra conta no cliente da obra em todas as divisões por cliente', () => {
    const estado = criarEstado({
      obras: [criarObra({ id: 'o1', clienteId: 'da-obra' })],
      pessoas: [criarPessoa({ clienteId: 'da-pessoa', obraId: 'o1', casaId: null, carrinhaId: null })],
    });
    const c = calcularContadores(estado);
    expect(c.pessoasPorCliente).toEqual({ 'da-obra': 1 });
    expect(c.foraDasCasas.porCliente).toEqual({ 'da-obra': 1 });
    expect(c.semTransporte.porCliente).toEqual({ 'da-obra': 1 });
  });

  it('ids de clientes iguais a propriedades de Object.prototype contam como números', () => {
    const estado = criarEstado({
      clientes: [criarCliente({ id: 'constructor' }), criarCliente({ id: 'toString' })],
      pessoas: [
        criarPessoa({ clienteId: 'constructor' }),
        criarPessoa({ clienteId: 'constructor' }),
        criarPessoa({ clienteId: 'toString' }),
      ],
    });
    const c = calcularContadores(estado);
    expect(c.pessoasPorCliente).toEqual({ constructor: 2, toString: 1 });
    expect(c.foraDasCasas.porCliente).toEqual({ constructor: 2, toString: 1 });

    const comProto = calcularContadores(criarEstado({ pessoas: [criarPessoa({ clienteId: '__proto__' })] }));
    expect(Object.hasOwn(comProto.pessoasPorCliente, '__proto__')).toBe(true);
    expect(Object.entries(comProto.pessoasPorCliente)).toEqual([['__proto__', 1]]);
  });

  it('o índice passado é o mesmo que seria calculado', () => {
    const estado = estadoExemplo();
    expect(calcularContadores(estado, indexar(estado))).toEqual(calcularContadores(estado));
  });

  it.each(Array.from({ length: 60 }, (_, i) => i + 1))(
    'invariantes de consistência (semente %i)',
    (semente) => {
      const estado = estadoAleatorio(semente);
      const ind = indexar(estado);
      const c = calcularContadores(estado, ind);
      const ativas = estado.pessoas.filter((p) => p.ativa);

      expect(c.totalPessoas).toBe(ativas.length);
      expect(soma(c.pessoasPorCliente)).toBe(c.totalPessoas);
      expect(soma(c.foraDasCasas.porCliente)).toBe(c.foraDasCasas.total);
      expect(soma(c.semTransporte.porCliente)).toBe(c.semTransporte.total);
      for (const n of [...Object.values(c.pessoasPorCliente), ...Object.values(c.foraDasCasas.porCliente)]) {
        expect(Number.isInteger(n) && n > 0).toBe(true);
      }

      // Quem está numa casa + quem está fora = todos; o mesmo para as carrinhas.
      const nasCasas = estado.casas.reduce((s, casa) => s + (ind.moradores.get(casa.id)?.length ?? 0), 0);
      const nasCarrinhas = estado.carrinhas.reduce((s, v) => s + (ind.passageiros.get(v.id)?.length ?? 0), 0);
      expect(nasCasas + c.foraDasCasas.total).toBe(c.totalPessoas);
      expect(nasCarrinhas + c.semTransporte.total).toBe(c.totalPessoas);

      // Cada cliente fora das casas / sem transporte nunca passa o total desse cliente.
      for (const [id, n] of Object.entries(c.foraDasCasas.porCliente)) {
        expect(n).toBeLessThanOrEqual(c.pessoasPorCliente[id] ?? 0);
      }
      for (const [id, n] of Object.entries(c.semTransporte.porCliente)) {
        expect(n).toBeLessThanOrEqual(c.pessoasPorCliente[id] ?? 0);
      }
      // Divisão por cliente = cliente efetivo (o da obra, se existir).
      const esperadoPorCliente: Record<string, number> = {};
      for (const p of ativas) {
        const id = clienteEfetivoId(p, ind.obras);
        esperadoPorCliente[id] = (esperadoPorCliente[id] ?? 0) + 1;
      }
      expect(c.pessoasPorCliente).toEqual(esperadoPorCliente);

      // Casas: livres, cheias, em excesso e acima do contrato batem com a ocupação de cada uma.
      const ocs = estado.casas.map((casa) => ocupacaoCasa(casa, ind.moradores.get(casa.id)?.length ?? 0));
      expect(c.lugaresLivresCasas).toBe(ocs.reduce((s, oc) => s + oc.livres, 0));
      expect(c.casasCheias).toBe(ocs.filter((oc) => oc.nivel === 'cheio').length);
      expect(c.casasEmExcesso).toBe(ocs.filter((oc) => oc.nivel === 'excesso').length);
      expect(c.casasAcimaContrato).toBeLessThanOrEqual(
        estado.casas.filter((x) => x.maxContrato !== null).length,
      );
      expect(c.lugaresLivresCasas).toBeGreaterThanOrEqual(0);
      expect(c.lugaresLivresCarrinhas).toBeGreaterThanOrEqual(0);
      expect(c.carrinhasSemPassageiros).toBeLessThanOrEqual(estado.carrinhas.length);
      expect(c.aConfirmar).toBeLessThanOrEqual(c.totalPessoas);
    },
  );
});
