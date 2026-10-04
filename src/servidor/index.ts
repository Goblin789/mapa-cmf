// Arranque do servidor: lê a config, prepara a base de dados (restauro e cópia antes das migrações),
// abre-a, arranca as cópias automáticas e o tempo real, cria a app e fica à escuta em HOST:PORT.
// Nunca escreve segredos (client secret, chaves, tokens) na consola.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { criarApp } from './app';
import { iniciarLimpezaSessoes } from './auth/sessoes';
import { obterConfigServidor } from './config';
import { type ConfigCopias, iniciarCopias, lerConfigCopias, prepararBd } from './copias';
import { abrirBd } from './db/ligacao';
import { contarPessoas } from './estado';
import { criarCanalEventos } from './eventos';

/** Build de produção do browser (`npm run build`). Em desenvolvimento quem o serve é o Vite. */
const PASTA_CLIENTE = fileURLToPath(new URL('../../dist/cliente', import.meta.url));

/** Mensagem de um erro de arranque (as das cópias já vêm sem segredos). */
function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** Erro de configuração ou de preparação: explica e termina, sem stack trace. */
function desistir(contexto: string, erro: unknown): never {
  console.error(`${contexto}: ${mensagem(erro)}`);
  process.exit(1);
}

// Primeiro: lê o .env (se existir) para o process.env, de que as cópias também precisam.
const config = obterConfigServidor();

let configCopias: ConfigCopias | null;
try {
  configCopias = lerConfigCopias(process.env);
} catch (erro) {
  desistir('Configuração das cópias inválida', erro);
}

// Em produção há sempre cópias noutro fornecedor desde o 1.º dia (proposta, secção 2). Sem elas, um disco
// perdido arrancava com uma BD vazia sem aviso; uma pasta ficava no mesmo disco que a BD.
if (config.producao && configCopias?.destino.tipo !== 's3') {
  desistir(
    'Configuração das cópias inválida',
    'em produção é obrigatório COPIAS_DESTINO=s3 (com COPIAS_CHAVE e COPIAS_S3_*): as cópias têm de ficar ' +
      'noutro fornecedor, fora do disco do servidor.',
  );
}

// Fora de produção (o PC) o servidor nunca ESCREVE num destino s3: esse balde é o da produção, e as cópias
// da BD de testes (de hora a hora, antes de migrar) e a retenção iam misturar-se com as boas, ou mesmo
// tornar-se a "ultima". Ler continua a ser possível (restaurar uma BD que falte). `npm run copias` não
// passa por aqui.
const s3ForaDeProducao = !config.producao && configCopias?.destino.tipo === 's3';
if (s3ForaDeProducao) {
  console.warn(
    'COPIAS_DESTINO=s3 fora de produção: o servidor não faz cópias automáticas nem a cópia antes de migrar ' +
      '(o balde é o da produção). Para isso usa "npm run copias".',
  );
}

try {
  // Antes de abrir a BD: restaura (se faltar e RESTAURAR_AO_ARRANCAR) ou copia antes das migrações. Com s3
  // fora de produção só se passa a config quando a BD falta (restaurar ou recusar só leem o destino).
  const configPreparar = s3ForaDeProducao && existsSync(config.bd) ? null : configCopias;
  await prepararBd(config.bd, configPreparar, process.env);
} catch (erro) {
  desistir('Não foi possível preparar a base de dados', erro);
}

const bd = abrirBd(config.bd);
const configAutomaticas = s3ForaDeProducao ? null : configCopias;
const copias = iniciarCopias(bd, configAutomaticas, { producao: config.producao });
const eventos = criarCanalEventos();
const pararLimpeza = config.modo === 'entra' ? iniciarLimpezaSessoes(bd) : () => {};
const temCliente = existsSync(join(PASTA_CLIENTE, 'index.html'));
const app = criarApp({
  bd,
  pastaCliente: temCliente ? PASTA_CLIENTE : undefined,
  anfitrioes: config.anfitrioes,
  auth: config,
  eventos,
  copias,
  commit: process.env.RENDER_GIT_COMMIT?.trim() || undefined,
});

const servidor = serve({ fetch: app.fetch, port: config.porta, hostname: config.host }, (info) => {
  if (config.modo === 'entra') {
    console.log(`Modo entra (login Microsoft). Endereço público: ${config.enderecoPublico}`);
    if (config.entra.permitirHttp) console.log(`Fornecedor de login de TESTE: ${config.entra.emissor}`);
    if (!config.utilizadoresPermitidos) {
      console.warn(
        'Sem UTILIZADORES_PERMITIDOS: só a atribuição no Entra decide quem entra (em produção é obrigatória).',
      );
    }
  } else {
    console.log('Modo local (sem login): só este computador.');
  }
  console.log(`Servidor à escuta em ${config.host}:${info.port} (http://localhost:${info.port})`);
  console.log(
    `Cópias de segurança: ${configAutomaticas ? `ativas (${configAutomaticas.destino.tipo})` : 'desligadas'}.`,
  );
  if (!temCliente) console.log('Sem build do browser: abre o Vite em http://localhost:5173 (npm run dev).');
  if (contarPessoas(bd) === 0) console.warn('Base de dados vazia: corre npm run importar -- --aplicar');
});

servidor.on('error', (erro: NodeJS.ErrnoException) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(`A porta ${config.porta} já está ocupada (o servidor já está a correr noutra janela?).`);
  } else {
    console.error('O servidor não arrancou:', erro.message);
  }
  eventos.fechar();
  copias.parar();
  pararLimpeza();
  bd.$client.close();
  process.exit(1);
});

let aEncerrar = false;

function encerrar(): void {
  if (aEncerrar) return;
  aEncerrar = true;
  // As ligações do tempo real ficam abertas para sempre: fecham-se primeiro, senão o close não acaba.
  eventos.fechar();
  copias.parar();
  pararLimpeza();
  servidor.close(() => {
    // O better-sqlite3 é síncrono: nenhum pedido está a meio de uma consulta quando isto corre.
    bd.$client.close();
    process.exit(0);
  });
  // Se alguma ligação não fechar, não se fica à espera para sempre.
  setTimeout(() => {
    if (bd.$client.open) bd.$client.close();
    process.exit(0);
  }, 3000).unref();
}

process.once('SIGINT', encerrar);
process.once('SIGTERM', encerrar);
