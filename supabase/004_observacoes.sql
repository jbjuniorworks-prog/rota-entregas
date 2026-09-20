-- Guarda a posição do celular na hora em que o motorista marca a entrega como feita,
-- e passa a usar essas passagens, junto com as correções de pino, para confirmar o lugar.
-- Rodar uma vez em SQL Editor > New query > Run.

create table public.observacoes (
  id bigint generated always as identity primary key,
  chave_lugar text not null check (length(chave_lugar) between 3 and 300),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  precisao_m real not null check (precisao_m >= 0 and precisao_m <= 100),
  rua text check (rua is null or length(rua) <= 200),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  dia date not null default (now() at time zone 'America/Maceio')::date,
  criado_em timestamptz not null default now()
);
create index observacoes_chave on public.observacoes (chave_lugar, criado_em desc);
create index observacoes_dia on public.observacoes (dia desc);
create unique index observacoes_por_dia on public.observacoes (chave_lugar, motorista_id, dia);

alter table public.observacoes enable row level security;
revoke all on public.observacoes from anon, authenticated;
grant select, insert on public.observacoes to authenticated;

create policy observacoes_ver on public.observacoes for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
create policy observacoes_criar on public.observacoes for insert to authenticated
  with check (motorista_id = auth.uid() and public.eh_ativo());

create or replace function public.perto(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision, metros int default 30)
returns boolean language sql immutable parallel safe as $$
  select 111320 * sqrt(power(lat1 - lat2, 2) + power((lng1 - lng2) * cos(radians(lat1)), 2)) <= metros;
$$;

drop function if exists public.posicoes(text[]);

create function public.posicoes(chaves text[])
returns table (chave_lugar text, lat double precision, lng double precision, situacao text,
               motoristas int, entregas int, fonte text, minha boolean)
language sql stable security definer set search_path = public as $$
  with correcao as (
    select distinct on (c.chave_lugar, c.motorista_id)
      c.chave_lugar, c.motorista_id, c.lat, c.lng, c.criado_em, p.papel = 'admin' as admin
    from public.correcoes c
    join public.perfis p on p.id = c.motorista_id and p.ativo
    where c.chave_lugar = any (chaves)
    order by c.chave_lugar, c.motorista_id, c.criado_em desc
  ),
  passagem as (
    select distinct on (o.chave_lugar, o.motorista_id, o.dia)
      o.chave_lugar, o.motorista_id, o.lat, o.lng, o.criado_em
    from public.observacoes o
    join public.perfis p on p.id = o.motorista_id and p.ativo
    where o.chave_lugar = any (chaves)
    order by o.chave_lugar, o.motorista_id, o.dia, o.criado_em desc
  ),
  marca as (
    select chave_lugar, motorista_id, lat, lng, criado_em, admin, true as de_correcao from correcao
    union all
    select chave_lugar, motorista_id, lat, lng, criado_em, false, false from passagem
  ),
  contada as (
    select a.*,
      (select count(*) from marca b where b.chave_lugar = a.chave_lugar and b.de_correcao and public.perto(a.lat, a.lng, b.lat, b.lng))::int as nc,
      (select count(*) from marca b where b.chave_lugar = a.chave_lugar and not b.de_correcao and public.perto(a.lat, a.lng, b.lat, b.lng))::int as np
    from marca a
  ),
  melhor as (
    select distinct on (contada.chave_lugar) contada.*
    from contada
    order by contada.chave_lugar, contada.admin desc, (contada.nc * 2 + contada.np) desc, contada.de_correcao desc, contada.criado_em desc
  ),
  julgada as (
    select m.*, case
      when m.admin or m.nc >= 2 or (m.nc >= 1 and m.np >= 1) or m.np >= 2 then 'confirmado'
      when m.de_correcao then 'sugestao'
      else 'pouco' end as situacao
    from melhor m
  )
  select j.chave_lugar, j.lat, j.lng, j.situacao, j.nc, j.np,
         case when j.admin then 'admin' when j.nc > 0 then 'correcao' else 'entrega' end,
         j.motorista_id = auth.uid()
  from julgada j
  where j.situacao <> 'pouco' and public.eh_ativo() and cardinality(chaves) <= 500;
$$;

revoke all on function public.posicoes(text[]), public.perto(double precision, double precision, double precision, double precision, int) from public, anon;
grant execute on function public.posicoes(text[]), public.perto(double precision, double precision, double precision, double precision, int) to authenticated;
