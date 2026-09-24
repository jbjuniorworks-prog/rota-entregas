-- Conta qual botão do cartão é usado e qual vem depois de qual.
-- O cartão de cada parada tem cinco botões na mesma fileira, e até agora quais ficam na frente
-- foi decidido no chute. Uma semana de rota responde melhor do que qualquer opinião: se "Ver" é
-- quase sempre seguido de "Editar", os dois são na prática um fluxo só e podem virar um botão.
-- Não guarda endereço, pacote, horário nem posição — só o nome do botão e quantas vezes.
-- Rodar uma vez em SQL Editor > New query > Run.

create table if not exists public.uso_dos_botoes (
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  dia date not null,
  botao text not null check (length(botao) between 1 and 40),
  -- '' = o total do botão; qualquer outra coisa = o botão que foi tocado logo antes dele
  antes text not null default '' check (length(antes) <= 40),
  vezes int not null check (vezes >= 0 and vezes <= 100000),
  atualizado_em timestamptz not null default now(),
  primary key (motorista_id, dia, botao, antes)
);

alter table public.uso_dos_botoes enable row level security;
revoke all on public.uso_dos_botoes from anon, authenticated;
grant select, insert, update on public.uso_dos_botoes to authenticated;

drop policy if exists uso_ver on public.uso_dos_botoes;
create policy uso_ver on public.uso_dos_botoes for select to authenticated
  using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());

drop policy if exists uso_gravar on public.uso_dos_botoes;
create policy uso_gravar on public.uso_dos_botoes for insert to authenticated
  with check (motorista_id = auth.uid() and public.eh_ativo());

drop policy if exists uso_atualizar on public.uso_dos_botoes;
create policy uso_atualizar on public.uso_dos_botoes for update to authenticated
  using (motorista_id = auth.uid() and public.eh_ativo())
  with check (motorista_id = auth.uid() and public.eh_ativo());

-- O celular manda o ACUMULADO do dia, não o que acabou de acontecer. A fila offline entrega pelo
-- menos uma vez, então somar aqui contaria duas vezes tudo que foi reenviado depois de uma falha
-- de rede. Ficando com o maior dos dois, reenviar o mesmo retrato não estraga nada, e um retrato
-- que chega atrasado não desfaz um mais novo.
create or replace function public.contar_uso(dia_ date, linhas jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) > 200 then
    raise exception 'lista de uso fora do tamanho';
  end if;
  -- o dia vem do celular, que pode estar com a hora errada ou ter ficado dias sem sinal
  if dia_ < current_date - 30 or dia_ > current_date + 1 then
    raise exception 'dia fora da janela';
  end if;
  insert into public.uso_dos_botoes (motorista_id, dia, botao, antes, vezes)
  select auth.uid(), dia_, x.botao, coalesce(x.antes, ''), x.vezes
    from jsonb_to_recordset(linhas) as x(botao text, antes text, vezes int)
   where x.botao is not null and x.botao <> '' and x.vezes is not null and x.vezes >= 0
  on conflict (motorista_id, dia, botao, antes)
  do update set vezes = greatest(excluded.vezes, public.uso_dos_botoes.vezes), atualizado_em = now();
end;
$$;

grant execute on function public.contar_uso(date, jsonb) to authenticated;
