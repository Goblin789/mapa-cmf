// Testes de dominio/problemas.ts (M2): problemas das casas e carrinhas e os avisos ao escrever. Dados fictícios.

import { describe, expect, it } from 'vitest';
import {
  AVISO_COMENTARIO_SEM_MOTIVO,
  alvoDoProblema,
  avisoTextoProblema,
  avisoTextoSaude,
  chaveAlvoProblema,
  MAX_TEXTO_PROBLEMA,
  operacaoNovoProblema,
  operacaoResolverProblema,
  problemasAbertosPorAlvo,
  problemasDe,
} from './problemas';
import { criarEstado, criarPessoa, criarProblema } from './teste-fabrica';

const aberto = criarProblema({ id: 'a1', casaId: 'casa-1', abertoEm: '2026-09-01' });
const abertoRecente = criarProblema({ id: 'a2', casaId: 'casa-1', abertoEm: '2026-10-01' });
const resolvido = criarProblema({
  id: 'r1',
  casaId: 'casa-1',
  abertoEm: '2026-09-20',
  resolvidoEm: '2026-09-21',
});
const daCarrinha = criarProblema({ id: 'c1', casaId: null, carrinhaId: 'zz1001', texto: 'Pneu furado' });
const estado = criarEstado({ problemas: [resolvido, aberto, daCarrinha, abertoRecente] });

describe('problemas', () => {
  it('alvo e chave', () => {
    expect(alvoDoProblema(aberto)).toEqual({ tipo: 'casa', id: 'casa-1' });
    expect(alvoDoProblema(daCarrinha)).toEqual({ tipo: 'carrinha', id: 'zz1001' });
    expect(alvoDoProblema({ ...aberto, casaId: null })).toBeNull();
    expect(chaveAlvoProblema({ tipo: 'carrinha', id: 'zz1001' })).toBe('carrinha:zz1001');
    expect(MAX_TEXTO_PROBLEMA).toBe(120);
  });

  it('da casa: os abertos primeiro (mais recentes primeiro), depois os resolvidos', () => {
    expect(problemasDe(estado, { tipo: 'casa', id: 'casa-1' }).map((p) => p.id)).toEqual(['a2', 'a1', 'r1']);
    expect(problemasDe(estado, { tipo: 'carrinha', id: 'zz1001' }).map((p) => p.id)).toEqual(['c1']);
  });

  it('abertos por alvo (sem os resolvidos)', () => {
    const porAlvo = problemasAbertosPorAlvo(estado);
    expect(porAlvo.get('casa:casa-1')?.map((p) => p.id)).toEqual(['a1', 'a2']);
    expect(porAlvo.get('carrinha:zz1001')?.length).toBe(1);
    expect(porAlvo.has('casa:casa-2')).toBe(false);
  });

  it('novo (aberto hoje) e resolver/reabrir', () => {
    expect(
      operacaoNovoProblema({ tipo: 'carrinha', id: 'zz1001' }, 'Luz do travão', '2026-10-04', () => 'x1'),
    ).toEqual({
      tipo: 'registo',
      entidade: 'problema',
      id: 'problema-x1',
      de: null,
      para: {
        id: 'problema-x1',
        casaId: null,
        carrinhaId: 'zz1001',
        texto: 'Luz do travão',
        abertoEm: '2026-10-04',
        resolvidoEm: null,
      },
    });
    expect(operacaoResolverProblema(estado, 'a1', '2026-10-04')).toMatchObject({
      de: null,
      para: '2026-10-04',
    });
    expect(operacaoResolverProblema(estado, 'r1', null)).toMatchObject({ de: '2026-09-21', para: null });
    expect(operacaoResolverProblema(estado, 'a1', null)).toBeNull();
  });
});

describe('avisos ao escrever', () => {
  const pessoas = {
    pessoas: [
      criarPessoa({ nomeCurto: 'Ana T.' }),
      criarPessoa({ nomeCurto: 'Rui' }),
      criarPessoa({ nomeCurto: 'Al' }),
    ],
  };

  it('sem falsos alarmes óbvios', () => {
    for (const texto of [
      'Pneu furado',
      'Janela partida na sala',
      'Lotação mais baixa do que o contrato',
      'Esquentador avariado desde 2026-10-04',
      'CF 5001: luz do travão',
      'Acidente na A4, para-choques amolgado',
      'Precisa de reparação com urgência',
      'Falta a chave do portão (Al)',
      'Ruído no motor',
      '',
    ]) {
      expect(avisoTextoProblema(texto, pessoas), texto).toBeNull();
    }
  });

  it('nomes no mapa com 3 ou mais letras (sem acentos nem maiúsculas)', () => {
    expect(avisoTextoProblema('A Ana T. partiu a janela', pessoas)).toBe(
      'Parece o nome de uma pessoa: o problema é sobre a casa ou a carrinha, não sobre quem lá está.',
    );
    expect(avisoTextoProblema('o rui deixou a porta aberta', pessoas)).not.toBeNull();
    expect(avisoTextoProblema('ANA T partiu', pessoas)).not.toBeNull();
  });

  it('telefones com 6 ou mais algarismos', () => {
    expect(avisoTextoProblema('Ligar ao senhorio 691 000 000', pessoas)).toBe(
      'Parece um número de telefone: o problema é sobre a casa ou a carrinha.',
    );
    expect(avisoTextoProblema('tel +352691000000', pessoas)).not.toBeNull();
    expect(avisoTextoProblema('ligar 12345', pessoas)).toBeNull();
  });

  it('uma data no texto não esconde um telefone, nem passa por um', () => {
    expect(avisoTextoProblema('desde 2026-10-01, ligar 691 000 000', pessoas)).toBe(
      'Parece um número de telefone: o problema é sobre a casa ou a carrinha.',
    );
    expect(avisoTextoProblema('ligar 621.12.10.56', pessoas)).not.toBeNull();
    expect(avisoTextoProblema('691-000-000 (desde 01.10.2026)', pessoas)).not.toBeNull();
    for (const texto of ['Porta partida desde 01.10.2026', 'Avaria de 1/10/26 a 03-10-2026']) {
      expect(avisoTextoProblema(texto, pessoas), texto).toBeNull();
    }
  });

  it('saúde', () => {
    for (const texto of [
      'Está de baixa',
      'Baixa médica até sexta',
      'Foi ao hospital',
      'Está doente',
      'Acidente de trabalho',
      'Ficou internado',
      'Tem consultas às terças',
    ]) {
      expect(avisoTextoProblema(texto, pessoas), texto).toBe(
        'Não escrevas dados de saúde: o problema é sobre a casa ou a carrinha.',
      );
    }
  });

  it('o comentário do Guardar só avisa de saúde', () => {
    expect(avisoTextoSaude('Ana T. passa para a Casa Dois')).toBeNull();
    expect(avisoTextoSaude('Lotação mais baixa na Casa Um')).toBeNull();
    expect(avisoTextoSaude('Ligar 691 000 000')).toBeNull();
    expect(avisoTextoSaude('O João está de baixa')).toBe(AVISO_COMENTARIO_SEM_MOTIVO);
    expect(avisoTextoSaude('foi ao médico')).toBe(AVISO_COMENTARIO_SEM_MOTIVO);
    expect(avisoTextoSaude('   ')).toBeNull();
  });
});
