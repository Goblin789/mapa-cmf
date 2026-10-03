// Importação dos Excel da pasta de origem (PASTA_ORIGEM no .env). A lógica está em src/importacao/.
//
//   npm run importar                         # ensaio: só gera dados/relatorio-importacao.html
//   npm run importar -- --aplicar            # grava na base de dados local (apaga tudo e volta a criar)
//   npm run importar -- --aplicar --forcar   # idem, mesmo que já haja gravações feitas no programa
//
// Sem --forcar, --aplicar recusa se a base de dados tiver gravações feitas no programa (modo de edição):
// reimportar apagava-as, com o histórico.

import { executarImportacao } from '../src/importacao/executar';

try {
  process.exitCode = await executarImportacao({
    aplicar: process.argv.includes('--aplicar'),
    forcar: process.argv.includes('--forcar'),
  });
} catch (erro) {
  console.error(`A importação falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
}
