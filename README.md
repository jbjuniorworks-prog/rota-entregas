# Rota de Entregas

App (PWA) que os entregadores usam para ordenar as paradas do dia.

Lê a planilha da rota (Shopee, inclusive a que vem como .txt), prints ou PDF
da lista de paradas e a gravação da tela da lista do Meli, localiza cada
endereço, agrupa as entregas próximas e calcula a sequência mais curta pelas
ruas. Abre cada parada no Waze ou no Google Maps, em trechos que respeitam o
limite de pontos do Maps. Instalável no Android: ao compartilhar prints ou a
gravação com o app, a rota é montada automaticamente.

Só entra quem tem conta (criada pelo administrador). As rotas, as entregas e
as correções de pino vão para o Supabase; a correção de um motorista vira
sugestão para os outros, e com 2 motoristas no mesmo ponto (ou o admin) vale
para todos. Ao marcar uma entrega na porta, o app guarda a posição do celular:
duas passagens no mesmo ponto também confirmam o lugar, e elas dão nome aos
trechos de rua que o mapa livre não tem. Elas também ensinam **onde fica cada CEP**: um CEP é
uma quadra (80 m), e para a rua nova que nenhum mapa tem ainda é o que chega mais perto.
Nenhuma posição pode cair longe do bairro do endereço — o censo do IBGE dá o piso, sem rede. Consultas de endereço vão ao OpenStreetMap/ViaCEP e de rota ao OSRM.

[ABERTO.md](ABERTO.md) diz o que ainda está em aberto e o que já foi decidido.
[CLAUDE.md](CLAUDE.md) diz como se trabalha aqui — convenções e as armadilhas que já custaram caro.

## Começar

Precisa do Node 22, o mesmo do GitHub Actions.

```
npm install
git config core.hooksPath ferramentas/hooks
npx playwright install chromium
```

- `git config core.hooksPath ferramentas/hooks` liga neste clone a trava contra vazar dado (mais
  abaixo). O git não copia essa configuração: cada clone novo roda uma vez.
- `npx playwright install chromium` baixa o navegador dos testes de tela.

Conferir, na ordem em que o GitHub confere antes de publicar:

```
node ferramentas/guarda-segredos.mjs
npm run tipos
npm run test:unidade
npm test
```

`npm test` monta o build sozinho e roda as telas no tamanho de celular, com a nuvem simulada. Não
precisa de `.env` nem de rede.

`npm run dev` abre o app em `http://127.0.0.1:5173`. Ele fala com o **banco do app publicado**: para
entrar é preciso uma conta, e o que se fizer ali vai para os dados de verdade.

### O `.env`

Fica na raiz, uma linha por variável no formato `NOME=valor`. Só é lido pelas ferramentas de
`ferramentas/` que falam com o banco e pelo `npm run test:nuvem`; o app não o lê. Os nomes:

- `SUPABASE_URL`: o endereço do projeto do Supabase que o app usa (Project Settings > API).
- `SUPABASE_SERVICE_ROLE_KEY`: a chave de serviço (service_role), que passa por cima de todas as
  permissões do banco. Fica só no computador do dono: nunca no app, no git, em issue, em commit ou
  em mensagem.
- `SUPABASE_URL_DESTINO` e `SUPABASE_SERVICE_ROLE_KEY_DESTINO`: só para o `npm run restaurar`, o
  projeto de **teste** que recebe o backup.

Não cole valor real neste README nem em lugar nenhum do repositório. O `.env` está no
`.gitignore`, e a trava recusa qualquer arquivo cujo nome comece com `.env`.

### Outro projeto do Supabase

O app publicado fala com o projeto escrito em `app/src/servicos/nuvem.ts`: o endereço e a chave
pública (anon). Ela é pública de propósito; quem protege os dados são as permissões do banco. Para
montar um projeto novo:

1. No SQL Editor do projeto novo, rodar `supabase/banco-inteiro.sql`.
2. Em Authentication > Sign In / Providers, desligar "Allow new users to sign up" (vem ligado).
3. Criar a conta do dono com `npm run motoristas -- criar <e-mail> <Nome>`, com o `.env` apontando
   para o projeto novo, e torná-la admin no SQL Editor:
   `update public.perfis set papel = 'admin' where id = (select id from auth.users where email = '<e-mail>');`
4. Trocar os dois valores em `nuvem.ts` e publicar.

## O que entra no app

Pela tela de Endereços ou compartilhando com o app no Android:

- **Planilha da rota** (.xlsx, .xls, .ods, .csv, e o .txt da Shopee): `logica/planilha.ts`.
- **Prints da lista de paradas**: o leitor de texto (Tesseract) roda no celular, e depois de
  baixado funciona sem sinal. `servicos/arquivos.ts` prepara a imagem; `logica/texto.ts` e
  `logica/ocr.ts` leem os endereços e juntam as leituras.
- **Gravação da tela da lista do Meli** (vídeo): o app escolhe os quadros (`logica/video.ts`), lê
  cada um como print e junta os quadros, sem contar duas vezes a parada que aparece em vários.
- **PDF**: o texto da página, quando tem; página sem texto vai para o leitor como imagem.
- **Endereços colados ou digitados**, um por linha. Um link do mapa com coordenada põe a parada
  naquele ponto.

## Código

- `app/`: Vite + React + TypeScript. Lógica pura em `app/src/logica` (com testes), telas em
  `app/src/componentes` (uma por tela) e ações em `app/src/acoes` (conta, endereços, posições, rota,
  navegação). O mapa da Rota é a tela de base, com o cartão da próxima entrega embaixo; o resto
  abre pelo menu Mais, e cada tela ou cartão aberto é um passo do voltar do celular.
- `supabase/`: estrutura do banco, rodada em ordem no SQL Editor.
- `ferramentas/ruas.mjs`: copia as ruas de uma cidade do OpenStreetMap para a nossa base
  (`npm run ruas -- Aracaju "Nossa Senhora do Socorro"`). No Admin dá para nomear, com as
  entregas dos motoristas, os trechos que vieram sem nome.
- `ferramentas/prefeitura.mjs`: traz da prefeitura de Aracaju as ruas que o OpenStreetMap não tem
  (`npm run prefeitura` mostra o que faria; `-- gravar` grava). São 1.281 ruas a mais, com traçado,
  do cadastro oficial de logradouros. Só entram as que faltam: onde o OSM já tem, ele continua
  mandando. `ferramentas/bairros.mjs` pega os bairros desenhados, que é como a rua nova ganha bairro.
- `ferramentas/cnefe.mjs`: baixa o censo de endereços do IBGE de um município e gera o arquivo que
  o app carrega sozinho (`npm run cnefe -- "Nossa Senhora do Socorro"`). Um arquivo por cidade em
  `app/public/<cidade>-v1.bin`; hoje vão junto Aracaju, N. S. do Socorro, São Cristóvão e Barra dos
  Coqueiros. Cidade sem arquivo simplesmente não tem essa camada — o resto do app segue igual.
- `ferramentas/portas.mjs`: grava no banco a porta exata de um endereço, copiada do Google Maps,
  como correção do admin, que vale para todos os motoristas na hora. Serve para a rua que o censo
  não tem e o mapa não sabe numerar (`npm run portas` lê `portas.txt`, que fica fora do git, e
  mostra o que faria; `-- gravar` grava).
- `ferramentas/rechavear.mjs`: recalcula a chave das ruas já gravadas no banco depois que a regra
  da chave muda (`npm run rechavear` mostra o que faria; `-- gravar` grava). Mudar a regra e rodar
  isto são a mesma tarefa: veja o [CLAUDE.md](CLAUDE.md).
- `ferramentas/motoristas.mjs`: criar conta (também dá pela aba Admin, colando o e-mail), trocar senha, desativar
  (`npm run motoristas -- listar | criar email Nome | senha email | desativar email | ativar email`).
  Precisa do `.env` com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, fora do git.
  Conta só nasce ativa pela aba Admin; criada por outro caminho (o painel do Supabase, por exemplo)
  nasce desativada e se ativa no Admin. No projeto do Supabase, "Allow new users to sign up"
  (Authentication > Sign In / Providers) fica **desligado**, também em projeto novo, que vem com ele
  ligado: a chave do app é pública, e ligado qualquer um cria a própria conta.

## Backup

- `npm run backup` grava todas as tabelas em `OneDrive/backups/rota-entregas/<data>/`, ou na
  pasta de `BACKUP_DIR` (arquivos `.ndjson.gz` + `resumo.json` com contagem e soma de verificação). Guarda os
  últimos 14 dias e o dia 1 de cada mês. Roda sozinho às 21h pela tarefa do Windows
  "Backup rota-entregas" (`ferramentas/backup-diario.cmd`).
- `npm run restaurar` devolve o último backup num **projeto Supabase de teste**
  (`SUPABASE_URL_DESTINO` e `SUPABASE_SERVICE_ROLE_KEY_DESTINO` no `.env`), recriando as
  contas por e-mail, e compara linha a linha com o que foi salvo. `--so-conferir` só compara.
  Backup que nunca foi restaurado não conta como backup: a conferência compara o conteúdo
  linha a linha (não só a contagem) e diz qual linha falta. No fim ele **apaga os dados do
  projeto de teste** e as contas que criou, para não deixar cópia de endereço de cliente
  parada lá; `--manter` guarda, e `--limpar` apaga sem restaurar.

## Trava contra vazar dado

O repositório é público. `node ferramentas/guarda-segredos.mjs` recusa planilha fora de
`testes/planilhas`, `.txt` solto, `.env`, chave/token, e-mail de pessoa real, código de pacote
e telefone. Roda no `pre-commit` e na publicação. Em caso de engano: `git commit --no-verify`.

O hook só roda depois de `git config core.hooksPath ferramentas/hooks`, uma vez em cada clone (veja
Começar). Sem isso o commit passa sem conferência, e quem barra é a publicação, quando o push já
pôs o dado no GitHub público.

## Testes e publicação

- `npm run tipos`, `npm run test:unidade`, `npm test` (e2e sobre o build, com a nuvem simulada).
- `npm run test:leitor`: o leitor de texto de verdade (baixa o modelo do CDN), incluindo sem sinal.
- A tela é testada no tamanho de celular, com `testes/planilhas/rota-d.xlsx` (80 paradas), e o que
  se afirma é o que cansa quem usa: cartão que repete a mesma frase, `Remover` ao lado de botão de
  todo dia, endereço da próxima entrega fora da tela. Roda no `npm test`.
- `ROTA_REAL="…/rota.xlsx" npm run test:ui`: além disso, fotografa as telas com a rota do dia em
  `test-results/`, para olhar a tela em vez de opinar sobre ela. A planilha não entra no git.
  Fica fora do `npm test` para o CI não depender de rede de fora.
- `npm run test:nuvem`: contra o banco de verdade (cria e apaga usuários de teste).
- `npm run planilhas` refaz as planilhas inventadas de `testes/planilhas`.
- Cada push na `main` roda os testes no GitHub Actions e, se passarem, publica no GitHub Pages.
  Commit só de documentação leva `[skip ci]` na mensagem: sem isso, o push monta e publica de
  novo, e o número de versão novo mostra a barra de atualização a todos para o mesmo código.
- O build grava um número de versão no app e em `versao.json`. O app compara os dois quando abre e
  quando volta para a tela. Sem entrega pendente, ele recarrega sozinho. Com rota andando, mostra a
  barra "Versão nova do app" e espera o motorista tocar em Atualizar. O pé do menu Mais mostra a
  versão que está rodando, para conferir pelo print de um motorista.
