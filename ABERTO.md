# O que está aberto

Para não ter que reconstruir de memória a cada conversa. Curto de propósito: o **porquê** de cada
decisão está na mensagem do commit que a fez, não aqui.

Atualizado em 15/10/2026.

## O que vem agora

Uma linha por frente, com o estado e a próxima ação. Esta ordem vale sobre a de 12/10, logo
abaixo, que fica como registro. O detalhe de cada frente está na seção da data indicada.

1. **Leitura da gravação do Meli e Editar** (14/10). Publicada em 15/10 (`60e555d`), aguardando a
   rua. Próximo: conferir parada por parada a próxima gravação lida no celular, de preferência
   mandada como Documento, e tentar o Editar com um link do Maps sem posição.
2. **Mapa que para de seguir** (15/10, em "Tela nova"). Publicada em 15/10 (`f08736e`), aguardando
   a rua. Próximo: abrir uma parada pela Lista, fechar o cartão e ver o mapa voltar a acompanhar
   sem tocar na mira.
3. **Auditoria de entregar e desfazer** (12/10). Pendente, a primeira de código. Próximo:
   reproduzir a gravação que falha calada no celular e a fila cortada em 3.000, cada uma com o seu
   teste. Entra junto o "Entreguei" da Lista, que descarta o GPS ruim sem avisar (suspeita de 14/10).
4. **Desfazer retira a passagem** (12/10, em "Desfazer a entrega"). Decidida, não feita. Próximo:
   na auditoria, conferir o caminho e escrever a migração para o dono rodar.
5. **Parada sem pino** (14/10). Pendente. Próximo: reproduzir. Hoje ela não pode ser marcada como
   entregue, e o aviso "N parada(s) sem local" não leva até ela.
6. **Resumo da leitura com o total do Meli** (12/10). Pendente. Próximo: mostrar a diferença entre
   as linhas lidas e o total do topo da lista, nunca como "faltam N".
7. **Achados da leitura, não mexidos** (14/10): o cartão aberto com CEP engole os fechados da mesma
   porta, e a chave do endereço não olha o nome do condomínio. Confirmados com linhas montadas,
   não vistos errando numa gravação. Próximo: medir nas gravações antes de criar regra.
8. **Diagnóstico curto no Admin** (12/10). Pendente. Próximo: definir os motivos fechados de "teve
   problema nesta rota?".
9. **Leitura sem regra segura** (14/10): a etiqueta para escolher a porta, o total do topo como
   teto e o censo para desempatar a porta (2611). Suspensas. Próximo: só com medição nova.
10. **Trava de marcação em lote** (04/10). Pendente, sem pressa, a pedido do dono: portas de
    endereços diferentes gravadas no mesmo ponto em poucos minutos.
11. **Falso positivo da trava de segredos** (15/10). Pendente. A linha da chave de serviço sem
    valor (o nome, o sinal de igual e nada mais), seguida de qualquer outra, conta como chave com
    valor: o `\s*` de `guarda-segredos.mjs` atravessa a quebra de linha. Até escrever o nome colado
    ao igual num texto dispara. Próximo: comparar só na mesma linha, com teste nas duas direções: a
    vazia passa e a chave com valor continua barrada.
12. **Parágrafo repetido em "Falha viva"** (15/10), o da chave do lugar que não normaliza
    abreviação. Pendente. Próximo: tirar só a repetição, sem mudar o conteúdo.
13. **Porta verificada no lugar errado, sem conserto fácil** (15/10, pedido do Pedro, Avenida
    Canal de Santa Maria 28). Lido no código, não reproduzido. Hoje só a marcação do admin conserta,
    e para isso a parada tem de estar no celular dele (a planilha do Pedro) ou ir pelo
    `npm run portas`. O "Apagar" do Admin tira só a marcação: a passagem da entrega fica, e uma
    passagem no pino sozinha já verifica (`npp >= 1` em `posicoes`). O próprio motorista, marcando
    no mapa, troca a marcação dele, mas a passagem dele continua verificando o lugar errado para os
    outros, embora o cartão diga "Se estiver errado, arrume em Conferir". O Admin só lista lugares
    com marcação, sem busca. **Publicado em 15/10 (`c162fcb`):** "Procurar um endereço" no Admin, por
    rua e número ou CEP e número, nos pacotes e nas chaves das marcações e passagens. Mostra a porta
    que vale e de onde vem, e "Marcar como admin" grava a certa tocando no mapa, depois de
    confirmar. Próximo: o Pedro dizer onde fica a porta certa; o dono marca pela busca, e confere-se
    a chave e o celular de outro motorista.
14. **Admin retirar a validade de uma passagem** (15/10). Pendente, depois da auditoria de entregar e
    desfazer. Invalidar a prova ou apagar o registro são decisões diferentes, e dependem de quanta
    auditoria se quer guardar. Precisa de migração.
15. **Painel de problemas no Admin** (item 8). Contado em 15/10, só leitura, endereços com marcação
    ou entrega nos últimos 30 dias: 2.244, com 1.756 portas valendo (1.752 verificadas; 320 pelo
    admin). A conta refaz a `posicoes` no script: não foi comparada com a nuvem, que só responde a
    usuário logado. Grafias diferentes e "motorista sem enviar" ficaram fora.
    - **Verificada por um motorista só:** 1.383, quase toda porta, e sozinha não é problema. Com
      planilha para comparar, 1.380; a mais de 300 m da planilha, 22 (18 até 1 km, 4 acima).
    - **Em disputa**, prova a mais de 30 m da porta que vale: de outro motorista, 18 (10 até 100 m,
      6 até 500 m, 2 acima); só do mesmo motorista, em outro dia, 39 (10, 23 e 6). Outras 80 já
      foram decididas pelo admin.
    - **Marcação em lote** (5 ou mais endereços em 10 min, a até 30 m do primeiro): 22 levas, de 5
      a 36 endereços. Muito acima do esperado: pode ser entrega na portaria de condomínio. A conta
      mede só esse padrão, e zero não provaria que o risco sumiu.
    - **Amostra (15/10), 10 de cada grupo,** decidida pela porta do censo com o número exato. O censo
      é referência, não juiz: "problema real" seria suspeita forte, não certeza.
      - Longe da planilha: nenhum problema real, 2 falsos alertas (a porta que vale bate com o censo)
        e 8 ambíguos, todos por o censo não ter o número.
      - Disputa com outro motorista: nenhum problema real, 5 falsos alertas (a porta que vale bate
        com o censo; quem errou foi a outra prova) e 5 ambíguos.
      - Lote: nenhum problema real, 1 falso alerta, 5 ambíguos e 4 em que nenhuma porta que vale
        ficou no ponto da leva, inclusive a de 36 endereços. Elas nunca chegaram a valer.
    - **Conclusão: nenhum dos três tipos entra no painel agora.** Nenhum chega a 7 de 10. Nos
      ambíguos, o admin não teria na tela o que decide, e o lote não tem ação. O que é acionável já
      tem caminho: "Precisa de você" e "Procurar um endereço". Nos casos que o censo decidiu, a porta
      que vale bateu com ele, inclusive nas disputas.
    - **Ressalvas:** a porta foi recalculada no script, sem comparar com a resposta da nuvem; a
      amostra mede só os critérios definidos, não todos os casos possíveis; a porta do Pedro não
      entrou nela. Voltar ao painel só com um dado novo que decida os ambíguos, como mais portas
      confirmadas ou o censo cobrindo mais números.
16. **Motorista novo em conferência** (15/10, seção abaixo). Publicado em 15/10 (`fd23581`), com
    a 022 rodada e o `test:nuvem` em 8 de 8. Aguardando a rua. Próximo: o dono decidir no Admin o
    que César e Tomaz mandarem, e ver se uns 5 por dia pesam; encerrar a conferência de cada um
    quando confiar.

Resolvida: **várias entregas na mesma porta** (item 4 de 12/10). Cartões iguais viram uma parada
cada (`26a82c1`, publicada em `60e555d`), e os cinco da Augusto Franco 2000 de 07/10 voltaram a ser
cinco. O que sobra é o item 7.

Fora da lista:
- as seções "para olhar na rua" esperam um relato da rua, sem trabalho de código antes;
- "Falha viva" guarda os defeitos conhecidos sem conserto decidido;
- as medições sem data (Barra dos Coqueiros, regras por tipo de rota, rua de nome genérico no
  mapa) estão nas seções de 09/10.

## Motorista novo em conferência (15/10): publicado, aguardando a rua

- **O pedido:** no dia em que entraram dois motoristas novos, um marcou duas portas no lugar
  errado, e uma já apareceu verificada para todos; o dono apagou. O que vale para todos sai de um
  motorista só por três caminhos:
  - o "Entreguei aqui", que grava a marcação e a passagem no mesmo ponto, perto do pino ou longe;
  - a entrega a até 30 m do pino;
  - duas entregas no mesmo ponto em dias diferentes.

  O primeiro foi o caminho das 33 portas de 04/10. Pedido do dono: conferir tudo o que o novo
  entrega no período, "se entregou, é lá que vale".
- **Medido:** do que o novo apagado deixou não sobra rastro, e o que ficou dele (5 passagens
  marcadas de casa, a 3,5 km) não verifica nada sozinho. Nas primeiras semanas de quem entrou
  depois da 017, o que mudaria a porta para os outros:
  - Leudy: 44 endereços, 6 só por entrega no pino;
  - Jefferson: 34, 18 só no pino.

  Uns 5 por dia para o admin olhar.
- **O que a 022 faz:**
  - conta nova nasce em conferência (`perfis.conferir`), e as de 15/10 entram com o que já
    gravaram;
  - marcação, passagem e lugar com nome nascem pendentes. O banco decide pelo perfil, não pelo que
    o celular manda;
  - o pendente não entra na `posicoes`, nos lugares com nome, na âncora do CEP nem nas ruas
    desenhadas ou nomeadas pelas entregas. No celular dele a memória do aparelho continua
    lembrando;
  - no Admin, "Em conferência" lista só o que mudaria a porta para os outros, com a distância do
    pino da rota dele. O que vai longe vem primeiro, e as entregues no pino são aprovadas num
    toque;
  - aprovar faz valer como a de qualquer motorista, não como a do admin. Apagar tira a marcação e
    o lugar, e guarda a passagem como recusada;
  - em Motoristas: "Encerrar conferência" ou "Pôr em conferência". Encerrar não solta o que ficou
    esperando.
- **Testado:** num Postgres local com o `banco-inteiro.sql` e o `000_rodar_tudo.sql` por cima, e
  em unidade e e2e com a nuvem simulada. Sabotados a separação do pino, a ordem, o filtro do
  pendente na lista comum e o número do selo: os testes quebraram. O teste `@nuvem` novo
  passou depois da 022. A primeira rodada falhou nele porque o teste da rua deixa a conta de teste
  como admin, e marcação de admin não fica pendente: a afirmação pegou o par que valia. As contas
  de teste fazem o motorista antigo e saem da conferência, senão o teste do CEP e o da rua deixam
  de passar.
- **Achado no caminho:** o `compartilhadas.spec` não rodava. A conta "Teste A", de 26/09, não saía
  do banco porque a limpeza não apagava a contagem dos botões (016), e a criação das contas
  falhava. Depois da 021 as contas dele também nasciam desativadas. Consertado: limpa todas as
  tabelas do perfil e ativa as contas. Ele voltou a passar, e é ele que confere a sugestão e a
  verificação entre dois motoristas com a `posicoes` da 022.
- **A Etelvino Alves de Lima 830 do César** foi confirmada pelo dono de propósito: ele marcou no
  lugar certo.
- **Não coberto:** o item 10 (trava de marcação em lote) continua valendo para quem já saiu da
  conferência.

## Perguntas do Luan sobre a rota de 06/10 (15/10), respondidas, nada a mudar

- **"Entreguei" simples no lugar certo e não verificado**, Oswaldo Garavini 60: ele entregou o 48 e
  o 60 do mesmo ponto, com 4 s de diferença, a 15 m do pino do 48 e a 31 m do pino do 60. Passou
  dos 30 m e não verificou. Verificar ali levaria a porta do 60 para a do 48.
- **Paulo Rocha Novaes "R.O33"**: sem número que o app leia, o endereço não tem chave, e nada
  dessa entrega sobe. Medido nas planilhas guardadas: 17 de 5.201 pacotes (0,3%) ficam sem chave,
  4 deles este. Recusado: não vale uma regra.
- **Na rota de 06/10 dele, 38 passagens chegaram, 27 no pino.**
- **"Cadê o Maps com várias paradas"**: continuava na Lista ("Abrir as próximas N no Google Maps"
  e "No Google Maps, por trecho"), que só existe depois de "Montar a rota". Até 02/10 ficava no
  cartão da próxima, e a tela nova o levou para a lista para o cartão ficar baixo.
- **O Maps no cartão do pino (16/10), pedido do dono.** Fica entre o Waze e o Depois. Com rota, vai
  até aquele pino e segue a ordem da rota; sem rota, ou fora dela, só até o pino. O trecho não
  passa de 9 pontos, porque o Maps vai até a letra I. O ajuste "Paradas por trecho" aceitava 25 e
  agora para em 9, nos trechos da lista também. Na porta verificada, Entreguei, Waze, Maps e Depois
  ficam numa fileira só. O dono pediu para diminuir os botões, mas medido em 360 e 412 px eles
  cabem do tamanho de sempre, então ficaram assim. Não está no cartão da próxima, que tem o
  "Google Maps" de um destino só. Olhar na rua: se o Maps abre todos os pontos no celular deles.

## Próximos passos, nesta ordem (12/10)

1. **Auditoria de entregar e desfazer**, numa conversa nova. Começa por dois achados de leitura do
   código, ainda não reproduzidos:
   - **a gravação no celular que falha passa calada.** `salvarEstado` devolve false (memória do
     navegador cheia, por exemplo) e `loja.mudou` ignora: a tela mostraria "Entregue" sem ter
     gravado. O mesmo vale para a fila e para as seguradas (`g.gravar` sem olhar a resposta);
   - **a fila corta em 3.000 itens** (`slice(-FILA_MAX)`) e descarta os mais antigos sem avisar,
     entregas e correções incluídas. Só chega lá quem fica muitos dias sem enviar (deslogado, por
     exemplo). Definir o que fazer no limite, não só parar de descartar.
   Cada um com a sua reprodução e o seu teste.
2. **Desfazer retira a passagem** (decisão A, abaixo em "Desfazer a entrega"). O motorista não pode
   apagar passagem no banco (`observacoes` não tem permissão de apagar): precisa de migração, e
   estreita, que tire só a passagem daquela marcação. A confirmação é calculada na consulta
   (`posicoes`), mas conferir quando o celular volta a consultar depois do desfazer.
3. **Resumo da leitura com o total do Meli.** O topo da lista diz "Seu percurso tem N paradas" e "N
   unidades no veículo", e o leitor já lê: o total em 11/10, 07/10 e 26/09 (as gravações que começam
   no topo), as unidades em 5 das 6. O app sabe quantas linhas leu, não quantas estão certas: em
   11/10 seriam 62 linhas para 61 paradas (uma faltando e duas a mais se compensam), em 07/10, 64
   para 67. Mostrar como diferença para o total, nunca como "faltam N". Unidades: comparar só quando
   cada cartão trouxe a sua.
4. **Várias entregas na mesma porta** (paradas 43 a 47 de 07/10). Quantas vezes uma mesma leitura
   viu a porta preserva os cartões; o total do topo só aponta a diferença, não decide onde
   acrescentar. Teste central: oito cartões da mesma porta continuam oito entregas, e reler os
   mesmos cartões em outro quadro não multiplica.
5. **Diagnóstico curto no Admin** ("teve problema nesta rota?"), com motivos fechados.

Olhados em 12/10 e deixados de fora: PostGIS (as contas de lugar já rodam no banco; o limite de
1.000 linhas pega os scripts de medição, não o app), bloquear vídeo pela memória do aparelho (o pico
de 763 MB caiu para 410 MB em 20/09, sem travamento relatado), índice espacial do censo (o problema
da Barra é a decisão, não a velocidade) e cancelar o pedido de rota mais cedo (o prazo de 12 s já
existe; cair na linha reta antes pioraria a rota em rede lenta que funciona).

## Rota do Meli do dono, 14/10: leitura e Editar publicados, aguardando a rua; entregas sem causa fechada

**Estado (15/10): publicado na `main` (`60e555d`), aguardando a primeira validação em campo.** A
frente só fecha quando houver:
- uma leitura de gravação de verdade, feita no celular, conferida parada por parada, sem duplicação
  nova e sem perda nova;
- o Editar conferido com um link sem posição;
- as pendências abaixo registradas sem virar regressão.

Uma gravação mandada como Documento é o melhor caso para comparar com as cópias do WhatsApp. A
branch `leitura-editar-1410` ficou no GitHub, igual ao que foi publicado.

**Medido: os erros de leitura de 14/10.** O vídeo que chegou pelo WhatsApp tem 480 px de largura; o
celular leu a gravação original. Lido pelo app no computador, contra um gabarito dos 48 quadros
(fora do git), das 72 paradas: 67 certas, 4 erradas, 1 faltando e 4 linhas a mais. 3 paradas
ficaram com o número errado no crachá (82, 67, 62). Cada erro e onde nasceu:
- **3753 lido "3/53 8" e "3/0538"** (a 12, duas linhas). A leitura de apoio (psm 3) do mesmo quadro
  leu "#12 ... 3753" nos dois quadros, e `juntarLeituras` só usava o apoio quando a principal tinha
  um endereço ou menos.
- **"814" em 4 quadros e "8114" em 1** (a 25, uma linha a mais). As duas têm a etiqueta #25, que é
  única; a junção exige o mesmo número da porta.
- **"Hermes Fontes Õ 2022" e "Manoel Dias da costo (E) 430"**: o botão azul do mapa, por cima do
  fim da linha, num quadro; no seguinte, a linha limpa. Empatadas em 1 quadro cada, ficava a mais
  comprida, que é a suja.
- **"Rua Quirino SN" virou três linhas** (a 7): a cortada pela borda, a sem crachá e a com #7.
  SN não tem número, e as regras de juntar quadros pediam número.
- **A 48 e a 49, as duas "Rua Padre Nestor Sampaio 115"**, viraram uma: duas linhas iguais na mesma
  leitura caíam na mesma chave antes da regra das duas paradas na mesma porta.
- **"2611" lido "26", "261" e "26111"**: fica "26111", o mais comprido.
- **Crachás**: "82" numa rota de 72; "62" num quadro e "2" no outro; "67" nos dois.

No celular (pelos textos das passagens): "260 & 8" virou uma parada a mais (o selo lido "& 8",
como "3501 &8"), e o 3753 saiu "3/03 8".

**Feito: as quatro regras de leitura (14 e 15/10).** Cada uma está no seu commit, com teste que
falha sem ela. Todas foram comparadas parada por parada nas sete gravações e nos dois conjuntos de
quadros lidos como print (07/10 e 11/10), e cada mudança foi conferida no gabarito ou nos quadros.
Todas as amostras são cópias do WhatsApp (386 a 576 px); a gravação original continua sem medir.
- **Cartões iguais na mesma porta** (`26a82c1`). Quantas vezes uma leitura viu a linha é quantas
  paradas ela é; leituras e quadros diferentes não se somam.
  - Cada cartão sai como a leitura que mais o viu trouxe. Copiar a melhor leitura em todos punha o
    condomínio e a unidade de um cartão nos outros.
  - Os números de parada de outras leituras só vão para cartões idênticos, e só se não sobram.
  - Voltaram 4 paradas em 07/10 (no vídeo e nos prints, estes com os números 44 a 46) e a 49 de
    14/10.
- **O "Adicionar", decisão do dono de 15/10** (`45f10df`). Só o repetido que a leitura de print ou
  vídeo viu vira mais de uma parada, e só até quantas vezes ela viu. Colado ou digitado duas vezes,
  e linha repetida de .txt ou de PDF com texto, continua uma parada só. Ler a mesma gravação de novo
  não acrescenta. Coberto por um teste de ponta a ponta com leitor falso.
- **Leitura limpa no empate** (`fad6302`). Mudou:
  - Hermes Fontes e Manoel Dias da Costa, em 14/10;
  - "2082(3)" para "2082", em 19/09;
  - "745 S&S" para "745" nos prints de 07/10, com o número 7 certo.
- **SN como porta** (`4d2d4dd`), só com o mesmo complemento ou com um começando o outro. O cartão
  fechado não some no aberto. Só 14/10 mudou: saíram as duas linhas a mais da Quirino SN.
- **Porta da leitura de apoio, do mesmo cartão** (`9c42038`), com uma trava a mais que no
  protótipo: não pode ser uma linha que a mesma leitura já trouxe. Mudou:
  - o 3753, em 14/10;
  - o 2176, em 26/09;
  - "37/90" para 3790 nos prints de 11/10, com o número 45 certo.
- **Nos nove conjuntos:** nenhuma parada perdida e nenhuma linha a mais nova. Nenhum texto, unidade
  ou número de parada passou de um cartão para outro.
- **14/10 com as quatro, medido só nesta cópia do WhatsApp:** 71 das 72 certas e duas linhas a mais
  ("8114" e "3/0538"); falta a 2611. Não é ganho garantido em outra gravação e não valida a
  interação com regras futuras.

**Feito: o Editar** (`c109826`). Ele pede o endereço novo ou um link com a posição. O link do
"Compartilhar" do Maps no celular (maps.app.goo.gl) não traz coordenada, e o texto colado virava o
endereço; o do computador traz. Agora:
- link sem coordenada não troca nada e avisa "Seu endereço não foi alterado";
- OK sem mudar nada não busca de novo (a busca passava por cima da porta verificada).

O que o colar em Endereços faz com link sem coordenada não foi conferido.

**Recusado ou pendente na leitura:**
- **Mesma etiqueta, mesma parada.** A etiqueta sozinha não basta para escolher a porta: no 54/504 de
  26/09 juntou a mesma parada e ficou com o número errado. Pendente, sem promessa de que outro
  desempate a torne segura.
- **Número da parada acima do total do topo.** Em 07/10 o topo dizia 67 e há as paradas 68 e 69: o
  total não é teto. Fica fora até entender a diferença.
- **Número da parada em desacordo entre quadros:** tirou 5 certos para 3 errados. Recusada.
- **O censo para desempatar a porta** (2611): não medido.
- **O apoio como proposto no começo** (só rua, CEP e complemento): recusado, porque trocava pela
  linha de outro cartão.

**Achados no caminho, confirmados e não mexidos:**
- **A chave do endereço não olha o nome do condomínio.** Duas SN da mesma rua e do mesmo CEP, em
  condomínios diferentes, viram uma linha. Já era assim antes.
- **O cartão fechado some quando o aberto da mesma porta traz o CEP.** A regra do cartão cortado
  pela borda tira a linha sem CEP e sem complemento, mesmo quando a mesma leitura viu as duas. Quatro
  fechados e um aberto com CEP saem como uma parada, antes e depois destas mudanças. Em 07/10 não
  aconteceu só porque o CEP do aberto saiu cortado.

**Medido: as entregas, pela nuvem.** As 72 paradas se dividem assim:
- **43 com "Entreguei aqui"**, em 44 marcações: no celular a 8 foi lida duas vezes, "260" e
  "260 & 8", e marcada duas vezes.
- **2 em porta já verificada**, que não tem o botão "aqui", de propósito.
- **11 com "Entreguei" simples** e GPS bom (±4 a 10 m), sem marcar a porta. Três delas (Quirino
  1100, duas, e Quirino SN) foram marcadas da porta do Poesia, a 1 km, depois de ele arrumar os
  pinos à mão: a passagem ficou no lugar errado, e sozinha ela não confirma nada.
- **16 sem rastro.**

A nuvem não diz se uma parada foi concluída. Rota lida de vídeo não sobe pacotes, e o banco guarda
uma passagem por lugar, motorista e dia: a 48 e a 49, e talvez a 85A e a 85B, deixam uma só. Sem
rastro pode ser:
- não entregue;
- entregue sem pino;
- sem CEP nem bairro (sem chave);
- GPS acima de 40 m;
- ainda na fila do celular.

**Relato do dono sobre as que não deram (14/10).** Quase o tempo todo pela Lista, para ganhar
tempo. Em algumas, o "Entreguei" deu o aviso de GPS impreciso, e ele bloqueou a tela e seguiu; em
outras não deu erro, mas o 4G oscilava (na Quirino, principalmente).

**Suspeita de UX, não reproduzida.** No "Entreguei" da Lista, a posição com GPS ruim é descartada
sem aviso. Investigar na auditoria de entregar e desfazer. Pode explicar algumas das 16, não todas:
outras podem ser entregas que não aconteceram, pendências no celular ou paradas sem pino. O que
o código mostra:
- **O aviso de GPS impreciso só sai do "Entreguei aqui"** (cartão da próxima e balão do pino). Ali a
  entrega fica marcada e nada vai para a nuvem, nem a passagem.
- **A Lista só tem o "Entreguei" simples.** Ele não avisa nada do GPS: com margem acima de 40 m, a
  passagem é descartada calada.
- **Rota lida de vídeo não sobe a entrega para a nuvem**, só a passagem e a porta. O que fica na fila
  espera rede e é reenviado quando o app abre; até 15/10 nada atrasado tinha chegado.

Os botões de entrega não mudaram.

**Pendente: parada sem pino.** Dá para arrumar, em Conferir, com Estou aqui, Marcar no mapa e
Editar. Não dá para marcar como entregue em lugar nenhum, e o aviso da rota ("N parada(s) sem
local") não leva até ela. Os botões de entrega não foram mexidos: só depois de reproduzir.

## Porta verificada que chega com a rota já montada (13/10), para olhar na rua

- **O problema:** as portas da nuvem só chegavam ao ler planilha, buscar ou entrar na conta. Em
  13/10 o dono arrumou no computador, às 12:57, o Vista Bela, que a planilha pôs a 4 km. O Luan
  tinha carregado a rota às 12:15 e ia lá sem saber.
- **O que mudou, ideia do Pedro:** o app pergunta à nuvem ao abrir e ao voltar para a tela, no
  máximo uma vez por minuto e só com sinal, como faz com a versão nova.
  - **Entra sem perguntar:** o que não mexe em pino, como a porta verificada onde o pino já está
    ou a sugestão de outro motorista.
  - **Espera o toque:** o que leva o pino para outro lugar mostra a barra "Endereço verificado na
    nuvem para N entregas" com Atualizar. Ao tocar, os pinos vão e a ordem da rota fica,
    desatualizada, até ele refazer. Entregue e arrumada à mão neste aparelho ficam de fora.
- **Olhar na rua:** se a barra aparece e é tocada, e se uma por minuto pesa nos dados móveis (é uma
  consulta pequena, só das pendentes).

## Rota do Luan de 13/10: Augusto Franco 4141 e Visconde de Maracaju 800, medidos

- **Augusto Franco 4141, Condomínio Poesia (CEP 49047-040).**
  - **O erro:** a planilha pôs o 4141 no ponto do 3553, na mesma parada (Stop 2). O "número não
    bate" marcou os dois de vermelho, e nenhum se mexeu. A porta do censo do 3553 está a 58 m do
    ponto, então o errado é o 4141. O Poesia Art Home fica a uns 390 m.
  - **Por que o censo não salvou:** com CEP, o caminho aceita a porta até 20 números longe. A mais
    perto é a 4101, a 40 números. O conserto de 11/10 (bf2013c) valeu só para endereço sem CEP.
  - **Nenhuma porta conhecida:** ninguém marcou o 4141 na nuvem, em chave nenhuma.
  - **Porta gravada em 13/10:** pelo `npm run portas`, como admin, no ponto do Poesia Art Home
    copiado do Google, nas chaves com CEP e pela rua. Fica a 39 m da porta 4101 do censo. Os
    celulares a recebem na próxima planilha, busca ou entrada na conta.
- **Medido nas 1.232 portas conhecidas com posição da planilha:**
  - **Aceitar até 100 números também com CEP:** a planilha ficou mais perto da porta em 53 casos e
    o censo em 3. Fica como está.
  - **Com "número não bate" no mesmo ponto:** 2 casos, a planilha certa nos dois.
- **Visconde de Maracaju 800, Condomínio Vista Bela (CEP 49070-070, Cidade Nova).**
  - **A discordância:** a planilha pôs em Pereira Lobo. O censo tem a avenida, nesse CEP e em
    Cidade Nova, uns 4 km ao norte, sem o 800 (848 e 856).
  - **Medido:** com a planilha a mais de 1 km de toda porta do próprio CEP, ela estava certa em 31
    de 32 casos. Não mover. Saber onde fica vai depender da entrega.
- **Defeito achado e consertado:**
  - **O que acontecia:** um link do Google aberto a partir da página da avenida traz dois pares
    `!3d!4d`, e o app pegava o primeiro, que é o da avenida. O link do Poesia levava o pino 1,8 km
    para longe.
  - **O conserto:** agora o app e o `npm run portas` pegam o último par, que é o do lugar. Um teste
    confere que os dois leem o mesmo ponto do mesmo link.
- Possível, não decidido: no "número não bate", não pintar de vermelho o número que a porta do
  censo confirma no ponto (o 3553), só o outro.

## Mesmo endereço em dois lugares da planilha (13/10), medido, não decidido

- Rota do Pedro de 13/10: Parque Alameda Real, Av. Jornalista Juarez Conrado Dantas 1125,
  CEP 49039-083.
  - **Os dois pacotes:** a parada 31 e um ADS. A planilha pôs a parada 31 na avenida e o ADS dentro
    do condomínio, a 740 m um do outro: dois pinos, os dois verdes, "Posição da planilha".
  - **Por que nada arbitrou:** o censo não tem o 1125 nesse CEP (vai até o 1000), e não havia porta
    conhecida.
  - **O que o Pedro fez:** arrumou o pino às 08:01 e entregou os dois juntos às 08:30, no lugar do
    ADS. A correção e a passagem caíram a 2 m uma da outra, então daqui em diante essa porta é
    verificada.
- Medido em 95 rotas (9.096 pacotes da Shopee):
  - **Quantas vezes:** 1.246 vezes a mesma rota trouxe 2 ou mais pacotes com o mesmo CEP e número.
    Só 11 estavam a mais de 150 m uns dos outros, 6 delas com um ADS.
  - **Quem estava certo, onde a porta é conhecida:** o ADS em 1 caso (este), o pacote com Stop em
    nenhum, nenhum dos dois em 2. Os outros 7 eram entre paradas normais.
  - **A maioria também não decide.** Dos 8 casos distintos com uma porta que diz algo (outros 2
    tinham a porta a 7–9 km de todos os pontos, e 1 era a mesma planilha carregada duas vezes):
    - o monte com mais pacotes acertou 3 vezes e o com menos acertou 2;
    - nenhum dos dois estava certo em 2;
    - o de hoje era 1 contra 1.
  - **Conclusão:** não há lado que se possa preferir.
- No mesmo dia: Morada Feliz, 1001. O ADS ficou a 230 a 270 m dos outros 7 pacotes do mesmo número,
  e a entrega mostrou que os 7 estavam certos (a 3 m) e o ADS não.
- Possível, não decidido:
  - quando o mesmo CEP e número caem a mais de 150 m e nada arbitra, pintar de laranja com a outra
    posição como opção;
  - ao arrumar um, levar junto os de mesmo CEP e número sem o limite de 300 m.

## Revisão de segurança (12/10)

- Conferido e já certo: RLS em todas as tabelas, toda função `security definer` com `search_path`
  fixo, nenhum SQL montado com texto, nada de HTML cru no React, e o `npm audit` do que vai para o
  celular dá 0. O teste da nuvem já tenta forjar rota no nome do admin, se promover a admin e criar
  conta sendo motorista.
- Feito:
  - o leitor de texto (Tesseract) tem versão fixa (5.1.1) e o resumo do arquivo (SRI). Se o arquivo
    no CDN for outro, ele não roda. Ao abrir o app com sinal, o celular baixa o leitor no endereço
    novo, para não perder a leitura sem sinal;
  - o balão do pino passa pelo `esc`;
  - as ações do GitHub ficam presas ao commit. Atualizar é à mão: trocar o commit e o comentário;
  - **021_conta_nasce_desativada.sql, rodada em 12/10.** A conta criada fora da aba Admin nasce
    desativada. "Allow new users to sign up" está desligado (conferido em 12/10 na configuração
    pública do login), mas era a única coisa segurando, e um projeto novo vem com essa opção ligada.
    Testada num Postgres local com o `banco-inteiro.sql` inteiro. O teste da nuvem foi ajustado
    para isso e só passa depois da 021.
- Deixado de fora:
  - o vitest tem 4 alertas, 2 "críticos". É a ferramenta de teste e não vai para o celular; o
    conserto pede o vitest 5, uma versão principal nova;
  - o pdf.js vem por `import()`, que não aceita o resumo do arquivo. Fica a versão exata, 4.8.69,
    posterior à CVE-2024-4367;
  - o `sw.js` guarda a resposta do CDN sem olhar `r.ok`: um erro do CDN na primeira leitura ficaria
    guardado no lugar do leitor. Visto lendo o código, não reproduzido.

## Condomínio com muitas entregas no cartão do pino (12/10), para olhar na rua

- O cartão juntava os números das entregas do mesmo endereço numa faixa só ("#62+#63+…", 23 no
  print de 12/10), que não quebra linha: espremia o endereço numa coluna de uma letra por linha e
  jogava os botões para baixo da tela. E dizia "23 pacotes" para 23 entregas que eram 42 pacotes.
- Agora o selo é como o do pino no mapa ("#62+22"), o endereço comum aparece uma vez, a linha de
  baixo diz "23 entregas · 42 pacotes", os botões dizem "as 23", e "As 23 entregas deste endereço"
  lista cada uma com o que é só dela (apartamento, bloco), os pacotes e um botão para entregar só
  aquela. Fechada quando são mais de 3. A mesma lista vai no cartão da próxima quando ela é um
  condomínio.
- Olhar na rua: se o que sobra de cada entrega é mesmo o apartamento (no teste é; numa planilha que
  escreve o complemento de jeitos diferentes pode sobrar mais coisa), e se alguém usa a lista.

## Admin mais rápido (11/10)

O Admin esperava as três partes para mostrar qualquer coisa, e a mais lenta era contar os pacotes
das rotas de 14 dias, baixando os 6 mil para contar. Agora cada parte entra quando chega, os
pedaços vão ao mesmo tempo, e a contagem é uma função do banco. Medido daqui, só lendo, mediana
de 5: tudo na tela de 3,3 s para 0,9 s. A 020 foi rodada em 11/10: as 65 rotas de 14 dias, 6.489
pacotes, batem uma a uma com a contagem baixando, numa ida de 260 ms. Sem ela o app ainda conta
baixando, então um banco montado do zero sem a 020 não quebra.

## Leitor da gravação do Meli, rota de 11/10 (61 paradas)

Lida pelo app, contada contra um gabarito tirado dos quadros (fora do git): **de 49 para 58
paradas, de 14 para 3 linhas a mais**. A de 07/10 ficou igual (59 de 62).
- **O nome lido torto em um quadro** ("Avenida Presidente Toncrefi) Neves", "Capitão José Vochoo
  af)") virava uma parada a mais, "Não encontrado". Agora o leitor troca, em cada quadro, o nome
  que não existe no censo pela rua do censo de nome mais parecido, com folga sobre a segunda, a
  porta com esse número e o mesmo CEP, se veio. Medido em 320 nomes fora do censo (planilhas e
  vídeos): corrige 17, nenhum errado. Sem as travas, "Rua 39" virava "Rua 3" e "Jorge Arruda"
  virava "Jorge Aruba", a 600 m. Fica de fora: o nome lido torto que por acaso é outra rua de
  verdade sem a porta com o número.
- A mesma correção vale na busca: quando nada acha a rua, ela tenta o nome do censo (endereço
  colado, digitado, editado). Ao abrir, a "Não encontrado" que o censo sabe corrigir é buscada de
  novo — a rota lida antes da correção se conserta sozinha. O texto da parada fica como veio; o
  achado diz que o nome foi corrigido.
- **O selo de "verificado" grudado no número** ("5018", "218", "1878"; 8 paradas de 61). Sai pela
  posição de cada letra (`logica/ocr.ts`): mais largo que um algarismo (0,75 a 1,00 da altura da
  linha, contra 0,65) e depois de um vão grande. Com teto de 1,2, para "II 105" não perder o 105.
- "Rua Projetada 3 262" ficava com a porta 3, e as duas portas da Projetada 3 viravam uma parada.
- "Itajaí O5": o zero da frente lido como letra.
- O cabeçalho "ÁREA 3 | 14:15 a 17:40" virava fim do nome da rua sem número.

- **Duas paradas na mesma porta (12/10).** A 48 e a 49 (condomínio e 9 unidades, bairro e 1
  unidade, cada uma com a sua etiqueta) viravam uma, com o texto de uma e a etiqueta da outra.
  Agora duas linhas da mesma porta que a mesma leitura da imagem viu não se juntam; vindas de
  leituras diferentes, seguem os critérios de sempre (a #36 e a #30 de um print, o 6 lido como 0,
  continuam uma parada). O nome torto passou a ser corrigido em cada leitura, antes de juntar.
  Pelo app, nos seis vídeos e em 73 quadros lidos como print: voltam a 48/49, as duas lojas da
  mesma porta de 26/09 (que tinham perdido o número da parada) e o "APTO 1601" de 21/09, que se
  juntava ao "ap 1002" do mesmo prédio; nenhuma parada dobrou, nenhuma outra linha mudou. A regra
  antiga do selo grudado ("21518" e "2151") saiu: só disparava entre cartões diferentes.

Placar de 11/10 agora, no vídeo: 59 certas, a 20 na lista sem número, a 9 ausente. Antes eram 58:
a linha que sobrava da 48/49 tinha o texto e as unidades da 48 e a etiqueta da 49, e a entrega da
49 (bairro, 1 unidade) sumia. Lidos como print, os mesmos quadros dão as 61, com 8 linhas a mais,
as mesmas de antes da mudança. Fica de fora:
- **A 9, "11" num cartão bloqueado, cinza, sem selo**: lido "1" numa leitura (dois "1" colados num
  símbolo só, quase tão largo quanto alto) e "n" na outra. Não dá para recuperar o número com essas
  leituras, e a parada some na junção (o "1" passa por número cortado do 19 da parada 10). Mantê-la
  na lista sem número é outra decisão, não feita.
- **A 20, "13 ✓" lido "BS"**: fica na lista sem número e vai pela rua e o CEP. O "B" tem a largura
  de dois algarismos, mas "13" e "18" viram "B" do mesmo jeito; não se inventa a porta.
- **Várias entregas com o mesmo texto na mesma porta** ainda viram uma ou duas linhas: Augusto
  Franco 2000 de 07/10, paradas 43 a 47 no mesmo condomínio. O gabarito de 07/10 conta portas, não
  paradas, e não mostrava isso.
- Uma leitura sem etiqueta que nunca apareceu junto com a outra parada da mesma porta vai para a
  primeira delas na ordem. Não aconteceu nas gravações.
- O nome corrigido sai como o censo escreve, sem acento.

## Sem CEP, número depois da última porta do censo (11/10), para olhar na rua

"Avenida Augusto Franco 4141" (Poesia Art Home), cartão bloqueado do Meli: só rua e número. O
censo para no 4120, a 21 números, e o limite era 20; a base de ruas, que não sabe o número, pôs o
pino no trecho mais perto do meio da rota, a 900 m. Agora, sem CEP e sem bairro, a rua de vários
bairros aceita a porta do censo até 100 números longe (laranja, "o IBGE tem o nº X"). Medido nas
planilhas, ruas de vários bairros sem nome genérico: de 21 a 100 números, 13 mais perto do pino
do Meli e 4 mais longe; de 101 a 200 empata, acima perde. A porta do mesmo lado (par/ímpar) foi
pior, ficou de fora. Aqui o pino vai para a 4120, a ~230 m; a 4101, do mesmo lado, fica a 80 m.

## Vizinha de mesmo número em outra rua (11/10), para olhar na rua

"Rua Via Férrea 260" e "Rua Quirino 260", paradas 17 e 18 do Meli, no mesmo condomínio
(Residencial Alameda dos Pássaros): a segunda ficou a 700 m, "número aproximado" na Avenida
Quirino. A Via Férrea não está no censo, na base nem no mapa aberto; o censo tem "Avenida Quirino
260", mas a 550 m do condomínio, numa área industrial — a regra "mesmo nome com outro tipo" só
apareceu em 2 endereços das planilhas e aqui erraria, e ficou de fora.
- Medido nas planilhas: de 75 pares de paradas seguidas com o mesmo número em ruas diferentes, 69
  ficam a menos de 50 m no mapa do Meli e nenhum a mais de 300 m.
- Regra: quando uma tem porta firme (planilha, censo, achada no número, marcada, lembrada ou
  verificada) e a outra só um palpite (número aproximado, bairro, não encontrada, planilha de
  poucas casas decimais), o palpite vai para a porta da outra, laranja, "na porta da vizinha de
  mesmo número". Só as seguidas na sequência do Meli; ADS não conta. Roda em toda reavaliação de
  posição (`marcarIsoladas`): ao marcar ou entregar "aqui" numa das duas, a outra vai junto.
- O pino da planilha com "número não bate" não é palpite: nas 2 vezes em que a regra o moveria
  (condomínios, 25/09 e 27/09) ele estava mais perto da entrega (21 e 14 m) que a porta da
  vizinha (24 e 32 m). Sem ele, a regra não mexe em nenhuma das 3.425 paradas das planilhas
  guardadas: é para rota lida de vídeo, print ou texto, onde a busca chuta o número.
- Se as duas são palpite, nada muda até alguém marcar ou entregar "aqui" numa delas.

## Duas paradas do Pedro de 11/10

- **"Perto do condomínio Stanza"** contava como morar no condomínio, e o censo não mexia: a
  planilha a 742 m, a porta do censo a 6 m de onde ele entregou. A palavra de condomínio depois
  de "perto", "próx.", "em frente", "ao lado" agora é referência. Nas planilhas guardadas mudam 19
  de 2.150 lugares, todos referência; das 2 entregues que mudam o pino, o censo acertou as 2.
- **"Recanto dos Cajueiros, 24, Rua M atrás do GBarbosa, Santa Maria"**: a planilha pôs na Rua M
  do Aruana, a 1,9 km; o censo tem Rua M em 10 bairros. Medido e recusado: "a planilha caiu em
  outro bairro do censo" acontece em 248 lugares, quase sempre nome popular contra o do censo (São
  Conrado e Orlando Dantas, Atalaia e Coroa do Meio), e procurar a rua no bairro escrito piorou 19 e
  melhorou 10. Feito o estreito: a rua do endereço não existe no censo, o complemento diz a rua, e
  ela tem o número exato no bairro escrito. Em 1.894 lugares só este muda: de 1.904 m para 13 m.
- As duas já ficaram verificadas pelo "Entreguei aqui" dele, e o censo não mexe no que o motorista
  arrumou (marcado na mão, lembrado ou verificado).

## "Endereço verificado" que o Pedro não via (10/10), para olhar na rua

- Na planilha dele de 10/10, 13 endereços (39 pacotes) já estavam verificados pelas entregas dele,
  e o celular aplicou: "confirmado". Mas o aviso de carregar só contava os verificados "por outros
  motoristas", e dizia "com a posição que você já tinha corrigido" (a memória do celular); no
  cartão, "Endereço verificado." ficava embaixo dos botões, só rolando.
- Agora o aviso conta a verificada dele também, sem repetir como corrigida, e o cartão mostra
  "Endereço verificado" em verde logo abaixo do endereço. Ver com ele se nota na rua.
- Sobrou: 4 endereços entregues por ele uma vez só, longe do pino (ou duas, a mais de 30 m uma da
  outra), não verificam; e uma linha veio com outro CEP para o mesmo endereço (chave diferente).

## Rota marcada de uma vez, longe das portas (04/10), apagada

O Edilson não terminou a rota de 03/10 (Atalaia) e entregou parte no dia seguinte. Na manhã de
04/10 carregou a rota no app (10h27) e marcou as 42 entregas em 5 minutos, a 2,7 s uma da outra,
de um ponto só, a 8 km das portas: é todo o histórico dele no banco. O botão grande do cartão é "Entreguei aqui", que grava a porta no GPS:
35 correções e 42 passagens nesse ponto, e 33 endereços ficaram verificados ali (correção mais
passagem do mesmo motorista já verificam, 017). Alguns são endereços que voltam nas rotas do
Pedro. No resto do banco é o normal: de 1.263 endereços verificados, os outros 8 que dependem de
marcação em lote são ruas cheias, com a porta mudando a cada marcação. Falta:
- apagadas em 09/10 as 42 passagens e 35 correções dele (o dono rodou no SQL Editor); os 33
  endereços deixaram de sair verificados;
- sem pressa, a pedido dele: uma trava no celular para portas de endereços diferentes, cujos
  pinos estavam longe uns dos outros, gravadas no mesmo ponto em poucos minutos.

## Mapear com os celulares deles (09/10), medido, não construir ainda

- **Rastrear só de andar** não dá com o app como está: com o Waze na frente, o navegador para de
  dar o GPS à página, e é o Waze que fica na frente a maior parte do tempo. Daria com um app de
  Android próprio, ou um gravador de trajeto instalado nos celulares, mas o trajeto diz por onde
  passaram, não qual número é qual casa. Serviria para desenhar no OpenStreetMap as ruas que
  faltam nos loteamentos novos (melhora a rota, não o pino).
- **Faltam ruas no mapa?** Das 1.675 portas entregues, a mediana fica a 3 m de uma rua do
  OpenStreetMap, e só 15 (1%) a mais de 40 m. Na zona sul de Aracaju quase nenhuma: Atalaia 1 de
  167, Aruana 1 de 153, Aeroporto, Farolândia e Coroa do Meio nenhuma. Gravar trajeto lá não
  acrescenta rua; o que erra o pino é qual número é qual casa.
- **Numeração aprendida das entregas**: para uma porta entregue, a posição estimada pelo número,
  entre a porta entregue logo abaixo e a logo acima na mesma rua (vão até 300 números). Dá para
  estimar 473 das 1.650 portas, mediana 19 m. Onde o censo tem a porta (343), ele é melhor
  (10 m; a estimada piora 54 e melhora 28). Onde não tem (130), a estimada fica em 70 m de
  mediana, 92 a até 150 m e 17 a mais de 500 m; falta comparar com a planilha nessas. Na Barra só
  há 59 portas entregues, e dá para estimar 1 a 6: medir de novo quando houver umas 300.

## Regras que não servem para todo tipo de rota (09/10), levantamento

A rota da Leudy (Zona de Expansão da Barra, 17 km de rodovia) mostrou duas regras pensadas para
Aracaju urbana errando em série. O dono pediu para achar todas. Feito até aqui:
- **Longe das outras entregas** marcava um grupo inteiro (15 no Jatobá, a 13 km do resto), e o
  app levava 14 para um "bairro" do mapa a 13 km delas. Agora quem tem 2 vizinhas a 2 km não é
  marcada. Nas 2.224 paradas guardadas só esse grupo muda; as 3 sozinhas continuam. Ao abrir, a
  rota lida antes volta do bairro para a planilha.
- **Número não bate** fica fora de rodovia: o portão do condomínio tem o número dela (4 de 4
  entregues no ponto certo). Em **avenida** acertou 1 de 9 (8 eram portão de condomínio): decidir.

- **Pino marcado durante a busca**: um teste que falhou uma vez mostrou que a resposta atrasada do
  mapa apagava a porta que o motorista marcou enquanto a lista colada ainda era buscada (sem CEP,
  como o cartão fechado do Meli, nem a memória devolvia). A resposta agora só grava se a parada
  ainda está esperando a busca.

- **Longe das outras do mesmo bairro**: duas ADS do Jatobá vieram com um ponto do centro da Barra,
  a 12,8 km das outras 15 do bairro, e nenhuma regra via (perto do meio da rota, censo sem o CEP).
  A mais de 5 km do meio de 3 ou mais do mesmo bairro, com elas juntas, vai para o meio delas,
  vermelha. Entre 2 e 5 km a planilha acertou 8 de 9; acima, só sobram essas e a do Robalo.

## Ler melhor a Barra dos Coqueiros (09/10), proposto

Nas 173 linhas da Barra guardadas (Jeferson 05/10, Leudy 09/10):
- **O censo cobre a Barra pelo nome, não pelo CEP.** São 7.839 portas e os bairros da Zona de
  Expansão (Jatobá, Olhos d'Água, Capuã, Luar da Barra...), mas só 37 linhas acham a porta pelo
  CEP. Não é o CEP geral: só 1 das 173 linhas traz 49140-000 (o Google é que o dá). Conferir a
  posição da planilha pela rua + número + bairro no censo, como já se faz no endereço sem
  coordenada. Medir antes contra as entregas da Barra.
- **O ponto padrão do centro**: em -10,9079, -37,0267 (a rotatória de 05/10) a Shopee pôs 8 ADS de
  7 bairros, entregues de 319 m a 3,9 km dali. A regra do ponto repetido pega quando é idêntico; as
  duas da Leudy eram 400 m ao lado.
- **O bairro escrito de muitos jeitos**: 9 grafias de Olhos d'Água num só condomínio. Toda regra
  que compara bairro sofre (ponto repetido conta "bairros diferentes" que são o mesmo). Unificar
  pelos 31 nomes de bairro do censo da Barra.

Medido em 09/10, nos 87 lugares da Barra das planilhas guardadas, 47 com GPS de entrega:
- **A planilha da Barra erra muito**: só 8 das 47 estavam a até 150 m de onde se entregou; 26 a
  mais de 500 m.
- **Mapa de ruas com nome (satellites.pro, ruas-brasil.openalfa) não traz nada novo**: os dois
  mostram o OpenStreetMap, e a Barra já está na nossa base de ruas desde 20/09 (375 nomes; o OSM
  tem 406 hoje, rodar `npm run ruas -- "Barra dos Coqueiros"` de novo). O OSM da Barra não tem
  número de porta: diz a rua, não onde nela. Levar a planilha fora da rua para o ponto mais perto
  da rua de mesmo nome: em 8 casos, melhorou 4 e piorou 3 (uma "Rua I" de outro lugar, a 26 km).
  Recusado como está.
- **Censo pela rua + número + bairro**: responde em 32 das 47; melhora 15 e piora 6, três delas
  tirando do lugar uma planilha que estava a menos de 80 m. Com a trava de "fora de toda porta da
  rua" sobram 7 a 10 movidas, que ainda pioram 2 a 4: o ganho estava na planilha na rua certa e
  no trecho errado, que é onde a numeração do loteamento e a do censo também discordam. Juntar
  mais entregas da Barra antes de decidir.
- **A memória de entregas quase não ajuda lá ainda**: só 1 das 172 linhas era de endereço já
  entregue em outro dia. As entregas de lá juntam o dado sozinhas (GPS na porta); rodar de novo a
  medição do censo pela rua quando houver umas 150 entregas da Barra.

Falta passar o resto, cada regra contra as entregas, separado por tipo de rota (Aracaju urbana,
Zona de Expansão e rodovia, condomínio, Mercado Livre sem coordenada, outra cidade):
- coordenada com poucas casas decimais ("aproximada");
- ponto repetido para 3 bairros ou mais;
- levar ao bairro pelo mapa: mesmo para a parada sozinha, o centro do bairro que o mapa dá para
  "Zona de Expansão (Jatobá)" estava a 13 km; falta uma trava de distância do ponto original;
- censo: refino, fora e em cima da rua, longe do CEP (a Zona de Expansão não tem porta exata);
- juntar pacotes do mesmo endereço, e a cidade pela faixa do CEP.

## Rua de nome genérico longe das portas do próprio CEP (08/10 e 09/10), para olhar na rua

- A planilha do Pedro pôs uma "Rua B" do Industrial noutra Rua B, perto do aeroporto, a 11,8 km; a
  do Luan pôs uma ADS da "Rua E" a 435 m da porta, noutra rua. Nos dois o app não disse nada: a
  conferência pelo censo pulava rua de nome genérico inteira, até pelo CEP.
- Agora vai para a porta do censo quando: rua de nome genérico, planilha a mais de 100 m de toda
  porta do CEP, e o censo com o número exato do CEP, na rua de mesmo nome e no bairro que a
  planilha diz (no campo ou no texto). Fica laranja, e vermelha quando cai longe da rota.
- Medido contra o GPS das entregas, de 18/09 a 09/10: longe do próprio CEP, em geral quem erra é o
  CEP (21 de 27 a mais de 1 km foram entregues no ponto da planilha). Por isso a regra só vale
  para nome genérico e pede o bairro. Com 100 m ela mexe em 13 paradas; das 7 já entregues, nas 7
  a entrega foi mais perto da porta do censo (a Rua E do Luan, a 4 m dela). Começou em 500 m, e a
  Rua E mostrou que era alto.
- **"Rua E" não batia com nada no `mesmaRua`**: o "e" é palavra vazia, e a rua fica sem nome. A
  regra do CEP usa uma comparação própria, em que a letra é o começo do nome do censo ("Travessa
  E" não é a "Travessa Trinta e Um de Março").
- Olhar se aparece alguma levada para a porta errada: a planilha fica como opção em Conferir.

## O `mesmaRua` e a Rua E nos outros usos (09/10): medido, não mudar

Só "Rua E" e "Travessa E" ficam sem nome: 19 de 3.900 linhas de planilha, nenhuma nas 4 gravações.
- Censo pela rua (`geo.ts` discordaDaPorta e refinoPeloCenso, `ibge.ts` portasDaRuaNoIbge): nome
  vazio é rua genérica, e a genérica sai antes. Não muda nada.
- Ponto genérico da planilha (`geo.ts`, 3 bairros no mesmo ponto): nenhuma Rua E nesse caso.
- Leitor (`juntarLeituras`, `juntarQuadros`): nenhuma Rua E nas gravações; sem evidência.
- Busca no mapa (`geocodificacao.ts` validar): hoje toda Rua E do mapa sai "ruim" (vermelho). Com
  a comparação nova as 15 seriam aceitas, e das 13 com entrega 6 estavam a mais de 600 m (o
  Aruana tem várias Rua E). O vermelho, nascido do defeito, protege. Não aplicar.

## O mapa erra a rua de nome genérico (09/10), medir no caminho inteiro

Consultado como o app faz para endereço sem coordenada (texto livre, sem o CEP), o mapa devolveu
rua de mesmo nome para 117 de 130 ruas genéricas com entrega (Rua A, B, Dois...), e 52 estavam a
mais de 500 m da entrega: outra Rua C do mesmo bairro. O app aceita como "rua certa". Só pesa no
endereço sem coordenada (Meli, colado), e depois que o censo não achou o número pelo CEP. Falta
medir dentro do `geoOSM` de verdade, com o CEP e a âncora dele, antes de decidir.

## Planilha em cima da rua, longe do número (09/10), para olhar na rua

- A regra de 01/10 (de 10 casos) deixava a planilha quando ela estava em cima da rua, a mais de
  80 m da porta do censo. Medida de novo contra as entregas: censo certo em 13, planilha em 6,
  nenhum em 1 (fora da rua, onde já ia para o censo: 21 a 7). A distância não separa. O dono
  decidiu mudar: vai para a porta do censo, laranja, e o aviso diz "em outro trecho da mesma rua".
- A porta verificada continua vencendo o censo. Na planilha do Pedro de 09/10 foram 3: a ADS que
  ele mesmo arrumou à mão para a porta do censo, e duas que o censo erra mas que já tinham entrega
  verificada no pino (e voltam para ela).
- Em commit próprio, para desfazer sem levar a Rua E junto. Medir as próximas entregas desse caso:
  as levadas ficam com fonte IBGE, e a posição da planilha nos candidatos.

## Só o que falta, nas duas listas (07/10)

- **Conferir endereços, sem busca:** "Para conferir" no topo, "Falta entregar" embaixo, e os
  verificados e os entregues recolhidos no fim. A busca continua achando todos, entregues
  também, por causa do B.O. O "Só os para conferir" e o "N para conferir" do menu não mudaram.
- **Lista da rota:** a entrega feita sai do bloco mesmo com o endereço pela metade, e fica só no
  "N entregue(s)" do fim, onde estão o Desfazer e o Cliente xarope.
- Olhar na rua se alguém sente falta de ver a feita no lugar dela da sequência.

## Leitor da gravação da lista do Meli (07/10)

Rota do Mercado Livre de 67 paradas (62 portas), gravada e lida pelo app. O 67 do celular bateu
com o do Meli por coincidência: o leitor achou 53 portas, inventou 12 linhas, e deu número de
parada certo a 6 e errado a 4. Com o texto cru do leitor gravado e um gabarito tirado dos quadros
(os dois fora do git), depois do conserto: **59 portas, 5 linhas a mais, 26 números certos e 2
errados**. Nas gravações de 19/09, 22/09 e 26/09 nada piorou: saíram 3 linhas de lixo e entraram
números pela etiqueta.

- Rua que começa com "da", "do" ou "de" não parecia endereço: sumiam todas as de uma estrada.
- Os ícones da barra de baixo do Meli viravam número de rua no cartão cortado pela borda.
- Rua com dígito no nome ("Rua Q7") não separava o número da porta.
- 85A e 85B eram a mesma porta que a 85, e a com letra era jogada fora. A chave do endereço agora
  tem a letra; medido em 3.269 linhas de planilha, isso separa 2 endereços.
- A mesma porta lida com uma palavra a mais em outro quadro virava duas paradas.
- O número de porta do cartão de cima virava número da parada de baixo.
- Cartão inteiro só com a rua (o Meli manda assim) entra sem número.
- O número da parada vem da etiqueta do pacote ("#AZ-24", "#V-11", qualquer prefixo), e ganha do
  escudo quando os dois brigam. Pacote dividido ("##AZ-25.1") sem o ponto fica sem número.

Ainda erra, sem conserto bom à vista:
- o selo de verificado grudado no número da porta: sai pela posição das letras desde 11/10, mas
  aqui a imagem tratada lê "32/78", com uma barra no meio, e esse continua;
- algarismo romano no nome da rua ("II 105" sai "11105");
- duas leituras do mesmo cartão com um dígito diferente viram duas paradas;
- o escudo do cartão bloqueado ("Habilita as") lido errado quando não há etiqueta;
- várias paradas na mesma porta viram uma: o cartão bloqueado não diz quantos pacotes.

Para medir de novo: espiar o Tesseract num teste do Playwright no Edge (o Chromium dele não abre
o vídeo do WhatsApp), gravar o texto cru de cada quadro, e reproduzir offline com
`extrairEnderecos`, `juntarLeituras` e `juntarQuadros`, que dão a mesma lista que o app.

Uma parada de São Cristóvão, de rua com nome de uma letra, caiu numa rua de mesmo nome da Barra
dos Coqueiros. Falta ver por que a busca saiu da cidade do CEP.

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
- **Decidido em 12/10, ainda não feito: desfazer depois dos 10 min também tira a passagem.** Hoje
  o desfazer pela lista, depois que a porta já subiu, volta o pino e a correção, mas a passagem
  fica na nuvem e soma com outra para verificar a porta. A regra decidida: desfazer a entrega
  retira a prova de lugar que aquela marcação produziu, antes ou depois do envio. Outras passagens
  independentes do mesmo endereço continuam valendo. Sem rede, a retirada fica na fila; um reenvio
  antigo não pode trazer de volta a passagem desfeita. Fica para a auditoria de entregar e
  desfazer: conferir o caminho inteiro e dizer se precisa de migração (se precisar, o SQL vai
  pronto para o dono rodar).

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

  **Relato do dono, 15/10: o mapa não fica seguindo.** Ele tem de tocar na mira para o mapa voltar
  a acompanhar, e sente atraso na posição. Ele trabalha quase todo pela Lista.
  - **Consertado e publicado em 15/10** (`f08736e`, aguardando a rua). Para fechar: abrir uma parada
    pela Lista, fechar o cartão e o mapa voltar a acompanhar sem tocar na mira. O atraso do
    reenquadramento é outra coisa e não conta para isso.
    - Tocar numa parada da Lista chamava `focar`, que desligava o seguir de vez (decisão de 02/10,
      "Ver no mapa desliga"). Fechado o cartão, o mapa ficava na parada até a mira. Agora o cartão
      aberto só pausa, e ao fechar o mapa volta para ele. Vale também para o "Aqui perto", o Ver
      no mapa da Conferir, o Editar e escolher um local.
    - Testado de ponta a ponta, cada teste sabotado:
      - duas paradas seguidas pela Lista;
      - o Ver no mapa e o Editar (cancelado, e com link) pela Conferir, voltando à Rota;
      - o arrasto com o cartão aberto continua desligando, e fechar o cartão não religa.
    - Só conferido no código: o "Aqui perto" passa pelo mesmo `focar`. Ir ao Waze não mexe no
      seguir, e depois de muito tempo fora o app recarrega já seguindo.
  - **Não mexido, para olhar na rua:** o arrasto continua desligando o seguir até a mira, como no
    Google Maps. Se ele ainda sentir falta, a saída é voltar sozinho depois de alguns segundos sem
    tocar, como no Waze. A margem do GPS acima de 300 m pausa sem aviso, e volta sozinha.
  - **O atraso** pode ser o passo de 30 m: a 30 km/h, o mapa pula a cada 3 ou 4 segundos. A bolinha
    anda a cada posição do GPS; só o mapa espera. Não medido.
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
  - **Criar conta de entregador: feito em 03/10, e a `019_criar_motorista.sql` está aplicada**
    (conferido em 12/10: a função existe no banco e recusa a chave pública). Em
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
