-- Motorista novo em conferência (15/10). No dia em que entraram dois motoristas novos, um marcou
-- duas portas no lugar errado, e uma já apareceu verificada para todo mundo: o "Entreguei aqui"
-- grava a marcação e a passagem no mesmo ponto, e a `posicoes` aceita esse par de um motorista só,
-- perto do pino ou longe dele. Foi o mesmo caminho das 33 portas erradas de 04/10. O dono pediu
-- para conferir o que o novo marca, e junto tudo o que ele entrega no período: se entregou, é lá
-- que vale.
--
-- - perfis.conferir: ligado, o que o motorista grava (marcação, passagem da entrega, lugar com
--   nome) nasce pendente. Pendente não vale para ninguém, nem para ele em outro celular: no dele,
--   a memória do aparelho continua lembrando. Conta nova nasce em conferência, e o admin encerra
--   na aba Admin.
-- - Encerrar não solta o que ficou pendente. O que ele gravou no período só vale aprovado.
-- - Aprovar faz valer como a de qualquer motorista, não como a do admin. Recusar apaga a marcação
--   e o lugar com nome; a passagem fica guardada, recusada, porque é o registro da entrega.
-- - Quem já tinha conta continua como estava. As contas criadas em 15/10 entram em conferência,
--   com o que já gravaram.
--
-- Medido nas primeiras semanas de quem entrou depois da 017: mudariam a porta para os outros 44
-- endereços da Leudy e 34 do Jefferson, 6 e 18 deles só por entrega no pino.
--
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

alter table public.correcoes add column if not exists pendente boolean not null default false;
alter table public.observacoes add column if not exists pendente boolean not null default false;
alter table public.observacoes add column if not exists recusada boolean not null default false;
alter table public.lugares add column if not exists pendente boolean not null default false;

-- Só na primeira vez: rodar de novo não pode pôr em conferência quem o admin já liberou.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'perfis' and column_name = 'conferir') then
    alter table public.perfis add column conferir boolean not null default false;
    update public.perfis set conferir = true
     where papel = 'motorista' and criado_em >= timestamptz '2026-10-15 00:00:00-03';
    update public.correcoes c set pendente = true from public.perfis p where p.id = c.motorista_id and p.conferir;
    update public.observacoes o set pendente = true from public.perfis p where p.id = o.motorista_id and p.conferir;
    update public.lugares l set pendente = true from public.perfis p where p.id = l.motorista_id and p.conferir;
  end if;
end $$;

alter table public.perfis alter column conferir set default true;
-- a política perfis_admin_edita já deixa só o admin mudar
grant update (conferir) on public.perfis to authenticated;

-- Quem decide é o banco, pelo perfil: o que o celular manda nesse campo não conta. A chave de
-- serviço (`npm run restaurar`) grava o que o backup tinha, aprovado ou não.
create or replace function public.nasce_pendente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  new.pendente := coalesce((select p.conferir and p.papel <> 'admin' from public.perfis p where p.id = new.motorista_id), false);
  return new;
end $$;

revoke all on function public.nasce_pendente() from public, anon, authenticated;

drop trigger if exists correcoes_pendente on public.correcoes;
create trigger correcoes_pendente before insert on public.correcoes
  for each row execute function public.nasce_pendente();
drop trigger if exists observacoes_pendente on public.observacoes;
create trigger observacoes_pendente before insert on public.observacoes
  for each row execute function public.nasce_pendente();
drop trigger if exists lugares_pendente on public.lugares;
create trigger lugares_pendente before insert on public.lugares
  for each row execute function public.nasce_pendente();

-- A `posicoes` da 017, com um motorista cujo pendente entra na conta: é assim que o Admin vê o que
-- mudaria se aprovasse. Sem ninguém (nulo), é a porta que vale hoje.
drop function if exists public.posicoes_com(text[], uuid);

create function public.posicoes_com(chaves text[], incluir uuid)
returns table (chave_lugar text, lat double precision, lng double precision, situacao text,
               motoristas int, entregas int, fonte text, motorista_id uuid)
language sql stable security definer set search_path = public as $$
  with correcao as (
    select distinct on (c.chave_lugar, c.motorista_id)
      c.chave_lugar, c.motorista_id, c.lat, c.lng, c.criado_em, p.papel = 'admin' as admin
    from public.correcoes c
    join public.perfis p on p.id = c.motorista_id and p.ativo
    where c.chave_lugar = any (chaves) and (not c.pendente or c.motorista_id = incluir)
    order by c.chave_lugar, c.motorista_id, c.criado_em desc
  ),
  passagem as (
    select distinct on (o.chave_lugar, o.motorista_id, o.dia)
      o.chave_lugar, o.motorista_id, o.lat, o.lng, o.criado_em, o.no_pino
    from public.observacoes o
    join public.perfis p on p.id = o.motorista_id and p.ativo
    where o.chave_lugar = any (chaves) and not o.recusada and (not o.pendente or o.motorista_id = incluir)
    order by o.chave_lugar, o.motorista_id, o.dia, o.criado_em desc
  ),
  marca as (
    select chave_lugar, motorista_id, lat, lng, criado_em, admin, true as de_correcao, false as no_pino from correcao
    union all
    select chave_lugar, motorista_id, lat, lng, criado_em, false, false, no_pino from passagem
  ),
  contada as (
    select a.*,
      (select count(*) from marca b where b.chave_lugar = a.chave_lugar and b.de_correcao and public.perto(a.lat, a.lng, b.lat, b.lng))::int as nc,
      (select count(*) from marca b where b.chave_lugar = a.chave_lugar and not b.de_correcao and public.perto(a.lat, a.lng, b.lat, b.lng))::int as np,
      (select count(*) from marca b where b.chave_lugar = a.chave_lugar and not b.de_correcao and b.no_pino and public.perto(a.lat, a.lng, b.lat, b.lng))::int as npp
    from marca a
  ),
  julgada as (
    select c.*, (c.admin or c.nc >= 2 or (c.nc >= 1 and c.np >= 1) or c.np >= 2 or c.npp >= 1) as confirma
    from contada c
  ),
  melhor as (
    select distinct on (julgada.chave_lugar) julgada.*
    from julgada
    order by julgada.chave_lugar, julgada.admin desc, julgada.confirma desc, (julgada.nc * 2 + julgada.np) desc,
             julgada.de_correcao desc, julgada.criado_em desc
  )
  select m.chave_lugar, m.lat, m.lng,
         case when m.confirma then 'confirmado' when m.de_correcao then 'sugestao' else 'pouco' end,
         m.nc, m.np,
         case when m.admin then 'admin' when m.nc > 0 then 'correcao' else 'entrega' end,
         m.motorista_id
  from melhor m
  where m.confirma or m.de_correcao;
$$;

revoke all on function public.posicoes_com(text[], uuid) from public, anon, authenticated;

create or replace function public.posicoes(chaves text[])
returns table (chave_lugar text, lat double precision, lng double precision, situacao text,
               motoristas int, entregas int, fonte text, minha boolean)
language sql stable security definer set search_path = public as $$
  select p.chave_lugar, p.lat, p.lng, p.situacao, p.motoristas, p.entregas, p.fonte, p.motorista_id = auth.uid()
  from public.posicoes_com(chaves, null) p
  where public.eh_ativo() and cardinality(chaves) <= 500;
$$;

revoke all on function public.posicoes(text[]) from public, anon;
grant execute on function public.posicoes(text[]) to authenticated;

-- A da 010, sem os lugares pendentes.
create or replace function public.lugares_conhecidos(palavras text[], cidade_ text)
returns table (nome_chave text, nome text, lat double precision, lng double precision, situacao text, vistas int)
language sql stable security definer set search_path = public as $$
  with achados as (
    select l.*, p.papel = 'admin' as admin
    from public.lugares l
    join public.perfis p on p.id = l.motorista_id and p.ativo
    where l.cidade = cidade_ and not l.pendente
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

-- As outras três que aprendem com as passagens também deixam o pendente de fora. Marcada de casa,
-- a entrega punha o centro do CEP, o nome do trecho do mapa e a rua desenhada no lugar errado.
-- Iguais à 012, à 006 e à 013 fora isso.
create or replace function public.ancoras_de_cep(ceps text[])
returns table (cep text, lat double precision, lng double precision, raio int, marcas int)
language sql stable security definer set search_path = public as $$
  with marca as (
    select split_part(c.chave_lugar, '|', 1) as cep, c.lat, c.lng
      from public.correcoes c
      join public.perfis p on p.id = c.motorista_id and p.ativo
     where split_part(c.chave_lugar, '|', 1) = any (ceps) and not c.pendente
    union all
    select split_part(o.chave_lugar, '|', 1), o.lat, o.lng
      from public.observacoes o
      join public.perfis p on p.id = o.motorista_id and p.ativo
     where split_part(o.chave_lugar, '|', 1) = any (ceps) and not o.pendente and not o.recusada
  ),
  centro as (
    select m.cep,
           percentile_cont(0.5) within group (order by m.lat) as lat,
           percentile_cont(0.5) within group (order by m.lng) as lng,
           count(*)::int as marcas
      from marca m
     group by m.cep
  ),
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
      on o.rua_chave is not null and o.rua_chave <> '' and not o.pendente and not o.recusada
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

revoke all on function public.nomear_ruas(int) from public, anon;
grant execute on function public.nomear_ruas(int) to authenticated;

create or replace function public.criar_ruas_das_entregas(vao_maximo int default 2000, apenas text[] default null)
returns table (gravadas int, pontos int)
language plpgsql security definer set search_path = public as $$
declare n_gravadas int; n_pontos int;
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra pode criar ruas';
  end if;

  create temp table alvo on commit drop as
  with ponto as (
    select o.rua_chave, o.rua, o.chave_lugar,
           round(o.lat::numeric, 5)::double precision as lat,
           round(o.lng::numeric, 5)::double precision as lng
      from public.observacoes o
      join public.perfis p on p.id = o.motorista_id and p.ativo
     where o.rua_chave is not null and o.rua_chave <> '' and not o.pendente and not o.recusada
       and (apenas is null or o.rua_chave = any (apenas))
  ),
  firme as (
    select p.rua_chave from ponto p
     group by p.rua_chave
    having count(distinct p.chave_lugar) >= 2
  ),
  medida as (
    select p.rua_chave,
           mode() within group (order by p.rua) as nome,
           avg(p.lat) as lat, avg(p.lng) as lng,
           count(*)::int as vezes,
           max(p.lat) - min(p.lat) as vao_lat,
           (max(p.lng) - min(p.lng)) * cos(radians(avg(p.lat))) as vao_lng
      from ponto p
      join firme f on f.rua_chave = p.rua_chave
     group by p.rua_chave
  ),
  cabe as (
    select m.* from medida m
     where 111320 * sqrt(power(m.vao_lat, 2) + power(m.vao_lng, 2)) <= vao_maximo
  ),
  situada as (
    select c.*, v.cidade, v.bairro, v.conjunto
      from cabe c
      cross join lateral (
        select r.cidade, r.bairro, r.conjunto
          from public.ruas r
         order by power(r.lat - c.lat, 2) + power(r.lng - c.lng, 2)
         limit 1
      ) v
  )
  select s.rua_chave, s.nome, s.lat, s.lng, s.vezes, s.cidade, s.bairro, s.conjunto, (
    select jsonb_agg(jsonb_build_array(q.lat, q.lng) order by
             case when s.vao_lat >= s.vao_lng then q.lat else q.lng end)
      from (select distinct p.lat, p.lng from ponto p where p.rua_chave = s.rua_chave) q
  ) as linha
    from situada s
   where not exists (
     select 1 from public.ruas r
      where r.nome_chave = s.rua_chave and r.cidade = s.cidade and r.fonte <> 'entregas'
   );

  with gravado as (
    insert into public.ruas (nome, nome_chave, tipo, bairro, conjunto, cidade, lat, lng, linha, fonte, atualizado_em)
    select a.nome, a.rua_chave, null::text, a.bairro, a.conjunto, a.cidade, a.lat, a.lng, a.linha, 'entregas', now()
      from alvo a
     where a.linha is not null and jsonb_array_length(a.linha) >= 2
    on conflict (nome_chave, cidade) where fonte = 'entregas'
    do update set nome = excluded.nome, lat = excluded.lat, lng = excluded.lng,
                  linha = excluded.linha, bairro = excluded.bairro, conjunto = excluded.conjunto,
                  atualizado_em = now()
    returning 1 as uma
  )
  select count(*)::int into n_gravadas from gravado;

  select coalesce(sum(a.vezes), 0)::int into n_pontos
    from alvo a where a.linha is not null and jsonb_array_length(a.linha) >= 2;
  return query select coalesce(n_gravadas, 0), coalesce(n_pontos, 0);
end $$;

revoke all on function public.criar_ruas_das_entregas(int, text[]) from public, anon;
grant execute on function public.criar_ruas_das_entregas(int, text[]) to authenticated;

-- O que espera o admin: só os endereços em que o pendente mudaria a resposta da `posicoes` para os
-- outros (porta nova, porta em outro ponto ou outra situação). Passagem longe do pino, sozinha, não
-- muda nada e não aparece. `pino_*` é o pacote da rota dele mais perto do ponto: rota lida de vídeo
-- não sobe pacote, e aí vem nulo.
drop function if exists public.marcas_em_conferencia();

create function public.marcas_em_conferencia()
returns table (motorista_id uuid, nome text, chave_lugar text, endereco text, criado_em timestamptz,
               lat double precision, lng double precision, situacao text,
               lat_antes double precision, lng_antes double precision, situacao_antes text,
               pino_lat double precision, pino_lng double precision, no_pino boolean)
language plpgsql stable security definer set search_path = public as $$
declare d record;
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra confere as marcações';
  end if;
  for d in
    select x.mid, array_agg(distinct x.chave) as ks
    from (select c.motorista_id as mid, c.chave_lugar as chave from public.correcoes c where c.pendente
          union all
          select o.motorista_id, o.chave_lugar from public.observacoes o where o.pendente) x
    group by x.mid
  loop
    return query
      with com as (select * from public.posicoes_com(d.ks, d.mid)),
           sem as (select * from public.posicoes_com(d.ks, null))
      select d.mid, pf.nome, k.chave,
        coalesce(
          (select pa.endereco || coalesce(', ' || nullif(pa.bairro, ''), '') from public.pacotes pa join public.rotas r on r.id = pa.rota_id
            where r.motorista_id = d.mid and pa.chave_lugar = k.chave order by pa.criado_em desc limit 1),
          (select o.endereco from public.observacoes o
            where o.motorista_id = d.mid and o.chave_lugar = k.chave and o.endereco is not null order by o.criado_em desc limit 1),
          k.chave),
        (select max(t.criado_em) from (
          select c.criado_em from public.correcoes c where c.pendente and c.motorista_id = d.mid and c.chave_lugar = k.chave
          union all
          select o.criado_em from public.observacoes o where o.pendente and o.motorista_id = d.mid and o.chave_lugar = k.chave) t),
        com.lat, com.lng, com.situacao, sem.lat, sem.lng, sem.situacao,
        pino.lat, pino.lng,
        not exists (select 1 from public.correcoes c where c.pendente and c.motorista_id = d.mid and c.chave_lugar = k.chave)
          and not exists (select 1 from public.observacoes o
                           where o.pendente and o.motorista_id = d.mid and o.chave_lugar = k.chave and not o.no_pino)
      from unnest(d.ks) k(chave)
      join public.perfis pf on pf.id = d.mid
      left join com on com.chave_lugar = k.chave
      left join sem on sem.chave_lugar = k.chave
      left join lateral (
        select pa.lat, pa.lng from public.pacotes pa join public.rotas r on r.id = pa.rota_id
        where r.motorista_id = d.mid and pa.chave_lugar = k.chave and pa.lat is not null and com.lat is not null
        order by power(pa.lat - com.lat, 2) + power(pa.lng - com.lng, 2) limit 1) pino on true
      where com.chave_lugar is distinct from sem.chave_lugar
         or com.situacao is distinct from sem.situacao
         or not public.perto(com.lat, com.lng, sem.lat, sem.lng, 1);
  end loop;
end $$;

revoke all on function public.marcas_em_conferencia() from public, anon;
grant execute on function public.marcas_em_conferencia() to authenticated;

-- Aprovar ou recusar o pendente de um motorista nos endereços dados. O lugar com nome sai da mesma
-- marcação ou passagem, no mesmo ponto: é por ele que se acha qual lugar vai junto.
drop function if exists public.decidir_marcas(uuid, text[], boolean);

create function public.decidir_marcas(motorista uuid, chaves text[], aprovar boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int;
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra confere as marcações';
  end if;
  if cardinality(chaves) > 500 then
    raise exception 'no máximo 500 endereços de uma vez';
  end if;
  if aprovar then
    update public.lugares l set pendente = false
     where l.pendente and l.motorista_id = motorista and exists (
       select 1 from public.correcoes c where c.pendente and c.motorista_id = motorista and c.chave_lugar = any (chaves) and public.perto(l.lat, l.lng, c.lat, c.lng, 1)
       union all
       select 1 from public.observacoes o where o.pendente and o.motorista_id = motorista and o.chave_lugar = any (chaves) and public.perto(l.lat, l.lng, o.lat, o.lng, 1));
    update public.correcoes set pendente = false where pendente and correcoes.motorista_id = motorista and chave_lugar = any (chaves);
    get diagnostics m = row_count; n := n + m;
    update public.observacoes set pendente = false where pendente and observacoes.motorista_id = motorista and chave_lugar = any (chaves);
    get diagnostics m = row_count; n := n + m;
  else
    delete from public.lugares l
     where l.pendente and l.motorista_id = motorista and exists (
       select 1 from public.correcoes c where c.pendente and c.motorista_id = motorista and c.chave_lugar = any (chaves) and public.perto(l.lat, l.lng, c.lat, c.lng, 1)
       union all
       select 1 from public.observacoes o where o.pendente and o.motorista_id = motorista and o.chave_lugar = any (chaves) and public.perto(l.lat, l.lng, o.lat, o.lng, 1));
    delete from public.correcoes where pendente and correcoes.motorista_id = motorista and chave_lugar = any (chaves);
    get diagnostics m = row_count; n := n + m;
    update public.observacoes set pendente = false, recusada = true where pendente and observacoes.motorista_id = motorista and chave_lugar = any (chaves);
    get diagnostics m = row_count; n := n + m;
  end if;
  return n;
end $$;

revoke all on function public.decidir_marcas(uuid, text[], boolean) from public, anon;
grant execute on function public.decidir_marcas(uuid, text[], boolean) to authenticated;
