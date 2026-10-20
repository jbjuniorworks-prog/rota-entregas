-- As buscas do celular na base de ruas por dentro de funções do banco, com índice de trigramas (20/10).
--
-- RASCUNHO, não rodada na produção. Cada par de índice e função só fica se a medição de antes
-- (`supabase/medir_buscas_da_base.sql`, como o app) mostrar a tabela inteira lida e ganho de
-- verdade; o que não mostrar sai daqui antes de rodar.
--
-- Por que funções, e não só os índices: na base de ruas a regra de acesso (`ruas_ver`) roda antes
-- do filtro da busca, e o Postgres só deixa um índice passar na frente dela quando a comparação é
-- marcada como segura para isso (`leakproof`). O `=` é; o `ilike` e o `~*` não são. Com o índice e a
-- busca direto na tabela, como o app faz hoje, o motorista continua lendo os 23.982 trechos; só o
-- `postgres`, que não passa pela regra, usa o índice. Uma função `security definer` roda como o dono
-- da tabela, sem a regra, então ela confere o que a regra confere: `eh_ativo()`. Quem não está
-- ativo não recebe nada, como hoje. `security invoker` não serve: roda como quem chama, com a regra
-- na frente, e volta a ler a tabela inteira. Marcar o `ilike` como `leakproof` também não: é uma
-- promessa sobre o Postgres inteiro, e só o superusuário pode, o que o Supabase não dá.
--
-- Cuidados de função security definer: `search_path` vazio, todo nome com o esquema, e só
-- `authenticated` pode chamar (o Supabase dá execução ao `anon` por padrão; o revoke tira). Cada
-- função devolve só as colunas que o `servicos/base.ts` usa, com o mesmo filtro, o mesmo limite e
-- sem ordem, como a busca de hoje. O padrão com acento das duas por expressão regular continua
-- montado no app (`comAcento`), num lugar só. Os argumentos vão por posição ($1, $2) para a medição
-- poder preparar o mesmo texto e mostrar o plano de dentro da função.
--
-- Conferido num Postgres 17 local com o banco-inteiro.sql e 23.982 trechos inventados: em 63
-- comparações (admin, motorista, desativado e sem perfil; termos que acham e que não acham), cada
-- função devolveu as mesmas linhas que a busca de hoje, e o sem login é recusado nas duas. Cinco
-- sabotagens quebram a comparação: sem o `eh_ativo()`, com `=` na cidade, com `~` no lugar de `~*`,
-- sem o revoke do `anon` e com outro limite. Com `security invoker` o resultado sai igual, mas a
-- função lê a tabela inteira (2.000 acessos à memória, contra 14 a 625).
--
-- O app não muda com esta migração: continua buscando direto na tabela até a mudança no
-- `servicos/base.ts`, publicada à parte. O que muda já é a gravação na tabela `ruas`, que só as
-- ferramentas do dono e o Admin fazem: repor 20 mil trechos passou de 0,3 s para 0,8 s com um
-- índice e 1,4 s com três, num Postgres local.
--
-- Sem `concurrently`: o SQL Editor manda o arquivo inteiro de uma vez, e assim ele falha (as
-- instruções viram uma transação só). Não faz falta: o índice comum bloqueia só a gravação, por
-- menos de um segundo, e o motorista só lê `ruas`.
--
-- Para voltar: o bloco comentado no fim. Depois que o app chamar as funções, voltar pede publicar
-- antes o app sem elas.
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

create extension if not exists pg_trgm with schema extensions;

create index if not exists ruas_nome_chave_trgm on public.ruas using gin (nome_chave extensions.gin_trgm_ops);
create index if not exists ruas_bairro_trgm on public.ruas using gin (bairro extensions.gin_trgm_ops);
create index if not exists ruas_conjunto_trgm on public.ruas using gin (conjunto extensions.gin_trgm_ops);

-- A rua pela parte mais comprida do nome, quando o nome inteiro não achou (base.ts, `parecidas`).
create or replace function public.ruas_por_parte_do_nome(parte text, cidade_ text)
returns table (nome text, tipo text, bairro text, conjunto text, cidade text, lat double precision, lng double precision, linha jsonb)
language sql stable security definer set search_path = '' as $$
  select r.nome, r.tipo, r.bairro, r.conjunto, r.cidade, r.lat, r.lng, r.linha
  from public.ruas r
  where (select public.eh_ativo()) and r.nome_chave ilike '%' || $1 || '%' and r.cidade ilike $2
  limit 80
$$;

-- Se o lugar dito no endereço é um bairro (base.ts, `ehBairro`). Hoje o app só olha se veio alguma.
create or replace function public.bairro_na_base(padrao text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (select public.eh_ativo()) and exists (select 1 from public.ruas r where r.bairro ~* $1)
$$;

-- Os trechos do conjunto ou condomínio dito no endereço (base.ts, `lugarNaBase`).
create or replace function public.conjuntos_na_base(padrao text, cidade_ text)
returns table (conjunto text, lat double precision, lng double precision)
language sql stable security definer set search_path = '' as $$
  select r.conjunto, r.lat, r.lng
  from public.ruas r
  where (select public.eh_ativo()) and r.conjunto ~* $1 and r.cidade ilike $2
  limit 200
$$;

revoke all on function public.ruas_por_parte_do_nome(text, text), public.bairro_na_base(text),
  public.conjuntos_na_base(text, text) from public, anon;
grant execute on function public.ruas_por_parte_do_nome(text, text), public.bairro_na_base(text),
  public.conjuntos_na_base(text, text) to authenticated;

-- ===== Para voltar como era (só se precisar): tire os dois traços do começo de cada linha e rode.
-- drop function if exists public.ruas_por_parte_do_nome(text, text);
-- drop function if exists public.bairro_na_base(text);
-- drop function if exists public.conjuntos_na_base(text, text);
-- drop index if exists public.ruas_nome_chave_trgm;
-- drop index if exists public.ruas_bairro_trgm;
-- drop index if exists public.ruas_conjunto_trgm;
-- A extensão sozinha não muda nada e pode ficar. Para tirar também: drop extension if exists pg_trgm;
