-- Cria a rua que NENHUM mapa tem, a partir das entregas já feitas nela.
-- `nomear_ruas` dá nome a um trecho que o OpenStreetMap trouxe sem nome; esta aqui resolve o caso
-- pior, o da rua que não existe em lugar nenhum — nem no censo, nem no mapa livre, nem nos Correios.
-- Em Jabotiana isso é a regra, não a exceção: "Rua Estanislau dos Santos" e "Rua Wilson Carvalho"
-- não estão em fonte alguma, e mesmo assim o entregador já esteve nas duas.
-- Cada passagem guarda a rua junto do ponto; juntando as da mesma rua sai o trecho.
-- Só vale quando duas portas diferentes chegam ao mesmo nome de rua, e sobram dois pontos
-- distintos para desenhar o trecho.
-- Rodar uma vez em SQL Editor > New query > Run. Depois é pelo botão na aba Admin.

-- 'entregas' = trecho que nasceu das passagens. Diferente de 'motorista', que é o trecho do
-- OpenStreetMap que só ganhou o nome com elas — aquele se repete por rua, este é um por rua.
alter table public.ruas drop constraint if exists ruas_fonte_check;
alter table public.ruas add constraint ruas_fonte_check check (fonte in ('osm', 'motorista', 'entregas'));
create unique index if not exists ruas_das_entregas on public.ruas (nome_chave, cidade) where fonte = 'entregas';

drop function if exists public.criar_ruas_das_entregas(int, text[]);

create function public.criar_ruas_das_entregas(vao_maximo int default 2000, apenas text[] default null)
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
     where o.rua_chave is not null and o.rua_chave <> ''
       and (apenas is null or o.rua_chave = any (apenas))
  ),
  -- Duas PORTAS diferentes têm de chegar ao mesmo nome de rua. Não é rigor à toa: nome mal lido
  -- vem colado num complemento e aparece uma vez só ("Rua Antônio Andrade- Casa", "Avenida
  -- Francisco Porto Apt 1104"). Nas passagens de hoje, os nomes tortos têm uma porta cada e os
  -- bons têm duas ou mais, então esta linha sozinha separa uns dos outros.
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
  -- rua comprida demais é sinal de chave errada juntando coisas diferentes
  cabe as (
    select m.* from medida m
     where 111320 * sqrt(power(m.vao_lat, 2) + power(m.vao_lng, 2)) <= vao_maximo
  ),
  -- cidade, bairro e conjunto saem do trecho vizinho mais próximo: é o que o app usa para
  -- desempatar rua de mesmo nome, e assim a rua nova já nasce sabendo onde está
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
  -- não mexe onde o mapa já tem a rua; só onde não tem
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
