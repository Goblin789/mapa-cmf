# Decisões

Registo das decisões do Rafael e das escolhas por omissão. Mais recentes primeiro.

## 04/10/2026 — M1 construído (por publicar)

- **Login**: openid-client (Entra ID, código + PKCE) em vez do Better Auth da proposta. Sessões no SQLite
  (só o hash), 30 dias sem uso / 90 dias no máximo. Em produção `UTILIZADORES_PERMITIDOS` é obrigatória
  (segunda barreira além da atribuição no Entra) e compara com o **UPN** (nome de utilizador Microsoft,
  normalmente o e-mail @cmf-lux.lu). O autor dos lotes é esse UPN; o utilizador guarda-se pelo ID Microsoft
  (oid). Sem papéis: os três podem tudo.
- **Sessão que termina a meio**: aparece o ecrã de entrada por cima da app; o rascunho fica no browser e volta
  depois de entrar ("Recuperámos N alterações…").
- **Tempo real**: quando alguém grava, os outros recarregam e veem "Fulano gravou N alterações." (o próprio
  separador não se avisa).
- **Cópias**: de hora a hora, ao arrancar e antes de cada migração; cifradas; retenção 48 h / 30 dias /
  12 meses. Em produção o servidor **não arranca sem cópias noutro fornecedor** (S3/R2). Fora de produção
  o servidor nunca escreve no balde. Dois tokens R2: escrita (Render) e só leitura (PC).
- **Render**: plano `0.5c-512mb` (o antigo Starter), disco de 1 GB, deploys automáticos desligados
  (`npm run publicar`, Deploy Hook). Com disco, cada publicação deixa o mapa uns segundos em baixo: a janela
  proibida é de terça 17:45 a quarta 12:00.
- **Vigilância**: GitHub Actions de hora a hora à `/api/saude` (falha se o mapa não responde ou se não há
  cópia há mais de 3 h; o GitHub manda e-mail).
- **Vistas**: Mapa | Tabela | Quadro no cabeçalho (agora em 2 linhas); Quadro como as folhas do Michael
  (França/Himeling com Forêt e Grotte, depois Luxemburgo, e "Fora das casas"); Excel com as folhas Pessoas,
  Casas e Carrinhas; **modo reunião** em ecrã inteiro, só de leitura, Quadro por omissão.
- *Por responder*: destino das cópias (R2 ou SharePoint); gestor de palavras-passe da empresa e 2.º sítio da
  chave das cópias; UPN do Michael e do João; TV da reunião e PC que lhe liga; a partir de quando o mapa é a
  fonte única (o Michael larga o Excel) — só depois do ensaio de recuperação.

## 04/10/2026 — preparação do M1

- **Domínio**: o DNS de `cmf-lux.lu` está na **DonDominio** (o Rafael gere). O e-mail vai para o Microsoft 365
  (MX e SPF: não tocar). Há um wildcard `*.cmf-lux.lu` para a página de parking da DonDominio e não há registos
  CAA. O Mapa fica em **`mapa.cmf-lux.lu`**: no fim do M1 cria-se um CNAME `mapa` → endereço do Render.
- **Login Microsoft**: aplicação **"Mapa CMF"** registada pelo Rafael no Entra (inquilino CMF S.àr.l), só para a
  organização, plataforma Web, URIs de retorno `http://localhost:5173/api/auth/retorno` e
  `https://mapa.cmf-lux.lu/api/auth/retorno`. Na aplicação empresarial, **Assignment required = Yes** e
  atribuídos o Rafael, o Michael e o João. Client ID e tenant ID no `.env` (não são segredos); o client
  secret só se cria na publicação e é o Rafael que o cola.
- O M1 inclui também o **tempo real** e o **autor de cada gravação** (antes no M2), porque a edição já existe e
  vão ser três pessoas a editar. Desenho técnico em `docs/m1.md`.
- **Cópias de segurança**: o código aceita uma pasta local ou um destino S3 compatível (Cloudflare R2, como na
  proposta). *Por responder*: SharePoint da CMF (recomendado por não precisar de conta nova) ou R2.
- *Por responder*: tamanho/resolução do ecrã da reunião (por omissão TV 1920×1080, Quadro).

## 04/10/2026 — terceiro feedback do Rafael

- **Texto dos nomes**: igual em todos (o quase-preto da marca, #1C1C1B). Paleta clara: Costantini #F28A7E (coral), Galère #B2ECBC (menta), A+P Kieffer #84A6F4 (pervinca), Phillipe BTP #EACBF7 (lilás), Kisch #FCE55E (amarelo), Enquadramento #F39200 (laranja CMF), Mersch #5CB4B8 (petróleo). Contraste ≥ 7:1 com o texto; ver `docs/cores.md`.
- **Pastilhas da lotação**: brancas com contorno verde (livre) ou âmbar (cheio) e vermelhas cheias quando há gente a mais, para não se confundirem com os nomes (todos claros).
- **Onde dorme**: muda-se no modo de edição (ficha: "Mudar onde dorme…" e "Confirmar sugestão"; lista Carrinhas: "Mudar" e "Confirmar todas as sugestões", um só passo). Casa, outro local (ex.: estacionamento) ou "por definir" (usa a sugestão: a casa onde moram mais passageiros). Fica no histórico.
- **Frota** (lista do Rafael, corrigida por ele): 26 veículos com tipo (carrinha/carro), marca e modelo. **Ficam** CF5003 (Ford Tourneo Connect) e CF5005 (Ford Transit Custom). MJ9423, MJ9426 e VG9737 estavam na lista mas foram vendidas e não entram. A **DS4264 dos Excel é afinal o YG4474** (Renault Megane, carro; engano do Michael): o veículo mantém o id interno DS4264 na BD, com as pessoas e o condutor, e passa a ter a matrícula YG4474 (DS4264 fica como alternativa).
- **Os dados iniciais deixam de se aplicar por reimportação** (a BD já tem edições do Rafael): passa a haver `npm run sincronizar`, que atualiza clientes, casas, veículos e locais sem tocar nas edições e regista tudo no histórico.

## 03/10/2026 — segundo feedback do Rafael

- **Himeling**: as 4 casas da Rue de la Forêt sempre à esquerda e as 4 da Rue de la Grotte sempre à direita (nunca um grupo em cima e outro em baixo). O mesmo para as carrinhas.
- **Cores dos clientes**: escolhidas por nós, de preferência a partir das cores das próprias empresas (ver `docs/cores.md`). O Enquadramento (pessoal da CMF) usa uma cor da marca CMF.
- **Condutor**: cada carrinha pode ter um condutor, que aparece sempre em primeiro na lista, com um volante. Muda-se no modo de edição e fica no histórico. O condutor tem de ir nessa carrinha; se sair dela, deixa de ser condutor. Por agora guarda-se só o condutor atual (coluna em `carrinhas`); o histórico das alterações diz quem conduzia e desde quando.
- **Desenho da carrinha**: 4 rodas, mais compridas.
- **Walferdange e Schifflange** contam sempre como cheias (`sempreCheia`): os lugares são os moradores, sem vagas.
- **Marca**: logótipo, favicon e letras da CMF (Archivo e IBM Plex Sans, alojadas no próprio site), conforme o manual de marca em `01 Marca`.
- **Matrícula**: a verdadeira é **YT7579**; VD6376 (como aparece nos Excel) fica como alternativa.
- A importação passa a recusar apagar a base de dados se já houver gravações feitas no programa (lotes de mudança, correção ou ficha; só com `--forcar`).
- Locais a menos de 500 m uns dos outros ficam lado a lado no mapa (o de oeste à esquerda); hoje só se aplica a Himeling.
- Avisos ao guardar: condutor sem carta = aviso forte; carta caducada = aviso simples; carta desconhecida = sem aviso; carrinha mexida que tinha condutor e fica com gente sem condutor = aviso simples.
- Modo de edição com o laranja da marca (#F39200) e texto escuro; as pastilhas da lotação passaram a fundo claro com contorno, para não se confundirem com os nomes vermelhos/verdes.
- *Por confirmar*: se o cliente Kisch é a Kisch Constructions (Medernach); não se encontrou a marca da Phillipe BTP nem da Mersch (cores escolhidas por nós).

## 03/10/2026 — modo de edição e cartões novos (no PC)

- Um POST cujas mudanças se anulam todas (A→B→A) não cria lote (400): nem versão nova nem entrada vazia no histórico.
- Conflitos: se alguém mudou as mesmas pessoas entretanto, nada é gravado e o ecrã explica quem/onde; o rascunho fica.
- O mapa escolhe o tamanho dos cartões conforme o espaço: em ecrã inteiro (1920×1080) as carrinhas mostram os nomes;
  numa janela mais pequena mostram só a matrícula e a lotação (os nomes aparecem ao aproximar meio zoom ou ao clicar).
  *Por confirmar com o Rafael.*
- Himeling: com 8 casas e ~10 carrinhas em dois pontos a 360 m, na vista de conjunto alguns cartões ficam afastados
  do sítio (linha até ao ponto). Ao aproximar separam-se.

## 03/10/2026 — feedback do Rafael sobre o M0

- **Mapa**: cartões muito mais pequenos e no sítio real; o mapa tem de se ver; nomes sempre visíveis nas casas e nas carrinhas.
- **Aspeto**: a casa e a carrinha seguem o formato das imagens que o Rafael mandou (casa com telhado e chaminé e os nomes em duas colunas; carrinha vista de cima com um nome por linha; matrícula ao estilo luxemburguês), mas com cores sóbrias e ar profissional.
- **Lotação**: só a pastilha "9/10" tem cor (verde/âmbar/vermelho); o cartão fica neutro.
- **Camadas**: ligar/desligar Casas, Carrinhas e Obras no mapa.
- **Lista lateral**: organizar por Casas, Carrinhas, Obras ou Clientes, com filtros, como as folhas do Michael.
- **Modo de edição**: nada se muda fora dele. Lá dentro as mudanças são uma simulação até se carregar em Guardar; Cancelar volta tudo ao que estava. Mudar pessoas a arrastar (e "Mover para…" como alternativa).
- **Ordem das etapas**: a edição (previsto no M2) passa à frente da publicação online (M1), a pedido do Rafael.
- Não há outro Excel além da lista mestra e do ficheiro do Michael.
- *Por responder*: qual é a matrícula atual da carrinha VD6376/YT7579 (a mensagem ficou cortada).

## 03/10/2026 — M0 entregue (só leitura, no PC)

- O servidor só aceita ligações do próprio PC (127.0.0.1 e verificação do Host) até haver login no M1.
- A importação do M0 apaga e recria tudo (incluindo o histórico). A partir do M2 deixa de ser assim.
- "Costantino Gonçalves" no ficheiro do Michael é a mesma pessoa que "Constantino Gonçalves" na lista.
- A lista a salmão do Michael (sem casa) conta como "Fora das casas" no cruzamento.
- Aviso de contrato: compara os lugares da casa (moradores + vagas) com o máximo e o tolerado, como diz a especificação.
  Sem tolerado conhecido, passar o máximo dá só o aviso simples. *Por confirmar com o Rafael.*

## 03/10/2026 — arranque do M0

**Aprovado**
- Tecnologia e alojamento da proposta (`proposta-fase1.md`): TypeScript, React + Leaflet, Hono, SQLite, Render (Frankfurt) a partir do M1.
- Código em `C:\dev\mapa-cmf`, fora do OneDrive.
- O Rafael tem conta GitHub; o repositório privado cria-se quando for preciso publicar (M1). Até lá, git local.
- O Rafael administra o Microsoft 365 e o DNS de cmf-lux.lu.

**Dados**
- Lugares das carrinhas: tabela do documento (nenhum Excel tem os lugares). Quem vai em cada carrinha: lista mestra; a folha VIATURAS do Michael serve para cruzar.
- VD6376 (Excel) e YT7579 (documento) são **a mesma carrinha** (Hyundai, 5 lugares). Fica com a matrícula VD6376 e YT7579 como alternativa. *Por confirmar: qual é a matrícula atual.*
- Folha "Não estão na lista": **não entra ninguém, só a Deolinda Cardoso** (Enquadramento, Walferdange, DS4264).
- Carrinha do Francisco Vieira, Luís Carvalho e Gabriel Soares: **não se sabe**. Ficam em "Sem transporte" marcados "a confirmar".
- CF5003 e CF5005: ocupantes por decidir (o Rafael diz depois). Entram vazias.
- Apartamentos de Himeling (Casas 3/4 Puttelange = Ap. 4 ou 5? Casas 2/6/7 Forêt = C, D e?): o Rafael diz depois.

**Por omissão (sem resposta ainda)**
- Jorge Pereira (sem casa na lista): "Fora das casas CMF", marcado "a confirmar".
- Nélson Esteves = Nélson Mendes (mesma pessoa); "Nélson Mendes" fica como nome alternativo para a pesquisa.
- Nº: tiram-se os espaços e mantém-se o sufixo (865-017 e 865-017_3 são pessoas diferentes); o original também se guarda.
- Enquadramento é um grupo interno (não um cliente com obras).
- Contratos: "6 a 8" = máximo 6, tolerado 8. "Não fixado" e "—" ficam sem aviso.
- Manda a lista mestra (02/10/2026); o ficheiro do Michael só serve para cruzar.

**Em falta**
- Moradas do escritório e das oficinas.
- Fonte dos telefones, cartas e validades, e das datas de CT/revisão/correia.
