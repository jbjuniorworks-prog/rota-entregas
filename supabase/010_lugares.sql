-- Aprende o LUGAR com nome (condomínio, residencial, edifício) a partir do que o motorista faz:
-- quando ele arruma um pino ou entrega numa porta cujo complemento tem nome de condomínio,
-- guardamos o nome junto do ponto. Assim um endereço NOVO do mesmo condomínio já nasce no lugar certo,
-- mesmo com outro número ou outra rua.
-- Rodar uma vez em SQL Editor > New query > Run.

create table if not exists public.lugares (
  id bigint generated always as identity primary key,
  nome_chave text not null check (length(nome_chave) between 4 and 120),
  nome text not null check (length(nome) between 2 and 160),
  cidade text not null default '' check (length(cidade) <= 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  endereco text check (endereco is null or length(endereco) <= 300),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  dia date not null default (now() at time zone 'America/Maceio')::date,
  criado_em timestamptz not null default now()
);
create index if not exists lugares_nome on public.lugares (cidade, nome_chave);
create unique index if not exists lugares_por_dia on public.lugares (nome_chave, cidade, motorista_id, dia);

alter table public.lugares enable row level security;
revoke all on public.lugares from anon, authenticated;
grant select, insert on public.lugares to authenticated;

drop policy if exists lugares_ver on public.lugares;
create policy lugares_ver on public.lugares for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
drop policy if exists lugares_criar on public.lugares;
create policy lugares_criar on public.lugares for insert to authenticated
  with check (motorista_id = auth.uid() and public.eh_ativo());

drop function if exists public.lugares_conhecidos(text[], text);

-- Devolve os lugares cujo nome bate com alguma das palavras pedidas, com a mesma régua das posições:
-- vale para todos quando um admin marcou, ou quando duas vistas de motoristas/dias diferentes concordam.
create function public.lugares_conhecidos(palavras text[], cidade_ text)
returns table (nome_chave text, nome text, lat double precision, lng double precision, situacao text, vistas int)
language sql stable security definer set search_path = public as $$
  with achados as (
    select l.*, p.papel = 'admin' as admin
    from public.lugares l
    join public.perfis p on p.id = l.motorista_id and p.ativo
    where l.cidade = cidade_
      and exists (select 1 from unnest(palavras) w where length(w) >= 5 and l.nome_chave like '%' || w || '%')
  ),
  contada as (
    select a.*,
      (select count(distinct b.motorista_id || '|' || b.dia) from achados b
        where b.nome_chave = a.nome_chave and public.perto(a.lat, a.lng, b.lat, b.lng, 120))::int as vistas,
      (select bool_or(b.admin) from achados b
        where b.nome_chave = a.nome_chave and public.perto(a.lat, a.lng, b.lat, b.lng, 120)) as tem_admin
    from achados a
  ),
  melhor as (
    select distinct on (contada.nome_chave) contada.*
    from contada
    order by contada.nome_chave, contada.tem_admin desc, contada.vistas desc, contada.criado_em desc
  )
  select m.nome_chave, m.nome, m.lat, m.lng,
         case when m.tem_admin or m.vistas >= 2 then 'confirmado' else 'sugestao' end,
         m.vistas
  from melhor m
  where public.eh_ativo() and cardinality(palavras) <= 50;
$$;

revoke all on function public.lugares_conhecidos(text[], text) from public, anon;
grant execute on function public.lugares_conhecidos(text[], text) to authenticated;
