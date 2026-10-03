// Dados FICTÍCIOS para os testes da sincronização (nenhum nome, morada ou matrícula real).
// O estado de partida é o que a importação faria destes JSON, mais "edições feitas no programa"
// (condutores, onde dormem, um carro de substituição temporário, senhorio e equipamento) que a
// sincronização não pode mexer.

import { criarEstado, criarObra, criarPessoa } from '../dominio/teste-fabrica';
import type { Estado } from '../dominio/tipos';
import { montarReferencias } from './montar';
import type { DadosReferencia } from './tipos';

export function referenciaFicticia(): DadosReferencia {
  return {
    clientes: [
      {
        id: 'alfa',
        nome: 'Alfa',
        nomeExcel: 'ALFA',
        cor: '#F0C0C0',
        sigla: 'AL',
        interno: false,
        pessoasDoc: null,
      },
      {
        id: 'beta',
        nome: 'Beta',
        nomeExcel: 'BETA',
        cor: '#C0F0C0',
        sigla: 'BE',
        interno: false,
        pessoasDoc: null,
      },
      {
        id: 'gama',
        nome: 'Gama',
        nomeExcel: 'GAMA',
        cor: '#C0C0F0',
        sigla: 'GA',
        interno: true,
        pessoasDoc: null,
      },
    ],
    locais: [
      {
        id: 'rua-a',
        tipo: 'casa',
        nome: 'Rua A',
        morada: '1 Rua Fictícia, L-0000 Lugar A',
        pais: 'LU',
        lat: 49.6,
        lng: 6.1,
      },
      {
        id: 'parque',
        tipo: 'estacionamento',
        nome: 'Parque',
        morada: '2 Rua Fictícia, L-0000 Lugar B',
        pais: 'LU',
        lat: 49.5,
        lng: 6.0,
      },
    ],
    casas: [
      {
        id: 'casa-um',
        nome: 'Casa Um',
        nomeExcel: 'Casa Um',
        localId: 'rua-a',
        apartamento: null,
        lotacao: 4,
        moradoresDoc: null,
        maxContrato: 4,
        tolerado: null,
        notaContrato: null,
      },
      {
        id: 'casa-dois',
        nome: 'Casa Dois',
        nomeExcel: 'Casa Dois',
        localId: 'rua-a',
        apartamento: 'Ap. 2',
        lotacao: 3,
        moradoresDoc: null,
        maxContrato: null,
        tolerado: null,
        notaContrato: null,
        sempreCheia: true,
      },
      {
        id: 'casa-tres',
        nome: 'Casa Três',
        nomeExcel: 'Casa Tres',
        localId: 'rua-a',
        apartamento: null,
        lotacao: 2,
        moradoresDoc: null,
        maxContrato: null,
        tolerado: null,
        notaContrato: null,
      },
    ],
    carrinhas: [
      {
        id: 'ZZ1001',
        matricula: 'ZZ1001',
        matriculasAlternativas: [],
        tipo: 'carrinha',
        marca: 'Marca A',
        modelo: 'Modelo A',
        lugares: 9,
        pessoasDoc: null,
        nota: null,
      },
      {
        id: 'ZZ1002',
        matricula: 'ZZ1002',
        matriculasAlternativas: ['QQ9002'],
        tipo: 'carrinha',
        marca: null,
        modelo: null,
        lugares: 5,
        pessoasDoc: null,
        nota: 'Nota fictícia.',
      },
      {
        id: 'ZZ1003',
        matricula: 'ZZ1003',
        matriculasAlternativas: [],
        tipo: 'carro',
        marca: 'Marca C',
        modelo: 'Modelo C',
        lugares: 5,
        pessoasDoc: null,
        nota: null,
      },
    ],
  };
}

/**
 * O estado que a base de dados teria depois de importar `dados` e de algumas edições no programa:
 * ZZ1001 conduzida pela Ana e a dormir na Casa Três (sem moradores); ZZ1002 conduzida pelo Rui e a dormir
 * no Parque; o carro de substituição ZZ1008 (temporário, criado no programa: não está nos JSON) conduzido
 * pela Gil e a dormir no Parque; a Casa Um com senhorio e equipamento; uma obra do cliente Alfa.
 * Na ZZ1002 vão o Rui e a Eva (já "a confirmar"); na ZZ1008 vai a Gil.
 */
export function estadoFicticio(dados: DadosReferencia = referenciaFicticia()): Estado {
  const { referencias } = montarReferencias(dados);
  return criarEstado({
    versao: 2,
    clientes: referencias.clientes,
    locais: referencias.locais,
    casas: referencias.casas.map((c) =>
      c.id === 'casa-um' ? { ...c, senhorio: 'Senhorio Fictício', equipamento: 'Máquina de lavar' } : c,
    ),
    carrinhas: [
      ...referencias.carrinhas.map((c) => {
        if (c.id === 'ZZ1001') return { ...c, condutorId: 'p-ana', dormeCasaId: 'casa-tres' };
        if (c.id === 'ZZ1002') return { ...c, condutorId: 'p-rui', dormeLocalId: 'parque' };
        return c;
      }),
      {
        id: 'ZZ1008',
        matricula: 'ZZ1008',
        matriculasAlternativas: [],
        tipo: 'carro',
        marca: 'Marca S',
        modelo: null,
        lugares: 5,
        dormeCasaId: null,
        dormeLocalId: 'parque',
        temporaria: true,
        condutorId: 'p-gil',
        nota: 'Carro de substituição fictício.',
        ordem: 3,
      },
    ],
    obras: [criarObra({ id: 'obra-a', nome: 'Obra Fictícia', clienteId: 'alfa', localId: 'parque' })],
    pessoas: [
      criarPessoa({
        id: 'p-ana',
        nomeCurto: 'Ana Fictícia',
        clienteId: 'alfa',
        casaId: 'casa-um',
        carrinhaId: 'ZZ1001',
      }),
      criarPessoa({
        id: 'p-rui',
        nomeCurto: 'Rui Fictício',
        clienteId: 'alfa',
        casaId: 'casa-um',
        carrinhaId: 'ZZ1002',
      }),
      criarPessoa({
        id: 'p-eva',
        nomeCurto: 'Eva Fictícia',
        clienteId: 'beta',
        casaId: 'casa-dois',
        carrinhaId: 'ZZ1002',
        carrinhaAConfirmar: true,
      }),
      criarPessoa({
        id: 'p-gil',
        nomeCurto: 'Gil Fictício',
        clienteId: 'beta',
        casaId: 'casa-dois',
        carrinhaId: 'ZZ1008',
      }),
    ],
  });
}
