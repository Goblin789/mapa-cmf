// "npm run publicar": confirma que se pode publicar, verifica, pede a publicação ao Render (Deploy Hook) e,
// com --esperar, espera pela versão nova. O I/O (git, npm, rede, relógio, ecrã) chega por `Dependencias`,
// para os testes correrem sem rede nem git; scripts/publicar.ts liga as dependências verdadeiras.

import type { OpcoesPublicar } from './argumentos';
import { escolherEndereco } from './argumentos';
import { lerContagem, problemasRamoEArvore, problemasSincronizacao, RAMO_PUBLICACAO } from './git';
import { decidirJanela } from './janela';
import { descreverRespostaHook, lerDeployHook, ocultarSegredos, segredosDoHook, urlDoPedido } from './render';
import { avaliarSaude, avancarEspera, ESPERA_INICIAL, type Observacao, urlSaude } from './saude';

export interface ResultadoComando {
  ok: boolean;
  saida: string;
}

export interface RespostaHttp {
  status: number;
  corpo: string;
}

export interface Dependencias {
  agora(): Date;
  /** Variáveis de ambiente (já com o .env lido). */
  ambiente: Readonly<Record<string, string | undefined>>;
  /** Corre git com estes argumentos (sem shell). */
  git(args: readonly string[]): ResultadoComando;
  /** Corre "npm run verificar" com a saída no ecrã. true = passou. */
  verificar(): boolean;
  /** Pedido HTTP; lança em erro de rede ou fim do tempo. */
  pedir(url: string, opcoes: { metodo: 'GET' | 'POST'; tempoLimiteMs: number }): Promise<RespostaHttp>;
  dormir(ms: number): Promise<void>;
  escrever(texto: string): void;
  escreverErro(texto: string): void;
}

/** Tempo máximo à espera da versão nova: a construção leva uns minutos e o Render espera até 15 min. */
export const ESPERA_MAXIMA_MS = 20 * 60 * 1000;
export const INTERVALO_ESPERA_MS = 5000;
/** Depois de uma falha pergunta-se mais depressa, para a paragem da troca de versão (curta) não escapar. */
export const INTERVALO_APOS_FALHA_MS = 2000;
const TEMPO_LIMITE_HOOK_MS = 30_000;
const TEMPO_LIMITE_SAUDE_MS = 10_000;

/** Publica. Devolve o código de saída (0 = pedido feito e, com --esperar, versão nova no ar). */
export async function publicar(opcoes: OpcoesPublicar, dep: Dependencias): Promise<number> {
  const falhar = (mensagem: string, conclusao = 'Nada foi publicado.'): number => {
    dep.escreverErro(mensagem);
    dep.escreverErro(conclusao);
    return 1;
  };

  // 1. Janela da reunião (outra vez logo antes do pedido ao Render: a verificação leva uns minutos).
  const janela = decidirJanela(dep.agora(), opcoes.forcar);
  if (!janela.pode) return falhar(janela.erro);
  if (janela.aviso) dep.escreverErro(janela.aviso);

  // 2. Configuração: o Deploy Hook e, com --esperar, o endereço público.
  const hook = lerDeployHook(dep.ambiente.RENDER_DEPLOY_HOOK);
  if ('erro' in hook) return falhar(hook.erro);
  let endereco: string | null = null;
  if (opcoes.esperar) {
    const escolha = escolherEndereco(opcoes.endereco, dep.ambiente.ENDERECO_PUBLICO);
    if ('erro' in escolha) return falhar(escolha.erro);
    endereco = escolha.endereco;
  }

  // 3. Git: no main, sem alterações e igual ao GitHub.
  const ramo = dep.git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const estado = dep.git(['status', '--porcelain']);
  if (!ramo.ok || !estado.ok) return falhar('Não consegui ler o estado do git nesta pasta.');
  const problemas = problemasRamoEArvore(ramo.saida.trim(), estado.saida);
  if (problemas.length > 0) return falhar(problemas.join('\n'));

  if (!dep.git(['remote', 'get-url', 'origin']).ok) {
    return falhar(
      'Este PC ainda não está ligado ao GitHub (falta o remoto "origin"). Ver docs/publicar.md, passo 1.',
    );
  }
  dep.escrever(`A comparar com o GitHub (git fetch origin ${RAMO_PUBLICACAO})…`);
  if (!dep.git(['fetch', '--quiet', 'origin', RAMO_PUBLICACAO]).ok) {
    return falhar(
      'Não consegui falar com o GitHub (git fetch). Há Internet? A sessão do GitHub ainda é válida?',
    );
  }
  const remoto = dep.git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${RAMO_PUBLICACAO}`]);
  if (!remoto.ok) {
    return falhar(
      `O GitHub ainda não tem o ${RAMO_PUBLICACAO}: envia-o com "git push -u origin ${RAMO_PUBLICACAO}".`,
    );
  }
  const contagem = lerContagem(
    dep.git(['rev-list', '--left-right', '--count', `${RAMO_PUBLICACAO}...origin/${RAMO_PUBLICACAO}`]).saida,
  );
  if (!contagem) return falhar('Não consegui comparar o main deste PC com o do GitHub.');
  const desvios = problemasSincronizacao(contagem.aFrente, contagem.atras);
  if (desvios.length > 0) return falhar(desvios.join('\n'));
  const commit = remoto.saida.trim();
  const resumo = dep.git(['log', '-1', '--format=%h %s', commit]).saida.trim() || commit.slice(0, 7);
  dep.escrever(`Versão a publicar: ${resumo}`);

  // 4. Verificação (tipos, lint e testes).
  if (opcoes.semVerificar) {
    dep.escreverErro('Sem verificação (--sem-verificar): o GitHub Actions verifica na mesma, mas só depois.');
  } else {
    dep.escrever('A verificar (npm run verificar)…');
    if (!dep.verificar()) return falhar('A verificação falhou: corrige primeiro.');
  }

  // 5. A janela outra vez: a verificação pode ter levado o relógio para dentro dela (ou para perto).
  const janelaAgora = decidirJanela(dep.agora(), opcoes.forcar);
  if (!janelaAgora.pode) return falhar(`Entretanto a hora mudou. ${janelaAgora.erro}`);
  if (janelaAgora.aviso && !janela.aviso) dep.escreverErro(janelaAgora.aviso);

  // 6. Pedido ao Render. O hook nunca aparece no ecrã, nem dentro de uma mensagem de erro.
  const urlPedido = urlDoPedido(hook.url, commit);
  const segredos = segredosDoHook(hook.url, urlPedido);
  let resposta: RespostaHttp;
  try {
    resposta = await dep.pedir(urlPedido, { metodo: 'POST', tempoLimiteMs: TEMPO_LIMITE_HOOK_MS });
  } catch (erro) {
    const texto = ocultarSegredos(mensagemDeErro(erro), segredos);
    return falhar(
      `Não consegui contactar o Render: ${texto}`,
      'Não sei se o pedido chegou: vê em Render > mapa-cmf > Events antes de tentar de novo.',
    );
  }
  const pedidoEm = dep.agora().getTime();
  const descricao = descreverRespostaHook(resposta.status, resposta.corpo);
  if (!descricao.ok) return falhar(ocultarSegredos(descricao.mensagem, segredos));
  dep.escrever(ocultarSegredos(descricao.mensagem, segredos));

  if (!endereco) {
    dep.escrever(
      'A versão nova fica no ar dentro de uns minutos (Render > mapa-cmf > Events). ' +
        'Com --esperar, o comando espera por ela.',
    );
    return 0;
  }
  return esperarVersaoNova(endereco, commit, pedidoEm, descricao.emFila, dep);
}

/**
 * Mensagem de um erro de rede com a causa (o fetch do Node diz só "fetch failed" e põe o motivo, ex.
 * ENOTFOUND, em `cause`).
 */
export function mensagemDeErro(erro: unknown): string {
  if (!(erro instanceof Error)) return String(erro);
  if (erro.name === 'TimeoutError') return 'o Render não respondeu a tempo';
  const causa = erro.cause;
  if (causa instanceof Error) {
    const codigo = (causa as NodeJS.ErrnoException).code;
    return `${erro.message} (${codigo ? `${codigo}: ` : ''}${causa.message})`;
  }
  return erro.message;
}

/**
 * Pergunta à /api/saude de 5 em 5 s (de 2 em 2 s depois de uma falha) até a versão nova responder ok, no
 * máximo ESPERA_MAXIMA_MS. `pedidoEm` = quando o Render aceitou o pedido; `emFila` = HTTP 202.
 */
async function esperarVersaoNova(
  endereco: string,
  commit: string,
  pedidoEm: number,
  emFila: boolean,
  dep: Dependencias,
): Promise<number> {
  const url = urlSaude(endereco);
  dep.escrever(`À espera da versão nova em ${url} (até ${ESPERA_MAXIMA_MS / 60_000} minutos)…`);
  const limite = dep.agora().getTime() + ESPERA_MAXIMA_MS;
  let estado = ESPERA_INICIAL;
  let ultimaFrase = '';
  const dizer = (frase: string): void => {
    if (frase !== ultimaFrase) dep.escrever(frase);
    ultimaFrase = frase;
  };

  while (dep.agora().getTime() < limite) {
    let obs: Observacao = { tipo: 'falha' };
    let avaliacao: ReturnType<typeof avaliarSaude> | null = null;
    try {
      const r = await dep.pedir(url, { metodo: 'GET', tempoLimiteMs: TEMPO_LIMITE_SAUDE_MS });
      avaliacao = avaliarSaude(r.status, r.corpo);
      if (avaliacao.ok) obs = { tipo: 'ok', commit: avaliacao.commit };
    } catch {
      // Em baixo, a arrancar ou sem rede: conta como falha.
    }
    const decorridoMs = dep.agora().getTime() - pedidoEm;
    const passo = avancarEspera(estado, obs, { commitEsperado: commit, decorridoMs });
    estado = passo.estado;
    if (passo.resultado !== 'aguardar' && avaliacao) {
      if (passo.resultado === 'pronto') {
        dep.escrever(`A versão nova (${commit.slice(0, 7)}) já está no ar.`);
      } else {
        dep.escrever(
          'O mapa esteve em baixo (a troca de versão) e voltou a responder. A /api/saude não diz o commit, ' +
            `por isso não é certo que seja o ${commit.slice(0, 7)}: confirma em Render > mapa-cmf > Events ` +
            'que esta publicação terminou.',
        );
        if (emFila) {
          dep.escreverErro(
            'Atenção: havia outra publicação à frente desta (HTTP 202); a troca que se viu pode ter sido a dela.',
          );
        }
      }
      for (const problema of avaliacao.problemas) dep.escreverErro(`Atenção: ${problema}`);
      for (const aviso of avaliacao.avisos) dep.escrever(`Nota: ${aviso}`);
      return 0;
    }
    dizer(
      obs.tipo === 'falha'
        ? '  … o mapa não responde (troca de versão, a versão nova a arrancar, ou a rede).'
        : '  … ainda responde a versão anterior (o Render está a construir a nova).',
    );
    await dep.dormir(obs.tipo === 'falha' ? INTERVALO_APOS_FALHA_MS : INTERVALO_ESPERA_MS);
  }
  dep.escreverErro(
    estado.commitInicial === null
      ? `Passaram ${ESPERA_MAXIMA_MS / 60_000} minutos e não vi o mapa parar para a troca de versão (a ` +
          '/api/saude não diz o commit, e uma paragem muito curta pode escapar). Vê em Render > mapa-cmf > ' +
          'Events se a publicação terminou, e em Logs se houve erros.'
      : `Passaram ${ESPERA_MAXIMA_MS / 60_000} minutos e a versão nova ainda não respondeu. ` +
          'Vê o que se passa em Render > mapa-cmf > Events e Logs.',
  );
  return 1;
}
