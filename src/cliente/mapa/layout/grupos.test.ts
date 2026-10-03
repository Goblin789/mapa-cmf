import { describe, expect, it } from 'vitest';
import { contextoFicticio } from './estadoFicticioTeste';
import { montarModelo } from './grupos';

describe('montarModelo', () => {
  const { estado, indices, dormidas } = contextoFicticio();
  const modelo = montarModelo(estado, indices, dormidas);
  const grupo = (localId: string) => modelo.grupos.find((g) => g.localId === localId);

  it('um grupo por local com coordenadas (casas, carrinhas ou obras), com as casas pela ordem', () => {
    expect(modelo.grupos.map((g) => g.localId).sort()).toEqual(['E', 'L1', 'L2', 'O']);
    expect(grupo('L1')?.casas.map((c) => c.id)).toEqual(['C1', 'C2']);
    expect(grupo('L2')?.casas.map((c) => c.id)).toEqual(['C3']);
    expect(grupo('L1')).toMatchObject({ lat: 49.6, lng: 6.1, nome: 'Local L1' });
  });

  it('as carrinhas vão para onde dormem (definida ou sugerida)', () => {
    expect(grupo('L2')?.carrinhas).toEqual([{ id: 'V1', nLugares: 5, confianca: 'definida' }]);
    expect(grupo('L1')?.carrinhas).toEqual([{ id: 'V2', nLugares: 9, confianca: 'sugerida' }]);
    // Estacionamento: grupo só com carrinhas.
    expect(grupo('E')?.casas).toEqual([]);
    expect(grupo('E')?.carrinhas.map((c) => c.id)).toEqual(['V4']);
  });

  it('o que não tem sítio no mapa vai para a doca', () => {
    expect(modelo.carrinhasSemLocal.map((c) => c.id)).toEqual(['V3', 'V5']);
    expect(modelo.carrinhasSemLocal[0]?.confianca).toBe('desconhecida');
    expect(modelo.casasSemLocal.map((c) => c.id)).toEqual(['C4']);
  });

  it('gente a mais aumenta os lugares desenhados (só contam as pessoas ativas)', () => {
    // C1: lotação 4 com 5 moradores; C2: lotação 2 com 1 morador ativo (o outro está inativo).
    expect(grupo('L1')?.casas[0]).toEqual({ id: 'C1', nLugares: 5 });
    expect(grupo('L1')?.casas[1]).toEqual({ id: 'C2', nLugares: 2 });
  });

  it('as obras ficam no seu local, com o número de pessoas', () => {
    expect(grupo('O')?.obras).toEqual([{ id: 'OB1', nPessoas: 1 }]);
  });

  it('camadas desligadas não entram no modelo (nem na doca)', () => {
    const soCarrinhas = montarModelo(estado, indices, dormidas, {
      casas: false,
      carrinhas: true,
      obras: true,
    });
    expect(soCarrinhas.grupos.flatMap((g) => g.casas)).toEqual([]);
    expect(soCarrinhas.casasSemLocal).toEqual([]);
    // As carrinhas continuam no sítio onde dormem (L1 e L2), mesmo sem as casas à vista.
    expect(soCarrinhas.grupos.find((g) => g.localId === 'L2')?.carrinhas.map((c) => c.id)).toEqual(['V1']);
    const soCasas = montarModelo(estado, indices, dormidas, { casas: true, carrinhas: false, obras: false });
    expect(soCasas.grupos.flatMap((g) => [...g.carrinhas, ...g.obras])).toEqual([]);
    expect(soCasas.carrinhasSemLocal).toEqual([]);
    expect(soCasas.grupos.map((g) => g.localId).sort()).toEqual(['L1', 'L2']);
  });
});
