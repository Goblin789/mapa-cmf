import { describe, expect, it } from 'vitest';
import { contextoFicticio } from './estadoFicticioTeste';
import { montarModelo } from './grupos';

describe('montarModelo', () => {
  const { estado, indices, dormidas } = contextoFicticio();
  const modelo = montarModelo(estado, indices, dormidas);
  const grupo = (localId: string) => modelo.grupos.find((g) => g.localId === localId);

  it('um grupo por local com coordenadas, com as casas pela ordem', () => {
    expect(modelo.grupos.map((g) => g.localId).sort()).toEqual(['E', 'L1', 'L2']);
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

  it('gente a mais aumenta os lugares desenhados e o aviso de contrato só conta as pessoas ativas', () => {
    const c1 = grupo('L1')?.casas[0];
    expect(c1).toEqual({ id: 'C1', nLugares: 5, comAviso: true });
    // C2 tem 1 morador ativo (o outro está inativo) e não tem contrato fixado.
    expect(grupo('L1')?.casas[1]).toEqual({ id: 'C2', nLugares: 2, comAviso: false });
  });
});
