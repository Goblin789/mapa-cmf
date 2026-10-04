// Testes de validarOperacoes com as operações do M2 (docs/m2.md, "Validar"). Dados fictícios.

import { describe, expect, it } from 'vitest';
import type { CampoEditavel, EntidadeEditavel, ValorCampo } from './campos';
import {
  compactarOperacoes,
  encontrarConflitos,
  type Operacao,
  operacaoApagar,
  operacaoCriar,
  validarOperacoes,
} from './operacoes';
import {
  criarIndisponibilidade,
  criarLocal,
  criarObra,
  criarPessoa,
  criarProblema,
  estadoAleatorio,
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

function condutor(carrinhaId: string, de: string | null, para: string | null): Operacao {
  return { tipo: 'condutor', carrinhaId, de, para };
}

const localNovo = criarLocal({
  id: `local-${ID}01`,
  tipo: 'obra',
  nome: 'Obra Nova',
  morada: 'Rue X',
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
const drusenheim = criarLocal({ id: 'drusenheim', tipo: 'estacionamento', nome: 'Estacionamento' });

/** estadoExemplo com a obra nova (e o seu local) já gravada, o local de Drusenheim e a Ana a conduzir a ZZ 1001. */
function estado(): Estado {
  const e = estadoExemplo();
  return {
    ...e,
    locais: [...e.locais, localNovo, drusenheim],
    obras: [...e.obras, obraNova],
    carrinhas: e.carrinhas.map((c) => (c.id === 'zz1001' ? { ...c, condutorId: 'p-ana' } : c)),
  };
}

describe('validar: valores e registos novos', () => {
  it('um valor inválido diz o nome do registo e o campo', () => {
    expect(validarOperacoes(estado(), [campo('casa', 'casa-1', 'lotacao', 3, -1)])).toEqual([
      'Casa Um — Lotação: tem de ser um número inteiro de 0 a 60.',
    ]);
    expect(validarOperacoes(estado(), [campo('casa', 'casa-1', 'ordem' as never, 1, 2)])).toEqual([
      'O campo ordem não se pode mudar no programa.',
    ]);
    expect(validarOperacoes(estado(), [campo('casa', 'nao-existe', 'lotacao', 3, 4)])).toEqual([
      'A casa que estavas a mudar já não existe.',
    ]);
  });

  it('criar: só as entidades criáveis, com o id novo e a forma certa', () => {
    const e = estado();
    const local = { ...localNovo, id: `local-${ID}02` };
    expect(validarOperacoes(e, [operacaoCriar('local', local)])).toEqual([]);
    expect(validarOperacoes(e, [operacaoCriar('local', { ...local, tipo: 'oficina' })])).toEqual([
      'Obra Nova — Só se criam locais de obra ou estacionamento.',
    ]);
    expect(validarOperacoes(e, [operacaoCriar('local', { ...local, raioM: 50000 })])).toEqual([
      'Obra Nova — Raio: tem de ser um número inteiro de 50 a 300 m.',
    ]);
    expect(validarOperacoes(e, [operacaoCriar('obra', obraNova)])).toEqual([
      'Obra Nova — já existe (identificador repetido).',
    ]);
    const casa = {
      tipo: 'registo',
      entidade: 'casa',
      id: 'casa-9',
      de: null,
      para: { id: 'casa-9' },
    } as never;
    expect(validarOperacoes(e, [casa])).toEqual(['casa-9 — não se cria no programa.']);
    const ambos = { ...operacaoCriar('obra', obraNova), de: obraNova } as Operacao;
    expect(validarOperacoes(e, [ambos])).toEqual([
      'Obra Nova — um registo cria-se ou apaga-se (não as duas coisas).',
    ]);
  });

  it('referências no estado final (cliente, morada, estacionamento, alvo do problema, pessoa do período)', () => {
    const e = estado();
    expect(validarOperacoes(e, [campo('obra', obraNova.id, 'clienteId', 'cliente-a', 'cliente-x')])).toEqual([
      'Obra Nova — o cliente escolhido não existe.',
    ]);
    expect(validarOperacoes(e, [campo('casa', 'casa-1', 'localId', 'local-a', 'local-x')])).toEqual([
      'Casa Um — a morada escolhida não existe.',
    ]);
    const obra2 = criarObra({
      id: `obra-${ID}03`,
      nome: 'Obra Dois',
      localId: 'local-x',
      estacionamentoLocalId: 'local-y',
    });
    expect(validarOperacoes(e, [operacaoCriar('obra', obra2)])).toEqual([
      'Obra Dois — a morada escolhida não existe.',
      'Obra Dois — o estacionamento escolhido não existe.',
    ]);
    const problema = criarProblema({ id: `problema-${ID}04`, casaId: 'casa-x', abertoEm: '2026-10-04' });
    expect(validarOperacoes(e, [operacaoCriar('problema', problema)])).toEqual([
      'O problema é de uma casa ou carrinha que não existe.',
    ]);
    const periodo = criarIndisponibilidade({ id: `indisp-${ID}05`, pessoaId: 'p-x', inicio: '2026-10-04' });
    expect(validarOperacoes(e, [operacaoCriar('indisponibilidade', periodo)])).toEqual([
      'O período de indisponibilidade é de uma pessoa que não existe.',
    ]);
    const pessoa = criarPessoa({ id: `pessoa-${ID}06`, nomeCurto: 'Zé N.', clienteId: 'cliente-x' });
    expect(validarOperacoes(e, [operacaoCriar('pessoa', pessoa)])).toEqual([
      'Zé N. — o cliente escolhido não existe.',
    ]);
  });

  it('uma pessoa nova pode ir logo para uma casa, uma carrinha e uma obra criada no mesmo lote', () => {
    const e = estado();
    const pessoa = criarPessoa({ id: `pessoa-${ID}07`, nomeCurto: 'Zé N.' });
    const obra = criarObra({ id: `obra-${ID}08`, nome: 'Obra Oito', localId: localNovo.id });
    const ops: Operacao[] = [
      mover(pessoa.id, 'casaId', null, 'casa-3'),
      mover(pessoa.id, 'obraId', null, obra.id),
      mover(pessoa.id, 'carrinhaId', null, 'zz1003'),
      operacaoCriar('obra', obra),
      operacaoCriar('pessoa', pessoa),
    ];
    expect(validarOperacoes(e, ops)).toEqual([]);
  });
});

describe('validar: ativa vista depois dos campos', () => {
  it('"Voltou à empresa" + pôr numa casa e numa carrinha (e a conduzir) no mesmo lote é válido', () => {
    const e = estado();
    const ivo = {
      ...e,
      pessoas: e.pessoas.map((p) => (p.id === 'p-ivo' ? { ...p, casaId: null, carrinhaId: null } : p)),
    };
    const ops: Operacao[] = [
      mover('p-ivo', 'casaId', null, 'casa-3'),
      mover('p-ivo', 'carrinhaId', null, 'zz1003'),
      condutor('zz1003', null, 'p-ivo'),
      campo('pessoa', 'p-ivo', 'ativa', false, true),
    ];
    expect(validarOperacoes(ivo, ops)).toEqual([]);
    // Sem o "voltou", continua a não estar ativo.
    expect(validarOperacoes(ivo, ops.slice(0, 3))).toEqual([
      'Ivo X. não está ativa.',
      'Ivo X. não está ativa.',
      'Ivo X. não está ativa.',
    ]);
  });

  it('"Saiu da empresa": sai da casa, da carrinha, da obra e deixa de conduzir no mesmo lote', () => {
    const e = estado();
    const saida: Operacao[] = [
      mover('p-ana', 'casaId', 'casa-1', null),
      mover('p-ana', 'carrinhaId', 'zz1001', null),
      condutor('zz1001', 'p-ana', null),
      mover('p-ana', 'obraId', 'obra-b', null),
      campo('pessoa', 'p-ana', 'ativa', true, false),
    ];
    expect(validarOperacoes(e, saida)).toEqual([]);
    expect(validarOperacoes(e, [campo('pessoa', 'p-ana', 'ativa', true, false)])).toEqual([
      'Ana T. — quem sai da empresa sai também da casa, da carrinha e da obra.',
      'Ana T. — quem sai da empresa deixa de conduzir a ZZ 1001.',
    ]);
    // Reverter a saída (o lote ao contrário) também é válido.
    const depois = {
      ...e,
      pessoas: e.pessoas.map((p) =>
        p.id === 'p-ana' ? { ...p, casaId: null, carrinhaId: null, obraId: null, ativa: false } : p,
      ),
      carrinhas: e.carrinhas.map((c) => (c.id === 'zz1001' ? { ...c, condutorId: null } : c)),
    };
    const reversao: Operacao[] = [
      campo('pessoa', 'p-ana', 'ativa', false, true),
      mover('p-ana', 'obraId', null, 'obra-b'),
      condutor('zz1001', null, 'p-ana'),
      mover('p-ana', 'carrinhaId', null, 'zz1001'),
      mover('p-ana', 'casaId', null, 'casa-1'),
    ];
    expect(validarOperacoes(depois, reversao)).toEqual([]);
  });

  it('mudar a ficha de quem já saiu (e ficou incoerente) não acusa a saída', () => {
    // O Ivo (inativo) ainda tem a casa-3 no exemplo: mudar-lhe o telefone não é uma saída.
    expect(validarOperacoes(estado(), [campo('pessoa', 'p-ivo', 'telefone', null, '600')])).toEqual([]);
  });
});

describe('validar: únicos (só nos registos mexidos)', () => {
  it('trocar o nome no mapa entre duas pessoas é válido; repetido (sem acentos nem maiúsculas) não', () => {
    const e = estado();
    expect(
      validarOperacoes(e, [
        campo('pessoa', 'p-ana', 'nomeCurto', 'Ana T.', 'Bruno E.'),
        campo('pessoa', 'p-bruno', 'nomeCurto', 'Bruno E.', 'Ana T.'),
      ]),
    ).toEqual([]);
    expect(validarOperacoes(e, [campo('pessoa', 'p-ana', 'nomeCurto', 'Ana T.', 'célia f.')])).toEqual([
      'célia f. — nome no mapa repetido: já há outra pessoa com «Célia F.».',
    ]);
    // Também contra quem saiu da empresa.
    expect(validarOperacoes(e, [campo('pessoa', 'p-ana', 'nomeCurto', 'Ana T.', 'Ivo X.')])).toHaveLength(1);
  });

  it('outras matrículas: nem repetidas, nem a principal do próprio, nem de outro veículo', () => {
    const e = estado();
    const alt = (para: string[]) => campo('carrinha', 'zz1001', 'matriculasAlternativas', [], para);
    expect(validarOperacoes(e, [alt(['AB 123', 'AB-123'])])).toEqual([
      'ZZ 1001 — Outras matrículas: há matrículas repetidas.',
    ]);
    expect(validarOperacoes(e, [alt(['ZZ 1001'])])).toEqual([
      'ZZ 1001 — ZZ 1001 já é a matrícula principal deste veículo.',
    ]);
    expect(validarOperacoes(e, [alt(['ZZ1002'])])).toEqual([
      'ZZ 1001 — ZZ 1002 já é de outro veículo (ZZ 1002).',
    ]);
    expect(validarOperacoes(e, [alt(['QQ 9999'])])).toEqual([
      'ZZ 1001 — QQ 9999 já é de outro veículo (ZZ 1003).',
    ]);
    expect(validarOperacoes(e, [alt(['AB123'])])).toEqual([]);
  });

  it('nº, matrícula e nome da casa', () => {
    const e = {
      ...estado(),
      pessoas: estado().pessoas.map((p) => (p.id === 'p-bruno' ? { ...p, numero: '900-001' } : p)),
    };
    expect(validarOperacoes(e, [campo('pessoa', 'p-ana', 'numero', null, '900-001')])).toEqual([
      'Ana T. — o nº 900-001 já é de Bruno E..',
    ]);
    expect(validarOperacoes(e, [campo('carrinha', 'zz1001', 'matricula', 'ZZ1001', 'ZZ 1002')])).toEqual([
      'ZZ 1002 — já há outro veículo com esta matrícula.',
    ]);
    // A principal também não pode ser a outra matrícula de outro veículo (a ZZ 1003 tem QQ 9999).
    expect(validarOperacoes(e, [campo('carrinha', 'zz1001', 'matricula', 'ZZ1001', 'QQ9999')])).toEqual([
      'QQ 9999 — já há outro veículo com esta matrícula.',
    ]);
    expect(validarOperacoes(e, [campo('casa', 'casa-1', 'nome', 'Casa Um', 'casa dois')])).toEqual([
      'casa dois — já há outra casa com este nome.',
    ]);
    expect(
      validarOperacoes(e, [
        campo('casa', 'casa-1', 'nome', 'Casa Um', 'Casa Dois'),
        campo('casa', 'casa-2', 'nome', 'Casa Dois', 'Casa Um'),
      ]),
    ).toEqual([]);
  });
});

describe('validar: apagar', () => {
  it('só obras, locais, períodos e problemas; nunca pessoas nem casas', () => {
    const e = estado();
    const pessoa = {
      tipo: 'registo',
      entidade: 'pessoa',
      id: 'p-ana',
      de: e.pessoas[0],
      para: null,
    } as Operacao;
    expect(validarOperacoes(e, [pessoa])).toEqual([
      'Ana T. — uma pessoa não se apaga: usa "Saiu da empresa".',
    ]);
    const casa = { tipo: 'registo', entidade: 'casa', id: 'casa-1', de: e.casas[0], para: null } as never;
    expect(validarOperacoes(e, [casa])).toEqual(['Casa Um — não se apaga no programa.']);
  });

  it('a obra só sem pessoas no fim (tirar as pessoas no mesmo lote serve)', () => {
    const e = {
      ...estado(),
      pessoas: estado().pessoas.map((p) => (p.id === 'p-helena' ? { ...p, obraId: obraNova.id } : p)),
    };
    const apagar = operacaoApagar(e, 'obra', obraNova.id) as Operacao;
    expect(validarOperacoes(e, [apagar])).toEqual([
      'Obra Nova — ainda tem 1 pessoa: muda-as para outra obra antes de a apagar.',
    ]);
    expect(validarOperacoes(e, [apagar, mover('p-helena', 'obraId', obraNova.id, null)])).toEqual([]);
  });

  it('o local só se foi criado no programa e sem nada que o use; a ordem do pedido não importa', () => {
    const e = estado();
    expect(validarOperacoes(e, [operacaoApagar(e, 'local', 'drusenheim') as Operacao])).toEqual([
      'Estacionamento — esta morada veio dos dados iniciais e não se apaga no programa.',
    ]);
    expect(validarOperacoes(e, [operacaoApagar(e, 'local', localNovo.id) as Operacao])).toEqual([
      'Obra Nova — esta morada ainda é usada por Obra Nova: não se apaga.',
    ]);
    // O local antes da obra, no pedido: vale o fim.
    expect(
      validarOperacoes(e, [
        operacaoApagar(e, 'local', localNovo.id) as Operacao,
        operacaoApagar(e, 'obra', obraNova.id) as Operacao,
      ]),
    ).toEqual([]);
    // Uma carrinha a dormir lá também conta.
    const dorme = { ...e, obras: e.obras.filter((o) => o.id !== obraNova.id) };
    const comCarrinha = {
      ...dorme,
      carrinhas: dorme.carrinhas.map((c) => (c.id === 'zz1003' ? { ...c, dormeLocalId: localNovo.id } : c)),
    };
    expect(
      validarOperacoes(comCarrinha, [operacaoApagar(comCarrinha, 'local', localNovo.id) as Operacao]),
    ).toEqual(['Obra Nova — esta morada ainda é usada por ZZ 1003 (dorme lá): não se apaga.']);
    expect(validarOperacoes(dorme, [operacaoApagar(dorme, 'local', localNovo.id) as Operacao])).toEqual([]);
  });

  it('o que já não existe', () => {
    const e = estado();
    const fantasma = {
      tipo: 'registo',
      entidade: 'problema',
      id: 'pr-x',
      de: criarProblema({ id: 'pr-x' }),
      para: null,
    } as Operacao;
    expect(validarOperacoes(e, [fantasma])).toEqual(['O problema que querias apagar já não existe.']);
  });
});

describe('validar: datas e regras da ficha', () => {
  const comPeriodo = (): Estado => ({
    ...estado(),
    indisponibilidades: [
      criarIndisponibilidade({ id: 'i-antigo', pessoaId: 'p-ana', inicio: '2026-03-01', fim: '2026-03-10' }),
    ],
    problemas: [criarProblema({ id: 'pr1', casaId: 'casa-1', abertoEm: '2026-10-01' })],
  });

  it('períodos da mesma pessoa sem sobreposição (também com os antigos); encostados servem', () => {
    const e = comPeriodo();
    const novo = criarIndisponibilidade({
      id: `indisp-${ID}10`,
      pessoaId: 'p-ana',
      inicio: '2026-03-10',
      fim: null,
    });
    expect(validarOperacoes(e, [operacaoCriar('indisponibilidade', novo)])).toEqual([
      'Ana T. — já está indisponível de 01/03/2026 a 10/03/2026: os períodos não se podem sobrepor.',
    ]);
    expect(
      validarOperacoes(e, [operacaoCriar('indisponibilidade', { ...novo, inicio: '2026-03-11' })]),
    ).toEqual([]);
    // De outra pessoa não conta.
    expect(
      validarOperacoes(e, [operacaoCriar('indisponibilidade', { ...novo, pessoaId: 'p-bruno' })]),
    ).toEqual([]);
    // Mudar o fim do antigo para cima do novo também não.
    const dois = { ...e, indisponibilidades: [...e.indisponibilidades, { ...novo, inicio: '2026-04-01' }] };
    expect(
      validarOperacoes(dois, [campo('indisponibilidade', 'i-antigo', 'fim', '2026-03-10', '2026-04-02')]),
    ).toHaveLength(1);
  });

  it('fim ≥ início; resolvido ≥ aberto', () => {
    const e = comPeriodo();
    expect(
      validarOperacoes(e, [campo('indisponibilidade', 'i-antigo', 'fim', '2026-03-10', '2026-02-01')]),
    ).toEqual(['Ana T. — o período acaba (01/02/2026) antes de começar (01/03/2026).']);
    expect(validarOperacoes(e, [campo('problema', 'pr1', 'resolvidoEm', null, '2026-09-30')])).toEqual([
      'Casa Um — o problema não pode ficar resolvido (30/09/2026) antes de ser aberto (01/10/2026).',
    ]);
    expect(validarOperacoes(e, [campo('problema', 'pr1', 'resolvidoEm', null, '2026-10-01')])).toEqual([]);
  });

  it('tolerado ≥ máx. do contrato quando os dois existem', () => {
    const e = estado();
    expect(validarOperacoes(e, [campo('casa', 'casa-1', 'tolerado', 3, 1)])).toEqual([
      'Casa Um — o tolerado (1) não pode ser menor do que o máx. do contrato (2).',
    ]);
    expect(validarOperacoes(e, [campo('casa', 'casa-1', 'tolerado', 3, null)])).toEqual([]);
    expect(
      validarOperacoes(e, [
        campo('casa', 'casa-1', 'maxContrato', 2, 1),
        campo('casa', 'casa-1', 'tolerado', 3, 1),
      ]),
    ).toEqual([]);
  });

  it('sem carta (ou "não sei") não há validade; a ficha muda as duas no mesmo passo', () => {
    const e = {
      ...estado(),
      pessoas: estado().pessoas.map((p) =>
        p.id === 'p-ana' ? { ...p, temCarta: true, cartaValidade: '2027-01-01' } : p,
      ),
    };
    expect(validarOperacoes(e, [campo('pessoa', 'p-ana', 'temCarta', true, false)])).toEqual([
      'Ana T. — sem carta (ou sem saber) não há validade da carta.',
    ]);
    expect(
      validarOperacoes(e, [
        campo('pessoa', 'p-ana', 'temCarta', true, null),
        campo('pessoa', 'p-ana', 'cartaValidade', '2027-01-01', null),
      ]),
    ).toEqual([]);
  });
});

describe('validar: rascunhos inteiros e estados aleatórios', () => {
  it('registo criado e apagado no mesmo rascunho com campos pelo meio: nada a validar', () => {
    const e = estado();
    const p = criarProblema({ id: `problema-${ID}20`, casaId: 'casa-1', abertoEm: '2026-10-04' });
    const ops = compactarOperacoes([
      operacaoCriar('problema', p),
      campo('problema', p.id, 'texto', p.texto, 'Outro'),
      { tipo: 'registo', entidade: 'problema', id: p.id, de: { ...p, texto: 'Outro' }, para: null },
    ]);
    expect(ops).toEqual([]);
    expect(validarOperacoes(e, ops)).toEqual([]);
  });

  it('criar uma obra (local + obra) e mover pessoas para lá, pela ordem "errada": válido e sem conflitos', () => {
    const e = estadoExemplo();
    const ops: Operacao[] = [
      mover('p-helena', 'obraId', null, obraNova.id),
      mover('p-ana', 'obraId', 'obra-b', obraNova.id),
      operacaoCriar('obra', obraNova),
      operacaoCriar('local', localNovo),
    ];
    expect(encontrarConflitos(e, compactarOperacoes(ops))).toEqual([]);
    expect(validarOperacoes(e, compactarOperacoes(ops))).toEqual([]);
  });

  it('em estados aleatórios (com referências partidas antigas), mudar um campo válido não acusa nada', () => {
    for (let semente = 1; semente <= 30; semente++) {
      const e = estadoAleatorio(semente);
      const casa = e.casas[0];
      if (!casa) continue;
      expect(
        validarOperacoes(e, [campo('casa', casa.id, 'equipamento', null, 'Máquina')]),
        `semente ${semente}`,
      ).toEqual([]);
    }
  });
});
