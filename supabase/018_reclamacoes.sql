-- "Cliente xarope": reclamou de pacote jogado ou de pacote deixado com vizinho. Os motoristas
-- pediram em 28/09 para o próximo que for lá já saber, e para poder marcar DEPOIS da entrega,
-- que é quando a reclamação costuma chegar. Fica por endereço (chave_lugar) e com motivo fechado:
-- texto livre sobre cliente é o tipo de coisa que não se guarda.
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

create table if not exists public.reclamacoes (
  id bigint generated always as identity primary key,
  chave_lugar text not null check (length(chave_lugar) between 3 and 300),
  motivo text not null check (motivo in ('jogado', 'vizinho')),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  criado_em timestamptz not null default now()
);
-- a fila do celular entrega pelo menos uma vez: a mesma marcação reenviada não vira duas
create unique index if not exists reclamacoes_uma on public.reclamacoes (chave_lugar, motivo, motorista_id);

alter table public.reclamacoes enable row level security;
revoke all on public.reclamacoes from anon, authenticated;
grant select, insert, delete on public.reclamacoes to authenticated;

drop policy if exists reclamacoes_ver on public.reclamacoes;
create policy reclamacoes_ver on public.reclamacoes for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
drop policy if exists reclamacoes_criar on public.reclamacoes;
create policy reclamacoes_criar on public.reclamacoes for insert to authenticated
  with check (motorista_id = auth.uid() and public.eh_ativo());
-- marcou errado: tira a sua. Quem administra tira qualquer uma.
drop policy if exists reclamacoes_tirar on public.reclamacoes;
create policy reclamacoes_tirar on public.reclamacoes for delete to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());

-- O que cada motorista recebe ao carregar a rota: o motivo e a última vez que alguém marcou,
-- de qualquer motorista ativo. Sem o nome de quem marcou.
create or replace function public.reclamacoes_dos_lugares(chaves text[])
returns table (chave_lugar text, motivo text, quando timestamptz, minha boolean)
language sql stable security definer set search_path = public as $$
  select r.chave_lugar, r.motivo, max(r.criado_em), bool_or(r.motorista_id = auth.uid())
  from public.reclamacoes r
  join public.perfis p on p.id = r.motorista_id and p.ativo
  where r.chave_lugar = any (chaves) and public.eh_ativo() and cardinality(chaves) <= 500
  group by r.chave_lugar, r.motivo;
$$;

revoke all on function public.reclamacoes_dos_lugares(text[]) from public, anon;
grant execute on function public.reclamacoes_dos_lugares(text[]) to authenticated;
