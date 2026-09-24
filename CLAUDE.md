# Como trabalhar neste repositório

App de rota para **dois entregadores de verdade**, em Aracaju. Eles usam na rua, de capacete,
com uma mão ocupada, muitas vezes sem sinal. Isso decide quase tudo aqui: uma tela que mente é
pior que uma tela feia, e uma ação que precisa de rede para se desfazer é uma armadilha.

O repositório é **público**.

## O jeito de trabalhar

- **Medir antes de construir.** Ideia boa que os dados não sustentam não entra. Já foram medidas
  e **recusadas**: os CEPs do cepaberto, o cartaz de 2005, os polígonos de bairro como arquivo do
  app, e um conserto no `marcarIsoladas` para rota mista cidade+zona rural (2 paradas marcadas em
  942 reais, as duas de fato sozinhas). Recusar depois de medir é resultado, não desperdício.
- **Teste novo tem de falhar sem o conserto.** Sabote o código, rode, confirme que quebra,
  desfaça. Teste que passa antes e depois não guarda nada. Foi assim que um teste de "📍 Estou
  aqui" ficou verde por meses **enquanto o app apagava a rota**: ele afirmava a mensagem, não o
  resultado. Afirme o resultado.
- **Comentário explica o porquê**, em português, e só onde a razão não está no código. Mensagem
  de commit em inglês, contando o defeito e a decisão — elas são o registro de por que as coisas
  são como são.
- **Não subir sem pedir.** `git push` publica no GitHub Pages e troca o app debaixo de quem pode
  estar no meio de uma rota. Commit local, e pergunte.
- **Dado real não entra.** Planilha, vídeo, PDF e print do dia ficam fora do git — trabalhe no
  diretório de rascunho da sessão. `ferramentas/guarda-segredos.mjs` roda no `pre-commit` e recusa
  planilha fora de `testes/planilhas`, `.txt` solto, `.env`, chave, e-mail de pessoa real, código
  de pacote e telefone. Nunca imprima o conteúdo do `.env`.
- **Migração quem roda é ele**, no SQL Editor do Supabase. Escreva `supabase/0NN_nome.sql`,
  acrescente ao fim de `000_rodar_tudo.sql`, e peça para rodar.
- Antes de encerrar, atualize o [ABERTO.md](ABERTO.md).

## Armadilhas que já custaram caro

- **A chave da rua é calculada em dois lugares**: `app/src/logica/texto.ts` (celular) e
  `ferramentas/chave-rua.mjs` (ferramentas que gravam no banco). Mudar uma sem a outra faz a rua
  sumir da busca **sem erro nenhum**. Há teste comparando as duas nome por nome.
- **Mudar a regra da chave e rodar `npm run rechavear -- gravar` são a mesma tarefa.** Enquanto
  ele não roda, o celular procura por uma chave que o banco não responde.
- **A fila offline entrega pelo menos uma vez.** Nunca mande incremento — mande o acumulado e
  deixe o servidor ficar com o maior (`contar_uso` faz isso). Somar no servidor conta em dobro
  tudo que foi reenviado depois de falha de rede.
- **`npm run prefeitura -- gravar` apaga e repõe.** O que impede ele de apagar a própria
  importação é `daNossaBase` excluir `fonte=prefeitura`. Não mexa nisso sem entender.
- **PostgREST devolve 1000 linhas e cala.** Sem paginar com `Range`, toda medição sai errada —
  já fez 61 ruas faltando parecerem 18.
- **Rota só morre quando deixa de descrever o dia.** `invalidarRota()` é para parada removida,
  área apagada, reset. Mudança de posição usa `desatualizarRota()`: a ordem continua valendo, só
  as estimativas envelhecem. Refazer precisa de rede, e sem rede a rota volta pior.
- **`flex-direction: column-reverse` quebra a rolagem.** Para inverter ordem visual use `order`.
- **`npm run test:nuvem` escreve no banco de produção** e cria/apaga usuários. A limpeza tem de
  rodar sempre, mesmo com o teste falhando.
- **A tela se testa em tamanho de celular** (412×915), com `testes/planilhas/rota-d.xlsx`
  (80 paradas). Bug de lista só aparece no tamanho de uma lista de verdade.

## Onde as coisas ficam

- `app/src/logica` — puro, com teste (`vitest`). É onde a regra deve morar.
- `app/src/acoes` — mexe no estado e na nuvem. Difícil de testar em unidade: use e2e.
- `app/src/componentes` — uma tela por aba.
- `app/src/servicos` — nuvem, geocodificação, censo do IBGE, ruas.
- `supabase/` — migrações numeradas; cada uma explica por que existe.
- `ferramentas/` — scripts de node que o dono roda no terminal.

## Comandos

```
npm run tipos          # tsc
npm run test:unidade   # vitest
npm test               # e2e sobre o build, com nuvem simulada
npm run rechavear      # recalcula as chaves gravadas (-- gravar para escrever)
```

Detalhes de produto, backup e publicação estão no [README.md](README.md).
