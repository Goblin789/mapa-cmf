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
- **`NomeVista`** (`vistas/pecas.tsx`): `interativo` = porta-se como o `NomeChip` (fora da edição o clique
  abre/fecha a ficha; na edição seleciona com clique, Ctrl/⌘+clique, Shift+clique pela ordem do
  `ContextoOrdemPessoas`, e põe em foco), anel azul se selecionado, anel escuro se em foco, ponto âmbar se
  alterado; `arrastavel` = `data-arrastavel-pessoa` no modo de edição (rato e toque longo, pelo motor);
  `seguirLegenda` = apaga-se quando a legenda acende outro cliente. Sem `interativo` é o nome de sempre
  (reunião).
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
  barra.
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

- **Ler**: clicar numa linha abre a ficha da pessoa; os valores de Casa e Carrinha são ligações que abrem a
  ficha da casa/carrinha. Linha em foco realçada; com uma casa/carrinha em foco, as linhas dela levemente.
- **Editar**: coluna de caixas de seleção (e "todas as visíveis" no cabeçalho); clique na linha = seleção
  como nos nomes (Ctrl/⌘, Shift pela ordem visível) + ficha. Células **Casa, Carrinha, Obra** passam a listas
  (`<select>` nativo: funciona no telemóvel e no teclado) com a lotação da simulação ("Casa 2 · 6/6"), e
  "Fora das casas CMF" / "Sem transporte da empresa" / "Sem obra"; mudar = `moverComAviso` (um passo, Ctrl+Z
  desfaz). **Condutor**: botão que liga/desliga (`definirCondutorComAviso`). Células alteradas a âmbar com
  "antes: …". Seleção + "Mover para…" da barra âmbar para mudar várias.
- O campo da Tabela passa a ser só um **filtro** ("Filtrar a tabela…"); "/" e Ctrl+K vão para a pesquisa do
  cabeçalho em todas as vistas. Mostrar alguém escondido pelos filtros limpa-os (com aviso curto).

## O que fica igual

O Mapa e a lista lateral (pesquisa, contadores, ficha, cartões, arrastar, caixa de seleção), o modo reunião
(só leitura), a barra âmbar (no telemóvel sem o lápis e com "Sem alterações", para "Edição" e a pastilha
caberem na 1.ª linha), os diálogos, os atalhos, o rascunho e a gravação. A página nunca desliza na
horizontal (375, 1366 e 1920 px): a Tabela desliza dentro do seu contentor.
