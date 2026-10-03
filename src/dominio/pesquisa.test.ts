import { describe, expect, it } from 'vitest';
import { indexar } from './indices';
import { compactar, normalizarTexto, pesquisar } from './pesquisa';
import { criarCarrinha, criarCasa, criarEstado, criarPessoa } from './teste-fabrica';
import type { Estado } from './tipos';

function estadoPesquisa(): Estado {
  return criarEstado({
    casas: [
      criarCasa({ id: 'c1', nome: 'Casa 1 Rue des Prés', lotacao: 4 }),
      criarCasa({ id: 'c2', nome: 'Casa 2 Rue des Prés', lotacao: 2 }),
      criarCasa({ id: 'c3', nome: 'Château Fictício', lotacao: 6 }),
    ],
    carrinhas: [
      criarCarrinha({ id: 'v1', matricula: 'ZZ1001', lugares: 9, modelo: 'Carrinha Fictícia' }),
      criarCarrinha({ id: 'v2', matricula: 'ZZ1002', lugares: 5 }),
      criarCarrinha({ id: 'v3', matricula: 'YY2000', lugares: 5, matriculasAlternativas: ['XX9999'] }),
      criarCarrinha({ id: 'v4', matricula: 'AB-123-CD', lugares: 7 }),
    ],
    pessoas: [
      criarPessoa({
        id: 'joao',
        nomeCurto: 'João T.',
        nome: 'João',
        apelidos: 'Testinho Fictício',
        numero: '999-001',
        casaId: 'c1',
        carrinhaId: 'v1',
      }),
      criarPessoa({
        id: 'joana',
        nomeCurto: 'Joana E.',
        nome: 'Joana',
        apelidos: 'Exemplo',
        numero: '999-001_2',
        carrinhaId: 'v1',
      }),
      criarPessoa({
        id: 'estevao',
        nomeCurto: 'Estêvão F.',
        nome: 'Estêvão',
        apelidos: 'Fictício',
        nomesAlternativos: ['Estêvão Outronome'],
        numero: '999-010',
        casaId: 'fantasma',
        carrinhaId: 'fantasma',
      }),
      criarPessoa({ id: 'stefan', nomeCurto: 'Ștefan R.', nome: 'Ștefan', apelidos: 'Țepeș Inventado' }),
      criarPessoa({
        id: 'joaquim',
        nomeCurto: 'Joaquim I.',
        nome: 'Joaquim',
        apelidos: 'Inativo',
        ativa: false,
      }),
    ],
  });
}

function procurar(termo: string, limite?: number, estado = estadoPesquisa()) {
  return pesquisar(estado, indexar(estado), termo, limite);
}
const ids = (termo: string, limite?: number) => procurar(termo, limite).map((r) => r.id);

describe('normalizarTexto e compactar', () => {
  it('tira acentos, passa a minúsculas e normaliza espaços (incluindo tabs e espaço inseparável)', () => {
    expect(normalizarTexto('  João  da\tSILVA ')).toBe('joao da silva');
    expect(normalizarTexto('Ștefan Țepeș Çedilha Ñ Ü')).toBe('stefan tepes cedilha n u');
  });

  it('o mesmo texto em NFC e em NFD dá o mesmo resultado', () => {
    expect(normalizarTexto('Estêvão')).toBe(normalizarTexto('Estêvão'));
  });

  it('compactar tira espaços, hífenes e sublinhados', () => {
    for (const m of ['CF-5001', ' cf 5001 ', 'CF_5001', 'cf5001']) expect(compactar(m)).toBe('cf5001');
    expect(compactar('900-001_2')).toBe('9000012');
  });
});

describe('pesquisar', () => {
  it.each(['', ' ', 'j', ' é ', '--', '_ -'])('termo curto ou sem letras %j: nada', (termo) => {
    expect(procurar(termo)).toEqual([]);
  });

  it('indiferente a acentos e maiúsculas', () => {
    for (const termo of ['joão t.', 'JOAO T.', 'Joao t.', 'joão t.']) {
      expect(procurar(termo)[0]).toMatchObject({ tipo: 'pessoa', id: 'joao', pontuacao: 3 });
    }
    expect(ids('ESTEVAO')).toEqual(['estevao']);
    expect(ids('stefan')).toEqual(['stefan']);
    expect(ids('tepes')).toEqual(['stefan']);
  });

  it('apelidos encontram a pessoa (nome completo vale 0.9)', () => {
    expect(procurar('testinho')).toMatchObject([{ id: 'joao', pontuacao: 0.9 }]);
  });

  it('nomes alternativos encontram a pessoa, com menos peso que o nome principal', () => {
    expect(procurar('outronome')).toMatchObject([{ id: 'estevao', pontuacao: 0.8 }]);
    expect(procurar('estevao')[0]?.pontuacao).toBe(2);
  });

  it('pessoas inativas não aparecem', () => {
    expect(ids('joaquim')).toEqual([]);
  });

  it.each(['zz1001', 'ZZ1001', 'zz 1001', 'ZZ-1001', 'zz_1001', ' Zz - 1001 '])(
    'matrícula com espaços/hífenes %j: igual',
    (termo) => {
      expect(procurar(termo)[0]).toMatchObject({
        tipo: 'carrinha',
        id: 'v1',
        rotulo: 'ZZ1001',
        pontuacao: 3,
      });
    },
  );

  it('matrícula guardada com hífenes (formato francês) encontra-se sem eles', () => {
    expect(procurar('ab123cd')[0]).toMatchObject({ id: 'v4', pontuacao: 3 });
    expect(procurar('ab 123')[0]).toMatchObject({ id: 'v4', pontuacao: 2 });
  });

  it('parte da matrícula: começa por (2) ou contém com 3+ caracteres (0.5)', () => {
    expect(procurar('zz10').map((r) => [r.id, r.pontuacao])).toEqual([
      ['v1', 2],
      ['v2', 2],
    ]);
    expect(procurar('1001')).toMatchObject([{ id: 'v1', pontuacao: 0.5 }]);
    expect(procurar('10')).toEqual([]);
  });

  it('matrícula alternativa encontra a carrinha, com o rótulo da matrícula principal', () => {
    expect(procurar('XX9999')).toMatchObject([
      { tipo: 'carrinha', id: 'v3', rotulo: 'YY2000', pontuacao: 2.7 },
    ]);
    expect(procurar('xx-9999')[0]?.id).toBe('v3');
    expect(procurar('YY2000')[0]?.pontuacao).toBe(3);
  });

  it('Nº com sufixo: "999-001" dá primeiro o exato e depois o _2; "999-001_2" só dá o _2', () => {
    expect(procurar('999-001').map((r) => [r.id, r.pontuacao])).toEqual([
      ['joao', 3],
      ['joana', 2],
    ]);
    expect(procurar('999-001_2').map((r) => [r.id, r.pontuacao])).toEqual([['joana', 3]]);
    expect(procurar('999 001 2').map((r) => r.id)).toEqual(['joana']);
    expect(procurar('999001').map((r) => r.id)).toEqual(['joao', 'joana']);
    expect(ids('999-01')).toEqual(['estevao']);
  });

  it('casas por nome, sem acentos, por palavra', () => {
    expect(procurar('pres').map((r) => [r.id, r.pontuacao])).toEqual([
      ['c1', 1],
      ['c2', 1],
    ]);
    expect(procurar('chateau')).toMatchObject([
      { tipo: 'casa', id: 'c3', pontuacao: 2, detalhe: '0/6 lugares' },
    ]);
  });

  it('detalhe: casa e carrinha da pessoa; caixas quando não tem; "?" quando o id não existe', () => {
    expect(procurar('joão t.')[0]?.detalhe).toBe('Casa 1 Rue des Prés · ZZ1001');
    expect(procurar('stefan')[0]?.detalhe).toBe('Fora das casas CMF · sem transporte');
    expect(procurar('estevao')[0]?.detalhe).toBe('? · ?');
    expect(procurar('zz1001')[0]?.detalhe).toBe('2/9 lugares · Carrinha Fictícia');
    expect(procurar('zz1002')[0]?.detalhe).toBe('0/5 lugares');
  });

  it('ordenação: pontuação descendente e, no empate, rótulo em português (acentos não baralham)', () => {
    expect(procurar('jo').map((r) => r.rotulo)).toEqual(['Joana E.', 'João T.']);
    // A pontuação ganha ao alfabeto: a casa (palavra do nome, 1) vem antes das pessoas (apelido, 0.9).
    expect(procurar('fic').map((r) => [r.rotulo, r.pontuacao])).toEqual([
      ['Château Fictício', 1],
      ['Estêvão F.', 0.9],
      ['João T.', 0.9],
    ]);
  });

  it('limite: por omissão 8; respeita 1 e 0', () => {
    const estado = criarEstado({
      carrinhas: Array.from({ length: 12 }, (_, i) =>
        criarCarrinha({ id: `v${i}`, matricula: `ZZ${String(i).padStart(2, '0')}` }),
      ),
    });
    expect(procurar('zz', undefined, estado)).toHaveLength(8);
    expect(procurar('zz', 1, estado).map((r) => r.rotulo)).toEqual(['ZZ00']);
    expect(procurar('zz', 0, estado)).toEqual([]);
    expect(procurar('zz', 100, estado)).toHaveLength(12);
  });

  it('resultado estável: não depende da ordem das listas no estado', () => {
    const estado = estadoPesquisa();
    const baralhado: Estado = {
      ...estado,
      pessoas: estado.pessoas.toReversed(),
      carrinhas: estado.carrinhas.toReversed(),
      casas: estado.casas.toReversed(),
    };
    for (const termo of ['jo', 'zz', '999', 'casa', 'fic', 'es']) {
      expect(procurar(termo, 20, baralhado)).toEqual(procurar(termo, 20, estado));
    }
  });

  it('pontuações sempre por ordem não crescente e entre 0 e 3', () => {
    for (const termo of ['jo', 'zz', '999', 'casa', 'fic', 'es', 'e', 'ao', 'rue']) {
      const r = procurar(termo, 50);
      for (let i = 0; i < r.length; i++) {
        const atual = r[i]?.pontuacao ?? 0;
        expect(atual).toBeGreaterThan(0);
        expect(atual).toBeLessThanOrEqual(3);
        if (i > 0) expect(atual).toBeLessThanOrEqual(r[i - 1]?.pontuacao ?? 0);
      }
    }
  });
});
