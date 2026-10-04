// O rascunho quando a sessão termina a meio do trabalho: vai já para o localStorage (em nome de quem
// tinha a sessão) e, se entrar outra conta e se continuar com ela, fica no browser para o dono.
// localStorage e loja falsos; sem DOM.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Operacao } from '../../dominio/operacoes';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import {
  INTERVALO_VIVO_MS,
  lerRascunhoPendente,
  lerRegistos,
  type RascunhoPendente,
} from '../tempoReal/rascunhoPendente';
import { porDeParteRascunhoDaContaAnterior, protegerRascunho, registoDoRascunho } from './protegerRascunho';

// Dados fictícios.
const ANA = 'ana.exemplo@exemplo.lu';
const BRUNO = 'bruno.exemplo@exemplo.lu';
const ESTE = 'separador-este';
const OUTRO = 'separador-outro';
const AGORA = Date.parse('2026-10-04T08:00:00Z');

const MOVER: Operacao = { tipo: 'mover', pessoaId: 'p-ana', campo: 'casaId', de: 'casa-1', para: 'casa-2' };

/** localStorage falso (rebentar = modo privado ou quota cheia). */
function armazenamentoFalso(rebentar = false) {
  const dados = new Map<string, string>();
  const falhar = () => {
    if (rebentar) throw new Error('QuotaExceededError');
  };
  // Com length e key, como o localStorage do browser: um registo por separador (chaves próprias).
  return {
    dados,
    get length() {
      return dados.size;
    },
    key: (i: number) => [...dados.keys()][i] ?? null,
    getItem: vi.fn((k: string) => {
      falhar();
      return dados.get(k) ?? null;
    }),
    setItem: vi.fn((k: string, v: string) => {
      falhar();
      dados.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      falhar();
      dados.delete(k);
    }),
  };
}

function lojaFalsa(passos: Operacao[][] = [[MOVER]], modoEdicao = true) {
  return {
    modoEdicao,
    passos,
    pendentes: passos.flat(),
    estadoServidor: { ...estadoExemplo(), versao: 7 },
    cancelarEdicao: vi.fn(),
  };
}

function registo(armazenamento: ReturnType<typeof armazenamentoFalso>): RascunhoPendente | null {
  return lerRegistos(armazenamento)[0] ?? null;
}

afterEach(() => {
  // Pára o "continuo aberto", se algum teste o tiver ligado.
  porDeParteRascunhoDaContaAnterior({ loja: lojaFalsa(), armazenamento: null });
  vi.useRealTimers();
});

describe('registoDoRascunho', () => {
  it('os passos, a versão de base e quem tinha a sessão, marcado como deste separador', () => {
    expect(registoDoRascunho(lojaFalsa(), ANA, AGORA, ESTE)).toStrictEqual({
      passos: [[MOVER]],
      versaoBase: 7,
      data: '2026-10-04T08:00:00.000Z',
      autor: ANA,
      separador: ESTE,
      vivoEm: AGORA,
    });
  });

  it('sem alterações por guardar (ou fora do modo de edição): nada a guardar', () => {
    expect(registoDoRascunho(lojaFalsa([]), ANA, AGORA, ESTE)).toBeNull();
    expect(registoDoRascunho(lojaFalsa([[MOVER]], false), ANA, AGORA, ESTE)).toBeNull();
    expect(registoDoRascunho({ ...lojaFalsa(), estadoServidor: null }, ANA, AGORA, ESTE)).toBeNull();
  });
});

describe('protegerRascunho (a sessão terminou)', () => {
  it('guarda já o rascunho no localStorage, em nome de quem tinha a sessão', () => {
    const armazenamento = armazenamentoFalso();
    const r = protegerRascunho(ANA, { loja: lojaFalsa(), armazenamento, agora: AGORA, separador: ESTE });
    expect(r).toBe('guardado');
    expect(registo(armazenamento)).toMatchObject({ passos: [[MOVER]], autor: ANA, separador: ESTE });
  });

  it('o separador novo (onde se entra) não fica com uma cópia; se este fechar, recupera-o', () => {
    const armazenamento = armazenamentoFalso();
    protegerRascunho(ANA, { loja: lojaFalsa(), armazenamento, agora: AGORA, separador: ESTE });
    expect(lerRascunhoPendente(armazenamento, AGORA + 1000, ANA, OUTRO)).toBeNull();
    // O telemóvel descartou este separador sem aviso: passado o tempo, conta como largado.
    expect(lerRascunhoPendente(armazenamento, AGORA + 4 * 60_000, ANA, OUTRO)?.passos).toStrictEqual([
      [MOVER],
    ]);
  });

  it('sem alterações por guardar não escreve nada', () => {
    const armazenamento = armazenamentoFalso();
    expect(protegerRascunho(ANA, { loja: lojaFalsa([]), armazenamento, agora: AGORA, separador: ESTE })).toBe(
      'sem-rascunho',
    );
    expect(armazenamento.setItem).not.toHaveBeenCalled();
  });

  it('o browser não deixa guardar (modo privado, cheio): só em memória, sem rebentar', () => {
    const r = protegerRascunho(ANA, {
      loja: lojaFalsa(),
      armazenamento: armazenamentoFalso(true),
      agora: AGORA,
      separador: ESTE,
    });
    expect(r).toBe('so-em-memoria');
    expect(protegerRascunho(ANA, { loja: lojaFalsa(), armazenamento: null, separador: ESTE })).toBe(
      'so-em-memoria',
    );
  });

  it('vai dizendo que este separador continua aberto, e pára quando o registo deixa de ser dele', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(AGORA);
    const armazenamento = armazenamentoFalso();
    protegerRascunho(ANA, { loja: lojaFalsa(), armazenamento, agora: AGORA, separador: ESTE });
    vi.advanceTimersByTime(INTERVALO_VIVO_MS);
    expect(registo(armazenamento)?.vivoEm).toBe(AGORA + INTERVALO_VIVO_MS);

    // A sessão voltou e a loja apagou o registo (o rascunho em memória é que conta).
    armazenamento.dados.clear();
    vi.advanceTimersByTime(INTERVALO_VIVO_MS);
    const escritas = armazenamento.setItem.mock.calls.length;
    vi.advanceTimersByTime(INTERVALO_VIVO_MS * 5);
    expect(armazenamento.setItem.mock.calls.length).toBe(escritas);
    expect(registo(armazenamento)).toBeNull();
  });
});

describe('porDeParteRascunhoDaContaAnterior (entrou outra conta e continua-se com ela)', () => {
  it('o rascunho sai da página, mas fica no browser para o dono, e não para a conta nova', () => {
    const armazenamento = armazenamentoFalso();
    const loja = lojaFalsa();
    protegerRascunho(ANA, { loja, armazenamento, agora: AGORA, separador: ESTE });
    porDeParteRascunhoDaContaAnterior({ loja, armazenamento, separador: ESTE });

    expect(loja.cancelarEdicao).toHaveBeenCalledOnce();
    // Largado: o cancelarEdicao (que só apaga o registo deste separador) já não lhe toca.
    expect(registo(armazenamento)).toMatchObject({ autor: ANA, separador: null });
    expect(lerRascunhoPendente(armazenamento, AGORA + 1000, BRUNO, ESTE)).toBeNull();
    expect(lerRascunhoPendente(armazenamento, AGORA + 1000, ANA, ESTE)?.passos).toStrictEqual([[MOVER]]);
  });

  it('sem registo (o browser não deixou guardar): só sai da página', () => {
    const armazenamento = armazenamentoFalso();
    const loja = lojaFalsa();
    porDeParteRascunhoDaContaAnterior({ loja, armazenamento, separador: ESTE });
    expect(loja.cancelarEdicao).toHaveBeenCalledOnce();
    expect(armazenamento.setItem).not.toHaveBeenCalled();
  });
});
