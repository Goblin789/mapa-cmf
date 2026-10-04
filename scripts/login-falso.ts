// Arranca o fornecedor de login FALSO (src/servidor/auth/provedorFalso.ts) para experimentar o login no
// PC sem a Microsoft. Uso: npm run login-falso [-- --porta 8890]
// Escreve as variáveis a passar ao servidor. Nunca em produção (o fornecedor recusa arrancar).

import { serve } from '@hono/node-server';
import { CLIENTE_FALSO, criarProvedorFalso, INQUILINO_FALSO } from '../src/servidor/auth/provedorFalso';

function lerPorta(argumentos: string[]): number {
  const i = argumentos.indexOf('--porta');
  if (i === -1) return 8890;
  const texto = argumentos[i + 1] ?? '';
  const porta = Number(texto);
  if (!/^\d+$/.test(texto) || porta < 1 || porta > 65535) {
    console.error(`--porta tem de ser um número entre 1 e 65535 (está "${texto}").`);
    process.exit(1);
  }
  return porta;
}

const porta = lerPorta(process.argv.slice(2));
const emissor = `http://localhost:${porta}`;

let provedor: Awaited<ReturnType<typeof criarProvedorFalso>>;
try {
  provedor = await criarProvedorFalso({ emissor, cliente: CLIENTE_FALSO, segredo: 'falso' });
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
}

const servidor = serve({ fetch: provedor.app.fetch, port: porta, hostname: '127.0.0.1' }, () => {
  console.log(`Fornecedor de login FALSO em ${emissor} (só para testes; utilizadores fictícios).`);
  console.log('');
  console.log('Arranca o servidor do Mapa com estas variáveis (têm prioridade sobre o .env):');
  console.log(`  ENTRA_EMISSOR=${emissor}`);
  console.log(`  ENTRA_INQUILINO=${INQUILINO_FALSO}`);
  console.log(`  ENTRA_CLIENTE=${CLIENTE_FALSO}`);
  console.log('  ENTRA_SEGREDO=falso');
  console.log('  ENDERECO_PUBLICO=http://localhost:5173');
  console.log('');
  console.log(
    'Ex. (git-bash): ENTRA_EMISSOR=... ENTRA_INQUILINO=... ENTRA_CLIENTE=... ENTRA_SEGREDO=falso \\',
  );
  console.log('  ENDERECO_PUBLICO=http://localhost:5173 npm run dev');
});

servidor.on('error', (erro: NodeJS.ErrnoException) => {
  console.error(
    erro.code === 'EADDRINUSE'
      ? `A porta ${porta} já está ocupada (usa --porta N).`
      : `Não arrancou: ${erro.message}`,
  );
  process.exit(1);
});

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => servidor.close(() => process.exit(0)));
}
