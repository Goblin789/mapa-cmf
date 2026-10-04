// Cópias de segurança da base de dados, à mão (ver src/servidor/copias/comandos.ts).
//
//   npm run copias -- chave                                  # gera uma COPIAS_CHAVE nova
//   npm run copias -- fazer [--bd caminho] [--motivo pc]     # cópia da BD (omissão: a do .env, BD)
//   npm run copias -- listar                                 # cópias no destino (datas no Luxemburgo)
//   npm run copias -- verificar <nome|ultima>                # decifra e verifica, sem escrever nada
//   npm run copias -- restaurar <nome|ultima> --para <caminho> [--substituir]
//
// Lê o .env (as variáveis passadas no próprio comando têm prioridade). Nunca imprime segredos.

import { executarComandoCopias, lerArgumentosCopias } from '../src/servidor/copias/comandos';

// Ctrl+C (ou um kill normal) a meio: sai pelo process.exit, para correr a limpeza das pastas temporárias com a
// BD decifrada (ver src/servidor/copias/temporarios.ts). Sem isto o Node sai sem correr nenhum handler.
for (const [sinal, codigo] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  process.once(sinal, () => {
    console.error('Interrompido.');
    process.exit(codigo);
  });
}

try {
  process.loadEnvFile('.env');
} catch {
  // Sem .env: usa só as variáveis do ambiente.
}

const lidos = lerArgumentosCopias(process.argv.slice(2));
if ('erro' in lidos) {
  console.error(lidos.erro);
  console.error('Nada foi feito.');
  process.exitCode = 1;
} else {
  process.exitCode = await executarComandoCopias(lidos.comando, process.env);
}
