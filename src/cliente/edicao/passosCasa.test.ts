// Testes dos passos das casas (05/10/2026: "Nova casa" e "Apagar casa…"). Dados fictícios.

import { describe, expect, it } from 'vitest';
import { RAIO_OMISSAO } from '../../dominio/campos';
import { aplicarOperacoes, type Operacao, validarOperacoes } from '../../dominio/operacoes';
import { criarCasa, criarLocal, criarProblema, estadoExemplo } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import {
  avisoToleradoCasa,
  type DadosCasa,
  errosNovaCasa,
  lerInteiro,
  opcoesMoradasDeCasas,
  passoApagarCasa,
  passoCriarCasa,
  resumoApagarCasa,
  textoOQueImpede,
  tituloApagarCasa,
} from './passosCasa';
import { agruparAlteracoesM2, resumirPasso } from './resumo';

/** UUIDs previsíveis, no formato que o servidor aceita ("…-000000000001"). */
function gerador() {
  let n = 0;
  return () => `1b2c3d4e-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

const NOVA: DadosCasa = {
  nome: '  Casa   Fictícia ',
  morada: { tipo: 'existente', localId: 'local-a' },
  apartamento: ' Ap. 3 ',
  lotacao: '6',
  maxContrato: '5',
  tolerado: '6',
};

const MORADA_NOVA = { morada: ' 2 Rue Fictícia ', pais: 'FR', lat: 49.2, lng: 6.5 } as const;

describe('Nova casa', () => {
  it('numa morada que já existe: só a casa, no fim da ordem, sem "lugares iguais aos moradores"', () => {
    const e = estadoExemplo();
    const r = passoCriarCasa(e, NOVA, gerador());
    expect(r.erros).toEqual([]);
    expect(r.ops).toEqual([
      {
        tipo: 'registo',
        entidade: 'casa',
        id: 'casa-1b2c3d4e-0000-4000-8000-000000000001',
        de: null,
        para: {
          id: 'casa-1b2c3d4e-0000-4000-8000-000000000001',
          nome: 'Casa Fictícia',
          localId: 'local-a',
          apartamento: 'Ap. 3',
          lotacao: 6,
          maxContrato: 5,
          tolerado: 6,
          notaContrato: null,
          senhorio: null,
          equipamento: null,
          sempreCheia: false,
          ordem: 4,
        },
      },
    ]);
    expect(r.casaId).toBe('casa-1b2c3d4e-0000-4000-8000-000000000001');
    expect(validarOperacoes(e, r.ops ?? [])).toEqual([]);
  });

  it('numa morada nova: o local (tipo casa, com o nome da casa) e a casa, num só passo', () => {
    const e = estadoExemplo();
    const r = passoCriarCasa(e, { ...NOVA, morada: { tipo: 'nova', valor: MORADA_NOVA } }, gerador());
    const ops = r.ops ?? [];
    expect(ops.map((op) => (op.tipo === 'registo' ? op.entidade : op.tipo))).toEqual(['local', 'casa']);
    expect(ops[0]).toMatchObject({
      para: {
        id: 'local-1b2c3d4e-0000-4000-8000-000000000001',
        tipo: 'casa',
        nome: 'Casa Fictícia',
        morada: '2 Rue Fictícia',
        pais: 'FR',
        raioM: RAIO_OMISSAO,
      },
    });
    expect(ops[1]).toMatchObject({ para: { localId: 'local-1b2c3d4e-0000-4000-8000-000000000001' } });
    expect(validarOperacoes(e, ops)).toEqual([]);
    // Aparece logo no estado visível (o Mapa, as listas e o Quadro partem dele).
    const visivel = aplicarOperacoes(e, ops);
    expect(visivel.casas.at(-1)?.nome).toBe('Casa Fictícia');
    expect(visivel.locais.some((l) => l.id === 'local-1b2c3d4e-0000-4000-8000-000000000001')).toBe(true);
    // No Guardar: uma secção própria, com a morada na frase da casa (o local não repete).
    expect(agruparAlteracoesM2(e, visivel, ops)).toEqual([
      {
        seccao: 'casas',
        titulo: 'Casas novas e apagadas',
        itens: [{ quem: 'Casa Fictícia', frases: ['criada (2 Rue Fictícia)'] }],
      },
    ]);
    expect(resumirPasso(e, ops)).toBe('Nova casa: Casa Fictícia');
  });

  it('o que falta: nome (repetido sem acentos nem maiúsculas), morada, pino, lotação, números, tolerado', () => {
    const e = estadoExemplo();
    expect(errosNovaCasa(e, { ...NOVA, nome: ' ' })).toEqual(['Falta o nome da casa.']);
    expect(errosNovaCasa(e, { ...NOVA, nome: 'casa um' })).toEqual([
      'Já há uma casa com este nome: escolhe outro (ex.: junta o apartamento ou a rua).',
    ]);
    expect(errosNovaCasa(e, { ...NOVA, morada: { tipo: 'existente', localId: null } })).toEqual([
      'Escolhe a morada da casa.',
    ]);
    // Com o serviço de moradas desligado basta o pino; sem ele, não.
    expect(
      errosNovaCasa(e, { ...NOVA, morada: { tipo: 'nova', valor: { ...MORADA_NOVA, morada: '' } } }),
    ).toEqual([]);
    expect(
      errosNovaCasa(e, {
        ...NOVA,
        morada: { tipo: 'nova', valor: { ...MORADA_NOVA, lat: null, lng: null } },
      }),
    ).toEqual(['Falta o pino da casa: procura a morada ou clica no mini-mapa.']);
    expect(errosNovaCasa(e, { ...NOVA, lotacao: '' })).toEqual([
      'Falta a lotação (quantas pessoas cabem na casa).',
    ]);
    expect(errosNovaCasa(e, { ...NOVA, lotacao: '0' })).toEqual(['A lotação é um número inteiro de 1 a 60.']);
    expect(errosNovaCasa(e, { ...NOVA, maxContrato: '', tolerado: '' })).toEqual([]);
    expect(errosNovaCasa(e, { ...NOVA, maxContrato: 'dez' })).toEqual([
      'O máx. do contrato é um número inteiro de 0 a 60 (ou fica vazio).',
    ]);
    expect(errosNovaCasa(e, { ...NOVA, maxContrato: '7', tolerado: '6' })).toEqual([
      'O tolerado (6) não pode ser menor do que o máx. do contrato (7).',
    ]);
  });

  it('aviso do tolerado e números escritos', () => {
    expect(avisoToleradoCasa('6', '5')).toBe(
      'O tolerado (5) não pode ser menor do que o máx. do contrato (6).',
    );
    expect(avisoToleradoCasa('6', '6')).toBeNull();
    expect(avisoToleradoCasa('', '5')).toBeNull();
    expect(lerInteiro(' 8 ')).toBe(8);
    expect(lerInteiro('')).toBeNull();
    expect(lerInteiro('8,5')).toBeNaN();
  });

  it('as moradas para escolher: só os locais de casas, com as casas que lá estão', () => {
    const e = estadoExemplo();
    expect(opcoesMoradasDeCasas(e).map((o) => [o.valor, o.casas])).toEqual([
      ['local-a', ['Casa Dois', 'Casa Um']],
      ['local-b', ['Casa Três']],
    ]);
  });
});

/** estadoExemplo com a ZZ 1003 a dormir na Casa Um e um problema resolvido e outro aberto na Casa Dois. */
function estadoComCasaUmOcupada(): Estado {
  const e = estadoExemplo();
  return {
    ...e,
    carrinhas: e.carrinhas.map((c) => (c.id === 'zz1003' ? { ...c, dormeCasaId: 'casa-1' } : c)),
    problemas: [
      criarProblema({
        id: 'pr-res',
        casaId: 'casa-1',
        texto: 'Luz',
        abertoEm: '2026-09-01',
        resolvidoEm: '2026-09-02',
      }),
      criarProblema({ id: 'pr-aberto', casaId: 'casa-2', texto: 'Porta', abertoEm: '2026-10-01' }),
    ],
  };
}

describe('Apagar casa', () => {
  it('diz o que impede e tira no mesmo passo os moradores, onde dorme e os problemas resolvidos', () => {
    const e = estadoComCasaUmOcupada();
    const resumo = resumoApagarCasa(e, 'casa-1');
    expect(resumo && textoOQueImpede(resumo)).toBe('Tem 3 moradores e a ZZ 1003 dorme lá.');
    expect(resumo).toMatchObject({ problemasAbertos: 0, problemasResolvidos: 1, localApagado: null });
    const ops = passoApagarCasa(e, 'casa-1') as Operacao[];
    expect(
      ops.map((op) => (op.tipo === 'mover' ? op.pessoaId : op.tipo === 'registo' ? op.entidade : op.tipo)),
    ).toEqual(['p-ana', 'p-bruno', 'p-celia', 'dormida', 'problema', 'casa']);
    expect(validarOperacoes(e, ops)).toEqual([]);
    const depois = aplicarOperacoes(e, ops);
    expect(depois.casas.some((c) => c.id === 'casa-1')).toBe(false);
    expect(depois.pessoas.filter((p) => p.casaId === 'casa-1')).toEqual([]);
    expect(depois.carrinhas.find((c) => c.id === 'zz1003')?.dormeCasaId).toBeNull();
    expect(resumirPasso(e, ops)).toBe('Casa apagada: Casa Um');
    expect(agruparAlteracoesM2(e, depois, ops).map((g) => [g.seccao, g.itens])).toEqual([
      ['casas', [{ quem: 'Casa Um', frases: ['apagada'] }]],
      ['problemas', [{ quem: 'Casa Um', frases: ['problema apagado: «Luz»'] }]],
    ]);
  });

  it('com problemas por resolver não se apaga (o passo monta-se, mas o domínio recusa-o)', () => {
    const e = estadoComCasaUmOcupada();
    expect(resumoApagarCasa(e, 'casa-2')?.problemasAbertos).toBe(1);
    expect(validarOperacoes(e, passoApagarCasa(e, 'casa-2') as Operacao[])).toEqual([
      'Casa Dois — tem 1 problema por resolver: resolve-o antes de a apagar.',
    ]);
  });

  it('a morada criada no programa sai com a casa, se mais nada a usar; a dos dados iniciais fica', () => {
    const local = criarLocal({
      id: 'local-1b2c3d4e-0000-4000-8000-000000000009',
      tipo: 'casa',
      nome: 'Nova',
    });
    const casa = criarCasa({
      id: 'casa-1b2c3d4e-0000-4000-8000-000000000009',
      nome: 'Nova',
      localId: local.id,
    });
    const base = estadoExemplo();
    const e: Estado = { ...base, locais: [...base.locais, local], casas: [...base.casas, casa] };
    const resumo = resumoApagarCasa(e, casa.id);
    expect(resumo && textoOQueImpede(resumo)).toBeNull();
    expect(resumo?.localApagado?.id).toBe(local.id);
    const ops = passoApagarCasa(e, casa.id) as Operacao[];
    expect(ops.map((op) => (op.tipo === 'registo' ? op.entidade : op.tipo))).toEqual(['casa', 'local']);
    expect(validarOperacoes(e, ops)).toEqual([]);
    // A Casa Três está sozinha na Morada B, mas a morada veio dos dados iniciais.
    expect(resumoApagarCasa(e, 'casa-3')).toMatchObject({
      localApagado: null,
      localQueFica: { id: 'local-b' },
    });
    // Com outra casa na mesma morada nova, a morada fica.
    const outra = criarCasa({
      id: 'casa-1b2c3d4e-0000-4000-8000-000000000010',
      nome: 'Nova 2',
      localId: local.id,
    });
    const partilhada: Estado = { ...e, casas: [...e.casas, outra] };
    expect(resumoApagarCasa(partilhada, casa.id)?.localApagado).toBeNull();
    expect(passoApagarCasa(partilhada, casa.id)?.map((op) => op.tipo)).toEqual(['registo']);
  });

  it('a casa que já não existe', () => {
    expect(passoApagarCasa(estadoExemplo(), 'nao-existe')).toBeNull();
    expect(resumoApagarCasa(estadoExemplo(), 'nao-existe')).toBeNull();
  });
});

describe('tituloApagarCasa', () => {
  it('sem "casa" repetido: as casas que já se chamam "Casa …" ou "Apartamento …" não levam "a casa"', () => {
    expect(tituloApagarCasa('Casa 2 Puttelange')).toBe('Apagar a Casa 2 Puttelange?');
    expect(tituloApagarCasa('casa ensaio')).toBe('Apagar a casa ensaio?');
    expect(tituloApagarCasa('Apartamento E Puttelange')).toBe('Apagar o Apartamento E Puttelange?');
    expect(tituloApagarCasa('Eischen')).toBe('Apagar a casa Eischen?');
    expect(tituloApagarCasa('Casablanca')).toBe('Apagar a casa Casablanca?');
  });
});
