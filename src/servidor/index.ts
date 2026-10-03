// Arranque do servidor: abre a base de dados, cria a app e fica à escuta na porta da config.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { criarApp } from './app';
import { config } from './config';
import { abrirBd } from './db/ligacao';
import { contarPessoas } from './estado';

/** Build de produção do browser (`npm run build`). Em desenvolvimento quem o serve é o Vite. */
const PASTA_CLIENTE = fileURLToPath(new URL('../../dist/cliente', import.meta.url));

/**
 * M0: sem login, por isso só se aceita ligações do próprio PC (os dados têm telefones e nomes).
 * Quando houver login e alojamento (M1), o endereço passa a vir da config.
 */
const ENDERECO = '127.0.0.1';

/** Nomes pelos quais o próprio PC chega ao servidor (também os do proxy do Vite). */
const ANFITRIOES_LOCAIS = ['localhost', '127.0.0.1', '[::1]'];

const bd = abrirBd(config.bd);
const temCliente = existsSync(join(PASTA_CLIENTE, 'index.html'));
const app = criarApp({
  bd,
  pastaCliente: temCliente ? PASTA_CLIENTE : undefined,
  anfitrioes: ANFITRIOES_LOCAIS,
});

const servidor = serve({ fetch: app.fetch, port: config.porta, hostname: ENDERECO }, (info) => {
  console.log(`Servidor em http://localhost:${info.port}`);
  if (!temCliente) console.log('Sem build do browser: abre o Vite em http://localhost:5173 (npm run dev).');
  if (contarPessoas(bd) === 0) console.warn('Base de dados vazia: corre npm run importar -- --aplicar');
});

servidor.on('error', (erro: NodeJS.ErrnoException) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(`A porta ${config.porta} já está ocupada (o servidor já está a correr noutra janela?).`);
  } else {
    console.error('O servidor não arrancou:', erro);
  }
  bd.$client.close();
  process.exit(1);
});

function encerrar(): void {
  servidor.close();
  // O better-sqlite3 é síncrono: nenhum pedido está a meio de uma consulta quando isto corre.
  bd.$client.close();
  process.exit(0);
}

process.once('SIGINT', encerrar);
process.once('SIGTERM', encerrar);
