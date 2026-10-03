# Cores dos clientes

Escolhidas a 03/10/2026, a pedido do Rafael ("escolhe tu as melhores cores; se quiseres vai buscar as
próprias cores das empresas"). Valem em `dados-iniciais/clientes.json` (campo `cor`); a base de dados
recebe-as na importação. A cor de cada nome é sempre a do cliente (ver `CLAUDE.md`).

## Regras seguidas

1. **Partir da cor da própria empresa** quando a encontrámos no site oficial (logótipo SVG ou folha de
   estilos). Quando a cor da marca não cumpre as outras regras, mantém-se o tom e muda-se só a
   luminosidade/saturação.
2. **Ler-se o nome**: texto preto ou branco (o que `corTexto` escolher) com contraste **≥ 4,5:1** (WCAG AA).
3. **7 cores bem distintas**: distância CIEDE2000 (ΔE00) entre todos os pares — alvo ≥ 20, mínimo 12 —
   também com daltonismo simulado (deuteranopia e protanopia; a tritanopia mede-se como extra).
4. **Aspeto profissional**: nada fluorescente; os nomes aparecem como blocos de cor sobre um mapa cinzento
   claro e cartões brancos.
5. **Não confundir com a lotação** (verde/âmbar/vermelho): ver a secção "Lotação" abaixo.

## As cores

| Cliente | Cor escolhida | Cor da marca encontrada (fonte) | Texto · contraste | Porquê |
| --- | --- | --- | --- | --- |
| Costantini | **#C62725** vermelho | **#EB1D27** (vermelho do "C" do logótipo e da classe `.text-red` do site) — [costantini.eu](https://costantini.eu/), folha `styles.min.css` | branco · 5,65:1 | O mesmo tom (h 35°), mais escuro. O vermelho da marca só dá 4,74:1 com preto e 4,43:1 com branco (no limite ou abaixo); escurecido, o texto branco lê-se bem. E tinha de ficar bem mais escuro do que o verde da Galère para os daltónicos (deuteranopia: 15,5). |
| Galère | **#4FA36B** verde | **#008E3E** verde (e **#0E3B43** petróleo) — logótipo [Logo_Galere_Lux…svg](https://galerelux.lu/wp-content/uploads/2022/04/Logo_Galere_Lux_horizontal_pour-fond_couleur.svg) e cores globais do site [galerelux.lu](https://galerelux.lu/galere-lux/) | preto · 6,78:1 | O mesmo verde (h 147° → 151°), mais claro: com o verde da marca o branco dá 4,25:1 (reprova) e o preto 4,94:1. Mais claro também o afasta do vermelho Costantini para os daltónicos. O petróleo ficaria colado ao azul-marinho da A+P e ao cinzento CMF. |
| A+P Kieffer | **#013067** azul-marinho | **#013067** azul-marinho das letras e **#E51F2D** vermelho do símbolo — logótipo [apko-logo-100.svg](https://apko.lu/wp-content/uploads/2025/12/apko-logo-100.svg), [apko.lu](https://apko.lu/) (A+P Kieffer Omnitec) | branco · 12,96:1 | Cor exata da marca. O vermelho do símbolo é igual ao da Costantini (ΔE00 1,9), por isso fica o azul-marinho. |
| Phillipe BTP | **#A47FB1** violeta | **Não encontrada** com certeza (ver nota abaixo) | preto · 6,25:1 | Cor livre, no espaço do círculo cromático que ficou vazio, longe de todas as outras e das cores da lotação. |
| Kisch | **#E5D148** amarelo | **#E5D148** amarelo e **#700D17** bordéus — logótipo [kisch-logo-100318.svg](https://www.kisch.lu/images/_KISCH/SVG/kisch-logo-100318.svg), [kisch.lu](https://www.kisch.lu/fr/) (Kisch Constructions, Medernach). *Provável, a confirmar com o Rafael.* | preto · 13,55:1 | Cor exata da marca. O bordéus ficaria colado ao vermelho Costantini. |
| Enquadramento | **#575756** cinzento CMF | Marca CMF (manual de marca, `01 Marca`): laranja **#F39200** e cinzento **#575756** | branco · 7,23:1 | Cinzento exato da marca: neutro, como convém ao pessoal interno não produtivo. O laranja CMF ficava entre o vermelho Costantini e o amarelo Kisch (para os daltónicos os três quase se juntam), é praticamente igual ao âmbar do modo de edição (ΔE00 2,5) e fica reservado para a própria interface (ver "Laranja da marca" no relatório). |
| Mersch | **#91CCF3** azul-céu | **Não encontrada** com certeza (ver nota abaixo) | preto · 12,14:1 | Cor livre, clara, longe de todas as outras. |

Antes eram as cores do Excel do Michael: #ED7D31, #808080, #B4C6E7, #C6E0B4, #A3DBFF, #00B0F0, #FFD966
(mínimo ΔE00 10,8 entre A+P Kieffer e Kisch; 4,3 com deuteranopia).

### Empresas não encontradas com certeza

- **Phillipe BTP** (ou Philippe): não há site nem logótipo. Os candidatos são a *PHILIPPE BTP* SASU de
  Grundviller (Mosela, perto de Himeling; 1–2 empregados, alvenaria e gros-œuvre — [societe.com](https://www.societe.com/societe/philippe-btp-814131751.html))
  e a *Philippi Construction* de Schifflange ([philippi.lu](https://www.philippi.lu/), vermelho #DD0725).
  Nenhum confirmado: o pessoal deste cliente mora sobretudo em Eischen e Michelbouch.
- **Mersch**: não encontrámos uma empresa de construção chamada só "Mersch". Há a *Mersch & Schmitz*
  (instalações técnicas, Luxemburgo, vermelho #BF1C1C — [mersch-schmitz.lu](https://www.mersch-schmitz.lu/))
  e várias empresas da localidade de Mersch. Nenhuma confirmada.
- Se o Rafael confirmar uma destas, a cor pode mudar — mas as duas candidatas são vermelhas, que já é a
  Costantini, por isso o violeta e o azul-céu continuam a ser a melhor escolha.

## Distâncias entre as cores (ΔE00)

Siglas: CO Costantini, GA Galère, AK A+P Kieffer, PB Phillipe BTP, KI Kisch, EN Enquadramento, ME Mersch.

**Visão normal** — mínimo **24,9** (AK/EN):

| | CO | GA | AK | PB | KI | EN | ME |
|---|---|---|---|---|---|---|---|
| **CO** | — | 64,6 | 44,7 | 34,5 | 55,7 | 28,8 | 57,6 |
| **GA** | 64,6 | — | 54,1 | 40,0 | 31,1 | 33,4 | 37,3 |
| **AK** | 44,7 | 54,1 | — | 37,0 | 82,4 | 24,9 | 60,1 |
| **PB** | 34,5 | 40,0 | 37,0 | — | 57,7 | 30,2 | 32,4 |
| **KI** | 55,7 | 31,1 | 82,4 | 57,7 | — | 48,5 | 49,2 |
| **EN** | 28,8 | 33,4 | 24,9 | 30,2 | 48,5 | — | 42,3 |
| **ME** | 57,6 | 37,3 | 60,1 | 32,4 | 49,2 | 42,3 | — |

**Deuteranopia** (o daltonismo vermelho-verde, nas suas formas, afeta cerca de 8 % dos homens) —
mínimo **15,5** (CO/GA e PB/ME):

| | CO | GA | AK | PB | KI | EN | ME |
|---|---|---|---|---|---|---|---|
| **CO** | — | 15,5 | 54,7 | 40,9 | 29,6 | 24,6 | 50,3 |
| **GA** | 15,5 | — | 51,4 | 29,3 | 24,9 | 25,5 | 36,0 |
| **AK** | 54,7 | 51,4 | — | 34,9 | 84,1 | 25,7 | 58,2 |
| **PB** | 40,9 | 29,3 | 34,9 | — | 47,9 | 26,0 | 15,5 |
| **KI** | 29,6 | 24,9 | 84,1 | 47,9 | — | 48,9 | 48,2 |
| **EN** | 24,6 | 25,5 | 25,7 | 26,0 | 48,9 | — | 41,4 |
| **ME** | 50,3 | 36,0 | 58,2 | 15,5 | 48,2 | 41,4 | — |

**Protanopia** — mínimo **17,1** (CO/EN):

| | CO | GA | AK | PB | KI | EN | ME |
|---|---|---|---|---|---|---|---|
| **CO** | — | 27,8 | 41,6 | 42,1 | 44,7 | 17,1 | 55,4 |
| **GA** | 27,8 | — | 54,0 | 35,5 | 20,2 | 30,3 | 37,6 |
| **AK** | 41,6 | 54,0 | — | 30,9 | 78,4 | 23,2 | 58,3 |
| **PB** | 42,1 | 35,5 | 30,9 | — | 50,7 | 26,0 | 18,8 |
| **KI** | 44,7 | 20,2 | 78,4 | 50,7 | — | 48,1 | 46,6 |
| **EN** | 17,1 | 30,3 | 23,2 | 26,0 | 48,1 | — | 42,9 |
| **ME** | 55,4 | 37,6 | 58,3 | 18,8 | 46,6 | 42,9 | — |

**Tritanopia** (rara; só para referência) — mínimo **16,3** (GA/ME).

### Nota sobre o daltonismo

- Para quem confunde vermelho e verde (deuteranopia e protanopia), o vermelho, o laranja, o amarelo e o
  verde passam todos a tons de amarelo-acastanhado e só se distinguem pela **claridade**. Por isso há só
  dois clientes nessa zona com claridades bem diferentes (vermelho Costantini escuro, L\* 44; verde
  Galère médio, L\* 61) mais o amarelo Kisch muito claro (L\* 83); o laranja CMF ficou de fora.
- O violeta (Phillipe BTP) e o azul-céu (Mersch) aproximam-se um do outro (ficam ambos azulados), mas
  diferem na claridade (L\* 58 e 79): 15,5 e 18,8.
- Mesmo assim, **a cor nunca é a única pista**: cada nome leva a sigla do cliente (CO, GA, AK…), a
  legenda é clicável e a lotação tem símbolos.
- Simulação: matrizes de Machado, Oliveira e Fernandes (2009), severidade 1, aplicadas em RGB linear;
  ΔE00 sobre CIELAB (D65). Contraste com a fórmula WCAG de `src/dominio/cores.ts`.

## Lotação (src/cliente/comum/lotacao.ts)

Com um cliente vermelho (Costantini, ΔE00 7 do vermelho antigo da lotação) e um verde (Galère, 6,1 do
verde antigo), as pastilhas da lotação mudaram de **cor cheia** para **fundo claro + contorno e texto
escuros do mesmo tom**, como as etiquetas de estado:

| Nível | Símbolo | Pastilha | Texto/fundo |
| --- | --- | --- | --- |
| com lugares livres | ○ | fundo green-50, texto green-800, contorno green-700 | 6,8:1 |
| cheio | ● | fundo amber-100, texto amber-900, contorno amber-600 | 8,1:1 |
| gente a mais | ▲ | fundo red-300, texto red-950, contorno red-700 | 8,4:1 |

Assim a pastilha nunca parece um nome: os nomes são blocos de cor cheia (claridade 20 a 83) e as
pastilhas são claras, com o texto escuro (ΔE00 ≥ 16 entre o fundo de qualquer pastilha e qualquer
cliente na visão normal; ≥ 13 com deuteranopia e protanopia).

**Os três fundos são de claridades e tons diferentes** (verde quase branco, creme, rosa-salmão), para os
níveis se distinguirem também com daltonismo. Na primeira versão os três eram quase brancos
(green-50, amber-50, red-100): com deuteranopia ficavam a ΔE00 3,6–4,8 uns dos outros e "cheio" e
"gente a mais" só se distinguiam pelo símbolo de 8 px. Agora, entre níveis:

| ΔE00 entre fundos | livre/cheio | livre/a mais | cheio/a mais |
| --- | --- | --- | --- |
| visão normal | 13,9 | 35,9 | 32,5 |
| deuteranopia | 13,4 | 16,6 | 11,7 |
| protanopia | 12,5 | 17,8 | 17,9 |

(As pastilhas cheias antigas davam 17–28 com deuteranopia, mas pareciam nomes.) "Gente a mais" é a mais
carregada de propósito: é o aviso que mais importa ver. Os símbolos ○ ● ▲ ficam, por isso o significado
nunca depende só da cor. A especificação mantém-se: verde com lugares livres, laranja/âmbar cheio,
vermelho a mais. O teste `src/cliente/comum/lotacao.test.ts` verifica o contraste do texto e as
distâncias (CIE76 ≥ 15 entre níveis e entre pastilhas e clientes, também com daltonismo simulado).

## Sigla nos nomes

A sigla (CO, GA…) aparece em `NomeChip` com 70 % de opacidade. Com as cores escuras, isso baixa o
contraste: Costantini 3,43:1 e Phillipe BTP 4,28:1 (já acontecia com o cinzento antigo da Galère, 3,83:1).
Com 90 % todas passam (a pior é a Costantini, 4,80:1). Proposto ao responsável do `NomeChip.tsx`.

## Mudar uma cor no futuro

Editar `dados-iniciais/clientes.json` e voltar a medir (contraste ≥ 4,5:1 com o texto escolhido;
ΔE00 ≥ 12 com as outras, também com daltonismo). O teste `src/dominio/cores.test.ts` verifica o contraste
de todas as cores de `clientes.json` e `src/cliente/comum/lotacao.test.ts` que nenhuma fica parecida com
as pastilhas da lotação.
