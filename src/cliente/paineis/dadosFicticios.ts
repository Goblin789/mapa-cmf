// Estado FICTÍCIO para os testes dos painéis. Nenhum nome, número ou morada é real.

import type { Carrinha, Casa, Estado, Pessoa } from '../../dominio/tipos';

export function pessoaFicticia(campos: Partial<Pessoa> & Pick<Pessoa, 'id' | 'nomeCurto'>): Pessoa {
  return {
    numero: null,
    numeroOriginal: null,
    apelidos: 'Exemplo',
    nome: campos.nomeCurto,
    nomesAlternativos: [],
    clienteId: 'alfa',
    obraId: null,
    casaId: null,
    carrinhaId: null,
    casaAConfirmar: false,
    carrinhaAConfirmar: false,
    telefone: null,
    temCarta: null,
    cartaValidade: null,
    ativa: true,
    ...campos,
  };
}

function casaFicticia(campos: Partial<Casa> & Pick<Casa, 'id' | 'nome' | 'localId' | 'ordem'>): Casa {
  return {
    apartamento: null,
    lotacao: 4,
    maxContrato: null,
    tolerado: null,
    notaContrato: null,
    senhorio: null,
    equipamento: null,
    ...campos,
  };
}

function carrinhaFicticia(
  campos: Partial<Carrinha> & Pick<Carrinha, 'id' | 'matricula' | 'ordem'>,
): Carrinha {
  return {
    matriculasAlternativas: [],
    modelo: null,
    lugares: 5,
    dormeCasaId: null,
    dormeLocalId: null,
    temporaria: false,
    nota: null,
    ...campos,
  };
}

/**
 * Três clientes (Beta vem antes de Alfa na ordem), três casas (duas na mesma morada e uma sem
 * coordenadas), quatro carrinhas (dormida sugerida, num estacionamento, desconhecida e numa casa).
 */
export function estadoFicticio(): Estado {
  return {
    versao: 1,
    geradoEm: '2026-01-01T00:00:00.000Z',
    clientes: [
      { id: 'alfa', nome: 'Alfa', cor: '#ED7D31', sigla: 'AL', interno: false, ordem: 2 },
      { id: 'beta', nome: 'Beta', cor: '#808080', sigla: 'BE', interno: false, ordem: 1 },
      { id: 'gama', nome: 'Gama', cor: '#00B0F0', sigla: 'GA', interno: true, ordem: 3 },
    ],
    locais: [
      {
        id: 'local-norte',
        tipo: 'casa',
        nome: 'Norte',
        morada: '1 Rua Fictícia',
        pais: 'LU',
        lat: 49.7,
        lng: 6.1,
        raioM: 100,
      },
      {
        id: 'local-sul',
        tipo: 'casa',
        nome: 'Sul',
        morada: '2 Rua Inventada',
        pais: 'FR',
        lat: null,
        lng: null,
        raioM: 100,
      },
      {
        id: 'parque',
        tipo: 'estacionamento',
        nome: 'Parque Teste',
        morada: '3 Rua do Parque',
        pais: 'LU',
        lat: 49.5,
        lng: 6.0,
        raioM: 50,
      },
      {
        id: 'obra-local',
        tipo: 'obra',
        nome: 'Obra Teste',
        morada: '4 Rua da Obra',
        pais: 'LU',
        lat: 49.6,
        lng: 6.2,
        raioM: 150,
      },
    ],
    casas: [
      casaFicticia({
        id: 'casa-a',
        nome: 'Casa A',
        localId: 'local-norte',
        ordem: 1,
        lotacao: 4,
        maxContrato: 3,
        tolerado: 4,
      }),
      casaFicticia({ id: 'casa-b', nome: 'Casa B', localId: 'local-norte', ordem: 2, lotacao: 2 }),
      casaFicticia({ id: 'casa-c', nome: 'Casa C', localId: 'local-sul', ordem: 3, lotacao: 3 }),
    ],
    carrinhas: [
      carrinhaFicticia({ id: 'v1', matricula: 'AA1111', ordem: 1 }),
      carrinhaFicticia({ id: 'v2', matricula: 'BB2222', ordem: 2, dormeLocalId: 'parque', lugares: 9 }),
      carrinhaFicticia({ id: 'v3', matricula: 'CC3333', ordem: 3, matriculasAlternativas: ['ZZ9999'] }),
      carrinhaFicticia({ id: 'v4', matricula: 'DD4444', ordem: 4, dormeCasaId: 'casa-b' }),
    ],
    obras: [
      {
        id: 'obra-1',
        nome: 'Obra Teste',
        clienteId: 'gama',
        localId: 'obra-local',
        estacionamentoLocalId: null,
        origem: 'manual',
      },
    ],
    pessoas: [
      pessoaFicticia({
        id: 'p1',
        nomeCurto: 'Ana T.',
        nome: 'Ana',
        apelidos: 'Teste',
        casaId: 'casa-a',
        carrinhaId: 'v1',
      }),
      pessoaFicticia({
        id: 'p2',
        nomeCurto: 'Bruno E.',
        clienteId: 'beta',
        casaId: 'casa-a',
        carrinhaId: 'v1',
      }),
      pessoaFicticia({ id: 'p3', nomeCurto: 'Carla F.', casaId: 'casa-a', carrinhaId: 'v2' }),
      pessoaFicticia({
        id: 'p4',
        nomeCurto: 'Duarte G.',
        clienteId: 'beta',
        casaId: 'casa-c',
        carrinhaId: 'v1',
      }),
      pessoaFicticia({
        id: 'p5',
        nomeCurto: 'Eva H.',
        casaId: null,
        carrinhaId: 'v2',
        casaAConfirmar: true,
        obraId: 'obra-1',
      }),
      pessoaFicticia({
        id: 'p6',
        nomeCurto: 'Filipe I.',
        clienteId: 'beta',
        casaId: 'casa-a',
        carrinhaAConfirmar: true,
      }),
      pessoaFicticia({ id: 'p7', nomeCurto: 'Gil J.', casaId: null, carrinhaId: null }),
      pessoaFicticia({ id: 'p8', nomeCurto: 'Hugo K.', casaId: 'casa-c', carrinhaId: null }),
      pessoaFicticia({ id: 'p9', nomeCurto: 'Inês L.', casaId: 'casa-a', carrinhaId: 'v1', ativa: false }),
    ],
  };
}
