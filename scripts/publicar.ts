// Publica no Render a versão que está no main do GitHub. A lógica está em src/publicacao/publicar.ts.
//
//   npm run publicar                         # confirma, verifica e pede a publicação ao Render
//   npm run publicar -- --esperar            # ... e espera que a versão nova responda na /api/saude
//   npm run publicar -- --sem-verificar      # sem "npm run verificar" antes
//   npm run publicar -- --forcar             # mesmo de terça 17:45 a quarta 12:00 (hora do Luxemburgo)
//   npm run publicar -- --esperar --endereco https://mapa-cmf.onrender.com
//
// Recusa: dentro da janela da reunião (salvo --forcar), fora do main, com alterações por gravar no git ou
// com o main diferente do do GitHub. Precisa de RENDER_DEPLOY_HOOK no .env, que nunca se mostra.
// Guia: docs/publicar.md.

import { execFileSync, spawnSync } from 'node:child_process';
import { lerArgumentosPublicar, USO_PUBLICAR } from '../src/publicacao/argumentos';
import { type Dependencias, publicar } from '../src/publicacao/publicar';
import { ocultarSegredos, segredosDoValor } from '../src/publicacao/render';

try {
  process.loadEnvFile('.env');
} catch {
  // Sem .env: só as variáveis do ambiente (que, de qualquer forma, têm prioridade).
}

const dependencias: Dependencias = {
  agora: () => new Date(),
  ambiente: process.env,
  git: (args) => {
    try {
      const saida = execFileSync('git', [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, saida };
    } catch {
      return { ok: false, saida: '' };
    }
  },
  verificar: () => {
    // shell: no Windows o npm é um .cmd, que o Node só corre através da shell. O comando é fixo.
    const r = spawnSync('npm run verificar', { stdio: 'inherit', shell: true });
    return r.status === 0;
  },
  pedir: async (url, { metodo, tempoLimiteMs }) => {
    const resposta = await fetch(url, { method: metodo, signal: AbortSignal.timeout(tempoLimiteMs) });
    return { status: resposta.status, corpo: await resposta.text() };
  },
  dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
  escrever: (texto) => console.log(texto),
  escreverErro: (texto) => console.error(texto),
};

const lidos = lerArgumentosPublicar(process.argv.slice(2));
if ('erro' in lidos) {
  console.error(lidos.erro);
  console.error('Nada foi publicado.');
  process.exitCode = 1;
} else if (lidos.opcoes.ajuda) {
  console.log(USO_PUBLICAR);
} else {
  try {
    process.exitCode = await publicar(lidos.opcoes, dependencias);
  } catch (erro) {
    // Um erro inesperado nunca mostra o hook (nem a chave que vai nele).
    const texto = erro instanceof Error ? erro.message : String(erro);
    const segredos = segredosDoValor(process.env.RENDER_DEPLOY_HOOK);
    console.error(`A publicação falhou: ${ocultarSegredos(texto, segredos)}`);
    process.exitCode = 1;
  }
}
