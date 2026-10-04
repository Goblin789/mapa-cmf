# Recuperar o Mapa CMF

O que fazer quando a base de dados (BD) do Mapa se perde ou fica estragada, e como ensaiar a recuperação.
Publicação e variáveis: `docs/publicar.md` e `docs/m1.md`.

> **Por decidir — destino das cópias.** Este guia usa o Cloudflare R2 (UE). Se passar a ser o SharePoint,
> mudam as variáveis `COPIAS_*`; os comandos ficam iguais.

## O que há

- **Cópias de segurança** da BD: de hora a hora, ao arrancar (se a última tiver mais de 1 hora), antes de
  cada migração da BD e à mão. Cada cópia é comprimida e **cifrada com a `COPIAS_CHAVE` antes de sair do
  Render**: no R2 só há ficheiros ilegíveis sem a chave.
- **Quanto tempo ficam:** todas as das últimas 48 horas; depois, uma por dia até 30 dias; depois, uma por mês
  até 12 meses. As 3 mais recentes nunca se apagam.
- **Nomes:** `mapa-AAAA-MM-DDTHH-MM-SSZ-<motivo>.db.gz.enc`, com a hora em UTC (o `listar` mostra-a também na
  hora do Luxemburgo). Motivos: `hora`, `arranque`, `migracao`, `manual` (à mão no Render) e `pc` (à mão no PC).
- **Vigilância:** o GitHub manda um e-mail se o Mapa não responder ou se não houver cópia há mais de 3 horas.
- **Segunda linha:** o Render tira uma fotografia (*snapshot*) do disco uma vez por dia e guarda-a pelo menos
  7 dias.

## Onde correr os comandos

- **No Render (o mais simples):** serviço → **Shell**. Se o comando disser que não encontra o `package.json`,
  corre primeiro `cd /opt/render/project/src`. Se disser que faltam as variáveis `COPIAS_*`, usa o PC para
  `listar` e `verificar`.
- **No PC:** no `.env`, tira o `#` da linha `#COPIAS_DESTINO=s3` (as outras `COPIAS_*` estão lá desde a
  1.ª publicação). O token do R2 do PC é o **de leitura**: `listar`, `verificar` e `restaurar` funcionam,
  `fazer` não (faz-se na Shell do Render). Mesmo assim, **não abras o mapa no PC enquanto a linha estiver
  ativa** (ia tentar fazer cópias da BD de testes para o balde da produção). No fim, volta a pôr o `#`.

## Ver as cópias

```bash
npm run copias -- listar
```

## Verificar uma cópia

Obtém, decifra, descomprime e abre a cópia num temporário; mostra quantas pessoas, lotes e migrações tem e a
versão. Não escreve nada.

```bash
npm run copias -- verificar ultima
npm run copias -- verificar mapa-2026-10-07T09-00-05Z-hora.db.gz.enc
```

## Restaurar

Primeiro, fora da reunião se possível, avisa o Michael e o João para não gravarem nada.

Nos casos A e B é o **próprio servidor que restaura, ao arrancar**, a cópia indicada em
`RESTAURAR_AO_ARRANCAR`, e **só se não houver BD** no disco: verifica a cópia antes de a pôr no lugar e, se
falhar, não arranca (nunca cria uma BD vazia por cima das cópias).

### A. Disco novo ou vazio (ou um serviço novo)

Sinal: o mapa não arranca e em **Logs** aparece
`A base de dados não existe em /var/data/mapa.db, mas o destino das cópias (s3) já tem … cópia(s)`.
O disco perdeu-se, o serviço foi criado de novo ou alguém mudou o `BD`. Então:

1. Render → serviço → **Environment** → `RESTAURAR_AO_ARRANCAR` = `ultima` (ou o nome de uma cópia) →
   **Save and deploy**.
2. Em **Logs** deve aparecer `BD restaurada da cópia … Já podes apagar RESTAURAR_AO_ARRANCAR.` Se aparecer
   outra mensagem, vê a tabela do passo 5 de `docs/publicar.md` (é quase sempre uma variável `COPIAS_*`).
3. Apaga a variável (**Save only**) e confirma o mapa e a `/api/saude`.

A variável **nunca substitui uma BD que exista**: se aparecer `RESTAURAR_AO_ARRANCAR foi ignorada`, o disco
tinha uma BD e o caminho certo é o B. O valor `RESTAURAR_AO_ARRANCAR` = `nenhuma` começa com uma BD **vazia**:
nunca numa recuperação, só para instalar o Mapa de raiz de propósito.

### B. Voltar atrás com o Mapa a funcionar (dados estragados)

O servidor tem a BD sempre aberta, e no Render não se consegue pará-lo e continuar com a Shell. Por isso não
se restaura por cima dela (o `restaurar --substituir` recusa-o com o servidor ligado): põe-se a BD atual de
lado e o servidor restaura a cópia ao reiniciar, como no A. Faz os passos 2 e 3 seguidos.

1. **Escolher a cópia.** Render → serviço → **Shell** (ou no PC):

   ```bash
   npm run copias -- listar                  # escolhe a cópia de antes do problema
   npm run copias -- verificar <nome>        # tem de dizer "decifrada e íntegra"
   ```

   Copia o **nome exato** (`mapa-…-hora.db.gz.enc`). Usa o nome e **não** `ultima`: até reiniciar, o servidor
   ainda faz cópias da BD estragada.
2. **Pôr a BD atual de lado** (não se apaga nada). Na **Shell**, cola esta linha inteira:

   ```bash
   cd /var/data && d=$(date -u +%Y%m%dT%H%M) && for s in "" -wal -shm; do if [ -e "mapa.db$s" ]; then mv -n "mapa.db$s" "mapa-antes-restauro-$d.db$s"; fi; done; ls -l /var/data
   ```

   Na lista já **não** pode aparecer `mapa.db`; aparece `mapa-antes-restauro-….db`. O mapa continua a
   responder até reiniciar, mas o que se gravar a partir daqui perde-se.
3. **Logo a seguir:** **Environment** → `RESTAURAR_AO_ARRANCAR` = o nome do passo 1 → **Save and deploy** (usa
   a construção que já existe; o mapa reinicia em poucos minutos).
4. Em **Logs**: `BD restaurada da cópia <nome> (… pessoas, … lotes, versão …)`. Apaga a variável
   (**Save only**) e confirma o mapa e a `/api/saude`.
   - Se aparecer `Não foi possível restaurar a cópia`, o mapa fica em baixo até corrigires: copia outra vez o
     nome do `listar` para `RESTAURAR_AO_ARRANCAR` e **Save and deploy**.
5. Quando tiveres a certeza de que está tudo bem, apaga a BD antiga para não ocupar o disco (1 GB), na Shell:
   `rm /var/data/mapa-antes-restauro-*`.

Arrependeste-te entre o passo 2 e o 3? Na Shell, `ls /var/data` e volta a dar os nomes antigos (ex.:
`mv /var/data/mapa-antes-restauro-<data>.db /var/data/mapa.db`, e o mesmo para os que acabam em `-wal` e
`-shm`, se existirem). O servidor nem dá por isso.

### C. Fotografia do disco do Render

Último recurso, se as cópias falharem: na página **Disk** do serviço, restaura a fotografia de um dia. Perde-se
tudo o que mudou no disco depois dela.

## Se a chave se perder

**Não há volta:** sem a `COPIAS_CHAVE` com que foram feitas, as cópias são ilegíveis para sempre (nem a
Cloudflare nem ninguém as consegue abrir). Por isso a chave fica em **dois sítios independentes** (o gestor de
palavras-passe e um segundo, ex.: em papel num envelope fechado no cofre), além do Render.

- **Perdeu-se de um dos sítios:** copia-a do outro para o primeiro, já.
- **Perdeu-se de todos, mas o Mapa funciona:** gera uma chave nova (`npm run copias -- chave`), guarda-a nos
  dois sítios, põe-na no Render (`COPIAS_CHAVE`, **Save and deploy**, fora da reunião) e faz logo uma cópia na
  Shell (`npm run copias -- fazer --motivo manual`). As cópias antigas ficam inúteis.
- **Fugiu (alguém a viu):** o mesmo que acima. Quem tiver a chave antiga e acesso ao balde lê as cópias
  antigas: troca também os dois tokens do R2 (abaixo).

**Um token do R2 fugiu** (ou trocas a chave): no R2, ao lado de **API Tokens**, **Manage** → apaga o token →
cria outro igual (passo 2 de `docs/publicar.md`). O de escrita vai para o Render (`COPIAS_S3_ID` e
`COPIAS_S3_SEGREDO`, **Save and deploy**, fora da reunião); o de leitura para o `.env` do PC. Guarda os dois
no gestor de palavras-passe.

## Ensaio de recuperação

Uma cópia que nunca se restaurou não é uma cópia. **Quando:** antes de largar o Excel, depois **de 3 em 3
meses** (lembrete no calendário) e sempre que mudar a chave ou o destino das cópias. Faz-se no PC, para provar
que se consegue recuperar **sem o Render** e com a chave **do gestor de palavras-passe** (não a do Render).
Leva uns 15 minutos.

- [ ] GitHub → **Actions** → **Vigiar**: as últimas execuções estão verdes.
- [ ] A chave está nos dois sítios e é a mesma. No `.env` do PC, a `COPIAS_CHAVE` é a do gestor de
      palavras-passe e o token do R2 é o **de leitura** (Object Read only).
- [ ] Mapa do PC fechado; no `.env`, tira o `#` de `COPIAS_DESTINO`.
- [ ] `npm run copias -- listar`: há cópias da última hora e de dias e meses anteriores.
- [ ] `npm run copias -- verificar ultima`: diz "decifrada e íntegra".
- [ ] `npm run copias -- restaurar ultima --para dados/ensaio-restauro.db` (**nunca** `dados/mapa.db`).
- [ ] O número de pessoas do restauro bate com o do Mapa online, e a versão com a de
      `https://mapa.cmf-lux.lu/api/saude` (pode ser um pouco menor, se alguém gravou depois da cópia).
- [ ] Verifica também uma cópia antiga (de há um mês): `npm run copias -- verificar <nome>`.
- [ ] Apaga `dados/ensaio-restauro.db` e volta a pôr o `#` em `COPIAS_DESTINO`.
- [ ] Regista o ensaio na tabela abaixo.

### Registo dos ensaios

| Data | Quem | Cópia restaurada | Resultado |
|---|---|---|---|
| | | | |
