-- Banco inteiro do app, na ordem. Serve para montar um projeto novo (por exemplo o de teste de restauração).
-- Cole tudo no SQL Editor do projeto e rode uma vez.

-- ===== 001_inicial.sql =====
-- Rota de Entregas: estrutura inicial.
-- Rodar uma vez em SQL Editor > New query > Run.

create extension if not exists pgcrypto;

create table if not exists public.perfis (
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

drop trigger if exists ao_criar_usuario on auth.users;
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

create table if not exists public.rotas (
  id uuid primary key default gen_random_uuid(),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  at_id text,
  dia date not null default (now() at time zone 'America/Maceio')::date,
  arquivo text,
  criado_em timestamptz not null default now()
);
create unique index if not exists rotas_motorista_at on public.rotas (motorista_id, at_id) where at_id is not null;
create index if not exists rotas_dia on public.rotas (dia desc);

create table if not exists public.pacotes (
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
create index if not exists pacotes_rota on public.pacotes (rota_id);
create index if not exists pacotes_chave on public.pacotes (chave_lugar);

create table if not exists public.correcoes (
  id bigint generated always as identity primary key,
  chave_lugar text not null check (length(chave_lugar) between 3 and 300),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  criado_em timestamptz not null default now()
);
create index if not exists correcoes_chave on public.correcoes (chave_lugar, motorista_id, criado_em desc);

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

drop policy if exists perfis_ver on public.perfis;
create policy perfis_ver on public.perfis for select to authenticated
  using (id = auth.uid() or public.eh_admin());
drop policy if exists perfis_admin_edita on public.perfis;
create policy perfis_admin_edita on public.perfis for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists rotas_ver on public.rotas;
create policy rotas_ver on public.rotas for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
drop policy if exists rotas_criar on public.rotas;
create policy rotas_criar on public.rotas for insert to authenticated
  with check (motorista_id = auth.uid() and public.eh_ativo());
drop policy if exists rotas_admin_apaga on public.rotas;
create policy rotas_admin_apaga on public.rotas for delete to authenticated
  using (public.eh_admin());

drop policy if exists pacotes_ver on public.pacotes;
create policy pacotes_ver on public.pacotes for select to authenticated
  using (public.eh_admin() or (public.eh_ativo() and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid())));
drop policy if exists pacotes_criar on public.pacotes;
create policy pacotes_criar on public.pacotes for insert to authenticated
  with check (public.eh_ativo() and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid()));
drop policy if exists pacotes_marcar on public.pacotes;
create policy pacotes_marcar on public.pacotes for update to authenticated
  using (public.eh_ativo() and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid()))
  with check (public.eh_ativo() and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid()));

drop policy if exists correcoes_ver on public.correcoes;
create policy correcoes_ver on public.correcoes for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
drop policy if exists correcoes_criar on public.correcoes;
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

-- ===== 002_desfazer_correcao.sql =====
-- Deixa o motorista apagar uma correção de pino que ele mesmo fez nas últimas 24 horas,
-- para o "Desfazer" do app valer também na nuvem.
-- Rodar uma vez em SQL Editor > New query > Run.

grant delete on public.correcoes to authenticated;

drop policy if exists correcoes_desfazer on public.correcoes;
create policy correcoes_desfazer on public.correcoes for delete to authenticated
  using (motorista_id = auth.uid() and public.eh_ativo() and criado_em > now() - interval '1 day');

-- ===== 003_admin.sql =====
-- Deixa o administrador apagar a marcação de pino errada de qualquer motorista (tela Admin do app).
-- Rodar uma vez em SQL Editor > New query > Run.

grant delete on public.correcoes to authenticated;

drop policy if exists correcoes_admin_apaga on public.correcoes;
create policy correcoes_admin_apaga on public.correcoes for delete to authenticated
  using (public.eh_admin());

-- ===== 004_observacoes.sql =====
-- Guarda a posição do celular na hora em que o motorista marca a entrega como feita,
-- e passa a usar essas passagens, junto com as correções de pino, para confirmar o lugar.
-- Rodar uma vez em SQL Editor > New query > Run.

create table if not exists public.observacoes (
  id bigint generated always as identity primary key,
  chave_lugar text not null check (length(chave_lugar) between 3 and 300),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  precisao_m real not null check (precisao_m >= 0 and precisao_m <= 100),
  endereco text check (endereco is null or length(endereco) <= 300),
  rua text check (rua is null or length(rua) <= 200),
  rua_chave text check (rua_chave is null or length(rua_chave) <= 200),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  dia date not null default (now() at time zone 'America/Maceio')::date,
  criado_em timestamptz not null default now()
);
create index if not exists observacoes_chave on public.observacoes (chave_lugar, criado_em desc);
create index if not exists observacoes_dia on public.observacoes (dia desc);
create index if not exists observacoes_rua on public.observacoes (rua_chave) where rua_chave is not null;
create unique index if not exists observacoes_por_dia on public.observacoes (chave_lugar, motorista_id, dia);

alter table public.observacoes enable row level security;
revoke all on public.observacoes from anon, authenticated;
grant select, insert on public.observacoes to authenticated;

drop policy if exists observacoes_ver on public.observacoes;
create policy observacoes_ver on public.observacoes for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
drop policy if exists observacoes_criar on public.observacoes;
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

-- ===== 005_ruas.sql =====
-- Nossa cópia das ruas das cidades onde os motoristas trabalham, vinda do OpenStreetMap
-- (dados livres) e melhorada pelas entregas. Cada linha é um trecho de rua.
-- Rodar uma vez em SQL Editor > New query > Run. Depois, no computador: npm run ruas -- Aracaju

create table if not exists public.ruas (
  id bigint generated always as identity primary key,
  osm_id bigint unique,
  nome text,
  nome_chave text,
  cidade text not null,
  lat double precision not null,
  lng double precision not null,
  linha jsonb not null,
  fonte text not null default 'osm' check (fonte in ('osm', 'motorista')),
  atualizado_em timestamptz not null default now()
);
create index if not exists ruas_chave on public.ruas (nome_chave, cidade);
create index if not exists ruas_sem_nome on public.ruas (cidade) where nome_chave is null;

alter table public.ruas enable row level security;
revoke all on public.ruas from anon, authenticated;
grant select on public.ruas to authenticated;

drop policy if exists ruas_ver on public.ruas;
create policy ruas_ver on public.ruas for select to authenticated using (public.eh_ativo());

-- ===== 006_nomes.sql =====
-- Usa as passagens (posição de cada entrega marcada na porta) para dar nome aos trechos
-- de rua que o mapa livre trouxe sem nome, e mede o quanto a nossa base já cobre.
-- Rodar uma vez em SQL Editor > New query > Run. Depois é pelo botão na aba Admin.

create or replace function public.nomear_ruas(metros int default 40)
returns table (trechos int, ruas int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra pode nomear ruas';
  end if;
  return query
  with candidata as (
    select r.id, o.rua, o.rua_chave, count(*) as vezes
    from public.ruas r
    join public.observacoes o
      on o.rua_chave is not null and o.rua_chave <> ''
     and exists (
       select 1 from jsonb_array_elements(r.linha) v
       where public.perto((v->>0)::double precision, (v->>1)::double precision, o.lat, o.lng, metros)
     )
    where r.nome_chave is null
    group by r.id, o.rua, o.rua_chave
  ),
  melhor as (
    select distinct on (candidata.id) candidata.id, candidata.rua, candidata.rua_chave
    from candidata
    order by candidata.id, candidata.vezes desc, candidata.rua_chave
  ),
  feito as (
    update public.ruas r
       set nome = m.rua, nome_chave = m.rua_chave, fonte = 'motorista', atualizado_em = now()
      from melhor m
     where r.id = m.id
    returning r.nome_chave
  )
  select count(*)::int, count(distinct feito.nome_chave)::int from feito;
end $$;

create or replace function public.cobertura()
returns table (ruas_com_nome int, trechos_sem_nome int, trechos_nossos int,
               passagens int, lugares int, lugares_confirmados int)
language sql stable security definer set search_path = public as $$
  select
    (select count(distinct nome_chave)::int from public.ruas where nome_chave is not null),
    (select count(*)::int from public.ruas where nome_chave is null),
    (select count(*)::int from public.ruas where fonte = 'motorista'),
    (select count(*)::int from public.observacoes),
    (select count(distinct chave_lugar)::int from public.observacoes),
    (select count(*)::int from (
       select o.chave_lugar from public.observacoes o
       group by o.chave_lugar having count(distinct (o.motorista_id, o.dia)) >= 2) x)
  where public.eh_admin();
$$;

revoke all on function public.nomear_ruas(int), public.cobertura() from public, anon;
grant execute on function public.nomear_ruas(int), public.cobertura() to authenticated;

-- ===== 007_tipo_rua.sql =====
-- Guarda o tipo da via (rua, travessa, avenida…) e o nome alternativo de cada trecho,
-- para não confundir "Travessa Um" com "Rua Um" e para achar rua que mudou de nome.
-- Rodar uma vez em SQL Editor > New query > Run. Depois: npm run ruas -- Aracaju (de novo).

alter table public.ruas add column if not exists tipo text;
alter table public.ruas add column if not exists nome_chave2 text;
create index if not exists ruas_chave2 on public.ruas (nome_chave2) where nome_chave2 is not null;

-- ===== 008_bairro_rua.sql =====
-- Guarda o bairro de cada trecho de rua, para não confundir a "Rua B" de um bairro
-- com a "Rua B" de outro. Rodar uma vez em SQL Editor. Depois: npm run ruas -- Aracaju
alter table public.ruas add column if not exists bairro text;
create index if not exists ruas_bairro on public.ruas (bairro) where bairro is not null;

-- ===== 009_conjunto_rua.sql =====
-- Guarda também o conjunto/loteamento/condomínio de cada trecho: é ele que diferencia
-- a "Rua B" de um conjunto da "Rua B" do conjunto ao lado.
-- Rodar uma vez em SQL Editor. Depois: npm run ruas -- Aracaju
alter table public.ruas add column if not exists conjunto text;
create index if not exists ruas_conjunto on public.ruas (conjunto) where conjunto is not null;
