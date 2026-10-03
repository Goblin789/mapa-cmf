# Mapa CMF — regras do projeto

Aplicação web para a CMF gerir, num mapa, quem mora em que casa, quem vai em que carrinha e para que obra.
Especificação: `docs/especificacao.md`. Proposta técnica aprovada: `docs/proposta-fase1.md`.
Decisões e respostas do Rafael: `docs/decisoes.md` (atualizar sempre que ele decidir algo).

## Língua
- Interface, mensagens, comentários, nomes de ficheiros, variáveis e funções em **português europeu**
  (telemóvel, ecrã, utilizador, guardar/gravar). Termos técnicos consagrados podem ficar em inglês.

## Comandos
- `npm run dev` — servidor (porta 8787, `node --watch`) + browser (Vite, porta 5173, com proxy de /api).
  O servidor só aceita ligações do próprio PC enquanto não houver login (M1).
- `npm run verificar` — tipos + lint + testes. Correr antes de dar uma tarefa por terminada.
- `npm run importar` — importação dos Excel em modo de ensaio (gera `dados/relatorio-importacao.html`);
  `npm run importar -- --aplicar` grava na base de dados local. Recusa se já houver gravações feitas no
  programa (lotes que não são de importação), porque as apagava; só com `--forcar`.
- `npm run sincronizar` — ensaio da sincronização NÃO destrutiva dos dados iniciais (clientes, casas,
  veículos, locais) com a BD (gera `dados/relatorio-sincronizacao.html`); `npm run sincronizar -- --aplicar`
  grava num só lote (autor 'dados-iniciais', tipo 'ficha') do Histórico, sem tocar em condutores, onde
  dormem, pessoas (exceto as de veículos que saem) nem histórico. `--bd <caminho>` e `--relatorio <caminho>`
  para trabalhar numa cópia. É assim que se aplicam dados novos depois de haver edições no programa.
- `npm run geocodificar` — coordenadas das moradas de `dados-iniciais/locais.json`.
- `npm run bd:gerar` — nova migração depois de mudar `src/servidor/db/esquema.ts`.

## Arquitetura
- `src/dominio/` — regras puras, sem I/O, iguais no browser e no servidor. Tudo testado com Vitest.
  `tipos.ts` é o contrato do estado (`Estado`) entre servidor e browser.
- `src/servidor/` — Hono em Node 24. `GET /api/estado` devolve o estado inteiro (é pequeno).
- `src/importacao/` + `scripts/importar.ts` — leitura dos Excel e relatório de discrepâncias.
- `src/cliente/` — React 19 + Vite + Tailwind + Zustand (`estado/loja.ts`). O mapa é Leaflet com uma
  camada própria de cartões (`mapa/`); as posições dos cartões são funções puras em `mapa/layout/`.
- Valores calculados (cor da pessoa, lotação, avisos, contadores) **nunca** se guardam na base de dados.
- A cor de uma pessoa é sempre a do cliente: o da obra, ou o da pessoa enquanto não tem obra.

## Regras que não se quebram
- **Nunca escrever** na pasta de origem do OneDrive (`PASTA_ORIGEM`): só se lê de lá.
- **Dados pessoais fora do git**: nada de telefones, cartas, ausências, GPS nem cópias da lista de pessoal
  no repositório. Os Excel, a base de dados e os relatórios vivem em `dados/` (ignorada pelo git).
  Testes e comentários usam dados fictícios. Nomes reais só onde são indispensáveis para uma decisão
  (`dados-iniciais/importacao.json`, `docs/`).
- **Indisponibilidade**: guarda-se só o estado e as datas, **nunca o motivo** (nem campo de texto livre).
- **GPS**: nenhum ponto fora de um local conhecido é guardado. As credenciais do Reveal só existem no servidor.
- **Segredos** só em `.env` (local) ou nas variáveis do alojamento. Nunca no código nem no chat.
- Todas as gravações (a partir do M2) passam por um lote com histórico (`lotes` + `alteracoes`).
- Nunca editar uma migração já aplicada: criar uma nova.

## Estado atual
Mapa com cartões ao estilo pedido pelo Rafael (casas com telhado, carrinhas vistas de cima, matrícula
luxemburguesa), camadas, lista lateral por casas/carrinhas/obras/clientes e **modo de edição** (rascunho,
arrastar, Mover para…, Guardar/Cancelar, histórico) — tudo local no PC do Rafael. Ainda sem login nem alojamento (M1).
- `POST /api/lotes` grava tudo ou nada (409 se alguém mudou as mesmas pessoas ou carrinhas); operações
  `mover`, `condutor` e `dormida` (onde dorme a carrinha). `GET /api/historico`.
- Todos os nomes têm o mesmo texto (`COR_TEXTO_NOMES`); as cores dos clientes são claras (ver `docs/cores.md`).
  O autor é 'local' e só se aceitam origens localhost até haver login.
- Tipos da API em `src/dominio/api.ts`; formato das matrículas em `src/dominio/matricula.ts`.
