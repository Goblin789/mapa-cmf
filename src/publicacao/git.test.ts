import { describe, expect, it } from 'vitest';
import { lerContagem, problemasRamoEArvore, problemasSincronizacao } from './git';

describe('problemasRamoEArvore', () => {
  it('no main e sem alterações: nada', () => {
    expect(problemasRamoEArvore('main', '')).toEqual([]);
    expect(problemasRamoEArvore('main', '\n')).toEqual([]);
  });

  it('noutro ramo ou com HEAD solto: recusa', () => {
    expect(problemasRamoEArvore('experiencia', '')[0]).toContain('"experiencia"');
    expect(problemasRamoEArvore('HEAD', '')[0]).toContain('HEAD solto');
  });

  it('com alterações (também ficheiros novos): recusa e mostra-as', () => {
    const [problema] = problemasRamoEArvore('main', ' M src/a.ts\n?? src/novo.ts\n');
    expect(problema).toContain('2 alterações');
    expect(problema).toContain('?? src/novo.ts');
  });

  it('com muitas alterações mostra só as primeiras', () => {
    const linhas = Array.from({ length: 12 }, (_, i) => ` M f${i}.ts`).join('\n');
    const [problema] = problemasRamoEArvore('main', linhas);
    expect(problema).toContain('f7.ts');
    expect(problema).not.toContain('f8.ts');
    expect(problema).toContain('e mais 4');
  });

  it('acumula os dois problemas', () => {
    expect(problemasRamoEArvore('outro', ' M a.ts')).toHaveLength(2);
  });
});

describe('lerContagem', () => {
  it('lê "à frente" e "atrás"', () => {
    expect(lerContagem('2\t0\n')).toEqual({ aFrente: 2, atras: 0 });
    expect(lerContagem('0 3')).toEqual({ aFrente: 0, atras: 3 });
  });

  it('saída inesperada: null', () => {
    expect(lerContagem('')).toBeNull();
    expect(lerContagem('fatal: ambiguous argument')).toBeNull();
  });
});

describe('problemasSincronizacao', () => {
  it('igual ao GitHub: nada', () => {
    expect(problemasSincronizacao(0, 0)).toEqual([]);
  });

  it('commits por enviar ou por trazer', () => {
    expect(problemasSincronizacao(1, 0)[0]).toContain('git push');
    expect(problemasSincronizacao(0, 2)[0]).toContain('git pull');
    expect(problemasSincronizacao(1, 2)).toHaveLength(2);
  });
});
