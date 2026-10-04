import { afterEach, describe, expect, it, vi } from 'vitest';
import { decidirEntrada } from './regras';
import {
  comMarcaReuniao,
  ESTADO_INICIAL,
  entradaDaReuniao,
  hashDe,
  lerAgrupamento,
  lerHash,
  MARCA_REUNIAO,
  normalizarEstado,
} from './vista';

describe('lerHash', () => {
  it('sem hash (ou com um que não se conhece) é o Mapa', () => {
    expect(lerHash('')).toEqual(ESTADO_INICIAL);
    expect(lerHash('#')).toEqual({ vista: 'mapa', reuniao: false });
    expect(lerHash('#mapa')).toEqual({ vista: 'mapa', reuniao: false });
    expect(lerHash('#qualquer-coisa')).toEqual({ vista: 'mapa', reuniao: false });
  });

  it('lê a Tabela e o Quadro, sem ligar a maiúsculas nem a espaços', () => {
    expect(lerHash('#tabela')).toEqual({ vista: 'tabela', reuniao: false });
    expect(lerHash('#Quadro')).toEqual({ vista: 'quadro', reuniao: false });
    expect(lerHash('# quadro ')).toEqual({ vista: 'quadro', reuniao: false });
  });

  it('a reunião abre com o Quadro; #reuniao-mapa com o Mapa', () => {
    expect(lerHash('#reuniao')).toEqual({ vista: 'quadro', reuniao: true });
    expect(lerHash('#reuni%C3%A3o')).toEqual({ vista: 'quadro', reuniao: true });
    expect(lerHash('#reuniao-mapa')).toEqual({ vista: 'mapa', reuniao: true });
  });

  it('um "%" estragado não parte nada', () => {
    expect(lerHash('#%E2%8')).toEqual(ESTADO_INICIAL);
  });
});

describe('hashDe', () => {
  it('o Mapa fica sem hash; as outras vistas com o nome', () => {
    expect(hashDe({ vista: 'mapa', reuniao: false })).toBe('');
    expect(hashDe({ vista: 'tabela', reuniao: false })).toBe('#tabela');
    expect(hashDe({ vista: 'quadro', reuniao: false })).toBe('#quadro');
    expect(hashDe({ vista: 'quadro', reuniao: true })).toBe('#reuniao');
    expect(hashDe({ vista: 'mapa', reuniao: true })).toBe('#reuniao-mapa');
  });

  it('ida e volta: lerHash(hashDe(e)) devolve o mesmo estado', () => {
    for (const e of [
      { vista: 'mapa', reuniao: false },
      { vista: 'tabela', reuniao: false },
      { vista: 'quadro', reuniao: false },
      { vista: 'quadro', reuniao: true },
      { vista: 'mapa', reuniao: true },
    ] as const) {
      expect(lerHash(hashDe(e))).toEqual(e);
    }
  });

  it('na reunião não há Tabela: passa a Quadro', () => {
    expect(normalizarEstado({ vista: 'tabela', reuniao: true })).toEqual({ vista: 'quadro', reuniao: true });
    expect(hashDe({ vista: 'tabela', reuniao: true })).toBe('#reuniao');
    expect(normalizarEstado({ vista: 'tabela', reuniao: false })).toEqual({
      vista: 'tabela',
      reuniao: false,
    });
  });
});

describe('lerAgrupamento', () => {
  it('por omissão as casas; "carrinhas" e "obras" mudam', () => {
    expect(lerAgrupamento(null)).toBe('casas');
    expect(lerAgrupamento('lixo')).toBe('casas');
    expect(lerAgrupamento('carrinhas')).toBe('carrinhas');
    expect(lerAgrupamento('obras')).toBe('obras');
  });
});

describe('marca da reunião no history.state', () => {
  it('marca sem perder o que lá estiver; desmarca só a marca', () => {
    expect(entradaDaReuniao(null)).toBe(false);
    expect(entradaDaReuniao('texto')).toBe(false);
    const marcado = comMarcaReuniao({ outro: 1 }, true);
    expect(marcado).toEqual({ outro: 1, [MARCA_REUNIAO]: true });
    expect(entradaDaReuniao(marcado)).toBe(true);
    expect(comMarcaReuniao(marcado, false)).toEqual({ outro: 1 });
    expect(comMarcaReuniao(null, true)).toEqual({ [MARCA_REUNIAO]: true });
    expect(comMarcaReuniao(null, false)).toBeNull();
  });
});

// --- Histórico do browser, com uma janela falsa (o Vitest corre em node, sem DOM) ----------------

interface Entrada {
  url: string;
  state: unknown;
}

/** Uma janela mínima: location, history (com Voltar a disparar popstate) e localStorage. */
function janelaFalsa(hashInicial = '') {
  const entradas: Entrada[] = [{ url: `/${hashInicial}`, state: null }];
  let atual = 0;
  const ouvintes = new Map<string, Set<() => void>>();
  const disparar = (tipo: string) => {
    for (const f of ouvintes.get(tipo) ?? []) f();
  };
  const hashDaUrl = (url: string) => {
    const i = url.indexOf('#');
    return i < 0 || i === url.length - 1 ? '' : url.slice(i);
  };
  const janela = {
    location: {
      get hash() {
        return hashDaUrl((entradas[atual] as Entrada).url);
      },
      pathname: '/',
      search: '',
    },
    history: {
      get state() {
        return (entradas[atual] as Entrada).state;
      },
      pushState(state: unknown, _titulo: string, url: string) {
        entradas.splice(atual + 1, entradas.length, { url, state });
        atual++;
      },
      replaceState(state: unknown, _titulo: string, url: string) {
        entradas[atual] = { url, state };
      },
      back() {
        if (atual === 0) return;
        atual--;
        disparar('popstate');
      },
      forward() {
        if (atual === entradas.length - 1) return;
        atual++;
        disparar('popstate');
      },
    },
    /** Escrever um hash à mão na barra do endereço: entrada nova, sem state. */
    escreverHash(hash: string) {
      entradas.splice(atual + 1, entradas.length, { url: `/${hash}`, state: null });
      atual++;
      disparar('hashchange');
    },
    addEventListener(tipo: string, f: () => void) {
      if (!ouvintes.has(tipo)) ouvintes.set(tipo, new Set());
      ouvintes.get(tipo)?.add(f);
    },
    removeEventListener(tipo: string, f: () => void) {
      ouvintes.get(tipo)?.delete(f);
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    urls: () => entradas.map((e) => e.url),
    indice: () => atual,
  };
  return janela;
}

/** A loja das vistas numa janela falsa, com o Voltar/Avançar ligado como no useSincronizarVista. */
async function lojaComJanela(hashInicial = '') {
  const janela = janelaFalsa(hashInicial);
  vi.resetModules();
  vi.stubGlobal('window', janela);
  const { useVista } = await import('./vista');
  const aoMudar = () => useVista.getState().aplicarHash(janela.location.hash);
  janela.addEventListener('popstate', aoMudar);
  janela.addEventListener('hashchange', aoMudar);
  return { janela, useVista };
}

describe('histórico do browser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mudar de vista acrescenta entradas; o Voltar regressa à anterior', async () => {
    const { janela, useVista } = await lojaComJanela();
    useVista.getState().mudarVista('tabela');
    useVista.getState().mudarVista('quadro');
    expect(janela.urls()).toEqual(['/', '/#tabela', '/#quadro']);
    janela.history.back();
    expect(useVista.getState().vista).toBe('tabela');
  });

  it('botão Reunião e sair: volta à vista de onde se veio sem duplicar a entrada', async () => {
    const { janela, useVista } = await lojaComJanela();
    useVista.getState().mudarVista('tabela');
    useVista.getState().entrarReuniao();
    expect(janela.location.hash).toBe('#reuniao');
    // Dentro da reunião, Quadro | Mapa substitui a entrada (e mantém a marca).
    useVista.getState().mudarVista('mapa');
    expect(janela.urls()).toEqual(['/', '/#tabela', '/#reuniao-mapa']);
    useVista.getState().sairReuniao();
    expect(useVista.getState()).toMatchObject({ vista: 'tabela', reuniao: false });
    expect(janela.location.hash).toBe('#tabela');
    expect(janela.indice()).toBe(1);
    // O primeiro Voltar depois da reunião já muda de vista.
    janela.history.back();
    expect(useVista.getState().vista).toBe('mapa');
  });

  it('mudar de vista a seguir a uma reunião não leva a marca para a entrada nova', async () => {
    const { janela, useVista } = await lojaComJanela('#tabela');
    useVista.getState().entrarReuniao();
    useVista.getState().sairReuniao();
    useVista.getState().mudarVista('quadro');
    expect(entradaDaReuniao(janela.history.state)).toBe(false);
  });

  it('reunião pelo endereço: ao sair (ou se for recusada) volta à vista onde se estava', async () => {
    const { janela, useVista } = await lojaComJanela('#tabela');
    expect(useVista.getState().vista).toBe('tabela');
    janela.escreverHash('#reuniao');
    expect(useVista.getState()).toMatchObject({
      vista: 'quadro',
      reuniao: true,
      vistaAntesDaReuniao: 'tabela',
    });
    useVista.getState().sairReuniao();
    expect(useVista.getState()).toMatchObject({ vista: 'tabela', reuniao: false });
    expect(janela.location.hash).toBe('#tabela');
  });

  it('abrir a página já em #reuniao e sair: fica no Mapa, sem sair da página', async () => {
    const { janela, useVista } = await lojaComJanela('#reuniao');
    expect(useVista.getState().reuniao).toBe(true);
    useVista.getState().sairReuniao();
    expect(janela.urls()).toEqual(['/']);
    expect(useVista.getState()).toMatchObject({ vista: 'mapa', reuniao: false });
  });

  it('Voltar e Avançar para a entrada da reunião: sair volta atrás outra vez', async () => {
    const { janela, useVista } = await lojaComJanela();
    useVista.getState().mudarVista('quadro');
    useVista.getState().entrarReuniao();
    janela.history.back();
    expect(useVista.getState()).toMatchObject({ vista: 'quadro', reuniao: false });
    janela.history.forward();
    expect(useVista.getState()).toMatchObject({ reuniao: true, vistaAntesDaReuniao: 'quadro' });
    useVista.getState().sairReuniao();
    expect(janela.urls()).toEqual(['/', '/#quadro', '/#reuniao']);
    expect(janela.indice()).toBe(1);
    expect(useVista.getState()).toMatchObject({ vista: 'quadro', reuniao: false });
  });
});

describe('decidirEntrada (botão Reunião)', () => {
  it('fora do modo de edição, entra', () => {
    expect(decidirEntrada(false, 0)).toBe('entrar');
  });
  it('no modo de edição sem alterações, sai dele e entra', () => {
    expect(decidirEntrada(true, 0)).toBe('sair-da-edicao-e-entrar');
  });
  it('com alterações por guardar, não entra', () => {
    expect(decidirEntrada(true, 3)).toBe('recusar');
  });
});
