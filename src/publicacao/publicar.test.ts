import { describe, expect, it } from 'vitest';
import type { OpcoesPublicar } from './argumentos';
import { type Dependencias, ESPERA_MAXIMA_MS, mensagemDeErro, publicar, type RespostaHttp } from './publicar';

// Tudo fictício: hook, commits e endereços. Nenhum teste usa rede nem git.
const CHAVE = 'ChaveFalsa123';
const HOOK = `https://api.render.com/deploy/srv-ficticio000?key=${CHAVE}`;
const COMMIT = 'c0ffee1234567890c0ffee1234567890c0ffee12';
const QUINTA = new Date('2026-10-08T08:00:00Z');
const TERCA_NOITE = new Date('2026-10-06T17:00:00Z');

const OPCOES: OpcoesPublicar = { forcar: false, semVerificar: false, esperar: false, ajuda: false };

interface Falso {
  dep: Dependencias;
  saida: string[];
  erros: string[];
  comandosGit: string[];
  pedidos: { url: string; metodo: string }[];
  verificacoes: number;
}

/** Dependências falsas: git num estado bom por omissão, relógio que avança ao dormir. */
function falso(
  opcoes: {
    agora?: Date;
    ambiente?: Record<string, string | undefined>;
    git?: Record<string, { ok: boolean; saida: string }>;
    verificarPassa?: boolean;
    /** Quanto tempo a verificação faz o relógio andar. */
    duracaoVerificarMs?: number;
    respostas?: (url: string, metodo: string) => RespostaHttp | Error;
  } = {},
): Falso {
  let relogio = (opcoes.agora ?? QUINTA).getTime();
  const git: Record<string, { ok: boolean; saida: string }> = {
    'rev-parse --abbrev-ref HEAD': { ok: true, saida: 'main\n' },
    'status --porcelain': { ok: true, saida: '' },
    'remote get-url origin': { ok: true, saida: 'https://github.com/exemplo/mapa.git\n' },
    'fetch --quiet origin main': { ok: true, saida: '' },
    'rev-parse --verify --quiet refs/remotes/origin/main': { ok: true, saida: `${COMMIT}\n` },
    'rev-list --left-right --count main...origin/main': { ok: true, saida: '0\t0\n' },
    [`log -1 --format=%h %s ${COMMIT}`]: { ok: true, saida: 'c0ffee1 Mudança fictícia\n' },
    ...opcoes.git,
  };
  const f: Falso = {
    saida: [],
    erros: [],
    comandosGit: [],
    pedidos: [],
    verificacoes: 0,
    dep: {
      agora: () => new Date(relogio),
      ambiente: opcoes.ambiente ?? { RENDER_DEPLOY_HOOK: HOOK },
      git: (args) => {
        const chave = args.join(' ');
        f.comandosGit.push(chave);
        return git[chave] ?? { ok: false, saida: '' };
      },
      verificar: () => {
        f.verificacoes++;
        relogio += opcoes.duracaoVerificarMs ?? 0;
        return opcoes.verificarPassa ?? true;
      },
      pedir: async (url, { metodo }) => {
        f.pedidos.push({ url, metodo });
        const r = opcoes.respostas?.(url, metodo) ?? {
          status: 200,
          corpo: '{"deploy":{"id":"dep-ficticio1"}}',
        };
        if (r instanceof Error) throw r;
        return r;
      },
      dormir: async (ms) => {
        relogio += ms;
      },
      escrever: (t) => f.saida.push(t),
      escreverErro: (t) => f.erros.push(t),
    },
  };
  return f;
}

/** Nada do que se escreveu tem a chave do hook. */
function semSegredos(f: Falso): void {
  expect([...f.saida, ...f.erros].join('\n')).not.toContain(CHAVE);
}

describe('publicar', () => {
  it('caminho feliz: verifica, chama o hook com o commit e não mostra o hook', async () => {
    const f = falso();
    expect(await publicar(OPCOES, f.dep)).toBe(0);
    expect(f.verificacoes).toBe(1);
    expect(f.pedidos).toHaveLength(1);
    const pedido = f.pedidos[0];
    expect(pedido?.metodo).toBe('POST');
    expect(new URL(pedido?.url ?? '').searchParams.get('ref')).toBe(COMMIT);
    expect(f.saida.join('\n')).toContain('dep-ficticio1');
    expect(f.saida.join('\n')).toContain('c0ffee1 Mudança fictícia');
    expect(f.erros).toEqual([]);
    semSegredos(f);
  });

  it('na janela da reunião: recusa antes de tocar no git ou na rede', async () => {
    const f = falso({ agora: TERCA_NOITE });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    expect(f.comandosGit).toEqual([]);
    expect(f.pedidos).toEqual([]);
    expect(f.erros.join('\n')).toContain('--forcar');
  });

  it('na janela com --forcar: publica, com aviso (uma só vez)', async () => {
    const f = falso({ agora: TERCA_NOITE });
    expect(await publicar({ ...OPCOES, forcar: true }, f.dep)).toBe(0);
    expect(f.erros.filter((t) => t.includes('ATENÇÃO'))).toHaveLength(1);
    expect(f.pedidos).toHaveLength(1);
  });

  // O caso do revisor: terça 17:40, a verificação leva 10 minutos e o pedido sairia às 17:50.
  describe('a janela volta a ver-se logo antes do pedido ao Render', () => {
    const TERCA_1740 = new Date('2026-10-06T15:40:00Z');

    it('a verificação levou o relógio para perto da janela: recusa e não chama o hook', async () => {
      const f = falso({ agora: TERCA_1740, duracaoVerificarMs: 10 * 60_000 });
      expect(await publicar(OPCOES, f.dep)).toBe(1);
      expect(f.verificacoes).toBe(1);
      expect(f.pedidos).toEqual([]);
      expect(f.erros.join('\n')).toContain('terça 17:50');
      expect(f.erros.join('\n')).toContain('Nada foi publicado.');
    });

    it('com --forcar: publica, com o aviso', async () => {
      const f = falso({ agora: TERCA_1740, duracaoVerificarMs: 10 * 60_000 });
      expect(await publicar({ ...OPCOES, forcar: true }, f.dep)).toBe(0);
      expect(f.erros.filter((t) => t.includes('ATENÇÃO'))).toHaveLength(1);
      expect(f.pedidos).toHaveLength(1);
    });

    it('uma verificação rápida longe da janela: publica', async () => {
      const f = falso({ agora: new Date('2026-10-06T15:20:00Z'), duracaoVerificarMs: 3 * 60_000 });
      expect(await publicar(OPCOES, f.dep)).toBe(0);
      expect(f.erros).toEqual([]);
    });
  });

  it('sem RENDER_DEPLOY_HOOK: erro claro e nada corre', async () => {
    const f = falso({ ambiente: {} });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    expect(f.erros.join('\n')).toContain('Falta RENDER_DEPLOY_HOOK');
    expect(f.comandosGit).toEqual([]);
    expect(f.verificacoes).toBe(0);
  });

  it('hook inválido: erro sem mostrar o valor', async () => {
    const f = falso({ ambiente: { RENDER_DEPLOY_HOOK: `https://exemplo.net/?key=${CHAVE}` } });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    semSegredos(f);
  });

  it('com alterações por gravar: recusa antes do fetch', async () => {
    const f = falso({ git: { 'status --porcelain': { ok: true, saida: ' M src/a.ts\n' } } });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    expect(f.comandosGit).not.toContain('fetch --quiet origin main');
    expect(f.erros.join('\n')).toContain('src/a.ts');
  });

  it('fora do main: recusa', async () => {
    const f = falso({ git: { 'rev-parse --abbrev-ref HEAD': { ok: true, saida: 'outro\n' } } });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    expect(f.pedidos).toEqual([]);
  });

  it('sem remoto origin: diz para ver o guia', async () => {
    const f = falso({ git: { 'remote get-url origin': { ok: false, saida: '' } } });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    expect(f.erros.join('\n')).toContain('docs/publicar.md');
  });

  it('main diferente do GitHub: recusa', async () => {
    const f = falso({
      git: { 'rev-list --left-right --count main...origin/main': { ok: true, saida: '1\t0' } },
    });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    expect(f.erros.join('\n')).toContain('git push');
    expect(f.verificacoes).toBe(0);
  });

  it('verificação falhada: não chama o hook', async () => {
    const f = falso({ verificarPassa: false });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    expect(f.pedidos).toEqual([]);
  });

  it('--sem-verificar: não verifica, avisa e publica', async () => {
    const f = falso({ verificarPassa: false });
    expect(await publicar({ ...OPCOES, semVerificar: true }, f.dep)).toBe(0);
    expect(f.verificacoes).toBe(0);
    expect(f.erros.join('\n')).toContain('--sem-verificar');
  });

  it('erro de rede com o URL na mensagem: oculta o hook e não diz que nada foi publicado', async () => {
    const f = falso({ respostas: (url) => new Error(`fetch failed: ${url}`) });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    semSegredos(f);
    expect(f.erros.join('\n')).toContain('Não sei se o pedido chegou');
  });

  it('hook recusado: erro', async () => {
    const f = falso({ respostas: () => ({ status: 404, corpo: '{"message":"not found"}' }) });
    expect(await publicar(OPCOES, f.dep)).toBe(1);
    expect(f.erros.join('\n')).toContain('HTTP 404');
    semSegredos(f);
  });

  describe('--esperar', () => {
    const ESPERAR: OpcoesPublicar = { ...OPCOES, esperar: true };

    /** Respostas da /api/saude por ordem; o hook responde sempre 200. */
    function sequencia(
      saude: (RespostaHttp | Error)[],
    ): (url: string, metodo: string) => RespostaHttp | Error {
      let i = 0;
      return (_url, metodo) => {
        if (metodo === 'POST') return { status: 200, corpo: '{}' };
        const r = saude[Math.min(i, saude.length - 1)] as RespostaHttp | Error;
        i++;
        return r;
      };
    }
    const saude = (valor: unknown): RespostaHttp => ({ status: 200, corpo: JSON.stringify(valor) });
    const copias = { ativas: true, ultimaCopiaEm: '2026-10-08T07:00:00Z', atrasada: false };

    it('espera pelo commit novo no endereço por omissão', async () => {
      const f = falso({
        respostas: sequencia([
          saude({ ok: true, commit: 'aaaaaaa1111', copias }),
          new Error('ECONNREFUSED'),
          saude({ ok: true, commit: COMMIT, copias }),
        ]),
      });
      expect(await publicar(ESPERAR, f.dep)).toBe(0);
      const urls = f.pedidos.filter((p) => p.metodo === 'GET').map((p) => p.url);
      expect(urls).toEqual(Array(3).fill('https://mapa.cmf-lux.lu/api/saude'));
      expect(f.saida.join('\n')).toContain('já está no ar');
      semSegredos(f);
    });

    it('usa o ENDERECO_PUBLICO https e avisa das cópias atrasadas no fim', async () => {
      const f = falso({
        ambiente: { RENDER_DEPLOY_HOOK: HOOK, ENDERECO_PUBLICO: 'https://exemplo.onrender.com' },
        respostas: sequencia([
          saude({ ok: true, commit: 'aaaaaaa1111' }),
          saude({ ok: true, commit: COMMIT, copias: { ...copias, atrasada: true } }),
        ]),
      });
      expect(await publicar(ESPERAR, f.dep)).toBe(0);
      expect(f.pedidos.at(-1)?.url).toBe('https://exemplo.onrender.com/api/saude');
      expect(f.erros.join('\n')).toContain('atrasadas');
    });

    // O caso do revisor: sem commit na /api/saude, uma falha passageira enquanto o Render constrói não pode
    // dar a versão nova como pronta.
    it('sem commit: uma falha passageira não acaba a espera', async () => {
      const f = falso({
        respostas: sequencia([
          saude({ ok: true, copias }),
          new Error('fetch failed'),
          saude({ ok: true, copias }),
        ]),
      });
      expect(await publicar(ESPERAR, f.dep)).toBe(1);
      expect(f.saida.join('\n')).not.toContain('voltou a responder');
      expect(f.erros.join('\n')).toContain('não vi o mapa parar');
      expect(f.erros.join('\n')).toContain('Events');
    });

    it('sem commit: parado a sério depois da construção e de volta → termina, sem garantir o commit', async () => {
      // 13 respostas ok de 5 em 5 s (65 s: já depois do tempo mínimo de construção), duas falhas e ok.
      const f = falso({
        respostas: sequencia([
          ...Array(13).fill(saude({ ok: true, copias })),
          new Error('ECONNREFUSED'),
          { status: 502, corpo: '<html>Bad Gateway</html>' },
          saude({ ok: true, copias }),
        ]),
      });
      expect(await publicar(ESPERAR, f.dep)).toBe(0);
      const saida = f.saida.join('\n');
      expect(saida).toContain('voltou a responder');
      expect(saida).toContain('não é certo');
      expect(saida).toContain('Events');
      expect(f.erros).toEqual([]);
    });

    it('sem commit e com HTTP 202: avisa que a troca vista pode ser a da outra publicação', async () => {
      let i = 0;
      const saudes: (RespostaHttp | Error)[] = [
        ...Array(13).fill(saude({ ok: true, copias })),
        new Error('ECONNREFUSED'),
        new Error('ECONNREFUSED'),
        saude({ ok: true, copias }),
      ];
      const f = falso({
        respostas: (_url, metodo) => {
          if (metodo === 'POST') return { status: 202, corpo: '' };
          return saudes[Math.min(i++, saudes.length - 1)] as RespostaHttp | Error;
        },
      });
      expect(await publicar(ESPERAR, f.dep)).toBe(0);
      expect(f.erros.join('\n')).toContain('HTTP 202');
    });

    it('depois de uma falha pergunta mais depressa (2 s), para a paragem curta não escapar', async () => {
      const f = falso({
        respostas: sequencia([
          ...Array(13).fill(saude({ ok: true, copias })),
          new Error('ECONNREFUSED'),
          new Error('ECONNREFUSED'),
          saude({ ok: true, copias }),
        ]),
      });
      const inicio = f.dep.agora().getTime();
      expect(await publicar(ESPERAR, f.dep)).toBe(0);
      expect(f.dep.agora().getTime() - inicio).toBe(13 * 5000 + 2 * 2000);
    });

    it('desiste ao fim do tempo máximo', async () => {
      const f = falso({ respostas: sequencia([saude({ ok: true, commit: 'aaaaaaa1111', copias })]) });
      expect(await publicar(ESPERAR, f.dep)).toBe(1);
      expect(f.erros.join('\n')).toContain('Events');
      // Não escreve a mesma frase a cada 5 s.
      expect(f.saida.filter((t) => t.includes('versão anterior'))).toHaveLength(1);
      const gets = f.pedidos.filter((p) => p.metodo === 'GET').length;
      expect(gets).toBe(ESPERA_MAXIMA_MS / 5000);
    });

    it('--endereco inválido: erro antes de tudo', async () => {
      const f = falso();
      expect(await publicar({ ...ESPERAR, endereco: 'http://localhost:5173' }, f.dep)).toBe(1);
      expect(f.comandosGit).toEqual([]);
    });
  });
});

describe('mensagemDeErro', () => {
  it('junta a causa do fetch do Node', () => {
    const causa = Object.assign(new Error('getaddrinfo ENOTFOUND api.exemplo'), { code: 'ENOTFOUND' });
    expect(mensagemDeErro(new TypeError('fetch failed', { cause: causa }))).toBe(
      'fetch failed (ENOTFOUND: getaddrinfo ENOTFOUND api.exemplo)',
    );
  });

  it('fim do tempo e valores que não são erros', () => {
    const tempo = new Error('The operation was aborted due to timeout');
    tempo.name = 'TimeoutError';
    expect(mensagemDeErro(tempo)).toBe('o Render não respondeu a tempo');
    expect(mensagemDeErro('texto')).toBe('texto');
  });
});
