import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inserirDadosFicticios, inserirLotes } from './dados-de-teste';
import { abrirBd, type Bd } from './db/ligacao';
import { carregarEstado, contarPessoas, lerVersao, listaDeTextos } from './estado';

const AGORA = new Date('2026-10-03T08:30:00.000Z');

let bd: Bd;

beforeEach(() => {
  bd = abrirBd(':memory:');
});

afterEach(() => {
  bd.$client.close();
});

describe('carregarEstado', () => {
  it('com a base de dados vazia devolve listas vazias e versão 0', () => {
    expect(carregarEstado(bd, AGORA)).toStrictEqual({
      versao: 0,
      geradoEm: '2026-10-03T08:30:00.000Z',
      clientes: [],
      locais: [],
      casas: [],
      carrinhas: [],
      obras: [],
      pessoas: [],
      indisponibilidades: [],
      problemas: [],
    });
  });

  it('usa a hora atual quando não se indica outra', () => {
    const antes = Date.now();
    const { geradoEm } = carregarEstado(bd);
    expect(geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(geradoEm)).toBeGreaterThanOrEqual(antes);
  });

  it('a versão é o maior id de lote', () => {
    inserirLotes(bd, 3);
    expect(carregarEstado(bd, AGORA).versao).toBe(3);
    expect(lerVersao(bd)).toBe(3);
  });

  it('converte booleanos, listas JSON e nulls para os tipos do domínio', () => {
    inserirDadosFicticios(bd);
    const estado = carregarEstado(bd, AGORA);

    const ze = estado.pessoas.find((p) => p.id === 'p-ze');
    expect(ze).toStrictEqual({
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
      casaAConfirmar: false,
      carrinhaAConfirmar: false,
      telefone: '000000000',
      temCarta: true,
      cartaValidade: '2030-01-31',
      ativa: true,
    });

    const alvaro = estado.pessoas.find((p) => p.id === 'p-alvaro');
    expect(alvaro).toMatchObject({
      numero: null,
      numeroOriginal: null,
      nomesAlternativos: [],
      obraId: null,
      casaId: null,
      carrinhaId: null,
      casaAConfirmar: true,
      carrinhaAConfirmar: true,
      telefone: null,
      temCarta: false,
      cartaValidade: null,
      ativa: true,
    });
    expect(estado.pessoas.find((p) => p.id === 'p-bruno')).toMatchObject({ ativa: false, temCarta: null });

    expect(estado.clientes.map((c) => [c.id, c.interno])).toStrictEqual([
      ['cli-alfa', false],
      ['cli-beta', false],
      ['cli-interno', true],
    ]);

    expect(estado.locais.find((l) => l.id === 'loc-parque')).toStrictEqual({
      id: 'loc-parque',
      tipo: 'estacionamento',
      nome: 'Parque',
      morada: 'Rua Fictícia 3',
      pais: 'LU',
      lat: null,
      lng: null,
      raioM: 80,
    });
    expect(estado.locais.find((l) => l.id === 'loc-casas')?.raioM).toBe(150);

    expect(estado.casas.find((c) => c.id === 'casa-monte')).toStrictEqual({
      id: 'casa-monte',
      nome: 'Casa Monte',
      localId: 'loc-casas',
      apartamento: null,
      lotacao: 4,
      maxContrato: null,
      tolerado: null,
      notaContrato: null,
      senhorio: null,
      equipamento: null,
      sempreCheia: false,
      ordem: 1,
    });
    expect(estado.casas.find((c) => c.id === 'casa-ribeira')).toMatchObject({ maxContrato: 6, tolerado: 8 });

    expect(estado.carrinhas).toStrictEqual([
      {
        id: 'car-1',
        matricula: 'ZZ0001',
        tipo: 'carro',
        marca: null,
        matriculasAlternativas: [],
        modelo: null,
        lugares: 5,
        dormeCasaId: null,
        dormeLocalId: 'loc-parque',
        temporaria: false,
        condutorId: null,
        nota: null,
        ordem: 1,
      },
      {
        id: 'car-2',
        matricula: 'ZZ0002',
        tipo: 'carrinha',
        marca: 'Marca Fictícia',
        matriculasAlternativas: ['ZZ9999'],
        modelo: 'Carrinha Modelo',
        lugares: 9,
        dormeCasaId: 'casa-monte',
        dormeLocalId: null,
        temporaria: true,
        condutorId: null,
        nota: 'Substituição',
        ordem: 2,
      },
    ]);

    expect(estado.obras).toStrictEqual([
      {
        id: 'obra-vale',
        nome: 'Obra do Vale',
        clienteId: 'cli-alfa',
        localId: 'loc-obra',
        estacionamentoLocalId: null,
        origem: 'manual',
      },
    ]);
  });

  it('lê o condutor da carrinha e as casas que contam sempre como cheias', () => {
    inserirDadosFicticios(bd);
    bd.$client.prepare("UPDATE carrinhas SET condutor_id = 'p-ze' WHERE id = 'car-2'").run();
    bd.$client.prepare("UPDATE casas SET sempre_cheia = 1 WHERE id = 'casa-monte'").run();
    const estado = carregarEstado(bd);
    expect(estado.carrinhas.map((c) => [c.id, c.condutorId])).toStrictEqual([
      ['car-1', null],
      ['car-2', 'p-ze'],
    ]);
    expect(estado.casas.map((c) => [c.id, c.sempreCheia])).toStrictEqual([
      ['casa-monte', true],
      ['casa-ribeira', false],
    ]);
  });

  it('um tipo de veículo desconhecido (escrito à mão na base de dados) conta como carrinha', () => {
    inserirDadosFicticios(bd);
    bd.$client.prepare("UPDATE carrinhas SET tipo = 'mota' WHERE id = 'car-1'").run();
    expect(carregarEstado(bd).carrinhas.map((c) => [c.id, c.tipo])).toStrictEqual([
      ['car-1', 'carrinha'],
      ['car-2', 'carrinha'],
    ]);
  });

  it('o condutor tem de ser uma pessoa que existe (chave estrangeira)', () => {
    inserirDadosFicticios(bd);
    expect(() =>
      bd.$client.prepare("UPDATE carrinhas SET condutor_id = 'p-nada' WHERE id = 'car-2'").run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('ordena clientes, casas e carrinhas por ordem, locais por id e pessoas por nome curto', () => {
    inserirDadosFicticios(bd);
    const estado = carregarEstado(bd, AGORA);
    expect(estado.clientes.map((c) => c.id)).toStrictEqual(['cli-alfa', 'cli-beta', 'cli-interno']);
    expect(estado.casas.map((c) => c.id)).toStrictEqual(['casa-monte', 'casa-ribeira']);
    expect(estado.carrinhas.map((c) => c.id)).toStrictEqual(['car-1', 'car-2']);
    expect(estado.locais.map((l) => l.id)).toStrictEqual(['loc-casas', 'loc-obra', 'loc-parque']);
    // Com acentos: "Álvaro" vem antes de "Bruno" e "Élia" antes de "Zé" (não pela tabela Unicode).
    expect(estado.pessoas.map((p) => p.nomeCurto)).toStrictEqual([
      'Álvaro Exemplo',
      'Bruno Fictício',
      'Élia Modelo',
      'Zé Teste',
    ]);
  });

  it('com a mesma ordem, desempata pelo nome', () => {
    inserirDadosFicticios(bd);
    bd.$client.prepare('UPDATE casas SET ordem = 0').run();
    expect(carregarEstado(bd, AGORA).casas.map((c) => c.nome)).toStrictEqual(['Casa Monte', 'Casa Ribeira']);
  });

  it('listas JSON estragadas na base de dados viram listas vazias', () => {
    inserirDadosFicticios(bd);
    bd.$client.prepare("UPDATE pessoas SET nomes_alternativos = 'null'").run();
    bd.$client.prepare(`UPDATE carrinhas SET matriculas_alternativas = '["ZZ1", 2, null]'`).run();
    const estado = carregarEstado(bd, AGORA);
    expect(
      estado.pessoas.every((p) => Array.isArray(p.nomesAlternativos) && p.nomesAlternativos.length === 0),
    ).toBe(true);
    expect(estado.carrinhas.map((c) => c.matriculasAlternativas)).toStrictEqual([['ZZ1'], ['ZZ1']]);
  });

  it('texto que não é JSON numa lista não impede a leitura do estado', () => {
    inserirDadosFicticios(bd);
    bd.$client.prepare("UPDATE pessoas SET nomes_alternativos = 'José Teste' WHERE id = 'p-ze'").run();
    bd.$client.prepare("UPDATE carrinhas SET matriculas_alternativas = 'ZZ9999' WHERE id = 'car-2'").run();
    const estado = carregarEstado(bd, AGORA);
    expect(estado.pessoas).toHaveLength(4);
    expect(estado.pessoas.find((p) => p.id === 'p-ze')?.nomesAlternativos).toStrictEqual([]);
    expect(estado.carrinhas.find((c) => c.id === 'car-2')?.matriculasAlternativas).toStrictEqual([]);
  });
});

describe('contarPessoas', () => {
  it('conta todas as pessoas, ativas ou não', () => {
    expect(contarPessoas(bd)).toBe(0);
    inserirDadosFicticios(bd);
    expect(contarPessoas(bd)).toBe(4);
  });
});

describe('listaDeTextos', () => {
  it('aceita listas e texto JSON e ignora o resto', () => {
    expect(listaDeTextos(['a', 'b'])).toStrictEqual(['a', 'b']);
    expect(listaDeTextos('["a"]')).toStrictEqual(['a']);
    expect(listaDeTextos('não é JSON')).toStrictEqual([]);
    expect(listaDeTextos(null)).toStrictEqual([]);
    expect(listaDeTextos({ a: 1 })).toStrictEqual([]);
    expect(listaDeTextos(['a', 1, null])).toStrictEqual(['a']);
  });
});
