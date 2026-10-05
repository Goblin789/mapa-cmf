import { describe, expect, it } from 'vitest';
import type { Operacao } from '../../dominio/operacoes';
import {
  type Armazenamento,
  apagarRegisto,
  apagarSeForDeste,
  autorCompativel,
  CHAVE_RASCUNHO_PENDENTE,
  comTrancaRascunhos,
  guardarRascunhoPendente,
  largar,
  lerRascunhoPendente,
  lerRegistos,
  MAX_REGISTOS,
  marcarRecuperado,
  marcarVivo,
  type RascunhoPendente,
  registoDoSeparador,
  retomar,
  SEPARADOR_VIVO_MS,
  textoRascunhoNoutroSeparador,
  textoRascunhoRecuperado,
  VALIDADE_RASCUNHO_MS,
} from './rascunhoPendente';

/**
 * localStorage falso. `rebentar` = modo privado ou quota cheia; `listavel` = false para um armazenamento
 * mínimo, sem key/length. `escritas` regista as chaves escritas ou apagadas.
 */
function armazenamentoFalso(
  rebentar = false,
  listavel = true,
): Armazenamento & { dados: Map<string, string>; escritas: string[] } {
  const dados = new Map<string, string>();
  const escritas: string[] = [];
  const base: Armazenamento & { dados: Map<string, string>; escritas: string[] } = {
    dados,
    escritas,
    getItem: (k) => {
      if (rebentar) throw new Error('SecurityError');
      return dados.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (rebentar) throw new Error('QuotaExceededError');
      escritas.push(k);
      dados.set(k, v);
    },
    removeItem: (k) => {
      if (rebentar) throw new Error('SecurityError');
      escritas.push(k);
      dados.delete(k);
    },
  };
  if (!listavel) return base;
  Object.defineProperty(base, 'length', {
    get() {
      if (rebentar) throw new Error('SecurityError');
      return dados.size;
    },
  });
  base.key = (i: number) => [...dados.keys()][i] ?? null;
  return base;
}

const chaveDe = (origem: string) => `${CHAVE_RASCUNHO_PENDENTE}:${origem}`;

const AGORA = Date.parse('2026-10-04T10:00:00.000Z');
const MOVER: Operacao = { tipo: 'mover', pessoaId: 'p-ana', campo: 'casaId', de: 'casa-1', para: 'casa-2' };
const CONDUTOR: Operacao = { tipo: 'condutor', carrinhaId: 'zz1001', de: null, para: 'p-ana' };
const DORMIDA: Operacao = { tipo: 'dormida', carrinhaId: 'zz1001', de: null, para: 'casa:casa-1' };
const MOVER_BRUNO: Operacao = {
  tipo: 'mover',
  pessoaId: 'p-bruno',
  campo: 'carrinhaId',
  de: 'zz1001',
  para: 'zz1003',
};

function rascunho(parcial: Partial<RascunhoPendente> = {}): RascunhoPendente {
  return {
    passos: [[MOVER], [CONDUTOR, DORMIDA]],
    versaoBase: 7,
    data: new Date(AGORA - 60_000).toISOString(),
    autor: 'ana@exemplo.lu',
    separador: null,
    vivoEm: 0,
    ...parcial,
  };
}

describe('guardar e ler', () => {
  it('ida e volta (a origem é o separador onde nasceu, e dá o nome à chave)', () => {
    const a = armazenamentoFalso();
    expect(guardarRascunhoPendente(a, rascunho({ separador: 'x', vivoEm: AGORA - 4 * 60_000 }))).toBe(true);
    expect([...a.dados.keys()]).toStrictEqual([chaveDe('x')]);
    expect(lerRascunhoPendente(a, AGORA, 'ana@exemplo.lu', 'eu')).toStrictEqual({
      ...rascunho({ separador: 'x', vivoEm: AGORA - 4 * 60_000 }),
      origem: 'x',
    });
  });

  it('sem armazenamento, ou se ele rebentar: não lança', () => {
    expect(guardarRascunhoPendente(null, rascunho())).toBe(false);
    expect(guardarRascunhoPendente(armazenamentoFalso(true), rascunho())).toBe(false);
    expect(lerRascunhoPendente(null, AGORA, null, 'eu')).toBeNull();
    expect(lerRascunhoPendente(armazenamentoFalso(true), AGORA, null, 'eu')).toBeNull();
    expect(lerRegistos(armazenamentoFalso(true))).toStrictEqual([]);
    expect(marcarVivo(armazenamentoFalso(true), 'eu', AGORA)).toBe(false);
    expect(() => largar(armazenamentoFalso(true), 'eu')).not.toThrow();
    expect(() => apagarSeForDeste(armazenamentoFalso(true), 'eu')).not.toThrow();
    expect(() => marcarRecuperado(armazenamentoFalso(true), 'x', 'eu')).not.toThrow();
    expect(retomar(armazenamentoFalso(true), 'eu', AGORA, null)).toBe(false);
  });

  it('com mais de 24 h (ou com data inválida) é apagado', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ data: new Date(AGORA - VALIDADE_RASCUNHO_MS - 1).toISOString() }));
    expect(lerRascunhoPendente(a, AGORA, null, 'eu')).toBeNull();
    expect(a.dados.size).toBe(0);

    guardarRascunhoPendente(a, rascunho({ data: 'ontem' }));
    expect(lerRascunhoPendente(a, AGORA, null, 'eu')).toBeNull();
    expect(a.dados.size).toBe(0);
  });

  it('estragado é apagado', () => {
    for (const valor of [
      '{',
      'null',
      '{"passos":[],"versaoBase":1,"data":"2026-10-04T09:59:00.000Z"}',
      JSON.stringify({ ...rascunho(), passos: [[{ tipo: 'apagar', pessoaId: 'p-ana' }]] }),
      JSON.stringify({ ...rascunho(), passos: [[{ ...MOVER, campo: 'telefone' }]] }),
      JSON.stringify({ ...rascunho(), versaoBase: -1 }),
      JSON.stringify({ ...rascunho(), origem: 7 }),
    ]) {
      const a = armazenamentoFalso();
      a.dados.set(CHAVE_RASCUNHO_PENDENTE, valor);
      expect(lerRascunhoPendente(a, AGORA, null, 'eu')).toBeNull();
      expect(a.dados.size).toBe(0);
    }
  });

  it('um registo estragado noutra chave é apagado, sem mexer nos bons nem noutras chaves do site', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: null, origem: 'x' }));
    a.dados.set(chaveDe('y'), 'não é json');
    a.dados.set('mapa-cmf:vista', 'tabela');
    expect(lerRascunhoPendente(a, AGORA, null, 'eu')?.origem).toBe('x');
    expect([...a.dados.keys()].sort()).toStrictEqual([chaveDe('x'), 'mapa-cmf:vista']);
  });

  it('registo de antes (na chave base, sem origem): a origem é o separador e passa para a chave dele', () => {
    const a = armazenamentoFalso();
    a.dados.set(CHAVE_RASCUNHO_PENDENTE, JSON.stringify(rascunho({ separador: 'antigo', vivoEm: AGORA })));
    expect(registoDoSeparador(a, 'antigo')?.origem).toBe('antigo');
    // Volta a gravar o mesmo separador: substitui, não fica repetido.
    guardarRascunhoPendente(a, rascunho({ separador: 'antigo', vivoEm: AGORA, passos: [[MOVER]] }));
    expect(lerRegistos(a)).toHaveLength(1);
    expect(lerRegistos(a)[0]?.passos).toStrictEqual([[MOVER]]);
    lerRascunhoPendente(a, AGORA, null, 'eu');
    expect([...a.dados.keys()]).toStrictEqual([chaveDe('antigo')]);
  });

  it('armazenamento sem key/length: um só registo, na chave base (o último ganha)', () => {
    const a = armazenamentoFalso(false, false);
    guardarRascunhoPendente(a, rascunho({ separador: 'x', vivoEm: AGORA }));
    guardarRascunhoPendente(a, rascunho({ separador: 'y', vivoEm: AGORA }));
    expect([...a.dados.keys()]).toStrictEqual([CHAVE_RASCUNHO_PENDENTE]);
    expect(lerRegistos(a).map((r) => r.origem)).toStrictEqual(['y']);
    expect(marcarVivo(a, 'y', AGORA + 1)).toBe(true);
    largar(a, 'y');
    expect(lerRascunhoPendente(a, AGORA + 2, null, 'eu')?.origem).toBe('y');
  });

  it('de outra pessoa: não se recupera, mas fica para ela', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho());
    expect(lerRascunhoPendente(a, AGORA, 'bruno@exemplo.lu', 'eu')).toBeNull();
    expect(a.dados.size).toBe(1);
    // Sem saber quem fez ou quem está: recupera-se.
    expect(lerRascunhoPendente(a, AGORA, null, 'eu')).not.toBeNull();
  });
});

describe('vários registos (ninguém escreve por cima do de outro)', () => {
  it('dois separadores em edição quando a sessão expira: ficam os dois', () => {
    const a = armazenamentoFalso();
    expect(guardarRascunhoPendente(a, rascunho({ separador: 'x', vivoEm: AGORA }))).toBe(true);
    expect(
      guardarRascunhoPendente(a, rascunho({ separador: 'y', vivoEm: AGORA, passos: [[MOVER_BRUNO]] })),
    ).toBe(true);
    expect(
      lerRegistos(a)
        .map((r) => r.origem)
        .sort(),
    ).toStrictEqual(['x', 'y']);

    // O "continuo aberto" de cada um só mexe no seu.
    expect(marcarVivo(a, 'x', AGORA + 20_000)).toBe(true);
    expect(registoDoSeparador(a, 'x')?.vivoEm).toBe(AGORA + 20_000);
    expect(registoDoSeparador(a, 'y')?.vivoEm).toBe(AGORA);

    // x fecha: fica largado e pode ser recuperado; o de y (vivo) não.
    largar(a, 'x');
    expect(lerRascunhoPendente(a, AGORA + 30_000, 'ana@exemplo.lu', 'z')?.origem).toBe('x');
    apagarRegisto(a, 'x');
    expect(lerRascunhoPendente(a, AGORA + 30_000, 'ana@exemplo.lu', 'z')).toBeNull();
    expect(lerRegistos(a).map((r) => r.origem)).toStrictEqual(['y']);
  });

  it('o rascunho largado de outra pessoa no mesmo PC não se perde', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: null, autor: 'ana@exemplo.lu', origem: 'pc-ana' }));
    guardarRascunhoPendente(
      a,
      rascunho({ separador: 'pc-bruno', vivoEm: AGORA, autor: 'bruno@exemplo.lu', passos: [[MOVER_BRUNO]] }),
    );
    expect(lerRascunhoPendente(a, AGORA, 'ana@exemplo.lu', 'outro')?.origem).toBe('pc-ana');
    expect(lerRascunhoPendente(a, AGORA, 'bruno@exemplo.lu', 'outro')).toBeNull();
  });

  it('o mesmo separador volta a guardar: substitui o seu', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: 'x', vivoEm: AGORA }));
    guardarRascunhoPendente(a, rascunho({ separador: 'y', vivoEm: AGORA }));
    guardarRascunhoPendente(a, rascunho({ separador: 'x', vivoEm: AGORA, passos: [[MOVER_BRUNO]] }));
    expect(registoDoSeparador(a, 'x')?.passos).toStrictEqual([[MOVER_BRUNO]]);
    expect(registoDoSeparador(a, 'y')?.passos).toStrictEqual(rascunho().passos);
    expect(lerRegistos(a)).toHaveLength(2);
  });

  it(`no máximo ${MAX_REGISTOS}: saem os mais antigos`, () => {
    const a = armazenamentoFalso();
    for (let i = 0; i < MAX_REGISTOS + 2; i++) {
      guardarRascunhoPendente(
        a,
        rascunho({ separador: `s${i}`, data: new Date(AGORA - 60_000 + i * 1000).toISOString() }),
      );
    }
    const origens = lerRegistos(a).map((r) => r.origem);
    expect(origens).toHaveLength(MAX_REGISTOS);
    expect(origens).not.toContain('s0');
    expect(origens).not.toContain('s1');
    expect(origens[0]).toBe(`s${MAX_REGISTOS + 1}`);
  });

  it('cada separador só escreve na sua chave (dois a gravar ao mesmo tempo não se apagam)', () => {
    // No browser, cada separador tem a sua cópia do localStorage, atualizada com atraso: se y gravar sem
    // ainda "ver" o registo de x, não lhe pode tocar.
    const x = armazenamentoFalso();
    const y = armazenamentoFalso();
    guardarRascunhoPendente(x, rascunho({ separador: 'x', vivoEm: AGORA }));
    guardarRascunhoPendente(y, rascunho({ separador: 'y', vivoEm: AGORA }));
    marcarVivo(y, 'y', AGORA + 20_000);
    largar(y, 'y');
    expect(x.escritas).toStrictEqual([chaveDe('x')]);
    expect(new Set(y.escritas)).toStrictEqual(new Set([chaveDe('y')]));
  });
});

describe('separador que ainda o tem aberto', () => {
  it('outro separador vivo: não se recupera aqui (é ele que o tem em memória)', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: 'outro', vivoEm: AGORA - 10_000 }));
    expect(lerRascunhoPendente(a, AGORA, null, 'eu')).toBeNull();
    expect(a.dados.size).toBe(1);
  });

  it('o próprio separador também não: o que conta é o que tem em memória', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: 'eu', vivoEm: AGORA - 10 * 60_000 }));
    expect(lerRascunhoPendente(a, AGORA, null, 'eu')).toBeNull();
    expect(registoDoSeparador(a, 'eu')).not.toBeNull();
  });

  it('um largado ou um sem notícias há muito: recupera-se (o mais recente primeiro)', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: null, origem: 'largado', vivoEm: AGORA }));
    expect(lerRascunhoPendente(a, AGORA, null, 'eu')?.origem).toBe('largado');
    guardarRascunhoPendente(
      a,
      rascunho({
        separador: 'adormecido',
        vivoEm: AGORA - SEPARADOR_VIVO_MS,
        data: new Date(AGORA - 1000).toISOString(),
      }),
    );
    expect(lerRascunhoPendente(a, AGORA, null, 'eu')?.origem).toBe('adormecido');
  });

  it('marcarVivo só renova o do próprio separador', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: 'eu', vivoEm: 1 }));
    expect(marcarVivo(a, 'eu', AGORA)).toBe(true);
    expect(registoDoSeparador(a, 'eu')?.vivoEm).toBe(AGORA);
    expect(marcarVivo(a, 'outro', AGORA + 1)).toBe(false);
    expect(registoDoSeparador(a, 'eu')?.vivoEm).toBe(AGORA);
    a.dados.clear();
    expect(marcarVivo(a, 'eu', AGORA)).toBe(false);
  });

  it('largar (a página vai fechar) só mexe no do próprio separador', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: 'outro', vivoEm: AGORA }));
    largar(a, 'eu');
    expect(lerRegistos(a)[0]?.separador).toBe('outro');
    largar(a, 'outro');
    expect(lerRegistos(a)[0]).toMatchObject({ separador: null, origem: 'outro' });
  });

  it('apagarSeForDeste não apaga o de outro separador nem os largados', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: 'outro', vivoEm: AGORA }));
    guardarRascunhoPendente(a, rascunho({ separador: null, origem: 'eu' }));
    apagarSeForDeste(a, 'eu');
    expect(lerRegistos(a)).toHaveLength(2);
    apagarSeForDeste(a, 'outro');
    expect(lerRegistos(a).map((r) => r.origem)).toStrictEqual(['eu']);
  });

  it('retomar (voltou da bfcache): só o que este separador largou e ninguém recuperou', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: 'eu', vivoEm: AGORA }));
    largar(a, 'eu');
    expect(retomar(a, 'eu', AGORA + 1000, 'bruno@exemplo.lu')).toBe(false);
    expect(retomar(a, 'outro', AGORA + 1000, 'ana@exemplo.lu')).toBe(false);
    expect(retomar(a, 'eu', AGORA + 1000, 'ana@exemplo.lu')).toBe(true);
    expect(registoDoSeparador(a, 'eu')?.vivoEm).toBe(AGORA + 1000);
  });
});

describe('recuperado por outro separador', () => {
  it('largado: apaga-se logo', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: null, origem: 'x' }));
    marcarRecuperado(a, 'x', 'eu');
    expect(lerRegistos(a)).toStrictEqual([]);
  });

  it('o separador que o tinha parecia fechado (suspenso): fica marcado, para ele largar a cópia ao acordar', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: 'x', vivoEm: AGORA - SEPARADOR_VIVO_MS - 1 }));
    expect(lerRascunhoPendente(a, AGORA, null, 'eu')?.origem).toBe('x');
    marcarRecuperado(a, 'x', 'eu');
    expect(registoDoSeparador(a, 'x')?.recuperadoPor).toBe('eu');
    // Já não se recupera outra vez, e x deixa de dizer que continua aberto.
    expect(lerRascunhoPendente(a, AGORA, null, 'terceiro')).toBeNull();
    expect(marcarVivo(a, 'x', AGORA)).toBe(false);
    // x fecha sem acordar: já não serve a ninguém.
    largar(a, 'x');
    expect(lerRegistos(a)).toStrictEqual([]);
  });

  it('marcado e o dono fechou entretanto: apagado na leitura seguinte', () => {
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ separador: null, origem: 'x', recuperadoPor: 'eu' }));
    expect(lerRascunhoPendente(a, AGORA, null, 'outro')).toBeNull();
    expect(lerRegistos(a)).toStrictEqual([]);
  });
});

describe('comTrancaRascunhos', () => {
  it('corre a função e devolve o que ela devolve (com ou sem Web Locks)', async () => {
    expect(await comTrancaRascunhos(() => 42)).toBe(42);
    const ordem: string[] = [];
    await Promise.all([comTrancaRascunhos(() => ordem.push('a')), comTrancaRascunhos(() => ordem.push('b'))]);
    expect(ordem).toStrictEqual(['a', 'b']);
  });
});

describe('textos', () => {
  it('singular e plural', () => {
    expect(textoRascunhoRecuperado(1)).toBe(
      'Recuperámos 1 alteração que não chegou a ser guardada. Revê-a e carrega em Guardar.',
    );
    expect(textoRascunhoRecuperado(3)).toBe(
      'Recuperámos 3 alterações que não chegaram a ser guardadas. Revê-as e carrega em Guardar.',
    );
    expect(textoRascunhoNoutroSeparador(1)).toMatch(/^A alteração por guardar .* foi recuperada noutro/);
    expect(textoRascunhoNoutroSeparador(2)).toMatch(/^As 2 alterações por guardar .* foram recuperadas/);
  });
});

describe('M2: rascunhos com fichas, registos e reversões', () => {
  const CAMPO: Operacao = { tipo: 'campo', entidade: 'casa', id: 'casa-1', campo: 'lotacao', de: 3, para: 4 };
  const LISTA: Operacao = {
    tipo: 'campo',
    entidade: 'carrinha',
    id: 'zz1003',
    campo: 'matriculasAlternativas',
    de: ['QQ9999'],
    para: [],
  };
  const PERIODO: Operacao = {
    tipo: 'registo',
    entidade: 'indisponibilidade',
    id: 'indisp-00000001',
    de: null,
    para: { id: 'indisp-00000001', pessoaId: 'p-ana', inicio: '2026-10-05', fim: null },
  };

  it('as operações do M2 voltam como foram guardadas, com as reversões', () => {
    const a = armazenamentoFalso();
    const reversoes = [{ loteId: 4, passo: 1, chaves: ['chave-da-lotacao'] }];
    guardarRascunhoPendente(a, rascunho({ passos: [[CAMPO, LISTA], [PERIODO]], reversoes }));
    const [lido] = lerRegistos(a);
    expect(lido?.passos).toStrictEqual([[CAMPO, LISTA], [PERIODO]]);
    expect(lido?.reversoes).toStrictEqual(reversoes);
  });

  it('operações do M2 estragadas invalidam o registo; reversões estragadas só se perdem elas', () => {
    const a = armazenamentoFalso();
    const maus: unknown[] = [
      { ...CAMPO, campo: 'ordem' },
      { ...CAMPO, entidade: 'cliente' },
      { ...CAMPO, para: { x: 1 } },
      { ...PERIODO, entidade: 'casa' },
      { ...PERIODO, para: { id: 'outro' } },
      { ...PERIODO, de: PERIODO.para },
    ];
    for (const mau of maus) {
      a.dados.set(chaveDe('m'), JSON.stringify(rascunho({ origem: 'm', passos: [[mau as Operacao]] })));
      expect(lerRegistos(a), JSON.stringify(mau)).toEqual([]);
    }
    a.dados.set(
      chaveDe('r'),
      JSON.stringify(rascunho({ origem: 'r', reversoes: [{ loteId: 0, passo: -1, chaves: [3] }] as never })),
    );
    const [lido] = lerRegistos(a);
    expect(lido).toBeDefined();
    expect(lido?.reversoes).toBeUndefined();
  });

  it('a reversão leva a data e o autor da gravação revertida; estragados, só se perdem eles', () => {
    const a = armazenamentoFalso();
    const gravacao = {
      criadoEm: '2026-10-05T07:12:00.000Z',
      autor: 'ana@exemplo.test',
      autorNome: 'Ana Exemplo',
    };
    const reversoes = [
      { loteId: 4, passo: 0, chaves: ['chave-da-lotacao'], gravacao },
      { loteId: 5, passo: 0, chaves: ['outra'], gravacao: { criadoEm: 3 } },
    ];
    guardarRascunhoPendente(a, rascunho({ passos: [[CAMPO]], reversoes: reversoes as never }));
    const [lido] = lerRegistos(a);
    expect(lido?.reversoes).toStrictEqual([
      { loteId: 4, passo: 0, chaves: ['chave-da-lotacao'], gravacao },
      { loteId: 5, passo: 0, chaves: ['outra'] },
    ]);
  });

  it('um rascunho do modo local (sem login) serve a quem entrar depois com a conta Microsoft', () => {
    expect(autorCompativel('local', 'ana@exemplo.lu')).toBe(true);
    expect(autorCompativel('ana@exemplo.lu', 'ana@exemplo.lu')).toBe(true);
    expect(autorCompativel('rui@exemplo.lu', 'ana@exemplo.lu')).toBe(false);
    expect(autorCompativel('ana@exemplo.lu', 'local')).toBe(false);
    const a = armazenamentoFalso();
    guardarRascunhoPendente(a, rascunho({ autor: 'local', separador: null }));
    expect(lerRascunhoPendente(a, AGORA, 'ana@exemplo.lu', 'outro-separador')).not.toBeNull();
  });
});
