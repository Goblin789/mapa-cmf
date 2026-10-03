# Mapa CMF

Mapa do pessoal, carrinhas, casas e obras da CMF.

## Correr no PC

Precisa de Node 24.

```bash
npm install
cp .env.example .env          # e ajustar PASTA_ORIGEM se os Excel estiverem noutra pasta
npm run importar              # ensaio: gera dados/relatorio-importacao.html, não grava nada
npm run importar -- --aplicar # grava os dados na base de dados local (dados/mapa.db)
npm run dev                   # abre em http://localhost:5173
```

## Verificar antes de entregar

```bash
npm run verificar
```

## Onde está o quê

- `docs/` — especificação, proposta, decisões.
- `dados-iniciais/` — clientes, casas, carrinhas e locais (sem dados pessoais).
- `dados/` — base de dados e relatórios locais. **Nunca vai para o git.**
- `src/dominio/` — regras (contadores, cores, lotação, pesquisa).
- `src/servidor/` — servidor e base de dados.
- `src/cliente/` — o que corre no browser (mapa, painéis).
