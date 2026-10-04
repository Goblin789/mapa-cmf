import { describe, expect, it } from 'vitest';
import { LIMITES } from '../../dominio/campos';
import {
  arredondarCoordenada,
  CONFIANCA_MINIMA,
  limparMorada,
  moradaEntraSemPerguntar,
  NOMES_PAIS,
  pedirMoradaAoAbrir,
  precisaConfirmarPino,
  temPinoValido,
  textoPosicao,
  vistaInicialMiniMapa,
  ZOOM_MINI_MAPA,
} from './morada';

describe('campo da morada (regras puras)', () => {
  it('o Luxemburgo vem primeiro (é o país por omissão) e estão os quatro países', () => {
    expect(NOMES_PAIS.map((p) => p.pais)).toEqual(['LU', 'FR', 'BE', 'DE']);
  });

  it('limparMorada: aparada, numa linha, sem espaços repetidos e no máximo do campo', () => {
    expect(limparMorada('  1 Rue Fictícia,\n  L-0000   Lugar ')).toBe('1 Rue Fictícia, L-0000 Lugar');
    expect(limparMorada('   ')).toBe('');
    expect(limparMorada('x'.repeat(400))).toHaveLength(LIMITES.textoLongo);
  });

  it('pino válido: com as duas coordenadas e dentro da região do mapa', () => {
    expect(temPinoValido({ lat: 49.61, lng: 6.13 })).toBe(true);
    expect(temPinoValido({ lat: null, lng: 6.13 })).toBe(false);
    expect(temPinoValido({ lat: 48.85, lng: 2.35 })).toBe(false);
  });

  it('confirmar o pino abaixo de 0,8 de confiança (e sem confiança que se perceba)', () => {
    expect(CONFIANCA_MINIMA).toBe(0.8);
    expect(precisaConfirmarPino(0.95)).toBe(false);
    expect(precisaConfirmarPino(0.8)).toBe(false);
    expect(precisaConfirmarPino(0.79)).toBe(true);
    expect(precisaConfirmarPino(Number.NaN)).toBe(true);
  });

  it('a morada do ponto só entra sozinha com o campo vazio ou com a que o próprio campo lá pôs', () => {
    expect(moradaEntraSemPerguntar('', null)).toBe(true);
    expect(moradaEntraSemPerguntar('   ', 'Rua A')).toBe(true);
    expect(moradaEntraSemPerguntar('Rua A, 1', 'Rua A,  1')).toBe(true);
    // A pessoa escreveu outra coisa: fica como sugestão ("Usar esta morada").
    expect(moradaEntraSemPerguntar('Rua escrita à mão', 'Rua A, 1')).toBe(false);
    expect(moradaEntraSemPerguntar('Rua escrita à mão', null)).toBe(false);
  });

  it('coordenadas arredondadas a 6 casas e escritas com 5', () => {
    expect(arredondarCoordenada(49.6112345678)).toBe(49.611235);
    expect(textoPosicao(49.611235, 6.1)).toBe('49.61124, 6.10000');
  });

  it('ao abrir com pino e sem morada ("Nova obra aqui"), pede-se a morada e o país do ponto', () => {
    const doMapa = { morada: '', pais: 'LU' as const, lat: 49.632, lng: 6.7166 };
    expect(pedirMoradaAoAbrir(doMapa, true)).toBe(true);
    // Só quando quem abre o pede (a ficha da casa não), com pino válido e com o campo vazio.
    expect(pedirMoradaAoAbrir(doMapa, false)).toBe(false);
    expect(pedirMoradaAoAbrir({ ...doMapa, morada: 'Rua escrita' }, true)).toBe(false);
    expect(pedirMoradaAoAbrir({ ...doMapa, lat: null, lng: null }, true)).toBe(false);
    expect(pedirMoradaAoAbrir({ ...doMapa, lat: 48.85, lng: 2.35 }, true)).toBe(false);
  });

  it('o mini-mapa abre no pino; sem pino, à volta do centro dado (na região); senão no Luxemburgo inteiro', () => {
    const obra = { lat: 49.632, lng: 6.7166 };
    expect(vistaInicialMiniMapa({ lat: 49.6, lng: 6.1 }, obra)).toEqual({
      centro: [49.6, 6.1],
      zoom: ZOOM_MINI_MAPA.comPino,
    });
    expect(vistaInicialMiniMapa({ lat: null, lng: null }, obra)).toEqual({
      centro: [49.632, 6.7166],
      zoom: ZOOM_MINI_MAPA.centroInicial,
    });
    expect(vistaInicialMiniMapa({ lat: null, lng: null }, { lat: 48.85, lng: 2.35 }).zoom).toBe(
      ZOOM_MINI_MAPA.semPino,
    );
    expect(vistaInicialMiniMapa({ lat: null, lng: null }, null).zoom).toBe(ZOOM_MINI_MAPA.semPino);
  });
});
