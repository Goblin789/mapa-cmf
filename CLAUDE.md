# Mapa CMF — regras do projeto

Aplicação web para a CMF gerir, num mapa, quem mora em que casa, quem vai em que carrinha e para que obra.
Especificação: `docs/especificacao.md`. Proposta técnica aprovada: `docs/proposta-fase1.md`.
Decisões e respostas do Rafael: `docs/decisoes.md` (atualizar sempre que ele decidir algo).
M1 (login, tempo real, cópias, vistas, publicação): desenho e variáveis em `docs/m1.md`; publicar em
`docs/publicar.md`; recuperar cópias em `docs/recuperar.md`.

## Língua
- Interface, mensagens, comentários, nomes de ficheiros, variáveis e funções em **português europeu**
  (telemóvel, ecrã, utilizador, guardar/gravar). Termos técnicos consagrados podem ficar em inglês.

## Comandos
- `npm run dev` — servidor (porta 8787, `node --watch`) + browser (Vite, porta 5173, com proxy de /api).
  Atalho no PC: `Abrir Mapa CMF.cmd`. Sem `ENTRA_SEGREDO` no `.env` é o **modo local** (sem login, só o
  próprio PC, autor 'local'); com ele é o **modo entra** (login Microsoft). Ver `docs/m1.md`.
- `npm run verificar` — tipos + lint + testes. Correr antes de dar uma tarefa por terminada.
- `npm run build` + `npm start` — produção (o browser em `dist/cliente`; o servidor com tsx em HOST:PORT).
- `npm run login-falso [-- --porta N]` — fornecedor OpenID falso para experimentar o login no PC (mostra as
  variáveis a usar). Recusado em produção.
- `npm run copias -- chave|fazer|listar|verificar|restaurar` — cópias de segurança cifradas (`docs/recuperar.md`).
- `npm run sessoes -- listar | terminar <email>|todas [--bd caminho]` — sessões de login abertas.
- `npm run publicar [-- --esperar]` — publica no Render pelo Deploy Hook; recusa de terça 17:45 a quarta 12:00.
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
  `tipos.ts` é o contrato do estado (`Estado`); `api.ts` o dos pedidos (Utilizador, EventoLote, saúde…).
- `src/servidor/` — Hono em Node 24. `GET /api/estado` devolve o estado inteiro (é pequeno).
  - `config.ts` — modos local/entra e todas as variáveis (`obterConfigServidor`, sem efeitos ao importar).
  - `auth/` — login Entra ID (openid-client, código + PKCE), sessões no SQLite (só o hash do token),
    rotas `/api/auth/*`, fornecedor falso para testes.
  - `eventos.ts` — tempo real (SSE em `GET /api/eventos`).
  - `copias/` — cópias cifradas (AES-256-GCM) para uma pasta ou S3 (Cloudflare R2), retenção, restauro
    verificado, cópia antes de migrar e restauro ao arrancar.
- `src/importacao/` + `scripts/importar.ts` — leitura dos Excel e relatório de discrepâncias.
- `src/cliente/` — React 19 + Vite + Tailwind + Zustand (`estado/loja.ts`). O mapa é Leaflet com uma
  camada própria de cartões (`mapa/`); as posições dos cartões são funções puras em `mapa/layout/`.
  `entrar/` (ecrã de entrada, sessão, menu), `tempoReal/` (EventSource e avisos), `vistas/` (Tabela, Quadro,
  Excel, modo reunião).
- `src/publicacao/` + `scripts/publicar.ts`, `render.yaml`, `.github/workflows/` — publicação e vigilância.
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
- Todas as gravações passam por um lote com histórico (`lotes` + `alteracoes`).
- Nunca editar uma migração já aplicada: criar uma nova.
- **Depois de publicado, a BD verdadeira é a do Render**; a `dados/mapa.db` do PC passa a ser só de testes.
  Nunca correr `importar`/`sincronizar --aplicar` na produção sem ensaio e cópia antes.
- **Publicar** só fora da janela da reunião (terça 17:45 – quarta 12:00) e só com `npm run publicar`.

## Estado atual
M1 construído e ensaiado localmente (ainda não publicado): mapa com cartões ao estilo pedido pelo Rafael,
camadas, lista lateral, **modo de edição** (rascunho, arrastar, Mover para…, Guardar/Cancelar, histórico),
**login Microsoft** (aplicação "Mapa CMF" no Entra), **tempo real**, **vistas Tabela e Quadro**, **Excel**,
**modo reunião** e **cópias de segurança**.
- A Tabela e o Quadro editam como o mapa (ficha, pesquisa, seleção, arrastar, células) e nada muda de vista
  sozinho: só o "Ver no mapa" da ficha leva ao Mapa (`docs/vistas-edicao.md`, `vistas/mostrar.ts`).
- `POST /api/lotes` grava tudo ou nada (409 se alguém mudou as mesmas pessoas ou carrinhas); operações
  `mover`, `condutor` e `dormida`. Autor = e-mail (UPN) de quem tem sessão; 'local' no modo local.
  O histórico mostra o nome (`autorNome`).
- Se a sessão termina a meio de uma edição, o rascunho fica guardado no browser e volta depois de entrar.
- Os contadores (Livres nas casas, Sem transporte…) já não aparecem no ecrã (04/10/2026); `dominio/contadores.ts`
  continua a calcular (a legenda do Mapa usa `pessoasPorCliente`). Filtros de escolha múltipla: `comum/FiltroMultiplo.tsx`.
- Todos os nomes têm o mesmo texto (`COR_TEXTO_NOMES`); as cores dos clientes são claras (ver `docs/cores.md`).
- Tipos da API em `src/dominio/api.ts`; formato das matrículas em `src/dominio/matricula.ts`.
