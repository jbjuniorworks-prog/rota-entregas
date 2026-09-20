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
