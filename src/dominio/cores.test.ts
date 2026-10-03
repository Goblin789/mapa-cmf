import { describe, expect, it } from 'vitest';
import clientesIniciais from '../../dados-iniciais/clientes.json';
import { clienteEfetivoId, contraste, corTexto, luminancia } from './cores';
import { criarObra, criarPessoa } from './teste-fabrica';

/** Mínimo WCAG AA para texto normal. */
const AA = 4.5;

describe('luminancia', () => {
  it('preto = 0, branco = 1, cinzento #808080 ≈ 0.2159', () => {
    expect(luminancia('#000000')).toBe(0);
    expect(luminancia('#ffffff')).toBeCloseTo(1, 10);
    expect(luminancia('#808080')).toBeCloseTo(0.2159, 4);
  });

  it('aceita minúsculas, sem # e com espaços à volta', () => {
    const ref = luminancia('#ED7D31');
    expect(luminancia('#ed7d31')).toBe(ref);
    expect(luminancia('ED7D31')).toBe(ref);
    expect(luminancia('  #ED7D31 \n')).toBe(ref);
  });

  it.each(['', '#', '#fff', 'fff', 'red', '#GGGGGG', '#ED7D3', '#ED7D31FF', 'rgb(0,0,0)', '# ED7D31'])(
    'cor inválida %j: erro com mensagem clara',
    (cor) => {
      expect(() => luminancia(cor)).toThrow(/Cor inválida/);
      expect(() => corTexto(cor)).toThrow(/Cor inválida/);
    },
  );
});

describe('contraste', () => {
  it('preto/branco = 21, igual = 1, simétrico', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 10);
    expect(contraste('#ED7D31', '#ED7D31')).toBe(1);
    expect(contraste('#B4C6E7', '#00B0F0')).toBe(contraste('#00B0F0', '#B4C6E7'));
  });
});

describe('corTexto', () => {
  it('extremos: fundo preto → branco, fundo branco → preto, azul puro → branco', () => {
    expect(corTexto('#000000')).toBe('#ffffff');
    expect(corTexto('#ffffff')).toBe('#000000');
    expect(corTexto('#0000ff')).toBe('#ffffff');
  });

  it.each(clientesIniciais.map((c) => [c.nome, c.cor] as const))(
    'cor real do cliente %s (%s): o texto escolhido é o de maior contraste e passa AA (≥ 4.5)',
    (_nome, cor) => {
      const texto = corTexto(cor);
      const outro = texto === '#000000' ? '#ffffff' : '#000000';
      expect(contraste(cor, texto)).toBeGreaterThanOrEqual(contraste(cor, outro));
      expect(contraste(cor, texto)).toBeGreaterThanOrEqual(AA);
    },
  );

  // Não fixa a paleta (as cores dos clientes podem mudar): verifica que cada cor real leva o texto com mais
  // contraste e que esse contraste chega para ler (WCAG AA, 4.5:1).
  it('as cores reais dos clientes levam o texto com mais contraste, sempre legível (≥ 4.5)', () => {
    expect(clientesIniciais).toHaveLength(7);
    for (const { cor } of clientesIniciais) {
      const texto = corTexto(cor);
      const outro = texto === '#000000' ? '#ffffff' : '#000000';
      expect(contraste(cor, texto), cor).toBeGreaterThanOrEqual(contraste(cor, outro));
      expect(contraste(cor, texto), cor).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('valores de referência do contraste', () => {
    expect(contraste('#808080', '#000000')).toBeCloseTo(5.32, 2);
    expect(contraste('#ED7D31', '#000000')).toBeCloseTo(7.58, 2);
  });

  it('cores dos clientes são únicas e válidas', () => {
    const cores = clientesIniciais.map((c) => c.cor.toLowerCase());
    expect(new Set(cores).size).toBe(cores.length);
    for (const c of cores) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('para qualquer cinzento escolhe sempre o melhor dos dois (nunca abaixo de ~4.58)', () => {
    let pior = Number.POSITIVE_INFINITY;
    for (let v = 0; v <= 255; v++) {
      const h = v.toString(16).padStart(2, '0');
      const cor = `#${h}${h}${h}`;
      const texto = corTexto(cor);
      const outro = texto === '#000000' ? '#ffffff' : '#000000';
      expect(contraste(cor, texto)).toBeGreaterThanOrEqual(contraste(cor, outro));
      pior = Math.min(pior, contraste(cor, texto));
    }
    // O pior caso possível entre preto e branco é √(1.05/0.05) ≈ 4.58: preto/branco chega sempre para AA.
    expect(pior).toBeGreaterThanOrEqual(4.58);
  });
});

describe('clienteEfetivoId', () => {
  const obras = new Map([['o1', criarObra({ id: 'o1', clienteId: 'cliente-da-obra' })]]);

  it('sem obra: o cliente da pessoa', () => {
    expect(clienteEfetivoId(criarPessoa({ clienteId: 'meu', obraId: null }), obras)).toBe('meu');
  });

  it('com obra: o cliente da obra manda', () => {
    expect(clienteEfetivoId(criarPessoa({ clienteId: 'meu', obraId: 'o1' }), obras)).toBe('cliente-da-obra');
  });

  it('obra que não existe: volta ao cliente da pessoa', () => {
    expect(clienteEfetivoId(criarPessoa({ clienteId: 'meu', obraId: 'fantasma' }), obras)).toBe('meu');
  });
});
