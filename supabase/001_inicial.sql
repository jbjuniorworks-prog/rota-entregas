-- Rota de Entregas: estrutura inicial.
-- Rodar uma vez em SQL Editor > New query > Run.

create extension if not exists pgcrypto;

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  papel text not null default 'motorista' check (papel in ('motorista', 'admin')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

insert into public.perfis (id, nome)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

create or replace function public.eh_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel = 'admin');
$$;

create table public.rotas (
  id uuid primary key default gen_random_uuid(),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  at_id text,
  dia date not null default (now() at time zone 'America/Maceio')::date,
  arquivo text,
  criado_em timestamptz not null default now()
);
create unique index rotas_motorista_at on public.rotas (motorista_id, at_id) where at_id is not null;
create index rotas_dia on public.rotas (dia desc);

create table public.pacotes (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references public.rotas (id) on delete cascade,
  spx_tn text,
  sequencia int,
  parada int,
  endereco text not null,
  bairro text,
  cidade text,
  cep text,
  lat double precision,
  lng double precision,
  chave_lugar text,
  linha jsonb,
  entregue_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (rota_id, spx_tn)
);
create index pacotes_rota on public.pacotes (rota_id);
create index pacotes_chave on public.pacotes (chave_lugar);

create table public.correcoes (
  id bigint generated always as identity primary key,
  chave_lugar text not null check (length(chave_lugar) between 3 and 300),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  criado_em timestamptz not null default now()
);
create index correcoes_chave on public.correcoes (chave_lugar, motorista_id, criado_em desc);

alter table public.perfis enable row level security;
alter table public.rotas enable row level security;
alter table public.pacotes enable row level security;
alter table public.correcoes enable row level security;

revoke all on public.perfis, public.rotas, public.pacotes, public.correcoes from anon, authenticated;
grant select on public.perfis to authenticated;
grant update (nome, papel, ativo) on public.perfis to authenticated;
grant select, insert on public.rotas to authenticated;
grant delete on public.rotas to authenticated;
grant select, insert on public.pacotes to authenticated;
grant update (entregue_em) on public.pacotes to authenticated;
grant select, insert on public.correcoes to authenticated;

create policy perfis_ver on public.perfis for select to authenticated
  using (id = auth.uid() or public.eh_admin());
create policy perfis_admin_edita on public.perfis for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy rotas_ver on public.rotas for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
create policy rotas_criar on public.rotas for insert to authenticated
  with check (motorista_id = auth.uid() and public.eh_ativo());
create policy rotas_admin_apaga on public.rotas for delete to authenticated
  using (public.eh_admin());

create policy pacotes_ver on public.pacotes for select to authenticated
  using (public.eh_admin() or (public.eh_ativo() and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid())));
create policy pacotes_criar on public.pacotes for insert to authenticated
  with check (public.eh_ativo() and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid()));
create policy pacotes_marcar on public.pacotes for update to authenticated
  using (public.eh_ativo() and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid()))
  with check (public.eh_ativo() and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid()));

create policy correcoes_ver on public.correcoes for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
create policy correcoes_criar on public.correcoes for insert to authenticated
  with check (motorista_id = auth.uid() and public.eh_ativo());

create or replace function public.posicoes(chaves text[])
returns table (chave_lugar text, lat double precision, lng double precision, situacao text, motoristas int, minha boolean)
language sql stable security definer set search_path = public as $$
  with ult as (
    select distinct on (c.chave_lugar, c.motorista_id)
      c.chave_lugar, c.motorista_id, c.lat, c.lng, c.criado_em, p.papel = 'admin' as admin
    from public.correcoes c
    join public.perfis p on p.id = c.motorista_id and p.ativo
    where c.chave_lugar = any (chaves)
    order by c.chave_lugar, c.motorista_id, c.criado_em desc
  ),
  apoio as (
    select a.*, (
      select count(*) from ult b
      where b.chave_lugar = a.chave_lugar
        and 111320 * sqrt(power(a.lat - b.lat, 2) + power((a.lng - b.lng) * cos(radians(a.lat)), 2)) <= 30
    ) as n
    from ult a
  ),
  melhor as (
    select distinct on (apoio.chave_lugar) apoio.* from apoio
    order by apoio.chave_lugar, apoio.admin desc, apoio.n desc, apoio.criado_em desc
  )
  select m.chave_lugar, m.lat, m.lng,
         case when m.admin or m.n >= 2 then 'confirmado' else 'sugestao' end,
         m.n::int, m.motorista_id = auth.uid()
  from melhor m
  where public.eh_ativo() and cardinality(chaves) <= 500;
$$;

revoke all on function public.posicoes(text[]) from public, anon;
grant execute on function public.posicoes(text[]) to authenticated;
revoke all on function public.eh_ativo(), public.eh_admin(), public.criar_perfil() from public, anon;
grant execute on function public.eh_ativo(), public.eh_admin() to authenticated;
