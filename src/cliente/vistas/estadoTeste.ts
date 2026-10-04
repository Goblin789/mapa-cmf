// Estado FICTÍCIO para os testes das vistas (Tabela, Quadro, Excel). Nenhum nome, número ou morada é real.
// Não usar fora dos testes.
//
// - "Vila Fictícia": duas ruas a ~300 m (vizinhas, como as de Himeling), em França; a Rua Leste vem
//   primeiro na ordem das casas, mas a Rua Oeste fica à esquerda.
// - Luxemburgo: "Aldeia" (contrato 1, tolerado 2) e "Monte" (conta sempre como cheia), e um parque.
// - Carrinhas: XX1001 (dorme na Casa L1, condutor Zé), XX1002 (sem onde dormir: sugere-se a Aldeia),
//   XX1003 (dorme no parque, sem condutor), XX1004 (vazia, por definir), XX1005 (carro, na Casa O1).

import {
  criarCarrinha,
  criarCasa,
  criarCliente,
  criarEstado,
  criarLocal,
  criarPessoa,
} from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';

export const COR_ALFA = '#F2B8A0';
export const COR_BETA = '#B8D8F2';

export function estadoVistas(): Estado {
  return criarEstado({
    versao: 7,
    clientes: [
      criarCliente({ id: 'alfa', nome: 'Alfa Obras', cor: COR_ALFA, sigla: 'AL', ordem: 0 }),
      criarCliente({ id: 'beta', nome: 'Beta Construções', cor: COR_BETA, sigla: 'BE', ordem: 1 }),
    ],
    locais: [
      criarLocal({ id: 'vila-leste', nome: 'Vila Fictícia, Rua Leste', pais: 'FR', lat: 49.492, lng: 6.243 }),
      criarLocal({ id: 'vila-oeste', nome: 'Vila Fictícia, Rua Oeste', pais: 'FR', lat: 49.49, lng: 6.24 }),
      criarLocal({ id: 'aldeia', nome: 'Aldeia', pais: 'LU', lat: 49.7, lng: 6.1 }),
      criarLocal({ id: 'monte', nome: 'Monte', pais: 'LU', lat: 49.8, lng: 6.0 }),
      criarLocal({
        id: 'parque',
        tipo: 'estacionamento',
        nome: 'Parque Norte',
        pais: 'LU',
        lat: 49.75,
        lng: 6.2,
      }),
    ],
    casas: [
      criarCasa({ id: 'casa-l1', nome: 'Casa L1', localId: 'vila-leste', lotacao: 3, ordem: 0 }),
      criarCasa({ id: 'casa-l2', nome: 'Casa L2', localId: 'vila-leste', lotacao: 2, ordem: 1 }),
      criarCasa({ id: 'casa-o1', nome: 'Casa O1', localId: 'vila-oeste', lotacao: 4, ordem: 2 }),
      criarCasa({
        id: 'casa-a',
        nome: 'Aldeia',
        localId: 'aldeia',
        lotacao: 2,
        maxContrato: 1,
        tolerado: 2,
        ordem: 3,
      }),
      criarCasa({ id: 'casa-m', nome: 'Monte', localId: 'monte', lotacao: 3, sempreCheia: true, ordem: 4 }),
    ],
    carrinhas: [
      criarCarrinha({
        id: 'XX1001',
        matricula: 'XX1001',
        marca: 'Marca',
        modelo: 'Furgão',
        lugares: 5,
        dormeCasaId: 'casa-l1',
        condutorId: 'p-1',
        ordem: 0,
      }),
      criarCarrinha({ id: 'XX1002', matricula: 'XX1002', lugares: 3, condutorId: 'p-5', ordem: 1 }),
      criarCarrinha({ id: 'XX1003', matricula: 'XX1003', lugares: 2, dormeLocalId: 'parque', ordem: 2 }),
      criarCarrinha({ id: 'XX1004', matricula: 'XX1004', lugares: 5, ordem: 3 }),
      criarCarrinha({
        id: 'XX1005',
        matricula: 'XX1005',
        tipo: 'carro',
        marca: 'Marca',
        modelo: 'Ligeiro',
        lugares: 5,
        dormeCasaId: 'casa-o1',
        condutorId: 'p-3',
        ordem: 4,
      }),
    ],
    pessoas: [
      criarPessoa({
        id: 'p-1',
        nomeCurto: 'Zé A.',
        nome: 'José',
        apelidos: 'Amaral',
        numero: '900-001',
        clienteId: 'beta',
        casaId: 'casa-l1',
        carrinhaId: 'XX1001',
      }),
      criarPessoa({
        id: 'p-2',
        nomeCurto: 'Ana B.',
        nome: 'Ana',
        apelidos: 'Barros',
        clienteId: 'alfa',
        casaId: 'casa-l1',
        carrinhaId: 'XX1001',
      }),
      criarPessoa({
        id: 'p-3',
        nomeCurto: 'Rui C.',
        nome: 'Rui',
        apelidos: 'Costa',
        clienteId: 'alfa',
        casaId: 'casa-o1',
        carrinhaId: 'XX1005',
      }),
      criarPessoa({
        id: 'p-4',
        nomeCurto: 'Eva D.',
        nome: 'Eva',
        apelidos: 'Dias',
        clienteId: 'beta',
        casaId: 'casa-a',
        carrinhaId: 'XX1002',
        casaAConfirmar: true,
      }),
      criarPessoa({
        id: 'p-5',
        nomeCurto: 'Luís E.',
        nome: 'Luís',
        apelidos: 'Esteves',
        clienteId: 'alfa',
        casaId: 'casa-a',
        carrinhaId: 'XX1002',
      }),
      criarPessoa({ id: 'p-6', nomeCurto: 'Ivo F.', nome: 'Ivo', apelidos: 'Fonseca', carrinhaId: 'XX1003' }),
      criarPessoa({
        id: 'p-7',
        nomeCurto: 'Óscar G.',
        nome: 'Óscar',
        apelidos: 'Gomes',
        clienteId: 'beta',
        carrinhaAConfirmar: true,
      }),
      criarPessoa({
        id: 'p-8',
        nomeCurto: 'Inês H.',
        nome: 'Inês',
        apelidos: 'Henriques',
        numero: '900-002',
        clienteId: 'alfa',
        casaId: 'casa-m',
      }),
      criarPessoa({ id: 'p-9', nomeCurto: 'Velho I.', clienteId: 'alfa', casaId: 'casa-l2', ativa: false }),
    ].map((p) => ({ ...p, clienteId: p.clienteId === 'cliente-a' ? 'alfa' : p.clienteId })),
  });
}
