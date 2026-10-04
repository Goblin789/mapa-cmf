// Deploy Hook do Render: um URL secreto (https://api.render.com/deploy/srv-…?key=…) que, com um POST,
// começa uma publicação. Quem o tiver pode publicar: nunca aparece em mensagens nem nos registos.

export type LeituraHook = { url: URL } | { erro: string };

const ONDE_ESTA = 'Render > serviço mapa-cmf > Settings > Deploy Hook';

/** Valida o RENDER_DEPLOY_HOOK. As mensagens de erro nunca incluem o valor. */
export function lerDeployHook(valor: string | undefined): LeituraHook {
  const texto = valor?.trim();
  if (!texto) {
    return {
      erro:
        `Falta RENDER_DEPLOY_HOOK no .env deste PC. Copia-o de ${ONDE_ESTA} ` +
        '(é um segredo: só no .env, nunca no chat nem no git). Ver docs/publicar.md.',
    };
  }
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { erro: `RENDER_DEPLOY_HOOK não é um endereço. Copia-o de novo de ${ONDE_ESTA}.` };
  }
  const doRender = url.hostname === 'render.com' || url.hostname.endsWith('.render.com');
  if (url.protocol !== 'https:' || !doRender || !url.pathname.startsWith('/deploy/')) {
    return {
      erro:
        'RENDER_DEPLOY_HOOK não parece um Deploy Hook do Render (https://api.render.com/deploy/srv-…?key=…). ' +
        `Copia-o de novo de ${ONDE_ESTA}.`,
    };
  }
  return { url };
}

/**
 * URL a chamar: o hook com `ref` = o commit verificado, para o Render construir exatamente esse commit
 * (e não um que alguém tenha enviado entretanto). Com `ref` o Render desliga os deploys automáticos do
 * serviço, que já estão desligados no render.yaml.
 */
export function urlDoPedido(hook: URL, commit: string): string {
  const url = new URL(hook.href);
  url.searchParams.set('ref', commit);
  return url.href;
}

/** Textos que nunca se podem mostrar (o hook inteiro, a chave e o URL do pedido). */
export function segredosDoHook(hook: URL, urlPedido: string): string[] {
  const chave = hook.searchParams.get('key');
  return [hook.href, urlPedido, ...(chave ? [chave, encodeURIComponent(chave)] : [])];
}

/** Segredos a ocultar a partir do valor cru do RENDER_DEPLOY_HOOK, mesmo que não seja um URL válido. */
export function segredosDoValor(valor: string | undefined): string[] {
  const texto = valor?.trim() ?? '';
  if (!texto) return [];
  try {
    const url = new URL(texto);
    const chave = url.searchParams.get('key');
    return [texto, url.href, ...(chave ? [chave, encodeURIComponent(chave)] : [])];
  } catch {
    return [texto];
  }
}

/** Troca cada segredo por "***" (para mensagens de erro de terceiros, que podem trazer o URL). */
export function ocultarSegredos(texto: string, segredos: readonly string[]): string {
  let resultado = texto;
  // Os mais compridos primeiro: o URL inteiro antes da chave que está lá dentro.
  for (const segredo of [...segredos].sort((a, b) => b.length - a.length)) {
    if (segredo.length >= 6) resultado = resultado.split(segredo).join('***');
  }
  return resultado;
}

export type RespostaHook =
  | {
      ok: true;
      mensagem: string;
      deployId: string | null;
      /** HTTP 202: havia outra publicação a decorrer; esta só começa quando essa acabar. */
      emFila: boolean;
    }
  | { ok: false; mensagem: string };

/**
 * Interpreta a resposta do Render ao Deploy Hook (códigos em https://render.com/docs/deploy-hooks):
 * 200 começou; 202 em fila atrás de outra; 400 parâmetros; 401 chave do hook inválida; 404 serviço não
 * encontrado ou commit (`ref`) que não existe no repositório ligado ao serviço; 409 serviço suspenso.
 */
export function descreverRespostaHook(status: number, corpo: string): RespostaHook {
  const json = lerJson(corpo);
  const detalhe = textoCurto(json?.message);
  if (status === 202) {
    return {
      ok: true,
      deployId: null,
      emFila: true,
      mensagem:
        'O Render aceitou, mas já havia uma publicação a decorrer: esta começa quando essa acabar ' +
        '(Render > mapa-cmf > Events).',
    };
  }
  if (status >= 200 && status < 300) {
    const deploy = json?.deploy;
    const id = textoCurto(
      deploy !== null && typeof deploy === 'object' ? (deploy as Record<string, unknown>).id : json?.id,
    );
    return {
      ok: true,
      deployId: id,
      emFila: false,
      mensagem: `O Render aceitou: a publicação começou${id ? ` (deploy ${id})` : ''}.`,
    };
  }
  const extra = detalhe ? ` Resposta: "${detalhe}".` : '';
  if (status === 401 || status === 403) {
    return {
      ok: false,
      mensagem:
        `O Render recusou a chave do Deploy Hook (HTTP ${status}).${extra} Se foi regenerado, copia o novo ` +
        `de ${ONDE_ESTA} para o .env.`,
    };
  }
  if (status === 404) {
    return {
      ok: false,
      mensagem:
        `O Render não encontrou o serviço ou o commit (HTTP 404).${extra} Duas causas: (1) o serviço foi ` +
        `apagado ou criado de novo, e o Deploy Hook passou a ser outro: copia-o de ${ONDE_ESTA}; (2) o ` +
        'commit não está no repositório que o Render usa: confirma em Render > mapa-cmf > Settings > ' +
        'Repository que é o mesmo de "git remote get-url origin".',
    };
  }
  if (status === 409) {
    return {
      ok: false,
      mensagem:
        `O Render não pode publicar agora (HTTP 409).${extra} O serviço está suspenso? ` +
        'Vê na página Render > mapa-cmf: se estiver suspenso, é preciso retomá-lo primeiro.',
    };
  }
  if (status === 429) {
    return {
      ok: false,
      mensagem: `Demasiados pedidos ao Render (HTTP 429).${extra} Tenta daqui a uns minutos.`,
    };
  }
  if (status >= 500) {
    return {
      ok: false,
      mensagem: `O Render não conseguiu responder (HTTP ${status}).${extra} Tenta daqui a uns minutos.`,
    };
  }
  return { ok: false, mensagem: `O Render recusou o pedido (HTTP ${status}).${extra}` };
}

function lerJson(corpo: string): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(corpo);
    return valor !== null && typeof valor === 'object' ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Um texto curto e numa linha, ou null. */
function textoCurto(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const linha = valor.replace(/\s+/g, ' ').trim();
  return linha.length > 200 ? `${linha.slice(0, 200)}…` : linha;
}
