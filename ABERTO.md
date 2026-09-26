# O que está aberto

Para não ter que reconstruir de memória a cada conversa. Curto de propósito: o **porquê** de cada
decisão está na mensagem do commit que a fez, não aqui.

Atualizado em 26/09/2026.

## Falha viva

- **A leitura repete parada quando o cartão aparece em dois quadros.** Na gravação de 26/09 saíram
  63 linhas para 58 paradas. Os seis fantasmas são pares em que o nome da rua saiu cortado ou
  trocado num dos quadros — "Franklin de Camp Sobral" ao lado de "Franklin de Campos Sobral",
  "Deputado A Batista" ao lado de "Deputado Dilson Batista" — sempre com o mesmo número. O
  `juntarQuadros` só junta quando a chave bate, e essas não batem. Não inventei regra: juntar duas
  ruas de nome diferente e mesmo número pode comer parada de verdade, e uma gravação só não diz
  onde fica o limite. Custo hoje: ~10% de paradas a mais na tela, todas sem posição — o que pelo
  menos as deixa visíveis.
- **O número da parada às vezes vem da tarja de horário, não do cartão.** Três linhas da mesma
  gravação saíram com "8" na frente, e 8 não é o número de nenhuma delas: nos quadros dá para ler
  41, 33 e outros. Esse número vira o `#` do cartão e entra na ordenação da rota (`montagem.ts`).
  Tirar a janela de horário do texto já levou metade deles embora; o resto falta confirmar com o
  texto cru do leitor antes de mexer.

## Fechado com medição

- **O censo recusava a porta em rua de um bairro só** — e era a maior perda do dia. Medido na
  gravação de 26/09 (58 paradas do Meli, Jardins e Grageru): com internet, 18 paradas na porta,
  36 só na rua e 9 em lugar nenhum. O `ruaDoIbge` só respondia quando o nome da rua se repetia em
  mais de um bairro, apostando que a nossa base de ruas resolvia o resto — e ela resolve, mas
  responde a rua, não a porta, e sem sinal não responde nada. Agora ele responde também para rua
  de um bairro só, com o número exato. Junto com isso, o tipo da via deixou de ser absoluto: o
  Meli manda "Rua Antônio de Pádua Araújo" e o IBGE tem "Alameda", com as quatro portas da
  entrega. Depois: **45 na porta, 13 na rua, 4 em lugar nenhum** — e as quatro são fantasmas de
  leitura, não paradas. Sem sinal: **18 de 63 → 44**.
- **A janela de entrega colava no nome da rua.** Cartão fechado do Meli põe "10:15h a 13:20h" na
  mesma altura do endereço e o leitor junta os dois: a chave da rua virava "vereador lucilo costa
  pinto sn 10 15h a 13 20h". Tirar a janela sozinho piorava: sem número e sem CEP a parada saía da
  lista inteira, e parada que some é pior que parada com pino errado — ninguém procura o que não
  sabe que existe. "S/N" agora passa no filtro com a rua só. Essa parada continua sem pino, porque
  nem o censo nem o OpenStreetMap têm essa alameda; a diferença é que agora ela aparece, e o pino
  que ele puser fica guardado e vai para os outros motoristas.

- **A leitura da lista do Mercado Livre** não era "lê quase nada": lia quase tudo e perdia na
  montagem do endereço. Medido contra a gravação de 22/09 (rota em 33 de 38, 5 paradas na tela):
  saíam 4 paradas certas, 1 fantasma e 1 faltando. Hoje saem as 5, com CEP, e as 7 unidades batem
  com o cabeçalho do próprio app. As três perdas estão travadas em teste com o formato exato que
  o Meli produz.
- A `Rua 25` da Jabotiana **não** era essa falha: o censo já acertava a porta antes da mudança.

## Esperando medição

A instrumentação dos botões subiu em `34aa1b4` e começa a contar assim que os motoristas usarem.
O painel fica no **Admin > Uso dos botões do cartão**. Com uma semana de rota do Luan:

- **O botão principal do cartão deveria variar com a confiança da posição** — parada confirmada
  não precisa de "Marcar no mapa" na frente; parada fraca precisa. Depende de saber quais botões
  são realmente usados.
- **"📍 Estou aqui" talvez pertença à aba Rota**, não à Conferir: é ação de porta. Se o uso no
  Conferir for baixo, confirma.
- **O cartão inteiro talvez deva ser tocável como "Ver".** Se `Ver` é quase sempre seguido de
  `Editar`, os dois são um fluxo só e podem virar um botão.

## Ideias, não compromissos

- **Um lugar só do admin**, para o que hoje precisa de terminal ou não aparece em tela nenhuma.
  O Admin já lista as rotas de 14 dias com entregues/pacotes, ativa e desativa motorista, mostra
  as correções e o uso dos botões. Falta:
  - **Criar conta de entregador.** Hoje é `npm run motoristas -- criar email Nome`. Criar usuário
    exige a chave de serviço, e ela dentro de um app público entrega o banco inteiro a qualquer
    um — então não é "mover o botão para a tela": seria um RPC que só admin chama, com o convite
    saindo por e-mail do próprio Supabase.
  - **"Teve problema nesta rota?"** O dado já está gravado desde `011_registro.sql`:
    `rotas.sem_ruas` diz se a sequência saiu em linha reta e por quê, e `pacotes.fonte` /
    `precisao` dizem de onde veio cada posição. A tela do Admin não mostra nenhum dos três —
    é trabalho de tela, não de banco.

- `ruas.nome_chave2` (apelido vindo do OpenStreetMap) ainda tem chave no formato velho: o texto do
  apelido não é guardado, então só se acerta no próximo `npm run ruas`. Não dá resposta errada —
  nenhuma busca produz mais aquela forma, ela só deixa de casar.
- Coluna com o código IBGE da cidade nas tabelas.
- Zona/polígono de entrega.
- PostGIS, quando a base de ruas crescer a ponto de a consulta doer.

## Decidido — não reabrir sem motivo novo

- **O mapa não gira com a direção do motorista.** Foi pedido, foi conversado e foi descartado
  por ele mesmo depois de usar: o Leaflet não gira, e o único caminho seria um plugin de CDN
  remendando o núcleo dele, num app que precisa funcionar sem sinal. A bolinha com a seta do
  rumo responde a mesma pergunta.

- **A linha crua da planilha não vai para o Supabase** (pode levar nome, telefone, CPF). Decidido
  em `38b3e0b`, hoje com teste guardando.
- **A rota nunca se refaz sozinha.** Reordenar troca a próxima parada debaixo de quem já está com
  o pacote na mão, e gasta rede sem pedir.
- **Medidos e recusados:** CEPs do cepaberto, cartaz de 2005, polígonos de bairro como arquivo do
  app, e o conserto do `marcarIsoladas` para rota mista cidade+zona rural.
- **A Zona de Expansão está coberta**: 5.716 endereços no censo, âncoras de 1,7 a 3,4 km, e o
  `RAIO_REGIAO` de 100 km não rejeita nada de lá. Há teste travando isso.
