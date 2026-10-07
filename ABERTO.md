# O que está aberto

Para não ter que reconstruir de memória a cada conversa. Curto de propósito: o **porquê** de cada
decisão está na mensagem do commit que a fez, não aqui.

Atualizado em 07/10/2026.

## Só o que falta, nas duas listas (07/10)

- **Conferir endereços, sem busca:** "Para conferir" no topo, "Falta entregar" embaixo, e os
  verificados e os entregues recolhidos no fim. A busca continua achando todos, entregues
  também, por causa do B.O. O "Só os para conferir" e o "N para conferir" do menu não mudaram.
- **Lista da rota:** a entrega feita sai do bloco mesmo com o endereço pela metade, e fica só no
  "N entregue(s)" do fim, onde estão o Desfazer e o Cliente xarope.
- Olhar na rua se alguém sente falta de ver a feita no lugar dela da sequência.

## Leitor de vídeo perdeu paradas (07/10), em aberto

Rota do Mercado Livre de 67 paradas, gravada em vídeo e lida pelo app. Na mesma gravação (cópia
do WhatsApp, 480 px de largura), o leitor achou 65 linhas, e o 67 do celular bateu por
coincidência: perdeu 7 paradas e inventou umas 8 linhas, com número de rua errado ou com os
ícones da tela lidos como número. A contagem igual não prova nada, e o app não tem como saber
quantas paradas o vídeo tinha.
Uma parada de São Cristóvão, de rua com nome de uma letra, caiu numa rua de mesmo nome da Barra
dos Coqueiros.

## Waze no cartão do pino (06/10)

- "Cadê o botão do Waze?", Luan com o cartão do pino aberto: só o cartão da próxima tinha. Agora
  cada endereço do pino tem o seu, ao lado do Depois. Tocar no pino é o jeito que ele escolhe o
  destino, e é para lá que o Waze vai. O Waze não conta no Uso dos botões, nem o do cartão da
  próxima.

## Planilha de outra cidade (05/10), para olhar na rua

- **O censo e a busca usam a cidade de cada entrega**: a da linha da planilha, senão a da faixa
  do CEP (490xx Aracaju, 4914x Barra, conferidas em 2.837 linhas sem divergência), senão a do
  app. Antes, com Aracaju guardado de ontem, a planilha toda da Barra do Jeferson foi conferida
  no censo de Aracaju: nenhuma porta achada, contra 9 com a cidade certa.
- **Ponto da planilha repetido para 3 bairros ou mais não é porta.** A do Jeferson pôs 8 linhas
  de 7 bairros na rotatória da Barra. Vai, nesta ordem, para a porta do censo (mesma rua), a rua
  pela busca (nunca nome genérico como "Rua I"), o meio das outras entregas do bairro, ou o
  centro do bairro pelo mapa. Medido na planilha dele com a internet: as 7 saíram do ponto
  (4 porta, 2 rua, 1 bairro). O que nada achar fica vermelho, "não é a porta".
- A `chave do lugar` (sem CEP) ainda usa a cidade do app, não a da linha: mexer nela é a armadilha
  do CLAUDE.md. Só pega linha sem CEP de outra cidade; não apareceu nas planilhas.
- O link do Google Maps de um endereço que o dono mandou não traz as coordenadas sem abrir o
  mapa: a comparação com o ponto que o app escolheu é feita à mão.

## Desfazer a entrega (05/10), para olhar na rua

- **A porta de uma entrega espera 10 min antes de ir para a nuvem** (`ESPERA_DA_PORTA`). Antes,
  "Entreguei aqui" na parada errada seguido de Desfazer deixava o endereço verificado no lugar
  errado para todos: a passagem saía sempre "no pino" e nenhum desfazer a tirava. Agora passagem e
  lugar ficam numa chave à parte da fila, gravada, e qualquer desfazer da entrega (aviso ou lista)
  tira a da parada. O "no pino" compara com o pino de antes do "aqui" mexer nele.
- Todo desfazer da entrega, do aviso ou da lista, também volta a porta que o "aqui" marcou: pino,
  memória e correção. O "antes" fica gravado na parada (`portaAntes`), e vale com o app reaberto.
  Se o pino foi mexido de novo depois do "aqui", o desfazer não passa por cima. Esse caso de
  guarda não tem teste: entrega feita não oferece Arrumar, só a Conferir chega nela.
- "Entreguei", "Entreguei as N" e "Depois" ganharam Desfazer no aviso. O do Depois devolve ao
  mesmo lugar da sequência, sem refazer a rota. A entrega dá um pulso curto (35 ms); o de 200 ms
  continua sendo "próxima a pé".

## Tela nova (02/10 e 03/10), para olhar na rua

As quatro abas viraram o mapa da Rota como tela, com o cartão da próxima embaixo, e o resto no
menu Mais. Cada tela e cada cartão aberto é um passo do voltar do celular; na Rota, o primeiro
voltar avisa e o segundo sai. O que só a rua mostra:

- **O voltar no app instalado.** Testado no Chrome; no app instalado, o segundo voltar é do
  próprio Android (o app fica na primeira entrada do histórico e deixa o celular fechar). Confirmar
  no celular do Luan que ele sai com dois toques, e não com um nem com três.
- **O mapa é a maior parte da tela (03/10, print do Pedro).** No celular dele (384×760) o cartão
  da próxima tinha 52% e o mapa 39%. Agora o cartão vai até 32% (mínimo 240 px, o endereço de duas
  linhas com os botões) e o mapa fica com 59%; o tamanho que o Pedro mostrou como bom. Em cima dos
  botões ficam só o endereço e o "confira na porta"; os avisos da rota, os links e o "Aqui perto"
  vêm depois e rolam. Endereço de quatro linhas num celular baixo corta o Depois: se acontecer,
  tirar o CEP do endereço mostrado (os testes acham a próxima pelo texto inteiro, mudar junto).
- **Minimizar o cartão (03/10).** A seta do canto reduz o cartão a uma linha com a próxima, e o mapa
  fica com 83%. Fica escolhido no celular, porque o Android fecha o app quando ele vai ao Waze.
  Conta como "minimizar" no Uso dos botões: ver se alguém usa.
- **"Para conferir" saiu de cima do mapa (03/10).** Virou o número no botão Mais, somado ao do
  admin, e uma linha no topo do menu. Olhar se alguém deixa de conferir por não ver mais o aviso.
- **O mapa anda junto com ele (02/10, mudado em 03/10).** Ele fica no meio, de perto (zoom 17, o do
  "onde estou" de antes), e o mapa vai junto a cada 30 m. Mostrar ele e a próxima juntos, como no
  02/10, afastava até a cidade inteira com a entrega longe: o Pedro sentiu falta do zoom. Pinçar e
  o + e − só mudam a distância, em volta dele; arrastar para, e a mira azul liga de novo. Na rua,
  olhar se o passo de 30 m incomoda numa moto e se alguém fica sem saber que parou de seguir (a
  mira apagada é o único sinal). O ponto de saída não tem mais botão: é onde ele estiver.
- **O mapa fica montado depois de aberto**, e só se esconde nas outras telas. Ir à Conferir e
  voltar não baixa nada de novo. O preço é a memória do Leaflet ficar ocupada o dia todo, o que
  num celular fraco pode pesar: olhar se algum reclama de o app fechar sozinho.

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
  tarefa que o `rechavear`, com ferramenta e migração, não um remendo solto. Enquanto isso, o
  `npm run portas` grava a porta nas duas grafias (`grafiasDaRua`), que é remendo declarado. `chaveLugar` usa `ruaCompleta`, que troca só o
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
- **Nome de rua lido errado não tem segunda chance.** Gravação de 26/09, três paradas que não
  chegaram perto: "Avenida Marieta **site** 904" (o censo tem "AVENIDA MARIETA LEITE", a **2**
  letras de distância), "Rua Rafael Pereira Rodrigues **ÁRFA** 5" (o censo tem a rua, a 5 de
  distância, com lixo grudado no fim) e "Alameda Vereador Lucilo da Costa Pinto SN" (essa não
  está no censo nem no OpenStreetMap — não há o que achar). Quando a chave exata falha, o censo
  não tenta mais nada, e o `cabeNoNome` da nossa base exige que **toda** palavra pedida esteja no
  nome achado, então "site" e "arfa" derrubam a busca.

  Aceitar nome quase igual foi medido nos 2.808 nomes de rua de Aracaju. A régua tem de excluir
  as ruas numeradas de conjunto, que diferem por um dígito:

  | regra | pares de ruas de verdade que passariam a se confundir |
  |---|---|
  | distância ≤ 2 | 1.492 |
  | ≤ 2, nome com 12+ letras | 129 |
  | ≤ 2, 12+ letras, **mesmos números** | 50 |
  | ≤ 2, 14+ letras, mesmos números | **34** |

  Com 34 pares em 1.744 nomes, a regra fecha exigindo que o parecido seja **único**: perto de dois
  nomes, não escolhe. O que sobra é o "cicero soares dantas ~ cicero soares santos" da vida, e a
  tela já sabe avisar ("no mapa: outro nome"). Não construído — decisão de mandar entrega para
  outra rua não se toma no detalhe.
- **O número da parada do Meli quase não é lido.** Ele é o que o dono usa para falar com o Meli e
  achar o pacote, e o texto cru do leitor (gravação de 26/09) mostra por que ele some: o crachá é
  um escudo colorido com o número dentro, e o Tesseract devolve `'(32)'` num quadro, `'Rs)'` no
  outro e **nada** no da Marieta Leite 51 — que na tela é o 45:

  ```
  '8 Habilita as 11:45 h'          <- o cadeado lido como digito
  '   Avenida Marieta Leite 51'    <- o 45 nao aparece: so espacos
  ```

  A parte que **inventava** número está consertada (a tarja do horário não deixa mais dígito para
  a linha de baixo). Hoje saem **15 números em 62 linhas**, e alguns errados — um `67` que não
  existe, um `3` e um `5` repetidos.

  **Ler a coluna dos crachás foi testado e recusado.** Segunda passada do leitor só na faixa da
  esquerda, ampliada 3×, binarizada, com os caracteres restritos a dígitos:

  | quadro | crachás na tela | o que saiu |
  |---|---|---|
  | t=48, escudos amarelos | 40, 41, 38, 39, 44 | `40 41 38 44` — 4 de 5 |
  | t=36, escudos amarelos | 45, 46, 47, 29, 33 | `3 145 29 133` — 2 aproveitáveis |
  | t=66, losangos rosa | 61, 62, 63, 64, 66 | `5` — nenhum |

  Quatro limiares de contraste testados (100, 140, 180 e sem binarizar); nenhum salva os losangos.
  Uns 40% de acerto, e crachá lido errado é pior que não lido, porque esse número entra na
  ordenação da rota (`montagem.ts`). Voltar a isso só com segmentação por forma, que é visão
  computacional dentro de um app que tem de rodar sem sinal.

  **O caminho barato depende de uma resposta do dono:** se a lista do Meli puder ser exibida na
  ordem da sequência, com os números 1, 2, 3… na ordem em que aparecem, então a **posição na
  leitura já é o número** — o app lê os quadros em ordem de tempo e preserva a ordem da lista, e o
  acerto vira 100% sem OCR nenhum. Se a numeração continuar embaralhada (no vídeo de 26/09 os
  crachás vinham 45, 46, 47, 29, 33, e iam até 66 para 58 paradas), não há caminho barato.

## Fechado com medição

- **Revisão de precisão de 02/10, contra 418 portas marcadas na entrega** (planilhas de 18/09 a
  02/10, com o código do app). Antes, a mediana era 12 m e 47 endereços ficavam a mais de 50 m.
  - Entrou: casa com a planilha a até 80 m da porta do censo vai para a porta do censo. Mediana
    de 12 para 9 m, 80% de 27 para 21 m e 90% de 63 para 51 m. Das 192 paradas que viram
    "Número encontrado", a mediana é 6 m e só uma passa de 50 m.
  - Recusado, por medir pior: usar a casa vizinha do censo (número ao lado); achar o número pela
    rua quando o censo não tem o CEP (mediana de 434 m nos casos que mudaria); estranhar a planilha
    longe das portas do CEP no censo (nesses, quem erra é o CEP do censo); e o censo sempre, no
    lugar da planilha (um erro grande a mais).
  - Medido e pequeno: porta marcada que a nuvem não entrega por a chave sair diferente (CEP num dia
    e no outro não, abreviação). São 2 em 912 endereços.
  - O que sobra acima de 100 m (22) é quase todo endereço cujo CEP o censo não tem. Isso é 30% dos
    endereços. Ali só a porta marcada pelos motoristas conserta, e ela já vem: 63% das entregas
    desde 28/09 viraram porta marcada (Pedro chega a 82%, Leudy fica em 45%).

- **O nome do conjunto juntava casas de ruas diferentes num pino só.** Pedro, 29/09: duas casas
  do "Conjunto Orlando Dantas", a 106 m, desenhadas no mesmo ponto. Ele arrumava uma, e o mapa a
  punha de volta na outra. Nas planilhas de 20 a 29/09 (1353 endereços), a regra do nome fazia
  69 junções. Nove saíram porque a regra de "perto de / próximo a" nunca tinha rodado: o `\b` dela
  estava gravado como backspace. Outras 25 saíram porque agora o nome só junta com o mesmo número.
  As 35 que ficaram são todas o mesmo prédio. A única junção certa que se perdeu é a entrada dos
  fundos de um edifício, que tem outro número e fica a 109 m, e ela é mesmo outra porta.
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
- **A busca de "Todos os endereços" (02/10, para B.O.)** conta como `busca`, uma vez por tela
  aberta, e o "Procurar nos dias anteriores" como `busca-antiga`. A de hoje é no celular; a dos
  dias anteriores vai à nuvem, que guarda todo pacote de planilha desde 19/09 (o motorista vê os
  dele, quem administra vê todos, com o nome). Só acha o que veio de planilha: endereço colado ou
  lido de print não vira pacote na nuvem. A hora da entrega só existe se ele marcou "Entreguei"
  (Pedro 100%, Luan 93%, Leudy 94% até 02/10), e o ponto da porta em 92% das marcadas. A peneira
  do banco é `ilike` sem índice: com 4.500 pacotes responde rápido; passando de umas 100 mil
  linhas, vale um índice de trigrama (migração).
- **"Estou aqui" talvez pertença só à Rota**, não à Conferir: é ação de porta. Na tela nova ele
  está nas duas (na Rota, como "Pino errado? Estou aqui"). Se o uso na Conferir for baixo, sai de lá.
- **O contador `ver` mudou de sentido em 02/10.** Até ali era o "Ver" da Conferir, que abria o
  cartão; agora abrir o cartão é tocar nele (não conta), e `ver` é o "Ver no mapa". Comparar
  semanas só a partir de 02/10.
- **"Entreguei aqui" (`balao-aqui`)** era do balão do pino. Desde 02/10 é o botão grande do
  cartão da próxima e o do cartão do pino, os dois no mesmo contador; `balao-entreguei` é o
  "Entreguei" do cartão do pino. Se o da porta ganhar, o "Pino errado? Estou aqui" do cartão da
  próxima vira redundante na Rota.
- **Endereço verificado com uma entrega só (017, 28/09).** A trava é o GPS da entrega cair a até
  30 m do pino (`no_pino`). Acompanhar no Admin se aparecem endereços verificados no lugar
  errado; se sim, o próximo aperto é exigir de novo duas entregas, e o pedido deles perde o sentido.
- **Passagens perdidas com o mapa da Rota aberto (consertado em 28/09).** A passagem pedia um GPS
  novo, e com o mapa seguindo o motorista esse pedido podia ficar sem resposta: a entrega saía
  sem passagem, calada. Achado no teste, não medido em produção. Para medir: o "N entregas marcadas
  na porta" do Admin > Nossa base de ruas tem de passar a crescer junto com as entregas do dia.
- **Uma porta confirmada agora custa um toque de um motorista só.** A regra da `posicoes` não
  mudou (correção + passagem no mesmo ponto já confirmava), mas antes eram dois toques em lugares
  diferentes e quase ninguém fazia os dois. Acompanhar no Admin se aparecem portas confirmadas
  erradas. Se aparecerem, o aperto é exigir passagem de **outro** motorista, e aí a porta volta
  a esperar um segundo motorista passar por lá.
- **Pino levado da planilha para a porta do censo (01/10).** Isso acontece quando a planilha põe o
  pino a mais de 80 m do número e a mais de 60 m de qualquer porta da rua no censo. Os dois
  limites saíram de 10 casos: 6 consertados e 1 que piora (planilha certa, censo errado a 150 m).
  Ficam de fora a rua de nome genérico e o condomínio de casas ou blocos. Repassado em 24
  planilhas reais (1572 paradas): 22 levadas. Contra a porta marcada na entrega, 5 melhoram e
  nenhuma piora. Contra o GPS do ✓, 7 melhoram e 2 pioram.
  Os pacotes levados ficam com `precisao = 'censo'` no banco. Daqui a uma semana, comparar a
  posição deles com a porta onde foram entregues: se piorar mais de 1 em 7, apertar os limites.
  Também vale olhar quantas vezes o motorista volta para a posição da planilha na Conferir.
- **O censo também pode resolver o "número não bate com a posição".** Na planilha do Luan de
  01/10 foram 8: duas portas de números distantes no mesmo ponto, e uma delas está errada. Hoje
  o app só pinta de vermelho. A mesma regra (porta do censo + as portas da rua) diria qual das
  duas mudar. Precisa medir antes, como foi feito com esta.

## Ideias, não compromissos

- **"↺ Voltar para a posição de antes" no cartão da Conferir** (proposto em 29/09). Hoje o
  desfazer de uma correção só vive 10 s na barra de aviso; depois, o motorista que arrumou o pino
  errado tem de arrumar de novo, e a correção errada continua na nuvem até o dono apagar no Admin.
  Guardar a posição de antes na parada, durante o dia, e voltar tirando a correção da nuvem.

- **A porta confirmada chega no outro motorista quando ele carrega a rota**, não no meio do dia.
  A consulta (`consultarCompartilhadas`) roda ao buscar os endereços e ao entrar na conta. Se os
  dois tiverem o mesmo endereço no mesmo dia, quem já carregou não recebe. Não medido quanto
  isso acontece. Pedido de 28/09 era "se tiver o mesmo endereço novamente", que é outro dia.

- **Interpolar entre as portas que os motoristas marcaram** — e **não** entre as do censo. Medido
  contra cinco portas de verdade da Avenida Deputado Sílvio Teixeira, tiradas do Google Maps pelo
  dono (184, 200, 260, 536, 600, cobrindo 297 m de avenida). Deixa-um-de-fora:

  | | erro |
  |---|---|
  | pino de hoje (um ponto para a avenida toda) | 693 a 975 m |
  | interpolando pelas portas do **censo** | 516 m |
  | interpolando pelas portas **marcadas** | **16 a 57 m** |

  As pontas da rua (a menor e a maior marcada) não têm vizinha dos dois lados e continuam com o
  pino de hoje. A medição anterior, que usava o censo como fonte **e** como gabarito, dizia que
  interpolar valia em geral; contra porta de verdade ela não se sustenta, porque a numeração do
  censo naquela avenida não tem relação com a rua. O que vale é a porta marcada.

  Para isso valer **para os outros motoristas** falta o caminho na nuvem: hoje a marcação viaja
  por endereço (o `posicoes` casa chave exata), então marcar 184 e 260 conserta essas duas e não
  ajuda a 200 no celular do Luan. Precisa de um RPC que devolva as portas conhecidas de uma rua —
  a `observacoes` já guarda `rua_chave`, `lat` e `lng`. Migração que o dono roda.
- **Google como reforço, não como troca.** A chave e a tela dela saíram em 02/10 (ideia do Pedro):
  com ela, `geocodificar` ia só ao Google e desligava o censo e a nossa base. Se um dia voltar, tem de ser só
  para o que sobrou "aproximado". E os termos do Google não deixam guardar a coordenada deles —
  então serviria para o pino do dia, nunca para a base de portas.

- **Aviso que toca no celular do dono, com o app fechado.** Desde 28/09 o número "esperando
  você" fica na aba ⚙️ Admin, conferido ao abrir o app e ao voltar para ele
  (`verPendenciasDoAdmin`). Porta confirmada que um motorista tenta mudar entra ali como "tentou
  mudar uma porta confirmada por N motoristas", e para os outros a de antes continua valendo.
  Mas com o app fechado ele não fica sabendo. Notificação de verdade (push) pede chave VAPID, a
  inscrição do celular dele guardada no banco e uma função no Supabase que dispare quando entra
  uma correção em porta confirmada. É projeto próprio, com migração que ele roda.
- **Um lugar só do admin**, para o que hoje precisa de terminal ou não aparece em tela nenhuma.
  O Admin já lista as rotas de 14 dias com entregues/pacotes, ativa e desativa motorista, mostra
  as correções e o uso dos botões. Falta:
  - **Criar conta de entregador: feito em 03/10, falta rodar o `019_criar_motorista.sql`.** Em
    Admin > Motoristas, cola o e-mail e sai a senha, com a mensagem pronta para o WhatsApp. A
    conta nasce dentro do banco, numa função que só admin chama, escrevendo em `auth.users` e
    `auth.identities` como o cadastro do Supabase faz. Não é o caminho oficial (esse pede a chave
    de serviço): se um dia o Supabase mudar essas tabelas, quem pega é o teste @nuvem "o admin cria
    a conta pela tela", que entra com a senha de verdade. Trocar senha continua no terminal.
  - **"Teve problema nesta rota?"** O dado já está gravado desde `011_registro.sql`:
    `rotas.sem_ruas` diz se a sequência saiu em linha reta e por quê, e `pacotes.fonte` /
    `precisao` dizem de onde veio cada posição. A tela do Admin não mostra nenhum dos três —
    é trabalho de tela, não de banco.

- `ruas.nome_chave2` (apelido vindo do OpenStreetMap) ainda tem chave no formato velho: o texto do
  apelido não é guardado, então só se acerta no próximo `npm run ruas`. Não dá resposta errada —
  nenhuma busca produz mais aquela forma, ela só deixa de casar.
- **"Criar rua que falta no mapa", primeiro uso (03/10).** Criou 16 ruas; as 16 batem com a chave
  que o celular calcula e voltam na consulta do `ruaNaBase`. De fora ficaram uma de 2 km (chave
  juntando trechos) e duas com as duas portas no mesmo ponto. Das 146 entregas já feitas nessas
  ruas, 134 tinham o pino a menos de 100 m da linha: o ganho é para número novo que o censo não tem.
  Cinco das 16 são a mesma rua do mapa escrita com abreviação ou erro ("Queroz", "Prfa Maria P",
  "de A. Lima"), com a linha a 3–55 m dela — não atrapalha, e o próximo endereço escrito igual acha
  direto. O `criar_ruas_das_entregas` olha só `nome_chave` para saber se o mapa já tem a rua, não
  `nome_chave2`: por isso "Rua C1" (o mapa tem "Rua C Um", a 122 m) e "Exator Ernesto José
  Francisco" ("Embaixador", a 24 m) entraram. Medido sem estrago — o `escolherTrecho` desempata
  pelo bairro — então ficou como está. O botão não roda sozinho.
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
