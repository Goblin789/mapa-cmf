import { describe, expect, it } from 'vitest';
import { dadosFicticios, folhaExtraFicticia, folhaPessoalFicticia, michaelFicticio } from './dadosFicticios';
import { processarImportacao, resumir, textoResumo } from './processar';

function listaMestra() {
  return new Map([
    ['Pessoal', folhaPessoalFicticia()],
    ['Não estão na lista', folhaExtraFicticia()],
  ]);
}

describe('processarImportacao', () => {
  it('junta lista mestra, extras e cruzamento com o Michael', () => {
    const r = processarImportacao({
      listaMestra: listaMestra(),
      michael: michaelFicticio(),
      dados: dadosFicticios(),
    });
    expect(r.entidades.pessoas).toHaveLength(6);
    expect(r.linhasPessoal).toBe(5);
    expect(r.discrepancias.michaelDisponivel).toBe(true);
    expect(r.erros.filter((x) => x.bloqueante)).toEqual([]);
  });

  it('sem folha Pessoal → erro bloqueante', () => {
    const r = processarImportacao({ listaMestra: new Map(), michael: null, dados: dadosFicticios() });
    expect(r.entidades.pessoas).toEqual([]);
    expect(r.erros.filter((x) => x.bloqueante).length).toBeGreaterThan(0);
    expect(r.discrepancias.michaelDisponivel).toBe(false);
  });

  it('encontra as folhas sem distinguir acentos e maiúsculas', () => {
    const lista = new Map([
      ['PESSOAL', folhaPessoalFicticia()],
      ['nao estao na lista', folhaExtraFicticia()],
    ]);
    const r = processarImportacao({ listaMestra: lista, michael: null, dados: dadosFicticios() });
    expect(r.entidades.pessoas).toHaveLength(6);
  });
});

describe('resumo', () => {
  it('conta pessoas, clientes, fora das casas e sem transporte (com "a confirmar")', () => {
    const r = processarImportacao({ listaMestra: listaMestra(), michael: null, dados: dadosFicticios() });
    const s = resumir(r);
    expect(s).toMatchObject({
      pessoas: 6,
      pessoasLista: 5,
      pessoasExtra: 1,
      porCliente: [
        { id: 'alfa', nome: 'Alfa', pessoas: 4 },
        { id: 'beta', nome: 'Bêta', pessoas: 2 },
      ],
      foraDasCasas: 3,
      foraDasCasasAConfirmar: 2,
      semTransporte: 3,
      semTransporteAConfirmar: 2,
      aConfirmar: 2,
      clientes: 2,
      locais: 2,
      casas: 2,
      carrinhas: 3,
      obras: 0,
      errosBloqueantes: 0,
      avisos: 2,
    });
  });

  it('o texto do resumo não tem nomes de pessoas', () => {
    const r = processarImportacao({ listaMestra: listaMestra(), michael: null, dados: dadosFicticios() });
    const texto = textoResumo(resumir(r));
    expect(texto).toContain('6 pessoas');
    for (const p of r.entidades.pessoas) expect(texto).not.toContain(p.nomeCurto);
  });
});
