// Leitura da /api/saude (RespostaSaude, src/dominio/api.ts) e espera pela versão nova depois de publicar.
// A regra de alarme é a mesma da vigilância (.github/workflows/vigiar.yml): falha se ok !== true ou se
// copias.atrasada === true.

export const CAMINHO_SAUDE = '/api/saude';

/** URL da /api/saude para uma origem (com ou sem barra no fim). */
export function urlSaude(origem: string): string {
  return `${origem.replace(/\/+$/, '')}${CAMINHO_SAUDE}`;
}

export interface AvaliacaoSaude {
  /** Respondeu 200 com ok: true (o servidor e a base de dados respondem). */
  ok: boolean;
  /** O que faz disparar o alarme (ok !== true, cópias atrasadas). */
  problemas: string[];
  /** O que convém saber mas não é alarme (ex.: a resposta não diz nada das cópias). */
  avisos: string[];
  /** Commit em produção, se a resposta o disser (campo `commit`); serve para reconhecer a versão nova. */
  commit: string | null;
}

/** Avalia uma resposta da /api/saude (estado HTTP e corpo em texto). */
export function avaliarSaude(status: number, corpo: string): AvaliacaoSaude {
  let json: Record<string, unknown> | null = null;
  try {
    const valor: unknown = JSON.parse(corpo);
    if (valor !== null && typeof valor === 'object') json = valor as Record<string, unknown>;
  } catch {
    // Não é JSON (ex.: a página de parking do domínio, ou um erro do proxy).
  }
  if (!json) {
    return {
      ok: false,
      problemas: [`A /api/saude não devolveu JSON (HTTP ${status}).`],
      avisos: [],
      commit: null,
    };
  }
  const problemas: string[] = [];
  const avisos: string[] = [];
  const ok = status === 200 && json.ok === true;
  if (!ok) {
    const erro = typeof json.erro === 'string' ? `: ${json.erro}` : '';
    problemas.push(`O servidor não está bem (HTTP ${status}, ok = ${String(json.ok)})${erro}.`);
  }
  const copias = json.copias;
  if (copias !== null && typeof copias === 'object') {
    const c = copias as Record<string, unknown>;
    if (c.atrasada === true) {
      const ultima = typeof c.ultimaCopiaEm === 'string' ? c.ultimaCopiaEm : 'nunca';
      problemas.push(
        `As cópias de segurança estão atrasadas (última: ${ultima}; ativas: ${c.ativas === true ? 'sim' : 'não'}).`,
      );
    }
  } else if (ok) {
    avisos.push('A /api/saude não diz nada das cópias de segurança.');
  }
  const commit = typeof json.commit === 'string' && json.commit.trim() !== '' ? json.commit.trim() : null;
  return { ok, problemas, avisos, commit };
}

/** O mesmo commit, mesmo que um dos dois venha abreviado (mínimo 7 caracteres). */
export function mesmoCommit(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (Math.min(x.length, y.length) < 7) return false;
  return x.startsWith(y) || y.startsWith(x);
}

/** Uma ida à /api/saude: respondeu ok (com o commit, se o disser) ou falhou (em baixo, erro, sem rede). */
export type Observacao = { tipo: 'ok'; commit: string | null } | { tipo: 'falha' };

/**
 * A construção no Render (npm ci + build) leva sempre mais do que isto: antes, uma falha não é a troca de
 * versão (é a rede deste PC, ou um soluço do Render) e não conta.
 */
export const TEMPO_MINIMO_CONSTRUCAO_MS = 60_000;

/** Falhas seguidas (depois do tempo mínimo) para se dar o servidor como parado: uma só pode ser a rede. */
export const FALHAS_PARA_PARAGEM = 2;

export interface EstadoEspera {
  /** Commit da primeira resposta ok (null = a resposta não o diz; undefined = ainda nenhuma ok). */
  commitInicial: string | null | undefined;
  /** Falhas seguidas que contam (depois de TEMPO_MINIMO_CONSTRUCAO_MS). */
  falhasSeguidas: number;
  /**
   * Viu-se o servidor parado: FALHAS_PARA_PARAGEM falhas seguidas depois do tempo mínimo (com disco, o
   * Render pára a versão antiga antes de arrancar a nova).
   */
  viuParagem: boolean;
}

export const ESPERA_INICIAL: EstadoEspera = {
  commitInicial: undefined,
  falhasSeguidas: 0,
  viuParagem: false,
};

/**
 * pronto = a /api/saude diz o commit novo; reiniciou = o servidor esteve parado e voltou, mas a resposta não
 * diz o commit (é o mais provável, não é certo).
 */
export type ResultadoEspera = 'aguardar' | 'pronto' | 'reiniciou';

/**
 * Avança a espera pela versão nova. `decorridoMs` = tempo desde o pedido ao Render. Está:
 * - pronta quando a /api/saude diz o commit esperado e antes dizia outro (trocou de versão), ou quando o diz
 *   depois de uma paragem (o mesmo commit publicado outra vez, ou o servidor em baixo desde o início);
 * - "reiniciou" quando, sem a resposta dizer o commit, o servidor esteve parado e voltou a responder ok.
 * Logo a seguir ao pedido ainda responde a versão antiga (o Render demora uns minutos a construir), por
 * isso uma resposta ok sem mais nada não basta; e uma falha isolada, ou antes do tempo mínimo de
 * construção, não é uma paragem.
 */
export function avancarEspera(
  estado: EstadoEspera,
  obs: Observacao,
  contexto: { commitEsperado: string; decorridoMs: number },
): { estado: EstadoEspera; resultado: ResultadoEspera } {
  if (obs.tipo === 'falha') {
    if (contexto.decorridoMs < TEMPO_MINIMO_CONSTRUCAO_MS) {
      return { estado: { ...estado, falhasSeguidas: 0 }, resultado: 'aguardar' };
    }
    const falhasSeguidas = estado.falhasSeguidas + 1;
    const viuParagem = estado.viuParagem || falhasSeguidas >= FALHAS_PARA_PARAGEM;
    return { estado: { ...estado, falhasSeguidas, viuParagem }, resultado: 'aguardar' };
  }
  const commitInicial = estado.commitInicial === undefined ? obs.commit : estado.commitInicial;
  const corresponde = obs.commit !== null && mesmoCommit(obs.commit, contexto.commitEsperado);
  const jaEraEsse = commitInicial !== null && mesmoCommit(commitInicial, contexto.commitEsperado);
  const novo: EstadoEspera = { commitInicial, falhasSeguidas: 0, viuParagem: estado.viuParagem };
  if (corresponde && (!jaEraEsse || estado.viuParagem)) return { estado: novo, resultado: 'pronto' };
  if (estado.viuParagem && obs.commit === null) return { estado: novo, resultado: 'reiniciou' };
  // Voltou com outro commit (ex.: a publicação que estava à frente desta, com HTTP 202): a paragem era
  // dessa; espera-se pela próxima.
  if (obs.commit !== null) novo.viuParagem = false;
  return { estado: novo, resultado: 'aguardar' };
}
