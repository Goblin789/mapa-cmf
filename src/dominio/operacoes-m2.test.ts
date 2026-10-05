// Testes das operações do M2 ('campo' e 'registo'): compactar com as dobras, aplicar por fases, conflitos e
// frases do histórico. A validação está em validar-m2.test.ts. Dados fictícios.

import { describe, expect, it } from 'vitest';
import type { CampoEditavel, EntidadeEditavel, ValorCampo } from './campos';
import {
  aplicarOperacoes,
  compactarOperacoes,
  descreverOperacao,
  encontrarConflitos,
  nomeDeRegisto,
  nomeDoRegisto,
  type Operacao,
  type OperacaoRegisto,
  operacaoApagar,
  operacaoCriar,
  separarCriacao,
  validarOperacoes,
} from './operacoes';
import {
  criarCasa,
  criarIndisponibilidade,
  criarLocal,
  criarObra,
  criarPessoa,
  criarProblema,
  estadoExemplo,
} from './teste-fabrica';
import type { Estado } from './tipos';

const ID = '1b2c3d4e-0000-4000-8000-0000000000';

function campo(
  entidade: EntidadeEditavel,
  id: string,
  nome: CampoEditavel,
  de: ValorCampo,
  para: ValorCampo,
): Operacao {
  return { tipo: 'campo', entidade, id, campo: nome, de, para };
}

function mover(
  pessoaId: string,
  c: 'casaId' | 'carrinhaId' | 'obraId',
  de: string | null,
  para: string | null,
): Operacao {
  return { tipo: 'mover', pessoaId, campo: c, de, para };
}

const localNovo = criarLocal({
  id: `local-${ID}01`,
  tipo: 'obra',
  nome: 'Obra Nova',
  morada: 'Rue X, Luxembourg',
  lat: 49.6,
  lng: 6.12,
  raioM: 150,
});
const obraNova = criarObra({
  id: `obra-${ID}01`,
  nome: 'Obra Nova',
  clienteId: 'cliente-a',
  localId: localNovo.id,
});

/** estadoExemplo com um problema, um período e uma obra criada no programa (com o seu local). */
function estadoM2(): Estado {
  const e = estadoExemplo();
  return {
    ...e,
    locais: [...e.locais, localNovo],
    obras: [...e.obras, obraNova],
    problemas: [criarProblema({ id: 'pr1', casaId: 'casa-1', texto: 'Esquentador avariado' })],
    indisponibilidades: [
      criarIndisponibilidade({ id: 'i1', pessoaId: 'p-ana', inicio: '2026-10-06', fim: '2026-10-10' }),
    ],
  };
}

describe('compactar com dobras (M2)', () => {
  it('os campos de um registo criado no rascunho entram no registo', () => {
    const criar = operacaoCriar('obra', obraNova);
    const ops = [
      criar,
      campo('obra', obraNova.id, 'nome', 'Obra Nova', 'Obra Novíssima'),
      mover('p-helena', 'obraId', null, obraNova.id),
      campo('obra', obraNova.id, 'clienteId', 'cliente-a', 'cliente-b'),
    ];
    expect(compactarOperacoes(ops)).toEqual([
      { ...criar, para: { ...obraNova, nome: 'Obra Novíssima', clienteId: 'cliente-b' } },
      mover('p-helena', 'obraId', null, obraNova.id),
    ]);
  });

  it('resolvidoEm, ativa e as marcas não entram na criação: ficam "campo" a seguir (a forma de criar recusa-os)', () => {
    const problema = criarProblema({ id: `problema-${ID}02`, casaId: 'casa-1', texto: 'Torneira a pingar' });
    const criarProblemaOp = operacaoCriar('problema', problema);
    const resolver = campo('problema', problema.id, 'resolvidoEm', null, '2026-10-04');
    expect(
      compactarOperacoes([
        criarProblemaOp,
        resolver,
        campo('problema', problema.id, 'texto', 'Torneira a pingar', 'Torneira da cozinha a pingar'),
      ]),
    ).toEqual([
      { ...criarProblemaOp, para: { ...problema, texto: 'Torneira da cozinha a pingar' } },
      resolver,
    ]);
    // Resolver e reabrir no mesmo rascunho: só fica a criação.
    expect(
      compactarOperacoes([
        criarProblemaOp,
        resolver,
        campo('problema', problema.id, 'resolvidoEm', '2026-10-04', null),
      ]),
    ).toEqual([criarProblemaOp]);
    // Criar, resolver e apagar: não fica nada.
    expect(
      compactarOperacoes([
        criarProblemaOp,
        resolver,
        { tipo: 'registo', entidade: 'problema', id: problema.id, de: problema, para: null },
      ]),
    ).toEqual([]);

    const pessoa = criarPessoa({ id: `pessoa-${ID}03`, nomeCurto: 'Rui S.' });
    const criarPessoaOp = operacaoCriar('pessoa', pessoa);
    const marca = campo('pessoa', pessoa.id, 'casaAConfirmar', false, true);
    const saiu = campo('pessoa', pessoa.id, 'ativa', true, false);
    expect(
      compactarOperacoes([criarPessoaOp, marca, campo('pessoa', pessoa.id, 'telefone', null, '691'), saiu]),
    ).toEqual([{ ...criarPessoaOp, para: { ...pessoa, telefone: '691' } }, marca, saiu]);

    // E o rascunho compactado é válido (antes dava "Um problema novo começa aberto.").
    const estado = estadoExemplo();
    expect(validarOperacoes(estado, compactarOperacoes([criarProblemaOp, resolver]))).toEqual([]);
    expect(validarOperacoes(estado, compactarOperacoes([criarPessoaOp, marca, saiu]))).toEqual([]);
    expect(
      aplicarOperacoes(estado, compactarOperacoes([criarProblemaOp, resolver])).problemas.find(
        (p) => p.id === problema.id,
      )?.resolvidoEm,
    ).toBe('2026-10-04');
  });

  it('criado e apagado no mesmo rascunho, com campos pelo meio: não fica nada (nem os campos)', () => {
    const criar = operacaoCriar('obra', obraNova);
    const mudada = { ...obraNova, nome: 'Outra' };
    const ops: Operacao[] = [
      campo('casa', 'casa-1', 'lotacao', 3, 4),
      criar,
      campo('obra', obraNova.id, 'nome', 'Obra Nova', 'Outra'),
      { tipo: 'registo', entidade: 'obra', id: obraNova.id, de: mudada, para: null },
    ];
    expect(compactarOperacoes(ops)).toEqual([campo('casa', 'casa-1', 'lotacao', 3, 4)]);
  });

  it('apagar depois de mudar campos: os campos saem e o registo apagado leva o valor gravado', () => {
    const estado = estadoM2();
    const a = campo('local', localNovo.id, 'morada', 'Rue X, Luxembourg', 'Rue Y');
    const b = campo('local', localNovo.id, 'morada', 'Rue Y', 'Rue Z');
    const c = campo('local', localNovo.id, 'nome', 'Obra Nova', 'Estaleiro');
    const visivel = aplicarOperacoes(estado, [a, b, c]);
    const apagar = operacaoApagar(visivel, 'local', localNovo.id) as OperacaoRegisto;
    expect(apagar.de).toMatchObject({ morada: 'Rue Z', nome: 'Estaleiro' });
    const compactadas = compactarOperacoes([a, b, c, apagar]);
    expect(compactadas).toEqual([{ ...apagar, de: localNovo }]);
    // O servidor compara o `de` com o gravado: não há conflito.
    expect(encontrarConflitos(estado, compactadas)).toEqual([]);
  });

  it('mantém a ordem da 1.ª ocorrência e tira o que acaba como começou', () => {
    const ops = [
      campo('casa', 'casa-2', 'lotacao', 2, 3),
      mover('p-ana', 'casaId', 'casa-1', 'casa-3'),
      campo('casa', 'casa-1', 'nome', 'Casa Um', 'Casa 1'),
      campo('casa', 'casa-2', 'lotacao', 3, 2),
      campo('casa', 'casa-1', 'nome', 'Casa 1', 'Casa Uno'),
    ];
    expect(compactarOperacoes(ops)).toEqual([
      mover('p-ana', 'casaId', 'casa-1', 'casa-3'),
      campo('casa', 'casa-1', 'nome', 'Casa Um', 'Casa Uno'),
    ]);
  });
});

describe('aplicar por fases (M2)', () => {
  it('cria antes, muda os campos depois, apaga no fim, seja qual for a ordem do pedido', () => {
    const estado = estadoExemplo();
    const ops: Operacao[] = [
      mover('p-helena', 'obraId', null, obraNova.id),
      campo('obra', obraNova.id, 'nome', 'Obra Nova', 'Renomeada'),
      operacaoCriar('obra', obraNova),
      operacaoCriar('local', localNovo),
    ];
    const depois = aplicarOperacoes(estado, ops);
    expect(depois.obras.find((o) => o.id === obraNova.id)?.nome).toBe('Renomeada');
    expect(depois.pessoas.find((p) => p.id === 'p-helena')?.obraId).toBe(obraNova.id);
    expect(depois.locais.at(-1)).toEqual(localNovo);
  });

  it('não mexe no estado recebido; campos de registos que não existem ignoram-se', () => {
    const estado = estadoM2();
    const antes = structuredClone(estado);
    const depois = aplicarOperacoes(estado, [
      campo('casa', 'nao-existe', 'lotacao', 1, 2),
      campo('problema', 'pr1', 'resolvidoEm', null, '2026-10-04'),
      {
        tipo: 'registo',
        entidade: 'indisponibilidade',
        id: 'i1',
        de: estado.indisponibilidades[0] ?? null,
        para: null,
      } as Operacao,
    ]);
    expect(estado).toEqual(antes);
    expect(depois.problemas[0]?.resolvidoEm).toBe('2026-10-04');
    expect(depois.indisponibilidades).toEqual([]);
    expect(depois.casas).toEqual(estado.casas);
  });
});

describe('conflitos do M2', () => {
  const estado = estadoM2();

  it("'campo': mudou entretanto, ou o registo já não existe; os criados no mesmo lote não contam", () => {
    const outro = { ...estado, problemas: [] };
    expect(
      encontrarConflitos(outro, [campo('problema', 'pr1', 'texto', 'Esquentador avariado', 'X')]),
    ).toEqual([
      {
        tipo: 'campo',
        entidade: 'problema',
        id: 'pr1',
        campo: 'texto',
        esperado: 'Esquentador avariado',
        atual: null,
        existe: false,
      },
    ]);
    const novo = criarProblema({ id: `problema-${ID}09`, casaId: 'casa-2' });
    expect(
      encontrarConflitos(estado, [
        operacaoCriar('problema', novo),
        campo('problema', novo.id, 'texto', 'a', 'b'),
      ]),
    ).toEqual([]);
    // Listas comparam-se pelo conteúdo.
    const alt = campo('carrinha', 'zz1003', 'matriculasAlternativas', ['QQ9999'], ['QQ9999', 'QQ1']);
    expect(encontrarConflitos(estado, [alt])).toEqual([]);
  });

  it("'registo': criar com um id que já existe; apagar o que mudou ou já não existe", () => {
    expect(encontrarConflitos(estado, [operacaoCriar('obra', obraNova)])).toEqual([
      { tipo: 'registo', entidade: 'obra', id: obraNova.id, esperado: null, atual: obraNova },
    ]);
    const apagar = operacaoApagar(estado, 'obra', obraNova.id) as Operacao;
    expect(encontrarConflitos(estado, [apagar])).toEqual([]);
    const mudou = {
      ...estado,
      obras: estado.obras.map((o) => (o.id === obraNova.id ? { ...o, nome: 'X' } : o)),
    };
    expect(encontrarConflitos(mudou, [apagar])).toMatchObject([{ tipo: 'registo', atual: { nome: 'X' } }]);
    const semObra = { ...estado, obras: estado.obras.filter((o) => o.id !== obraNova.id) };
    expect(encontrarConflitos(semObra, [apagar])).toMatchObject([{ tipo: 'registo', atual: null }]);
  });

  it('apagar com o registo noutra ordem (ou sem as chaves a null) não dá conflito', () => {
    const periodo = estado.indisponibilidades[0];
    const outraOrdem = { fim: periodo?.fim, inicio: periodo?.inicio, pessoaId: periodo?.pessoaId, id: 'i1' };
    const op = {
      tipo: 'registo',
      entidade: 'indisponibilidade',
      id: 'i1',
      de: outraOrdem,
      para: null,
    } as Operacao;
    expect(encontrarConflitos(estado, [op])).toEqual([]);
  });
});

describe('nomes e frases do histórico (M2)', () => {
  const estado = estadoM2();
  const d = (op: Operacao) => descreverOperacao(estado, op);

  it('nome do registo: indisponibilidade → pessoa, problema → casa/matrícula, local → obra ou casa', () => {
    expect(nomeDoRegisto(estado, 'indisponibilidade', 'i1')).toBe('Ana T.');
    expect(nomeDoRegisto(estado, 'problema', 'pr1')).toBe('Casa Um');
    expect(nomeDeRegisto(estado, 'problema', { id: 'x', casaId: null, carrinhaId: 'zz1002' })).toBe(
      'ZZ 1002',
    );
    expect(nomeDoRegisto(estado, 'local', localNovo.id)).toBe('Obra Nova');
    // Uma morada partilhada (Casa Um e Casa Dois) diz-se pelo local; a de uma só casa, pela casa.
    expect(nomeDoRegisto(estado, 'local', 'local-a')).toBe('Morada A (2 casas)');
    expect(nomeDoRegisto(estado, 'local', 'local-b')).toBe(
      estado.casas.find((c) => c.localId === 'local-b')?.nome ?? '?',
    );
    expect(nomeDoRegisto(estado, 'local', 'local-obra')).toBe('Obra Beta');
    expect(nomeDoRegisto(estado, 'carrinha', 'zz1001')).toBe('ZZ 1001');
    expect(nomeDoRegisto(estado, 'casa', 'nao-existe')).toBe('nao-existe');
  });

  it('pessoas', () => {
    expect(d(campo('pessoa', 'p-ana', 'telefone', null, '691 000 000'))).toBe(
      'Ana T. — telefone: — → 691 000 000',
    );
    expect(d(campo('pessoa', 'p-ana', 'nomeCurto', 'Ana', 'Ana T.'))).toBe(
      'Ana T. — nome no mapa: Ana → Ana T.',
    );
    expect(d(campo('pessoa', 'p-ana', 'ativa', true, false))).toBe('Ana T. — saiu da empresa');
    expect(d(campo('pessoa', 'p-ana', 'ativa', false, true))).toBe('Ana T. — voltou à empresa');
    expect(d(campo('pessoa', 'p-gil', 'casaAConfirmar', true, false))).toBe('Gil N. — casa confirmada');
    expect(d(campo('pessoa', 'p-gil', 'carrinhaAConfirmar', false, true))).toBe(
      'Gil N. — carrinha a confirmar',
    );
    // A carta com as palavras da ficha (05/10/2026), não "sim"/"não".
    expect(d(campo('pessoa', 'p-ana', 'temCarta', null, true))).toBe('Ana T. — carta: sem dados ainda → Tem');
    expect(d(campo('pessoa', 'p-ana', 'temCarta', true, false))).toBe('Ana T. — carta: Tem → Não tem');
    expect(d(campo('pessoa', 'p-ana', 'temCarta', false, null))).toBe(
      'Ana T. — carta: Não tem → sem dados ainda',
    );
    expect(d(campo('pessoa', 'p-ana', 'cartaValidade', null, '2027-03-01'))).toBe(
      'Ana T. — carta válida até: — → 01/03/2027',
    );
    expect(d(campo('pessoa', 'p-ana', 'clienteId', 'cliente-a', 'cliente-b'))).toBe(
      'Ana T. — cliente: Alfa Construções → Beta Obras',
    );
    const nova = criarPessoa({ id: `pessoa-${ID}03`, nomeCurto: 'Zé N.', clienteId: 'cliente-b' });
    expect(d(operacaoCriar('pessoa', nova))).toBe('Zé N. — entrou (Beta Obras)');
  });

  it('casas, carrinhas e locais', () => {
    expect(d(campo('casa', 'casa-1', 'lotacao', 8, 9))).toBe('Casa Um — lotação: 8 → 9');
    expect(d(campo('casa', 'casa-1', 'sempreCheia', false, true))).toBe(
      'Casa Um — lugares iguais aos moradores: não → sim',
    );
    expect(d(campo('casa', 'casa-1', 'localId', 'local-a', 'local-b'))).toBe(
      'Casa Um — morada: 1 Rue Fictícia, L-0000 Lugar local-a → 1 Rue Fictícia, L-0000 Lugar local-b',
    );
    expect(d(campo('local', 'local-a', 'morada', 'Rua A', 'Rua B'))).toBe(
      'Morada A (2 casas) — morada: Rua A → Rua B',
    );
    expect(d(campo('carrinha', 'zz1001', 'lugares', 9, 8))).toBe('ZZ 1001 — lugares: 9 → 8');
    expect(d(campo('carrinha', 'zz1001', 'matricula', 'ZZ1001', 'ZZ1009'))).toBe(
      'ZZ 1001 — matrícula: ZZ 1001 → ZZ 1009',
    );
    expect(d(campo('carrinha', 'zz1003', 'matriculasAlternativas', ['QQ9999'], []))).toBe(
      'ZZ 1003 — outras matrículas: QQ 9999 → —',
    );
    expect(d(campo('local', localNovo.id, 'lat', 49.6, 49.7))).toBe('Obra Nova — pino mudado de sítio');
    expect(d(campo('local', localNovo.id, 'lng', 6.12, 6.2))).toBe('Obra Nova — pino mudado de sítio');
  });

  it('indisponibilidade', () => {
    const i = criarIndisponibilidade({
      id: `indisp-${ID}04`,
      pessoaId: 'p-ana',
      inicio: '2026-10-06',
      fim: '2026-10-10',
    });
    expect(d(operacaoCriar('indisponibilidade', i))).toBe('Ana T. — indisponível de 06/10/2026 a 10/10/2026');
    expect(d(operacaoCriar('indisponibilidade', { ...i, fim: null }))).toBe(
      'Ana T. — indisponível a partir de 06/10/2026 (sem data de regresso)',
    );
    expect(d(operacaoCriar('indisponibilidade', { ...i, fim: i.inicio }))).toBe(
      'Ana T. — indisponível a 06/10/2026',
    );
    expect(d(campo('indisponibilidade', 'i1', 'fim', '2026-10-10', '2026-10-08'))).toBe(
      'Ana T. — indisponível até: 10/10/2026 → 08/10/2026',
    );
    expect(d(campo('indisponibilidade', 'i1', 'fim', '2026-10-10', null))).toBe(
      'Ana T. — indisponível até: 10/10/2026 → sem data de regresso',
    );
    expect(d(operacaoApagar(estado, 'indisponibilidade', 'i1') as Operacao)).toBe(
      'Ana T. — período de indisponibilidade apagado',
    );
  });

  it('problemas', () => {
    const p = criarProblema({ id: `problema-${ID}05`, casaId: 'casa-1', texto: 'esquentador avariado' });
    expect(d(operacaoCriar('problema', p))).toBe('Casa Um — problema aberto: «esquentador avariado»');
    expect(d(operacaoCriar('problema', { ...p, casaId: null, carrinhaId: 'zz1002', texto: 'pneu' }))).toBe(
      'ZZ 1002 — problema aberto: «pneu»',
    );
    expect(d(campo('problema', 'pr1', 'resolvidoEm', null, '2026-10-04'))).toBe(
      'Casa Um — problema resolvido: «Esquentador avariado»',
    );
    expect(d(campo('problema', 'pr1', 'resolvidoEm', '2026-10-04', null))).toBe(
      'Casa Um — problema reaberto: «Esquentador avariado»',
    );
    expect(d(campo('problema', 'pr1', 'texto', 'a', 'b'))).toBe('Casa Um — problema: «a» → «b»');
    expect(d(operacaoApagar(estado, 'problema', 'pr1') as Operacao)).toBe(
      'Casa Um — problema apagado: «Esquentador avariado»',
    );
  });

  it('obras e os seus locais', () => {
    expect(d(operacaoCriar('obra', obraNova))).toBe(
      'Obra Nova — criada (Alfa Construções, Rue X, Luxembourg)',
    );
    expect(d(campo('obra', obraNova.id, 'clienteId', 'cliente-a', 'cliente-b'))).toBe(
      'Obra Nova — cliente: Alfa Construções → Beta Obras',
    );
    expect(d(campo('obra', obraNova.id, 'estacionamentoLocalId', null, 'local-parque'))).toMatch(
      /^Obra Nova — estacionamento: sem estacionamento → 1 Rue Fictícia/,
    );
    expect(d(operacaoApagar(estado, 'obra', obraNova.id) as Operacao)).toBe('Obra Nova — apagada');
    expect(d(operacaoCriar('local', localNovo))).toBe('Obra Nova — local criado: Rue X, Luxembourg');
    expect(
      d(operacaoCriar('local', { ...localNovo, id: `local-${ID}06`, tipo: 'estacionamento', morada: '' })),
    ).toBe('Obra Nova — estacionamento criado: sem morada');
    expect(d(operacaoApagar(estado, 'local', localNovo.id) as Operacao)).toBe('Obra Nova — local apagado');
  });

  it('casas novas e apagadas (05/10/2026)', () => {
    const nova = criarCasa({ id: `casa-${ID}21`, nome: 'Casa Nova', localId: 'local-a', lotacao: 5 });
    expect(d(operacaoCriar('casa', nova))).toBe('Casa Nova — criada (1 Rue Fictícia, L-0000 Lugar local-a)');
    expect(d(operacaoCriar('casa', { ...nova, localId: 'nao-existe' }))).toBe(
      'Casa Nova — criada (nao-existe)',
    );
    const soPino = {
      ...estado,
      locais: estado.locais.map((l) => (l.id === 'local-a' ? { ...l, morada: '' } : l)),
    };
    expect(descreverOperacao(soPino, operacaoCriar('casa', nova))).toBe(
      'Casa Nova — criada (só o sítio no mapa)',
    );
    expect(d(operacaoApagar(estado, 'casa', 'casa-2') as Operacao)).toBe('Casa Dois — apagada');
  });

  it('registo criado: o nome atual se ainda existe; o gravado se já não existe', () => {
    const renomeada: Estado = {
      ...estado,
      obras: estado.obras.map((o) => (o.id === obraNova.id ? { ...o, nome: 'Obra M' } : o)),
    };
    expect(descreverOperacao(renomeada, operacaoCriar('obra', obraNova))).toBe(
      'Obra M — criada (Alfa Construções, Rue X, Luxembourg)',
    );
    const semObra: Estado = { ...estado, obras: estado.obras.filter((o) => o.id !== obraNova.id) };
    expect(descreverOperacao(semObra, operacaoCriar('obra', obraNova))).toBe(
      'Obra Nova — criada (Alfa Construções, Rue X, Luxembourg)',
    );
  });
});

describe('separarCriacao (o Reverter de um registo apagado)', () => {
  it('os campos que a forma de criar não aceita vão a seguir, como "campo"', () => {
    const casa = criarCasa({ id: 'walferdange', nome: 'Walferdange', sempreCheia: true });
    expect(separarCriacao(operacaoCriar('casa', casa))).toEqual([
      operacaoCriar('casa', { ...casa, sempreCheia: false }),
      { tipo: 'campo', entidade: 'casa', id: 'walferdange', campo: 'sempreCheia', de: false, para: true },
    ]);
    const problema = criarProblema({ id: `problema-${ID}22`, casaId: 'casa-1', resolvidoEm: '2026-10-02' });
    expect(separarCriacao(operacaoCriar('problema', problema))).toEqual([
      operacaoCriar('problema', { ...problema, resolvidoEm: null }),
      {
        tipo: 'campo',
        entidade: 'problema',
        id: problema.id,
        campo: 'resolvidoEm',
        de: null,
        para: '2026-10-02',
      },
    ]);
    // Já com a forma certa: fica como estava; apagar também.
    const outra = criarCasa({ id: 'eischen', nome: 'Eischen' });
    expect(separarCriacao(operacaoCriar('casa', outra))).toEqual([operacaoCriar('casa', outra)]);
    const apagar = operacaoApagar(estadoExemplo(), 'casa', 'casa-1') as OperacaoRegisto;
    expect(separarCriacao(apagar)).toEqual([apagar]);
  });

  it('o compactar não volta a dobrar esses campos na criação (validam-se e gravam-se a seguir)', () => {
    const casa = criarCasa({ id: 'walferdange', nome: 'Walferdange', sempreCheia: true });
    const ops = separarCriacao(operacaoCriar('casa', casa));
    expect(compactarOperacoes(ops)).toEqual(ops);
  });
});
