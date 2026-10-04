import { describe, expect, it } from 'vitest';
import {
  type EntradaPosicao,
  LARGURA_AVISOS,
  MARGEM_AVISOS,
  maiorIntervaloLivre,
  type Posicao,
  posicaoAvisos,
  type Retangulo,
} from './posicao';

function ret(esquerda: number, topo: number, largura: number, altura: number): Retangulo {
  return { esquerda, topo, direita: esquerda + largura, fundo: topo + altura };
}

/** PC 1366 × 768: mapa de 0 a 1014 (a lista lateral à direita), cabeçalho até 50. */
function pc(parcial: Partial<EntradaPosicao> = {}): EntradaPosicao {
  return {
    alturaJanela: 768,
    faixa: { esquerda: 0, direita: 1014 },
    obstaculos: [],
    altura: 100,
    topoMinimo: 50,
    ...parcial,
  };
}

/** A pilha nesta posição tapa o retângulo? */
function tapa(p: Posicao, altura: number, alturaJanela: number, o: Retangulo): boolean {
  const fundo = alturaJanela - p.fundo;
  const topo = fundo - altura;
  return o.topo < fundo && o.fundo > topo && o.direita > p.esquerda && o.esquerda < p.esquerda + p.largura;
}

describe('maiorIntervaloLivre', () => {
  it('sem nada ocupado: tudo', () => {
    expect(maiorIntervaloLivre(0, 100, [])).toStrictEqual({ esquerda: 0, direita: 100 });
  });

  it('desconta os ocupados com margem e devolve o maior espaço', () => {
    const livre = maiorIntervaloLivre(0, 1000, [
      { esquerda: 0, direita: 200 },
      { esquerda: 900, direita: 1000 },
    ]);
    expect(livre).toStrictEqual({ esquerda: 200 + MARGEM_AVISOS, direita: 900 - MARGEM_AVISOS });
  });

  it('ocupados sobrepostos e fora de ordem', () => {
    const livre = maiorIntervaloLivre(0, 1000, [
      { esquerda: 500, direita: 600 },
      { esquerda: 100, direita: 550 },
    ]);
    expect(livre).toStrictEqual({ esquerda: 600 + MARGEM_AVISOS, direita: 1000 });
  });
});

describe('posicaoAvisos', () => {
  it('sem obstáculos: em baixo, ao centro do mapa', () => {
    expect(posicaoAvisos(pc())).toStrictEqual({
      esquerda: 507 - LARGURA_AVISOS / 2,
      largura: LARGURA_AVISOS,
      fundo: MARGEM_AVISOS,
    });
  });

  it('legenda à esquerda e zoom à direita, com espaço no meio: fica no meio sem os tapar', () => {
    const legenda = ret(12, 505, 190, 251);
    const zoom = ret(970, 680, 34, 66);
    const p = posicaoAvisos(pc({ obstaculos: [legenda, zoom] }));
    expect(p.fundo).toBe(MARGEM_AVISOS);
    expect(p.esquerda).toBe(507 - LARGURA_AVISOS / 2);
    expect(tapa(p, 100, 768, legenda) || tapa(p, 100, 768, zoom)).toBe(false);
  });

  it('o centro está ocupado, mas há espaço ao lado: desvia-se sem subir', () => {
    // Um aviso do modo de edição em baixo ao centro da janela (que não é o centro do mapa).
    const avisoEdicao = ret(500, 700, 300, 40);
    const p = posicaoAvisos(pc({ obstaculos: [avisoEdicao] }));
    expect(p.fundo).toBe(MARGEM_AVISOS);
    expect(tapa(p, 100, 768, avisoEdicao)).toBe(false);
    expect(p.largura).toBe(LARGURA_AVISOS);
  });

  it('mapa estreito (lista alargada): ao lado da legenda não cabe e sobe para cima dela', () => {
    const legenda = ret(12, 505, 190, 251);
    const zoom = ret(410, 680, 34, 66);
    const p = posicaoAvisos(pc({ faixa: { esquerda: 0, direita: 456 }, obstaculos: [legenda, zoom] }));
    expect(768 - p.fundo).toBeLessThanOrEqual(505 - MARGEM_AVISOS);
    expect(p.largura).toBe(Math.min(LARGURA_AVISOS, 456 - 2 * MARGEM_AVISOS));
  });

  it('telemóvel: sobe o mínimo para não tapar o botão da legenda, o zoom nem a atribuição', () => {
    const botaoLegenda = ret(12, 755, 90, 36);
    const zoom = ret(344, 730, 34, 60);
    const atribuicao = ret(240, 785, 150, 16);
    const entrada = {
      alturaJanela: 844,
      faixa: { esquerda: 0, direita: 390 },
      obstaculos: [botaoLegenda, zoom, atribuicao],
      altura: 80,
      topoMinimo: 0,
    };
    const p = posicaoAvisos(entrada);
    for (const o of entrada.obstaculos) expect(tapa(p, 80, 844, o)).toBe(false);
    expect(p.largura).toBe(390 - 2 * MARGEM_AVISOS);
    // Logo acima do zoom (o mais alto dos três), não mais.
    expect(844 - p.fundo).toBe(zoom.topo - MARGEM_AVISOS);
  });

  it('nunca sobe acima do cabeçalho ou da barra de edição: sem sítio, fica em baixo', () => {
    // Uma coluna alta a ocupar o mapa todo (ex.: painel de foco num ecrã muito baixo).
    const parede = ret(0, 60, 1014, 700);
    expect(posicaoAvisos(pc({ obstaculos: [parede], topoMinimo: 50 })).fundo).toBe(MARGEM_AVISOS);
  });

  it('obstáculos fora da faixa (ex.: na lista lateral) não contam', () => {
    const naLista = ret(1100, 600, 200, 160);
    expect(posicaoAvisos(pc({ obstaculos: [naLista] })).fundo).toBe(MARGEM_AVISOS);
  });

  it('faixa mais estreita do que a largura dos avisos: ocupa-a toda menos as margens', () => {
    expect(posicaoAvisos(pc({ faixa: { esquerda: 0, direita: 320 } }))).toStrictEqual({
      esquerda: 12,
      largura: 296,
      fundo: 12,
    });
  });
});
