import { describe, expect, it } from 'vitest';
import {
  avaliarSaude,
  avancarEspera,
  ESPERA_INICIAL,
  FALHAS_PARA_PARAGEM,
  mesmoCommit,
  type Observacao,
  TEMPO_MINIMO_CONSTRUCAO_MS,
  urlSaude,
} from './saude';

const corpo = (valor: unknown): string => JSON.stringify(valor);
const COPIAS_EM_DIA = { ativas: true, ultimaCopiaEm: '2026-10-06T10:00:00.000Z', atrasada: false };

describe('urlSaude', () => {
  it('junta o caminho à origem, com ou sem barra', () => {
    expect(urlSaude('https://mapa.exemplo.lu')).toBe('https://mapa.exemplo.lu/api/saude');
    expect(urlSaude('https://mapa.exemplo.lu/')).toBe('https://mapa.exemplo.lu/api/saude');
  });
});

describe('avaliarSaude (a regra da vigilância)', () => {
  it('ok e cópias em dia: sem problemas', () => {
    const r = avaliarSaude(200, corpo({ ok: true, versao: 3, copias: COPIAS_EM_DIA, geradoEm: 'x' }));
    expect(r).toEqual({ ok: true, problemas: [], avisos: [], commit: null });
  });

  it('cópias atrasadas: problema, mesmo com ok', () => {
    const r = avaliarSaude(
      200,
      corpo({ ok: true, copias: { ativas: false, ultimaCopiaEm: null, atrasada: true } }),
    );
    expect(r.ok).toBe(true);
    expect(r.problemas).toHaveLength(1);
    expect(r.problemas[0]).toContain('atrasadas');
  });

  it('ok falso ou 503: problema', () => {
    const r = avaliarSaude(503, corpo({ ok: false, erro: 'A base de dados não está disponível.' }));
    expect(r.ok).toBe(false);
    expect(r.problemas[0]).toContain('HTTP 503');
    expect(r.problemas[0]).toContain('base de dados');
    expect(avaliarSaude(200, corpo({ ok: 'true' })).ok).toBe(false);
  });

  it('sem JSON (ex.: página de parking do domínio): problema', () => {
    const r = avaliarSaude(200, '<html>parking</html>');
    expect(r.ok).toBe(false);
    expect(r.problemas[0]).toContain('não devolveu JSON');
  });

  it('sem informação das cópias: só aviso', () => {
    const r = avaliarSaude(200, corpo({ ok: true }));
    expect(r.problemas).toEqual([]);
    expect(r.avisos).toHaveLength(1);
  });

  it('lê o commit, se vier', () => {
    expect(avaliarSaude(200, corpo({ ok: true, copias: COPIAS_EM_DIA, commit: 'abc1234' })).commit).toBe(
      'abc1234',
    );
  });
});

describe('mesmoCommit', () => {
  it('aceita um abreviado com pelo menos 7 caracteres', () => {
    expect(mesmoCommit('abc1234def5678', 'ABC1234')).toBe(true);
    expect(mesmoCommit('abc1234', 'abc1234def')).toBe(true);
    expect(mesmoCommit('abc123', 'abc1234def')).toBe(false);
    expect(mesmoCommit('abc1234def', 'abc1235def')).toBe(false);
  });
});

describe('avancarEspera', () => {
  const NOVO = 'bbbbbbbbbbbbbbbb';
  const ANTIGO = 'aaaaaaaaaaaaaaaa';
  const ok = (commit: string | null): Observacao => ({ tipo: 'ok', commit });
  const falha: Observacao = { tipo: 'falha' };
  /** Segundos desde o pedido ao Render. */
  type Passo = [segundos: number, obs: Observacao];
  /** Já passou o tempo mínimo de construção. */
  const DEPOIS = TEMPO_MINIMO_CONSTRUCAO_MS / 1000;

  /** Corre uma sequência de observações e devolve o resultado de cada passo. */
  function correr(passos: Passo[], esperado = NOVO): string[] {
    let estado = ESPERA_INICIAL;
    return passos.map(([segundos, obs]) => {
      const passo = avancarEspera(estado, obs, { commitEsperado: esperado, decorridoMs: segundos * 1000 });
      estado = passo.estado;
      return passo.resultado;
    });
  }

  it('com commit: pronta quando passa do antigo para o novo', () => {
    expect(
      correr([
        [0, ok(ANTIGO)],
        [5, ok(ANTIGO)],
        [DEPOIS + 30, falha],
        [DEPOIS + 32, ok(NOVO)],
      ]),
    ).toEqual(['aguardar', 'aguardar', 'aguardar', 'pronto']);
    expect(
      correr([
        [0, ok(ANTIGO)],
        [DEPOIS + 5, ok(NOVO)],
      ]),
    ).toEqual(['aguardar', 'pronto']);
  });

  it('com commit: se volta o antigo depois de ir abaixo, continua à espera', () => {
    expect(
      correr([
        [0, ok(ANTIGO)],
        [DEPOIS, falha],
        [DEPOIS + 2, falha],
        [DEPOIS + 4, ok(ANTIGO)],
        [DEPOIS + 9, ok(null)],
      ]),
    ).toEqual(['aguardar', 'aguardar', 'aguardar', 'aguardar', 'aguardar']);
  });

  it('em baixo desde o início (ex.: publicar uma correção) e depois o novo: pronta', () => {
    expect(
      correr([
        [0, falha],
        [DEPOIS, falha],
        [DEPOIS + 2, falha],
        [DEPOIS + 4, ok(NOVO)],
      ]),
    ).toEqual(['aguardar', 'aguardar', 'aguardar', 'pronto']);
  });

  it('o mesmo commit outra vez: só depois de parar e voltar', () => {
    expect(
      correr([
        [0, ok(NOVO)],
        [5, ok(NOVO)],
        [DEPOIS, falha],
        [DEPOIS + 2, ok(NOVO)],
        [DEPOIS + 30, falha],
        [DEPOIS + 32, falha],
        [DEPOIS + 34, ok(NOVO)],
      ]),
    ).toEqual(['aguardar', 'aguardar', 'aguardar', 'aguardar', 'aguardar', 'aguardar', 'pronto']);
  });

  it('sem commit na resposta: "reiniciou" só depois de uma paragem a sério', () => {
    expect(
      correr([
        [0, ok(null)],
        [5, ok(null)],
        [DEPOIS + 60, falha],
        [DEPOIS + 62, falha],
        [DEPOIS + 64, ok(null)],
      ]),
    ).toEqual(['aguardar', 'aguardar', 'aguardar', 'aguardar', 'reiniciou']);
  });

  // O caso do revisor: uma falha passageira (Wi-Fi, tempo limite, um 502) enquanto o Render ainda constrói.
  it('sem commit: uma falha isolada não é a troca de versão', () => {
    expect(
      correr([
        [0, ok(null)],
        [5, falha],
        [10, ok(null)],
        [DEPOIS + 60, falha],
        [DEPOIS + 62, ok(null)],
        [DEPOIS + 67, ok(null)],
      ]),
    ).toEqual(['aguardar', 'aguardar', 'aguardar', 'aguardar', 'aguardar', 'aguardar']);
  });

  it('sem commit: falhas seguidas antes do tempo mínimo de construção também não contam', () => {
    expect(
      correr([
        [0, ok(null)],
        [5, falha],
        [7, falha],
        [9, falha],
        [11, ok(null)],
        [DEPOIS + 5, ok(null)],
      ]),
    ).toEqual(['aguardar', 'aguardar', 'aguardar', 'aguardar', 'aguardar', 'aguardar']);
  });

  it('as falhas têm de ser seguidas: uma resposta ok pelo meio recomeça a contagem', () => {
    expect(
      correr([
        [0, ok(null)],
        [DEPOIS, falha],
        [DEPOIS + 2, ok(null)],
        [DEPOIS + 7, falha],
        [DEPOIS + 9, ok(null)],
      ]),
    ).toEqual(['aguardar', 'aguardar', 'aguardar', 'aguardar', 'aguardar']);
    expect(FALHAS_PARA_PARAGEM).toBe(2);
  });
});
