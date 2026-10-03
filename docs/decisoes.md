# Decisões

Registo das decisões do Rafael e das escolhas por omissão. Mais recentes primeiro.

## 03/10/2026 — segundo feedback do Rafael

- **Himeling**: as 4 casas da Rue de la Forêt sempre à esquerda e as 4 da Rue de la Grotte sempre à direita (nunca um grupo em cima e outro em baixo). O mesmo para as carrinhas.
- **Cores dos clientes**: escolhidas por nós, de preferência a partir das cores das próprias empresas (ver `docs/cores.md`). O Enquadramento (pessoal da CMF) usa uma cor da marca CMF.
- **Condutor**: cada carrinha pode ter um condutor, que aparece sempre em primeiro na lista, com um volante. Muda-se no modo de edição e fica no histórico. O condutor tem de ir nessa carrinha; se sair dela, deixa de ser condutor. Por agora guarda-se só o condutor atual (coluna em `carrinhas`); o histórico das alterações diz quem conduzia e desde quando.
- **Desenho da carrinha**: 4 rodas, mais compridas.
- **Walferdange e Schifflange** contam sempre como cheias (`sempreCheia`): os lugares são os moradores, sem vagas.
- **Marca**: logótipo, favicon e letras da CMF (Archivo e IBM Plex Sans, alojadas no próprio site), conforme o manual de marca em `01 Marca`.
- **Matrícula**: a verdadeira é **YT7579**; VD6376 (como aparece nos Excel) fica como alternativa.
- A importação passa a recusar apagar a base de dados se já houver gravações feitas no programa (só com `--forcar`).

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
