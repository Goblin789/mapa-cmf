import { describe, expect, it } from 'vitest';
import type { Cell, CellObject } from 'write-excel-file/browser';
import { COR_TEXTO_NOMES, contraste } from '../../dominio/cores';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import { COR_ALFA, COR_BETA, estadoVistas } from './estadoTeste';
import {
  CORES_LOTACAO_EXCEL,
  folhaCarrinhas,
  folhaCasas,
  folhaPessoas,
  montarFolhasExcel,
  nomeFicheiroExcel,
} from './excel';

const estado = estadoVistas();
const ind = indexar(estado);
const dormidas = dormidasDasCarrinhas(estado, ind);

function valor(c: Cell): unknown {
  return c !== null && typeof c === 'object' && 'value' in c ? (c as CellObject).value : c;
}
const valores = (linha: Cell[] | undefined) => (linha ?? []).map(valor);
const obj = (c: Cell | undefined) => c as CellObject;

describe('montarFolhasExcel', () => {
  it('três folhas, pela ordem: Pessoas, Casas, Carrinhas; larguras para todas as colunas', () => {
    const folhas = montarFolhasExcel(estado, ind, dormidas);
    expect(folhas.map((f) => f.nome)).toEqual(['Pessoas', 'Casas', 'Carrinhas']);
    for (const f of folhas) {
      const colunas = Math.max(...f.linhas.map((l) => l.length));
      expect(f.larguras.length).toBeGreaterThanOrEqual(colunas);
    }
  });
});

describe('folha Pessoas', () => {
  const folha = folhaPessoas(estado, ind);

  it('cabeçalhos a negrito, as colunas da tabela', () => {
    const [cabecalho] = folha.linhas;
    expect(valores(cabecalho)).toEqual([
      'Nome',
      'Nome completo',
      'Nº',
      'Cliente',
      'Obra',
      'Casa',
      'Carrinha',
      'Condutor',
      'A confirmar',
    ]);
    expect(cabecalho?.every((c) => obj(c).fontWeight === 'bold')).toBe(true);
  });

  it('uma linha por pessoa ativa, pelo nome', () => {
    expect(folha.linhas).toHaveLength(9);
    expect(folha.linhas.slice(1).map((l) => valor(l[0] ?? null))).toEqual([
      'Ana B.',
      'Eva D.',
      'Inês H.',
      'Ivo F.',
      'Luís E.',
      'Óscar G.',
      'Rui C.',
      'Zé A.',
    ]);
  });

  it('o nome com o fundo da cor do cliente e o texto quase-preto de todos os nomes', () => {
    const ana = folha.linhas[1];
    expect(obj(ana?.[0]).backgroundColor).toBe(COR_ALFA);
    expect(obj(ana?.[0]).textColor).toBe(COR_TEXTO_NOMES);
    const ze = folha.linhas.find((l) => valor(l[0] ?? null) === 'Zé A.');
    expect(obj(ze?.[0]).backgroundColor).toBe(COR_BETA);
  });

  it('matrícula formatada, condutor e o que está por confirmar', () => {
    const ze = folha.linhas.find((l) => valor(l[0] ?? null) === 'Zé A.');
    expect(valores(ze)).toEqual([
      'Zé A.',
      'José Amaral',
      '900-001',
      'Beta Construções',
      'sem obra',
      'Casa L1',
      'XX 1001',
      'Sim',
      null,
    ]);
    const oscar = folha.linhas.find((l) => valor(l[0] ?? null) === 'Óscar G.');
    expect(valores(oscar).slice(5)).toEqual(['Fora das casas CMF', 'sem transporte', null, 'carrinha']);
  });
});

describe('folha Casas', () => {
  const folha = folhaCasas(estado, ind, dormidas);

  it('uma linha por casa (pela ordem das casas) e no fim "Fora das casas CMF"', () => {
    expect(folha.linhas.slice(1).map((l) => valor(l[0] ?? null))).toEqual([
      'Casa L1',
      'Casa L2',
      'Casa O1',
      'Aldeia',
      'Monte',
      'Fora das casas CMF',
    ]);
  });

  it('casa, morada, lotação, livres, carrinhas que lá dormem e os moradores (um por célula, com cor)', () => {
    const l1 = folha.linhas[1];
    expect(valores(l1)).toEqual([
      'Casa L1',
      'Vila Fictícia, Rua Leste',
      '○ 2/3',
      1,
      'XX 1001',
      'Ana B.',
      'Zé A.',
    ]);
    expect(obj(l1?.[5]).backgroundColor).toBe(COR_ALFA);
    expect(obj(l1?.[6]).backgroundColor).toBe(COR_BETA);
    // A sugestão de onde dorme vai com "≈".
    const aldeia = folha.linhas.find((l) => valor(l[0] ?? null) === 'Aldeia');
    expect(valor(aldeia?.[4] ?? null)).toBe('≈ XX 1002');
  });

  it('a lotação "cheia" lê-se bem: âmbar escuro (o do número da pastilha), não o do contorno', () => {
    const aldeia = folha.linhas.find((l) => valor(l[0] ?? null) === 'Aldeia');
    expect(valor(aldeia?.[2] ?? null)).toBe('● 2/2');
    expect(obj(aldeia?.[2]).textColor).toBe('#973C00');
    expect(obj(aldeia?.[2]).fontWeight).toBe('bold');
  });

  it('todas as cores da lotação têm contraste ≥ 4,5:1 com o fundo da célula', () => {
    for (const { texto, fundo } of Object.values(CORES_LOTACAO_EXCEL)) {
      expect(contraste(texto, fundo ?? '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o cabeçalho "Moradores" ocupa as colunas dos nomes', () => {
    const cabecalho = folha.linhas[0];
    expect(valores(cabecalho).slice(0, 6)).toEqual([
      'Casa',
      'Morada',
      'Lotação',
      'Livres',
      'Carrinhas que lá dormem',
      'Moradores',
    ]);
    expect(obj(cabecalho?.[5]).columnSpan).toBe(2);
    expect(cabecalho?.[6]).toBeNull();
  });
});

describe('folha Carrinhas', () => {
  const folha = folhaCarrinhas(estado, ind, dormidas);
  const linha = (matricula: string) => folha.linhas.find((l) => valor(l[0] ?? null) === matricula);

  it('matrícula, tipo, marca e modelo, lugares, ocupação, condutor, onde dorme e os passageiros', () => {
    expect(valores(linha('XX 1001'))).toEqual([
      'XX 1001',
      'Carrinha',
      'Marca Furgão',
      5,
      '○ 2/5',
      'Zé A.',
      'Casa L1',
      'Ana B.',
    ]);
    expect(obj(linha('XX 1001')?.[5]).backgroundColor).toBe(COR_BETA);
    expect(valores(linha('XX 1005')).slice(0, 3)).toEqual(['XX 1005', 'Carro', 'Marca Ligeiro']);
  });

  it('onde dorme: sugerido com "≈", por definir; sem condutor quando leva gente', () => {
    expect(valor(linha('XX 1002')?.[6] ?? null)).toBe('≈ Aldeia (sugerido)');
    expect(valor(linha('XX 1004')?.[6] ?? null)).toBe('por definir');
    expect(valor(linha('XX 1003')?.[5] ?? null)).toBe('sem condutor');
    expect(valor(linha('XX 1004')?.[5] ?? null)).toBeNull();
  });

  it('no fim, quem não tem transporte', () => {
    const ultima = folha.linhas.at(-1);
    expect(valor(ultima?.[0] ?? null)).toBe('Sem transporte da empresa');
    expect(valores(ultima).slice(7)).toEqual(['Inês H.', 'Óscar G.']);
  });
});

describe('nomeFicheiroExcel', () => {
  it('com a data do Luxemburgo (no verão UTC+2: 22:30 UTC já é o dia seguinte)', () => {
    expect(nomeFicheiroExcel(new Date('2026-10-04T21:30:00Z'))).toBe('Mapa CMF 2026-10-04.xlsx');
    expect(nomeFicheiroExcel(new Date('2026-10-04T22:30:00Z'))).toBe('Mapa CMF 2026-10-05.xlsx');
  });

  it('no inverno UTC+1', () => {
    expect(nomeFicheiroExcel(new Date('2026-12-31T22:59:00Z'))).toBe('Mapa CMF 2026-12-31.xlsx');
    expect(nomeFicheiroExcel(new Date('2026-12-31T23:00:00Z'))).toBe('Mapa CMF 2027-01-01.xlsx');
  });

  it('com alterações por guardar, diz que é uma simulação', () => {
    expect(nomeFicheiroExcel(new Date('2026-10-07T10:00:00Z'), true)).toBe(
      'Mapa CMF 2026-10-07 (simulação).xlsx',
    );
  });
});
