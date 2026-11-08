-- Pino comercial (pedido do Luan, 07/11): lugar com horário de funcionamento, que eles adiantam na
-- rota para não chegar com a porta fechada. A planilha da Shopee não diz (91 planilhas, de 18/09 a
-- 07/11, todas com as mesmas 10 colunas), então quem sabe é quem já foi lá. O dono pediu que a
-- marca valha para todos os motoristas: "se não nem faz sentido".
--
-- Igual ao "cliente xarope" (018): por endereço (chave_lugar, com a sala ou a loja quando houver),
-- uma marca por motorista, e cada um tira só a sua; o admin tira qualquer uma. Retirar a de um não
-- leva a dos outros. Quem marcou e quando o banco põe sozinho: o celular só manda a chave.
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo. Rodar de novo também
-- religa a função, se ela tiver sido desligada pelo bloco do fim: a tabela volta com as marcas.

-- Antes de qualquer alteração. As duas tabelas ao mesmo tempo não deveriam existir (alguém criou uma
-- nova com a outra desligada): parar com erro, sem juntar, apagar ou escolher uma delas. Rode no SQL
-- Editor, que para no primeiro erro; no psql, só com ON_ERROR_STOP.
-- Desligada (bloco do fim): a tabela, com as marcas, volta para onde o app enxerga.
do $$
begin
  if to_regclass('public.comerciais') is not null and to_regclass('desligado.comerciais') is not null then
    raise exception 'public.comerciais e desligado.comerciais existem ao mesmo tempo. Nada foi alterado: confira as duas tabelas e decida qual fica antes de rodar esta migração de novo.';
  end if;
  if to_regclass('desligado.comerciais') is not null and to_regclass('public.comerciais') is null then
    alter table desligado.comerciais set schema public;
  end if;
end $$;
drop function if exists desligado.comerciais_dos_lugares(text[]);

create table if not exists public.comerciais (
  id bigint generated always as identity primary key,
  chave_lugar text not null check (length(chave_lugar) between 3 and 300),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  criado_em timestamptz not null default now()
);
-- a fila do celular entrega pelo menos uma vez: a mesma marca reenviada não vira duas
create unique index if not exists comerciais_um on public.comerciais (chave_lugar, motorista_id);

alter table public.comerciais enable row level security;
revoke all on public.comerciais from anon, authenticated;
grant select, delete on public.comerciais to authenticated;
-- só a chave: o dono da marca e a hora não vêm do celular
grant insert (chave_lugar) on public.comerciais to authenticated;

drop policy if exists comerciais_ver on public.comerciais;
create policy comerciais_ver on public.comerciais for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
drop policy if exists comerciais_marcar on public.comerciais;
create policy comerciais_marcar on public.comerciais for insert to authenticated
  with check (motorista_id = auth.uid() and public.eh_ativo());
drop policy if exists comerciais_tirar on public.comerciais;
create policy comerciais_tirar on public.comerciais for delete to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());

-- O que cada motorista recebe ao carregar a rota: se ele marcou e se outro motorista ativo marcou.
-- Sem o nome de quem marcou.
create or replace function public.comerciais_dos_lugares(chaves text[])
returns table (chave_lugar text, minha boolean, outros boolean)
language sql stable security definer set search_path = public as $$
  select c.chave_lugar, bool_or(c.motorista_id = auth.uid()), bool_or(c.motorista_id <> auth.uid())
  from public.comerciais c
  join public.perfis p on p.id = c.motorista_id and p.ativo
  where c.chave_lugar = any (chaves) and public.eh_ativo() and cardinality(chaves) <= 500
  group by c.chave_lugar;
$$;

revoke all on function public.comerciais_dos_lugares(text[]) from public, anon;
grant execute on function public.comerciais_dos_lugares(text[]) to authenticated;

notify pgrst, 'reload schema';

-- ===== Para DESLIGAR o pino comercial, sem apagar nenhuma marca: tire os dois traços e rode.
-- A tabela e a função vão para o esquema "desligado", que a API do app não mostra. O app passa a
-- receber "tabela ausente": guarda no celular o que o motorista marcar ou tirar e tenta de novo
-- depois, sem segurar entregas nem passagens. As marcas continuam no banco, com quem marcou e quando.
-- Para RELIGAR, rode este arquivo inteiro de novo: ele traz a tabela de volta com as marcas, e os
-- celulares mandam o que guardaram.
-- Que a API não mostra o esquema "desligado" foi conferido só no Supabase local (07/11: a API expõe
-- public e graphql_public). No projeto de verdade, confira antes em Settings > API > Exposed schemas.
-- create schema if not exists desligado;
-- revoke all on schema desligado from public, anon, authenticated;
-- alter table public.comerciais set schema desligado;
-- alter function public.comerciais_dos_lugares(text[]) set schema desligado;
-- notify pgrst, 'reload schema';

-- ===== REMOÇÃO DEFINITIVA: APAGA TODAS AS MARCAS DE COMERCIAL, DE TODOS OS MOTORISTAS, SEM VOLTA.
-- Não é o mesmo que desligar. Só depois de um backup conferido e por decisão do dono. Os celulares
-- que ainda tiverem marcas guardadas continuam esperando a tabela que não existe mais.
-- drop function if exists public.comerciais_dos_lugares(text[]);
-- drop function if exists desligado.comerciais_dos_lugares(text[]);
-- drop table if exists public.comerciais;
-- drop table if exists desligado.comerciais;
