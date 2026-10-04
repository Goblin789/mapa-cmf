// Ligações longas (tempo real, GET /api/eventos) de cada sessão. A sessão só se verifica quando a
// ligação abre; sem isto, depois de sair (ou de a sessão acabar) um separador aberto continuava a receber
// os lotes, com o nome e o e-mail de quem grava. Por isso cada ligação fica registada com o id da sessão
// (o hash do token) e é cortada quando a pessoa sai ou quando a revisão periódica dá a sessão por acabada.
//
// O corte faz-se por fora do canal de eventos: a resposta dele é embrulhada num stream que se pode
// fechar. Cancelar o leitor do stream original faz o canal tirar a ligação da lista, como quando o
// browser fecha.

/** Resposta embrulhada e a função que a corta. */
export interface RespostaCortavel {
  resposta: Response;
  cortar: () => void;
}

/**
 * Embrulha o corpo da resposta num stream que se pode cortar. `aoTerminar` corre uma vez, quando a
 * ligação acaba por qualquer motivo (corte, browser que fecha, fim ou erro do stream original).
 */
export function respostaCortavel(resposta: Response, aoTerminar: () => void): RespostaCortavel {
  const original = resposta.body;
  if (!original) {
    aoTerminar();
    return { resposta, cortar: () => {} };
  }
  const leitor = original.getReader();
  let terminada = false;
  let controlador: ReadableStreamDefaultController<Uint8Array> | null = null;

  /** Marca a ligação como terminada; devolve false se já estava. */
  function terminar(): boolean {
    if (terminada) return false;
    terminada = true;
    aoTerminar();
    return true;
  }

  const corpo = new ReadableStream<Uint8Array>(
    {
      start(c) {
        controlador = c;
      },
      // Só lê do original quando o browser pede mais: o canal continua a ver quem deixou de ler.
      async pull(c) {
        try {
          const { done, value } = await leitor.read();
          if (terminada) return; // cortada entretanto
          if (done) {
            terminar();
            c.close();
          } else {
            c.enqueue(value);
          }
        } catch (erro) {
          if (terminar()) c.error(erro);
        }
      },
      cancel(motivo) {
        terminar();
        return leitor.cancel(motivo);
      },
    },
    { highWaterMark: 0 },
  );

  return {
    resposta: new Response(corpo, { status: resposta.status, headers: resposta.headers }),
    cortar() {
      if (!terminar()) return;
      leitor.cancel().catch(() => {});
      try {
        controlador?.close();
      } catch {
        // Já fechado.
      }
    },
  };
}

export interface LigacoesPorSessao {
  /** Regista a ligação desta sessão e devolve a resposta (cortável) a mandar ao browser. */
  acompanhar(sessao: string, resposta: Response): Response;
  /** Corta todas as ligações desta sessão. */
  cortar(sessao: string): void;
  /** Corta as ligações das sessões que já não valem. */
  rever(valida: (sessao: string) => boolean): void;
  /** Ligações abertas agora. */
  quantas(): number;
}

/**
 * Lista das ligações por sessão. `aoMudar` é chamada sempre que o número de ligações muda (para ligar
 * ou desligar a revisão periódica).
 */
export function criarLigacoesPorSessao(aoMudar: (quantas: number) => void = () => {}): LigacoesPorSessao {
  const porSessao = new Map<string, Set<() => void>>();
  let total = 0;

  function cortarSessao(sessao: string): void {
    for (const cortar of [...(porSessao.get(sessao) ?? [])]) cortar();
  }

  return {
    acompanhar(sessao, resposta) {
      let cortar: (() => void) | null = null;
      let registada = false;
      const embrulhada = respostaCortavel(resposta, () => {
        if (!registada || !cortar) return;
        registada = false;
        const lista = porSessao.get(sessao);
        lista?.delete(cortar);
        if (lista?.size === 0) porSessao.delete(sessao);
        total--;
        aoMudar(total);
      });
      cortar = embrulhada.cortar;
      if (embrulhada.resposta.body) {
        const lista = porSessao.get(sessao) ?? new Set();
        lista.add(cortar);
        porSessao.set(sessao, lista);
        registada = true;
        total++;
        aoMudar(total);
      }
      return embrulhada.resposta;
    },
    cortar: cortarSessao,
    rever(valida) {
      for (const sessao of [...porSessao.keys()]) {
        if (!valida(sessao)) cortarSessao(sessao);
      }
    },
    quantas: () => total,
  };
}
