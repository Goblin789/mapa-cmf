# Decisões

Registo das decisões do Rafael e das escolhas por omissão. Mais recentes primeiro.

## 05/10/2026 — Respostas do Rafael ao M2

Respostas do Rafael ("Perguntas para quando puderes", às perguntas "por confirmar" da entrada M2 abaixo):
1. **Apelidos obrigatórios numa pessoa nova?** "não". Os apelidos passam a **opcionais** na pessoa nova e ao
   editar a ficha. Sem migração: a coluna é NOT NULL e já havia pessoas importadas sem apelidos (só o nome
   curto na lista), por isso ficam vazios com `""` e não com null — uma exceção aos opcionais, documentada em
   `dominio/campos.ts`, como a morada do local (regra 'livre'; null é recusado: "fica vazio com "", não com
   null"). O diálogo marca "Apelidos (opcional)" e, sem eles, propõe como nome no mapa só o nome ("Zita").
   Os nomes funcionam sem apelidos em todo o lado: nome completo, Tabela, Excel, pesquisa, Quadro, Mapa e
   Histórico (este pelo nome no mapa; apelidos apagados aparecem como "—"); o title dos nomes já não fica
   com um espaço a mais. Ensaiado na cópia da BD (1920, 1366 e 375 px).
2. **No Quadro por obras, ver de que casa vem cada pessoa?** "sim": fica como está.
3. **Aceitas que os dados da pessoa e "Saiu da empresa…" só se mudem na ficha do Mapa e do Quadro, e não na
   Tabela?** "não aceito". Das duas opções que lhe mostrámos escolheu o **botão "Editar…"**: só no modo de
   edição, a seguir ao nome na Tabela, "Editar…" (lápis + "Editar…" a partir de md; só o lápis no
   telemóvel; "Editar <nome>") abre a MESMA ficha editável da pessoa do Mapa e do Quadro (campos, Marcar
   indisponível…, Mudar…, Tornar condutor, Saiu da empresa…), posta como as fichas da casa e da carrinha (no
   telemóvel em baixo). Fora do modo de edição continua sem ficha da pessoa na Tabela (só "Ver no mapa", como
   ele pediu a 04/10). No modo de edição o "Ver no mapa" fica só com o ícone; no telemóvel a etiqueta do nome
   passa de 9 para 8 rem a editar, para a coluna presa crescer só ~1 rem. O clique na linha continua a só
   selecionar e a pesquisa do cabeçalho a só realçar; ✕/Esc fecham a ficha e devolvem o foco ao "Editar…";
   Guardar e Cancelar fecham-na; depois de "Saiu da empresa…" fecha e a linha esconde-se (salvo "Mostrar quem
   saiu", com "Voltou à empresa…" como antes). Desenho em `docs/vistas-edicao.md` (Tabela).
   Acertos depois da revisão: (a) o "Editar…" esquece-se também com a Tabela noutra vista (`seguirEditar`
   segue a loja): antes, "Editar…", ir ao Quadro, ✕ e clicar no nome dela no Quadro reabria a ficha ao voltar
   à Tabela sem o botão; se o foco fica nela (Editar… → Quadro → Tabela), a ficha continua. (b) A linha da
   ficha aberta fica à vista também quando a ficha a muda de lugar (o nome com a Tabela por Nome ia para o
   fim, fora do ecrã) e, se a ficha a faz deixar de passar os filtros (ex.: a casa com o filtro Casa),
   limpam-se os filtros com o aviso "Filtros limpos para mostrar …", como na pesquisa do cabeçalho; quem
   escreve no filtro com a ficha aberta fica com o filtro (`acaoLinhaDaFicha`). (c) O alvo de toque do "Ver
   no mapa" já não entra nos últimos 2 px do lápis do "Editar…".
4. **A partir de quando deixa de se manter o Excel do Michael?** "se tudo correr bem quarta-feira de manhã":
   **quarta-feira, 07/10/2026, de manhã**. Daí em diante o mapa é a fonte única e não se volta a sincronizar a
   partir do Excel (as pessoas, quem está onde e as fichas mudam-se só no programa). Só documentado; o código
   não mudou por isto.
5. **Experimentar num telemóvel verdadeiro e com o serviço de moradas real: fazemos juntos?** "sim".
   **Pendente combinado**: um ensaio com o Rafael num telemóvel verdadeiro e com os serviços de moradas
   ligados (geoportail.lu, IGN, Nominatim), na produção ou num servidor sem `MORADAS=desligadas`.

## 05/10/2026 — M2 construído (por juntar e publicar)

Construído na worktree `C:/dev/mapa-cmf-m2` (branch m2), com o mapa do Rafael aberto na pasta principal.
Desenho em `docs/m2.md`; vistas em `docs/vistas-edicao.md`. Ensaio integrado numa cópia da BD real (137 pessoas):
a 0004 aplicou-se com a cópia simples antes e sem perder nada (pessoas, lotes, alterações, condutores e onde
dormem iguais); o `sincronizar` não desfez a lotação mudada no programa; Mapa, Tabela, Quadro e reunião a 1920,
1366 e 375 px. **Juntar só com o mapa fechado** e com uma cópia nova à mão de `dados/mapa.db` (ao reabrir, o
servidor aplica a 0004 e faz a cópia automática em `dados/copias/`).

**Escolhas feitas (decididas com bom senso; o Rafael pode mudar)**
- *Fichas*: cada campo muda-se no sítio (lápis → Enter = um passo; Esc cancela). Os textos opcionais vazios
  ficam vazios (null). As matrículas editadas guardam-se como nos dados iniciais ("cf 5001" → "CF5001"; no
  ecrã "CF 5001"); as outras matrículas não podem ser de outro veículo nem repetir a principal (recusado também
  no servidor). Carta "Não tem"/"Não sei" limpa a validade. "Mudar para outra morada…" só junta a casa a uma
  morada de casas que já existe, com o aviso "Passa a partilhar a morada com X"; mudar a morada de uma casa
  partilhada avisa "Também muda para: …" e, no Histórico, a frase diz-se pelo local ("Himeling, Rue de la
  Forêt (4 casas) — morada: …").
- *Pessoa nova*: nome **e** apelidos obrigatórios; o nome no mapa é proposto ("Nome A.") e não se repete.
  (05/10/2026: o Rafael respondeu que não; os apelidos passaram a opcionais — entrada acima.)
- *Saiu da empresa*: tira da casa, da carrinha (e de conduzir) e da obra num só passo; a pessoa fica na Tabela
  com "Mostrar quem saiu" (só de leitura) e volta com o botão "Voltou à empresa…" da linha dela. Tirar alguém que já saiu de uma
  casa, carrinha ou obra é válido; pô-lo numa é recusado.
- *Indisponível*: só as datas. Os nomes mostram "até 12/10" em todo o lado menos nos cartões do Mapa (só o
  símbolo). O lugar na carrinha fica livre ("8/9"; "1 livre até 10/10" na ficha da carrinha, no Mover para… e
  ao arrastar), mas o nome continua na sua caixa (as caixas da lista e do Quadro são as do cartão do Mapa); a
  pesquisa também diz 8/9. Um período que já acabou pede confirmação; no modo de edição os períodos passados
  ainda por guardar aparecem na ficha para se corrigirem. Ao guardar avisa quando a carrinha fica com gente a
  mais quando a pessoa voltar ("CF 5001 fica com 10/9 quando X voltar, a 13/10").
- *Problemas*: "Resolver" e "Reabrir" também funcionam fora do modo de edição (entram nele). Abrir e resolver
  um problema no mesmo rascunho grava-se. O texto avisa (sem bloquear) quando parece ter um nome, um telefone
  ou saúde.
- *Obras*: criar pelo "Novo…" da barra, pela lista Obras ou com clique direito / toque longo no mapa ("Nova
  obra aqui", que pede logo a morada e o país do ponto). O nome da obra não se repete; o local criado tem o
  nome da obra e acompanha-o. Tirar o estacionamento apaga a morada dele se foi criada no programa e mais nada
  a usa. Editar obra só manda o que se mudou (não desfaz o que outra pessoa gravou entretanto). Na ficha da
  obra: "quem vem para esta obra e de onde" e "Trazer as N selecionadas para aqui". Quadro por obras: cada nome
  com a casa de onde vem, em letra pequena, só nos blocos das obras (ver "Juntar com a main").
- *Moradas*: no Luxemburgo o geoportail.lu, em França o IGN, na Bélgica e na Alemanha o Nominatim (1 pedido/s;
  aí quase sempre se pede para confirmar o pino, salvo com nº de porta). Para ensaios, `MORADAS=desligadas`.
- *Histórico e Reverter*: "Reverter…" em cada gravação feita no programa; o que já não se pode reverter
  aparece com o porquê (ex.: "uma pessoa nova não se apaga: usa Saiu da empresa"; "entretanto mudou"); vai
  para o rascunho como um passo. As gravações aparecem como "Reverte a gravação de 05/10 01:01 (autor)" e
  "Revertida". As marcas "a confirmar" dizem "casa confirmada" / "carrinha a confirmar". Uma gravação
  revertida não se reverte outra vez, a menos que a própria reversão seja revertida: aí volta a estar em vigor
  (perde o "Revertida" e tem outra vez "Reverter…").
- *Guardar*: grupos novos (Fichas, Pessoas novas e saídas, Indisponível, Problemas, Obras); o pino (lat e
  lng) conta como uma alteração; com períodos ou problemas, o comentário tem a frase fixa "Não escrevas o
  motivo da indisponibilidade nem dados de saúde." e avisa enquanto se escreve.
- *Barra de edição*: menu "Novo…" (Nova pessoa, Nova obra) e "Indisponível…" com seleção; abaixo de 1900 px
  Desfazer/Refazer só com o ícone e "Limpar" em vez de "Limpar seleção" (uma linha de 1280 a 2560 px).
- *Reunião*: botão "Histórico" (sem "Reverter…"); "Ecrã inteiro" e "Histórico" só com o ícone, para os
  filtros caberem numa linha a 1920 px.
- *Telemóvel*: com um campo aberto a ficha ocupa o ecrã todo; o aviso curto vai para cima quando há ficha.
- *Sincronizar*: um campo mudado no programa nunca é desfeito (secção "Ficou o valor do programa";
  `--usar-json` para aplicar o do JSON de propósito); um registo apagado no programa não volta; recusa se uma
  casa ou veículo que sai tiver problemas por resolver. `sincronizar`, `importar` e `sessoes` nunca migram a
  BD: só o arranque do servidor, com a cópia antes.

**Juntar com a main (05/10/2026)**: a main tinha avançado com as decisões do Rafael de 04/10 (entrada abaixo)
e do ecrã de entrada e do ícone; as decisões dele mandam na interface e o M2 no resto.
- *Quadro por obras*: fica UMA implementação, a da main (`seccoesObras`, `blocoObra`, "Sem obra" largo,
  alvos `obra:<id>`/`sem-obra`), com o que o M2 lhe juntou: o título da obra abre a ficha da obra, o ícone dos
  problemas nos blocos das casas e carrinhas, as marcas de indisponível, as caixas iguais às do cartão do Mapa
  e, nos blocos das obras, a casa de onde vem cada nome (letra pequena, sem alargar a coluna; no "Sem obra",
  que hoje tem toda a gente, não, para não encher o Quadro). Por baixo do título da obra vai a morada do
  local (sem morada, o nome do local, se não for o da obra: as obras criadas no programa têm um local com o
  nome delas). Sem filtro "Obra" no Quadro nem no cabeçalho da reunião (a Tabela tem-no).
- *"Sempre cheia"*: saiu também do que o M2 acrescentava (o campo editável e a linha "Sempre cheia: Sim" da
  ficha da casa); o campo continua nos dados e no sincronizar. No Histórico e no Guardar o rótulo é "lugares
  iguais aos moradores" (`ROTULO_CAMPO` em `dominio/campos.ts`, como o `NOME_CAMPO` do sincronizar). Nessas
  casas (Walferdange, Schifflange) a lotação não conta, por isso, a editar, a lotação tem por baixo a nota
  "Nesta casa os lugares são os moradores: a lotação não conta." (sem mudar um número sem efeito às cegas).
- *Aviso do contrato*: só na ficha da casa e no Guardar; os acrescentos do M2 nos cartões e na lista lateral
  (o ícone dos problemas) ficam sem ele.
- *Tabela*: sem ficha da pessoa (saiu a ficha compacta, onde o M2 tinha os campos de quem saiu): a seguir ao
  nome, "Ver no mapa"; na linha de quem saiu ("Mostrar quem saiu") o mesmo sítio tem "Voltou à empresa…"
  (no telemóvel "Voltou…"), que entra no modo de edição, se preciso, e abre o diálogo
  (`abrirVoltouAEmpresa`). Os dados de quem saiu (telefone, carta…) mudam-se depois de voltar, na ficha.
  Com isto, na Tabela já não se mudam os campos da pessoa (nº, nome, apelidos, nome no mapa, cliente,
  telefone, carta) nem se dá "Saiu da empresa…": faz-se na ficha do Mapa ou do Quadro ("Ver no mapa"). Na
  Tabela editam-se as células (casa, carrinha, obra, indisponível) e as fichas da casa e da carrinha.
  (05/10/2026: o Rafael não aceitou; no modo de edição há o botão "Editar…" na Tabela — entrada acima.)

*Por confirmar com o Rafael* (as respostas de 05/10 — apelidos, casa de onde vem no Quadro por obras, campos
da pessoa na Tabela, Excel do Michael, ensaio no telemóvel e com as moradas verdadeiras — estão na entrada
acima):
- se uma casa pode ter uma **morada só sua criada no programa** (ex.: uma casa da Himeling que mude de rua;
  hoje o lápis da morada muda as 4 casas do mesmo local);
- se lhe serve **confirmar o pino** quase sempre na Bélgica e na Alemanha;
- se o **aviso do regresso** ao Guardar é útil ou é ruído;
- se os botões só com ícone (barra de edição abaixo de 1900 px; "Ecrã inteiro" e "Histórico" na reunião) se
  percebem;
- se lhe serve a nota da lotação nas casas cujos lugares são os moradores (ou se prefere não poder mudar a
  lotação nessas casas, ou nada);

## 04/10/2026 — Obras no Quadro, aviso do contrato, "sempre cheia" e "Ver no mapa" na Tabela

Pedidos do Rafael (desenho em `docs/vistas-edicao.md`):
- **Quadro: Casas | Carrinhas | Obras** ("devia ter obras também, não devia ser uma aba como está, em que
  obras está separado"): "Obras" passa a ser a 3.ª opção do alternador do Quadro (também na reunião), ao lado
  de Casas e Carrinhas. Por obras: uma secção por cliente, um bloco por obra (com quem lá trabalha; arrastar
  para um bloco muda a obra) e "Sem obra" no fim. O filtro "Obra" à parte **saiu do Quadro** (era a "aba
  separada" de que ele falava; na barra e no cabeçalho da reunião fica só o filtro dos clientes); a Tabela
  continua com o filtro "Obra". Hoje ainda não há obras: o Quadro por obras mostra só "Sem obra" com toda a
  gente e uma nota.
- **"Ver no mapa" na Tabela**: no PC o botão a seguir ao nome diz "Ver no mapa" (ícone e texto); no telemóvel
  só o ícone, para a coluna presa do nome não crescer.
- **Aviso do contrato só na ficha da casa** ("no mapa não é preciso mostrar"): o aviso (acima do máximo /
  acima do tolerado) aparece só na ficha da casa (`PainelFoco`, ao carregar na casa), em qualquer vista. Saiu
  dos cartões do Mapa (e do title deles), do ▲ das pastilhas de resumo do Mapa, da lista lateral e do rodapé
  dos blocos do Quadro (também na reunião). A Tabela não o mostrava. Fica o aviso no diálogo Guardar ("Casa X
  passa o máximo do contrato…"), que é na hora de decidir e não "no mapa". O domínio (`ocupacao.ts`) não mudou.
- **"Sempre cheia" em lado nenhum**: saiu a etiqueta do rodapé dos blocos do Quadro, a "conta sempre como
  cheia" da lista lateral e do title dos cartões do Mapa. O comportamento fica igual (Walferdange e
  Schifflange contam como cheias: lugares = moradores, sem "livre"); os dados e o domínio não mudaram.
- **Tabela: "Ver no mapa" em vez do ⓘ** ("a janela que abre é inútil"): o botão a seguir ao nome passa a ser
  "Ver no mapa" (ícone do mapa, "Ver <nome> no mapa"), que muda para o Mapa e lá põe a pessoa em foco. Ficou
  no mesmo sítio, a seguir ao nome (onde o olho procura a pessoa; a célula está presa à esquerda, por isso
  vê-se em qualquer largura e no modo de edição). A ficha compacta da pessoa foi apagada e **na Tabela não há
  ficha da pessoa**: uma pessoa em foco (pesquisa do cabeçalho, nome na ficha de uma casa) só realça a linha;
  um clique numa linha tira-lhe o foco (fica só a linha marcada). Clicar numa linha continua só a realçá-la
  (seleciona, no modo de edição). As ligações Casa e Carrinha continuam a abrir as fichas da casa e da
  carrinha (a da casa é onde está o aviso do contrato). No Mapa e no Quadro a ficha da pessoa fica igual.
- "Sempre cheia" também saiu do Histórico: o campo `sempreCheia`, quando a sincronização dos dados iniciais o
  muda, aparece como "lugares iguais aos moradores" (`NOME_CAMPO` em `importacao/sincronizar.ts`; o relatório
  da sincronização usa o mesmo nome).
- Apagado o `resumoDasCasas` (`paineis/fichas.ts`, sem uso desde que saíram os contadores): calculava as casas
  acima do contrato fora da ficha da casa.

## 04/10/2026 — pedidos do Rafael (cabeçalho, Tabela, filtros, Quadro, ficha arrastável)

Pedidos ditados pelo Rafael (saiu e não pôde responder; decidido com bom senso). Desenho em
`docs/vistas-edicao.md`.
- **A. Cabeçalho**: saíram todas as caixas dos contadores (Livres nas casas / acima do contrato, Sem transporte,
  Fora das casas, Paradas/oficina, Carrinhas vazias, A confirmar) do cabeçalho principal, em todas as vistas,
  e também do cabeçalho da reunião (é a "barra de cima" lá). O cabeçalho fica mais baixo (1366 px: 89 → 51 px;
  1920 px: 89 → 76 px, o logótipo inteiro do manual de marca define a altura; reunião 1920: 111 → 80 px;
  telemóvel no Mapa: 264 → 137 px). `paineis/Contadores.tsx` foi apagado; os números continuam calculados
  (`dominio/contadores.ts`), porque a legenda do Mapa usa o nº de pessoas por cliente. Ficaram sem uso, mas não
  se apagaram (podem voltar a servir se o Rafael quiser os números noutro sítio): `divisaoPorCliente`
  (`paineis/agrupar.ts`), `resumoDasCasas` (`paineis/fichas.ts`; apagado depois, ver acima) e `contadoresServidor` (loja).
- **B. Tabela sem informação repetida**: clicar numa linha só a realça e **não abre a ficha** (a linha já tem
  tudo); no modo de edição o clique seleciona como antes (clique, Ctrl/⌘, Shift, caixas), sem ficha. Um botão
  pequeno ⓘ a seguir ao nome abre/fecha a ficha da pessoa (para "Ver no mapa", Mudar onde dorme, etc.). Fica a
  seguir ao nome, e não no fim da linha, porque no fim ficava fora do ecrã no modo de edição a 1366 px. Com a
  ficha de uma pessoa aberta, clicar noutra linha passa a ficha para ela (mudado nos acertos abaixo). As ligações Casa e Carrinha
  continuam a abrir as fichas da casa e da carrinha. A ficha em si não mudou: como só abre a pedido, já não
  repete a linha a cada clique.
- **C. Filtros múltiplos na Tabela**: Cliente, Casa, Carrinha e **Obra** (novo), cada um com várias escolhas
  ao mesmo tempo. Dentro do mesmo filtro é OU, entre filtros é E. Especiais: "Fora das casas CMF", "Sem
  transporte da empresa", "Sem obra". Sem obras na BD, "Obra: sem obras" desativado. "N de M pessoas" e
  "Limpar filtros". **Excel**: até aqui ignorava os filtros; agora, com filtros, a folha Pessoas leva só as
  linhas filtradas (ficheiro "… (filtrado).xlsx"; Casas e Carrinhas inteiras). Sem filtros, igual a antes.
- **D. Filtros no Quadro**: Clientes e Obras, vários ao mesmo tempo; ficam **só** as pessoas desses
  clientes/obras (não é esbater). As pastilhas dos clientes da barra passaram a ser este filtro: cada clique
  liga/desliga, sem Shift; "Todos" limpa (no telemóvel, um botão "Cliente" com a lista). Os blocos continuam
  com a lotação real e continuam a ser alvos de largar; os sem ninguém do filtro ficam recolhidos (título e
  pastilha) numa fila por baixo. Funciona também na reunião (só para ver). O filtro não fica guardado ao
  recarregar (um filtro esquecido escondia pessoas na reunião seguinte). No modo de edição, quem o filtro
  esconde sai da seleção, com aviso. O realce por cliente da legenda do Mapa fica como estava, só no Mapa; o
  Excel do Quadro exporta tudo.
- **E. Nomes numa só linha no Quadro** (casas e carrinhas): as colunas têm a largura do nome mais comprido de
  cada parte do Quadro; nunca há quebra de linha. Medido sem reticências nem nomes partidos a 1920, 1366,
  reunião 1920 e telemóvel. No PC, onde antes os nomes partiam, o Quadro fica um pouco mais comprido (desliza).
- **F. Ficha arrastável** (Mapa, Quadro e Tabela, no PC a partir de 640 px): pega-se pelo cabeçalho e
  arrasta-se para qualquer sítio dentro da área; nunca sai do ecrã; a posição fica lembrada (uma por vista,
  ver os acertos abaixo); botão "Voltar a pôr a ficha no sítio" e duplo clique no cabeçalho voltam à
  origem; setas na pega e Alt+setas no cabeçalho. No telemóvel fica como estava.
- **Acertos depois da revisão** (mesmo dia; desenho em `docs/vistas-edicao.md`):
  - *Títulos do Quadro numa só linha*: com os nomes numa linha, os títulos das casas partiam ("Casa 2 Rue de
    la / Forêt"). Agora cada bloco tem pelo menos a largura do seu cabeçalho (título + ● + pastilha; no modo de
    edição reserva também o ●, um algarismo a mais e o ▲, para uma largada não cortar um título) e, na
    Himeling, as colunas repartem-se por parte (a Forêt passa um bloco à linha de baixo). Preço: um degrau de
    letra onde ela estava limitada pela largura (1920: 15 → 14 px no Quadro e na reunião por casas; 1680:
    Quadro 14 → 13 px e reunião por casas 14 px completo → 13 px livres numa linha; a 1440 o Quadro passa a
    deslizar a 14 px). Títulos inteiros eram o pedido; os nomes continuam sempre inteiros. Medido: 0 títulos e
    0 nomes em duas linhas a 1920, 1680, 1440, 1366, 1280, reunião 1920/1366/1280 e telemóvel.
  - *Tabela*: clicar numa linha já não muda a ficha (antes passava-a para essa pessoa: era a informação
    repetida de que o Rafael se queixou). Só o ⓘ abre, muda ou fecha a ficha da pessoa, que na Tabela é
    **compacta**: só o que a linha não tem ("Ver no mapa", aviso de quem conduz sem carta, telefone e carta se
    existirem), sem Nº, Cliente nem Casa → Carrinha → Obra e sem botões de mudar (estão nas células). As fichas
    de casa e carrinha ficam completas; no Mapa e no Quadro a ficha da pessoa fica completa.
  - *Legenda do Mapa fora do Mapa*: a Tabela deixou de esbater linhas pelo cliente aceso na legenda e já não
    mostra "Só <cliente> · Todos" (usa o filtro Cliente); os nomes das fichas abertas na Tabela e no Quadro
    também deixaram de esbater. No Mapa a legenda fica igual.
  - *Quadro*: "Limpar filtros" (clientes e obras) sempre que há filtro; o "Todos" das pastilhas só aparece com
    obras escolhidas (só limpa clientes); sem ninguém, "Ninguém corresponde ao filtro. Limpar filtros".
    *Reunião*: a partir de 1280 px os filtros vão para o cabeçalho da reunião (listas até 1919 px, pastilhas a
    partir de 1920 px); a 1920 o Quadro ganha 33 px (954 → 987 px).
  - *Ficha arrastável*: cada vista guarda a sua posição (Mapa, Tabela, Quadro). A posição antiga, partilhada
    pela Tabela e pelo Quadro, passa só para o Quadro; a Tabela começa na origem (aí não tapa os nomes).
- **Utilizadores**: o Rafael atribuiu o **Miguel Cardoso** (cardoso@cmf-lux.lu) à aplicação "Mapa CMF" no Entra;
  passa a ser o 4.º utilizador (juntar a `UTILIZADORES_PERMITIDOS` quando se publicar). *UPN por confirmar*
  (o login compara com o UPN, que pode não ser o e-mail).
- *Por confirmar com o Rafael*:
  - se a legenda do Mapa deve aceitar vários clientes ao mesmo tempo, como as pastilhas do Quadro (hoje acende
    só um);
  - se as listas compactas "Cliente"/"Obra" no cabeçalho da reunião entre 1280 e 1919 px lhe servem (a 1920,
    na TV, são as pastilhas);
  - se quer os números dos contadores noutro sítio (ex.: na lista lateral ou no Histórico), ou se não fazem
    falta;
  - se o ⓘ a seguir ao nome é fácil de encontrar para abrir a ficha na Tabela;
  - se o filtro do Quadro deve ficar guardado ao recarregar (hoje não fica);
  - se o Excel do Quadro também deve seguir o filtro do Quadro (hoje exporta tudo; o da Tabela segue os
    filtros);
  - o filtro de obras foi ensaiado só com obras fictícias numa cópia da BD (ainda não há obras na BD real);
  - não se ensaiou com um leitor de ecrã real nem no modo entra (login Microsoft).

## 04/10/2026 — nomes completos na Tabela e lugares livres nas carrinhas

Pedidos do Rafael: "na tabela apareça só o nome completo, não os nomes repetidos (…) não precisa de repetir a
abreviação do cliente" e "no quadro em carros quero que apareçam os espaços vazios dos carros também, tal como
fizeste nas casas". Desenho em `docs/vistas-edicao.md`.
- **Tabela**: a coluna Nome tem **uma só etiqueta** (fundo da cor do cliente, volante, "?", ponto âmbar) com o
  **nome completo** e **sem a sigla** (a coluna Cliente está ao lado). Sem nome completo, o nome curto. A Tabela
  ordena pelo nome mostrado; o filtro encontra também pelo nome curto e pelos nomes alternativos. A folha
  **Pessoas** do Excel segue a Tabela (uma só coluna Nome); as folhas Casas e Carrinhas continuam com o nome
  curto, como as do Michael.
- **Maiúsculas normais** (só para mostrar, nunca se grava; `dominio/nomes.ts`): uma palavra toda em maiúsculas
  passa a ter só a inicial maiúscula, também depois de hífen, apóstrofo, ponto ou parênteses ("ANA-RITA" →
  "Ana-Rita"; "J.P." fica "J.P."); as palavras já com minúsculas ficam como estão ("McDONALD"). A partir da
  2.ª palavra, **da/de/do/das/dos/e** e o **d'** ficam sempre em minúsculas, também quando vêm só com a
  inicial maiúscula ("Maria Da Luz" → "Maria da Luz", "D'Almeida" → "d'Almeida"), para as partículas
  aparecerem todas da mesma maneira. *Por confirmar com o Rafael* (vai além de "as palavras mistas ficam como
  estão").
- **Quadro**: as carrinhas mostram os lugares livres ("livre", tracejados) como as casas, até aos lugares; com
  gente a mais não há livres (a pastilha fica vermelha). No modo de edição também servem para largar.
- **Ajuste ao ecrã** com três degraus: completo (um "livre" por lugar), **livres numa linha** (os livres de
  cada bloco numa só linha tracejada, "4 livres", sem "Ninguém." nem "por definir") e compacto (sem livres).
  *Por confirmar com o Rafael*:
  - Reunião a 1920×1080: com os dados atuais o completo não cabe a 14 px; o Quadro por carrinhas fica com os
    livres numa linha a 13 px (antes ficava compacto a 14 px, sem livres). Se preferir 14 px sem livres,
    troca-se a ordem dos degraus em `DEGRAUS_AJUSTE.reuniao` (`vistas/agrupamentoQuadro.ts`).
  - PC (fora da reunião): **sempre um "livre" por lugar**, como nas casas (era o pedido); se não couber, o
    Quadro desliza. O degrau "livres numa linha" ficou só para a reunião.
  - Reunião a 1366×768: nada cabe; fica compacto a 13 px, a deslizar, sem livres (como antes nas casas).
- **Telemóvel**: na Tabela e no Quadro a ficha abre **recolhida** (título, "Ver no mapa", ✕, uma linha de
  resumo e, a editar, as ações principais); "Ver tudo" abre-a toda (até 60 %, deixando sempre 6 rem da vista).
  No PC e no Mapa fica igual.
- **Tabela a editar**: um botão ao lado das listas Casa e Carrinha abre a ficha; a barra tem "Confirmar todas
  as sugestões (N)". Com um cliente aceso na legenda, as linhas dos outros ficam esbatidas e a barra mostra
  "Só <cliente> · Todos".
- **Quadro**: mostrar uma casa sem moradores e sem carrinhas a dormir lá (Quadro por carrinhas), ou uma
  carrinha sem passageiros e sem casa (Quadro por casas), dá um aviso curto; o agrupamento não muda.
- O título da ficha da pessoa (em todas as vistas, também no Mapa) e a dica dos nomes no Quadro usam também as
  maiúsculas normais, para o mesmo nome não aparecer de duas maneiras.

## 04/10/2026 — Tabela e Quadro editam como o mapa

Pedido do Rafael: clicar ou editar na Tabela ou no Quadro **nunca** leva para o Mapa; a Tabela e o Quadro têm
as mesmas capacidades do mapa. Desenho em `docs/vistas-edicao.md`.
- **Nada muda de vista sozinho**: só o botão **"Ver no mapa"** da ficha leva ao Mapa. A linha da Tabela, o
  título de um bloco do Quadro, a pesquisa, os contadores e as ligações da ficha mostram na vista onde se está.
- **Pesquisa do cabeçalho em todas as vistas** (fora da reunião), com "/" e Ctrl+K: no Mapa leva o mapa até lá
  (como antes); na Tabela e no Quadro desliza até ao elemento, acende-o em azul por instantes e abre a ficha.
  O campo da Tabela passa a ser só um filtro.
- **Ficha** também na Tabela e no Quadro (no PC em cima à direita; no telemóvel em baixo), com as mesmas ações.
  Os nomes dos moradores e passageiros da ficha também levam a vista até à pessoa.
- **Telemóvel fora do Mapa**: os contadores ficam numa só linha que desliza de lado (o cabeçalho passa de 264
  para 179 px) e a ficha pode sempre chegar a 16 rem, para os botões de mudar se verem num ecrã baixo.
- **Quadro**: seleciona e arrasta como o mapa (previsão no alvo, toque longo no telemóvel, Shift+arrastar para
  a caixa de seleção), legenda dos clientes na barra, "Mudar" onde dorme nas carrinhas.
- **Tabela**: edita nas células (Casa, Carrinha e Obra em listas, condutor num botão), caixas para selecionar
  linhas e "Mover para…".
- Tudo entra no mesmo rascunho (Desfazer, Guardar, Cancelar). A nota "usa o mapa ou a lista" desaparece.
- **Reunião**: continua só de leitura; a casa escolhida nos contadores mostra-se no Quadro sem saltar para o
  mapa.

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
