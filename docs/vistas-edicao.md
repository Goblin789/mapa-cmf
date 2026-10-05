# Tabela e Quadro editam como o Mapa

Pedido do Rafael (04/10/2026): clicar ou editar na Tabela ou no Quadro **nunca** leva para o Mapa; a Tabela e
o Quadro têm a ficha, a pesquisa e o modo de edição com as mesmas capacidades do mapa e da lista lateral.

Pedidos seguintes do Rafael, no mesmo dia (decisões em `docs/decisoes.md`): contadores fora do cabeçalho,
Tabela sem informação repetida, filtros de escolha múltipla (Tabela e Quadro, com Obra), nomes do Quadro numa
só linha e ficha arrastável. Estão descritos abaixo, cada um no seu sítio.

## Diagnóstico (antes)

- `vistas/navegar.ts`: `verNoMapa` (linha da Tabela, título de bloco do Quadro) muda para o Mapa.
- `useIrParaMostraMapa` (App) muda para o Mapa sempre que alguém chama `loja.pedirIrPara` (pesquisa,
  popovers dos contadores — também na reunião, que saltava para `#reuniao-mapa`).
- A ficha (`PainelFoco`) só existe dentro do mapa (invisível nas outras vistas); a pesquisa do cabeçalho só
  aparece no Mapa; no Quadro e na Tabela os nomes (`NomeVista`) não se selecionam nem se arrastam; a nota
  "Para mudar pessoas, usa o mapa ou a lista · Ir para o mapa" manda para o Mapa.
- Já funciona: entrar no modo de edição não muda de vista; o rascunho, a barra âmbar, os diálogos (Mover
  para…, Onde dorme, Confirmar sugestões, Guardar, Cancelar), os atalhos (Ctrl+Z…) e o **motor de arrastar**
  são globais. O motor escuta no `document` e só precisa de `[data-arrastavel-pessoa]` e `[data-alvo]`:
  ensaiado no Quadro com os atributos postos à mão, mostra a previsão no alvo e larga no rascunho sem mudar
  de vista (o mapa escondido tem `pointer-events: none`, por isso o `elementFromPoint` não o vê).

## Regra única: mostrar sem mudar de vista (`vistas/mostrar.ts`)

`mostrarElemento(elemento, { noMapa })` põe a pessoa/casa/carrinha em foco (a ficha abre na vista ativa) e:
- **Mapa**: `noMapa: 'ir'` (pesquisa) leva o mapa até lá com `pedirIrPara`, como sempre;
  `'so-foco'` (ligações da ficha) só muda o foco, como sempre. O Mapa fica exatamente igual.
- **Tabela, Quadro**: deixa um pedido (`usePedidoMostrar`) que a vista atende com `useAoMostrar`: tira o que
  a esconde (filtros da Tabela), desliza até lá e realça por 1,6 s (`revelarElementos` /
  `revelarDepoisDeDesenhar`, atributo `data-realce`, CSS em `estilos.css`). O realce é logo; o deslizar
  espera dois fotogramas (a ficha acabou de abrir) e deixa o elemento **fora da ficha** da vista
  (`data-ficha="vista"`, `deslocamentoForaDaFicha`): por cima dela no telemóvel, por cima ou por baixo dela
  no PC quando lhe ficava atrás. Uma linha da Tabela conta pela 1.ª célula (presa à esquerda): no PC fica
  ao centro, ao lado da ficha, em vez de ir para a faixa por baixo dela. Sem movimento suave com
  `prefers-reduced-motion`.

Cada vista marca no DOM o que se pode mostrar com `data-elemento` = `chaveElemento(...)`
("pessoa:<id>", "casa:<id>", "carrinha:<id>"); procura-se sempre **dentro da raiz da vista** (o mapa escondido
também tem `data-alvo`/`data-pessoa-id`).
Ir ao Mapa é só com o botão explícito **"Ver no mapa"** da ficha (`navegar.verNoMapa`). `useIrParaMostraMapa`
desaparece.

| Quem pede | Chama |
|---|---|
| Pesquisa do cabeçalho (agora em todas as vistas, fora da reunião) | `mostrarElemento(r, { noMapa: 'ir' })` (+ no Mapa, o nome na lista, como hoje) |
| Ligações da ficha (casa, carrinha, condutor…) | `mostrarElemento(x, { noMapa: 'so-foco' })` |
| Nomes dentro da ficha da vista (moradores, passageiros: `NomeChip`) | o `NomeChip` muda o foco; a ficha apanha o clique e chama `seguirPessoaEmFoco(id)` (pedido à vista se a pessoa ficou em foco) |
| Clique num nome / bloco da vista, ou numa ligação Casa/Carrinha de uma linha da Tabela | `definirFoco` (já está à vista: não desliza) |
| Botão "Ver no mapa" de uma linha da Tabela (a seguir ao nome) | `verNoMapa({ tipo: 'pessoa', id })` (muda para o Mapa) |

## Peças partilhadas (contratos já no código)

- **`PainelFoco lugar="vista"`**: a mesma ficha (com todas as ações do modo de edição: Mudar casa/carrinha/
  obra, Tornar/Tirar condutor, Mudar onde dorme…, Confirmar sugestão, movimentos por guardar). Cada vista
  monta-a por cima da sua área de conteúdo (dentro de um invólucro `relative` à volta da caixa que desliza,
  para não tapar a barra da vista): no PC em cima à direita (22 rem), no telemóvel em baixo, a toda a largura
  (até 60 % da altura da área, mas sempre até 16 rem se a área der: num ecrã baixo, a editar, 60 % deixava
  o corpo da ficha com 40 px; a deslizar por dentro). Na vista, a ficha tem o botão "Ver no mapa" (só o
  ícone no telemóvel). As ligações da ficha chamam `mostrarElemento(x, { noMapa: 'so-foco' })`; os nomes dos
  moradores e passageiros (`NomeChip`) também levam a vista até à pessoa (`seguirPessoaEmFoco`). O `App` só
  monta a ficha do mapa no Mapa (fora da reunião). Na reunião não há ficha.
  **No telemóvel (abaixo de 640 px) a ficha da vista abre recolhida** (04/10/2026: num ecrã baixo, a editar,
  tapava quase toda a vista e cada toque num nome abria-a): o tipo, o título numa linha, "Ver no mapa", ✕, uma
  linha de resumo (pessoa: cliente, casa → carrinha → obra; casa: pastilha, moradores, aviso do contrato;
  carrinha: pastilha, condutor, onde dorme) e, no modo de edição, as ações principais numa fila que desliza de
  lado. "Ver tudo ⌃" (ou tocar no título) abre-a toda, até 60 % da área e deixando sempre 6 rem da vista;
  "Recolher ⌄" volta a fechá-la. Recolhe quando o foco muda a partir da vista; as ligações e os nomes dentro da
  ficha não a recolhem. Medido a 375×667, a editar: ficam à vista uns 120–135 px de linhas/blocos (antes ~30);
  a ler, 284 px. No PC e no Mapa a ficha fica igual.
  **Na Tabela, fora do modo de edição, não há ficha da pessoa** (04/10/2026, `haFichaDaPessoa`; antes era uma
  ficha compacta aberta pelo ⓘ, que o Rafael achou inútil: só o "Ver no mapa" servia, e passou a ser o botão
  da linha). **No modo de edição, a do botão "Editar…" da linha** (05/10/2026; secção Tabela): a mesma ficha
  editável do Mapa e do Quadro, só para essa pessoa (prop `editar` do `PainelFoco`). Uma pessoa em foco na
  Tabela por outra via (pesquisa, nome na ficha de uma casa) só realça a linha. No Mapa e no Quadro a ficha
  da pessoa é a completa; as fichas de casa e de carrinha abrem em todas as vistas. A vista decide-se no
  `PainelFoco` (prop `vista`, senão a vista ativa).
  **Aviso do contrato só na ficha da casa** (04/10/2026): no resumo (ficha recolhida) e no corpo. Não aparece
  nos cartões nem nas pastilhas de resumo do Mapa, na lista lateral, no Quadro (nem na reunião) nem na
  Tabela; fica também no diálogo Guardar, quando uma mudança põe uma casa acima do contrato. A etiqueta
  "sempre cheia" não aparece em lado nenhum (as casas continuam a contar como cheias: sem "livre").
  **Ficha arrastável (04/10/2026), no PC (a partir de 640 px), no Mapa, no Quadro e na Tabela**: pega-se pelo
  cabeçalho (a pega de 6 pontos, a linha do tipo ou o espaço vazio; o título e a morada continuam a
  selecionar-se e a copiar-se) e vai para qualquer sítio dentro da área da vista ou do mapa, sempre a 8 px das
  bordas (puxada para baixo encolhe até 12 rem e desliza por dentro). Ao redimensionar fica presa às bordas e
  volta ao sítio guardado quando há espaço. Cada vista lembra a sua posição (localStorage `mapa-cmf:ficha-mapa`,
  `mapa-cmf:ficha-tabela` e `mapa-cmf:ficha-quadro`; guarda-se a distância à borda de lado mais perto e ao
  topo): as disposições são opostas (na Tabela, a ficha arrastada para a esquerda tapa os nomes). A chave
  antiga `mapa-cmf:ficha-vista` (partilhada) passa só para o Quadro na primeira leitura e apaga-se; a Tabela
  começa na origem. Volta à origem com o botão "Voltar a pôr a ficha no sítio" (só aparece com ela
  mudada), com duplo clique no cabeçalho ou com Início na pega. Teclado: setas na pega (Shift = passos
  maiores) e Alt+setas em todo o cabeçalho; Esc a meio de um arrasto cancela-o sem fechar a ficha. O arrasto
  não toca no motor de arrastar pessoas, na caixa de seleção nem no Leaflet (pointerdown com preventDefault,
  stopPropagation e setPointerCapture). No Mapa, a ficha mudada de sítio continua a acabar por cima da
  legenda dos clientes, a não ser que se ponha o topo dela na faixa da legenda. A `<section data-ficha>` tem
  `data-movida` quando está fora da origem (a Tabela lê-o para só reservar espaço à direita com a ficha na
  origem). Lógica em `paineis/janelaArrastavel.ts` (pura) e `paineis/useJanelaArrastavel.ts`. **No telemóvel
  (abaixo de 640 px) fica como estava**: sem pega e sem arrastar, mesmo com uma posição guardada no PC.
- **`NomeVista`** (`vistas/pecas.tsx`): `interativo` = porta-se como o `NomeChip` (fora da edição o clique
  abre/fecha a ficha; na edição seleciona com clique, Ctrl/⌘+clique, Shift+clique pela ordem do
  `ContextoOrdemPessoas`, e põe em foco), anel azul se selecionado, anel escuro se em foco, ponto âmbar se
  alterado; `arrastavel` = `data-arrastavel-pessoa` no modo de edição (rato e toque longo, pelo motor).
  Fica **sempre numa só linha** (reticências e o nome inteiro no title se não couber). Sem `interativo` é o
  nome de sempre (reunião). `nome` = o texto a mostrar (e o início do title) e `semSigla` = sem a sigla do cliente: a Tabela
  usa-os para o nome completo; por omissão é o nome curto com a sigla (Quadro, reunião).
- **`FiltroMultiplo`** (`comum/FiltroMultiplo.tsx`, lógica pura em `comum/escolhaMultipla.ts`): filtro de
  escolha múltipla da Tabela e do Quadro. Botão "Casa: todas" / "Casa: Casa 1 …" / "Casa" com a pastilha do
  número de escolhas; painel fixo no ecrã com Todas/Limpar/✕, procura (com mais de 8 opções), caixas de
  seleção, secções (ex.: obras por cliente) e opções especiais separadas por uma linha. Conjunto vazio = sem
  filtro; dentro do mesmo filtro é OU (`passaFiltro`), entre filtros diferentes é E. Sem nenhuma opção fica
  desativado ("Obra: sem obras"). No telemóvel o painel ocupa a largura toda e as linhas têm 44 px.
- **Cabeçalho sem contadores** (04/10/2026): as caixas Livres nas casas, Sem transporte, Fora das casas,
  Paradas/oficina, Carrinhas vazias e A confirmar saíram do cabeçalho principal (todas as vistas) e do da
  reunião; `paineis/Contadores.tsx` foi apagado. Os números continuam calculados (`dominio/contadores.ts`,
  `loja.contadores`): a legenda do Mapa usa `pessoasPorCliente`. A partir de 1024 px o cabeçalho principal é
  uma só linha (51 px; 76 px a partir de 1680 px, com o logótipo inteiro); a reunião fica numa linha em xl
  (com os filtros do Quadro, ver Quadro > Reunião).
- A legenda da barra do Quadro (`Legenda lugar="barra"`) saiu: o Quadro tem os seus filtros. A `Legenda` é
  só a do Mapa (`data-legenda-mapa`, que a ficha arrastada usa para acabar por cima dela).
- `NotaEdicao` (com "Ir para o mapa") saiu; cada vista mostra uma dica curta no modo de edição.

## Quadro

- **Casas | Carrinhas | Obras** (04/10/2026, pedido do Rafael: "Obras" ao lado de Casas e Carrinhas, e não à
  parte): o alternador da barra (e do cabeçalho da reunião) tem as três opções, lembradas no browser
  (`mapa-cmf:quadro`). **Por obras** (`agrupamentoQuadro.ts`, `seccoesObras`): uma secção por cliente (pela
  ordem dos clientes; "Cliente desconhecido" no fim), um bloco por obra pelo nome (título = nome da obra; por
  baixo, fora da reunião, a morada do local ou, sem ela, o nome do local quando não é o da obra; sem lotação,
  a pastilha é o nº de pessoas; o título abre a ficha da obra, M2; os nomes vêm pela casa de onde vem cada
  um, que se lê em letra pequena por baixo do nome, sem alargar a coluna) e, no fim, o bloco largo **"Sem obra"** (por cliente; conta também quem tem uma obra
  que não se conhece, como o filtro; sem a casa de onde vem: hoje tem toda a gente). Cada bloco é um alvo de largar (`obra:<id>`, `sem-obra`: muda a obra,
  com a previsão "Obra X: 5 + 1 = 6" e o "●" de alterado). Sem obras nenhumas (hoje), só "Sem obra" com toda
  a gente e a nota "Ainda não há obras…", como na lista lateral. Uma casa ou carrinha em foco ou mostrada no
  Quadro por obras realça os moradores/passageiros (não há blocos de casas nem de carrinhas para as ligações;
  sem ninguém, "Casa X: ninguém mora lá." / "Carrinha X: ninguém vai nela."). O Quadro **não tem filtro
  "Obra"** à parte (05/10/2026: era a "aba separada" de que o Rafael não gostava; as obras veem-se pelo
  agrupamento). Para caber: no telemóvel o alternador fica só com o texto (com os ícones a barra passava a três
  linhas; fica em duas, 89 px), e no cabeçalho da reunião também de 1280 a 1919 px (com eles os filtros, ao
  lado da hora, passavam a mais uma linha: a 1680 px, 94 → 154 px); a 1920 px (a TV) tem os ícones. Medido:
  cabeçalho da reunião 75 px de 1280 a 1536 px e 94 px a 1680 e 1920 px, como antes.
- **Ler**: clicar num nome abre a ficha da pessoa; clicar no título de um bloco abre a da casa/carrinha (já
  não "Ver no mapa"). O que está em foco tem um anel; casa/carrinha em foco que não tem bloco no agrupamento
  atual (ex.: casa no Quadro por carrinhas) realça os nomes dos moradores/passageiros. Se não houver nada a que chegar (casa sem moradores e sem carrinhas a dormir lá no Quadro por
  carrinhas; carrinha sem passageiros e sem casa no Quadro por casas), um aviso curto diz porquê
  (`avisoSemNadaNoQuadro`, `useUiEdicao.avisar`); o agrupamento não muda.
- **Filtros (04/10/2026; o "Obra" saiu a 05/10)**: Clientes, vários ao mesmo tempo. No PC as pastilhas dos
  clientes na barra são o filtro: cada clique liga/desliga esse cliente (sem Shift); no telemóvel é um
  `FiltroMultiplo` "Cliente". Ficam **só** as pessoas que passam; o cliente que conta é o
  efetivo (o da obra, se tiver). Os blocos continuam todos, com a lotação e os lugares livres reais: os que
  não têm ninguém do filtro ficam recolhidos numa fila por baixo da grelha de cada parte (título e pastilha;
  continuam alvos de largar e abrem a ficha); os outros mostram "+N fora do filtro". A barra diz "N de M
  pessoas" e, com algum filtro, "Limpar filtros" (como na Tabela; o foco passa para a 1.ª
  pastilha ou para o botão "Cliente"). Quando o filtro não deixa ninguém, aparece por cima dos blocos
  (que ficam, recolhidos: continuam alvos de largar) "Ninguém corresponde ao filtro. Limpar filtros"
  (role=status). Na reunião os mesmos filtros (só para ver): a partir de 1280 px no próprio cabeçalho da
  reunião, ao lado da hora (a lista "Cliente" até 1919 px; as pastilhas a partir de 1920 px), com
  "N de M pessoas" e "Limpar filtros"; abaixo de 1280 px, uma barra fina por cima do Quadro. Medido a 1920:
  cabeçalho 94 px e sem barra (antes 80 + 46), área do Quadro 954 → 987 px; a 1280, 67 + 37 → 75 px. O filtro fica em memória (o
  mesmo dentro e fora da reunião; não fica guardado ao recarregar). Mostrar alguém que o filtro esconde
  (pesquisa, ligações) limpa-o com o aviso "Filtro do Quadro limpo para mostrar …". No modo de edição, quem o
  filtro esconde sai da seleção (aviso "N pessoa(s) escondida(s) pelo filtro saiu/saíram da seleção"), para
  não ir no arrasto sem se ver (na Tabela a seleção fica). O Quadro já não segue o `clienteDestacado` da
  legenda do Mapa; o Excel do Quadro exporta tudo.
- **Nomes e títulos sempre numa só linha** (casas e carrinhas): o `useAjuste` mede, em cada parte do Quadro, o
  nome mais comprido (em em) e as colunas dos blocos e dos nomes dessa parte nunca ficam mais estreitas do que
  ele (lado a lado, cada parte parte da largura de que os seus blocos precisam). Mede também o cabeçalho de
  cada bloco (título + ● + pastilha, com as margens) e usa-o no mínimo do bloco (`largurasMinimas`): nenhum
  bloco fica mais estreito do que o seu título. No modo de edição o mínimo reserva o ●, um algarismo a mais na
  pastilha (9/10 → 10/10) e a diferença para o ▲, para uma largada não cortar um título; volta a medir quando
  uma pastilha precisa de mais algarismos do que os reservados ou um bloco recolhe (`assinaturaCabecalhos`).
  O título só leva reticências (com o nome todo no title) num ecrã estreito demais. Nos blocos largos ("Fora
  das casas", "Sem transporte") as parcelas por cliente passam à linha de baixo. Na Himeling sem espaço para
  os 4 + 4 blocos, `colunasLadoALado` escolhe as colunas de cada parte (a Forêt passa um bloco à linha de baixo,
  a Grotte não); cada parte tem pelo menos a largura de um bloco. Preço: um degrau de letra onde ela estava
  limitada pela largura (Quadro e reunião a 1920, casas: 15 → 14 px; 1680: Quadro 14 → 13 px e reunião 14 px
  completo → 13 px livres numa linha; a 1440 o Quadro desliza a 14 px em vez de caber a 12 px com títulos
  partidos). Medido a 1920/1680/1440/1366/1280, reunião 1920/1366/1280 e telemóvel: 0 títulos e 0 nomes em
  duas linhas. Na reunião, se nada couber com
  os nomes inteiros, há dois degraus finais com as colunas de sempre, onde um nome comprido ocupa a linha
  toda do bloco (só leva reticências se nem assim couber). No telemóvel, 2 colunas de nomes e os compridos
  ocupam a linha do bloco. No PC os nomes nunca se cortam: o Quadro desliza.
- **Lugares livres**: as casas **e as carrinhas** mostram um "livre" tracejado por lugar livre, até à lotação
  (com gente a mais, nenhum: a pastilha fica vermelha). Estão dentro do bloco, por isso também são alvos de
  largar no modo de edição.
- **Ajuste ao ecrã** (`DEGRAUS_AJUSTE` em `agrupamentoQuadro.ts`): três modos — completo, **livres numa linha**
  (os livres de cada bloco juntam-se numa só linha tracejada, "4 livres", e saem o "Ninguém." e o "por
  definir") e compacto (sem livres). PC: completo de 12 a 16 px (um "livre" por lugar, como o Rafael pediu),
  senão 14 px completo a deslizar. Reunião: completo de 14 a 30, senão livres numa linha de 13 a 30, senão compacto
  de 13 a 30, senão 13 a deslizar. A linha "N livres" também serve para largar.
- **Editar** (sem mudar nada no motor): nomes `NomeVista interativo arrastavel` com
  `ContextoOrdemPessoas` por bloco; cada bloco é um alvo `data-alvo={bloco.chave}` (a chave do bloco —
  "casa:<id>", "carrinha:<id>", "fora", "sem-transporte" — já é uma `chaveAlvo`), com o realce de "por cima"
  e a previsão do motor no fantasma ("CF 5005: 6 + 3 = 9/9"); no telemóvel, toque longo; perto da borda o
  Quadro desliza sozinho (o motor desliza o contentor com scroll). **Shift+arrastar** no fundo do Quadro =
  caixa de seleção (funções puras de `mapa/caixaSelecao.ts`). "Mover para…" pela barra âmbar. Rodapé das
  carrinhas: "Mudar" onde dorme (`abrirDormida`); no Quadro por carrinhas, "Confirmar todas as sugestões (N)".
  Condutor pela ficha (como no mapa). Bloco com alterações por guardar: contorno âmbar e "●". As pastilhas já
  mostram a simulação.
- **Reunião**: só leitura (nomes e títulos não clicáveis, sem alvos, sem ficha); os filtros de clientes e
  obras funcionam (são só para ver). Continua a atender `useAoMostrar` (desliza e realça no Quadro, sem
  saltar para o mapa).
- O mapa escondido não se pode deslocar durante um arrasto no Quadro (`mapa/interacoesEdicao.ts` ignora
  quando o mapa está `inert`).

## Tabela

- **Nome**: uma só etiqueta `NomeVista nome=… semSigla` (fundo da cor do cliente, volante, "?", ponto âmbar)
  com o **nome completo com maiúsculas normais** (`dominio/nomes.ts`, só para mostrar; sem nome completo, o
  nome curto) e sem a sigla (a coluna Cliente está ao lado). A Tabela ordena por ele; o filtro encontra também
  pelo nome curto e pelos nomes alternativos. Largura da etiqueta: 12 rem no telemóvel (8 rem a editar),
  16 rem no PC, 18,5 rem a partir de 1536 px; o nome inteiro está no title. A folha Pessoas do Excel segue a
  Tabela (uma só coluna Nome).
- **Ler** (04/10/2026: a linha já mostra tudo): clicar numa linha **só a realça** (fundo azul claro e barra
  à esquerda; outro clique tira o realce) e **nunca abre ficha**. **Fora do modo de edição, na Tabela não há
  ficha da pessoa** (pedido do Rafael, 04/10/2026: a ficha que o ⓘ abria era inútil, só o "Ver no mapa"
  servia; no modo de edição, ver "Editar…" abaixo). A seguir ao
  nome (na célula presa à esquerda, à vista em qualquer largura e nos dois modos) está o botão **"Ver no
  mapa"**: cinzento, sempre à vista; fora do modo de edição, no PC, o ícone do mapa e o texto "Ver no mapa",
  no telemóvel (< 768 px) só o ícone, para a coluna presa não crescer (no modo de edição só o ícone em
  qualquer largura, a seguir ao "Editar…": ver abaixo); title e aria-label "Ver <nome> no mapa"; 28 px de
  altura, com o alvo de toque alargado a 40 × 32 px sem sair da linha (a seguir ao "Editar…" só 2 px para a
  esquerda, para não entrar no lápis). Chama `verNoMapa` (muda para o Mapa e lá põe
  a pessoa em foco; fora do modo de edição a linha fica marcada para quando se voltar). Na linha de quem saiu
  da empresa (M2, "Mostrar quem saiu"; não está no mapa) o mesmo sítio tem "Voltou à empresa…" ("Voltou…" no
  telemóvel; `botoesDaLinha`, `abrirVoltouAEmpresa`): entra no modo de edição, se preciso, e abre o diálogo de
  quem volta. Uma pessoa em foco
  na Tabela (pesquisa do cabeçalho, nome na ficha de uma casa) só realça a linha (barra azul-escura,
  #1d4ed8); um clique numa linha tira-lhe o foco e fica só a linha marcada (barra mais clara, #60a5fa;
  `marcadaDepoisDoClique`: na linha dela o clique não tira o realce). O nome não é botão (o teclado usa o
  "Ver no mapa" e as caixas). Os valores de Casa e Carrinha são ligações que abrem a ficha da casa/carrinha
  (a da casa tem o aviso do contrato); com uma casa/carrinha em foco, as linhas dela ficam levemente
  realçadas. Com essa ficha aberta na origem, a caixa da tabela reserva espaço à direita para ela
  (`reservaDaFicha`); com a ficha arrastada (`data-movida`) não reserva. No telemóvel reserva 60 % em baixo.
  O realce por cliente da legenda do Mapa (`clienteDestacado`) **não conta na Tabela** (ela tem o filtro
  Cliente): nem esbate linhas nem mostra "Só <cliente> · Todos". Nas fichas abertas na Tabela e no Quadro
  também não esbate os nomes (`NomeChip` só esbate no Mapa).
- **Editar**: coluna de caixas de seleção (e "todas as visíveis" no cabeçalho); clique na linha = seleção
  como nos nomes (Ctrl/⌘, Shift pela ordem visível), **sem abrir ficha**.
- **"Editar…" (05/10/2026)**: o Rafael "não aceito" que os dados da pessoa e o "Saiu da empresa…" só se
  mudassem na ficha do Mapa e do Quadro; das duas opções que lhe mostrámos escolheu o botão. **Só no modo de
  edição**, a seguir ao nome (na célula presa), vem primeiro **"Editar…"** (com contorno; lápis e "Editar…"
  a partir de md, só o lápis no telemóvel; title e aria-label "Editar <nome>", `aria-expanded` com a ficha
  aberta) e depois o **"Ver no mapa" só com o ícone** (`botoesDaLinha`), para a coluna presa não crescer:
  no PC a célula fica como antes com o "Ver no mapa" escrito (o "Editar…" ocupa o lugar do texto); no
  telemóvel a etiqueta do nome passa a 8 rem a editar e a coluna cresce ~1 rem. "Editar…" abre a **mesma
  ficha editável da pessoa** do Mapa e do Quadro (`PainelFoco`: lápis em cada campo — nº, nome, apelidos,
  nome no mapa, cliente, telefone, carta —, "Marcar indisponível…", "Mudar casa/carrinha/obra…", "Tornar
  condutor", "Saiu da empresa…"), posta como as da casa e da carrinha (no PC à direita, arrastável; no
  telemóvel em baixo, recolhida), com a linha da pessoa realçada (barra azul-escura) e à vista
  (`manterLinhaAVista`), também quando a ficha muda o que ordena ou filtra a Tabela (o nome com a Tabela por
  Nome, a casa com o filtro Casa…): a linha volta a pôr-se à vista e, se deixou de passar os filtros sem
  ninguém mexer neles, limpam-se com o aviso "Filtros limpos para mostrar …" (`acaoLinhaDaFicha`; quem
  escreve no filtro fica com ele). Só esse botão a abre (`useEstadoTabela.editar`, `editarQueFica`,
  `haFichaDaPessoa`): a pesquisa do cabeçalho e os nomes continuam só a realçar a linha, e o clique numa
  linha só a seleciona (com a ficha aberta não lhe tira o foco: `cliqueTiraOFoco`). ✕ e Esc fecham-na e
  devolvem o foco do teclado ao "Editar…" da linha; o foco ir para outra coisa (pesquisa, ligações da
  ficha) esquece-a; Guardar e Cancelar (sair do modo de edição) fecham-na. Isto vale também com a Tabela
  noutra vista (`seguirEditar` segue a loja): "Editar…", Quadro, ✕ e depois o nome dela no Quadro não
  reabre a ficha ao voltar à Tabela; se o foco ficou nela (Editar… → Quadro → Tabela), a ficha continua.
  Depois de "Saiu da empresa…" a
  ficha fecha, a pessoa deixa de estar em foco e a linha esconde-se (salvo com "Mostrar quem saiu", onde tem
  só "Voltou à empresa…", como antes; quem saiu não tem "Editar…"). Fora do modo de edição continua só o
  "Ver no mapa", com o texto no PC. Células **Casa, Carrinha, Obra** passam a listas
  (`<select>` nativo: funciona no telemóvel e no teclado) com a lotação da simulação ("Casa 2 · 6/6"), e
  "Fora das casas CMF" / "Sem transporte da empresa" / "Sem obra"; mudar = `moverComAviso` (um passo, Ctrl+Z
  desfaz). **Condutor**: botão que liga/desliga (`definirCondutorComAviso`). Células alteradas a âmbar com
  "antes: …". Seleção + "Mover para…" da barra âmbar para mudar várias. Ao lado das listas Casa e Carrinha,
  um botão pequeno (ícone da casa, ou do carro/carrinha de lado) abre a ficha sem selecionar a linha. Na barra,
  "Confirmar todas as sugestões (N)" (o mesmo diálogo do Quadro por carrinhas e da lista lateral).
- O campo da Tabela passa a ser só um **filtro** ("Filtrar a tabela…"); "/" e Ctrl+K vão para a pesquisa do
  cabeçalho em todas as vistas. Mostrar alguém escondido pelos filtros limpa-os (com aviso curto).
- **Filtros de escolha múltipla (04/10/2026)**: Cliente, Casa, Carrinha e **Obra** (`FiltroMultiplo`), cada
  um com várias escolhas (ex.: Casa 1 + Casa 3). Dentro do mesmo filtro é OU, entre filtros é E. Opções
  especiais "Fora das casas CMF", "Sem transporte da empresa" e "Sem obra"; cada opção mostra o nº de pessoas
  de todas as linhas (não muda ao escolher); as obras vêm por cliente, com a marca. Sem obras na BD, "Obra:
  sem obras" desativado. A contagem passa a "N de M pessoas" e há "Limpar filtros" quando há algum ativo. No
  telemóvel os quatro ficam em 2×2.
- **Excel**: na Tabela com filtros, a folha Pessoas leva só as linhas filtradas, pela ordem da Tabela, e o
  ficheiro diz "(filtrado)"; as folhas Casas e Carrinhas ficam inteiras. Sem filtros é igual a antes.

## M2 nas vistas (05/10/2026)

Desenho em `docs/m2.md`; aqui só o que muda na Tabela, no Quadro e na reunião.
- **Tabela**: no modo de edição, "Editar…" a seguir ao nome abre a ficha editável da pessoa (05/10/2026;
  secção Tabela). Coluna "Indisponível" ("até 12/10", "sem regresso"; "a partir de 20/10" a cinzento quando só
  há um período futuro; ordena pela data de regresso) e filtro "Indisponível" (Indisponíveis hoje,
  Disponíveis hoje, Com períodos futuros). No modo de edição a célula tem "Marcar…" ou "Já voltou".
  "Mostrar quem saiu" (não é um filtro: "Limpar filtros" não a tira) junta quem saiu da empresa, esbatido e
  só de leitura (sem caixa de seleção nem listas); o Excel leva essas linhas com "(saiu)" no nome. Excel:
  colunas "Indisponível até" e, nas folhas Casas e Carrinhas, "Problemas abertos". Mostrar uma obra (pesquisa,
  obra criada) realça as linhas de quem lá trabalha.
- **Quadro**: 3.º agrupamento **Obras** (um bloco por obra, por cliente, "Sem obra" no fim; cada nome com a
  casa de onde vem). Ícone de problemas nos blocos. Numa carrinha, quem está indisponível hoje não conta na
  pastilha (8/9) mas continua desenhado na sua caixa: as caixas são as do cartão do Mapa.
- **Ficha da vista**: no telemóvel, enquanto há um campo aberto, ocupa o ecrã todo (abaixo de 640 px); o aviso
  curto vai para cima quando há uma ficha aberta, para não a tapar.
- **Reunião**: só leitura; vê as marcas ("até 12/10") e os ícones; o cabeçalho tem "Histórico" (sem
  "Reverter…"). "Ecrã inteiro" e "Histórico" ficam só com o ícone (com os nomes, a 1920 px fora do ecrã
  inteiro os filtros passavam a uma 2.ª linha).

## O que fica igual

O Mapa e a lista lateral (pesquisa, ficha — agora também arrastável no PC —, cartões, arrastar, caixa de
seleção, realce por cliente da legenda), o modo reunião
(só leitura), a barra âmbar (no telemóvel sem o lápis e com "Sem alterações", para "Edição" e a pastilha
caberem na 1.ª linha), os diálogos, os atalhos, o rascunho e a gravação. A página nunca desliza na
horizontal (375, 1366 e 1920 px): a Tabela desliza dentro do seu contentor.
