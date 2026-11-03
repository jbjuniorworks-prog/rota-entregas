---
name: migracao
description: Prepara uma migração nova do Supabase (o arquivo 0NN, os dois arquivos que juntam tudo e o SQL pronto para o dono colar no celular), com a revisão de segurança das funções. Não aplica nada no banco.
disable-model-invocation: true
---

# Preparar uma migração

Quem roda migração é o dono, no SQL Editor do Supabase. Este roteiro só prepara e revisa.
Aplicar no banco, chamar a função nova na produção ou rodar `npm run test:nuvem` são autorizações
separadas, pedidas depois.

## 1. O arquivo

- Número: o próximo depois do maior `supabase/0NN_*.sql`. Nome curto, em português.
- Cabeçalho em comentário, como os outros: o pedido e a data, o porquê, o que muda, o que não
  muda, e "Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo."
- Que possa rodar de novo: `create or replace function`, `create ... if not exists`,
  `drop policy if exists` antes de `create policy`, `drop function if exists` quando a assinatura
  muda.
- No fim, o bloco "Para voltar como era", comentado, com o que o app faz sem a migração.
- Nada de dado real: o repositório é público. Nenhum e-mail, nome de cliente, endereço, telefone
  ou chave, nem nos exemplos.

## 2. Revisão de segurança (obrigatória, item por item)

Função `security definer` roda com os privilégios do dono do banco: as regras de acesso (RLS) não
valem dentro dela. Restringir quem chama não diz o que cada um pode ler ou mudar. Para cada função:

- [ ] `set search_path = public` (mais `extensions` só se usar algo de lá). Sem isso, um objeto
      com o mesmo nome em outro esquema pode ser chamado no lugar.
- [ ] A primeira coisa é a verificação de quem chama: `public.eh_admin()`, `public.eh_ativo()` ou
      `auth.uid()`. Com `raise exception`, antes de ler ou escrever qualquer coisa.
- [ ] Linha por linha: tudo o que ela lê ou devolve, o chamador poderia ver pelas regras de
      acesso? Função de motorista filtra por `auth.uid()`; não devolve dado de outro motorista.
- [ ] Entrada validada: tamanho de texto, `cardinality` de lista, formato (regex), papel numa
      lista fechada. Nada vira SQL dinâmico.
- [ ] `revoke all on function ... from public, anon;` e `grant execute ... to authenticated;` (ou
      menos). Nunca `anon` sem motivo escrito no cabeçalho.
- [ ] Ação que tranca alguém fora (papel, ativo, senha) tem as travas do terminal: não rebaixar o
      último admin ativo, não mudar a própria conta por ali.
- [ ] Tabela nova: `enable row level security`, `revoke all ... from anon, authenticated`, e então
      só o `grant` e as `policy` necessários.
- [ ] Fila offline: o que o celular reenvia depois de falha de rede manda o acumulado ou um id
      fixo, nunca incremento (CLAUDE.md).

Escreva no resumo para o dono o resultado de cada item.

## 3. Os dois arquivos que juntam tudo

Acrescente no fim de `supabase/000_rodar_tudo.sql` **e** de `supabase/banco-inteiro.sql`:

```
-- ===== 0NN_nome.sql =====
<conteúdo do arquivo>
```

Confira que os dois ficaram iguais do 026 em diante:
`diff <(sed -n '/===== 026/,$p' supabase/000_rodar_tudo.sql) <(sed -n '/===== 026/,$p' supabase/banco-inteiro.sql)`.
Um deles ficou parado no 009 de 20/09 a 28/09 por só um ter sido atualizado.

## 4. O app

- Se o app chama a função nova: sem ela no banco (`PGRST202` ou o nome da função no erro), a tela
  diz "falta rodar o supabase/0NN_nome.sql", em vez de um erro cru.
- O app que depende da migração só é publicado depois de o dono rodá-la.
- Teste com a nuvem simulada (`testes/e2e/apoio.ts`) e, se a função escreve, um caso no
  `testes/e2e/nuvem.spec.ts`, que só roda com autorização.

## 5. Entregar ao dono

- O SQL pronto para copiar, num bloco só, sem o cabeçalho longo (ele lê no celular).
- O resultado esperado: "Success. No rows returned".
- O que a migração muda e o que não muda, em duas linhas.

## 6. Depois que o dono disser que rodou

Só verificações que não mudam dados: chamar a função sem login e confirmar "permission denied";
com a chave de serviço, só se a função não aceita `service_role` (a 027 aceita, e lá a chamada
executa), e com argumentos que não existem (um uuid de zeros), confirmando "apenas quem
administra". Teste que cria ou apaga algo na produção (`npm run test:nuvem`) pede autorização
própria. Registre no `ABERTO.md`.
