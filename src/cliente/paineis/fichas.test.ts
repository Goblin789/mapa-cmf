import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import type { Operacao } from '../../dominio/operacoes';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import { estadoFicticio, pessoaFicticia } from './dadosFicticios';
import {
  avisoNomeNoMapa,
  avisoOutraMorada,
  cadeiaDaPessoa,
  campoPendente,
  carrinhasDasPessoas,
  carrinhasQueDormemEm,
  casasDasPessoas,
  coordenadasDoLocal,
  destinoNoMapa,
  erroOutrasMatriculas,
  erroSemNome,
  escolhaCarta,
  extrasDaPessoa,
  fichaCompactaTemCorpo,
  fichaPessoaCompacta,
  opcoesOutraMorada,
  operacoesMoradaDoLocal,
  outraComNomeNoMapa,
  outrasCasasNoLocal,
  resumoDasCasas,
  teclaDoCampoAberto,
} from './fichas';

// --- M2: fichas editáveis (dados fictícios de dominio/teste-fabrica.ts) -----------------------------

describe('M2: o que os editores das fichas precisam', () => {
  const exemplo = estadoExemplo();

  it('a morada da casa muda o LOCAL num só passo (morada aparada, país, posição)', () => {
    const ops = operacoesMoradaDoLocal(exemplo, 'local-a', {
      morada: '  2 Rue Nova \n Luxembourg ',
      pais: 'LU',
      lat: 49.7,
      lng: 6.1,
    });
    expect(ops).toEqual([
      {
        tipo: 'campo',
        entidade: 'local',
        id: 'local-a',
        campo: 'morada',
        de: '1 Rue Fictícia, L-0000 Lugar local-a',
        para: '2 Rue Nova Luxembourg',
      },
      { tipo: 'campo', entidade: 'local', id: 'local-a', campo: 'lat', de: 49.6, para: 49.7 },
    ]);
    // Sem pino, a posição fica como estava.
    const semPino = operacoesMoradaDoLocal(exemplo, 'local-a', {
      morada: 'X',
      pais: 'FR',
      lat: null,
      lng: null,
    });
    expect(semPino.map((op) => op.campo)).toEqual(['morada', 'pais']);
  });

  it('as outras casas na mesma morada (o aviso "Também muda para")', () => {
    const ind = indexar(exemplo, null);
    const casa1 = ind.casas.get('casa-1');
    const casa3 = ind.casas.get('casa-3');
    expect(casa1 && outrasCasasNoLocal(casa1, ind).map((c) => c.nome)).toEqual(['Casa Dois']);
    expect(casa3 && outrasCasasNoLocal(casa3, ind)).toEqual([]);
  });

  it('nome no mapa repetido sem contar acentos nem maiúsculas (a própria pessoa não conta)', () => {
    expect(outraComNomeNoMapa(exemplo.pessoas, ' célia  f. ', null)?.id).toBe('p-celia');
    expect(outraComNomeNoMapa(exemplo.pessoas, 'Celia F.', 'p-celia')).toBeUndefined();
    expect(avisoNomeNoMapa(exemplo.pessoas, 'ANA T.', 'p-bruno')).toBe(
      'Já há outra pessoa com «Ana T.» no mapa: escolhe outro nome.',
    );
    expect(avisoNomeNoMapa(exemplo.pessoas, '', null)).toBeNull();
  });

  it('as frases do domínio sem o nome do registo (está à vista na ficha)', () => {
    expect(erroSemNome(exemplo, 'casa', 'casa-1', 'Casa Um — o tolerado (1) …')).toBe('O tolerado (1) …');
    expect(erroSemNome(exemplo, 'casa', 'casa-1', 'Casa Dois — outra')).toBe('Casa Dois — outra');
  });

  it('o "antes" de um campo vem da operação pendente dele', () => {
    const pendentes: Operacao[] = [
      { tipo: 'campo', entidade: 'casa', id: 'casa-1', campo: 'lotacao', de: 3, para: 4 },
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'casaId', de: 'casa-1', para: null },
    ];
    expect(campoPendente(pendentes, 'casa', 'casa-1', 'lotacao')?.de).toBe(3);
    expect(campoPendente(pendentes, 'casa', 'casa-1', 'tolerado')).toBeNull();
    expect(campoPendente(pendentes, 'casa', 'casa-2', 'lotacao')).toBeNull();
  });

  it('a escolha da carta', () => {
    expect(escolhaCarta(true)).toBe('tem');
    expect(escolhaCarta(false)).toBe('nao-tem');
    expect(escolhaCarta(null)).toBe('nao-sei');
  });
});

const estado = estadoFicticio();
const ind = indexar(estado);
const dormidas = dormidasDasCarrinhas(estado, ind);

function pessoa(id: string) {
  const p = ind.pessoas.get(id);
  if (!p) throw new Error(`Falta a pessoa ${id} nos dados fictícios`);
  return p;
}

describe('ficha compacta da pessoa (Tabela)', () => {
  it('só na Tabela; no Mapa e no Quadro a ficha é completa', () => {
    expect(fichaPessoaCompacta('tabela')).toBe(true);
    expect(fichaPessoaCompacta('quadro')).toBe(false);
    expect(fichaPessoaCompacta('mapa')).toBe(false);
  });

  it('sem telefone nem carta conhecidos, nada a mostrar', () => {
    const p = pessoaFicticia({ id: 'x1', nomeCurto: 'Zé T.', nome: 'Zé', apelidos: 'Teste' });
    expect(extrasDaPessoa(p, '2026-10-04')).toEqual({ nomeNoMapa: 'Zé T.', telefone: null, carta: null });
  });

  it('mostra o telefone e a carta quando existem, e não repete o nome do mapa igual ao completo', () => {
    const p = pessoaFicticia({
      id: 'x2',
      nomeCurto: 'Zé Teste',
      nome: 'Zé',
      apelidos: 'Teste',
      telefone: ' +352 600 000 000 ',
      temCarta: true,
      cartaValidade: '2026-01-31',
    });
    const extras = extrasDaPessoa(p, '2026-10-04');
    expect(extras.nomeNoMapa).toBeNull();
    expect(extrasDaPessoa({ ...p, nomeCurto: 'ZE TESTE' }, '2026-10-04').nomeNoMapa).toBeNull();
    expect(extras.telefone).toBe('+352 600 000 000');
    expect(extras.carta).toBe('Caducou a 31/01/2026');
    expect(extrasDaPessoa({ ...p, telefone: '  ', temCarta: false }, '2026-10-04')).toMatchObject({
      telefone: null,
      carta: 'Não tem',
    });
  });

  it('sem telefone, carta nem aviso, não tem corpo (só o cabeçalho, sem linha "sem dados")', () => {
    const p = pessoaFicticia({ id: 'x3', nomeCurto: 'Zé T.', nome: 'Zé', apelidos: 'Teste' });
    const extras = extrasDaPessoa(p, '2026-10-04');
    expect(fichaCompactaTemCorpo(extras, false)).toBe(false);
    // Quem conduz sem carta tem o aviso (e a carta "Não tem").
    expect(fichaCompactaTemCorpo(extras, true)).toBe(true);
    expect(fichaCompactaTemCorpo({ ...extras, telefone: '+352 600 000 000' }, false)).toBe(true);
    expect(fichaCompactaTemCorpo({ ...extras, carta: 'Não tem' }, false)).toBe(true);
  });
});

describe('cadeiaDaPessoa', () => {
  it('mostra casa, carrinha e obra', () => {
    expect(cadeiaDaPessoa(pessoa('p1'), ind)).toEqual([
      { tipo: 'casa', id: 'casa-a', rotulo: 'Casa A', aConfirmar: false },
      { tipo: 'carrinha', id: 'v1', rotulo: 'AA1111', aConfirmar: false },
      { tipo: 'obra', id: null, rotulo: 'sem obra', aConfirmar: false },
    ]);
  });

  it('usa os nomes dos grupos especiais e assinala o que está a confirmar', () => {
    const cadeia = cadeiaDaPessoa(pessoa('p5'), ind);
    expect(cadeia[0]).toEqual({ tipo: 'casa', id: null, rotulo: 'Fora das casas CMF', aConfirmar: true });
    expect(cadeia[2]).toEqual({ tipo: 'obra', id: 'obra-1', rotulo: 'Obra Teste', aConfirmar: false });
    const semCarrinha = cadeiaDaPessoa(pessoa('p6'), ind)[1];
    expect(semCarrinha).toEqual({
      tipo: 'carrinha',
      id: null,
      rotulo: 'Sem transporte da empresa',
      aConfirmar: true,
    });
  });

  it('trata uma casa que não existe como fora das casas', () => {
    const cadeia = cadeiaDaPessoa({ ...pessoa('p1'), casaId: 'nao-existe' }, ind);
    expect(cadeia[0]?.id).toBeNull();
    expect(cadeia[0]?.rotulo).toBe('Fora das casas CMF');
  });
});

describe('casasDasPessoas e carrinhasDasPessoas', () => {
  it('conta de que casas vêm os passageiros, mais pessoas primeiro', () => {
    const { casas, semCasa } = casasDasPessoas(ind.passageiros.get('v1') ?? [], ind);
    expect(casas.map((c) => [c.casa.id, c.n])).toEqual([
      ['casa-a', 2],
      ['casa-c', 1],
    ]);
    expect(semCasa).toBe(0);
    expect(casasDasPessoas(ind.passageiros.get('v2') ?? [], ind).semCasa).toBe(1);
  });

  it('conta que carrinhas os moradores usam e quantos estão sem transporte', () => {
    const { carrinhas, semCarrinha } = carrinhasDasPessoas(ind.moradores.get('casa-a') ?? [], ind);
    expect(carrinhas.map((c) => [c.carrinha.id, c.n])).toEqual([
      ['v1', 2],
      ['v2', 1],
    ]);
    expect(semCarrinha).toBe(1);
  });

  it('desempata pela ordem', () => {
    const pessoas = [pessoa('p3'), pessoa('p1')];
    expect(carrinhasDasPessoas(pessoas, ind).carrinhas.map((c) => c.carrinha.id)).toEqual(['v1', 'v2']);
  });
});

describe('carrinhasQueDormemEm', () => {
  it('inclui as sugeridas e as definidas', () => {
    expect(carrinhasQueDormemEm('casa-a', ind, dormidas).map((d) => [d.carrinha.id, d.confianca])).toEqual([
      ['v1', 'sugerida'],
    ]);
    expect(carrinhasQueDormemEm('casa-b', ind, dormidas).map((d) => [d.carrinha.id, d.confianca])).toEqual([
      ['v4', 'definida'],
    ]);
    expect(carrinhasQueDormemEm('casa-c', ind, dormidas)).toEqual([]);
  });
});

describe('coordenadasDoLocal', () => {
  it('devolve null sem local ou sem coordenadas', () => {
    expect(coordenadasDoLocal('local-norte', ind)).toEqual({ lat: 49.7, lng: 6.1 });
    expect(coordenadasDoLocal('local-sul', ind)).toBeNull();
    expect(coordenadasDoLocal(null, ind)).toBeNull();
    expect(coordenadasDoLocal('nao-existe', ind)).toBeNull();
  });
});

describe('destinoNoMapa', () => {
  it('pessoa com casa: o local da casa', () => {
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p1' }, ind, dormidas)).toEqual({ lat: 49.7, lng: 6.1 });
  });

  it('pessoa sem casa: onde dorme a carrinha', () => {
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p5' }, ind, dormidas)).toEqual({ lat: 49.5, lng: 6.0 });
  });

  it('pessoa com casa sem coordenadas: tenta a carrinha', () => {
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p4' }, ind, dormidas)).toEqual({ lat: 49.7, lng: 6.1 });
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p8' }, ind, dormidas)).toBeNull();
  });

  it('pessoa sem casa nem carrinha, ou desconhecida: nenhum destino', () => {
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'p7' }, ind, dormidas)).toBeNull();
    expect(destinoNoMapa({ tipo: 'pessoa', id: 'nao-existe' }, ind, dormidas)).toBeNull();
  });

  it('carrinha: onde dorme (definida, sugerida ou num estacionamento)', () => {
    expect(destinoNoMapa({ tipo: 'carrinha', id: 'v1' }, ind, dormidas)).toEqual({ lat: 49.7, lng: 6.1 });
    expect(destinoNoMapa({ tipo: 'carrinha', id: 'v2' }, ind, dormidas)).toEqual({ lat: 49.5, lng: 6.0 });
    expect(destinoNoMapa({ tipo: 'carrinha', id: 'v3' }, ind, dormidas)).toBeNull();
  });

  it('casa: o seu local', () => {
    expect(destinoNoMapa({ tipo: 'casa', id: 'casa-b' }, ind, dormidas)).toEqual({ lat: 49.7, lng: 6.1 });
    expect(destinoNoMapa({ tipo: 'casa', id: 'casa-c' }, ind, dormidas)).toBeNull();
  });
});

describe('resumoDasCasas', () => {
  it('lista as casas com lugares livres, mais livres primeiro', () => {
    const { comLivres } = resumoDasCasas(estado.casas, ind);
    expect(comLivres.map((r) => [r.casa.id, r.ocupacao.livres])).toEqual([
      ['casa-b', 2],
      ['casa-c', 1],
    ]);
  });

  it('lista as casas acima do contrato, primeiro as acima do tolerado', () => {
    const casas = estado.casas.map((c) => (c.id === 'casa-c' ? { ...c, maxContrato: 1, tolerado: 2 } : c));
    const { acimaContrato } = resumoDasCasas(casas, ind);
    expect(acimaContrato.map((r) => [r.casa.id, r.ocupacao.aviso])).toEqual([
      ['casa-c', 'acima_tolerado'],
      ['casa-a', 'acima_maximo'],
    ]);
  });
});

describe('M2: correções das fichas', () => {
  const exemplo = estadoExemplo();

  it('as outras matrículas não podem ser de outro veículo, a principal desta nem repetir-se', () => {
    expect(erroOutrasMatriculas(exemplo, 'zz1002', ['AB123', 'CD 9'])).toBeNull();
    // A principal de outro veículo (escrita de outra maneira) e uma outra matrícula de outro veículo.
    expect(erroOutrasMatriculas(exemplo, 'zz1002', ['zz-1001'])).toBe(
      'ZZ 1001 já é de outro veículo (ZZ 1001).',
    );
    expect(erroOutrasMatriculas(exemplo, 'zz1002', ['QQ9999'])).toBe(
      'QQ 9999 já é de outro veículo (ZZ 1003).',
    );
    expect(erroOutrasMatriculas(exemplo, 'zz1002', ['ZZ1002'])).toBe(
      'ZZ 1002 é a matrícula principal desta carrinha.',
    );
    expect(erroOutrasMatriculas(exemplo, 'zz1002', ['AB123', 'ab 123'])).toBe('AB 123 está repetida.');
    // As que a própria carrinha já tem continuam a valer.
    expect(erroOutrasMatriculas(exemplo, 'zz1003', ['QQ9999'])).toBeNull();
  });

  it('"Mudar para outra morada…" mostra as casas que lá estão e avisa que passa a partilhar', () => {
    const casa3 = exemplo.casas.find((c) => c.id === 'casa-3');
    const casa1 = exemplo.casas.find((c) => c.id === 'casa-1');
    if (!casa3 || !casa1) throw new Error('Faltam as casas do exemplo');
    const paraA = opcoesOutraMorada(exemplo, casa3);
    expect(paraA).toEqual([
      {
        valor: 'local-a',
        rotulo: 'Morada A — 1 Rue Fictícia, L-0000 Lugar local-a · Casa Dois, Casa Um',
        casas: ['Casa Dois', 'Casa Um'],
      },
    ]);
    expect(avisoOutraMorada(paraA[0])).toBe(
      'Passa a partilhar a morada com Casa Dois e Casa Um: mudar a morada de uma muda a de todas.',
    );
    // Só locais de casas (nem o da obra nem o parque), sem o atual.
    expect(opcoesOutraMorada(exemplo, casa1).map((o) => o.valor)).toEqual(['local-b']);
    expect(avisoOutraMorada({ valor: 'x', rotulo: 'X', casas: [] })).toBe(
      'Passa para esta morada (nenhuma outra casa está lá agora).',
    );
    expect(avisoOutraMorada(undefined)).toBeNull();
  });

  it('teclas num campo aberto: Esc cancela, Enter numa lista aplica, Ctrl+Z/Y não chegam aos atalhos', () => {
    const tecla = (key: string, extra: Partial<Parameters<typeof teclaDoCampoAberto>[0]> = {}) =>
      teclaDoCampoAberto({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        emListaOuOpcao: false,
        ...extra,
      });
    expect(tecla('Escape')).toBe('cancelar');
    expect(tecla('Enter', { emListaOuOpcao: true })).toBe('aplicar');
    expect(tecla('Enter')).toBeNull();
    expect(tecla('z', { ctrlKey: true })).toBe('reter');
    expect(tecla('Z', { metaKey: true })).toBe('reter');
    expect(tecla('y', { ctrlKey: true })).toBe('reter');
    expect(tecla('z')).toBeNull();
    expect(tecla('z', { ctrlKey: true, altKey: true })).toBeNull();
  });
});
