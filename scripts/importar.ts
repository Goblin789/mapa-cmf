// Importação dos Excel da pasta de origem (PASTA_ORIGEM no .env). A lógica está em src/importacao/.
//
//   npm run importar               # ensaio: só gera dados/relatorio-importacao.html
//   npm run importar -- --aplicar  # grava na base de dados local (apaga tudo e volta a criar)

import { executarImportacao } from '../src/importacao/executar';

try {
  process.exitCode = await executarImportacao({ aplicar: process.argv.includes('--aplicar') });
} catch (erro) {
  console.error(`A importação falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
}
