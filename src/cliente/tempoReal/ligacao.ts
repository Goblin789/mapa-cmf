// A ligação ao tempo real (GET /api/eventos), sem React nem DOM: recebe a fonte de eventos (o EventSource
// do browser, ou uma falsa nos testes) e o acesso à loja por parâmetro. O useTempoReal liga e desliga
// isto conforme a sessão, a visibilidade da página e a rede.
//
// - O EventSource volta a ligar sozinho quando a ligação cai (ao fim de "retry: 5000"). Mas, se a
//   resposta não for um stream (servidor a reiniciar, 503 por excesso de ligações, 401), desiste para
//   sempre: aí é esta ligação que volta a tentar, cada vez mais espaçado.
// - Depois de um erro confirma-se a sessão (pode ter expirado: o Portao mostra então o ecrã de entrada).
// - Mais de 30 s sem ligação: aviso discreto, que desaparece quando volta (e aí recarrega o estado).
// - Uma ligação pode morrer sem erro nenhum (o servidor caiu atrás de um proxy que deixa a ligação aberta,
//   o portátil adormeceu): o servidor manda um "sinal" de 25 em 25 s e, sem notícias há mais de
//   LIGACAO_MORTA_APOS_MS, a ligação é dada por morta e volta a abrir.

import type { EventoLote } from '../../dominio/api';
import {
  type ContextoLoja,
  decidirLote,
  decidirVersao,
  esperaParaReabrir,
  lerEventoLote,
  lerEventoVersao,
  SEM_LIGACAO_APOS_MS,
} from './decisoes';

export const URL_EVENTOS = '/api/eventos';

/** readyState do EventSource: ligação aberta. */
export const FONTE_ABERTA = 1;
/** readyState do EventSource: a fonte desistiu e não volta a ligar sozinha. */
export const FONTE_FECHADA = 2;

/** Sem nada do servidor (nem o sinal de 25 em 25 s) há mais do que isto, a ligação está morta. */
export const LIGACAO_MORTA_APOS_MS = 75_000;

/** Intervalo mínimo entre duas confirmações da sessão depois de erros (ms). */
export const INTERVALO_VERIFICAR_SESSAO_MS = 15_000;

/** O que se usa do EventSource. */
export interface FonteEventos {
  /** 0 = a ligar, 1 = aberta, 2 = fechada (desistiu). */
  readonly readyState: number;
  addEventListener(tipo: string, ouvinte: (evento: { data?: unknown }) => void): void;
  close(): void;
}

export interface DependenciasLigacao {
  abrirFonte: (url: string) => FonteEventos;
  /** O estado da loja agora (versão, a carregar, a gravar, rascunho, lotes deste separador). */
  contexto: () => ContextoLoja;
  /** Recarrega o estado do servidor (já juntando pedidos seguidos). */
  recarregar: () => Promise<void>;
  /** Mostra "X gravou N alterações." */
  avisar: (texto: string) => void;
  /** Mostra ou esconde "Sem ligação em tempo real…". */
  definirSemLigacao: (sem: boolean) => void;
  /** Pergunta ao servidor se a sessão continua (GET /api/auth/eu). */
  verificarSessao: () => void;
}

export interface LigacaoTempoReal {
  /** Abre a ligação (com sessão iniciada). Não faz nada se já estiver ligada. */
  ligar(): void;
  /** Fecha tudo: ligação, temporizadores e aviso de "sem ligação" (fim da sessão, desmontar). */
  desligar(): void;
  /** A página voltou a estar visível ou a rede voltou: se a ligação estava fechada, reabre e recarrega. */
  aoVoltar(): void;
  /** A loja acabou de carregar ou de gravar: decide o que ficou à espera. */
  aoAcalmarLoja(): void;
}

export function criarLigacaoTempoReal(dep: DependenciasLigacao): LigacaoTempoReal {
  let ligado = false;
  let fonte: FonteEventos | null = null;
  let tentativas = 0;
  let semLigacaoVisivel = false;
  let ultimaVerificacao = Number.NEGATIVE_INFINITY;
  let temporizadorSemLigacao: ReturnType<typeof setTimeout> | null = null;
  let temporizadorReabrir: ReturnType<typeof setTimeout> | null = null;
  let temporizadorVigia: ReturnType<typeof setTimeout> | null = null;
  /** Quando chegou a última coisa do servidor pela fonte atual (abertura, versão, lote ou sinal). */
  let ultimaNoticia = 0;
  /** Versão anunciada antes de a loja ter estado (decide-se quando o 1.º carregamento acabar). */
  let versaoEmEspera: number | null = null;
  /** Lotes que chegaram enquanto este separador gravava (podem ser o dele). */
  let adiados: EventoLote[] = [];

  function contarSemLigacao(): void {
    if (temporizadorSemLigacao !== null || semLigacaoVisivel) return;
    temporizadorSemLigacao = setTimeout(() => {
      temporizadorSemLigacao = null;
      if (!ligado) return;
      semLigacaoVisivel = true;
      dep.definirSemLigacao(true);
    }, SEM_LIGACAO_APOS_MS);
  }

  function pararContagem(): void {
    if (temporizadorSemLigacao === null) return;
    clearTimeout(temporizadorSemLigacao);
    temporizadorSemLigacao = null;
  }

  function cancelarReabrir(): void {
    if (temporizadorReabrir === null) return;
    clearTimeout(temporizadorReabrir);
    temporizadorReabrir = null;
  }

  function pararVigia(): void {
    if (temporizadorVigia === null) return;
    clearTimeout(temporizadorVigia);
    temporizadorVigia = null;
  }

  function fecharFonte(): void {
    pararVigia();
    if (!fonte) return;
    fonte.close();
    fonte = null;
  }

  /** A fonte está viva: (re)começa a contar até a dar por morta. */
  function noticia(f: FonteEventos): void {
    ultimaNoticia = Date.now();
    pararVigia();
    temporizadorVigia = setTimeout(() => {
      temporizadorVigia = null;
      if (f === fonte && f.readyState === FONTE_ABERTA) abrir();
    }, LIGACAO_MORTA_APOS_MS);
  }

  /** Aberta, mas sem notícias há demasiado tempo (ex.: o separador esteve a dormir). */
  function pareceMorta(): boolean {
    return fonte?.readyState === FONTE_ABERTA && Date.now() - ultimaNoticia > LIGACAO_MORTA_APOS_MS;
  }

  function agendarReabrir(): void {
    if (!ligado) return;
    cancelarReabrir();
    const espera = esperaParaReabrir(tentativas);
    tentativas += 1;
    temporizadorReabrir = setTimeout(() => {
      temporizadorReabrir = null;
      if (ligado) abrir();
    }, espera);
  }

  function verificarSessao(): void {
    const agora = Date.now();
    if (agora - ultimaVerificacao < INTERVALO_VERIFICAR_SESSAO_MS) return;
    ultimaVerificacao = agora;
    dep.verificarSessao();
  }

  function aoAbrir(): void {
    tentativas = 0;
    pararContagem();
    if (semLigacaoVisivel) {
      semLigacaoVisivel = false;
      dep.definirSemLigacao(false);
      // Esteve muito tempo sem ouvir o servidor: traz tudo (o evento "versao" pode não chegar para isso
      // se a loja tiver ficado com uma versão errada).
      void dep.recarregar();
    }
  }

  function aoErro(f: FonteEventos): void {
    contarSemLigacao();
    verificarSessao();
    if (f.readyState === FONTE_FECHADA) {
      fecharFonte();
      agendarReabrir();
    }
  }

  function aoVersao(dados: unknown): void {
    const versao = lerEventoVersao(dados);
    if (versao === null) return;
    const decisao = decidirVersao(versao, dep.contexto());
    if (decisao === 'recarregar') void dep.recarregar();
    else if (decisao === 'esperar') versaoEmEspera = versao;
  }

  function tratarLote(evento: EventoLote): void {
    const decisao = decidirLote(evento, dep.contexto());
    if (decisao.tipo === 'adiar') {
      adiados.push(evento);
      return;
    }
    if (decisao.recarregar) void dep.recarregar();
    if (decisao.aviso) dep.avisar(decisao.aviso);
  }

  function abrir(): void {
    fecharFonte();
    cancelarReabrir();
    // Conta desde já: se nunca chegar a abrir em 30 s, aparece o aviso.
    contarSemLigacao();
    let f: FonteEventos;
    try {
      f = dep.abrirFonte(URL_EVENTOS);
    } catch {
      agendarReabrir();
      return;
    }
    fonte = f;
    // Eventos de uma fonte já substituída não contam.
    f.addEventListener('open', () => {
      if (f !== fonte) return;
      noticia(f);
      aoAbrir();
    });
    f.addEventListener('error', () => {
      if (f !== fonte) return;
      pararVigia();
      aoErro(f);
    });
    f.addEventListener('versao', (e) => {
      if (f !== fonte) return;
      noticia(f);
      aoVersao(e.data);
    });
    f.addEventListener('lote', (e) => {
      if (f !== fonte) return;
      noticia(f);
      const evento = lerEventoLote(e.data);
      if (evento) tratarLote(evento);
    });
    f.addEventListener('sinal', () => {
      if (f === fonte) noticia(f);
    });
  }

  return {
    ligar() {
      if (ligado) return;
      ligado = true;
      tentativas = 0;
      abrir();
    },

    desligar() {
      ligado = false;
      fecharFonte();
      cancelarReabrir();
      pararContagem();
      adiados = [];
      versaoEmEspera = null;
      if (semLigacaoVisivel) {
        semLigacaoVisivel = false;
        dep.definirSemLigacao(false);
      }
    },

    aoVoltar() {
      if (!ligado) return;
      if (fonte !== null && fonte.readyState !== FONTE_FECHADA && !pareceMorta()) return;
      tentativas = 0;
      abrir();
      void dep.recarregar();
    },

    aoAcalmarLoja() {
      if (dep.contexto().aGuardar) return;
      const lista = adiados;
      adiados = [];
      for (const evento of lista) tratarLote(evento);
      // Lido outra vez: os lotes adiados podem ter acabado de pedir o estado.
      const contexto = dep.contexto();
      if (versaoEmEspera !== null && !contexto.aCarregar) {
        const versao = versaoEmEspera;
        versaoEmEspera = null;
        // Sem estado (o 1.º carregamento falhou), a App mostra o erro com "Tentar outra vez".
        // Só se o carregamento trouxe uma versão mais antiga: se trouxe uma mais recente, alguém gravou
        // depois de a ligação abrir e o evento desse lote vem a caminho.
        if (contexto.versaoLocal !== null && versao > contexto.versaoLocal) void dep.recarregar();
      }
    },
  };
}
