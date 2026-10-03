# Cores dos clientes

**Paleta clara de 04/10/2026.** O Rafael: *"não gosto que os nomes uns sejam a branco e outros a preto;
percebo porque o fazes, por isso arranja uma solução; talvez meter todas as cores mais claras seja
opção"*. Todas as cores passaram a ser claras e **todos os nomes usam o mesmo texto**, o quase-preto da
marca CMF **#1C1C1B** (`COR_TEXTO_NOMES` em `src/dominio/cores.ts`).

As cores valem em `dados-iniciais/clientes.json` (campo `cor`); a base de dados recebe-as pela
sincronização. A cor de cada nome é sempre a do cliente (ver `CLAUDE.md`). A primeira paleta (03/10/2026,
cores escuras e médias com texto branco ou preto) está no fim, para referência.

## Porque o texto é igual em todos

- Com texto branco nuns nomes e preto noutros, a lista parecia ter dois tipos de nomes, e o olho lia essa
  diferença como se significasse alguma coisa (não significava: era só a cor do cliente que o exigia).
- Com um texto só, a única coisa que muda de nome para nome é a cor do fundo e a sigla — exatamente a
  informação que existe.
- Para o mesmo texto escuro se ler em todos, **todas as cores têm de ser claras**: a cor mais escura
  possível com 7:1 de contraste (AAA) tem claridade L\* ≈ 68. Por isso desapareceram o azul-marinho e o
  cinzento escuro da paleta anterior.
- O quase-preto #1C1C1B é o do manual de marca (o texto sobre o laranja CMF); é ligeiramente mais suave
  do que o preto puro e lê-se igual.

## Regras seguidas

1. **Partir da cor da própria empresa** quando a há (logótipo ou site oficial): mantém-se o **tom** e
   muda-se a claridade/saturação até o texto escuro se ler. O Enquadramento (pessoal da CMF) usa a cor da
   marca CMF.
2. **Contraste de #1C1C1B sobre a cor ≥ 7:1** (WCAG AAA) sempre que possível; **nunca abaixo de 5,5:1**.
   Todas as sete ficaram ≥ 7:1.
3. **7 cores bem distintas**: distância CIEDE2000 (ΔE00) entre todos os pares **≥ 15** (alvo ≥ 20) na
   visão normal, e **≥ 10** com deuteranopia e protanopia simuladas.
4. **Tons pastel firmes, sóbrios**: nem lavados nem fluorescentes; nenhuma cor acinzentada (croma ≥ 20,
   para nada parecer "desativado"); todas a ΔE00 ≥ 15 do branco dos cartões, para o nome se ver como um
   bloco de cor (o contorno fino dos nomes ajuda sobre o branco e sobre o mapa cinzento).
5. **Não confundir com a lotação**: as pastilhas da lotação têm agora um desenho oposto ao dos nomes
   (secção "Lotação").

O teste `src/dominio/cores.test.ts` verifica as regras 2, 3 e 4 sobre `clientes.json`.

## As cores

| Cliente | Cor | Tom de origem | Contraste com #1C1C1B | Porquê |
| --- | --- | --- | --- | --- |
| Costantini | **#F28A7E** coral | Vermelho da marca **#EB1D27** (logótipo, [costantini.eu](https://costantini.eu/)), tom 34° | **7,08:1** | O mesmo vermelho (tom 32°), clareado só até ao limite dos 7:1. Não mais claro: com daltonismo vermelho-verde o coral e o verde da Galère só se distinguem pela claridade, por isso o coral é dos "médios" e o verde dos "claros". |
| Galère | **#B2ECBC** verde-menta | Verde da marca **#008E3E** (logótipo, [galerelux.lu](https://galerelux.lu/galere-lux/)), tom 147° | **12,68:1** | O mesmo verde (tom 148°), claro. Mais escuro ficaria colado ao coral para os daltónicos e ao azul-petróleo da Mersch na visão normal. |
| A+P Kieffer | **#84A6F4** azul-pervinca | Azul-marinho da marca **#013067** (logótipo, [apko.lu](https://apko.lu/)), tom 285° | **7,10:1** | O azul-marinho não pode levar texto escuro; fica o mesmo azul (tom 281°), clareado até aos 7:1. O vermelho do símbolo da marca continua de fora (é o da Costantini). |
| Phillipe BTP | **#EACBF7** lilás | Sem marca encontrada; mantém o violeta da paleta anterior (#A47FB1, tom 318°) | **11,68:1** | O mesmo violeta (tom 317°), claro. Tem de ser bem mais claro do que o azul A+P: com protanopia o lilás e o azul ficam ambos azulados e só a claridade os separa. |
| Kisch | **#FCE55E** amarelo | Amarelo da marca **#E5D148** (logótipo, [kisch.lu](https://www.kisch.lu/fr/); *empresa provável, a confirmar*), tom 97° | **13,41:1** | O mesmo amarelo (tom 96°), um pouco mais claro e limpo. Com o amarelo exato da marca, Kisch e Enquadramento ficavam a ΔE00 8,7 com deuteranopia (o laranja e o amarelo juntam-se); assim ficam a 13,3. |
| Enquadramento | **#F39200** laranja CMF | Laranja da marca CMF **#F39200** (manual de marca, `01 Marca`) | **7,25:1** | Cor exata da marca: o Enquadramento é o pessoal da própria CMF. O par laranja + #1C1C1B é o do manual (7,25:1). É a cor mais viva da paleta; como são poucas pessoas, não pesa no mapa. É também a cor do modo de edição, mas aí aparece como barra e contorno, nunca como bloco com nome e sigla. |
| Mersch | **#5CB4B8** azul-petróleo | Sem marca encontrada | **7,05:1** | Cor livre: o único tom que sobra longe do verde, do azul e do lilás. O azul-céu da paleta anterior ficaria colado ao novo azul da A+P Kieffer. |

Claridades (L\*): coral 68,4 · pervinca 68,5 · laranja 69,2 · petróleo 68,3 (os "médios") e menta 88,5 ·
lilás 85,5 · amarelo 90,6 (os "claros"). Ver "Daltonismo" abaixo para o porquê dos dois grupos.

Distância ao branco dos cartões (ΔE00): mínimo **20,7** (lilás); ao cinzento claro do mapa (#E0E0E0):
mínimo 18,8. Croma mínimo: 25,6 (lilás).

O ponto de "alterado, por guardar" do modo de edição (amber-500, em `NomeChip`) é praticamente o laranja
do Enquadramento (ΔE00 2,5). Num nome do Enquadramento vê-se graças ao anel branco à volta do ponto, que
fica meio fora do nome (confirmado nas capturas); se um dia esse anel sair, o ponto tem de mudar de cor.

### Empresas não encontradas com certeza

- **Phillipe BTP** (ou Philippe): não há site nem logótipo. Os candidatos são a *PHILIPPE BTP* SASU de
  Grundviller (Mosela, perto de Himeling; 1–2 empregados, alvenaria e gros-œuvre — [societe.com](https://www.societe.com/societe/philippe-btp-814131751.html))
  e a *Philippi Construction* de Schifflange ([philippi.lu](https://www.philippi.lu/), vermelho #DD0725).
  Nenhum confirmado: o pessoal deste cliente mora sobretudo em Eischen e Michelbouch.
- **Mersch**: não encontrámos uma empresa de construção chamada só "Mersch". Há a *Mersch & Schmitz*
  (instalações técnicas, Luxemburgo, vermelho #BF1C1C — [mersch-schmitz.lu](https://www.mersch-schmitz.lu/))
  e várias empresas da localidade de Mersch. Nenhuma confirmada.
- Se o Rafael confirmar uma destas, a cor pode mudar — mas as duas candidatas são vermelhas, que já é a
  Costantini, por isso o lilás e o azul-petróleo continuam a ser a melhor escolha.

## Distâncias entre as cores (ΔE00)

Siglas: CO Costantini, GA Galère, AK A+P Kieffer, PB Phillipe BTP, KI Kisch, EN Enquadramento, ME Mersch.

**Visão normal** — mínimo **23,3** (GA/ME); os pares mais próximos: GA/ME 23,3, AK/PB 23,6, AK/ME 24,4,
GA/KI 24,5, CO/EN 25,3.

| | CO | GA | AK | PB | KI | EN | ME |
|---|---|---|---|---|---|---|---|
| **CO** | — | 50,5 | 37,8 | 27,7 | 42,4 | 25,3 | 45,9 |
| **GA** | 50,5 | — | 42,2 | 35,4 | 24,5 | 42,3 | 23,3 |
| **AK** | 37,8 | 42,2 | — | 23,6 | 57,5 | 50,5 | 24,4 |
| **PB** | 27,7 | 35,4 | 23,6 | — | 50,8 | 44,9 | 36,7 |
| **KI** | 42,4 | 24,5 | 57,5 | 50,8 | — | 26,0 | 39,9 |
| **EN** | 25,3 | 42,3 | 50,5 | 44,9 | 26,0 | — | 44,0 |
| **ME** | 45,9 | 23,3 | 24,4 | 36,7 | 39,9 | 44,0 | — |

**Deuteranopia** (o daltonismo vermelho-verde, nas suas formas, afeta cerca de 8 % dos homens) —
mínimo **12,9** (CO/GA); os pares mais próximos: CO/GA 12,9, KI/EN 13,3, AK/ME 13,4, CO/EN 14,1, PB/ME 14,1.

| | CO | GA | AK | PB | KI | EN | ME |
|---|---|---|---|---|---|---|---|
| **CO** | — | 12,9 | 43,9 | 33,3 | 18,3 | 14,1 | 29,6 |
| **GA** | 12,9 | — | 39,6 | 25,5 | 17,9 | 22,2 | 27,5 |
| **AK** | 43,9 | 39,6 | — | 17,6 | 57,9 | 56,8 | 13,4 |
| **PB** | 33,3 | 25,5 | 17,6 | — | 41,9 | 44,1 | 14,1 |
| **KI** | 18,3 | 17,9 | 57,9 | 41,9 | — | 13,3 | 42,9 |
| **EN** | 14,1 | 22,2 | 56,8 | 44,1 | 13,3 | — | 40,7 |
| **ME** | 29,6 | 27,5 | 13,4 | 14,1 | 42,9 | 40,7 | — |

**Protanopia** — mínimo **13,2** (PB/ME e AK/PB); os pares mais próximos: PB/ME 13,2, AK/PB 13,2,
GA/KI 16,2, AK/ME 16,8, CO/EN 17,7.

| | CO | GA | AK | PB | KI | EN | ME |
|---|---|---|---|---|---|---|---|
| **CO** | — | 19,1 | 36,9 | 32,1 | 25,9 | 17,7 | 19,4 |
| **GA** | 19,1 | — | 41,5 | 30,8 | 16,2 | 24,1 | 24,9 |
| **AK** | 36,9 | 41,5 | — | 13,2 | 56,3 | 54,3 | 16,8 |
| **PB** | 32,1 | 30,8 | 13,2 | — | 44,8 | 46,6 | 13,2 |
| **KI** | 25,9 | 16,2 | 56,3 | 44,8 | — | 17,8 | 36,5 |
| **EN** | 17,7 | 24,1 | 54,3 | 46,6 | 17,8 | — | 34,2 |
| **ME** | 19,4 | 24,9 | 16,8 | 13,2 | 36,5 | 34,2 | — |

**Tritanopia** (muito rara; só para referência) — mínimo **3,3** (CO/EN: o coral e o laranja juntam-se),
depois AK/ME 7,9 e PB/KI 10,3. Afastá-los obrigava a um coral acinzentado ("lavado") e baixava a
deuteranopia e a protanopia, que são muito mais frequentes; a sigla resolve (ver abaixo).

### Daltonismo

- Com todas as cores claras, só há a metade clara das claridades para jogar (L\* 68 a 91). Para quem
  confunde vermelho e verde, as cores ficam reduzidas a **claridade + amarelo/azul**: o coral, o laranja,
  o amarelo e o verde passam a tons de amarelo-acastanhado; o azul, o lilás e o petróleo a tons de azul.
- Por isso a paleta tem **dois grupos de claridade** e, em cada um, alterna tons "quentes" e "frios":
  médios (L\* ≈ 68): coral, laranja | pervinca, petróleo; claros (L\* 85–91): amarelo, menta | lilás.
  O coral e a menta (12,9), e o amarelo e o laranja (13,3), separam-se pela claridade; o laranja e o coral
  pela força da cor (laranja muito saturado, coral suave).
- As margens são menores do que na paleta escura anterior (mínimos 15,5 e 17,1), porque a paleta anterior
  usava toda a escala de claridades. Continuam acima do alvo (10).
- Duas cores perdem quase toda a cor para um daltónico: o azul-petróleo da Mersch fica cinzento (croma
  6 com protanopia, 13 com deuteranopia; está perto do "ponto neutro" destas visões) e o coral da
  Costantini fica cinzento-azeitona com protanopia (croma 17). Continuam a distinguir-se dos outros
  clientes (mínimos acima) e têm texto quase-preto, por isso não parecem "desativadas" (um nome apagado
  pela legenda fica a 20 % de opacidade, muito mais claro).
- **A cor nunca é a única pista**: cada nome leva a sigla do cliente (CO, GA, AK…), a legenda é clicável
  (destaca um cliente e apaga os outros) e a lotação tem símbolos.
- Simulação: matrizes de Machado, Oliveira e Fernandes (2009), severidade 1, aplicadas em RGB linear;
  ΔE00 sobre CIELAB (D65). Contraste com a fórmula WCAG de `src/dominio/cores.ts`. As capturas reais foram
  feitas também com a deuteranopia e a protanopia emuladas no Chrome.

## Lotação (src/cliente/comum/lotacao.ts)

Os nomes são agora **todos blocos de cor clara com texto escuro**. As pastilhas da lotação da versão
anterior (fundo claro + contorno e texto escuros) passavam a parecer nomes — e o fundo rosa-salmão de
"gente a mais" ficava colado ao coral da Costantini. Por isso as pastilhas usam o **desenho oposto** ao
de um nome:

| Nível | Símbolo | Pastilha | Número/fundo |
| --- | --- | --- | --- |
| com lugares livres | ○ | **branca**, contorno e número green-800 | 7,1:1 |
| cheio | ● | **branca**, contorno amber-600, número amber-800 | 7,1:1 |
| gente a mais | ▲ | **cheia** red-700, contorno red-800, número branco | 6,4:1 |

- **Nenhum nome é branco nem escuro**: os nomes têm claridade entre 68 e 91 e texto quase-preto; uma
  pastilha é branca (com o número colorido) ou vermelho-escura (com o número branco). O fundo branco fica a
  ΔE00 ≥ 20,7 de todos os clientes na visão normal (13,8 com deuteranopia, 15,8 com protanopia) e o
  vermelho cheio a ≥ 29,1 (24,7 e 34,2).
- **"Gente a mais" é a única pastilha cheia**: é o aviso que mais importa ver, e distingue-se das outras
  duas em qualquer visão (ΔE00 do fundo ≥ 47).
- **"Livre" e "cheio"** (as duas brancas) distinguem-se pelo contorno: verde-escuro (green-800, L\* 37) e
  âmbar mais claro (amber-600, L\* 60) — ΔE00 53,6; com deuteranopia 31,4; com protanopia 17,2 — e, sempre,
  pelo símbolo ○ / ●. O contorno do "livre" é o green-800 e não o green-700: com o green-700 os dois
  contornos ficavam com quase a mesma claridade na protanopia (L\* 49 e 54; ΔE00 7,2) e só o símbolo os
  separava. O contorno vê-se sobre o branco do cartão (7,1:1 e 3,2:1, acima dos 3:1 para elementos
  gráficos).
- A especificação mantém-se: verde com lugares livres, âmbar cheio, vermelho a mais.
- O fantasma do arrastar (`src/cliente/arrastar/arrastar.css`, `.arrasto-fantasma__resultado`) tem de usar
  as mesmas três aparências (branca com contorno #016630 / #e17100, ou cheia #c10007 com número branco).
  Enquanto tiver o rosa-salmão antigo (#ffa2a2), o resultado "gente a mais" do arrastar fica a ΔE00 7,5 do
  coral da Costantini — mesmo ao lado do nome arrastado.
- O teste `src/cliente/comum/lotacao.test.ts` verifica o contraste do número, que nenhuma pastilha tem o
  desenho de um nome (fundo branco ou escuro, fora da faixa de claridade dos nomes) e que os níveis se
  distinguem entre si, também com daltonismo simulado.

Os avisos de contrato ("8 para contrato de 4 (tolerado 6)") continuam etiquetas de texto com fundo claro
e contorno (âmbar ou vermelho): são frases com sinal de aviso, não se confundem com nomes. Atenção: o
fundo amber-100 do aviso fica perto da menta da Galère com daltonismo (ΔE00 6,7 com deuteranopia, 3,3 com
protanopia). O que os separa é a forma — frase que começa por "!" ou "!!", texto castanho ou vermelho,
contorno colorido, sem sigla — e o sítio (por baixo do nome da casa, nunca entre os nomes).

## Sigla nos nomes

A sigla (CO, GA…) aparece em `NomeChip` a 90 % de opacidade sobre a cor do cliente. Com o texto
#1C1C1B em todos, o pior caso é **5,99:1** (Mersch); o nome em si tem sempre ≥ 7:1.

## Mudar uma cor no futuro

Editar `dados-iniciais/clientes.json` e correr `npx vitest run src/dominio/cores.test.ts
src/cliente/comum/lotacao.test.ts`. Os testes exigem: contraste com #1C1C1B ≥ 5,5:1 (o alvo é 7:1);
ΔE00 ≥ 15 entre clientes na visão normal e ≥ 10 com deuteranopia e protanopia; ΔE00 ≥ 15 do branco;
croma ≥ 20; claridade entre 60 e 95 (para nunca parecer uma pastilha da lotação). Depois atualizar as
tabelas acima.

## Paleta anterior (03/10/2026), para referência

Cores escuras e médias, texto preto ou branco conforme a cor (`corTexto`): Costantini #C62725 (branco),
Galère #4FA36B (preto), A+P Kieffer #013067 (branco), Phillipe BTP #A47FB1 (preto), Kisch #E5D148
(preto), Enquadramento #575756 (cinzento CMF, branco), Mersch #91CCF3 (preto). Mínimos ΔE00: 24,9
(normal), 15,5 (deuteranopia), 17,1 (protanopia). Foi substituída porque o Rafael não quer texto de duas
cores nos nomes. Antes dela eram as cores do Excel do Michael: #ED7D31, #808080, #B4C6E7, #C6E0B4,
#A3DBFF, #00B0F0, #FFD966 (mínimo ΔE00 10,8; 4,3 com deuteranopia).
