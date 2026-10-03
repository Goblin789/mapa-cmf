// Dados FICTÍCIOS para os testes do servidor. Nenhum nome, número ou telefone é real.
// Inseridos fora de ordem de propósito, para os testes verificarem a ordenação.

import * as esquema from './db/esquema';
import type { Bd } from './db/ligacao';

export function inserirDadosFicticios(bd: Bd): void {
  bd.insert(esquema.clientes)
    .values([
      { id: 'cli-beta', nome: 'Construtora Beta', cor: '#2255AA', sigla: 'CB', ordem: 2 },
      { id: 'cli-alfa', nome: 'Alfa Obras', cor: '#AA2222', sigla: 'AO', ordem: 1 },
      { id: 'cli-interno', nome: 'Grupo Interno', cor: '#777777', sigla: 'GI', interno: true, ordem: 3 },
    ])
    .run();

  bd.insert(esquema.locais)
    .values([
      {
        id: 'loc-obra',
        tipo: 'obra',
        nome: 'Obra do Vale',
        morada: 'Rua Fictícia 1',
        pais: 'LU',
        lat: 49.6,
        lng: 6.1,
      },
      {
        id: 'loc-casas',
        tipo: 'casa',
        nome: 'Rua das Casas',
        morada: 'Rua Fictícia 2',
        pais: 'FR',
        lat: 49.1,
        lng: 6.9,
      },
      {
        id: 'loc-parque',
        tipo: 'estacionamento',
        nome: 'Parque',
        morada: 'Rua Fictícia 3',
        pais: 'LU',
        raioM: 80,
      },
    ])
    .run();

  bd.insert(esquema.casas)
    .values([
      {
        id: 'casa-ribeira',
        nome: 'Casa Ribeira',
        localId: 'loc-casas',
        apartamento: 'B',
        lotacao: 8,
        maxContrato: 6,
        tolerado: 8,
        notaContrato: '6 a 8',
        senhorio: 'Senhorio Fictício',
        equipamento: 'Máquina de lavar',
        ordem: 2,
      },
      { id: 'casa-monte', nome: 'Casa Monte', localId: 'loc-casas', lotacao: 4, ordem: 1 },
    ])
    .run();

  bd.insert(esquema.carrinhas)
    .values([
      {
        id: 'car-2',
        matricula: 'ZZ0002',
        matriculasAlternativas: ['ZZ9999'],
        modelo: 'Carrinha Modelo',
        lugares: 9,
        dormeCasaId: 'casa-monte',
        temporaria: true,
        nota: 'Substituição',
        ordem: 2,
      },
      { id: 'car-1', matricula: 'ZZ0001', lugares: 5, dormeLocalId: 'loc-parque', ordem: 1 },
    ])
    .run();

  bd.insert(esquema.obras)
    .values([
      { id: 'obra-vale', nome: 'Obra do Vale', clienteId: 'cli-alfa', localId: 'loc-obra', origem: 'manual' },
    ])
    .run();

  bd.insert(esquema.pessoas)
    .values([
      {
        id: 'p-ze',
        numero: '000-001',
        numeroOriginal: '000 - 001',
        apelidos: 'Teste',
        nome: 'Zé',
        nomeCurto: 'Zé Teste',
        nomesAlternativos: ['José Teste'],
        clienteId: 'cli-alfa',
        obraId: 'obra-vale',
        casaId: 'casa-ribeira',
        carrinhaId: 'car-2',
        telefone: '000000000',
        temCarta: true,
        cartaValidade: '2030-01-31',
      },
      {
        id: 'p-alvaro',
        apelidos: 'Exemplo',
        nome: 'Álvaro',
        nomeCurto: 'Álvaro Exemplo',
        clienteId: 'cli-beta',
        casaAConfirmar: true,
        carrinhaAConfirmar: true,
        temCarta: false,
      },
      {
        id: 'p-bruno',
        numero: '000-001_3',
        apelidos: 'Fictício',
        nome: 'Bruno',
        nomeCurto: 'Bruno Fictício',
        clienteId: 'cli-interno',
        casaId: 'casa-monte',
        ativa: false,
      },
      {
        id: 'p-elia',
        apelidos: 'Modelo',
        nome: 'Élia',
        nomeCurto: 'Élia Modelo',
        clienteId: 'cli-beta',
        carrinhaId: 'car-1',
      },
    ])
    .run();
}

/** Acrescenta lotes (o histórico); a versão do estado é o maior id. */
export function inserirLotes(bd: Bd, quantos: number): void {
  for (let i = 0; i < quantos; i++) {
    bd.insert(esquema.lotes)
      .values({
        autor: 'teste',
        criadoEm: '2026-01-01T00:00:00.000Z',
        efetivoEm: '2026-01-01T00:00:00.000Z',
        estado: 'aplicado',
        tipo: 'importacao',
      })
      .run();
  }
}
