import { describe, expect, it } from 'vitest';
import { encontrarAlvo, type NoDom, pessoaArrastavel } from './alvo';

/** Elemento simulado: só atributos e o pai. */
function no(atributos: Record<string, string>, pai: NoDom | null = null): NoDom & { nome?: string } {
  return { getAttribute: (n) => atributos[n] ?? null, parentElement: pai };
}

describe('encontrarAlvo', () => {
  const lista = no({});
  const seccao = no({ 'data-alvo': 'casa:casa-1' }, lista);
  const corpo = no({}, seccao);
  const nome = no({ 'data-arrastavel-pessoa': 'p1' }, corpo);
  const texto = no({}, nome);

  it('sobe até ao data-alvo mais próximo', () => {
    const r = encontrarAlvo(texto);
    expect(r?.chave).toBe('casa:casa-1');
    expect(r?.alvo).toEqual({ tipo: 'casa', id: 'casa-1' });
    expect(r?.elemento).toBe(seccao);
  });

  it('o próprio elemento pode ser o alvo, e os grupos especiais também', () => {
    const fora = no({ 'data-alvo': 'fora' });
    expect(encontrarAlvo(fora)?.alvo).toEqual({ tipo: 'fora' });
  });

  it('um alvo dentro de outro: ganha o mais próximo (cartão dentro de um grupo)', () => {
    const grupo = no({ 'data-alvo': 'fora' });
    const cartao = no({ 'data-alvo': 'carrinha:v1' }, grupo);
    expect(encontrarAlvo(no({}, cartao))?.alvo).toEqual({ tipo: 'carrinha', id: 'v1' });
  });

  it('ignora chaves inválidas e continua a subir', () => {
    const exterior = no({ 'data-alvo': 'sem-obra' });
    const estragado = no({ 'data-alvo': 'xpto:1' }, exterior);
    const vazio = no({ 'data-alvo': '' }, estragado);
    expect(encontrarAlvo(vazio)?.alvo).toEqual({ tipo: 'sem-obra' });
  });

  it('sem alvo na cadeia, ou sem elemento: null', () => {
    expect(encontrarAlvo(no({}, no({})))).toBeNull();
    expect(encontrarAlvo(null)).toBeNull();
  });

  it('dentro do fantasma nunca há alvo', () => {
    const fundo = no({ 'data-alvo': 'casa:casa-1' });
    const fantasma = no({ 'data-fantasma-arrasto': '' }, fundo);
    expect(encontrarAlvo(no({}, fantasma))).toBeNull();
  });
});

describe('pessoaArrastavel', () => {
  it('encontra o id no próprio elemento ou num antepassado', () => {
    const chip = no({ 'data-arrastavel-pessoa': 'p9' });
    expect(pessoaArrastavel(no({}, chip))).toBe('p9');
    expect(pessoaArrastavel(chip)).toBe('p9');
    expect(pessoaArrastavel(no({}))).toBeNull();
    expect(pessoaArrastavel(null)).toBeNull();
  });
});
