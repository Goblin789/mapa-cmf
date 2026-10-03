import { describe, expect, it } from 'vitest';
import { disporMapa } from './disposicao';
import { contextoFicticio } from './estadoFicticioTeste';
import { linhasFoco, relacoesFoco } from './foco';
import { centro, contem } from './geometria';
import { montarModelo } from './grupos';

const { estado, indices, dormidas } = contextoFicticio();
const modelo = montarModelo(estado, indices, dormidas);

describe('relacoesFoco', () => {
  it('sem foco não há nada', () => {
    expect(relacoesFoco(null, indices)).toEqual({ destaques: new Set(), ligacoes: [] });
  });

  it('pessoa: casa → carrinha (pelo lugar de cada uma) → obra', () => {
    const r = relacoesFoco({ tipo: 'pessoa', id: 'p1' }, indices);
    expect([...r.destaques]).toEqual(['casa:C1', 'carrinha:V2']);
    expect(r.ligacoes).toEqual([
      {
        de: { tipo: 'cartao', chave: 'casa:C1', lugar: 0 },
        para: { tipo: 'cartao', chave: 'carrinha:V2', lugar: 0 },
      },
      { de: { tipo: 'cartao', chave: 'carrinha:V2', lugar: 0 }, para: { tipo: 'obra', obraId: 'OB1' } },
    ]);
  });

  it('pessoa sem carrinha: só a casa, sem linhas', () => {
    const r = relacoesFoco({ tipo: 'pessoa', id: 'p5' }, indices);
    expect([...r.destaques]).toEqual(['casa:C1']);
    expect(r.ligacoes).toEqual([]);
  });

  it('pessoa inativa ou inexistente: nada', () => {
    expect(relacoesFoco({ tipo: 'pessoa', id: 'p10' }, indices).destaques.size).toBe(0);
    expect(relacoesFoco({ tipo: 'pessoa', id: 'nao-existe' }, indices).destaques.size).toBe(0);
  });

  it('casa: uma linha para cada carrinha dos moradores (sem repetir)', () => {
    const r = relacoesFoco({ tipo: 'casa', id: 'C1' }, indices);
    expect([...r.destaques]).toEqual(['casa:C1', 'carrinha:V2', 'carrinha:V1']);
    expect(r.ligacoes.map((l) => (l.para.tipo === 'cartao' ? l.para.chave : ''))).toEqual([
      'carrinha:V2',
      'carrinha:V1',
    ]);
  });

  it('carrinha: uma linha para cada casa dos passageiros (sem repetir)', () => {
    const r = relacoesFoco({ tipo: 'carrinha', id: 'V2' }, indices);
    expect([...r.destaques]).toEqual(['carrinha:V2', 'casa:C1', 'casa:C2']);
    expect(r.ligacoes).toHaveLength(2);
  });
});

describe('linhasFoco', () => {
  it('com os nomes, a linha da pessoa vai do lugar na casa ao lugar na carrinha', () => {
    const d = disporMapa(modelo.grupos, { zoom: 12 });
    expect(d.modo).toBe('completo');
    const linhas = linhasFoco(relacoesFoco({ tipo: 'pessoa', id: 'p4' }, indices), d, indices);
    // p4 mora na C1 (L1) e vai na V1 (dorme em L2): lugar 3 da casa, lugar 0 da carrinha.
    const casa = d.cartoes.get('casa:C1')?.lugares?.[3];
    const carrinha = d.cartoes.get('carrinha:V1')?.lugares?.[0];
    expect(linhas[0]?.de).toEqual(centro(casa as never));
    expect(linhas[0]?.para).toEqual(centro(carrinha as never));
  });

  it('a linha até à obra acaba no local da obra', () => {
    const d = disporMapa(modelo.grupos, { zoom: 12 });
    const linhas = linhasFoco(relacoesFoco({ tipo: 'pessoa', id: 'p1' }, indices), d, indices);
    expect(linhas).toHaveLength(2);
    expect(linhas[1]?.obraId).toBe('OB1');
    expect(linhas[0]?.obraId).toBeNull();
  });

  it('no modo compacto (carrinhas sem nomes), a linha chega à borda da carrinha', () => {
    const d = disporMapa(modelo.grupos, { zoom: 10.25 });
    expect(d.modo).toBe('compacto');
    expect(d.cartoes.get('carrinha:V1')?.lugares).toEqual([]);
    const [linha] = linhasFoco(relacoesFoco({ tipo: 'pessoa', id: 'p4' }, indices), d, indices);
    const v1 = d.cartoes.get('carrinha:V1')?.retangulo;
    const lugarCasa = d.cartoes.get('casa:C1')?.lugares?.[3];
    expect(linha?.de).toEqual(centro(lugarCasa as never));
    expect(contem(v1 as never, linha?.para as never)).toBe(true);
  });

  it('entre cartões, a linha vai de borda a borda e fica certa depois de abrir um local no resumo', () => {
    for (const expandidos of [new Set<string>(), new Set(['grupo:L1', 'grupo:L2'])]) {
      const d = disporMapa(modelo.grupos, { zoom: 9, expandidos });
      const [linha] = linhasFoco(relacoesFoco({ tipo: 'carrinha', id: 'V1' }, indices), d, indices);
      const v1 = d.cartoes.get('carrinha:V1')?.retangulo;
      const c1 = d.cartoes.get('casa:C1')?.retangulo;
      expect(linha).toBeDefined();
      expect(contem(v1 as never, linha?.de as never)).toBe(true);
      expect(contem(c1 as never, linha?.para as never)).toBe(true);
    }
  });

  it('no resumo, ligações dentro da mesma pastilha não desenham nada', () => {
    const d = disporMapa(modelo.grupos, { zoom: 9 });
    expect(d.modo).toBe('resumo');
    // C2 e V2 estão ambas no local L1.
    const linhas = linhasFoco(relacoesFoco({ tipo: 'pessoa', id: 'p6' }, indices), d, indices);
    expect(linhas).toEqual([]);
  });
});
