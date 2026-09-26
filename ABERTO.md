# O que está aberto

Para não ter que reconstruir de memória a cada conversa. Curto de propósito: o **porquê** de cada
decisão está na mensagem do commit que a fez, não aqui.

Atualizado em 26/09/2026.

## Falha viva

- **O bairro da chave vem de quem respondeu a busca, e pode mudar de um dia para o outro.** Na
  gravação de 26/09, a mesma avenida voltou "Grageru" em quatro números e "Jardins" no outro. E
  não é só o Nominatim: o `escolherTrecho` da nossa base escolhe o trecho mais perto do **meio da
  rota do dia**, então numa avenida que cruza dois bairros o bairro pode trocar conforme a rota.
  O `memoria.aplicar` já aguenta isso: sem acerto exato ele procura pela rua e pelo número, aceita
  só se houver uma marcação, só se o nome da rua identificar alguma coisa (nem "Rua A" nem "sem
  denominação") e só se ela cair a menos de 3 km do que a busca respondeu hoje. A trava de 3 km
  foi medida dos dois lados: deixa passar 99,88% das portas certas, e **não pega 0,55%** das
  portas cujo nome e número se repetem em dois lugares de 200 m a 3 km (era 1,09% antes de
  descartar os nomes genéricos; o que sobra é quase todo "Acesso 8", "Acesso 25"). Cair nessa
  faixa ainda exige que o motorista tenha marcado aquela mesma rua e número em outro lugar antes.
  Vale apertar antes de levar esta regra para a nuvem, onde um erro chega a todos de uma vez: o
  critério medido seria aceitar só nome cujos trechos são contíguos. Mas o
  `posicoes` da nuvem ainda casa por **chave exata** — a marcação de um motorista pode não chegar
  no outro por esse caminho, e basta a linha de um vir com CEP e a do outro sem. É a mesma
  identidade que já está no celular, com a mesma trava, e é menor que o cache. Cache do Nominatim
  ajuda no que é a mesma consulta, não em consultas de texto diferente.
- **A chave do lugar não normaliza abreviação.** `chaveLugar` usa `ruaCompleta`, que troca só o
  tipo da via ("av" → "avenida") e deixa o resto como veio: "Av. Dep. Sílvio Teixeira 184" e
  "Avenida Deputado Sílvio Teixeira 184" viram chaves diferentes, e a porta marcada numa não acha
  a outra. O `chaveRua` já resolve isso (as duas dão "silvio teixeira"). Consertar aqui muda o
  formato de chave que já está gravado em `correcoes`, `observacoes` e `pacotes` — é a mesma
  tarefa que o `rechavear`, com ferramenta e migração, não um remendo solto.
- **Entrega sem CEP em rua que o censo não cobre cai num ponto só, junto com as outras da mesma
  rua.** Tela do Luan em 26/09: 184, 200, 260, 536 e 600 da Sílvio Teixeira no mesmo pino — quase
  meio quilômetro de avenida num ponto. A nossa base de ruas responde "a rua" e devolve sempre o
  mesmo ponto: o vértice do trecho mais perto do meio da rota. Interpolar pelo censo foi medido e
  **não dá**: aquela avenida tem 12 portas no arquivo, e elas não sobem ao longo dela (a 10 e a
  1345 ficam a 93 m uma da outra; a 735 fica a 670 m das duas). Enquanto isso, quem resolve é o
  motorista: marcando na porta uma vez, a posição fica guardada e vai para os outros.
  Candidato ainda não medido: `pontoDoTrecho` mira no meio da rota, então duas ruas que se cruzam
  ali devolvem a MESMA coordenada — foi o que juntou a Oviêdo Teixeira com a Sílvio Teixeira no
  cruzamento. Usar o meio do trecho escolhido separaria as duas, mas só depois de medir o tamanho
  dos trechos que a nossa base guarda.
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
- **Duas entregas de endereços diferentes no mesmo pino não davam para separar.** Caso do Luan em
  26/09: o restaurante e a casa do lado, no mesmo ponto. O balão tinha um "Arrumar aqui" só, que
  mexia calado na primeira da pilha, e a pergunta de "virarem uma parada só" voltava a cada
  tentativa, porque a zero metro a vizinha está sempre colada. Agora cada entrega tem o seu botão,
  com o número dela, e quem já está no mesmo pino não recebe convite para juntar.
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

- **Estimar o número da porta entre duas portas conhecidas do censo.** Deixa-um-de-fora em
  127.816 portas do arquivo de Aracaju (ruas com 5 ou mais). As quatro linhas usam **os mesmos
  alvos**, e quem não consegue interpolar cai no pino da rua, como cairia em produção:

  | | mediana | p90 | até 30 m | acima de 150 m | respondeu |
  |---|---|---|---|---|---|
  | um pino para a rua (hoje) | 88 m | 405 m | 21% | 33% | 100% |
  | interpolando | 12 m | 183 m | 73% | 11% | 94% |
  | + âncoras em ordem | 10 m | 188 m | 75% | 12% | 88% |
  | + ordem por lado par/ímpar | 8 m | 167 m | 77% | 11% | 90% |

  O ganho está em interpolar, não em limpar: 88 m → 12 m de mediana, e um terço das portas acima
  de 150 m vira um décimo. Descartar âncora que quebra a ordem melhora a mediana e **piora a
  cauda**, porque responde menos e cai no pino velho — separar por lado par/ímpar recupera parte
  (o descarte cai de 38% para 24%), mas é refinamento, não o ganho. Se entrar, entra na forma
  simples, laranja ("confira na porta"), nunca como porta achada, e a porta marcada pelo motorista
  continua mandando. Vale para as paradas que hoje caem no pino da rua: **14 das 63** da gravação
  de 26/09, com internet.
  (Uma tabela anterior aqui dizia 8 m e 8% para a versão limpa. Estava otimista: só contava os
  casos em que a limpeza conseguia responder.)
- **Google como reforço, não como troca.** Hoje `geocodificar` faz `googleKey ? geoGoogle :
  geoOSM`: pôr a chave desliga o censo e a nossa base inteiros. Se um dia for usado, tem de ser só
  para o que sobrou "aproximado". E os termos do Google não deixam guardar a coordenada deles —
  então serviria para o pino do dia, nunca para a base de portas.

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
