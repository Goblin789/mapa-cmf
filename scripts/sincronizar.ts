// Sincronização NÃO destrutiva dos dados iniciais (dados-iniciais/{clientes,casas,carrinhas,locais}.json)
// com a base de dados. A lógica está em src/importacao/sincronizar.ts.
//
//   npm run sincronizar                              # ensaio: diz o que muda e gera dados/relatorio-sincronizacao.html
//   npm run sincronizar -- --aplicar                 # grava: uma transação e um lote no histórico
//   npm run sincronizar -- --bd dados/outra.db       # outra base de dados (por omissão a do .env, BD)
//   npm run sincronizar -- --relatorio dados/x.html  # outro relatório (ex.: ao ensaiar numa cópia)
//   npm run sincronizar -- --aplicar --usar-json casa:<id>:lotacao   # aplica o valor do JSON num campo
//                                                    # que foi mudado no programa (repetível)
//
// Nunca apaga as edições feitas no programa (pessoas, condutores, onde dormem as carrinhas, histórico):
// só os veículos que saem da frota deixam as pessoas que lá iam "sem transporte" e "a confirmar".
// Um campo dos JSON mudado no programa nunca é desfeito: fica o valor do programa ("Ficou o valor do
// programa" no relatório), a não ser com --usar-json. Recusa se uma casa ou um veículo que sai tiver
// problemas por resolver.
// Correr de novo sem mudar os JSON não muda nada (nem cria lote).
// Um argumento desconhecido (ex.: "--db") é erro e não se faz nada: nunca se cai na base de dados por omissão.

import { executarSincronizacao, lerArgumentosSincronizacao } from '../src/importacao/executarSincronizacao';

try {
  const lidos = lerArgumentosSincronizacao(process.argv.slice(2));
  if ('erro' in lidos) {
    console.error(lidos.erro);
    console.error('Nada foi lido nem gravado.');
    process.exitCode = 1;
  } else {
    process.exitCode = executarSincronizacao(lidos.opcoes);
  }
} catch (erro) {
  console.error(`A sincronização falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
}
