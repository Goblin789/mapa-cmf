import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cifrar, decifrar, desempacotar, empacotar, MAGICO, MENSAGEM_DANIFICADA } from './cifra';

const CHAVE = new Uint8Array(randomBytes(32));
const OUTRA_CHAVE = new Uint8Array(randomBytes(32));
const DADOS = Buffer.from('SQLite format 3\0 dados fictícios para o teste '.repeat(200));

describe('cifra das cópias', () => {
  it('ida e volta: empacotar e desempacotar devolve os mesmos bytes', async () => {
    const ficheiro = await empacotar(DADOS, CHAVE);
    expect(ficheiro.subarray(0, 8).equals(MAGICO)).toBe(true);
    // Comprimido: bem mais pequeno do que o original (o texto repete-se).
    expect(ficheiro.length).toBeLessThan(DADOS.length / 4);
    expect((await desempacotar(ficheiro, CHAVE)).equals(DADOS)).toBe(true);
  });

  it('formato: mágico ‖ iv (12) ‖ cifrado ‖ tag (16), com iv diferente de cada vez', () => {
    const a = cifrar(Buffer.from('abc'), CHAVE);
    const b = cifrar(Buffer.from('abc'), CHAVE);
    expect(a.length).toBe(8 + 12 + 3 + 16);
    expect(a.subarray(8, 20).equals(b.subarray(8, 20))).toBe(false);
    expect(decifrar(a, CHAVE).toString()).toBe('abc');
  });

  it('chave errada → erro claro', async () => {
    const ficheiro = await empacotar(DADOS, CHAVE);
    await expect(desempacotar(ficheiro, OUTRA_CHAVE)).rejects.toThrow(MENSAGEM_DANIFICADA);
  });

  it('um byte mudado (no cifrado, no iv, na tag ou no cabeçalho) → erro claro', async () => {
    const ficheiro = await empacotar(DADOS, CHAVE);
    for (const posicao of [3, 10, 40, ficheiro.length - 1]) {
      const estragado = Buffer.from(ficheiro);
      estragado[posicao] = (estragado[posicao] as number) ^ 0x01;
      await expect(desempacotar(estragado, CHAVE)).rejects.toThrow(MENSAGEM_DANIFICADA);
    }
  });

  it('ficheiro curto demais ou de outro formato → erro claro', () => {
    expect(() => decifrar(Buffer.from('MAPACMF1'), CHAVE)).toThrow(MENSAGEM_DANIFICADA);
    expect(() => decifrar(randomBytes(100), CHAVE)).toThrow(MENSAGEM_DANIFICADA);
  });

  it('recusa chaves que não tenham 32 bytes', () => {
    expect(() => cifrar(Buffer.from('x'), new Uint8Array(16))).toThrow('32 bytes');
  });
});
