// "Saiu da empresa" / "Voltou à empresa" (M2): o texto do diálogo, os passos e a frase do aviso. Só dados
// fictícios (dominio/teste-fabrica.ts).

import { describe, expect, it } from 'vitest';
import {
  aplicarOperacoes,
  compactarOperacoes,
  operacoesParaAlvo,
  validarOperacoes,
} from '../../dominio/operacoes';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import { operacoesCarta, passoSaida, passoVoltar, textoSaida } from '../paineis/fichas';
import { resumoDoPasso } from './acoes';

/** O exemplo com a Ana a conduzir a ZZ 1001 (vai nela). */
function comCondutora(): Estado {
  const estado = estadoExemplo();
  return {
    ...estado,
    carrinhas: estado.carrinhas.map((c) => (c.id === 'zz1001' ? { ...c, condutorId: 'p-ana' } : c)),
  };
}

function pessoa(estado: Estado, id: string) {
  const p = estado.pessoas.find((x) => x.id === id);
  if (!p) throw new Error(`Falta ${id}`);
  return p;
}

describe('textoSaida', () => {
  it('diz de onde sai e se deixa de conduzir', () => {
    const estado = comCondutora();
    expect(textoSaida(estado, pessoa(estado, 'p-ana'))).toBe(
      'Sai de Casa Um, da ZZ 1001 (deixa de conduzir) e da obra Obra Beta.',
    );
    expect(textoSaida(estado, pessoa(estado, 'p-elsa'))).toBe('Sai de Casa Dois.');
    expect(textoSaida(estado, pessoa(estado, 'p-helena'))).toBe(
      'Não está em nenhuma casa, carrinha nem obra.',
    );
  });

  it('carro: "do"', () => {
    const estado = comCondutora();
    const comCarro = {
      ...estado,
      carrinhas: estado.carrinhas.map((c) => (c.id === 'zz1002' ? { ...c, tipo: 'carro' as const } : c)),
    };
    expect(textoSaida(comCarro, pessoa(comCarro, 'p-duarte'))).toBe('Sai de Casa Dois e do ZZ 1002.');
  });
});

describe('passoSaida', () => {
  it('fora da casa, da carrinha (deixa de conduzir) e da obra, e ativa = false, num só passo válido', () => {
    const estado = comCondutora();
    const passo = passoSaida(estado, 'p-ana');
    expect(passo).toEqual([
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'casaId', de: 'casa-1', para: null },
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'carrinhaId', de: 'zz1001', para: null },
      { tipo: 'condutor', carrinhaId: 'zz1001', de: 'p-ana', para: null },
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'obraId', de: 'obra-b', para: null },
      { tipo: 'campo', entidade: 'pessoa', id: 'p-ana', campo: 'ativa', de: true, para: false },
    ]);
    expect(validarOperacoes(estado, passo)).toEqual([]);
    const final = aplicarOperacoes(estado, passo);
    expect(pessoa(final, 'p-ana')).toMatchObject({
      casaId: null,
      carrinhaId: null,
      obraId: null,
      ativa: false,
    });
    expect(final.carrinhas.find((c) => c.id === 'zz1001')?.condutorId).toBeNull();
  });

  it('também deixa de conduzir uma carrinha onde não ia (dados antigos)', () => {
    const estado = estadoExemplo();
    const incoerente = {
      ...estado,
      carrinhas: estado.carrinhas.map((c) => (c.id === 'zz1003' ? { ...c, condutorId: 'p-helena' } : c)),
    };
    const passo = passoSaida(incoerente, 'p-helena');
    expect(passo).toContainEqual({ tipo: 'condutor', carrinhaId: 'zz1003', de: 'p-helena', para: null });
    expect(validarOperacoes(incoerente, passo)).toEqual([]);
  });

  it('quem já saiu não tem passo de saída', () => {
    expect(passoSaida(estadoExemplo(), 'p-ivo')).toEqual([]);
  });
});

describe('passoVoltar', () => {
  it('ativa = true; no mesmo rascunho pode ir logo para uma casa', () => {
    const estado = comCondutora();
    const saiu = aplicarOperacoes(estado, passoSaida(estado, 'p-ana'));
    const voltar = passoVoltar(saiu, 'p-ana');
    expect(voltar).toEqual([
      { tipo: 'campo', entidade: 'pessoa', id: 'p-ana', campo: 'ativa', de: false, para: true },
    ]);
    const voltou = aplicarOperacoes(saiu, voltar);
    const casa = operacoesParaAlvo(voltou, ['p-ana'], { tipo: 'casa', id: 'casa-3' });
    expect(validarOperacoes(saiu, [...voltar, ...casa])).toEqual([]);
    expect(passoVoltar(estado, 'p-ana')).toEqual([]);
  });

  it('sair e voltar no mesmo rascunho: o ativa anula-se e a pessoa fica fora', () => {
    const estado = comCondutora();
    const sair = passoSaida(estado, 'p-ana');
    const voltar = passoVoltar(aplicarOperacoes(estado, sair), 'p-ana');
    const pendentes = compactarOperacoes([...sair, ...voltar]);
    expect(pendentes.some((op) => op.tipo === 'campo')).toBe(false);
    expect(validarOperacoes(estado, pendentes)).toEqual([]);
  });
});

describe('carta: "Não tem" limpa a validade no mesmo passo', () => {
  it('temCarta e cartaValidade juntas; o passo é válido', () => {
    const estado = estadoExemplo();
    const comCarta = {
      ...estado,
      pessoas: estado.pessoas.map((p) =>
        p.id === 'p-ana' ? { ...p, temCarta: true, cartaValidade: '2027-01-31' } : p,
      ),
    };
    const ops = operacoesCarta(comCarta, 'p-ana', 'nao-tem', '2027-01-31');
    expect(ops).toEqual([
      { tipo: 'campo', entidade: 'pessoa', id: 'p-ana', campo: 'temCarta', de: true, para: false },
      {
        tipo: 'campo',
        entidade: 'pessoa',
        id: 'p-ana',
        campo: 'cartaValidade',
        de: '2027-01-31',
        para: null,
      },
    ]);
    expect(validarOperacoes(comCarta, ops)).toEqual([]);
    // Só a carta, sem limpar a validade, o domínio recusa.
    expect(validarOperacoes(comCarta, ops.slice(0, 1))).toEqual([
      'Ana T. — sem carta (ou sem saber) não há validade da carta.',
    ]);
    expect(operacoesCarta(comCarta, 'p-ana', 'nao-sei', '')).toHaveLength(2);
    expect(operacoesCarta(comCarta, 'p-ana', 'tem', '2027-01-31')).toEqual([]);
    expect(operacoesCarta(comCarta, 'p-ana', 'tem', '')).toEqual([
      {
        tipo: 'campo',
        entidade: 'pessoa',
        id: 'p-ana',
        campo: 'cartaValidade',
        de: '2027-01-31',
        para: null,
      },
    ]);
  });
});

describe('resumoDoPasso (o aviso depois de aplicar)', () => {
  it('campos do mesmo registo numa frase; registos diferentes contam-se', () => {
    const estado = estadoExemplo();
    expect(
      resumoDoPasso(estado, [
        { tipo: 'campo', entidade: 'casa', id: 'casa-1', campo: 'lotacao', de: 3, para: 4 },
      ]),
    ).toBe('Casa Um — lotação: 3 → 4');
    expect(
      resumoDoPasso(estado, [
        { tipo: 'campo', entidade: 'pessoa', id: 'p-ana', campo: 'temCarta', de: null, para: false },
        { tipo: 'campo', entidade: 'pessoa', id: 'p-ana', campo: 'telefone', de: null, para: '691' },
      ]),
    ).toBe('Ana T. — carta: não sei → não, telefone: — → 691');
    expect(
      resumoDoPasso(estado, [
        { tipo: 'campo', entidade: 'casa', id: 'casa-1', campo: 'lotacao', de: 3, para: 4 },
        { tipo: 'campo', entidade: 'casa', id: 'casa-2', campo: 'lotacao', de: 2, para: 3 },
      ]),
    ).toBe('2 alterações');
    // Só mudanças de pessoas: como sempre.
    expect(
      resumoDoPasso(estado, [
        { tipo: 'mover', pessoaId: 'p-ana', campo: 'casaId', de: 'casa-1', para: 'casa-3' },
      ]),
    ).toBe('Ana T. — casa: Casa Um → Casa Três');
  });

  it('não repete frases iguais (a lat e a lng do pino dão a mesma)', () => {
    const estado = estadoExemplo();
    const local = estado.locais.find((l) => l.id === 'local-a');
    if (!local || local.lat === null || local.lng === null) throw new Error('Falta o local-a com posição');
    const frase = resumoDoPasso(estado, [
      {
        tipo: 'campo',
        entidade: 'local',
        id: 'local-a',
        campo: 'lat',
        de: local.lat,
        para: local.lat + 0.001,
      },
      {
        tipo: 'campo',
        entidade: 'local',
        id: 'local-a',
        campo: 'lng',
        de: local.lng,
        para: local.lng + 0.001,
      },
    ]);
    expect(frase.match(/pino mudado de sítio/g)).toHaveLength(1);
  });
});
