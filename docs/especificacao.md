# Mapa CMF — Pessoal, Carrinhas, Casas e Obras

Oct 2, 2026 · @Rafael Leitão Cardoso

## Objetivo e utilizadores

Uma página web com um mapa do Luxemburgo e arredores onde se vê e se gere, num só sítio, quem mora em que casa, quem vai em que carrinha e para que obra. Substitui as três folhas de Excel do Michael (Casas, Viaturas, Clientes), onde hoje cada mudança tem de ser feita três vezes e as folhas já não batem certo entre si.

- **Utilizadores:** Rafael, Michael e João. Os três editam.
- **Uso típico:** o plano muda pouco. As pessoas são quase fixas nas casas; o que muda mais são as carrinhas e as exceções do dia.
- **Abordagem:** construir já como o Rafael pensa e ajustar depois com o uso.

## Conceito do ecrã

O ecrã principal é um mapa onde casas, carrinhas e obras aparecem como listas com um lugar por pessoa, e os nomes arrastam-se entre elas.

- **Casa:** uma lista com um telhado por cima. Tem tantos lugares quantos a lotação (moradores + vagas); os vazios ficam visíveis.
- **Carrinha:** uma lista com o formato de uma carrinha vista de cima e a matrícula escrita por cima. Lugares = lugares da viatura.
- **Obra:** uma lista com o pessoal que lá trabalha. Pertence a um cliente.
- **Cor de cada nome:** a cor do cliente para quem a pessoa trabalha, como no Excel do Michael. A pessoa herda a cor da obra onde está; mudar de obra muda a cor sozinha. A carrinha e a casa ficam neutras.
- **Duas caixas fixas ao lado do mapa:** "Fora das casas CMF" e "Sem transporte da empresa". Também se arrasta para lá e de lá.
- **Legenda clicável:** carregar num cliente acende só as obras e o pessoal desse cliente.
- **Contadores no topo:** lugares livres nas casas, pessoas sem carrinha, carrinhas paradas ou na oficina, divididos por cliente.
- **Foco:** clicar numa pessoa mostra a linha casa → carrinha → obra; clicar numa obra mostra quem vem para lá e de onde.
- **Lotação por cores:** verde com lugares livres, laranja cheio, vermelho a mais.
- **Mapa:** Luxemburgo e países à volta (França, Bélgica, Alemanha). Nada mais.

## Funcionalidades por fase

A fase 1 já resolve a maior parte e usa o GPS só para encontrar as obras; as rotas e o GPS ao vivo entram depois.

### Fase 1 — mapa, lugares e arrastar

- Mapa com casas, carrinhas e obras. As obras saem do histórico de GPS das carrinhas e o Rafael corrige-as no programa.
- Arrastar uma pessoa ou várias de uma vez: Ctrl + clique, Shift + clique para um intervalo, arrastar uma caixa à volta, toque longo no telemóvel.
- Desfazer (Ctrl+Z) e confirmar antes de gravar; histórico de quem mudou o quê.
- Pesquisa rápida por nome ou matrícula.
- Estado "indisponível" numa pessoa (férias, falta, baixa): sai da contagem de lugares sem sair da casa nem da carrinha. Guarda-se só o estado e as datas, nunca o motivo.
- Ficha da pessoa: telefone, casa, carrinha, obra, se tem carta e quando caduca.
- Ficha da casa: morada, lugares, máximo do contrato, equipamento, contacto do senhorio, avarias em aberto.
- Dois números por casa: lugares usados (moradores + vagas) e máximo do contrato, com aviso quando o primeiro passa o segundo.
- Problemas pendurados no ícone da casa ou da carrinha até estarem resolvidos.
- Estados da carrinha: oficina, CT a aproximar-se, parada, carro de substituição. Quando uma vai à oficina, mostra quem ficou sem transporte e que carrinhas próximas têm lugares.
- Carro de substituição aparece no lugar da carrinha que saiu, com a matrícula dele.
- Avisos da frota no ícone da carrinha (CT, revisão, correia).
- Onde a carrinha dorme (casa) e quem é o condutor com carta.
- Mudanças agendadas: "a partir de segunda, X vai para a obra Y", aplicadas sozinhas no dia certo.
- Simulação "e se": testar uma mudança e ver o impacto antes de confirmar.
- Vistas em lista e em tabela, exportáveis para Excel.
- Modo ecrã grande para a reunião de quarta.

### Fase 2 — rotas

- Cada carrinha com as suas paragens (casas) e horas, até à obra ou ao estacionamento perto da obra.
- Animação: os nomes saem da casa, entram na carrinha, a carrinha anda pelo percurso do plano e os nomes entram na obra.
- Barra do tempo para deslizar a manhã ou carregar em "play".
- Folha do dia por condutor (quem apanha, onde e a que horas), pronta a enviar por WhatsApp.
- Ligação às multas: com data e hora, diz quem era o condutor.
- Ligação ao Q8: avisa quando alguém abasteceu uma carrinha que não é a sua.

### Fase 3 — GPS ao vivo (Verizon Reveal)

- Horas reais de saída e chegada em cada casa e obra, usadas na animação.
- Plano vs real: alerta quando uma carrinha saltou uma paragem ou chegou atrasada.
- Mais tarde: sugerir rotas melhores (menos km, carrinhas mais cheias).

## GPS e privacidade

O GPS só é usado para saber quando uma carrinha entra ou sai de um local conhecido da empresa; tudo o resto fica fora da ferramenta.

- **Locais conhecidos:** casas, obras, estacionamentos junto às obras, oficinas, escritório, lugar de estacionamento da Rue de Drusenheim.
- **Fora desses locais:** a carrinha aparece só como "a caminho" ou "fora", sem posição. As carrinhas também servem para compras, cafés e consultas, e isso nunca aparece nem se guarda.
- **Não há janela horária fixa:** os horários variam muito, por isso conta a chegada às obras e às casas, não o relógio.
- **A animação segue o plano** (casa → casa → obra) com as horas reais dadas pelo GPS, não o rasto exato.
- **Quem vai dentro da carrinha vem sempre do plano.** O GPS sabe onde está a carrinha, não quem vai lá dentro.
- **Obras:** não há lista de moradas, por isso saem das paragens longas das carrinhas em dias úteis. Excluem-se casas, oficinas, bombas e escritório: uma tentativa anterior sem esse filtro deu sobretudo esses sítios. O Rafael confirma, dá nome e liga cada obra a um cliente no programa.
- **Quando a obra não é onde a carrinha estaciona,** o Rafael liga o parque à obra à mão, uma vez.
- **Antes da fase 3:** confirmar o que é preciso comunicar aos trabalhadores sobre o uso da localização (regras de proteção de dados no Luxemburgo).

## Fora do âmbito

Ideias discutidas e postas de lado pelo Rafael:

- Assistente para colocar trabalhadores novos.
- Tempo de viagem casa → obra e sugestão de onde procurar a próxima casa.
- Tamanhos de roupa na ficha da pessoa.
- Datas de início e fim das obras.
- Janela horária fixa para o GPS.

## Modelo de dados

Cada pessoa existe uma só vez; as vistas por casa, por carrinha e por cliente saem dela.

| Entidade | Campos principais | Liga a |
| --- | --- | --- |
| Pessoa | n.º, apelidos, nome, nome curto (mapa), telefone, carta + validade, estado (ativo / indisponível com datas) | Casa, Carrinha, Obra, Cliente (enquanto não há obra) |
| Cliente | nome, cor | Obras |
| Obra | nome, morada, coordenadas, estacionamento associado | Cliente, Pessoas |
| Casa | nome curto, morada, coordenadas, lotação (moradores + vagas), máximo do contrato, senhorio, equipamento | Pessoas, Carrinhas que lá dormem |
| Carrinha | matrícula, lugares, estado (ativa / oficina / parada / substituição), condutor, casa onde dorme | Pessoas, Rota |
| Rota (fase 2) | carrinha, paragens ordenadas (casa ou obra) com hora prevista | Carrinha, Casas, Obra |
| Problema | texto, aberto/resolvido, data | Casa ou Carrinha |
| Mudança agendada | pessoa, campo, novo valor, data de início | Pessoa |
| Histórico | quem, quando, o que mudou | Tudo |

Grupos especiais: "Fora das casas CMF" (casa vazia) e "Sem transporte da empresa" (carrinha vazia).

## Dados atuais

Há 136 pessoas, 7 clientes, 15 casas e 26 carrinhas. A lista nominal completa (n.º, nome, cliente, casa, carrinha) está no ficheiro CMF\_Pessoal\_lista\_mestra.xlsx, que é a fonte para importar.

### Clientes e cores

| Cliente | Cor (hex) | Pessoas |
| --- | --- | --- |
| Costantini | #ED7D31 laranja | 58 |
| Galère | #808080 cinzento | 24 |
| A+P Kieffer | #B4C6E7 azul-lilás | 22 |
| Phillipe BTP | #C6E0B4 verde | 18 |
| Kisch | #A3DBFF azul-claro | 5 |
| Enquadramento | #00B0F0 azul forte | 5 |
| Mersch | #FFD966 amarelo | 4 |

### Casas

| Casa (nome no Excel) | Morada | Lotação | Moradores | Máx. contrato |
| --- | --- | --- | --- | --- |
| Casa 1 Puttelange | Ap. 1, 27 Rue de la Grotte, 57570 Himeling | 10 | 9 | 10 (tolerado 12) |
| Casa 2 Puttelange | Ap. 2, 27 Rue de la Grotte, 57570 Himeling | 8 | 8 | 8 (tolerado 9) |
| Casa 3 Puttelange | Ap. 4 ou 5, 27 Rue de la Grotte, 57570 Himeling | 8 | 8 | 4 (tolerado 6) |
| Casa 4 Puttelange | Ap. 4 ou 5, 27 Rue de la Grotte, 57570 Himeling | 6 | 5 | 4 (tolerado 6) |
| Casa 2 Rue de la Forêt | 14 Rue de la Forêt, 57570 Himeling, ap. por confirmar | 6 | 6 | 6 se for C ou D |
| Casa 6 Rue de la Forêt | 14 Rue de la Forêt, 57570 Himeling, ap. por confirmar | 6 | 5 | 6 se for C ou D |
| Casa 7 Rue de la Forêt | 14 Rue de la Forêt, 57570 Himeling, ap. por confirmar | 4 | 3 | 6 se for C ou D |
| Apartamento E Puttelange | Ap. E, 14 Rue de la Forêt, 57570 Himeling | 5 | 5 | 6 |
| Eischen | 28 Rue de Hobscheid, L-8473 Eischen | 9 | 8 | não fixado |
| Steinsel | 4A Rue de Hunsdorf, L-7324 Müllendorf | 12 | 12 | 8 |
| Wasserbillig | 43 Route de Luxembourg, L-6633 Wasserbillig | 12 | 12 | 6 a 8 |
| Weiler | 37 Rue du Schlammestee, L-5770 Weiler-la-Tour | 11 | 11 | não fixado |
| Michelbouch | 7 Route de Mertzig, L-9173 Michelbouch | 7 | 7 | não fixado |
| Walferdange | 45 Route de Diekirch, L-7220 Walferdange | 4 | 4 | — |
| Schifflange | 91 Rue de Hédange, L-3841 Schifflange | 2 | 1 | não fixado |

Na Rue de la Forêt há contratos do Ap. C e do Ap. D (máx. 6 cada); não está definido qual corresponde à Casa 2, 6 e 7. Fora das casas CMF: 32 pessoas. Lugar de estacionamento: 7 Rue de Drusenheim, L-3884 Schifflange.

### Carrinhas

| Matrícula | Lugares | Pessoas atribuídas |
| --- | --- | --- |
| CF5001 | 9 | 8 |
| CF5003 (Tourneo Connect nova) | 5 | 0 |
| CF5005 (Transit Custom nova) | 9 | 0 |
| CF5006 | 9 | 7 |
| CF5007 | 9 | 5 |
| CF5008 | 9 | 9 |
| CF5009 | 9 | 9 |
| CF5010 | 9 | 7 |
| CF5011 | 9 | 5 |
| CU5655 | 5 | 3 |
| CV6813 | 9 | 4 |
| DH9250 | 5 | 1 |
| DS4264 | 5 | 2 |
| KG4549 | 9 | 7 |
| LN8786 | 5 | 2 |
| LR6976 | 5 | 2 |
| LT4701 | 5 | 2 |
| NQ6505 | 5 | 1 |
| QM9530 | 9 | 5 |
| SF4680 | 5 | 1 |
| SZ7564 | 7 | 5 |
| TD4512 | 9 | 4 |
| VG9733 | 5 | 1 |
| XN4293 | 7 | 6 |
| YF6656 | 5 | 5 |
| YT7579 (Hyundai) | 5 | 3 |

Sem transporte da empresa: 29 pessoas.

## Pendências

Nenhuma destas impede começar a fase 1.

- [x] O João não tem as moradas das obras: saem do GPS das carrinhas e o Rafael ajusta no programa.
- [x] Ligar os apartamentos de Himeling aos nomes do Excel: Casa 3 e Casa 4 de Puttelange (Ap. 4 ou Ap. 5?) e Casa 2, 6 e 7 da Rue de la Forêt (Ap. C, D e um terceiro).
- [x] Encontrar os contratos que faltam: Walferdange e o terceiro apartamento da Rue de la Forêt.
- [x] Ver a lotação acima do contrato: Steinsel (12 para 8), Wasserbillig (12 para 6 a 8) e a Casa 3 de Puttelange se for o Ap. 4 ou 5. Pode haver aditamentos mais recentes.
- [x] Atribuir carrinha ao Francisco Vieira, ao Luís Carvalho e ao Gabriel Soares (novos).
- [x] Decidir quem vai na CF5003 e na CF5005 (carrinhas novas, ainda vazias).
- [x] API do Reveal: a conta europeia já permite integrações self-service (a integração antiga "Rafael" foi criada assim). Integração "Mapa CMF" criada a 03/10/2026 e credenciais REST recebidas por e-mail (guardadas só no e-mail, nunca neste documento). Registo no portal de programadores e app criados pelo Rafael (App ID obtido). Até lá, usar os CSV do relatório detalhado.
- [x] Antes da fase 3, confirmar o que comunicar aos trabalhadores sobre o uso do GPS.

## Notas para o Claude Code

Ponto de partida sugerido; o Claude Code pode propor outra coisa se fizer mais sentido.

- **Aplicação web com base de dados partilhada** e acesso com login para 3 utilizadores. Interface em português, a funcionar no PC e no telemóvel.
- **Mapa:** Leaflet com OpenStreetMap, que é gratuito. Centrado no Luxemburgo, com França, Bélgica e Alemanha à volta.
- **Importação inicial** a partir de CMF\_Pessoal\_lista\_mestra.xlsx (folhas Pessoal e Viaturas) e das moradas da tabela de casas. Geocodificar cada morada uma vez e guardar as coordenadas. As obras vêm de um ecrã de obras sugeridas pelo GPS, onde se confirma, dá nome, escolhe o cliente, junta ou apaga.
- **API do Reveal sempre no servidor,** nunca no browser: as credenciais ficam escondidas e o token dura cerca de 20 minutos. Servidor europeu: fim.api.eu.fleetmatics.com. São precisas duas credenciais: as de integração do Reveal e a App ID do Integration Manager. As respostas ficam limitadas ao plano de dados da conta (erro 400 fora dele).
- **Filtro de privacidade à entrada:** cada ponto de GPS fora de um local conhecido é descartado antes de ser guardado.
- **Exportar** as vistas de lista e tabela para Excel.
- **Construir por fases** e entregar a fase 1 a funcionar antes de começar as rotas.
