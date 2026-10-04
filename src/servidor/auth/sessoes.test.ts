// Sessões: hash do token, inatividade, limite absoluto, último uso e limpeza (dados fictícios).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inserirUtilizador } from '../dados-de-teste';
import * as esquema from '../db/esquema';
import { abrirBd, type Bd } from '../db/ligacao';
import {
  apagarSessao,
  criarSessao,
  DURACAO_MAXIMA_MS,
  gerarToken,
  hashToken,
  INATIVIDADE_MAXIMA_MS,
  INTERVALO_ULTIMO_USO_MS,
  lerSessao,
  limparSessoesExpiradas,
  resumoSessoes,
  terminarSessoes,
  utilizadorDaSessao,
} from './sessoes';

const T0 = new Date('2026-10-01T09:00:00.000Z');
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

function depois(ms: number): Date {
  return new Date(T0.getTime() + ms);
}

let bd: Bd;

beforeEach(() => {
  bd = abrirBd(':memory:');
  inserirUtilizador(bd, { id: 'oid-ana', email: 'ana@exemplo.test', nome: 'Ana Exemplo' });
  inserirUtilizador(bd, { id: 'oid-rui', email: 'rui@exemplo.test', nome: 'Rui Fictício' });
});

afterEach(() => {
  bd.$client.close();
});

function linhas() {
  return bd.select().from(esquema.sessoes).all();
}

describe('token e hash', () => {
  it('o token tem 32 bytes aleatórios em base64url e muda sempre', () => {
    const a = gerarToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(gerarToken()).not.toBe(a);
  });

  it('na BD fica só o SHA-256 (hex) do token, nunca o token', () => {
    const { token, expiraEm } = criarSessao(bd, 'oid-ana', T0);
    const [linha] = linhas();
    expect(linha?.id).toBe(hashToken(token));
    expect(linha?.id).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(linhas())).not.toContain(token);
    expect(linha).toMatchObject({
      utilizadorId: 'oid-ana',
      criadaEm: T0.toISOString(),
      ultimoUsoEm: T0.toISOString(),
      expiraEm: depois(DURACAO_MAXIMA_MS).toISOString(),
    });
    expect(expiraEm).toStrictEqual(depois(90 * DIA));
  });
});

describe('lerSessao', () => {
  it('devolve o utilizador com o e-mail como chave', () => {
    const { token } = criarSessao(bd, 'oid-ana', T0);
    expect(lerSessao(bd, token, depois(1000))).toStrictEqual({
      chave: 'ana@exemplo.test',
      nome: 'Ana Exemplo',
      email: 'ana@exemplo.test',
      modo: 'entra',
    });
  });

  it('token desconhecido ou o próprio hash não servem', () => {
    const { token } = criarSessao(bd, 'oid-ana', T0);
    expect(lerSessao(bd, gerarToken(), T0)).toBeNull();
    expect(lerSessao(bd, hashToken(token), T0)).toBeNull();
  });

  it('acaba com 30 dias sem uso (e é apagada)', () => {
    const { token } = criarSessao(bd, 'oid-ana', T0);
    expect(INATIVIDADE_MAXIMA_MS).toBe(30 * DIA);
    expect(lerSessao(bd, token, depois(30 * DIA - 1000))).not.toBeNull();
    // O uso acima renovou o último uso: só acaba 30 dias depois dele.
    const usoNovo = depois(30 * DIA - 1000);
    expect(lerSessao(bd, token, new Date(usoNovo.getTime() + 30 * DIA - 1000))).not.toBeNull();

    const { token: outro } = criarSessao(bd, 'oid-rui', T0);
    expect(lerSessao(bd, outro, depois(30 * DIA))).toBeNull();
    expect(linhas().some((l) => l.id === hashToken(outro))).toBe(false);
  });

  it('acaba 90 dias depois de criada, mesmo com uso todos os dias', () => {
    const { token } = criarSessao(bd, 'oid-ana', T0);
    for (let dia = 1; dia < 90; dia++) {
      expect(lerSessao(bd, token, depois(dia * DIA)), `dia ${dia}`).not.toBeNull();
    }
    expect(lerSessao(bd, token, depois(90 * DIA))).toBeNull();
    expect(linhas()).toHaveLength(0);
  });

  it('o último uso grava-se no máximo uma vez por hora', () => {
    const { token } = criarSessao(bd, 'oid-ana', T0);
    expect(INTERVALO_ULTIMO_USO_MS).toBe(HORA);
    lerSessao(bd, token, depois(59 * 60 * 1000));
    expect(linhas()[0]?.ultimoUsoEm).toBe(T0.toISOString());
    lerSessao(bd, token, depois(HORA));
    expect(linhas()[0]?.ultimoUsoEm).toBe(depois(HORA).toISOString());
    lerSessao(bd, token, depois(HORA + 30 * 60 * 1000));
    expect(linhas()[0]?.ultimoUsoEm).toBe(depois(HORA).toISOString());
  });

  it('o utilizador apagado leva as sessões com ele (cascade)', () => {
    const { token } = criarSessao(bd, 'oid-ana', T0);
    bd.$client.prepare("DELETE FROM utilizadores WHERE id = 'oid-ana'").run();
    expect(lerSessao(bd, token, T0)).toBeNull();
    expect(linhas()).toHaveLength(0);
  });
});

describe('apagar e limpar', () => {
  it('apagarSessao termina só essa sessão', () => {
    const a = criarSessao(bd, 'oid-ana', T0);
    const b = criarSessao(bd, 'oid-ana', T0);
    apagarSessao(bd, a.token);
    expect(lerSessao(bd, a.token, T0)).toBeNull();
    expect(lerSessao(bd, b.token, T0)).not.toBeNull();
  });

  it('limparSessoesExpiradas apaga as inativas e as passadas do limite, e mais nenhuma', () => {
    const inativa = criarSessao(bd, 'oid-ana', T0);
    const velha = criarSessao(bd, 'oid-rui', T0);
    const boa = criarSessao(bd, 'oid-rui', depois(80 * DIA));
    // A "velha" foi usada há pouco, mas já passou dos 90 dias.
    bd.$client
      .prepare('UPDATE sessoes SET ultimo_uso_em = ? WHERE id = ?')
      .run(depois(89 * DIA).toISOString(), hashToken(velha.token));
    const agora = depois(90 * DIA);
    expect(limparSessoesExpiradas(bd, agora)).toBe(2);
    expect(linhas().map((l) => l.id)).toStrictEqual([hashToken(boa.token)]);
    expect(lerSessao(bd, inativa.token, agora)).toBeNull();
  });
});

describe('terminar sessões sem reiniciar (npm run sessoes)', () => {
  it('terminarSessoes(email) apaga só as dessa pessoa, sem ligar a maiúsculas', () => {
    const a1 = criarSessao(bd, 'oid-ana', T0);
    const a2 = criarSessao(bd, 'oid-ana', depois(HORA));
    const r = criarSessao(bd, 'oid-rui', T0);
    expect(resumoSessoes(bd)).toStrictEqual([
      { email: 'ana@exemplo.test', nome: 'Ana Exemplo', sessoes: 2, ultimoUsoEm: depois(HORA).toISOString() },
      { email: 'rui@exemplo.test', nome: 'Rui Fictício', sessoes: 1, ultimoUsoEm: T0.toISOString() },
    ]);
    expect(terminarSessoes(bd, ' Ana@Exemplo.test ')).toBe(2);
    expect(lerSessao(bd, a1.token, T0)).toBeNull();
    expect(lerSessao(bd, a2.token, T0)).toBeNull();
    expect(lerSessao(bd, r.token, T0)).not.toBeNull();
    expect(terminarSessoes(bd, 'ninguem@exemplo.test')).toBe(0);
    // O utilizador fica (o histórico usa o nome dele).
    expect(bd.select().from(esquema.utilizadores).all()).toHaveLength(2);
  });

  it('terminarSessoes(null) apaga as de toda a gente', () => {
    criarSessao(bd, 'oid-ana', T0);
    criarSessao(bd, 'oid-rui', T0);
    expect(terminarSessoes(bd, null)).toBe(2);
    expect(linhas()).toHaveLength(0);
    expect(resumoSessoes(bd)).toStrictEqual([]);
  });
});

describe('utilizadorDaSessao (revisão das ligações do tempo real)', () => {
  it('pelo id (hash): só lê, não conta como uso nem apaga', () => {
    const { token } = criarSessao(bd, 'oid-ana', T0);
    const id = hashToken(token);
    expect(utilizadorDaSessao(bd, id, depois(2 * DIA))).toMatchObject({ chave: 'ana@exemplo.test' });
    expect(linhas()[0]?.ultimoUsoEm).toBe(T0.toISOString());
    expect(utilizadorDaSessao(bd, id, depois(INATIVIDADE_MAXIMA_MS))).toBeNull();
    expect(linhas()).toHaveLength(1);
    expect(utilizadorDaSessao(bd, 'id-inexistente', T0)).toBeNull();
  });
});
