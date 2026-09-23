-- Tudo o que falta rodar, na ordem certa. Pode colar inteiro no SQL Editor do Supabase.
-- Pode rodar de novo sem medo: o que já existe é recriado, e nada é apagado.

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

-- ===== 010_lugares.sql =====
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

-- Registro do que o app decidiu: de onde saiu cada posição e se a rota teve as ruas.
-- Sem isso não dá para dizer se o app acertou — só para achar que acertou.
-- Rodar uma vez em SQL Editor > New query > Run.

alter table public.pacotes add column if not exists fonte text;
alter table public.pacotes add column if not exists precisao text;
alter table public.rotas add column if not exists sem_ruas text;

-- Atualiza a posição e a origem de vários pacotes de uma rota numa ida só.
-- A RLS de pacotes já manda em quem pode mexer; aqui é só a forma de escrever em lote.
drop function if exists public.registrar_posicoes(uuid, jsonb);

create function public.registrar_posicoes(rota uuid, itens jsonb)
returns int
language plpgsql security invoker set search_path = public as $$
declare mexidos int;
begin
  if jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) > 500 then
    return 0;
  end if;
  update public.pacotes p
     set lat = x.lat, lng = x.lng, fonte = left(x.fonte, 40), precisao = left(x.precisao, 20)
    from jsonb_to_recordset(itens)
      as x(tn text, lat double precision, lng double precision, fonte text, precisao text)
   where p.rota_id = rota and p.spx_tn = x.tn;
  get diagnostics mexidos = row_count;
  return mexidos;
end;
$$;

revoke all on function public.registrar_posicoes(uuid, jsonb) from public, anon;
grant execute on function public.registrar_posicoes(uuid, jsonb) to authenticated;

-- Resumo de um dia: de onde vieram as posições e o quanto elas erraram, medindo contra
-- onde o motorista realmente estava quando marcou entregue.
drop function if exists public.resumo_do_dia(date);

create function public.resumo_do_dia(dia_ date)
returns table (motorista text, rota_id uuid, sem_ruas text, fonte text,
               pacotes int, com_erro int, erro_mediano int, erro_pior int)
language sql stable security definer set search_path = public as $$
  with meus as (
    select r.id, r.dia, r.sem_ruas, pf.nome
    from public.rotas r
    join public.perfis pf on pf.id = r.motorista_id
    where r.dia = dia_ and (public.eh_admin() or r.motorista_id = auth.uid())
  ),
  medido as (
    select m.nome, m.id as rota_id, m.sem_ruas, coalesce(p.fonte, '(não registrado)') as fonte,
           p.spx_tn,
           (select min(111320 * sqrt(power(o.lat - p.lat, 2)
                        + power((o.lng - p.lng) * cos(radians(o.lat)), 2)))
              from public.observacoes o
             where o.chave_lugar = p.chave_lugar and o.dia = m.dia) as erro
    from meus m
    join public.pacotes p on p.rota_id = m.id
    where p.lat is not null
  )
  select nome, rota_id, sem_ruas, fonte,
         count(*)::int, count(erro)::int,
         percentile_disc(0.5) within group (order by erro) filter (where erro is not null)::int,
         max(erro)::int
  from medido
  group by nome, rota_id, sem_ruas, fonte
  order by nome, rota_id, count(*) desc;
$$;

revoke all on function public.resumo_do_dia(date) from public, anon;
grant execute on function public.resumo_do_dia(date) to authenticated;

-- ===== 012_ancoras_cep.sql =====
-- Aprende ONDE FICA CADA CEP com o que os motoristas já fazem: cada pino arrumado e cada
-- entrega marcada na porta é guardada com a chave "CEP|número". Juntando as do mesmo CEP,
-- sai um ponto para o CEP inteiro — e um CEP é uma quadra, não um bairro.
-- Medido nas marcações reais: 80 m de espalhamento na mediana, contra 600 m do centro do bairro.
-- Serve para o endereço NOVO de uma rua que nenhum mapa tem: o CEP já basta para chegar perto.
-- Rodar uma vez em SQL Editor > New query > Run.

drop function if exists public.ancoras_de_cep(text[]);

create function public.ancoras_de_cep(ceps text[])
returns table (cep text, lat double precision, lng double precision, raio int, marcas int)
language sql stable security definer set search_path = public as $$
  with marca as (
    select split_part(c.chave_lugar, '|', 1) as cep, c.lat, c.lng
      from public.correcoes c
      join public.perfis p on p.id = c.motorista_id and p.ativo
     where split_part(c.chave_lugar, '|', 1) = any (ceps)
    union all
    select split_part(o.chave_lugar, '|', 1), o.lat, o.lng
      from public.observacoes o
      join public.perfis p on p.id = o.motorista_id and p.ativo
     where split_part(o.chave_lugar, '|', 1) = any (ceps)
  ),
  centro as (
    select m.cep,
           percentile_cont(0.5) within group (order by m.lat) as lat,
           percentile_cont(0.5) within group (order by m.lng) as lng,
           count(*)::int as marcas
      from marca m
     group by m.cep
  ),
  -- o raio é o espalhamento das próprias marcações: CEP de rua curta fica apertado,
  -- CEP de avenida comprida pede mais folga. Com uma marcação só, fica o mínimo.
  espalhada as (
    select c.cep, c.lat, c.lng, c.marcas,
           coalesce(percentile_disc(0.9) within group (
             order by 111320 * sqrt(power(m.lat - c.lat, 2) + power((m.lng - c.lng) * cos(radians(c.lat)), 2))
           ), 0) as raio
      from centro c
      join marca m on m.cep = c.cep
     group by c.cep, c.lat, c.lng, c.marcas
  )
  select e.cep, e.lat, e.lng, greatest(60, least(1500, e.raio))::int, e.marcas
    from espalhada e
   where public.eh_ativo() and cardinality(ceps) <= 500;
$$;

revoke all on function public.ancoras_de_cep(text[]) from public, anon;
grant execute on function public.ancoras_de_cep(text[]) to authenticated;
