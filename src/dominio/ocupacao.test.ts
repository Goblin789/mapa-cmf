import { describe, expect, it } from 'vitest';
import casasIniciais from '../../dados-iniciais/casas.json';
import { avisoContrato, lotacaoEfetiva, nivelLotacao, ocupacaoCarrinha, ocupacaoCasa } from './ocupacao';
import { criarCarrinha, criarCasa } from './teste-fabrica';

describe('nivelLotacao', () => {
  it.each([
    [0, 5, 'livre'],
    [4, 5, 'livre'],
    [5, 5, 'cheio'],
    [6, 5, 'excesso'],
    [0, 0, 'cheio'],
    [1, 0, 'excesso'],
  ] as const)('%i ocupados em %i lugares → %s', (ocupados, lugares, esperado) => {
    expect(nivelLotacao(ocupados, lugares)).toBe(esperado);
  });
});

describe('avisoContrato', () => {
  it('sem máximo no contrato: nunca avisa, mesmo com tolerado preenchido ou gente a mais', () => {
    expect(avisoContrato(criarCasa({ lotacao: 12, maxContrato: null, tolerado: null }), 20)).toBe(
      'sem_limite',
    );
    expect(avisoContrato(criarCasa({ lotacao: 12, maxContrato: null, tolerado: 4 }), 20)).toBe('sem_limite');
  });

  it('fronteiras com máximo 4 e tolerado 6 (usados = lotação quando há vagas)', () => {
    const casa = (lotacao: number) => criarCasa({ lotacao, maxContrato: 4, tolerado: 6 });
    expect(avisoContrato(casa(4), 0)).toBe('dentro');
    expect(avisoContrato(casa(5), 0)).toBe('acima_maximo');
    expect(avisoContrato(casa(6), 0)).toBe('acima_maximo');
    expect(avisoContrato(casa(7), 0)).toBe('acima_tolerado');
  });

  it('a lotação conta mesmo com a casa vazia (as vagas são lugares usados)', () => {
    expect(avisoContrato(criarCasa({ lotacao: 8, maxContrato: 4, tolerado: 6 }), 0)).toBe('acima_tolerado');
  });

  it('ocupados acima da lotação: conta quem lá está', () => {
    const casa = criarCasa({ lotacao: 4, maxContrato: 4, tolerado: 6 });
    expect(avisoContrato(casa, 4)).toBe('dentro');
    expect(avisoContrato(casa, 5)).toBe('acima_maximo');
    expect(avisoContrato(casa, 7)).toBe('acima_tolerado');
  });

  it('tolerado desconhecido (null): acima do máximo é sempre só o aviso simples', () => {
    const casa = criarCasa({ lotacao: 12, maxContrato: 8, tolerado: null });
    expect(avisoContrato(casa, 12)).toBe('acima_maximo');
    expect(avisoContrato(casa, 30)).toBe('acima_maximo');
  });

  it('tolerado igual ao máximo: passar o máximo já é passar o tolerado', () => {
    expect(avisoContrato(criarCasa({ lotacao: 7, maxContrato: 6, tolerado: 6 }), 0)).toBe('acima_tolerado');
  });

  it('tolerado abaixo do máximo (dado incoerente): só avisa acima do máximo, e logo como "acima do tolerado"', () => {
    const casa = (lotacao: number) => criarCasa({ lotacao, maxContrato: 8, tolerado: 6 });
    expect(avisoContrato(casa(7), 0)).toBe('dentro');
    expect(avisoContrato(casa(8), 0)).toBe('dentro');
    expect(avisoContrato(casa(9), 0)).toBe('acima_tolerado');
  });

  it('máximo 0 (casa sem contrato válido para ninguém)', () => {
    expect(avisoContrato(criarCasa({ lotacao: 0, maxContrato: 0 }), 0)).toBe('dentro');
    expect(avisoContrato(criarCasa({ lotacao: 1, maxContrato: 0 }), 0)).toBe('acima_maximo');
  });
});

describe('casas que contam sempre como cheias', () => {
  const casa = criarCasa({ lotacao: 4, maxContrato: 3, tolerado: null, sempreCheia: true });

  it('os lugares são os moradores: nunca há lugares livres', () => {
    expect(lotacaoEfetiva(casa, 2)).toBe(2);
    expect(lotacaoEfetiva({ ...casa, sempreCheia: false }, 2)).toBe(4);
    for (let ocupados = 0; ocupados <= 6; ocupados++) {
      expect(ocupacaoCasa(casa, ocupados)).toMatchObject({
        ocupados,
        lotacao: ocupados,
        livres: 0,
        nivel: 'cheio',
        usados: ocupados,
      });
    }
  });

  it('o contrato compara-se com quem lá mora (as vagas não contam)', () => {
    expect(avisoContrato(casa, 3)).toBe('dentro');
    expect(avisoContrato(casa, 4)).toBe('acima_maximo');
    // Sem sempreCheia, as 4 vagas já passavam o máximo 3.
    expect(avisoContrato({ ...casa, sempreCheia: false }, 2)).toBe('acima_maximo');
  });
});

describe('ocupacaoCasa e ocupacaoCarrinha', () => {
  it('excesso: livres nunca fica negativo e usados acompanha os ocupados', () => {
    const oc = ocupacaoCasa(criarCasa({ lotacao: 2, maxContrato: 3, tolerado: 4 }), 5);
    expect(oc).toEqual({
      ocupados: 5,
      lotacao: 2,
      livres: 0,
      nivel: 'excesso',
      aviso: 'acima_tolerado',
      usados: 5,
    });
  });

  it('lotação 0 e ninguém: cheio, 0 livres', () => {
    expect(ocupacaoCasa(criarCasa({ lotacao: 0 }), 0)).toMatchObject({
      livres: 0,
      nivel: 'cheio',
      usados: 0,
    });
    expect(ocupacaoCarrinha(criarCarrinha({ lugares: 0 }), 0)).toEqual({
      ocupados: 0,
      lugares: 0,
      livres: 0,
      nivel: 'cheio',
    });
  });

  it('invariantes para 0..12 × 0..12: livres > 0 ⇔ nível livre; ocupados + livres ≥ lugares', () => {
    for (let lugares = 0; lugares <= 12; lugares++) {
      for (let ocupados = 0; ocupados <= 12; ocupados++) {
        const casa = ocupacaoCasa(criarCasa({ lotacao: lugares, maxContrato: 6, tolerado: 8 }), ocupados);
        const carrinha = ocupacaoCarrinha(criarCarrinha({ lugares }), ocupados);
        for (const oc of [casa, carrinha]) {
          expect(oc.livres).toBeGreaterThanOrEqual(0);
          expect(oc.livres > 0).toBe(oc.nivel === 'livre');
          expect(ocupados + oc.livres).toBeGreaterThanOrEqual(lugares);
        }
        expect(casa.usados).toBe(Math.max(lugares, ocupados));
        expect(casa.aviso).toBe(
          avisoContrato(criarCasa({ lotacao: lugares, maxContrato: 6, tolerado: 8 }), ocupados),
        );
      }
    }
  });
});

describe('casas reais (dados-iniciais/casas.json, moradores do documento)', () => {
  const resultado = Object.fromEntries(
    casasIniciais.map((c) => {
      const casa = criarCasa({
        id: c.id,
        lotacao: c.lotacao,
        maxContrato: c.maxContrato,
        tolerado: c.tolerado,
        sempreCheia: 'sempreCheia' in c && c.sempreCheia === true,
      });
      const oc = ocupacaoCasa(casa, c.moradoresDoc);
      return [c.id, `${oc.nivel}/${oc.aviso}`];
    }),
  );

  it('níveis e avisos de contrato como no documento', () => {
    expect(resultado).toEqual({
      'casa-1-puttelange': 'livre/dentro',
      'casa-2-puttelange': 'cheio/dentro',
      'casa-3-puttelange': 'cheio/acima_tolerado',
      'casa-4-puttelange': 'livre/acima_maximo',
      'casa-2-foret': 'cheio/dentro',
      'casa-6-foret': 'livre/dentro',
      'casa-7-foret': 'livre/dentro',
      'apartamento-e-puttelange': 'cheio/dentro',
      eischen: 'livre/sem_limite',
      steinsel: 'cheio/acima_maximo',
      wasserbillig: 'cheio/acima_tolerado',
      weiler: 'cheio/sem_limite',
      michelbouch: 'cheio/sem_limite',
      walferdange: 'cheio/sem_limite',
      // Conta sempre como cheia (decisão do Rafael), embora tenha 2 lugares e 1 morador.
      schifflange: 'cheio/sem_limite',
    });
  });

  it('Walferdange e Schifflange contam sempre como cheias: 5 lugares livres em vez de 6', () => {
    const sempreCheias = casasIniciais.filter((c) => 'sempreCheia' in c && c.sempreCheia === true);
    expect(sempreCheias.map((c) => c.id)).toEqual(['walferdange', 'schifflange']);
    const livres = casasIniciais.reduce((soma, c) => {
      const casa = criarCasa({
        lotacao: c.lotacao,
        sempreCheia: 'sempreCheia' in c && c.sempreCheia === true,
      });
      return soma + ocupacaoCasa(casa, c.moradoresDoc).livres;
    }, 0);
    expect(livres).toBe(5);
  });

  it('totais do documento: 110 lugares, 104 moradores, 6 livres', () => {
    const lugares = casasIniciais.reduce((s, c) => s + c.lotacao, 0);
    const moradores = casasIniciais.reduce((s, c) => s + c.moradoresDoc, 0);
    expect(lugares).toBe(110);
    expect(moradores).toBe(104);
    expect(lugares - moradores).toBe(6);
  });

  it('nenhuma casa tem tolerado abaixo do máximo nem tolerado sem máximo', () => {
    for (const c of casasIniciais) {
      if (c.tolerado !== null) {
        expect(c.maxContrato).not.toBeNull();
        expect(c.tolerado).toBeGreaterThanOrEqual(c.maxContrato as number);
      }
    }
  });
});
