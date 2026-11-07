---
name: publicar
description: Confere e, só depois do sim do dono para o commit e o destino exatos, publica o app no GitHub Pages. Chamar esta skill começa a conferência; não autoriza envio nenhum.
disable-model-invocation: true
---

# Publicar o app

`git push` para `main` dispara o `.github/workflows/publicar.yml`: testa e troca o app no GitHub
Pages debaixo de quem estiver no meio de uma rota. Por isso este roteiro confere, mostra e pede o
sim; nunca envia por conta própria.

**Chamar `/publicar` não é autorização.** A autorização é o "sim" do dono, nesta conversa, para o
commit e o destino mostrados no passo 4. Sem ela, pare no passo 4.

## 1. Qual commit

- O dono tem de ter nomeado o commit (ou "o que está pronto" logo depois de você dizer qual é).
  Sem isso, pergunte; não escolha.
- `git status --short`: com mudança não commitada, pare e diga quais arquivos. Não faça stash,
  commit nem descarte para "limpar".
- `git fetch origin` e confira que o commit descende de `origin/main`
  (`git merge-base --is-ancestor origin/main <commit>`). Se não descende, pare: seria preciso
  forçar, e forçar nunca entra aqui.

## 2. O que sobe

`git push origin <commit>:main` leva a `main` remota até o `<commit>`. Isso inclui **todos os
commits que ainda faltam no remoto entre a `main` de lá e ele**, não só o do topo. Aprovar o hash
final é aprovar esse conjunto inteiro, por isso o dono tem de ver o conjunto.

- O estado da `main` remota: `git log -1 --oneline origin/main` (depois do `git fetch`).
- Todos os commits que entram: `git log --oneline origin/main..<commit>`. Liste todos para o dono.
- O diff acumulado do que entra: `git diff --stat origin/main <commit>`, e o diff completo dos
  arquivos de `app/`, `supabase/` e `.github/` (`git diff origin/main <commit> -- <pastas>`).
- Commits locais depois do autorizado não vão. Envie com `git push origin <commit>:main`, nunca
  `git push` puro, que levaria o que estiver em cima.
- O commit do topo com `[skip ci]` não publica (o GitHub não roda o workflow). Se a intenção é
  publicar, avise e pare; se é só documentação, diga que não troca o app.
- `git diff --stat origin/main <commit>`: há mudança em `app/` ou `testes/`? Só `ABERTO.md` e
  `supabase/` não trocam o app, mas o push ainda roda o workflow se o topo não tiver `[skip ci]`.
- Mudança que depende de migração ainda não rodada pelo dono: pare. O app novo chamaria função
  que não existe.

## 3. A rua

- A hora de Aracaju pelo node, na hora:
  `node -e "console.log(new Date().toLocaleString('pt-BR',{timeZone:'America/Maceio'}))"`.
- Quem está em rota: `npm run na-rua` (as rotas de hoje dos motoristas, não as de quem administra,
  com entregues, total e a última entrega). Só lê, pagina, e imprime o primeiro nome e números.
- A preferência é ninguém na rua. A versão nova não interrompe a rota (avisa e espera
  "Atualizar"), mas a decisão de subir com alguém na rua é do dono.

## 4. Pedir o sim

Mostre, nesta ordem, e pergunte:

- branch atual e onde está a `main` remota agora;
- todos os commits que entram (passo 2), não só o do topo;
- o diff acumulado deles;
- o hash final e o destino: `origin`, `main`, e se dispara a publicação no GitHub Pages;
- se troca o app ou é só documentação;
- quem está na rua, com a hora.

"Posso enviar estes commits para `origin/main`, deixando a branch em `<hash>`?" e espere. Se
depois do sim o commit mudar (amend, commit novo, rebase), o sim não vale mais: volte ao passo 1.

## 5. Enviar e conferir

Só com o sim do passo 4:

1. `git push origin <commit>:main`. Nada de `--force`, de outra branch ou de pull request.
2. Ache o run do commit (`gh run list`), espere (`gh run watch <id> --exit-status`) e diga o
   resultado de "testar" e "publicar".
3. Leia a versão no ar: `https://jbjuniorworks-prog.github.io/rota-entregas/versao.json`.
4. Rode contra o site publicado os testes do que mudou, com a nuvem simulada:
   `APP_URL=https://jbjuniorworks-prog.github.io/rota-entregas/ npx playwright test <arquivos> -g "<testes>"`.
   Nunca `test:nuvem` aqui: ele escreve na produção e tem autorização própria.

Se o envio for barrado pela trava de permissões, não contorne: diga o que ia fazer e espere.

## 6. Registrar

No `ABERTO.md`, na seção do que foi publicado: commit, versão, hora do envio, quem estava na rua,
o resultado do GitHub e dos testes contra o site. Commit local com `[skip ci]`, mensagem em
inglês, e pergunte se pode enviar. Esse envio é outra autorização.
