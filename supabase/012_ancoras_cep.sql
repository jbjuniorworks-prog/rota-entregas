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
