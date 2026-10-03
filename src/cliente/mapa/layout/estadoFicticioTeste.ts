// Estado FICTÍCIO para os testes do mapa (nomes e números inventados).
//
// Locais: L1 e L2 (com coordenadas), L3 (sem coordenadas), E (estacionamento).
// Casas: C1 (L1, lotação 4, contrato 3, com 5 moradores: gente a mais), C2 (L1), C3 (L2), C4 (L3).
// Carrinhas: V1 dorme na C3 (definida); V2 sugerida em L1 (a maioria mora na C1);
// V3 sem passageiros (desconhecida); V4 dorme no estacionamento E; V5 só com moradores da C4 (L3).

import { dormidasDasCarrinhas } from '../../../dominio/dormidas';
import { indexar } from '../../../dominio/indices';
import type { Carrinha, Casa, Estado, Local, Pessoa } from '../../../dominio/tipos';

function local(id: string, tipo: Local['tipo'], lat: number | null, lng: number | null): Local {
  return { id, tipo, nome: `Local ${id}`, morada: `Rua Fictícia ${id}`, pais: 'LU', lat, lng, raioM: 150 };
}

function casa(id: string, localId: string, lotacao: number, maxContrato: number | null, ordem: number): Casa {
  return {
    id,
    nome: `Casa ${id}`,
    localId,
    apartamento: null,
    lotacao,
    maxContrato,
    tolerado: null,
    notaContrato: null,
    senhorio: null,
    equipamento: null,
    ordem,
  };
}

function carrinha(id: string, lugares: number, ordem: number, dorme: Partial<Carrinha> = {}): Carrinha {
  return {
    id,
    matricula: `ZZ${ordem}000`,
    matriculasAlternativas: [],
    modelo: null,
    lugares,
    dormeCasaId: null,
    dormeLocalId: null,
    temporaria: false,
    nota: null,
    ordem,
    ...dorme,
  };
}

let contador = 0;
function pessoa(casaId: string | null, carrinhaId: string | null, extra: Partial<Pessoa> = {}): Pessoa {
  contador++;
  return {
    id: `p${contador}`,
    numero: null,
    numeroOriginal: null,
    apelidos: 'Fictício',
    nome: `Pessoa${String(contador).padStart(2, '0')}`,
    nomeCurto: `Pessoa ${String(contador).padStart(2, '0')}`,
    nomesAlternativos: [],
    clienteId: 'cli-a',
    obraId: null,
    casaId,
    carrinhaId,
    casaAConfirmar: false,
    carrinhaAConfirmar: false,
    telefone: null,
    temCarta: null,
    cartaValidade: null,
    ativa: true,
    ...extra,
  };
}

export function estadoFicticio(): Estado {
  contador = 0;
  return {
    versao: 1,
    geradoEm: '2026-10-03T00:00:00.000Z',
    clientes: [
      { id: 'cli-a', nome: 'Cliente A', cor: '#ff0000', sigla: 'CA', interno: false, ordem: 0 },
      { id: 'cli-b', nome: 'Cliente B', cor: '#00ff00', sigla: 'CB', interno: false, ordem: 1 },
    ],
    locais: [
      local('L1', 'casa', 49.6, 6.1),
      local('L2', 'casa', 49.7, 6.2),
      local('L3', 'casa', null, null),
      local('E', 'estacionamento', 49.5, 6.0),
      local('O', 'obra', 49.65, 6.15),
    ],
    casas: [
      casa('C1', 'L1', 4, 3, 1),
      casa('C2', 'L1', 2, null, 2),
      casa('C3', 'L2', 3, null, 3),
      casa('C4', 'L3', 2, null, 4),
    ],
    carrinhas: [
      carrinha('V2', 9, 2),
      carrinha('V1', 5, 1, { dormeCasaId: 'C3' }),
      carrinha('V3', 5, 3),
      carrinha('V4', 5, 4, { dormeLocalId: 'E' }),
      carrinha('V5', 5, 5),
    ],
    obras: [
      {
        id: 'OB1',
        nome: 'Obra fictícia',
        clienteId: 'cli-b',
        localId: 'O',
        estacionamentoLocalId: null,
        origem: 'manual',
      },
    ],
    pessoas: [
      pessoa('C1', 'V2', { obraId: 'OB1' }),
      pessoa('C1', 'V2'),
      pessoa('C1', 'V2'),
      pessoa('C1', 'V1'),
      pessoa('C1', null),
      pessoa('C2', 'V2'),
      pessoa('C3', 'V1'),
      pessoa(null, 'V4'),
      pessoa('C4', 'V5'),
      pessoa('C2', 'V2', { ativa: false }),
    ],
  };
}

export function contextoFicticio() {
  const estado = estadoFicticio();
  const indices = indexar(estado);
  const dormidas = dormidasDasCarrinhas(estado, indices);
  return { estado, indices, dormidas };
}
