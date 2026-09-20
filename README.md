# Rota de Entregas

App (PWA) que os entregadores usam para ordenar as paradas do dia.

Lê a planilha da rota (Shopee, inclusive a que vem como .txt), prints ou PDF
da lista de paradas, localiza cada endereço, agrupa as entregas próximas e
calcula a sequência mais curta pelas ruas. Abre cada parada no Waze ou no
Google Maps, em trechos que respeitam o limite de pontos do Maps.
Instalável no Android: ao compartilhar prints com o app, a rota é montada
automaticamente.

Só entra quem tem conta (criada pelo administrador). As rotas, as entregas e
as correções de pino vão para o Supabase; a correção de um motorista vira
sugestão para os outros, e com 2 motoristas no mesmo ponto (ou o admin) vale
para todos. Ao marcar uma entrega na porta, o app guarda a posição do celular:
duas passagens no mesmo ponto também confirmam o lugar, e elas dão nome aos
trechos de rua que o mapa livre não tem. Consultas de endereço vão ao OpenStreetMap/ViaCEP e de rota ao OSRM.

## Código

- `app/`: Vite + React + TypeScript. Lógica pura em `app/src/logica` (com testes).
- `supabase/`: estrutura do banco, rodada em ordem no SQL Editor.
- `ferramentas/ruas.mjs`: copia as ruas de uma cidade do OpenStreetMap para a nossa base
  (`npm run ruas -- Aracaju "Nossa Senhora do Socorro"`). Na aba Admin dá para nomear, com as
  entregas dos motoristas, os trechos que vieram sem nome.
- `ferramentas/motoristas.mjs`: criar conta, trocar senha, desativar
  (`npm run motoristas -- listar | criar email Nome | senha email | desativar email | ativar email`).
  Precisa do `.env` com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, fora do git.

## Backup

- `npm run backup` grava todas as tabelas em `OneDrive/backups/rota-entregas/<data>/`
  (arquivos `.ndjson.gz` + `resumo.json` com contagem e soma de verificação). Guarda os
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
e telefone. Roda no `pre-commit` (`git config core.hooksPath ferramentas/hooks`, já configurado
neste clone) e na publicação. Em caso de engano: `git commit --no-verify`.

## Testes e publicação

- `npm run tipos`, `npm run test:unidade`, `npm test` (e2e sobre o build, com a nuvem simulada).
- `npm run test:nuvem`: contra o banco de verdade (cria e apaga usuários de teste).
- Cada push na `main` roda os testes no GitHub Actions e, se passarem, publica no GitHub Pages.
