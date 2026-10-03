import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import {
  descricaoArrastados,
  partesArrastados,
  partesPrevisao,
  preverLargada,
  textoArrastados,
  textoLargado,
  textoPrevisao,
} from './previsao';

const estado = estadoExemplo();
const ind = indexar(estado);

describe('textoArrastados', () => {
  it('um nome, ou o nome e quantos mais', () => {
    expect(textoArrastados('Gil N.', 1)).toBe('Gil N.');
    expect(textoArrastados('Gil N.', 3)).toBe('Gil N. +2');
    expect(partesArrastados('Gil N.', 2)).toEqual({ nome: 'Gil N.', mais: '+1' });
    expect(partesArrastados('Gil N.', 1)).toEqual({ nome: 'Gil N.', mais: null });
  });

  it('frase para os leitores de ecrã', () => {
    expect(descricaoArrastados('Ana T.', 1)).toBe('Ana T.');
    expect(descricaoArrastados('Ana T.', 2)).toBe('Ana T. e mais 1 pessoa');
    expect(descricaoArrastados('Ana T.', 4)).toBe('Ana T. e mais 3 pessoas');
  });
});

describe('preverLargada', () => {
  it('casa com lugares: antes + entram = depois/lotação, com o nível', () => {
    const p = preverLargada(estado, ind, ['p-gil', 'p-helena'], { tipo: 'casa', id: 'casa-3' });
    expect(p).toMatchObject({
      rotulo: 'Casa Três',
      antes: 0,
      entram: 2,
      depois: 2,
      lugares: 4,
      nivel: 'livre',
    });
    expect(p && textoPrevisao(p)).toBe('Casa Três: 0 + 2 = 2/4 ○');
  });

  it('casa que fica com gente a mais', () => {
    const p = preverLargada(estado, ind, ['p-gil'], { tipo: 'casa', id: 'casa-1' });
    expect(p && textoPrevisao(p)).toBe('Casa Um: 3 + 1 = 4/3 ▲');
    expect(p && partesPrevisao(p)).toEqual({ texto: 'Casa Um: 3 + 1 = ', resultado: '4/3', simbolo: '▲' });
  });

  it('quem já lá está não conta', () => {
    const p = preverLargada(estado, ind, ['p-ana', 'p-gil'], { tipo: 'casa', id: 'casa-1' });
    expect(p).toMatchObject({ arrastadas: 2, entram: 1, depois: 4 });
    const ja = preverLargada(estado, ind, ['p-ana'], { tipo: 'casa', id: 'casa-1' });
    expect(ja && textoPrevisao(ja)).toBe('Casa Um: já está aqui');
    const jaDuas = preverLargada(estado, ind, ['p-ana', 'p-bruno'], { tipo: 'casa', id: 'casa-1' });
    expect(jaDuas && textoPrevisao(jaDuas)).toBe('Casa Um: já estão aqui');
  });

  it('carrinha: matrícula formatada e lugares', () => {
    const p = preverLargada(estado, ind, ['p-elsa'], { tipo: 'carrinha', id: 'zz1002' });
    expect(p && textoPrevisao(p)).toBe('ZZ 1002: 2 + 1 = 3/2 ▲');
    const cheia = preverLargada(estado, ind, ['p-elsa'], { tipo: 'carrinha', id: 'zz1001' });
    expect(cheia && textoPrevisao(cheia)).toBe('ZZ 1001: 4 + 1 = 5/5 ●');
  });

  it('grupos sem lugares e obras: só a contagem', () => {
    const fora = preverLargada(estado, ind, ['p-ana'], { tipo: 'fora' });
    expect(fora && textoPrevisao(fora)).toBe('Fora das casas CMF: 2 + 1 = 3');
    expect(fora?.nivel).toBeNull();
    const sem = preverLargada(estado, ind, ['p-ana'], { tipo: 'sem-transporte' });
    expect(sem && textoPrevisao(sem)).toBe('Sem transporte da empresa: 2 + 1 = 3');
    // Sem obra: Bruno, Célia, Duarte, Elsa e Helena (a inativa não conta).
    const semObra = preverLargada(estado, ind, ['p-ana'], { tipo: 'sem-obra' });
    expect(semObra && textoPrevisao(semObra)).toBe('Sem obra: 5 + 1 = 6');
    const obra = preverLargada(estado, ind, ['p-ana'], { tipo: 'obra', id: 'obra-a' });
    expect(obra && textoPrevisao(obra)).toBe('Obra Alfa: 1 + 1 = 2');
  });

  it('pessoas inativas não ocupam lugares', () => {
    const p = preverLargada(estado, ind, ['p-ivo', 'p-gil'], { tipo: 'casa', id: 'casa-1' });
    expect(p).toMatchObject({ entram: 1, depois: 4 });
  });

  it('alvo que não existe: null', () => {
    expect(preverLargada(estado, ind, ['p-ana'], { tipo: 'casa', id: 'nao-existe' })).toBeNull();
    expect(preverLargada(estado, ind, ['p-ana'], { tipo: 'carrinha', id: 'nao-existe' })).toBeNull();
    expect(preverLargada(estado, ind, ['p-ana'], { tipo: 'obra', id: 'nao-existe' })).toBeNull();
  });
});

describe('textoLargado', () => {
  it('diz quantas mudaram, ou que nada mudou', () => {
    expect(textoLargado(1, 'Casa Um', 1)).toBe('1 pessoa mudada para Casa Um.');
    expect(textoLargado(3, 'ZZ 1001', 3)).toBe('3 pessoas mudadas para ZZ 1001.');
    expect(textoLargado(0, 'Casa Um', 1)).toBe('Nada mudou: já estava em Casa Um.');
    expect(textoLargado(0, 'Casa Um', 2)).toBe('Nada mudou: já estavam em Casa Um.');
  });
});
