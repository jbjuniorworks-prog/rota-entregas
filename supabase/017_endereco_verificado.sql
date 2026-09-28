-- Endereço verificado, como o do Mercado Livre: uma entrega feita no pino já vale para os outros.
-- Até aqui uma entrega sozinha (passagem) não confirmava nada: eram precisas duas, em dias ou
-- motoristas diferentes, para um GPS pego de dentro do carro não travar a porta errada para todo
-- mundo. Os motoristas pediram em 28/09: quem entregou tem certeza de que dá para entregar ali.
-- A trava passa a ser outra: a passagem só verifica sozinha quando o GPS da entrega caiu a até
-- 30 m do pino que o motorista estava seguindo (`no_pino`, medido no celular). Longe do pino, ou
-- o pino estava errado ou ele marcou de outro lugar, e aí continua valendo a regra antiga.
--
-- Junto, um desempate que estava errado: o melhor ponto era escolhido por pontos (correção vale
-- 2, passagem 1), e um lugar confirmado por duas entregas (2 pontos) perdia para uma correção
-- solta de um motorista só (2 pontos, e correção ganha no empate). O confirmado sumia atrás de
-- uma sugestão. Agora o que está confirmado vem antes de qualquer contagem.
--
-- RODE ANTES de subir o app que manda `no_pino`: a fila do celular descarta calada a passagem
-- que o banco recusa, e um campo que o banco ainda não tem é recusa.
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

alter table public.observacoes add column if not exists no_pino boolean not null default false;

create or replace function public.posicoes(chaves text[])
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
      o.chave_lugar, o.motorista_id, o.lat, o.lng, o.criado_em, o.no_pino
    from public.observacoes o
    join public.perfis p on p.id = o.motorista_id and p.ativo
    where o.chave_lugar = any (chaves)
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
         m.motorista_id = auth.uid()
  from melhor m
  where (m.confirma or m.de_correcao) and public.eh_ativo() and cardinality(chaves) <= 500;
$$;

revoke all on function public.posicoes(text[]) from public, anon;
grant execute on function public.posicoes(text[]) to authenticated;
