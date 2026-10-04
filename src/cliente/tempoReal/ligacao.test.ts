import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventoLote } from '../../dominio/api';
import { type ContextoLoja, SEM_LIGACAO_APOS_MS } from './decisoes';
import {
  criarLigacaoTempoReal,
  type DependenciasLigacao,
  FONTE_FECHADA,
  type FonteEventos,
  INTERVALO_VERIFICAR_SESSAO_MS,
  LIGACAO_MORTA_APOS_MS,
  URL_EVENTOS,
} from './ligacao';

/** EventSource falso: o teste decide quando abre, quando falha e que eventos chegam. */
class FonteFalsa implements FonteEventos {
  readyState = 0;
  fechada = false;
  private ouvintes = new Map<string, ((e: { data?: unknown }) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(tipo: string, ouvinte: (e: { data?: unknown }) => void) {
    this.ouvintes.set(tipo, [...(this.ouvintes.get(tipo) ?? []), ouvinte]);
  }
  close() {
    this.fechada = true;
    this.readyState = FONTE_FECHADA;
  }
  emitir(tipo: string, data?: unknown) {
    for (const o of this.ouvintes.get(tipo) ?? []) o({ data });
  }
  sinal() {
    this.emitir('sinal', '{}');
  }
  abrir() {
    this.readyState = 1;
    this.emitir('open');
  }
  /** Erro de rede: o EventSource volta a tentar sozinho (readyState 0). */
  cair() {
    this.readyState = 0;
    this.emitir('error');
  }
  /** Resposta que não é um stream (503, 401…): o EventSource desiste (readyState 2). */
  desistir() {
    this.readyState = FONTE_FECHADA;
    this.emitir('error');
  }
  versao(n: number) {
    this.emitir('versao', JSON.stringify({ versao: n }));
  }
  lote(evento: EventoLote) {
    this.emitir('lote', JSON.stringify(evento));
  }
}

const LOTE: EventoLote = {
  versao: 8,
  loteId: 8,
  autor: 'ana@exemplo.lu',
  autorNome: 'Ana Exemplo',
  alteracoes: 2,
};

let fontes: FonteFalsa[];
let ctx: ContextoLoja;
let dep: { [K in keyof DependenciasLigacao]: ReturnType<typeof vi.fn> } & DependenciasLigacao;

function ultima(): FonteFalsa {
  const f = fontes.at(-1);
  if (!f) throw new Error('Nenhuma fonte aberta.');
  return f;
}

beforeEach(() => {
  vi.useFakeTimers();
  fontes = [];
  ctx = {
    versaoLocal: 7,
    aCarregar: false,
    aGuardar: false,
    comRascunho: false,
    lotesDesteSeparador: new Set(),
  };
  dep = {
    abrirFonte: vi.fn((url: string) => {
      const f = new FonteFalsa(url);
      fontes.push(f);
      return f;
    }),
    contexto: vi.fn(() => ctx),
    recarregar: vi.fn(async () => {}),
    avisar: vi.fn(),
    definirSemLigacao: vi.fn(),
    verificarSessao: vi.fn(),
  } as typeof dep;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ligar e desligar', () => {
  it('abre /api/eventos uma vez; desligar fecha a fonte', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    l.ligar();
    expect(fontes).toHaveLength(1);
    expect(ultima().url).toBe(URL_EVENTOS);
    l.desligar();
    expect(ultima().fechada).toBe(true);
  });

  it('desligada, ignora os eventos que ainda cheguem e não volta a abrir', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    const f = ultima();
    l.desligar();
    f.lote(LOTE);
    l.aoVoltar();
    vi.advanceTimersByTime(60_000);
    expect(dep.recarregar).not.toHaveBeenCalled();
    expect(dep.avisar).not.toHaveBeenCalled();
    expect(fontes).toHaveLength(1);
  });
});

describe('eventos', () => {
  it('versão mais recente ao ligar: recarrega; igual: não', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().versao(7);
    expect(dep.recarregar).not.toHaveBeenCalled();
    ultima().versao(9);
    expect(dep.recarregar).toHaveBeenCalledTimes(1);
  });

  it('lote de outra pessoa: recarrega e avisa', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().lote(LOTE);
    expect(dep.recarregar).toHaveBeenCalledTimes(1);
    expect(dep.avisar).toHaveBeenCalledWith('Ana Exemplo gravou 2 alterações.');
  });

  it('lote deste separador: nada', () => {
    ctx.lotesDesteSeparador = new Set([8]);
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().lote(LOTE);
    expect(dep.recarregar).not.toHaveBeenCalled();
    expect(dep.avisar).not.toHaveBeenCalled();
  });

  it('lote que chega a meio do Guardar espera pelo fim: se era deste separador, nada', () => {
    ctx.aGuardar = true;
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().lote(LOTE);
    expect(dep.avisar).not.toHaveBeenCalled();
    // O POST respondeu: a loja registou o lote e já tem a versão dele.
    ctx = { ...ctx, aGuardar: false, versaoLocal: 8, lotesDesteSeparador: new Set([8]) };
    l.aoAcalmarLoja();
    expect(dep.avisar).not.toHaveBeenCalled();
    expect(dep.recarregar).not.toHaveBeenCalled();
  });

  it('lote de outra pessoa que chega a meio do Guardar: avisa quando acabar', () => {
    ctx.aGuardar = true;
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().lote(LOTE);
    l.aoAcalmarLoja(); // ainda a gravar: continua à espera
    expect(dep.avisar).not.toHaveBeenCalled();
    ctx = { ...ctx, aGuardar: false, lotesDesteSeparador: new Set([9]) };
    l.aoAcalmarLoja();
    expect(dep.avisar).toHaveBeenCalledTimes(1);
    expect(dep.recarregar).toHaveBeenCalledTimes(1);
    l.aoAcalmarLoja();
    expect(dep.avisar).toHaveBeenCalledTimes(1);
  });

  it('versão anunciada antes de haver estado: decide quando o 1.º carregamento acabar', () => {
    ctx = { ...ctx, versaoLocal: null, aCarregar: true };
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().versao(9);
    expect(dep.recarregar).not.toHaveBeenCalled();
    // O carregamento trouxe a 8: o servidor já vai na 9.
    ctx = { ...ctx, versaoLocal: 8, aCarregar: false };
    l.aoAcalmarLoja();
    expect(dep.recarregar).toHaveBeenCalledTimes(1);
    l.aoAcalmarLoja();
    expect(dep.recarregar).toHaveBeenCalledTimes(1);
  });

  it('servidor restaurado de uma cópia (versão mais antiga ao voltar a ligar): recarrega', () => {
    ctx = { ...ctx, versaoLocal: 120, lotesDesteSeparador: new Set([120]) };
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().versao(100);
    expect(dep.recarregar).toHaveBeenCalledTimes(1);
  });

  it('versão anunciada antes de haver estado, e o carregamento trouxe uma mais recente: nada (o lote vem a caminho)', () => {
    ctx = { ...ctx, versaoLocal: null, aCarregar: true };
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().versao(9);
    ctx = { ...ctx, versaoLocal: 10, aCarregar: false };
    l.aoAcalmarLoja();
    expect(dep.recarregar).not.toHaveBeenCalled();
  });

  it('versão anunciada antes de haver estado, e o carregamento trouxe essa: nada mais', () => {
    ctx = { ...ctx, versaoLocal: null, aCarregar: true };
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().versao(9);
    ctx = { ...ctx, versaoLocal: 9, aCarregar: false };
    l.aoAcalmarLoja();
    expect(dep.recarregar).not.toHaveBeenCalled();
  });

  it('eventos estragados são ignorados', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    const f = ultima();
    f.abrir();
    f.emitir('lote', '{"versao":"x"}');
    f.emitir('versao', 'lixo');
    expect(dep.recarregar).not.toHaveBeenCalled();
    expect(dep.avisar).not.toHaveBeenCalled();
  });
});

describe('erros e falta de ligação', () => {
  it('depois de um erro confirma a sessão (no máximo de 15 em 15 s)', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().cair();
    ultima().cair();
    expect(dep.verificarSessao).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVALO_VERIFICAR_SESSAO_MS);
    ultima().cair();
    expect(dep.verificarSessao).toHaveBeenCalledTimes(2);
  });

  it('erro de rede: o EventSource volta a tentar sozinho (não se abre outra fonte)', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().cair();
    vi.advanceTimersByTime(60_000);
    expect(fontes).toHaveLength(1);
  });

  it('mais de 30 s sem ligação: aviso; ao voltar some e recarrega', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().cair();
    vi.advanceTimersByTime(SEM_LIGACAO_APOS_MS - 1);
    expect(dep.definirSemLigacao).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dep.definirSemLigacao).toHaveBeenLastCalledWith(true);
    // Os erros seguintes (o EventSource a tentar) não mexem no aviso.
    ultima().cair();
    expect(dep.definirSemLigacao).toHaveBeenCalledTimes(1);

    ultima().abrir();
    expect(dep.definirSemLigacao).toHaveBeenLastCalledWith(false);
    expect(dep.recarregar).toHaveBeenCalledTimes(1);
  });

  it('uma falha curta (menos de 30 s) não mostra aviso nem recarrega à força', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().cair();
    vi.advanceTimersByTime(10_000);
    ultima().abrir();
    vi.advanceTimersByTime(60_000);
    expect(dep.definirSemLigacao).not.toHaveBeenCalled();
    expect(dep.recarregar).not.toHaveBeenCalled();
  });

  it('nunca chegou a abrir em 30 s: aviso', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    vi.advanceTimersByTime(SEM_LIGACAO_APOS_MS);
    expect(dep.definirSemLigacao).toHaveBeenCalledWith(true);
  });

  it('o EventSource desistiu (ex.: 503): volta a abrir mais tarde, cada vez mais espaçado', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().desistir();
    expect(ultima().fechada).toBe(true);
    vi.advanceTimersByTime(4999);
    expect(fontes).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(fontes).toHaveLength(2);
    ultima().desistir();
    vi.advanceTimersByTime(9999);
    expect(fontes).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(fontes).toHaveLength(3);
    // Abriu: a espera volta ao início.
    ultima().abrir();
    ultima().desistir();
    vi.advanceTimersByTime(5000);
    expect(fontes).toHaveLength(4);
  });

  it('abrir a fonte rebenta (browser sem SSE, URL recusado): tenta mais tarde', () => {
    dep.abrirFonte.mockImplementationOnce(() => {
      throw new Error('recusado');
    });
    const l = criarLigacaoTempoReal(dep);
    expect(() => l.ligar()).not.toThrow();
    vi.advanceTimersByTime(5000);
    expect(fontes).toHaveLength(1);
  });

  it('desligar apaga o aviso de "sem ligação" e pára de tentar', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().desistir();
    vi.advanceTimersByTime(SEM_LIGACAO_APOS_MS);
    expect(dep.definirSemLigacao).toHaveBeenLastCalledWith(true);
    const abertas = fontes.length;
    l.desligar();
    expect(dep.definirSemLigacao).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(120_000);
    expect(fontes).toHaveLength(abertas);
  });
});

describe('aoVoltar (página visível outra vez, rede de volta)', () => {
  it('ligação fechada: reabre já e recarrega', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().desistir();
    l.aoVoltar();
    expect(fontes).toHaveLength(2);
    expect(dep.recarregar).toHaveBeenCalledTimes(1);
    // A reabertura que estava marcada foi cancelada.
    vi.advanceTimersByTime(5000);
    expect(fontes).toHaveLength(2);
  });

  it('ligação aberta (ou a tentar): não mexe', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    l.aoVoltar();
    ultima().cair();
    l.aoVoltar();
    expect(fontes).toHaveLength(1);
    expect(dep.recarregar).not.toHaveBeenCalled();
  });

  it('desligada (sem sessão): não abre', () => {
    const l = criarLigacaoTempoReal(dep);
    l.aoVoltar();
    expect(fontes).toHaveLength(0);
  });

  it('aberta mas sem notícias há muito (o portátil adormeceu): reabre já e recarrega', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    // Os temporizadores não correram enquanto dormia, mas o relógio andou.
    vi.setSystemTime(Date.now() + LIGACAO_MORTA_APOS_MS + 1000);
    l.aoVoltar();
    expect(fontes).toHaveLength(2);
    expect(fontes[0]?.fechada).toBe(true);
    expect(dep.recarregar).toHaveBeenCalledTimes(1);
  });
});

describe('ligação morta sem erro (o servidor caiu atrás de um proxy que não fecha a ligação)', () => {
  it('sem notícias há mais de 75 s: fecha e volta a abrir', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    vi.advanceTimersByTime(LIGACAO_MORTA_APOS_MS - 1);
    expect(fontes).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(fontes).toHaveLength(2);
    expect(fontes[0]?.fechada).toBe(true);
    // Se o servidor continuar em baixo, o aviso aparece 30 s depois de reabrir.
    vi.advanceTimersByTime(SEM_LIGACAO_APOS_MS);
    expect(dep.definirSemLigacao).toHaveBeenLastCalledWith(true);
  });

  it('o sinal (e qualquer evento) mantém-na viva', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(25_000);
      if (i % 2 === 0) ultima().sinal();
      else ultima().versao(7);
    }
    expect(fontes).toHaveLength(1);
  });

  it('a tentar ligar outra vez (depois de um erro): o vigia não se mete', () => {
    const l = criarLigacaoTempoReal(dep);
    l.ligar();
    ultima().abrir();
    ultima().cair();
    vi.advanceTimersByTime(LIGACAO_MORTA_APOS_MS * 2);
    expect(fontes).toHaveLength(1);
  });
});
