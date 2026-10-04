// Loja do browser: carregar sem corridas, guardar (versão nova e lotes deste separador) e o rascunho que
// não chegou ao servidor porque a sessão terminou. fetch e localStorage falsos; sem DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Operacao } from '../../dominio/operacoes';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import { useSessao } from '../entrar/sessao';
import {
  guardarRascunhoPendente,
  INTERVALO_VIVO_MS,
  lerRegistos,
  marcarRecuperado,
  type RascunhoPendente,
  registoDoSeparador,
  VALIDADE_RASCUNHO_MS,
} from '../tempoReal/rascunhoPendente';
import { SEPARADOR, useLoja } from './loja';

const INICIAL = useLoja.getState();
const SESSAO_INICIAL = useSessao.getState();

const MOVER_ANA: Operacao = {
  tipo: 'mover',
  pessoaId: 'p-ana',
  campo: 'casaId',
  de: 'casa-1',
  para: 'casa-2',
};
const MOVER_ANA_CARRINHA: Operacao = {
  tipo: 'mover',
  pessoaId: 'p-ana',
  campo: 'carrinhaId',
  de: 'zz1001',
  para: 'zz1003',
};

function estadoNaVersao(versao: number, mudar?: (e: Estado) => Estado): Estado {
  const e = { ...estadoExemplo(), versao };
  return mudar ? mudar(e) : e;
}

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

/** localStorage falso, com key/length como o verdadeiro (rebentar = modo privado ou quota cheia). */
function armazenamentoFalso(rebentar = false) {
  const dados = new Map<string, string>();
  const falhar = () => {
    if (rebentar) throw new Error('SecurityError');
  };
  return {
    dados,
    get length() {
      falhar();
      return dados.size;
    },
    key: (i: number) => {
      falhar();
      return [...dados.keys()][i] ?? null;
    },
    getItem: (k: string) => {
      falhar();
      return dados.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      falhar();
      dados.set(k, v);
    },
    removeItem: (k: string) => {
      falhar();
      dados.delete(k);
    },
  };
}

let armazenamento: ReturnType<typeof armazenamentoFalso>;
let pedirEstado: () => Promise<Response>;
let gravar: (corpo: unknown) => Promise<Response>;
let pedidos: string[];

beforeEach(() => {
  useLoja.setState(INICIAL, true);
  useSessao.setState(SESSAO_INICIAL, true);
  armazenamento = armazenamentoFalso();
  vi.stubGlobal('localStorage', armazenamento);
  pedidos = [];
  pedirEstado = async () => respostaJson(200, estadoNaVersao(7));
  gravar = async () => respostaJson(201, { loteId: 8, versao: 8 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      pedidos.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/estado') return pedirEstado();
      if (url === '/api/lotes') return gravar(JSON.parse(String(init?.body)));
      throw new Error(`Pedido inesperado: ${url}`);
    }),
  );
});

afterEach(() => {
  // Pára o "continuo aberto" do rascunho guardado, se algum teste o tiver ligado.
  useLoja.getState().cancelarEdicao();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function dentroComo(chave: string): void {
  useSessao.setState({
    estado: 'dentro',
    utilizador: { chave, nome: 'Ana Exemplo', email: chave, modo: 'entra' },
    motivoFora: null,
  });
}

/** O registo mais recente no localStorage (nestes testes há no máximo um, salvo dito o contrário). */
function registo(): RascunhoPendente | null {
  return lerRegistos(armazenamento)[0] ?? null;
}

/** Um registo deixado por outro separador (por omissão: largado, de uma página que fechou). */
function guardarRegisto(parcial: Partial<RascunhoPendente>): void {
  guardarRascunhoPendente(armazenamento, {
    passos: [[MOVER_ANA], [MOVER_ANA_CARRINHA]],
    versaoBase: 7,
    data: new Date(Date.now() - 60_000).toISOString(),
    autor: 'ana@exemplo.lu',
    separador: null,
    vivoEm: 0,
    origem: 'pagina-que-fechou',
    ...parcial,
  });
}

async function comEstadoEEdicao(ops: Operacao[][] = [[MOVER_ANA]]): Promise<void> {
  await useLoja.getState().carregar();
  useLoja.getState().entrarEdicao();
  for (const passo of ops) useLoja.getState().aplicar(passo);
}

function adiada() {
  let resolver!: (r: Response) => void;
  const promessa = new Promise<Response>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

describe('carregar', () => {
  it('traz o estado e mantém o rascunho por cima', async () => {
    await comEstadoEEdicao();
    pedirEstado = async () => respostaJson(200, estadoNaVersao(9));
    await useLoja.getState().carregar();
    const s = useLoja.getState();
    expect(s.estadoServidor?.versao).toBe(9);
    expect(s.estadoServidor?.pessoas.find((p) => p.id === 'p-ana')?.casaId).toBe('casa-1');
    expect(s.estado?.pessoas.find((p) => p.id === 'p-ana')?.casaId).toBe('casa-2');
    expect(s.modoEdicao).toBe(true);
    expect(s.pendentes).toHaveLength(1);
    expect(s.aCarregar).toBe(false);
  });

  it('uma resposta antiga que chega depois de uma mais recente é ignorada', async () => {
    const primeira = adiada();
    const segunda = adiada();
    const fila = [primeira, segunda];
    pedirEstado = () => (fila.shift() as ReturnType<typeof adiada>).promessa;

    const a = useLoja.getState().carregar();
    const b = useLoja.getState().carregar();
    segunda.resolver(respostaJson(200, estadoNaVersao(9)));
    await b;
    expect(useLoja.getState().estadoServidor?.versao).toBe(9);
    expect(useLoja.getState().aCarregar).toBe(false);

    primeira.resolver(respostaJson(200, estadoNaVersao(8)));
    await a;
    expect(useLoja.getState().estadoServidor?.versao).toBe(9);
    expect(useLoja.getState().aCarregar).toBe(false);
  });

  it('pela ordem normal, a mais recente fica; "a carregar" só acaba com a última', async () => {
    const primeira = adiada();
    const segunda = adiada();
    const fila = [primeira, segunda];
    pedirEstado = () => (fila.shift() as ReturnType<typeof adiada>).promessa;

    const a = useLoja.getState().carregar();
    const b = useLoja.getState().carregar();
    primeira.resolver(respostaJson(200, estadoNaVersao(8)));
    await a;
    expect(useLoja.getState().estadoServidor?.versao).toBe(8);
    expect(useLoja.getState().aCarregar).toBe(true);
    segunda.resolver(respostaJson(200, estadoNaVersao(9)));
    await b;
    expect(useLoja.getState().estadoServidor?.versao).toBe(9);
    expect(useLoja.getState().aCarregar).toBe(false);
  });

  it('o erro de um pedido mais recente que falhou some quando chega a resposta de um mais antigo', async () => {
    const primeira = adiada();
    const segunda = adiada();
    const fila = [primeira, segunda];
    pedirEstado = () => (fila.shift() as ReturnType<typeof adiada>).promessa;

    const a = useLoja.getState().carregar();
    const b = useLoja.getState().carregar();
    segunda.resolver(respostaJson(503, { erro: 'Falha curta.' }));
    await b;
    expect(useLoja.getState().erro).not.toBeNull();
    primeira.resolver(respostaJson(200, estadoNaVersao(8)));
    await a;
    const s = useLoja.getState();
    expect(s.estadoServidor?.versao).toBe(8);
    expect(s.erro).toBeNull();
    expect(s.aCarregar).toBe(false);
  });

  it('servidor restaurado de uma cópia: os lotes deste separador acima da versão nova esquecem-se', async () => {
    // A numeração recomeça: o lote 9 de outra pessoa não pode passar por ser deste separador.
    useLoja.setState({ lotesDesteSeparador: new Set([5, 9, 11]) });
    pedirEstado = async () => respostaJson(200, estadoNaVersao(7));
    await useLoja.getState().carregar();
    expect([...useLoja.getState().lotesDesteSeparador]).toStrictEqual([5]);

    // No dia a dia (versão igual ou acima) ficam todos, e o conjunto é o mesmo.
    const antes = useLoja.getState().lotesDesteSeparador;
    await useLoja.getState().carregar();
    expect(useLoja.getState().lotesDesteSeparador).toBe(antes);
  });

  it('depois de Sair, a resposta de um pedido que ia a meio não volta a pôr os dados na loja', async () => {
    await useLoja.getState().carregar();
    const lento = adiada();
    pedirEstado = () => lento.promessa;
    const a = useLoja.getState().carregar();
    useLoja.getState().limparDepoisDeSair();
    expect(useLoja.getState().estadoServidor).toBeNull();
    lento.resolver(respostaJson(200, estadoNaVersao(9)));
    await a;
    const s = useLoja.getState();
    expect(s.estadoServidor).toBeNull();
    expect(s.estado).toBeNull();
    expect(s.erro).toBeNull();
    // Ao voltar a entrar, um pedido novo carrega normalmente.
    pedirEstado = async () => respostaJson(200, estadoNaVersao(10));
    await useLoja.getState().carregar();
    expect(useLoja.getState().estadoServidor?.versao).toBe(10);
  });

  it('o erro de um pedido antigo não aparece se houver um mais recente', async () => {
    const primeira = adiada();
    const segunda = adiada();
    const fila = [primeira, segunda];
    pedirEstado = () => (fila.shift() as ReturnType<typeof adiada>).promessa;

    const a = useLoja.getState().carregar();
    const b = useLoja.getState().carregar();
    primeira.resolver(respostaJson(500, { erro: 'x' }));
    await a;
    expect(useLoja.getState().erro).toBeNull();
    segunda.resolver(respostaJson(200, estadoNaVersao(9)));
    await b;
    expect(useLoja.getState().erro).toBeNull();
    expect(useLoja.getState().estadoServidor?.versao).toBe(9);
  });
});

describe('guardar', () => {
  it('com o 201: versão da resposta, lote registado como deste separador, recarrega e sai da edição', async () => {
    await comEstadoEEdicao();
    const corpos: unknown[] = [];
    gravar = async (corpo) => {
      corpos.push(corpo);
      pedirEstado = async () =>
        respostaJson(
          200,
          estadoNaVersao(8, (e) => ({
            ...e,
            pessoas: e.pessoas.map((p) => (p.id === 'p-ana' ? { ...p, casaId: 'casa-2' } : p)),
          })),
        );
      return respostaJson(201, { loteId: 8, versao: 8 });
    };
    expect(await useLoja.getState().guardar('troca combinada')).toBe(true);

    const s = useLoja.getState();
    expect(corpos[0]).toStrictEqual({ versaoBase: 7, operacoes: [MOVER_ANA], comentario: 'troca combinada' });
    expect(pedidos).toStrictEqual(['GET /api/estado', 'POST /api/lotes', 'GET /api/estado']);
    expect(s.estadoServidor?.versao).toBe(8);
    expect([...s.lotesDesteSeparador]).toStrictEqual([8]);
    expect(s.modoEdicao).toBe(false);
    expect(s.passos).toStrictEqual([]);
    expect(s.aGuardar).toBe(false);
  });

  it('se recarregar falhar, o estado gravado já tem a versão nova e as mudanças', async () => {
    await comEstadoEEdicao();
    gravar = async () => {
      pedirEstado = async () => respostaJson(503, { erro: 'em baixo' });
      return respostaJson(201, { loteId: 8, versao: 8 });
    };
    await useLoja.getState().guardar();
    const s = useLoja.getState();
    expect(s.estadoServidor?.versao).toBe(8);
    expect(s.estadoServidor?.pessoas.find((p) => p.id === 'p-ana')?.casaId).toBe('casa-2');
  });

  it('alguém gravou pelo meio (versão não seguida): o estado gravado fica com a versão antiga', async () => {
    // Este estado não tem o lote da outra pessoa: o tempo real tem de o achar antigo e recarregar.
    await comEstadoEEdicao();
    gravar = async () => {
      pedirEstado = async () => respostaJson(503, { erro: 'em baixo' });
      return respostaJson(201, { loteId: 9, versao: 9 });
    };
    await useLoja.getState().guardar();
    const s = useLoja.getState();
    expect(s.estadoServidor?.versao).toBe(7);
    expect([...s.lotesDesteSeparador]).toStrictEqual([9]);
  });

  it('um pedido do estado que saiu antes de gravar e responde depois não apaga o que se gravou', async () => {
    await comEstadoEEdicao();
    const antiga = adiada();
    pedirEstado = () => antiga.promessa;
    const carregamentoAntigo = useLoja.getState().carregar();
    gravar = async () => {
      pedirEstado = async () => respostaJson(503, { erro: 'em baixo' });
      return respostaJson(201, { loteId: 8, versao: 8 });
    };
    await useLoja.getState().guardar();
    antiga.resolver(respostaJson(200, estadoNaVersao(7)));
    await carregamentoAntigo;
    const s = useLoja.getState();
    expect(s.estadoServidor?.versao).toBe(8);
    expect(s.estadoServidor?.pessoas.find((p) => p.id === 'p-ana')?.casaId).toBe('casa-2');
  });

  it('os lotes deste separador acumulam-se', async () => {
    // Servidor coerente: depois de cada lote, o estado tem a versão dele.
    const gravarNaVersao = (versao: number) => async () => {
      pedirEstado = async () => respostaJson(200, estadoNaVersao(versao));
      return respostaJson(201, { loteId: versao, versao });
    };
    await comEstadoEEdicao();
    gravar = gravarNaVersao(8);
    await useLoja.getState().guardar();
    useLoja.getState().entrarEdicao();
    useLoja.getState().aplicar([MOVER_ANA_CARRINHA]);
    gravar = gravarNaVersao(11);
    await useLoja.getState().guardar();
    expect([...useLoja.getState().lotesDesteSeparador]).toStrictEqual([8, 11]);
  });
});

describe('sessão terminada ao guardar', () => {
  it('nada gravado: o rascunho fica no localStorage e em memória, e o erro manda entrar outra vez', async () => {
    dentroComo('ana@exemplo.lu');
    await comEstadoEEdicao([[MOVER_ANA], [MOVER_ANA_CARRINHA]]);
    gravar = async () => respostaJson(401, { erro: 'Sem sessão.' });

    expect(await useLoja.getState().guardar()).toBe(false);
    const s = useLoja.getState();
    expect(s.erroGuardar).toMatch(/sessão terminou/);
    expect(s.erroGuardar).toMatch(/não se perdem/);
    expect(s.modoEdicao).toBe(true);
    expect(s.passos).toHaveLength(2);
    expect(s.aGuardar).toBe(false);
    // O api.ts marca a sessão como terminada.
    expect(useSessao.getState().estado).toBe('fora');

    const r = registo();
    expect(r?.passos).toStrictEqual([[MOVER_ANA], [MOVER_ANA_CARRINHA]]);
    expect(r?.versaoBase).toBe(7);
    expect(r?.autor).toBe('ana@exemplo.lu');
    expect(r?.separador).toBe(SEPARADOR);
    expect(Number.isNaN(Date.parse(r?.data ?? ''))).toBe(false);
  });

  it('já sem sessão quando se carrega em Guardar: o registo fica em nome de quem a tinha', async () => {
    dentroComo('ana@exemplo.lu');
    await comEstadoEEdicao();
    useSessao.setState({
      estado: 'fora',
      motivoFora: 'terminou',
      utilizador: null,
      contaAnterior: { chave: 'ana@exemplo.lu', nome: 'Ana Exemplo', email: 'ana@exemplo.lu', modo: 'entra' },
    });
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    expect(registo()?.autor).toBe('ana@exemplo.lu');
  });

  it('sem localStorage (modo privado): não rebenta e avisa para não fechar a página', async () => {
    vi.stubGlobal('localStorage', armazenamentoFalso(true));
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    expect(await useLoja.getState().guardar()).toBe(false);
    expect(useLoja.getState().erroGuardar).toMatch(/Não feches nem recarregues esta página/);
  });

  it('enquanto o separador está aberto vai dizendo que continua vivo', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    const antes = registo()?.vivoEm ?? 0;
    vi.advanceTimersByTime(INTERVALO_VIVO_MS);
    expect(registo()?.vivoEm).toBeGreaterThan(antes);
  });

  it('a sessão volta neste separador (entrou-se noutro): o rascunho em memória continua e o guardado apaga-se', async () => {
    dentroComo('ana@exemplo.lu');
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    expect(registo()).not.toBeNull();

    dentroComo('ana@exemplo.lu');
    await useLoja.getState().carregar();
    const s = useLoja.getState();
    expect(registo()).toBeNull();
    expect(s.modoEdicao).toBe(true);
    expect(s.passos).toStrictEqual([[MOVER_ANA]]);
    expect(s.avisoRascunhoRecuperado).toBeNull();
  });

  it('a sessão volta (aoEntrar), mesmo sem carregar: o registo deste separador apaga-se', async () => {
    dentroComo('ana@exemplo.lu');
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    expect(registoDoSeparador(armazenamento, SEPARADOR)).not.toBeNull();

    dentroComo('ana@exemplo.lu');
    useLoja.getState().aoEntrar();
    expect(registoDoSeparador(armazenamento, SEPARADOR)).toBeNull();
    expect(useLoja.getState().passos).toStrictEqual([[MOVER_ANA]]);
  });

  it('entrou OUTRA conta neste separador: o registo (da anterior) fica', async () => {
    dentroComo('ana@exemplo.lu');
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();

    dentroComo('bruno@exemplo.lu');
    useLoja.getState().aoEntrar();
    await useLoja.getState().carregar();
    expect(registoDoSeparador(armazenamento, SEPARADOR)?.autor).toBe('ana@exemplo.lu');
  });

  it('ainda sem sessão, um carregamento que chega atrasado não apaga o registo', async () => {
    dentroComo('ana@exemplo.lu');
    await comEstadoEEdicao();
    const atrasado = adiada();
    pedirEstado = () => atrasado.promessa;
    const carregamento = useLoja.getState().carregar();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    expect(useSessao.getState().estado).toBe('fora');
    atrasado.resolver(respostaJson(200, estadoNaVersao(7)));
    await carregamento;
    expect(registoDoSeparador(armazenamento, SEPARADOR)).not.toBeNull();
  });

  it('desfez tudo depois de voltar a entrar: o registo deste separador não ressuscita os passos', async () => {
    dentroComo('ana@exemplo.lu');
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();

    dentroComo('ana@exemplo.lu');
    useLoja.getState().desfazer();
    expect(useLoja.getState().passos).toStrictEqual([]);
    await useLoja.getState().carregar();
    const s = useLoja.getState();
    expect(s.passos).toStrictEqual([]);
    expect(s.avisoRascunhoRecuperado).toBeNull();
    expect(registoDoSeparador(armazenamento, SEPARADOR)).toBeNull();
  });

  it('dois separadores em edição quando a sessão expira: o deste não apaga o do outro', async () => {
    dentroComo('ana@exemplo.lu');
    guardarRegisto({ separador: 'outro', origem: 'outro', vivoEm: Date.now() });
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    expect(useLoja.getState().erroGuardar).toMatch(/não se perdem/);
    expect(
      lerRegistos(armazenamento)
        .map((r) => r.origem)
        .sort(),
    ).toStrictEqual(['outro', SEPARADOR].sort());
  });

  it('o rascunho largado de outra pessoa no mesmo PC continua lá depois de um Guardar com 401', async () => {
    guardarRegisto({ autor: 'bruno@exemplo.lu', origem: 'pc-bruno' });
    dentroComo('ana@exemplo.lu');
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    expect(lerRegistos(armazenamento).find((r) => r.origem === 'pc-bruno')?.autor).toBe('bruno@exemplo.lu');
  });

  it('cancelar apaga o rascunho guardado deste separador', async () => {
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    useLoja.getState().cancelarEdicao();
    expect(registo()).toBeNull();
  });

  it('guardar com sucesso depois de voltar a entrar apaga o rascunho guardado', async () => {
    await comEstadoEEdicao();
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    gravar = async () => respostaJson(201, { loteId: 8, versao: 8 });
    expect(await useLoja.getState().guardar()).toBe(true);
    expect(registo()).toBeNull();
  });
});

describe('recuperar o rascunho depois de voltar a entrar (página nova)', () => {
  it('o 1.º carregamento põe-no no modo de edição, com aviso, e apaga-o', async () => {
    dentroComo('ana@exemplo.lu');
    guardarRegisto({ separador: null });
    await useLoja.getState().carregar();

    const s = useLoja.getState();
    expect(s.modoEdicao).toBe(true);
    expect(s.passos).toStrictEqual([[MOVER_ANA], [MOVER_ANA_CARRINHA]]);
    expect(s.pendentes).toHaveLength(2);
    expect(s.estado?.pessoas.find((p) => p.id === 'p-ana')?.casaId).toBe('casa-2');
    expect(s.avisoRascunhoRecuperado).toBe(
      'Recuperámos 2 alterações que não chegaram a ser guardadas. Revê-as e carrega em Guardar.',
    );
    expect(lerRegistos(armazenamento)).toStrictEqual([]);

    // Desfazer continua a funcionar passo a passo.
    useLoja.getState().desfazer();
    expect(useLoja.getState().passos).toStrictEqual([[MOVER_ANA]]);
  });

  it('de um separador sem notícias há muito (suspenso?): recupera-se e fica marcado como recuperado', async () => {
    dentroComo('ana@exemplo.lu');
    guardarRegisto({ separador: 'adormecido', origem: 'adormecido', vivoEm: Date.now() - 10 * 60_000 });
    await useLoja.getState().carregar();
    expect(useLoja.getState().modoEdicao).toBe(true);
    expect(registoDoSeparador(armazenamento, 'adormecido')?.recuperadoPor).toBe(SEPARADOR);
    // Não se recupera outra vez (ex.: outro carregamento depois de cancelar).
    useLoja.getState().cancelarEdicao();
    await useLoja.getState().carregar();
    expect(useLoja.getState().modoEdicao).toBe(false);
  });

  it('este separador acorda e outro já recuperou o seu rascunho: larga a cópia, com aviso', async () => {
    dentroComo('ana@exemplo.lu');
    await comEstadoEEdicao([[MOVER_ANA], [MOVER_ANA_CARRINHA]]);
    gravar = async () => respostaJson(401, {});
    await useLoja.getState().guardar();
    // Enquanto este estava suspenso, o separador onde se entrou recuperou-o.
    marcarRecuperado(armazenamento, SEPARADOR, 'separador-novo');

    dentroComo('ana@exemplo.lu');
    useLoja.getState().aoEntrar();
    const s = useLoja.getState();
    expect(s.modoEdicao).toBe(false);
    expect(s.passos).toStrictEqual([]);
    expect(s.avisoRascunhoRecuperado).toBe(
      'As 2 alterações por guardar deste separador foram recuperadas noutro separador. Revê-as e guarda-as lá.',
    );
    expect(lerRegistos(armazenamento)).toStrictEqual([]);
  });

  it('largado pela página que fechou (separador null): recupera-se logo', async () => {
    guardarRegisto({ separador: null });
    await useLoja.getState().carregar();
    expect(useLoja.getState().modoEdicao).toBe(true);
  });

  it('em modo de edição mas sem alterações: recupera-se', async () => {
    await useLoja.getState().carregar();
    useLoja.getState().entrarEdicao();
    guardarRegisto({});
    await useLoja.getState().carregar();
    expect(useLoja.getState().passos).toHaveLength(2);
  });

  it('outro separador ainda o tem aberto: não se recupera aqui', async () => {
    guardarRegisto({ separador: 'outro', vivoEm: Date.now() });
    await useLoja.getState().carregar();
    expect(useLoja.getState().modoEdicao).toBe(false);
    expect(registo()).not.toBeNull();
  });

  it('com mais de 24 h: não se recupera e apaga-se', async () => {
    guardarRegisto({ data: new Date(Date.now() - VALIDADE_RASCUNHO_MS - 1000).toISOString() });
    await useLoja.getState().carregar();
    expect(useLoja.getState().modoEdicao).toBe(false);
    expect(registo()).toBeNull();
  });

  it('de outra pessoa: não se recupera', async () => {
    dentroComo('bruno@exemplo.lu');
    guardarRegisto({});
    await useLoja.getState().carregar();
    expect(useLoja.getState().modoEdicao).toBe(false);
    expect(registo()).not.toBeNull();
  });

  it('a meio de outra edição: fica guardado para depois', async () => {
    await comEstadoEEdicao([[MOVER_ANA_CARRINHA]]);
    guardarRegisto({ passos: [[MOVER_ANA]] });
    await useLoja.getState().carregar();
    expect(useLoja.getState().passos).toStrictEqual([[MOVER_ANA_CARRINHA]]);
    expect(registo()).not.toBeNull();
  });

  it('mudanças que se anulam: não entra no modo de edição', async () => {
    guardarRegisto({ passos: [[MOVER_ANA], [{ ...MOVER_ANA, de: 'casa-2', para: 'casa-1' }]] });
    await useLoja.getState().carregar();
    expect(useLoja.getState().modoEdicao).toBe(false);
    expect(registo()).toBeNull();
  });

  it('o aviso fecha-se à mão, ao cancelar e ao guardar', async () => {
    guardarRegisto({});
    await useLoja.getState().carregar();
    useLoja.getState().dispensarAvisoRascunho();
    expect(useLoja.getState().avisoRascunhoRecuperado).toBeNull();

    useLoja.getState().cancelarEdicao();
    guardarRegisto({});
    await useLoja.getState().carregar();
    expect(useLoja.getState().avisoRascunhoRecuperado).not.toBeNull();
    useLoja.getState().cancelarEdicao();
    expect(useLoja.getState().avisoRascunhoRecuperado).toBeNull();

    guardarRegisto({});
    await useLoja.getState().carregar();
    await useLoja.getState().guardar();
    expect(useLoja.getState().avisoRascunhoRecuperado).toBeNull();
  });
});
