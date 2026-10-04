# Publicar o Mapa CMF

Guia para o Rafael pôr o Mapa online em `https://mapa.cmf-lux.lu` (1.ª publicação) e, depois, publicar
versões novas. Os portais estão em inglês: os nomes dos botões vão **a negrito**, como aparecem lá.
Recuperar a partir das cópias: `docs/recuperar.md`. Todas as variáveis: `docs/m1.md`.

**Regras de ouro**

- **Segredos** (client secret, chave das cópias, chaves do R2, Deploy Hook) só se colam no Render, no `.env`
  do PC e no gestor de palavras-passe. Nunca no chat, no e-mail nem no git.
- **Nunca publicar de terça às 18:00 a quarta às 12:00** (hora do Luxemburgo), nem no quarto de hora antes.
  Com disco, cada publicação deixa o mapa uns segundos em baixo (o Render pára a versão antiga antes de
  arrancar a nova, no fim da construção, uns minutos depois do pedido), e a reunião é à quarta de manhã. O
  `npm run publicar` recusa a partir de terça às 17:45. Mudar variáveis no Render com **Save and deploy**
  também reinicia o mapa: a mesma regra.
- Os passos com comandos no PC podem ser feitos pelo Claude contigo (tu colas os segredos no `.env`).

> **Por decidir — destino das cópias.** O guia usa o **Cloudflare R2 na UE** (já suportado). Se escolheres
> o **SharePoint** da CMF, o passo 2 e as variáveis `COPIAS_S3_*` mudam quando o código o suportar; o resto
> do guia fica igual.

## 1.ª publicação

Tempo: cerca de 2 horas, de preferência numa segunda ou quinta de manhã. Antes de começar, abre o gestor
de palavras-passe: vais guardar lá vários segredos.

### Passo 1 — Código no GitHub (repositório privado)

1. Em github.com: **+** (em cima, à direita) → **New repository**.
   - **Repository name**: `mapa-cmf` · **Private** · sem README, .gitignore nem licença (o projeto já os tem).
   - **Create repository**.
2. No PC, na pasta `C:\dev\mapa-cmf` (troca `<conta>` pela tua conta do GitHub):

   ```bash
   git remote add origin https://github.com/<conta>/mapa-cmf.git
   git push -u origin main
   ```

3. No repositório, separador **Actions**: a verificação **Verificar** deve ficar verde em poucos minutos.

### Passo 2 — Destino e chave das cópias (R2)

1. **Chave das cópias.** No PC: `npm run copias -- chave`. Guarda a chave **em dois sítios** (o gestor de
   palavras-passe e um segundo sítio independente, ex.: em papel, num envelope fechado no cofre). Sem ela as
   cópias não se leem: não há forma de as recuperar (ver `docs/recuperar.md`).
2. **Balde no R2.** Em dash.cloudflare.com → **R2 object storage** (pode pedir para ativar o R2 e um meio de
   pagamento, mesmo no escalão gratuito) → **Create bucket**:
   - nome `mapa-cmf-copias`;
   - em **Location**, escolhe **Specify jurisdiction** → **European Union** (não se pode mudar depois);
   - cria o balde.
3. **Token de escrita (para o Render).** Em **R2 object storage**, ao lado de **API Tokens**, **Manage** →
   **Create Account API token**:
   - nome `mapa-cmf-render`; **Permissions**: **Object Read & Write**, só para o balde `mapa-cmf-copias`;
   - cria o token e guarda no gestor de palavras-passe, com o nome "R2 escrita", o **Access Key ID** e o
     **Secret Access Key** (este só aparece uma vez) e o endpoint **da UE**:
     `https://<id-da-conta>.eu.r2.cloudflarestorage.com` (com `.eu.`: os baldes da UE só se veem por esse
     endereço).
4. **Token de leitura (para o PC).** O mesmo outra vez, com o nome `mapa-cmf-pc` e **Permissions**:
   **Object Read only**, só para o balde `mapa-cmf-copias`. Guarda-o como "R2 leitura". Com ele, o PC lista,
   verifica e restaura cópias, mas nunca as consegue apagar nem estragar (nem por engano, nem um vírus).

### Passo 3 — Client secret no Entra

1. Em entra.microsoft.com → **App registrations** → **Mapa CMF** → **Certificates & secrets** →
   **Client secrets** → **New client secret**.
2. **Description**: `Render`. **Expires**: **180 days (6 months)** — a Microsoft recomenda menos de 12 meses e
   o máximo são 24.
3. **Add** e copia logo o **Value** (não o *Secret ID*): nunca mais aparece. Guarda-o no gestor de
   palavras-passe.
4. **Lembrete no calendário** para 2 semanas antes de expirar: "Renovar o segredo do Mapa CMF" (ver
   [Renovar o client secret](#renovar-o-client-secret)). Se expirar, ninguém consegue entrar no Mapa.

### Passo 4 — Levar a base de dados do PC

A partir daqui **só se edita online**: a BD do PC passa a ser só para testes.

1. Fecha o mapa no PC (a janela preta) e avisa o Michael e o João de que não se edita até ao fim do passo 6.
2. No `.env` do PC (Bloco de Notas), preenche estas linhas com os valores do gestor de palavras-passe (se
   alguma não existir, junta-a; não deixes a mesma variável repetida). Desta vez, com o token **de escrita**:

   ```ini
   COPIAS_DESTINO=s3
   COPIAS_S3_ENDPOINT=https://<id-da-conta>.eu.r2.cloudflarestorage.com
   COPIAS_S3_BALDE=mapa-cmf-copias
   COPIAS_S3_REGIAO=auto
   COPIAS_S3_ID=<Access Key ID de "R2 escrita">
   COPIAS_S3_SEGREDO=<Secret Access Key de "R2 escrita">
   COPIAS_CHAVE=<chave das cópias>
   ```

3. No PC:

   ```bash
   npm run copias -- fazer --motivo pc   # envia a BD do PC, cifrada, para o R2
   npm run copias -- verificar ultima    # lê-a de volta e confirma (pessoas, lotes, versão)
   ```

   Aponta os números que o `verificar` mostra: vais compará-los no passo 6.
4. **Muito importante** — no `.env` (grava-o no fim):
   - põe um `#` no início da linha `COPIAS_DESTINO` (fica `#COPIAS_DESTINO=s3`). O mapa do PC já não escreve
     no balde por si (fora de produção nunca o faz), mas assim nenhum comando do PC lhe mexe sem querer;
   - troca `COPIAS_S3_ID` e `COPIAS_S3_SEGREDO` pelos do token **de leitura** ("R2 leitura"). O de escrita
     fica só no Render e no gestor de palavras-passe.

### Passo 5 — Serviço no Render (Blueprint)

1. Em render.com, entra com a conta da empresa (fica no gestor de palavras-passe; o plano grátis de
   *workspace* só tem 1 membro). Junta um cartão em **Billing**: o serviço e o disco são pagos.
2. **New** → **Blueprint** → liga o GitHub quando o Render pedir (dá acesso só ao repositório `mapa-cmf`) →
   **Connect** ao lado de `mapa-cmf`.
3. **Blueprint Name**: `mapa-cmf` · **Branch**: `main`. O Render lê o `render.yaml` e pede os valores que lá
   não estão:

   | Variável | Valor |
   |---|---|
   | `ENTRA_SEGREDO` | o **Value** do passo 3 |
   | `COPIAS_CHAVE` | a chave das cópias |
   | `COPIAS_S3_ID` / `COPIAS_S3_SEGREDO` | Access Key ID / Secret Access Key de **"R2 escrita"** (passo 2) |
   | `COPIAS_DESTINO` | `s3` |
   | `COPIAS_S3_ENDPOINT` | `https://<id-da-conta>.eu.r2.cloudflarestorage.com` |
   | `COPIAS_S3_BALDE` | `mapa-cmf-copias` |
   | `COPIAS_S3_REGIAO` | `auto` |
   | `ENDERECO_PUBLICO` | `https://mapa-cmf.onrender.com` (provisório; confirma-se no passo 6) |
   | `ANFITRIOES` | `mapa-cmf.onrender.com` (só o nome, sem `https://`) |
   | `UTILIZADORES_PERMITIDOS` | o nome de utilizador Microsoft (UPN) dos três, separados por vírgulas — normalmente o e-mail `@cmf-lux.lu`; confirma em Entra → **Users** → **User principal name** |
   | `RESTAURAR_AO_ARRANCAR` | `ultima` |

4. **Deploy Blueprint**. A 1.ª construção leva uns minutos. Em **Logs** deve aparecer
   `BD restaurada da cópia mapa-…-pc.db.gz.enc (… pessoas, … lotes, versão …)`.
   Se em vez disso o servidor parar com uma destas mensagens, corrige em **Environment** e grava com
   **Save and deploy**:

   | A mensagem começa por… | O que corrigir |
   |---|---|
   | `Configuração inválida:` | A variável que a mensagem diz (`ENTRA_*`, `ENDERECO_PUBLICO`, `ANFITRIOES`, `UTILIZADORES_PERMITIDOS`). |
   | `Configuração das cópias inválida:` | As `COPIAS_*`: falta alguma (em produção o servidor não arranca sem `COPIAS_DESTINO` = `s3`); `COPIAS_S3_ENDPOINT` sem `https://` ou com o nome do balde no fim; `COPIAS_CHAVE` mal copiada (tem 44 caracteres e acaba em `=`). |
   | `Não foi possível preparar a base de dados: Não foi possível restaurar a cópia "ultima":` e depois `S3: … (HTTP 401 …` ou `(HTTP 403 …` | `COPIAS_S3_ID` / `COPIAS_S3_SEGREDO` trocados, ou não são os de "R2 escrita". |
   | … `S3: … (HTTP 404` (ex.: `NoSuchBucket`) | `COPIAS_S3_BALDE` errado, ou o endpoint sem o `.eu.`. |
   | … `A cópia está danificada ou a chave não é a certa.` | `COPIAS_CHAVE` não é a do passo 2. |
   | … `Não há nenhuma cópia` | A cópia do passo 4 não chegou ao balde: repete o passo 4.3 (com o token de escrita) e o passo 4.4. |
   | `Não foi possível preparar a base de dados: A base de dados não existe em /var/data/mapa.db, mas o destino das cópias (s3) já tem …` | Falta `RESTAURAR_AO_ARRANCAR` = `ultima`. |
5. Desliga a sincronização automática do Blueprint, para uma mudança no `render.yaml` nunca reiniciar o mapa
   sozinha: no Blueprint → **Settings** → **Auto Sync**: **No**. (Quando o `render.yaml` mudar, usa
   **Manual Sync**, fora da janela da reunião.)

### Passo 6 — Confirmar o endereço e o login

1. No topo da página do serviço está o endereço `https://….onrender.com`. Se não for
   `https://mapa-cmf.onrender.com`, corrige `ENDERECO_PUBLICO` e `ANFITRIOES` em **Environment** →
   **Save and deploy**.
2. No Entra → **App registrations** → **Mapa CMF** → **Authentication** → separador
   **Redirect URI configuration** → **Add Redirect URI** → **Web** → `https://<serviço>.onrender.com/api/auth/retorno`
   → **Configure** (ou junta-o à lista dos URIs da **Web** e grava).
3. Abre `https://<serviço>.onrender.com/api/saude`: deve dizer `"ok":true` e, em `copias`,
   `"atrasada":false`, com `ultimaCopiaEm` de há poucos minutos (em UTC: o servidor faz uma cópia logo a seguir
   ao 1.º arranque). Se disser `"atrasada":true`, espera um minuto e recarrega; se continuar, o Render não
   consegue escrever no balde: confirma que `COPIAS_S3_ID` e `COPIAS_S3_SEGREDO` são os de "R2 escrita" (em
   **Logs** aparece `Cópia de segurança (arranque) falhou: …`).
4. Abre `https://<serviço>.onrender.com`, entra com a conta Microsoft e confirma que os dados são os do PC
   (os números do passo 4).
5. Em **Environment**, apaga `RESTAURAR_AO_ARRANCAR` e grava com **Save only** (não precisa de reiniciar:
   ela só conta quando não há base de dados).

Isto foi também o **1.º ensaio de recuperação**: a BD saiu cifrada do PC e foi restaurada num disco novo.
Regista-o no fim de `docs/recuperar.md`.

### Passo 7 — Domínio na DonDominio

1. No painel da DonDominio, abre o domínio `cmf-lux.lu` (clicando no nome) → **DNS Zone** → cria um registo
   novo (**Create**; noutra língua do painel: *Zona DNS*, *Nueva*).
2. **Type** `CNAME` · **Host** `mapa` · **Destination** `<serviço>.onrender.com` → grava.
3. Não toques em mais nada (MX e SPF são do e-mail). O registo `mapa` passa à frente do wildcard
   `*.cmf-lux.lu` do parking. Não há registos CAA, por isso o certificado não precisa de mais nada.

### Passo 8 — Domínio no Render

1. No serviço → **Settings** → **Custom Domains** → **+ Add Custom Domain** → `mapa.cmf-lux.lu` → **Save**.
2. **Verify**. Se ainda não verificar, o DNS pode levar algum tempo: volta a tentar mais tarde.
3. O certificado HTTPS é automático (o Render cria-o e renova-o).

### Passo 9 — Mudar para o domínio

1. Em **Environment**: `ENDERECO_PUBLICO` = `https://mapa.cmf-lux.lu` e `ANFITRIOES` = `<serviço>.onrender.com`
   → **Save and deploy** (fora da janela da reunião).
2. Abre `https://mapa.cmf-lux.lu`, entra, confirma os dados. Pede ao Michael e ao João que entrem no PC e
   no telemóvel.
3. No Entra, em **Authentication**, podes apagar o URI `https://<serviço>.onrender.com/api/auth/retorno`
   (já não se usa). Ficam o do domínio e o do `localhost`.

### Passo 10 — Vigilância no GitHub

1. No repositório → **Settings** → **Secrets and variables** → **Actions** → separador **Variables** →
   **New repository variable**: **Name** `ENDERECO_PUBLICO`, **Value** `https://mapa.cmf-lux.lu` →
   **Add variable**.
2. **Actions** → **Vigiar** → **Run workflow**: deve ficar verde e dizer "Tudo bem".
3. E-mails quando falha: na tua conta do GitHub (fotografia, em cima à direita) → **Settings** →
   **Notifications** → **System** → **Actions** → escolhe **Email** e **Only notify for failed workflows** →
   **Save**.

A vigilância corre de hora a hora (ao minuto 17) e falha se o mapa não responder `ok` ou se não houver cópia
há mais de 3 horas. O e-mail de um workflow agendado vai para **quem mexeu por último na linha `cron`** de
`.github/workflows/vigiar.yml` — és tu, porque é a tua conta que envia o código. Num repositório privado o
agendamento não se desliga por falta de atividade.

### Passo 11 — Deploy Hook no PC

1. No serviço → **Settings** → procura **Deploy Hook** e copia o endereço. É um segredo: quem o tiver pode
   publicar (se fugir, **Regenerate Hook**).
2. No `.env` do PC: `RENDER_DEPLOY_HOOK=<o endereço>`.
3. Experimenta (fora da janela da reunião): `npm run publicar -- --esperar`.

### Passo 12 — Ensaio de recuperação

Antes de largar o Excel, faz o ensaio de `docs/recuperar.md` (secção "Ensaio de recuperação") e regista-o.

## Publicar uma versão nova

1. Fora de terça 17:45 – quarta 12:00.
2. O código novo está no `main` e no GitHub (`git push`), e a verificação **Verificar** no GitHub está verde.
3. No PC: `npm run publicar -- --esperar`.

O comando, por esta ordem: recusa na janela da reunião e no quarto de hora antes (salvo `--forcar`, só para
urgências); confirma que estás no `main`, sem alterações por gravar e igual ao GitHub; corre
`npm run verificar` (salvo `--sem-verificar`); vê outra vez a hora (a verificação leva uns minutos); pede ao
Render que publique **esse** commit; e, com `--esperar`, espera até 20 minutos que a versão nova responda em
`https://mapa.cmf-lux.lu/api/saude` (outro endereço com `--endereco`). Nunca mostra o Deploy Hook.
`npm run publicar -- --ajuda` resume as opções.

No Render, a `/api/saude` diz o commit que está no ar (campo `commit`, da variável `RENDER_GIT_COMMIT` que o
Render define sozinho), e o `--esperar` confirma que é o publicado. Se a resposta não o disser, o `--esperar` só
consegue ver o mapa parar e voltar (a troca de versão) e diz "não é certo que seja" a versão nova: confirma em
Render → serviço → **Events** que a publicação terminou.

**Se correr mal:** o que aconteceu está em Render → serviço → **Events** e **Logs**. Para voltar à versão
anterior: **Deploys** → a publicação anterior → **Rollback**. Atenção: o Rollback volta atrás no código, não
na base de dados; se a versão nova trouxe uma migração da BD, fala primeiro com o Claude (há uma cópia
`…-migracao` de antes da migração).

### Tirar o acesso a alguém

1. Render → **Environment** → tira o e-mail de `UTILIZADORES_PERMITIDOS` → **Save and deploy** (fora da janela
   da reunião). No arranque, as sessões dessa pessoa deixam de valer: no pedido seguinte recebe 401 e o tempo
   real dela é cortado. Tira-a também da aplicação no Entra (**Enterprise applications** → **Mapa CMF** →
   **Users and groups**).
2. Para terminar já as sessões, sem esperar pela publicação (não impede que volte a entrar): Render → serviço →
   **Shell** → `npm run sessoes -- terminar <email>` (ou `todas`; `npm run sessoes -- listar` mostra quem tem
   sessões abertas).

### Renovar o client secret

1. Entra → **App registrations** → **Mapa CMF** → **Certificates & secrets** → **New client secret** (como no
   passo 3) e guarda o **Value**.
2. Render → **Environment** → `ENTRA_SEGREDO` = o novo → **Save and deploy** (fora da janela da reunião).
3. Confirma que entras no Mapa e só depois apaga o segredo antigo no Entra. Novo lembrete no calendário.

## Custos

| O quê | Quanto | Notas |
|---|---|---|
| Render — serviço `0.5c-512mb` (o antigo "Starter"), Frankfurt | 7 USD/mês | 0,5 CPU e 512 MB. |
| Render — disco de 1 GB | 0,25 USD/mês | 0,25 USD por GB e por mês. |
| Render — *workspace* Hobby | 0 | Só 1 membro. Inclui 5 GB de tráfego e 500 minutos de construção por mês (cada publicação gasta uns minutos) e 2 domínios próprios. Para o Michael ter conta própria: Pro, 25 USD/mês. |
| GitHub — repositório privado e Actions | 0 | 2 000 minutos/mês incluídos (conta grátis). Estimativa: vigilância ≈ 720 min/mês (24 × 30, cada execução conta 1 minuto) + verificação ≈ 3–4 min por push (50 pushes ≈ 200 min) ≈ **1 000 min/mês**. Sem cartão no GitHub, ao chegar ao limite os workflows param (sem custos), e a vigilância também. |
| Cloudflare R2 (UE) | 0 | Grátis até 10 GB-mês, 1 milhão de escritas e 10 milhões de leituras por mês, sem custo de saída. O Mapa usa uma fração disto. |
| Domínio | já pago | DonDominio. |
| **Total** | **≈ 7,25 USD/mês** | |

## Fontes (consultadas a 04/10/2026)

- Render: [Blueprint YAML](https://render.com/docs/blueprint-spec), [Blueprints](https://render.com/docs/infrastructure-as-code),
  [planos de computação](https://render.com/docs/compute-plans) e [mudança de nomes](https://render.com/docs/compute-plans-update),
  [discos persistentes](https://render.com/docs/disks), [versão do Node](https://render.com/docs/node-version),
  [ambientes nativos](https://render.com/docs/native-environments), [health checks](https://render.com/docs/health-checks),
  [Deploy Hooks](https://render.com/docs/deploy-hooks), [deploy de um commit](https://render.com/docs/deploy-a-commit),
  [deploys](https://render.com/docs/deploys), [rollbacks](https://render.com/docs/rollbacks),
  [domínios próprios](https://render.com/docs/custom-domains), [DNS genérico](https://render.com/docs/configure-other-dns),
  [variáveis](https://render.com/docs/configure-environment-variables), [variáveis do Render](https://render.com/docs/environment-variables),
  [Shell](https://render.com/docs/ssh), [planos de workspace](https://render.com/docs/new-workspace-plans),
  [custos de alojamento](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses)
  (a página de preços não se deixou ler; o preço do serviço confere com a proposta).
- GitHub: [faturação das Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
  [notificações de workflows](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs),
  [configurar as notificações](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications),
  [evento schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
  [variáveis](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables),
  [actions/checkout](https://github.com/actions/checkout), [actions/setup-node](https://github.com/actions/setup-node).
- Microsoft Entra: [credenciais da aplicação](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials),
  [URIs de retorno](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri).
- Cloudflare R2: [jurisdição](https://developers.cloudflare.com/r2/reference/data-location/),
  [tokens](https://developers.cloudflare.com/r2/api/tokens/), [preços](https://developers.cloudflare.com/r2/pricing/).
- DonDominio: [painel do domínio](https://www.dondominio.com/en/help/296/what-can-you-do-from-your-domain-management-panel/),
  [exemplo de um CNAME](https://www.dondominio.com/en/help/256/how-to-configure-mailrelay/).
