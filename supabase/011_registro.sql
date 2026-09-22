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
