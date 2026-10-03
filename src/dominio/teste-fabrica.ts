// Fábrica de estados de teste, só com dados FICTÍCIOS. Partilhada pelos testes de todos os módulos.
// Cada criarX() devolve um objeto completo com valores por omissão; passa só o que interessa ao teste.
// Não usar fora dos testes.

import type { Carrinha, Casa, Cliente, Estado, Local, Obra, Pessoa } from './tipos';

let contador = 0;
function proximo(prefixo: string): string {
  contador += 1;
  return `${prefixo}-${contador}`;
}

export function criarCliente(parcial: Partial<Cliente> = {}): Cliente {
  const id = parcial.id ?? proximo('cliente');
  return { id, nome: `Cliente ${id}`, cor: '#c0c0c0', sigla: 'XX', interno: false, ordem: 0, ...parcial };
}

export function criarLocal(parcial: Partial<Local> = {}): Local {
  const id = parcial.id ?? proximo('local');
  return {
    id,
    tipo: 'casa',
    nome: `Local ${id}`,
    morada: `1 Rue Fictícia, L-0000 Lugar ${id}`,
    pais: 'LU',
    lat: 49.6,
    lng: 6.1,
    raioM: 150,
    ...parcial,
  };
}

export function criarCasa(parcial: Partial<Casa> = {}): Casa {
  const id = parcial.id ?? proximo('casa');
  return {
    id,
    nome: `Casa ${id}`,
    localId: 'local-a',
    apartamento: null,
    lotacao: 4,
    maxContrato: null,
    tolerado: null,
    notaContrato: null,
    senhorio: null,
    equipamento: null,
    ordem: 0,
    ...parcial,
  };
}

export function criarCarrinha(parcial: Partial<Carrinha> = {}): Carrinha {
  const id = parcial.id ?? proximo('carrinha');
  return {
    id,
    matricula: id.toUpperCase(),
    matriculasAlternativas: [],
    modelo: null,
    lugares: 9,
    dormeCasaId: null,
    dormeLocalId: null,
    temporaria: false,
    nota: null,
    ordem: 0,
    ...parcial,
  };
}

export function criarObra(parcial: Partial<Obra> = {}): Obra {
  const id = parcial.id ?? proximo('obra');
  return {
    id,
    nome: `Obra ${id}`,
    clienteId: 'cliente-a',
    localId: 'local-obra',
    estacionamentoLocalId: null,
    origem: 'manual',
    ...parcial,
  };
}

export function criarPessoa(parcial: Partial<Pessoa> = {}): Pessoa {
  const id = parcial.id ?? proximo('pessoa');
  return {
    id,
    numero: null,
    numeroOriginal: null,
    apelidos: 'Fictício',
    nome: `Pessoa ${id}`,
    nomeCurto: parcial.nomeCurto ?? `Pessoa ${id}`,
    nomesAlternativos: [],
    clienteId: 'cliente-a',
    obraId: null,
    casaId: null,
    carrinhaId: null,
    casaAConfirmar: false,
    carrinhaAConfirmar: false,
    telefone: null,
    temCarta: null,
    cartaValidade: null,
    ativa: true,
    ...parcial,
  };
}

export function criarEstado(parcial: Partial<Estado> = {}): Estado {
  return {
    versao: 1,
    geradoEm: '2026-01-01T00:00:00.000Z',
    clientes: [],
    locais: [],
    casas: [],
    carrinhas: [],
    obras: [],
    pessoas: [],
    ...parcial,
  };
}

/**
 * Um cenário pequeno e conhecido, para testes que precisam de "um bocadinho de tudo":
 * 3 clientes, 2 moradas (uma com 2 casas), 3 casas, 3 carrinhas, 2 obras, 9 pessoas (1 inativa).
 */
export function estadoExemplo(): Estado {
  return criarEstado({
    clientes: [
      criarCliente({ id: 'cliente-a', nome: 'Alfa Construções', cor: '#ED7D31', sigla: 'AL', ordem: 1 }),
      criarCliente({ id: 'cliente-b', nome: 'Beta Obras', cor: '#808080', sigla: 'BE', ordem: 2 }),
      criarCliente({
        id: 'cliente-i',
        nome: 'Interno',
        cor: '#00B0F0',
        sigla: 'IN',
        interno: true,
        ordem: 3,
      }),
    ],
    locais: [
      criarLocal({ id: 'local-a', nome: 'Morada A' }),
      criarLocal({ id: 'local-b', nome: 'Morada B' }),
      criarLocal({ id: 'local-obra', tipo: 'obra', nome: 'Estaleiro' }),
      criarLocal({ id: 'local-parque', tipo: 'estacionamento', nome: 'Parque' }),
    ],
    casas: [
      criarCasa({
        id: 'casa-1',
        nome: 'Casa Um',
        localId: 'local-a',
        lotacao: 3,
        maxContrato: 2,
        tolerado: 3,
        ordem: 1,
      }),
      criarCasa({ id: 'casa-2', nome: 'Casa Dois', localId: 'local-a', lotacao: 2, ordem: 2 }),
      criarCasa({
        id: 'casa-3',
        nome: 'Casa Três',
        localId: 'local-b',
        lotacao: 4,
        maxContrato: 6,
        ordem: 3,
      }),
    ],
    carrinhas: [
      criarCarrinha({ id: 'zz1001', matricula: 'ZZ1001', lugares: 5, ordem: 1 }),
      criarCarrinha({
        id: 'zz1002',
        matricula: 'ZZ1002',
        lugares: 2,
        dormeLocalId: 'local-parque',
        ordem: 2,
      }),
      criarCarrinha({
        id: 'zz1003',
        matricula: 'ZZ1003',
        lugares: 9,
        matriculasAlternativas: ['QQ9999'],
        ordem: 3,
      }),
    ],
    obras: [
      criarObra({ id: 'obra-b', nome: 'Obra Beta', clienteId: 'cliente-b' }),
      criarObra({ id: 'obra-a', nome: 'Obra Alfa', clienteId: 'cliente-a' }),
    ],
    pessoas: [
      // casa-1: 3 moradores (cheia; acima do máximo 2, dentro do tolerado 3)
      criarPessoa({
        id: 'p-ana',
        nomeCurto: 'Ana T.',
        nome: 'Ana',
        apelidos: 'Teste',
        casaId: 'casa-1',
        carrinhaId: 'zz1001',
        obraId: 'obra-b',
      }),
      criarPessoa({
        id: 'p-bruno',
        nomeCurto: 'Bruno E.',
        nome: 'Bruno',
        apelidos: 'Exemplo',
        casaId: 'casa-1',
        carrinhaId: 'zz1001',
      }),
      criarPessoa({
        id: 'p-celia',
        nomeCurto: 'Célia F.',
        nome: 'Célia',
        apelidos: 'Fictícia',
        casaId: 'casa-1',
        carrinhaId: 'zz1002',
        clienteId: 'cliente-b',
      }),
      // casa-2: 3 moradores para 2 lugares (excesso)
      criarPessoa({
        id: 'p-duarte',
        nomeCurto: 'Duarte S.',
        nome: 'Duarte',
        apelidos: 'Simulado',
        casaId: 'casa-2',
        carrinhaId: 'zz1002',
        carrinhaAConfirmar: true,
      }),
      criarPessoa({
        id: 'p-elsa',
        nomeCurto: 'Elsa I.',
        nome: 'Elsa',
        apelidos: 'Inventada',
        casaId: 'casa-2',
        clienteId: 'cliente-i',
      }),
      criarPessoa({
        id: 'p-filipe',
        nomeCurto: 'Filipe Q.',
        nome: 'Filipe',
        apelidos: 'Qualquer',
        casaId: 'casa-2',
        carrinhaId: 'zz1001',
        obraId: 'obra-a',
        clienteId: 'cliente-b',
      }),
      // casa-3: vazia. Fora das casas: 2 ativas + 1 inativa
      criarPessoa({
        id: 'p-gil',
        nomeCurto: 'Gil N.',
        nome: 'Gil',
        apelidos: 'Ninguém',
        carrinhaId: 'zz1001',
        casaAConfirmar: true,
        obraId: 'obra-b',
      }),
      criarPessoa({
        id: 'p-helena',
        nomeCurto: 'Helena Z.',
        nome: 'Helena',
        apelidos: 'Zero',
        clienteId: 'cliente-b',
      }),
      criarPessoa({
        id: 'p-ivo',
        nomeCurto: 'Ivo X.',
        nome: 'Ivo',
        apelidos: 'Xis',
        casaId: 'casa-3',
        carrinhaId: 'zz1003',
        ativa: false,
        casaAConfirmar: true,
      }),
    ],
  });
}

/** Gerador pseudo-aleatório com semente (mulberry32): os testes ficam reprodutíveis. */
export function aleatorioComSemente(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Estado aleatório (mas reprodutível) com casos limite misturados: pessoas inativas, ids que não existem,
 * casas e carrinhas com 0 lugares, contratos null, tolerado abaixo do máximo, carrinhas com onde dormir.
 * Serve para verificar invariantes (somas, contagens) em muitos estados diferentes.
 */
export function estadoAleatorio(semente: number): Estado {
  const r = aleatorioComSemente(semente);
  const inteiro = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(r() * lista.length)] as T;
  const talvez = <T>(valor: T, prob = 0.5): T | null => (r() < prob ? valor : null);

  const clientes = Array.from({ length: inteiro(1, 4) }, (_, i) =>
    criarCliente({ id: `cl${i}`, cor: escolher(['#ED7D31', '#808080', '#B4C6E7', '#00B0F0']), ordem: i }),
  );
  const locais = Array.from({ length: inteiro(1, 3) }, (_, i) => criarLocal({ id: `lo${i}` }));
  const casas = Array.from({ length: inteiro(0, 6) }, (_, i) =>
    criarCasa({
      id: `ca${i}`,
      nome: `Casa ${i}`,
      localId: escolher(locais).id,
      lotacao: inteiro(0, 6),
      maxContrato: talvez(inteiro(0, 6), 0.7),
      tolerado: talvez(inteiro(0, 8), 0.5),
      ordem: inteiro(0, 3),
    }),
  );
  const carrinhas = Array.from({ length: inteiro(0, 5) }, (_, i) =>
    criarCarrinha({
      id: `cr${i}`,
      matricula: `ZZ${1000 + i}`,
      lugares: inteiro(0, 9),
      dormeCasaId: casas.length > 0 ? talvez(escolher(casas).id, 0.3) : null,
      dormeLocalId: talvez(escolher(locais).id, 0.2),
    }),
  );
  const obras = Array.from({ length: inteiro(0, 3) }, (_, i) =>
    criarObra({ id: `ob${i}`, clienteId: escolher(clientes).id, localId: escolher(locais).id }),
  );
  const idsCasa = [null, 'casa-inexistente', ...casas.map((c) => c.id)];
  const idsCarrinha = [null, 'carrinha-inexistente', ...carrinhas.map((c) => c.id)];
  const idsObra = [null, 'obra-inexistente', ...obras.map((o) => o.id)];
  const pessoas = Array.from({ length: inteiro(0, 30) }, (_, i) =>
    criarPessoa({
      id: `pe${i}`,
      nomeCurto: `Pessoa ${String(i).padStart(2, '0')}`,
      numero: talvez(`999-${String(i).padStart(3, '0')}`),
      clienteId: escolher(clientes).id,
      obraId: escolher(idsObra),
      casaId: escolher(idsCasa),
      carrinhaId: escolher(idsCarrinha),
      casaAConfirmar: r() < 0.2,
      carrinhaAConfirmar: r() < 0.2,
      ativa: r() < 0.85,
    }),
  );
  return criarEstado({ clientes, locais, casas, carrinhas, obras, pessoas });
}
