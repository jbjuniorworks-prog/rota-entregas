-- Contar os pacotes de cada rota no próprio banco, para a aba Admin abrir rápido (11/10).
-- Para mostrar "Luan · 40/52 entregues" nas 62 rotas de 14 dias, o app baixava os 6.239 pacotes,
-- em 8 idas uma depois da outra, só para contar: 2,7 s dos ~6 s que o Admin levava para abrir.
-- Volta uma linha por rota pedida, com zero quando ela não tem pacote: o app confere que veio uma
-- para cada, e enquanto esta função não existir ele continua contando do jeito antigo.
-- Lê com as permissões de quem chama: quem administra vê todas; o motorista, só as dele.
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

create or replace function public.contagem_das_rotas(ids uuid[])
returns table (rota_id uuid, pacotes int, entregues int)
language sql stable security invoker set search_path = public as $$
  select i.id, count(p.id)::int, count(p.entregue_em)::int
    from unnest(ids) as i(id)
    left join public.pacotes p on p.rota_id = i.id
   group by i.id;
$$;

revoke all on function public.contagem_das_rotas(uuid[]) from public, anon;
grant execute on function public.contagem_das_rotas(uuid[]) to authenticated;
