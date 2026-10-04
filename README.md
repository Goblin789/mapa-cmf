# Mapa CMF

Mapa do pessoal, carrinhas, casas e obras da CMF S.àr.l: quem mora em que casa, quem vai em que carrinha e
para que obra. Lista lateral, modo de edição com histórico, vistas Tabela e Quadro, exportação para Excel e
modo reunião. Online em `https://mapa.cmf-lux.lu`, com login Microsoft (só o Rafael, o Michael e o João).

## Abrir o mapa no PC

Duplo clique em **Abrir Mapa CMF.cmd** (nesta pasta). Abre uma janela preta que tem de ficar aberta
enquanto se usa o mapa, e o browser abre sozinho em http://localhost:5173. Para parar, fecha-se a janela.

Depois da 1.ª publicação, a BD do PC (`dados/mapa.db`) é **só para testes**: o mapa a sério é o online.

## Correr no PC (pormenores)

Precisa de Node 24.

```bash
npm install
cp .env.example .env          # e ajustar PASTA_ORIGEM se os Excel estiverem noutra pasta
npm run importar              # num PC sem BD: ensaio, gera dados/relatorio-importacao.html, não grava nada
npm run importar -- --aplicar # grava os dados na base de dados local (dados/mapa.db)
npm run dev                   # servidor (porta 8787) + browser (Vite, porta 5173): http://localhost:5173
```

Sem `ENTRA_SEGREDO` no `.env`, o servidor corre sem login e só aceita ligações do próprio PC.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor + browser, com recarga automática. |
| `npm run verificar` | Tipos + lint + testes. Correr antes de dar uma tarefa por terminada. |
| `npm run tipos` · `npm run lint` · `npm test` | Cada parte da verificação. `npm run formatar` corrige a formatação. |
| `npm run build` · `npm start` | Build do browser (`dist/cliente`) e arranque do servidor, como no Render. |
| `npm run importar` | Ensaio da importação dos Excel; `-- --aplicar` grava (recusa se já houver gravações feitas no programa, salvo `--forcar`). |
| `npm run sincronizar` | Ensaio da sincronização **não destrutiva** dos dados iniciais (clientes, casas, veículos, locais); `-- --aplicar` grava num lote do histórico; `--bd` e `--relatorio` para trabalhar numa cópia. |
| `npm run geocodificar` | Coordenadas das moradas de `dados-iniciais/locais.json`. |
| `npm run bd:gerar` | Migração nova depois de mudar `src/servidor/db/esquema.ts`. |
| `npm run copias -- chave\|fazer\|listar\|verificar\|restaurar` | Cópias de segurança (`docs/recuperar.md`). |
| `npm run login-falso` | Fornecedor de login falso, para experimentar o login no PC sem a Microsoft. |
| `npm run publicar` | Publica no Render a versão do `main` (ver abaixo). |

## Publicar

Guia da 1.ª publicação (GitHub, Render, Entra, cópias, domínio, vigilância) e das seguintes:
**`docs/publicar.md`**. Em resumo, com o código no `main` e no GitHub:

```bash
npm run publicar -- --esperar
```

Nunca de terça às 18:00 a quarta às 12:00 (reunião de quarta), nem no quarto de hora antes: o comando recusa.

## Recuperar

Cópias de segurança cifradas, restauro e ensaio de recuperação: **`docs/recuperar.md`**.

## Variáveis de ambiente

No PC ficam no `.env` (nunca vai para o git; modelo em `.env.example`); no Render, em **Environment**. Lista
completa em **`docs/m1.md`**. Segredos só no `.env`, no Render e no gestor de palavras-passe.

## Onde está o quê

- `docs/` — especificação, proposta, decisões (`decisoes.md`), desenho do M1 (`m1.md`), publicar, recuperar.
- `dados-iniciais/` — clientes, casas, carrinhas e locais (sem dados pessoais).
- `dados/` — base de dados e relatórios locais. **Nunca vai para o git.**
- `src/dominio/` — regras puras (contadores, cores, lotação, pesquisa) e os tipos da API.
- `src/servidor/` — servidor (Hono), base de dados, login (`auth/`), tempo real e cópias (`copias/`).
- `src/cliente/` — o que corre no browser (mapa, lista, edição, vistas, entrada).
- `src/importacao/` — leitura dos Excel e sincronização dos dados iniciais.
- `src/publicacao/` — regras do `npm run publicar` (janela da reunião, git, Deploy Hook, `/api/saude`).
- `scripts/` — os comandos `npm run …`.
- `render.yaml` — o serviço no Render. `.github/workflows/` — verificação de cada push e vigilância de hora a hora.
