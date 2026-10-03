// Dados FICTÍCIOS para os testes da importação (nenhum nome real).

import { indiceColuna } from './celulas';
import type { DadosIniciais } from './tipos';

/** Constrói uma folha (unknown[][]) a partir de células em notação A1: { B3: 'Casa', C17: 4 }. */
export function folha(celulas: Record<string, unknown>): unknown[][] {
  const linhas: unknown[][] = [];
  for (const [ref, valor] of Object.entries(celulas)) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) throw new Error(`Referência inválida: ${ref}`);
    const i = Number(m[2]) - 1;
    const j = indiceColuna(m[1] as string);
    while (linhas.length <= i) linhas.push([]);
    const linha = linhas[i] as unknown[];
    while (linha.length <= j) linha.push(null);
    linha[j] = valor;
  }
  return linhas.map((l) => [...l]);
}

export function dadosFicticios(): DadosIniciais {
  return {
    clientes: [
      {
        id: 'alfa',
        nome: 'Alfa',
        nomeExcel: 'ALFA',
        cor: '#111111',
        sigla: 'AL',
        interno: false,
        pessoasDoc: 4,
      },
      {
        id: 'beta',
        nome: 'Bêta',
        nomeExcel: 'BÊTA',
        nomesAlternativos: ['NÃO PRODUTIVOS'],
        cor: '#222222',
        sigla: 'BE',
        interno: true,
        pessoasDoc: 2,
      },
    ],
    locais: [
      {
        id: 'local-a',
        tipo: 'casa',
        nome: 'Local A',
        morada: '1 Rua Fictícia',
        pais: 'LU',
        lat: 49.6,
        lng: 6.1,
      },
      {
        id: 'parque',
        tipo: 'estacionamento',
        nome: 'Parque',
        morada: '2 Rua Fictícia',
        pais: 'LU',
        lat: 49.5,
        lng: 6.0,
      },
    ],
    casas: [
      {
        id: 'casa-1-foret',
        nome: 'Casa 1 Rue de la Forêt',
        nomeExcel: 'Casa 1 Rue de la Foret',
        localId: 'local-a',
        apartamento: null,
        lotacao: 2,
        moradoresDoc: 1,
        maxContrato: 1,
        tolerado: null,
        notaContrato: null,
      },
      {
        id: 'casa-b',
        nome: 'Casa B',
        nomeExcel: 'Casa B',
        localId: 'local-a',
        apartamento: 'Ap. 1',
        lotacao: 4,
        moradoresDoc: 2,
        maxContrato: null,
        tolerado: null,
        notaContrato: null,
      },
    ],
    carrinhas: [
      {
        id: 'AA1111',
        matricula: 'AA1111',
        matriculasAlternativas: ['ZZ9999'],
        modelo: 'Modelo X',
        lugares: 5,
        pessoasDoc: 2,
        nota: null,
      },
      {
        id: 'BB2222',
        matricula: 'BB2222',
        matriculasAlternativas: [],
        modelo: null,
        lugares: 9,
        pessoasDoc: 1,
        nota: null,
      },
      {
        id: 'CC3333',
        matricula: 'CC3333',
        matriculasAlternativas: [],
        modelo: null,
        lugares: 5,
        pessoasDoc: 0,
        nota: 'Nova.',
      },
    ],
    importacao: {
      ficheiroListaMestra: 'lista.xlsx',
      folhaPessoal: 'Pessoal',
      folhaExtra: 'Não estão na lista',
      extrasAIncluir: ['Ana Extra'],
      ficheiroMichael: 'michael.xlsx',
      valoresEspeciais: { foraDasCasas: 'Fora das casas CMF', semTransporte: 'Sem transporte da empresa' },
      nomesAlternativos: { 'Rui Teste': ['Rui Outro'] },
      aliasesMichael: { 'Ruy Teste': 'Rui Teste' },
    },
  };
}

export const CABECALHO_PESSOAL = [
  'Nº',
  'Apelidos',
  'Nome',
  'Nome no mapa',
  'Cliente',
  'Casa',
  'Carrinha',
  'Observações',
];

/** Folha "Pessoal" fictícia: cobre valores especiais, vazios, Nº com espaços e sufixos, desconhecidos. */
export function folhaPessoalFicticia(): unknown[][] {
  return [
    CABECALHO_PESSOAL,
    ['900-001', 'Silva Teste', 'João', 'João Teste', 'ALFA', 'Casa 1 Rue de la Foret', 'AA1111', null],
    ['900-001_2', 'Costa Teste', 'Maria', 'Maria Teste', 'ALFA', 'Casa B', 'ZZ9999', null],
    [
      '900- 002_3',
      'Pinto',
      'Rui',
      'Rui Teste',
      'BÊTA',
      'Fora das casas CMF',
      'Sem transporte da empresa',
      null,
    ],
    [null, 'Sousa', 'Pedro', 'Pedro Teste', 'ALFA', null, null, 'sem dados'],
    ['900-003', 'Lima', 'Zé', 'Zé Teste', 'ALFA', 'Casa Inexistente', 'XX0000', null],
    [null, null, null, null, null, null, null, null],
  ];
}

export function folhaExtraFicticia(): unknown[][] {
  return [
    ['Nome no Excel', 'Cliente', 'Casa', 'Carrinha', 'Observações'],
    ['Ana Extra', 'BÊTA', 'Casa B', 'BB2222', null],
    ['Bruno Fora', 'ALFA', null, 'AA1111', 'fica de fora'],
  ];
}

/** Ficheiro do Michael fictício, com a mesma disposição do real (cabeçalhos na linha 3, salmão em F24). */
export function michaelFicticio(): Map<string, unknown[][]> {
  const casas = folha({
    B2: 'CMF SARL - CASAS',
    E2: 'FORA CASAS CMF',
    B3: 'Casa 1 Rue de la Foret',
    C3: 'Casa B',
    B4: 'João Teste ',
    C4: 'Maria Teste',
    C5: 'Ana Extra',
    C6: '   ',
    E4: 'Rui Teste',
    F4: 'Pedro Teste',
    E5: 'Joao Teste',
    B10: 1,
    C10: 3,
    E10: 1,
    F10: 1,
    G10: 0,
    B12: 7,
    C22: 'ALFA',
    D22: 4,
    F24: 'Zé Teste',
    F25: 'Bruno Fora',
  });
  const empresas = folha({
    B2: 'CMF SARL - CLIENTES',
    B3: 'ALFA',
    C3: 'BÊTA',
    D3: 'GAMA',
    B4: 'João Teste',
    B5: 'Mariia Teste',
    B6: 'Pedro Teste',
    B7: 'Bruno Fora',
    C4: 'Ruy Teste',
    C5: 'Ana Extra',
    C6: 'Zé Teste',
    D4: 'Carla Nova',
    B9: 4,
    C9: 3,
    D9: 1,
  });
  const viaturas = folha({
    B2: 'CMF SARL - VIATURAS',
    B3: 'AA1111',
    C3: 'BB2222',
    D3: 'QQ0000',
    B4: 'João Teste',
    B5: 'Rui Outro',
    C4: 'Ana Extra',
    D4: 'Pedro Teste',
    B8: 2,
    C8: 1,
    D8: 1,
    B11: 'SEM TRANSPORTE DA EMPRESA!',
    B12: 'Rui Teste',
    C12: 'Zé Teste',
    B14: 1,
    C14: 1,
  });
  return new Map([
    ['CMF Sarl-CASAS APÓS CONGÉ', casas],
    ['CMF Sarl - EMPRESAS', empresas],
    ['CMF Sarl - VIATURAS', viaturas],
  ]);
}
