// Estado do browser (Zustand): dados vindos do servidor + estado da interface.
//
// Modo de edição: nada se pode mudar fora dele. Lá dentro, cada mudança é um "passo" do rascunho
// (Ctrl+Z desfaz o passo inteiro). O que se vê (`estado`, `indices`, `contadores`, `dormidas`) é
// SEMPRE o estado do servidor com o rascunho aplicado — é isso que faz a simulação "e se".
// Só "Guardar" envia o rascunho ao servidor; "Cancelar" deita-o fora e volta tudo ao que estava.
//
// Tempo real (tempoReal/): quando outra pessoa grava, o estado recarrega e o rascunho continua por cima.
// Um carregamento que responda depois de outro mais recente é ignorado. Os lotes gravados por este
// separador ficam registados, para o tempo real não se avisar a si próprio.
//
// Se a sessão terminou quando se carregou em Guardar, o rascunho fica também no localStorage (ver
// tempoReal/rascunhoPendente.ts): se a página fechar ou recarregar, volta no 1.º carregamento depois de
// entrar outra vez. Se este separador continuar aberto, quando a sessão volta é o rascunho em memória que
// conta e o registo apaga-se.

import { create } from 'zustand';
import { type Contadores, calcularContadores } from '../../dominio/contadores';
import { dataNoLuxemburgo } from '../../dominio/datas';
import { type Dormida, dormidasDasCarrinhas } from '../../dominio/dormidas';
import { type Indices, indexar } from '../../dominio/indices';
import {
  type Alvo,
  aplicarOperacoes,
  compactarOperacoes,
  type Operacao,
  operacaoSemEfeito,
  operacoesParaAlvo,
} from '../../dominio/operacoes';
import type { Estado, Id } from '../../dominio/tipos';
import { useSessao } from '../entrar/sessao';
import {
  apagarSeForDeste,
  armazenamentoLocal,
  autorCompativel,
  comTrancaRascunhos,
  guardarRascunhoPendente,
  INTERVALO_VIVO_MS,
  largar,
  lerRascunhoPendente,
  marcarRecuperado,
  marcarVivo,
  registoDoSeparador,
  retomar,
  textoRascunhoNoutroSeparador,
  textoRascunhoRecuperado,
} from '../tempoReal/rascunhoPendente';
import {
  type ConflitoServidor,
  ErroConflito,
  ErroServidor,
  ErroSessao,
  guardarLote,
  obterEstado,
} from './api';

/** O que está em foco (a ficha aberta). M2: também uma obra ("quem vem para esta obra e de onde"). */
export type Foco = { tipo: 'pessoa' | 'casa' | 'carrinha' | 'obra'; id: Id } | null;

export interface PedidoIrPara {
  lat: number;
  lng: number;
  zoom: number | null;
  /** Muda a cada pedido, para o mapa reagir mesmo que o destino seja o mesmo. */
  seq: number;
}

/** substituir = clique; alternar = Ctrl/⌘+clique; intervalo = Shift+clique. */
export type ModoSelecao = 'substituir' | 'alternar' | 'intervalo';

/** Camadas do mapa que se podem ligar e desligar. */
export type Camada = 'casas' | 'carrinhas' | 'obras';

interface Derivados {
  estado: Estado;
  indices: Indices;
  contadores: Contadores;
  dormidas: Map<Id, Dormida>;
}

/**
 * @param hoje M2: o dia no Luxemburgo (loja.hoje): quem está indisponível nesse dia não conta na lotação das
 *   carrinhas (Indices.indisponiveis, Indices.ocupadosCarrinha).
 */
function derivar(estado: Estado, hoje: string): Derivados {
  const indices = indexar(estado, hoje);
  return {
    estado,
    indices,
    contadores: calcularContadores(estado, indices),
    dormidas: dormidasDasCarrinhas(estado, indices),
  };
}

// --- Rascunho que não chegou ao servidor (sessão terminada) --------------------------------------

/** Esta página aberta (muda a cada carregamento da página). */
export const SEPARADOR = criarIdSeparador();

function criarIdSeparador(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

let temporizadorVivo: ReturnType<typeof setInterval> | null = null;

function pararVivo(): void {
  if (temporizadorVivo === null) return;
  clearInterval(temporizadorVivo);
  temporizadorVivo = null;
}

/** Enquanto o rascunho guardado for deste separador, vai dizendo que continua aberto. */
function manterVivo(): void {
  pararVivo();
  temporizadorVivo = setInterval(() => {
    if (!marcarVivo(armazenamentoLocal(), SEPARADOR, Date.now())) pararVivo();
  }, INTERVALO_VIVO_MS);
}

/** O rascunho foi gravado ou deitado fora: o guardado (se for deste separador) já não serve. */
function esquecerRascunhoDesteSeparador(): void {
  pararVivo();
  apagarSeForDeste(armazenamentoLocal(), SEPARADOR);
}

function utilizadorAtual(): string | null {
  return useSessao.getState().utilizador?.chave ?? null;
}

/**
 * Lotes deste separador até à versão do servidor. Os que estão acima já não existem no servidor (a base de
 * dados foi restaurada de uma cópia) e a numeração vai voltar a dá-los a lotes de outras pessoas, que o
 * tempo real tem de avisar. No dia a dia não sai nenhum: depois de gravar, o estado carregado já os tem.
 */
function lotesAte(lotes: ReadonlySet<number>, versao: number): ReadonlySet<number> {
  return [...lotes].some((id) => id > versao) ? new Set([...lotes].filter((id) => id <= versao)) : lotes;
}

export interface Loja {
  /** Estado tal como está gravado no servidor. */
  estadoServidor: Estado | null;
  /** Contadores do estado gravado (para mostrar a diferença durante a edição). */
  contadoresServidor: Contadores | null;
  /** Estado VISÍVEL: o do servidor com o rascunho aplicado. É este que os componentes mostram. */
  estado: Estado | null;
  indices: Indices | null;
  contadores: Contadores | null;
  dormidas: Map<Id, Dormida> | null;
  erro: string | null;
  aCarregar: boolean;
  /**
   * Pede o estado ao servidor; o rascunho continua por cima. Se outro pedido feito depois já respondeu,
   * a resposta deste é ignorada (nunca se troca um estado mais recente por um mais antigo).
   */
  carregar: () => Promise<void>;
  /** Lotes gravados por este separador (o tempo real não avisa nem recarrega por causa deles). */
  lotesDesteSeparador: ReadonlySet<number>;
  /**
   * Aviso sobre o rascunho que não chegou ao servidor: "Recuperámos N alterações que não chegaram a ser
   * guardadas…" (depois de voltar a entrar), ou que outro separador ficou com elas.
   */
  avisoRascunhoRecuperado: string | null;
  dispensarAvisoRascunho: () => void;
  /**
   * A sessão começou ou voltou neste separador (ou mudou de conta). Se ele tinha deixado o rascunho no
   * localStorage, o que está em memória passa a ser o que conta e o registo apaga-se.
   */
  aoEntrar: () => void;
  /**
   * Depois de Sair: volta ao estado inicial e ignora as respostas de pedidos do estado que ainda iam a
   * meio (senão um GET /api/estado lento voltava a pôr os dados na loja já sem sessão).
   */
  limparDepoisDeSair: () => void;

  /** Cliente escolhido na legenda: só as pessoas desse cliente ficam acesas. */
  clienteDestacado: Id | null;
  alternarClienteDestacado: (id: Id) => void;
  definirClienteDestacado: (id: Id | null) => void;

  /** Pessoa, casa, carrinha ou obra em foco (mostra a ligação casa → carrinha → obra). */
  foco: Foco;
  definirFoco: (foco: Foco) => void;

  /**
   * M2: o dia de hoje no Luxemburgo (AAAA-MM-DD). Decide quem está indisponível (os índices e a lotação
   * das carrinhas usam-no). CONTRATO DO M2 (módulo base): muda sozinho à meia-noite e recalcula.
   */
  hoje: string;
  /** M2: muda o dia (a meia-noite, os testes) e recalcula o que se vê. */
  definirHoje: (dia: string) => void;

  /** Cartões abertos à mão. Chave: "casa:<id>", "carrinha:<id>", "grupo:<localId>". */
  expandidos: ReadonlySet<string>;
  alternarExpandido: (chave: string) => void;

  irPara: PedidoIrPara | null;
  pedirIrPara: (lat: number, lng: number, zoom?: number) => void;

  /** Camadas visíveis no mapa. */
  camadas: Readonly<Record<Camada, boolean>>;
  alternarCamada: (camada: Camada) => void;

  // --- Modo de edição -------------------------------------------------------------------------
  modoEdicao: boolean;
  /** Passos do rascunho, por ordem. Cada passo é uma ação do utilizador (ex.: largar 3 pessoas). */
  passos: Operacao[][];
  /** Passos desfeitos, para Refazer. */
  passosDesfeitos: Operacao[][];
  /** Alterações por guardar, já compactadas (o que se mostra na lista e se envia ao servidor). */
  pendentes: Operacao[];
  entrarEdicao: () => void;
  /** Sai do modo de edição e deita fora o rascunho, sem perguntar (quem chama pede confirmação). */
  cancelarEdicao: () => void;
  /** Junta um passo ao rascunho. Ignorado fora do modo de edição ou se não mudar nada. */
  aplicar: (ops: Operacao[]) => void;
  /** Leva as pessoas até ao alvo (um passo). Devolve quantas mudaram. */
  moverPara: (pessoaIds: readonly Id[], alvo: Alvo) => number;
  desfazer: () => void;
  refazer: () => void;
  aGuardar: boolean;
  erroGuardar: string | null;
  /** Conflitos devolvidos pelo servidor na última tentativa de guardar (nada foi gravado). */
  conflitos: ConflitoServidor[] | null;
  /**
   * Envia o rascunho. Se correr bem, recarrega o estado e sai do modo de edição. Se a sessão tiver
   * terminado, nada é gravado e o rascunho fica também no localStorage (ver rascunhoPendente.ts).
   */
  guardar: (comentario?: string) => Promise<boolean>;
  /**
   * M2: lotes cuja reversão está no rascunho ("Reverter" no Histórico). Vão no pedido de Guardar
   * (PedidoGuardar.reverte); Cancelar limpa.
   */
  reverte: readonly number[];
  /**
   * M2: "Reverter" um lote do Histórico: entra no modo de edição (se ainda não estiver) e junta as operações
   * inversas (dominio/reverter.ts, planearReversao) ao rascunho como UM passo. Nada é gravado. Devolve se
   * mudou alguma coisa. CONTRATO DO M2 (módulo base): Desfazer esse passo tira o lote de `reverte`; Guardar
   * envia `reverte`; o rascunho pendente (localStorage) guarda-o também.
   */
  iniciarReversao: (loteId: number, operacoes: readonly Operacao[]) => boolean;

  /** Pessoas selecionadas (só no modo de edição). */
  selecao: ReadonlySet<Id>;
  /** Última pessoa clicada sem Shift: ponto de partida do Shift+clique. */
  ancoraSelecao: Id | null;
  /** `ordem` = ids pela ordem em que aparecem na lista onde se clicou (para o Shift+clique). */
  selecionar: (id: Id, modo: ModoSelecao, ordem?: readonly Id[]) => void;
  definirSelecao: (ids: readonly Id[]) => void;
  limparSelecao: () => void;
}

export const useLoja = create<Loja>()((set, get) => {
  /** Recalcula o estado visível a partir do estado do servidor e dos passos do rascunho. */
  function recalcular(passos: Operacao[][], estadoServidor = get().estadoServidor) {
    if (!estadoServidor) return {};
    const pendentes = compactarOperacoes(passos.flat());
    return { passos, pendentes, ...derivar(aplicarOperacoes(estadoServidor, passos.flat()), get().hoje) };
  }

  /** Fora do modo de edição, sem rascunho (o que o Cancelar deixa). */
  function semEdicao() {
    return {
      modoEdicao: false,
      passosDesfeitos: [],
      erroGuardar: null,
      conflitos: null,
      selecao: new Set<Id>(),
      ancoraSelecao: null,
      reverte: [],
      ...recalcular([]),
    };
  }

  // Número de cada pedido do estado: o último feito e o último cuja resposta se aplicou.
  let ultimoPedido = 0;
  let ultimoAplicado = 0;

  /**
   * O registo que ESTE separador deixou no localStorage quando a sessão terminou. Com a sessão de volta, o
   * rascunho em memória é que conta (pode ter mudado desde então, ex.: desfeito) e o registo apaga-se. Se
   * outro separador o recuperou entretanto (este esteve suspenso, ex.: no telemóvel), as alterações ficam
   * lá e este larga a sua cópia, para não haver duas. O de outra conta fica (o AvisoSessaoTerminada decide).
   */
  function tratarRegistoDeste(): void {
    // Sem sessão (um pedido que saiu antes de ela terminar respondeu agora), o registo ainda faz falta.
    if (useSessao.getState().estado !== 'dentro') return;
    const armazenamento = armazenamentoLocal();
    const registo = registoDoSeparador(armazenamento, SEPARADOR);
    if (!registo || !autorCompativel(registo.autor, utilizadorAtual())) return;
    pararVivo();
    apagarSeForDeste(armazenamento, SEPARADOR);
    if (registo.recuperadoPor === undefined) return;
    // Só se a cópia em memória é a mesma (com a sessão terminada não se pode mexer no rascunho).
    const { modoEdicao, passos } = get();
    if (!modoEdicao || JSON.stringify(passos) !== JSON.stringify(registo.passos)) return;
    set({
      ...semEdicao(),
      avisoRascunhoRecuperado: textoRascunhoNoutroSeparador(compactarOperacoes(registo.passos.flat()).length),
    });
  }

  /**
   * Depois de carregar: põe outra vez no modo de edição o rascunho que não chegou ao servidor (o de uma
   * página que fechou). Se este separador já tem um rascunho em memória, os guardados ficam para quando
   * não estiver a editar. Com uma tranca entre separadores: dois que carreguem ao mesmo tempo não ficam
   * ambos com o mesmo.
   */
  async function recuperarRascunho(): Promise<void> {
    tratarRegistoDeste();
    const editar = () => get().modoEdicao && get().passos.length > 0;
    const armazenamento = armazenamentoLocal();
    if (editar() || !armazenamento) return;
    await comTrancaRascunhos(() => {
      // Outra vez, já com a tranca: entretanto pode ter começado outra edição.
      if (editar() || !get().estadoServidor) return;
      const rascunho = lerRascunhoPendente(armazenamento, Date.now(), utilizadorAtual(), SEPARADOR);
      if (!rascunho) return;
      marcarRecuperado(armazenamento, rascunho.origem, SEPARADOR);
      // As mudanças que se anulam umas às outras não contam (como na barra "N alterações por guardar").
      const n = compactarOperacoes(rascunho.passos.flat()).length;
      if (n === 0) return;
      set({
        modoEdicao: true,
        passosDesfeitos: [],
        erroGuardar: null,
        conflitos: null,
        selecao: new Set(),
        ancoraSelecao: null,
        ...recalcular(rascunho.passos),
        avisoRascunhoRecuperado: textoRascunhoRecuperado(n),
      });
    });
  }

  return {
    estadoServidor: null,
    contadoresServidor: null,
    estado: null,
    indices: null,
    contadores: null,
    dormidas: null,
    erro: null,
    aCarregar: false,
    carregar: async () => {
      const pedido = ++ultimoPedido;
      set({ aCarregar: true, erro: null });
      try {
        const estadoServidor = await obterEstado();
        // Já se aplicou a resposta de um pedido feito depois deste: esta é mais antiga.
        if (pedido <= ultimoAplicado) return;
        ultimoAplicado = pedido;
        const servidor = derivar(estadoServidor, get().hoje);
        set({
          estadoServidor,
          contadoresServidor: servidor.contadores,
          ...recalcular(get().passos, estadoServidor),
          lotesDesteSeparador: lotesAte(get().lotesDesteSeparador, estadoServidor.versao),
          // Os dados estão frescos: o erro de um pedido mais recente que falhou já não interessa.
          erro: null,
          // Com um pedido mais recente ainda a meio, continua "a carregar".
          ...(pedido === ultimoPedido ? { aCarregar: false } : {}),
        });
        await recuperarRascunho();
      } catch (e) {
        // Há um pedido mais recente a meio: é ele que decide o que se mostra.
        if (pedido !== ultimoPedido) return;
        set({ erro: e instanceof Error ? e.message : String(e), aCarregar: false });
      }
    },
    lotesDesteSeparador: new Set(),
    avisoRascunhoRecuperado: null,
    dispensarAvisoRascunho: () => set({ avisoRascunhoRecuperado: null }),
    aoEntrar: () => tratarRegistoDeste(),
    limparDepoisDeSair: () => {
      ultimoPedido++;
      ultimoAplicado = ultimoPedido;
      set(useLoja.getInitialState(), true);
    },

    clienteDestacado: null,
    alternarClienteDestacado: (id) => set({ clienteDestacado: get().clienteDestacado === id ? null : id }),
    definirClienteDestacado: (id) => set({ clienteDestacado: id }),

    foco: null,
    definirFoco: (foco) => set({ foco }),

    hoje: dataNoLuxemburgo(new Date()),
    definirHoje: (dia) => {
      if (dia === get().hoje) return;
      set({ hoje: dia });
      const { estadoServidor, passos } = get();
      if (!estadoServidor) return;
      set({
        contadoresServidor: derivar(estadoServidor, dia).contadores,
        ...recalcular(passos, estadoServidor),
      });
    },

    expandidos: new Set(),
    alternarExpandido: (chave) => {
      const novo = new Set(get().expandidos);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      set({ expandidos: novo });
    },

    irPara: null,
    pedirIrPara: (lat, lng, zoom) =>
      set({ irPara: { lat, lng, zoom: zoom ?? null, seq: (get().irPara?.seq ?? 0) + 1 } }),

    camadas: { casas: true, carrinhas: true, obras: true },
    alternarCamada: (camada) => set({ camadas: { ...get().camadas, [camada]: !get().camadas[camada] } }),

    modoEdicao: false,
    passos: [],
    passosDesfeitos: [],
    pendentes: [],
    entrarEdicao: () =>
      set({ modoEdicao: true, erroGuardar: null, conflitos: null, selecao: new Set(), ancoraSelecao: null }),
    cancelarEdicao: () => {
      esquecerRascunhoDesteSeparador();
      set({ ...semEdicao(), avisoRascunhoRecuperado: null });
    },
    aplicar: (ops) => {
      if (!get().modoEdicao || ops.length === 0) return;
      // operacaoSemEfeito compara pelo conteúdo (listas e registos do M2), não pela referência.
      const passo = ops.filter((op) => !operacaoSemEfeito(op));
      if (passo.length === 0) return;
      set({
        passosDesfeitos: [],
        conflitos: null,
        erroGuardar: null,
        ...recalcular([...get().passos, passo]),
      });
    },
    moverPara: (pessoaIds, alvo) => {
      const { estado, modoEdicao } = get();
      if (!estado || !modoEdicao) return 0;
      const ops = operacoesParaAlvo(estado, pessoaIds, alvo);
      get().aplicar(ops);
      // Conta pessoas que mudaram (a operação que tira o condutor vai junto e não conta).
      return ops.filter((op) => op.tipo === 'mover').length;
    },
    desfazer: () => {
      const { passos, passosDesfeitos, modoEdicao } = get();
      const ultimo = passos.at(-1);
      if (!modoEdicao || !ultimo) return;
      set({
        passosDesfeitos: [...passosDesfeitos, ultimo],
        conflitos: null,
        erroGuardar: null,
        ...recalcular(passos.slice(0, -1)),
      });
    },
    refazer: () => {
      const { passos, passosDesfeitos, modoEdicao } = get();
      const proximo = passosDesfeitos.at(-1);
      if (!modoEdicao || !proximo) return;
      set({
        passosDesfeitos: passosDesfeitos.slice(0, -1),
        conflitos: null,
        erroGuardar: null,
        ...recalcular([...passos, proximo]),
      });
    },
    aGuardar: false,
    erroGuardar: null,
    conflitos: null,
    guardar: async (comentario) => {
      const { pendentes, estadoServidor, aGuardar } = get();
      if (aGuardar || !estadoServidor) return false;
      if (pendentes.length === 0) {
        get().cancelarEdicao();
        return true;
      }
      // Lido já: num 401 a sessão passa a 'fora' (e sem utilizador) antes de o erro chegar aqui. Se já
      // estava 'fora', o dono do rascunho é quem tinha a sessão.
      const autor = utilizadorAtual() ?? useSessao.getState().contaAnterior?.chave ?? null;
      set({ aGuardar: true, erroGuardar: null, conflitos: null });
      try {
        const { reverte } = get();
        const resposta = await guardarLote({
          versaoBase: estadoServidor.versao,
          operacoes: pendentes,
          comentario,
          ...(reverte.length > 0 ? { reverte: [...reverte] } : {}),
        });
        // O servidor aplicou estas operações com a mesma função: o estado gravado passa já a ser o que se
        // via, mesmo que o recarregar a seguir falhe (senão o próximo rascunho partia de um estado antigo).
        // A versão nova só se adota se ninguém gravou pelo meio (versão seguida à de base): senão este
        // estado não tem o lote dessa pessoa e tem de continuar a parecer antigo ao tempo real.
        const versao =
          resposta.versao === estadoServidor.versao + 1 ? resposta.versao : estadoServidor.versao;
        const gravado = { ...aplicarOperacoes(estadoServidor, pendentes), versao };
        // Um pedido do estado que ainda vá a meio saiu antes desta gravação: a resposta dele já não conta.
        ultimoAplicado = ultimoPedido;
        esquecerRascunhoDesteSeparador();
        set({
          modoEdicao: false,
          passosDesfeitos: [],
          selecao: new Set(),
          ancoraSelecao: null,
          estadoServidor: gravado,
          contadoresServidor: derivar(gravado, get().hoje).contadores,
          lotesDesteSeparador: new Set([...get().lotesDesteSeparador, resposta.loteId]),
          avisoRascunhoRecuperado: null,
          reverte: [],
          ...recalcular([], gravado),
        });
        await get().carregar();
        set({ aGuardar: false });
        return true;
      } catch (e) {
        if (e instanceof ErroSessao) {
          // Nada foi gravado. O rascunho continua em memória (o Portao mantém a app aberta e a entrada
          // abre noutro separador); o localStorage serve para o caso de esta página fechar entretanto.
          const guardado = guardarRascunhoPendente(armazenamentoLocal(), {
            passos: get().passos,
            versaoBase: estadoServidor.versao,
            data: new Date().toISOString(),
            autor,
            separador: SEPARADOR,
            vivoEm: Date.now(),
          });
          if (guardado) manterVivo();
          set({
            erroGuardar: guardado
              ? 'A sessão terminou e nada foi gravado. Entra outra vez com a conta Microsoft e volta a carregar em Guardar: as tuas alterações não se perdem.'
              : 'A sessão terminou e nada foi gravado. Entra outra vez com a conta Microsoft (num separador novo) e volta a carregar em Guardar. Não feches nem recarregues esta página, senão as alterações perdem-se.',
            aGuardar: false,
          });
        } else if (e instanceof ErroConflito) {
          set({ conflitos: e.conflitos, erroGuardar: e.message, aGuardar: false });
          // Traz o que os outros gravaram: o rascunho passa a ver-se por cima do estado atual.
          await get().carregar();
        } else {
          set({ erroGuardar: e instanceof Error ? e.message : String(e), aGuardar: false });
          // O servidor recusou (ex.: o condutor já não vai na carrinha): traz o estado atual para o
          // rascunho se ver por cima dele. Uma falha de rede não recarrega.
          if (e instanceof ErroServidor && e.estado === 400) await get().carregar();
        }
        return false;
      }
    },
    reverte: [],
    iniciarReversao: (loteId, operacoes) => {
      if (!get().estadoServidor) return false;
      const passo = operacoes.filter((op) => !operacaoSemEfeito(op));
      if (passo.length === 0) return false;
      if (!get().modoEdicao) get().entrarEdicao();
      get().aplicar(passo);
      // CONTRATO DO M2 (módulo base): ligar o lote ao passo, para Desfazer o tirar de `reverte`.
      set({ reverte: [...new Set([...get().reverte, loteId])] });
      return true;
    },

    selecao: new Set(),
    ancoraSelecao: null,
    selecionar: (id, modo, ordem) => {
      const { selecao, ancoraSelecao } = get();
      if (modo === 'alternar') {
        const nova = new Set(selecao);
        if (nova.has(id)) nova.delete(id);
        else nova.add(id);
        set({ selecao: nova, ancoraSelecao: id });
        return;
      }
      if (modo === 'intervalo' && ordem && ancoraSelecao) {
        const a = ordem.indexOf(ancoraSelecao);
        const b = ordem.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [inicio, fim] = a <= b ? [a, b] : [b, a];
          set({ selecao: new Set(ordem.slice(inicio, fim + 1)) });
          return;
        }
      }
      set({ selecao: new Set([id]), ancoraSelecao: id });
    },
    definirSelecao: (ids) => set({ selecao: new Set(ids) }),
    limparSelecao: () => set({ selecao: new Set(), ancoraSelecao: null }),
  };
});

if (typeof window !== 'undefined') {
  // A página vai fechar ou recarregar: o rascunho fica livre para o próximo carregamento o recuperar.
  window.addEventListener('pagehide', () => largar(armazenamentoLocal(), SEPARADOR));
  // Voltou da cache do browser (bfcache) ainda com o rascunho em memória: volta a segurar o que largou.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    const { modoEdicao, passos } = useLoja.getState();
    if (!modoEdicao || passos.length === 0) return;
    if (retomar(armazenamentoLocal(), SEPARADOR, Date.now(), utilizadorAtual())) manterVivo();
  });
}
