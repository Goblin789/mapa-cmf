# Tabela e Quadro editam como o Mapa

Pedido do Rafael (04/10/2026): clicar ou editar na Tabela ou no Quadro **nunca** leva para o Mapa; a Tabela e
o Quadro têm a ficha, a pesquisa e o modo de edição com as mesmas capacidades do mapa e da lista lateral.

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
- **Mapa**: `noMapa: 'ir'` (pesquisa, contadores) leva o mapa até lá com `pedirIrPara`, como sempre;
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
| Casas no popover "Livres nas casas" | `mostrarElemento(casa, { noMapa: 'ir' })` |
| Ligações da ficha (casa, carrinha, condutor…) | `mostrarElemento(x, { noMapa: 'so-foco' })` |
| Nomes dentro da ficha da vista (moradores, passageiros: `NomeChip`) | o `NomeChip` muda o foco; a ficha apanha o clique e chama `seguirPessoaEmFoco(id)` (pedido à vista se a pessoa ficou em foco) |
| Clique num nome / bloco / linha da vista | `definirFoco` (já está à vista: não desliza) |

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
- **`NomeVista`** (`vistas/pecas.tsx`): `interativo` = porta-se como o `NomeChip` (fora da edição o clique
  abre/fecha a ficha; na edição seleciona com clique, Ctrl/⌘+clique, Shift+clique pela ordem do
  `ContextoOrdemPessoas`, e põe em foco), anel azul se selecionado, anel escuro se em foco, ponto âmbar se
  alterado; `arrastavel` = `data-arrastavel-pessoa` no modo de edição (rato e toque longo, pelo motor);
  `seguirLegenda` = apaga-se quando a legenda acende outro cliente. Sem `interativo` é o nome de sempre
  (reunião). `nome` = o texto a mostrar (e o início do title) e `semSigla` = sem a sigla do cliente: a Tabela
  usa-os para o nome completo; por omissão é o nome curto com a sigla (Quadro, reunião).
- **`Legenda lugar="barra"`**: a legenda dos clientes dentro da barra do Quadro. No PC uma linha compacta
  ("Clientes", a marca de cada cliente com o nome e o nº no título, "Todos" quando há um aceso); no telemóvel
  um botão "Clientes ▾" que abre a lista do mapa num popover fixo (fecha fora, com Esc ou ao deslizar).
- **Contadores no telemóvel fora do Mapa**: numa só linha que desliza de lado (no Mapa continuam em grelha
  de 3, porque lá a página cresce e o cabeçalho sobe). Na Tabela e no Quadro o cabeçalho fica sempre à vista e
  a grelha comia uns 85 px à vista e à ficha. Os popovers ficam fixos (a linha cortava-os) e fecham ao deslizar.
- `NotaEdicao` (com "Ir para o mapa") saiu; cada vista mostra uma dica curta no modo de edição.

## Quadro

- **Ler**: clicar num nome abre a ficha da pessoa; clicar no título de um bloco abre a da casa/carrinha (já
  não "Ver no mapa"). O que está em foco tem um anel; casa/carrinha em foco que não tem bloco no agrupamento
  atual (ex.: casa no Quadro por carrinhas) realça os nomes dos moradores/passageiros. Legenda dos clientes na
  barra. Se não houver nada a que chegar (casa sem moradores e sem carrinhas a dormir lá no Quadro por
  carrinhas; carrinha sem passageiros e sem casa no Quadro por casas), um aviso curto diz porquê
  (`avisoSemNadaNoQuadro`, `useUiEdicao.avisar`); o agrupamento não muda.
- **Lugares livres**: as casas **e as carrinhas** mostram um "livre" tracejado por lugar livre, até à lotação
  (com gente a mais, nenhum: a pastilha fica vermelha). Estão dentro do bloco, por isso também são alvos de
  largar no modo de edição.
- **Ajuste ao ecrã** (`DEGRAUS_AJUSTE` em `agrupamentoQuadro.ts`): três modos — completo, **livres numa linha**
  (os livres de cada bloco juntam-se numa só linha tracejada, "4 livres", e saem o "Ninguém." e o "por
  definir") e compacto (sem livres). PC: completo de 12 a 16 px (um "livre" por lugar, como o Rafael pediu),
  senão 14 px completo a deslizar. Reunião: completo de 14 a 30, senão livres numa linha de 13 a 30, senão compacto
  de 13 a 30, senão 13 a deslizar. A linha "N livres" também serve para largar.
- **Editar** (sem mudar nada no motor): nomes `NomeVista interativo arrastavel seguirLegenda` com
  `ContextoOrdemPessoas` por bloco; cada bloco é um alvo `data-alvo={bloco.chave}` (a chave do bloco —
  "casa:<id>", "carrinha:<id>", "fora", "sem-transporte" — já é uma `chaveAlvo`), com o realce de "por cima"
  e a previsão do motor no fantasma ("CF 5005: 6 + 3 = 9/9"); no telemóvel, toque longo; perto da borda o
  Quadro desliza sozinho (o motor desliza o contentor com scroll). **Shift+arrastar** no fundo do Quadro =
  caixa de seleção (funções puras de `mapa/caixaSelecao.ts`). "Mover para…" pela barra âmbar. Rodapé das
  carrinhas: "Mudar" onde dorme (`abrirDormida`); no Quadro por carrinhas, "Confirmar todas as sugestões (N)".
  Condutor pela ficha (como no mapa). Bloco com alterações por guardar: contorno âmbar e "●". Pastilhas e
  contadores já mostram a simulação.
- **Reunião**: só leitura (nomes e títulos não clicáveis, sem alvos, sem ficha), mas atende `useAoMostrar`
  (casa do popover dos contadores: desliza e realça no Quadro, sem saltar para o mapa).
- O mapa escondido não se pode deslocar durante um arrasto no Quadro (`mapa/interacoesEdicao.ts` ignora
  quando o mapa está `inert`).

## Tabela

- **Nome**: uma só etiqueta `NomeVista nome=… semSigla` (fundo da cor do cliente, volante, "?", ponto âmbar)
  com o **nome completo com maiúsculas normais** (`dominio/nomes.ts`, só para mostrar; sem nome completo, o
  nome curto) e sem a sigla (a coluna Cliente está ao lado). A Tabela ordena por ele; o filtro encontra também
  pelo nome curto e pelos nomes alternativos. Largura da etiqueta: 12 rem no telemóvel (9 rem a editar),
  16 rem no PC, 18,5 rem a partir de 1536 px; o nome inteiro está no title. A folha Pessoas do Excel segue a
  Tabela (uma só coluna Nome).
- **Ler**: clicar numa linha abre a ficha da pessoa; os valores de Casa e Carrinha são ligações que abrem a
  ficha da casa/carrinha. Linha em foco realçada; com uma casa/carrinha em foco, as linhas dela levemente.
  Com um cliente aceso na legenda (no Mapa ou no Quadro), o conteúdo das linhas dos outros clientes fica a
  25 % (nunca a selecionada nem a em foco) e a barra mostra "Só <cliente> · Todos" (no telemóvel só a marca
  e "Todos").
- **Editar**: coluna de caixas de seleção (e "todas as visíveis" no cabeçalho); clique na linha = seleção
  como nos nomes (Ctrl/⌘, Shift pela ordem visível) + ficha. Células **Casa, Carrinha, Obra** passam a listas
  (`<select>` nativo: funciona no telemóvel e no teclado) com a lotação da simulação ("Casa 2 · 6/6"), e
  "Fora das casas CMF" / "Sem transporte da empresa" / "Sem obra"; mudar = `moverComAviso` (um passo, Ctrl+Z
  desfaz). **Condutor**: botão que liga/desliga (`definirCondutorComAviso`). Células alteradas a âmbar com
  "antes: …". Seleção + "Mover para…" da barra âmbar para mudar várias. Ao lado das listas Casa e Carrinha,
  um botão pequeno (ícone da casa, ou do carro/carrinha de lado) abre a ficha sem selecionar a linha. Na barra,
  "Confirmar todas as sugestões (N)" (o mesmo diálogo do Quadro por carrinhas e da lista lateral).
- O campo da Tabela passa a ser só um **filtro** ("Filtrar a tabela…"); "/" e Ctrl+K vão para a pesquisa do
  cabeçalho em todas as vistas. Mostrar alguém escondido pelos filtros limpa-os (com aviso curto).

## O que fica igual

O Mapa e a lista lateral (pesquisa, contadores, ficha, cartões, arrastar, caixa de seleção), o modo reunião
(só leitura), a barra âmbar (no telemóvel sem o lápis e com "Sem alterações", para "Edição" e a pastilha
caberem na 1.ª linha), os diálogos, os atalhos, o rascunho e a gravação. A página nunca desliza na
horizontal (375, 1366 e 1920 px): a Tabela desliza dentro do seu contentor.
