# Mapa CMF: proposta técnica para a fase 1

3 out. 2026 · Para decidires antes de se escrever código.
Base: `mapa-cmf.md`, `CMF_Pessoal_lista_mestra.xlsx` e o ficheiro do Michael (`CMF SARL - Casas, Viaturas e Obras…xlsx`).

---

## 1. Resumo

- **Uma só aplicação web em TypeScript.** No browser: React + Leaflet. No servidor: um processo Node pequeno (Hono). Os dados ficam num ficheiro SQLite.
- **Alojamento:** Render, em Frankfurt, por cerca de 7 USD/mês. Cópias de segurança de hora a hora noutro fornecedor (Cloudflare R2, UE).
- **Login:** entra-se com as contas Microsoft da CMF (Entra ID). Só os 3 utilizadores autorizados.
- **Um só mecanismo para todas as mudanças.** Arrastar não grava: as alterações acumulam-se num *rascunho*, que dá o Ctrl+Z, a confirmação antes de gravar e a simulação "e se". Ao gravar vira um *lote* no histórico (quem, quando, o quê), que pode ser agendado para uma data.
- **O código fica fora do OneDrive**, em `C:\dev\mapa-cmf`. Ali, os milhares de ficheiros do `node_modules` e a base de dados davam conflitos de sincronização.
- **A primeira entrega corre só no teu PC**, sem custos: o mapa com os dados reais e um relatório das diferenças entre as folhas, para resolveres.

---

## 2. Tecnologia

| Camada | Escolha | Porquê |
|---|---|---|
| Linguagem | TypeScript em tudo (browser, servidor, scripts, testes) | Uma só linguagem. Os tipos apanham erros quando se mexe em código antigo. |
| Interface | React 19 + Vite, Tailwind, Zustand (estado do rascunho e da seleção) | É a base mais comum para ecrãs muito interativos e a mais segura para manter com o Claude Code. |
| Mapa | Leaflet 1.9.4 + OpenStreetMap, limitado ao Luxemburgo, França, Bélgica e Alemanha | Gratuito e estável. É o que o documento pede. |
| Casas, carrinhas e obras no mapa | Camada própria por cima do Leaflet, com a posição de cada cartão calculada por uma função testada | Os marcadores normais do Leaflet não resolvem 8 casas na mesma rua de Himeling nem o arrastar entre cartões. |
| Arrastar | Protótipo no início da etapa de edição: dnd-kit vs. motor próprio (pointer events), testado em telemóveis reais. "Mover para…" existe sempre como alternativa. | Arrastar sobre um mapa que se mexe é a parte mais arriscada. Decide-se com testes, não no papel. |
| Servidor | Node 24 LTS + Hono + Zod, num só processo (API, tempo real, mudanças agendadas, páginas) | Sem peças extra para gerir. |
| Base de dados | SQLite com better-sqlite3 13 e Drizzle (migrações versionadas) | ~150 pessoas e 3 utilizadores cabem num ficheiro. Sem servidor de base de dados. |
| Tempo real | SSE: o servidor avisa "há versão nova" e o browser volta a pedir o estado (~50 KB) | Quando um grava, os outros dois veem em segundos. Simples e robusto em rede móvel. |
| Login | Better Auth + Microsoft Entra ID, só o tenant CMF; os 3 atribuídos diretamente à aplicação; identificados pelo ID Microsoft, não pelo e-mail | Sem palavras-passe novas. A MFA é a da Microsoft. Plano B: e-mail + palavra-passe. |
| Alojamento | Render, Frankfurt: serviço "Starter" + disco 1 GB (≈ 7,25 USD/mês) | Plataforma gerida: não há servidor Linux para administrar. Só publica se os testes passarem. |
| Domínio | `mapa.cmf-lux.lu` (um registo no DNS da empresa). Até lá, `….onrender.com` | HTTPS automático. |
| Backups | Cópia de hora a hora e antes de cada migração, cifrada, para o Cloudflare R2 (jurisdição UE, gratuito até 10 GB). Chave de cifra no gestor de palavras-passe da empresa. | Há cópia noutro fornecedor desde o 1.º dia de uso real. A recuperação é ensaiada antes de largar o Excel. |
| Vigilância | Página `/saude` + monitor externo que avisa por e-mail (servidor em baixo, backup com mais de 3 h) | Nenhuma falha fica silenciosa. |
| Excel | read-excel-file (importar), write-excel-file (exportar com as cores dos clientes) | Pequenas e mantidas. O ExcelJS está parado desde 2024. |
| Geocodificação | Uma vez por morada (geoportail.lu para o Luxemburgo, IGN para França, Nominatim para o resto) e pino corrigível à mão | São 15 moradas. Não justifica um serviço pago. |
| GPS | Cliente do Reveal só no servidor (token de ~20 min, `fim.api.eu.fleetmatics.com`), com o CSV do relatório detalhado como alternativa | As credenciais nunca chegam ao browser. |
| Qualidade | Vitest (regras), Playwright (rato, toque, 2 utilizadores ao mesmo tempo), GitHub Actions, repositório GitHub privado | Rede de segurança antes de cada publicação. |

**Custo mensal:** cerca de 7 USD. Atenção: no plano barato do Render a conta só tem 1 membro. Para o Michael também gerir há duas opções: uma conta da empresa partilhada pelo gestor de palavras-passe, ou o plano de equipa (+25 USD/mês).

**Postas de parte:**
- Azure + PostgreSQL: 4 a 5 vezes mais caro e com vários serviços para gerir.
- Servidor próprio (Hetzner): alguém teria de administrar Linux.
- Next.js: complexidade sem ganho para 3 utilizadores.
- Modelo temporal completo em PostgreSQL: difícil de diagnosticar para quem não programa.

---

## 3. Estrutura do projeto

```text
C:\Users\Kr4ke\CMF S.àr.l\Rafael\MAPA CMF\   documentos e Excel (fica como está)

C:\dev\mapa-cmf\               o código, com git → GitHub privado
├─ CLAUDE.md                   regras do projeto para o Claude Code (todas as gravações passam por
│                              "gravar lote"; nunca guardar motivo de ausência nem GPS fora de locais conhecidos)
├─ README.md                   em português: correr no PC, publicar, recuperar um backup
├─ package.json  .node-version  render.yaml  .env.example   (o .env verdadeiro nunca vai para o git)
├─ docs/                       especificação, decisões (com as tuas respostas), modelo de dados, rgpd/
├─ dados-iniciais/             clientes, cores, casas, carrinhas e lugares (do documento; sem dados pessoais)
├─ scripts/                    importar (--ensaio / --aplicar), geocodificar, backup, restaurar
├─ src/
│  ├─ dominio/                 regras puras, iguais no browser e no servidor: operações, contadores,
│  │                           avisos, cores, mudanças agendadas, filtro do GPS
│  ├─ servidor/                login, API, tempo real, gravar lote, agendador, backups, Reveal
│  └─ cliente/
│     ├─ mapa/                 camada de cartões, níveis de zoom, Himeling, linhas de foco
│     ├─ arrastar/             seleção múltipla, arrastar, toque longo, "Mover para…"
│     ├─ paineis/              contadores, legenda, caixas laterais, rascunho, pesquisa
│     ├─ fichas/               pessoa, casa, carrinha, oficina
│     └─ vistas/               lista, tabela, quadro, histórico, agendadas, obras sugeridas, reunião
├─ testes/                     Vitest + Playwright
└─ dados/                      (fora do git) base de dados local
```

---

## 4. Modelo de dados

| Entidade | Guarda | Nota |
|---|---|---|
| Pessoa | id interno, Nº (como no Excel), apelidos, nome, nome curto, telefone, carta sim/não + validade, cliente, obra, casa, carrinha, ativa | Existe uma só vez. Casa vazia = "Fora das casas CMF"; carrinha vazia = "Sem transporte". |
| Indisponibilidade | pessoa, de, até | Sem motivo e sem campo de texto, de propósito. |
| Cliente | nome, cor, sigla, interno sim/não | |
| Local | tipo (casa, obra, estacionamento, oficina, escritório, bomba, Drusenheim), morada, coordenadas, raio | Uma morada partilhada é um só local com várias casas. É também a lista de "locais conhecidos" do GPS. |
| Casa | nome, local, apartamento, lotação, máximo do contrato, tolerado, senhorio, equipamento | |
| Obra | nome, cliente, local, estacionamento, origem (GPS/manual) | |
| Carrinha | matrícula, modelo, lugares, onde dorme, n.º no Reveal, datas de CT/revisão/correia, temporária sim/não | O carro de substituição é uma carrinha "temporária", com os seus lugares. |
| Condutor | carrinha, pessoa, de/até (com hora) | Período: a fase 2 vai perguntar "quem conduzia a CF5008 no dia X às 7h40" (multas). |
| Estado da carrinha | oficina/parada, de/até, substituta | Os ocupantes continuam ligados à original. Quando ela volta, não se mexe em ninguém. |
| Problema | casa ou carrinha, texto, aberto/resolvido, quem, quando | |
| Lote + Alteração | autor, quando, estado (aplicado/agendado/cancelado/falhou), data efetiva; e por campo: antes → depois | O histórico só se acrescenta, exceto na limpeza de dados antigos (o valor passa a "[apagado]"). |
| Sugestão de obra | centro, raio, n.º de dias, morada, cliente provável, expira em | Ver secção 6. |
| Utilizador | ID Microsoft, nome, papel | |

**Decisões não óbvias:**
- **Estado atual + histórico.** As tabelas guardam como está hoje, que é fácil de ler. O histórico de lotes responde a "quem mudou o quê" e permite "Reverter".
- **Mudança agendada = lote com data futura.** O servidor aplica-o quando chega a data: verifica ao arrancar e de 10 em 10 minutos, e cada lote só se aplica uma vez. "Até [data]" cria também o regresso.
- **Simulação = rascunho que nunca se envia.** Usa a mesma função de cálculo que o servidor, por isso o "e se" dá exatamente o que a gravação dará.
- **Conflitos entre os 3.** Cada operação leva o valor de partida ("da CF5008 para a CF5011"). Se outra pessoa já tinha mudado, o servidor recusa só essa parte e explica quem mudou e quando.
- **Calculados, nunca guardados.** A cor de cada pessoa é a do cliente da obra ou, enquanto não há obra, a do cliente da pessoa. Também se calculam as cores de lotação e os avisos de contrato, CT e carta.
- **Dois números por casa:** lotação (moradores + vagas) contra o máximo do contrato e o tolerado. Aviso simples acima do máximo e forte acima do tolerado. Exemplo: Steinsel 12/8.
- **Id interno próprio.** O Nº mantém o sufixo: 865-017 (Marco Couto) e 865-017_3 (Marco Lobo) são pessoas diferentes. 13 pessoas não têm Nº.

---

## 5. Ecrã principal (como vai funcionar)

- **Cartões:** a casa com telhado, a carrinha vista de cima com a matrícula, a obra com uma faixa da cor do cliente. O tamanho depende dos lugares, não de quem lá está, para os cartões não "saltarem".
- **Três níveis de zoom:**
  - afastado: um ícone com "9/10";
  - médio: um quadradinho por lugar;
  - perto: os nomes.

  Carregar num cartão abre-o com os nomes em qualquer zoom.
- **Himeling:** 8 casas em 2 moradas, a ~300 m uma da outra. Cada morada é um cartão de grupo, com as carrinhas que lá dormem por baixo. Afastado, aparece só "Himeling: 8 casas". Há também uma lupa fixa num canto do mapa.
- **Cores:** cada nome tem o fundo da cor do cliente e uma sigla de 2 letras, porque os três azuis se confundem num projetor. A lotação (verde/laranja/vermelho) vai no contorno e no número do cartão, nunca no fundo dos nomes: a Costantini já é laranja e a Phillipe já é verde.
- **No PC:**
  - clique, Ctrl+clique, Shift+clique e caixa de seleção;
  - arrastar leva a seleção toda;
  - o alvo mostra o resultado antes de largar ("CF5005: 6 + 3 = 9/9");
  - perto da borda o mapa desliza sozinho;
  - Esc cancela.
- **No telemóvel:**
  - o dedo continua a mover o mapa; só um toque longo (~350 ms) "levanta" o nome;
  - as caixas laterais ficam em abas no fundo do ecrã;
  - "Mover para…" (lista pesquisável de destinos com os lugares livres) é o caminho garantido.
- **Rascunho:** uma barra "4 alterações por gravar" com Ctrl+Z, contadores com a diferença (Livres 12 → 10) e "Gravar…". Gravar mostra a lista de alterações e os avisos, e deixa gravar agora ou agendar para uma data.
- **Oficina:** marcar uma carrinha "na oficina" sem substituta abre logo um painel com quem ficou sem transporte e as carrinhas próximas com lugares.
- **Outros:**
  - contadores no topo, que filtram ao carregar;
  - legenda clicável;
  - pesquisa com acentos indiferentes;
  - foco pessoa → casa → carrinha → obra;
  - vistas Lista, Tabela e Quadro (colunas como as folhas do Michael), exportáveis para Excel;
  - modo reunião em ecrã inteiro.

---

## 6. GPS → obras, e privacidade

**A tensão.** Para descobrir obras é preciso olhar para paragens em sítios que ainda não se conhecem. O documento diz que tudo o que está fora de locais conhecidos é descartado antes de ser guardado.

**Proposta:**
1. **Quando corre.** A análise só corre quando carregas em "Procurar obras". Corre em memória no servidor, como tarefa em segundo plano com barra de progresso. O CSV também se carrega na própria aplicação e não fica gravado.
2. **O que se descarta logo:**
   - segmentos marcados como privados no Reveal;
   - fins de semana e feriados;
   - paragens com menos de 3 h;
   - paragens que atravessam a noite;
   - paragens dentro de um local conhecido: casas, oficinas, escritório, bombas, Drusenheim, obras e parques já registados.

   Sem o escritório e as oficinas registados, a análise não corre: foi essa falta que estragou a tentativa anterior.
3. **O que pode sobreviver.** Só grupos de paragens num raio de ~150 m vistos em 3 ou mais dias diferentes nas últimas 8 semanas.
4. **O que se guarda de cada sugestão:** centro, raio, n.º de dias, morada e cliente provável (calculado a partir do plano). **Nunca se guardam** pontos, trajetos, horas, dias concretos nem qual carrinha parou onde. A sugestão apaga-se quando decides, ou ao fim de 30 dias.
5. **Ecrã "Obras sugeridas":**
   - confirmar (com nome e cliente);
   - juntar a uma obra existente;
   - "é o parque da obra X";
   - apagar.

   Uma obra confirmada passa a local conhecido.

**Ordem legal (não é parecer jurídico).** Ler o histórico de GPS para uma finalidade nova já pode contar como tratamento de dados de localização de trabalhadores (art. L.261-1 do Código do Trabalho do Luxemburgo). Antes da 1.ª análise com dados reais:
- os trabalhadores e a delegação do pessoal recebem a informação prévia;
- passa o prazo em que a delegação pode pedir parecer à CNPD.

Eu redijo os textos em `docs/rgpd/`; alguém da CMF valida. **Entretanto as obras criam-se à mão** (por morada ou clicando no mapa) e nada mais fica à espera. Até lá, o teste à API do Reveal só confirma o token e lê a lista de viaturas, sem posições.

---

## 7. Etapas da fase 1

| Etapa | Conteúdo | O que já usas no fim |
|---|---|---|
| **M0: mapa no teu PC** | Projeto, git e testes. Importação em modo de ensaio, com relatório de discrepâncias. Geocodificação. Mapa só de leitura com os dados reais (zoom, Himeling, cores, contadores). | Vês o mapa real e decides as discrepâncias (secção 8c). Sem custos e sem nada publicado. |
| **M1: online para a reunião** | Render, domínio, login Microsoft, backups externos + ensaio de recuperação, `/saude`. Importação definitiva. Pesquisa, fichas (leitura), Lista/Tabela/Quadro + Excel, modo reunião só de leitura. | Os 3 entram no PC e no telemóvel. A reunião de quarta faz-se no ecrã grande. O Excel ainda se mantém. |
| **M2: editar** | Primeiro, o protótipo de arrastar testado nos vossos telemóveis. Depois: seleção múltipla, arrastar, "Mover para…", rascunho/desfazer/confirmar, histórico/reverter, tempo real, fichas editáveis, indisponível, problemas, obras manuais. | O mapa passa a ser a fonte única e o Excel deixa de ser mantido. |
| **M3: frota e planeamento** | Estados da carrinha, substituta, condutor, avisos de CT/revisão/correia, painel da oficina, mudanças agendadas, simulação, modo reunião completo. | Exceções do dia e plano da semana seguinte feitos no programa. |
| **M4: obras pelo GPS** | Ecrã de locais conhecidos, cliente Reveal + CSV, filtro de privacidade, "Obras sugeridas", foco na obra. Dados reais só depois do passo legal. | Cada pessoa ligada à sua obra: "quem vem para esta obra e de onde". |
| **M5: fecho** | Testes completos, guia de uso, limpezas automáticas de dados, 2.º ensaio de recuperação, ajustes depois de 2–3 semanas de uso. | Fase 1 entregue. Decide-se a fase 2. |

Regra de publicação: nunca publicar na terça à noite nem na quarta de manhã.

---

## 8. O que preciso de ti

Eu não crio contas, não faço pagamentos e não vejo credenciais. Tu colas os segredos diretamente no Render ou no `.env` local, nunca no chat.

### (a) Para arrancar o M0

| # | Pergunta | Se não responderes |
|---|---|---|
| 1 | Aprovas a tecnologia (secção 2) e o alojamento no Render (~7 USD/mês, só a partir do M1)? | Não avanço sem o teu OK. |
| 2 | O código pode ficar em `C:\dev\mapa-cmf`, fora do OneDrive? | Sim. |
| 3 | Repositório no GitHub: tens conta, ou crias uma (idealmente uma organização da CMF)? Até lá fica só git local. | Só git local. |

### (b) Para as etapas seguintes

| Para | Pergunta | Se não responderes |
|---|---|---|
| M1 | Quem administra o Microsoft 365 da CMF? Dá para registar a aplicação "Mapa CMF" no Entra? O Michael e o João têm conta @cmf-lux.lu? | Faço-o contigo passo a passo. Se não der: e-mail + palavra-passe. |
| M1 | Quem gere o DNS de cmf-lux.lu? Pode ser `mapa.cmf-lux.lu`? | Endereço do Render até lá. |
| M1 | Conta do Render: conta da empresa partilhada (gestor de palavras-passe) ou plano de equipa (+25 USD)? Há um gestor de palavras-passe na empresa? | Conta da empresa partilhada. |
| M1 | Reunião: tamanho e resolução do ecrã? | TV a 1920×1080, vista Quadro por omissão. |
| M2 | Telemóveis: iPhone, Android, ou ambos? Posso testar nos vossos? | Um de cada. |
| M2 | Há alguma fonte para os dados que faltam: telefones, carta e validade, condutor de cada carrinha, onde dorme cada carrinha, datas de CT/revisão/correia, senhorios, equipamento? | Folha-modelo para o Michael/João preencherem, importada com pré-visualização. |
| M2 | "Indisponível" liberta o lugar só na carrinha, ou também a cama na casa? | Só na carrinha. Na casa fica marcado, sem libertar a cama. |
| M2 | Pode pôr-se gente a mais numa casa ou carrinha (fica a vermelho e avisa)? | Sim, avisa mas não bloqueia. |
| M3 | Avisos de CT, revisão e correia: as datas e os km escrevem-se à mão, ou vêm do Reveal? | À mão, na ficha. |
| M4 | Moradas do escritório, das oficinas habituais e das bombas habituais. | A análise não corre sem elas. |
| M4 | GPS: quantos trabalhadores tem a CMF no total? Existe delegação do pessoal? Quem valida a nota aos trabalhadores (fiduciária, advogado)? | Obras só à mão até haver resposta. |
| M4 | Reveal: o "Vehicle Number" é a matrícula? Quantos dias de histórico cobre o vosso plano? | Associo pela matrícula. O que não bater, associas tu. |

### (c) Dados: discrepâncias entre a lista mestra, o documento e o ficheiro do Michael

| # | Pergunta | Se não responderes |
|---|---|---|
| 1 | As pendências do documento estão todas marcadas [x], mas as respostas não estão no Excel. Preciso de: carrinha do Francisco Vieira, Luís Carvalho e Gabriel Soares; quem vai na CF5003 e na CF5005; que apartamento é cada casa de Himeling (Casas 3/4 = Ap. 4 ou 5? Casas 2/6/7 = C, D e qual?). | Ficam como estão no Excel, marcados "a confirmar". |
| 2 | Não há folha "Viaturas" com lugares em nenhum dos dois Excel. Uso os lugares da tabela do documento? E os lugares incluem o condutor (a CF5008 tem 9 lugares e 9 pessoas)? | Sim e sim. |
| 3 | A VD6376 (nos dois Excel: José Teixeira, Joel Monteiro, José Té) e a YT7579 (no documento: Hyundai, 5 lugares, 3 pessoas) são a mesma carrinha? Qual é a matrícula atual? | Mesma carrinha, VD6376, "a confirmar". |
| 4 | Os 11 da folha "Não estão na lista" entram? O ficheiro do Michael já os conta (143 por cliente). Se entrarem, o total passa a 147 e ficam cheias a Casa 1 Puttelange (10/10), a Casa 7 Forêt (4/4), Schifflange (2/2), a CF5001 (9/9), a LN8786 (5/5) e a XN4293 (7/7). | Entram todos, sem Nº, com "ficha incompleta". |
| 5 | Na folha de casas do Michael há 8 nomes a salmão sem casa: Sérgio Costa, Moisés Varela, Gilson Sanca, Diogo Barbosa, Miguel Gomes, Jorge Pereira, Rui Ferreira e Diogo Vieira. O que querem dizer: à espera de casa, a sair, outra coisa? | "Fora das casas CMF", marcados "a confirmar". |
| 6 | "Rui Ferreira" (Michael) = "Rui Mendes Ferreira" (lista)? O que quer dizer estar a vermelho (Rui Mendes Ferreira, Diogo Vieira)? | Mesma pessoa. O vermelho é ignorado. |
| 7 | O Rogério Oliveira (Casa 1) não tem carrinha. | "Sem transporte", marcado "a confirmar". |
| 8 | "Nélson Esteves" (lista) = "Nélson Mendes" (Michael)? | Sim. Fica Esteves, e Mendes também se encontra na pesquisa. |
| 9 | A folha do Michael chama-se "CASAS APÓS CONGÉ". É o plano para depois das férias ou a situação de hoje? Quando as duas diferem, qual manda? | Manda a lista mestra (02/10). A do Michael só serve para cruzar. |
| 10 | O Enquadramento ("NÃO PRODUTIVOS" no Michael) é um cliente com obras ou um grupo interno? | Grupo interno, com cor própria, nunca proposto como cliente de uma obra do GPS. |
| 11 | Contratos: "6 a 8" quer dizer máximo 6 e tolerado 8? "Não fixado" e "—" ficam sem aviso? | Sim e sim. |
| 12 | Nº: posso tirar os espaços ("865- 372_2" → "865-372_2"), mantendo o sufixo? | Sim, e guardo também o original. |
