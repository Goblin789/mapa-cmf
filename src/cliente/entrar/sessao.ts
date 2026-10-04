// Quem tem a sessão iniciada (GET /api/auth/eu). O Portao decide o que mostrar a partir daqui.
//
// Ao abrir a página está 'a-verificar' até o servidor responder: 200 → 'dentro' (com o utilizador),
// 401 → 'fora'. Sem resposta (sem rede, servidor a arrancar, 5xx, ou a resposta não chega em 15 s)
// continua 'a-verificar' com uma mensagem e volta a tentar sozinho, cada vez mais espaçado (2 s, 5 s,
// 10 s, 20 s e depois de 30 em 30 s). Nunca há duas verificações ao mesmo tempo. Qualquer pedido à API
// que dê 401 chama marcarFora() (estado/api.ts). No modo local (PC sem login) o servidor responde sempre
// com "Este computador".
//
// Quando a sessão termina a meio do trabalho fica registado quem a tinha (contaAnterior): é o dono do
// rascunho que ficou na página. Se depois entrar outra conta, o Portao não deixa gravar esse rascunho em
// nome dela.

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { Utilizador } from '../../dominio/api';
import { textoDoErro } from '../edicao/erros';

export type EstadoSessao = 'a-verificar' | 'dentro' | 'fora';

/**
 * Porque é que está 'fora' (o Portao mostra coisas diferentes):
 * - 'sem-sessao': ao abrir a página não havia sessão;
 * - 'terminou': havia sessão e um pedido deu 401 a meio do trabalho (expirou, saiu noutro separador);
 * - 'saiu': a pessoa carregou em "Sair".
 */
export type MotivoFora = 'sem-sessao' | 'terminou' | 'saiu';

export interface LojaSessao {
  estado: EstadoSessao;
  utilizador: Utilizador | null;
  /** Só com estado 'fora'. */
  motivoFora: MotivoFora | null;
  /**
   * Quem tinha a sessão quando ela terminou a meio do trabalho (o dono do rascunho que ficou na página).
   * Fica até voltar a entrar essa pessoa, até se aceitar continuar com outra conta (aceitarOutraConta)
   * ou até sair; null no resto do tempo.
   */
  contaAnterior: Utilizador | null;
  /** Continua com a conta com que se entrou agora (o rascunho da anterior já foi posto de parte). */
  aceitarOutraConta: () => void;
  /** Há uma pergunta ao servidor a meio. */
  aVerificar: boolean;
  /** Porque é que a última verificação falhou (sem ligação, erro do servidor); null se não falhou. */
  erro: string | null;
  /** Quando (ms desde 1970) volta a tentar sozinho; null se não há tentativa marcada. */
  proximaTentativaEm: number | null;
  /** Pergunta ao servidor quem está dentro (se já há uma pergunta a meio, espera por essa). */
  verificar: () => Promise<void>;
  /** Marca a sessão como terminada (ex.: um pedido devolveu 401): o Portao mostra o ecrã de entrada. */
  marcarFora: () => void;
  aSair: boolean;
  erroSair: string | null;
  /** Esquece o erro do último Sair (ao fechar o menu ou a confirmação: já não interessa). */
  limparErroSair: () => void;
  /** POST /api/auth/sair e passa a 'fora'. Devolve se saiu (falhando, fica 'dentro' com erroSair). */
  sair: () => Promise<boolean>;
}

/** Esperas entre tentativas, em ms: a 1.ª falha espera 2 s, a 2.ª 5 s… e a partir da 5.ª, 30 s. */
const ESPERAS_MS = [2000, 5000, 10_000, 20_000, 30_000] as const;

/**
 * Tempo máximo de uma verificação. Uma ligação pendurada (rede fraca, portal de wifi) nunca dava erro:
 * ficava-se em "A verificar a sessão…" sem botão para tentar outra vez.
 */
export const TEMPO_MAXIMO_VERIFICACAO_MS = 15_000;

export const TEXTO_DEMOROU = 'O servidor demorou demasiado a responder.';

/** Quanto esperar depois da n-ésima falha seguida (n ≥ 1) antes de voltar a perguntar. */
export function esperaDepoisDaFalha(n: number): number {
  const i = Math.min(Math.max(Math.trunc(n), 1), ESPERAS_MS.length) - 1;
  return ESPERAS_MS[i] as number;
}

/** A resposta de GET /api/auth/eu como Utilizador; null se não tiver a forma esperada. */
export function lerUtilizador(json: unknown): Utilizador | null {
  if (typeof json !== 'object' || json === null) return null;
  const u = json as Record<string, unknown>;
  if (typeof u.chave !== 'string' || typeof u.nome !== 'string') return null;
  if (u.modo !== 'entra' && u.modo !== 'local') return null;
  return { chave: u.chave, nome: u.nome, email: typeof u.email === 'string' ? u.email : null, modo: u.modo };
}

/**
 * Porque é que o servidor não deu uma resposta útil. 502/503/504: o servidor (ou o alojamento à frente
 * dele) ainda não está pronto, ex.: a arrancar depois de uma publicação.
 */
export function textoErroServidor(estado: number): string {
  return estado === 502 || estado === 503 || estado === 504
    ? `O servidor não está disponível de momento (erro ${estado}): pode estar a arrancar.`
    : `O servidor não respondeu como devia (erro ${estado}).`;
}

/**
 * A sessão voltou, mas com outra conta que não a que tinha a sessão quando terminou: o rascunho que
 * ficou na página é dessa conta anterior e não pode ser gravado em nome desta.
 */
export function entrouOutraConta(s: Pick<LojaSessao, 'estado' | 'utilizador' | 'contaAnterior'>): boolean {
  return (
    s.estado === 'dentro' &&
    s.utilizador !== null &&
    s.contaAnterior !== null &&
    s.utilizador.chave !== s.contaAnterior.chave
  );
}

function mesmoUtilizador(a: Utilizador, b: Utilizador): boolean {
  return a.chave === b.chave && a.nome === b.nome && a.email === b.email && a.modo === b.modo;
}

/** Motivo de ficar 'fora' a partir do estado em que se estava. */
function motivoAoFicarFora(estado: EstadoSessao, motivoAtual: MotivoFora | null): MotivoFora {
  if (estado === 'dentro') return 'terminou';
  if (estado === 'fora' && motivoAtual) return motivoAtual;
  return 'sem-sessao';
}

/** A verificação demorou mais do que TEMPO_MAXIMO_VERIFICACAO_MS (motivo do abort). */
class TempoEsgotado extends Error {}

/** A promessa, ou o motivo do abort se o sinal abortar antes (mesmo que quem a deu ignore o sinal). */
function ateAbortar<T>(promessa: Promise<T>, sinal: AbortSignal): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    if (sinal.aborted) {
      rejeitar(sinal.reason);
      return;
    }
    const aoAbortar = () => rejeitar(sinal.reason);
    sinal.addEventListener('abort', aoAbortar, { once: true });
    promessa.then(resolver, rejeitar).finally(() => sinal.removeEventListener('abort', aoAbortar));
  });
}

export interface DependenciasSessao {
  /** O fetch (os testes trocam-no por um falso). */
  pedir?: (url: string, init?: RequestInit) => Promise<Response>;
  agora?: () => number;
}

export type UsoSessao = UseBoundStore<StoreApi<LojaSessao>>;

/** Cria a loja da sessão. A app usa a `useSessao` de baixo; os testes criam a sua. */
export function criarLojaSessao({
  pedir = (url, init) => fetch(url, init),
  agora = Date.now,
}: DependenciasSessao = {}): UsoSessao {
  let emCurso: { promessa: Promise<void>; controlador: AbortController } | null = null;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let falhasSeguidas = 0;
  // Muda sempre que a sessão muda por outra via (401 de outro pedido, Sair): a resposta de uma
  // verificação que já ia a meio deixa de contar, porque é mais antiga do que o que se sabe agora.
  let geracao = 0;

  function desmarcarTentativa(): void {
    if (temporizador !== null) clearTimeout(temporizador);
    temporizador = null;
  }

  /**
   * A sessão mudou por outra via: a verificação a meio (se houver) é cancelada e a próxima chamada a
   * verificar() faz uma pergunta nova, em vez de esperar por uma resposta que já não ia contar.
   */
  function abandonarVerificacao(): void {
    geracao += 1;
    falhasSeguidas = 0;
    desmarcarTentativa();
    emCurso?.controlador.abort();
    emCurso = null;
  }

  return create<LojaSessao>()((set, get) => {
    /** O que muda ao ficar 'fora' (401 de um pedido ou da verificação). */
    function ficarFora(): Partial<LojaSessao> {
      const { estado, motivoFora, utilizador, contaAnterior } = get();
      return {
        estado: 'fora',
        motivoFora: motivoAoFicarFora(estado, motivoFora),
        // Só quem estava dentro deixa um rascunho para trás. Se já havia uma conta anterior (a sessão
        // terminou outra vez antes de se resolver), é essa que conta: o rascunho é dela.
        contaAnterior: contaAnterior ?? (estado === 'dentro' ? utilizador : null),
        utilizador: null,
        aVerificar: false,
        erro: null,
      };
    }

    function falhou(mensagem: string): void {
      // Só se insiste sozinho enquanto não se sabe nada (ao abrir a página). Com a sessão terminada a
      // meio do trabalho, o Portao volta a perguntar quando a pessoa regressa a esta página.
      if (get().estado !== 'a-verificar') {
        set({ aVerificar: false });
        return;
      }
      falhasSeguidas += 1;
      const espera = esperaDepoisDaFalha(falhasSeguidas);
      set({ aVerificar: false, erro: mensagem, proximaTentativaEm: agora() + espera });
      temporizador = setTimeout(() => {
        temporizador = null;
        void get().verificar();
      }, espera);
    }

    async function perguntar(minhaGeracao: number, controlador: AbortController): Promise<void> {
      const sinal = controlador.signal;
      const limite = setTimeout(() => controlador.abort(new TempoEsgotado()), TEMPO_MAXIMO_VERIFICACAO_MS);
      let resposta: Response;
      let json: unknown = null;
      try {
        resposta = await ateAbortar(
          pedir('/api/auth/eu', { headers: { accept: 'application/json' }, signal: sinal }),
          sinal,
        );
        if (resposta.ok) {
          // Um corpo que não é JSON é uma resposta inesperada (null); o tempo esgotado a ler o corpo é
          // uma falha como as outras.
          json = await ateAbortar(resposta.json(), sinal).catch((e: unknown) => {
            if (sinal.aborted) throw e;
            return null;
          });
        }
      } catch (e) {
        if (minhaGeracao !== geracao) return;
        if (sinal.reason instanceof TempoEsgotado) falhou(TEXTO_DEMOROU);
        else falhou(textoDoErro(e instanceof Error ? e.message : String(e)));
        return;
      } finally {
        clearTimeout(limite);
      }
      if (minhaGeracao !== geracao) return;
      if (resposta.status === 401) {
        falhasSeguidas = 0;
        set(ficarFora());
        return;
      }
      if (!resposta.ok) {
        falhou(textoErroServidor(resposta.status));
        return;
      }
      const utilizador = lerUtilizador(json);
      if (!utilizador) {
        falhou('O servidor deu uma resposta inesperada.');
        return;
      }
      falhasSeguidas = 0;
      // Verificar outra vez com a sessão iniciada (ex.: o tempo real perdeu a ligação) não muda o objeto
      // se for a mesma pessoa: quem o lê não volta a desenhar-se por nada.
      const { utilizador: atual, contaAnterior } = get();
      set({
        estado: 'dentro',
        utilizador: atual && mesmoUtilizador(atual, utilizador) ? atual : utilizador,
        motivoFora: null,
        // Voltou quem tinha a sessão: o rascunho volta a ser de quem está dentro.
        contaAnterior: contaAnterior?.chave === utilizador.chave ? null : contaAnterior,
        aVerificar: false,
        erro: null,
      });
    }

    return {
      estado: 'a-verificar',
      utilizador: null,
      motivoFora: null,
      contaAnterior: null,
      aceitarOutraConta: () => set({ contaAnterior: null }),
      aVerificar: false,
      erro: null,
      proximaTentativaEm: null,
      verificar: () => {
        if (emCurso) return emCurso.promessa;
        desmarcarTentativa();
        set({ aVerificar: true, proximaTentativaEm: null });
        const controlador = new AbortController();
        const promessa = perguntar(geracao, controlador).finally(() => {
          if (emCurso?.promessa === promessa) emCurso = null;
        });
        emCurso = { promessa, controlador };
        return promessa;
      },
      marcarFora: () => {
        abandonarVerificacao();
        set({ ...ficarFora(), proximaTentativaEm: null });
      },
      aSair: false,
      erroSair: null,
      limparErroSair: () => {
        if (get().erroSair !== null) set({ erroSair: null });
      },
      sair: async () => {
        if (get().aSair) return false;
        set({ aSair: true, erroSair: null });
        try {
          // Content-Type JSON: o servidor recusa pedidos que mudam coisas sem ele (proteção CSRF).
          const resposta = await pedir('/api/auth/sair', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: '{}',
          });
          // 401: a sessão já tinha terminado. Para quem carregou em Sair dá no mesmo.
          if (!resposta.ok && resposta.status !== 401) {
            throw new Error(textoErroServidor(resposta.status));
          }
        } catch (e) {
          const mensagem = textoDoErro(e instanceof Error ? e.message : String(e));
          set({ aSair: false, erroSair: `Não foi possível sair. ${mensagem}` });
          return false;
        }
        abandonarVerificacao();
        set({
          estado: 'fora',
          motivoFora: 'saiu',
          utilizador: null,
          contaAnterior: null,
          aSair: false,
          aVerificar: false,
          erro: null,
          proximaTentativaEm: null,
        });
        return true;
      },
    };
  });
}

export const useSessao = criarLojaSessao();
