// Sessões do login, à mão: ver quem tem sessão aberta e terminá-las sem reiniciar o servidor.
//
//   npm run sessoes -- listar                     # quem tem sessões (e-mail, nome, quantas, último uso)
//   npm run sessoes -- terminar <email>           # termina as sessões dessa pessoa
//   npm run sessoes -- terminar todas             # termina as sessões de toda a gente
//   ... [--bd caminho]                            # outra base de dados (omissão: a do .env, BD)
//
// Pode correr com o servidor ligado (no Render: Shell): no pedido seguinte a pessoa recebe 401 e as
// ligações do tempo real dela caem na revisão de minuto a minuto. Não impede que volte a entrar: para isso
// tira-se o e-mail de UTILIZADORES_PERMITIDOS (ou a atribuição no Entra). Nunca mostra tokens.

import { existsSync } from 'node:fs';
import { resumoSessoes, terminarSessoes } from '../src/servidor/auth/sessoes';
import { config } from '../src/servidor/config';
import { abrirBd } from '../src/servidor/db/ligacao';

const USO = 'Uso: npm run sessoes -- listar | terminar <email>|todas [--bd caminho]';

type Comando = { acao: 'listar'; bd?: string } | { acao: 'terminar'; email: string | null; bd?: string };

function lerArgumentos(args: string[]): Comando | { erro: string } {
  const resto: string[] = [];
  let bd: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--bd') {
      bd = args[++i];
      if (!bd) return { erro: '--bd precisa de um caminho.' };
    } else if (a.startsWith('--')) {
      return { erro: `Argumento desconhecido: ${a}` };
    } else {
      resto.push(a);
    }
  }
  const [acao, alvo, ...mais] = resto;
  if (acao === 'listar' && alvo === undefined) return { acao: 'listar', bd };
  if (acao === 'terminar' && alvo && mais.length === 0) {
    if (alvo === 'todas') return { acao: 'terminar', email: null, bd };
    if (!/^[^@\s]+@[^@\s]+$/.test(alvo)) return { erro: `"${alvo}" não é um e-mail (nem "todas").` };
    return { acao: 'terminar', email: alvo.toLowerCase(), bd };
  }
  return { erro: USO };
}

const lidos = lerArgumentos(process.argv.slice(2));
if ('erro' in lidos) {
  console.error(lidos.erro);
  console.error('Nada foi feito.');
  process.exitCode = 1;
} else {
  const caminho = lidos.bd ?? config.bd;
  // Nunca se cria uma BD vazia por engano (abrirBd cria o ficheiro se não existir).
  if (!existsSync(caminho)) {
    console.error(`A base de dados não existe: ${caminho}. Nada foi feito.`);
    process.exitCode = 1;
  } else {
    const bd = abrirBd(caminho);
    try {
      if (lidos.acao === 'listar') {
        const linhas = resumoSessoes(bd);
        if (linhas.length === 0) console.log('Não há sessões abertas.');
        for (const l of linhas) {
          console.log(`${l.email} (${l.nome}): ${l.sessoes} sessão(ões), último uso ${l.ultimoUsoEm}`);
        }
      } else {
        const n = terminarSessoes(bd, lidos.email);
        console.log(`Sessões terminadas (${lidos.email ?? 'toda a gente'}): ${n}.`);
      }
    } finally {
      bd.$client.close();
    }
  }
}
