import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import { estadoFicticio } from './dadosFicticios';
import {
  cadeiaDaPessoa,
  carrinhasDasPessoas,
  carrinhasQueDormemEm,
  casasDasPessoas,
  coordenadasDoLocal,
  destinoNoMapa,
  resumoDasCasas,
} from './fichas';

const estado = estadoFicticio();
const ind = indexar(estado);
const dormidas = dormidasDasCarrinhas(estado, ind);

function pessoa(id: string) {
  const p = ind.pessoas.get(id);
  if (!p) throw new Error(`Falta a pessoa ${id} nos dados fictícios`);
  return p;
}

describe('cadeiaDaPessoa', () => {
  it('mostra casa, carrinha e obra', () => {
    expect(cadeiaDaPessoa(pessoa('p1'), ind)).toEqual([
      { tipo: 'casa', id: 'casa-a', rotulo: 'Casa A', aConfirmar: false },
      { tipo: 'carrinha', id: 'v1', rotulo: 'AA1111', aConfirmar: false },
      { tipo: 'obra', id: null, rotulo: 'sem obra', aConfirmar: false },
    ]);
  });

  it('usa os nomes dos grupos especiais e assinala o que está a confirmar', () => {
    const cadeia = cadeiaDaPessoa(pessoa('p5'), ind);
    expect(cadeia[0]).toEqual({ tipo: 'casa', id: null, rotulo: 'Fora das casas CMF', aConfirmar: true });
    expect(cadeia[2]).toEqual({ tipo: 'obra', id: 'obra-1', rotulo: 'Obra Teste', aConfirmar: false });
    const semCarrinha = cadeiaDaPessoa(pessoa('p6'), ind)[1];
    expect(semCarrinha).toEqual({
      tipo: 'carrinha',
      id: null,
      rotulo: 'Sem transporte da empresa',
      aConfirmar: true,
    });
  });

  it('trata uma casa que não existe como fora das casas', () => {
    const cadeia = cadeiaDaPessoa({ ...pessoa('p1'), casaId: 'nao-existe' }, ind);
    expect(cadeia[0]?.id).toBeNull();
    expect(cadeia[0]?.rotulo).toBe('Fora das casas CMF');
  });
});

describe('casasDasPessoas e carrinhasDasPessoas', () => {
  it('conta de que casas vêm os passageiros, mais pessoas primeiro', () => {
    const { casas, semCasa } = casasDasPessoas(ind.passageiros.get('v1') ?? [], ind);
    expect(casas.map((c) => [c.casa.id, c.n])).toEqual([
      ['casa-a', 2],
      ['casa-c', 1],
    ]);
    expect(semCasa).toBe(0);
    expect(casasDasPessoas(ind.passageiros.get('v2') ?? [], ind).semCasa).toBe(1);
  });

  it('conta que carrinhas os moradores usam e quantos estão sem transporte', () => {
    const { carrinhas, semCarrinha } = carrinhasDasPessoas(ind.moradores.get('casa-a') ?? [], ind);
    expect(carrinhas.map((c) => [c.carrinha.id, c.n])).toEqual([
      ['v1', 2],
      ['v2', 1],
    ]);
    expect(semCarrinha).toBe(1);
  });

  it('desempata pela ordem', () => {
    const pessoas = [pessoa('p3'), pessoa('p1')];
    expect(carrinhasDasPessoas(pessoas, ind).carrinhas.map((c) => c.carrinha.id)).toEqual(['v1', 'v2']);
  });
});

describe('carrinhasQueDormemEm', () => {
  it('inclui as sugeridas e as definidas', () => {
    expect(carrinhasQueDormemEm('casa-a', ind, dormidas).map((d) => [d.carrinha.id, d.confianca])).toEqual([
      ['v1', 'sugerida'],
    ]);
    expect(carrinhasQueDormemEm('casa-b', ind, dormidas).map((d) => [d.carrinha.id, d.confianca])).toEqual([
      ['v4', 'definida'],
    ]);
    expect(carrinhasQueDormemEm('casa-c', ind, dormidas)).toEqual([]);
  });
});

describe('coordenadasDoLocal', () => {
  it('devolve null sem local ou sem coordenadas', () => {
    expect(coordenadasDoLocal('local-norte', ind)).toEqual({ lat: 49.7, lng: 6.1 });
    expect(coordenadasDoLocal('local-sul', ind)).toBeNull();
    expect(coordenadasDoLocal(null, ind)).toBeNull();
    expect(coordenadasDoLocal('nao-existe', ind)).toBeNull();
  });
});

describe('destinoNoMapa', () => {
  it('pessoa com casa: o local da casa', () => {
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p1' }, ind, dormidas)).toEqual({ lat: 49.7, lng: 6.1 });
  });

  it('pessoa sem casa: onde dorme a carrinha', () => {
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p5' }, ind, dormidas)).toEqual({ lat: 49.5, lng: 6.0 });
  });

  it('pessoa com casa sem coordenadas: tenta a carrinha', () => {
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p4' }, ind, dormidas)).toEqual({ lat: 49.7, lng: 6.1 });
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p8' }, ind, dormidas)).toBeNull();
  });

  it('pessoa sem casa nem carrinha, ou desconhecida: nenhum destino', () => {
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p7' }, ind, dormidas)).toBeNull();
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'nao-existe' }, ind, dormidas)).toBeNull();
  });

  it('carrinha: onde dorme (definida, sugerida ou num estacionamento)', () => {
    expect(destinoNoMapa({ tipo: 'carrinha', id: 'v1' }, ind, dormidas)).toEqual({ lat: 49.7, lng: 6.1 });
    expect(destinoNoMapa({ tipo: 'carrinha', id: 'v2' }, ind, dormidas)).toEqual({ lat: 49.5, lng: 6.0 });
    expect(destinoNoMapa({ tipo: 'carrinha', id: 'v3' }, ind, dormidas)).toBeNull();
  });

  it('casa: o seu local', () => {
    expect(destinoNoMapa({ tipo: 'casa', id: 'casa-b' }, ind, dormidas)).toEqual({ lat: 49.7, lng: 6.1 });
    expect(destinoNoMapa({ tipo: 'casa', id: 'casa-c' }, ind, dormidas)).toBeNull();
  });
});

describe('resumoDasCasas', () => {
  it('lista as casas com lugares livres, mais livres primeiro', () => {
    const { comLivres } = resumoDasCasas(estado.casas, ind);
    expect(comLivres.map((r) => [r.casa.id, r.ocupacao.livres])).toEqual([
      ['casa-b', 2],
      ['casa-c', 1],
    ]);
  });

  it('lista as casas acima do contrato, primeiro as acima do tolerado', () => {
    const casas = estado.casas.map((c) => (c.id === 'casa-c' ? { ...c, maxContrato: 1, tolerado: 2 } : c));
    const { acimaContrato } = resumoDasCasas(casas, ind);
    expect(acimaContrato.map((r) => [r.casa.id, r.ocupacao.aviso])).toEqual([
      ['casa-c', 'acima_tolerado'],
      ['casa-a', 'acima_maximo'],
    ]);
  });
});
