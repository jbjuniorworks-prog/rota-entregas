-- Gerar senha nova e mudar o papel pela aba Admin (29/10, pedido do dono: "pode fazer", depois de
-- "tudo que o código faz tem na tela de admin?"). Até aqui era `npm run motoristas -- senha`,
-- `-- admin` e `-- motorista`, no computador, porque pedem a chave de serviço, que dentro de um app
-- público entregaria o banco inteiro. Aqui, como a criação de conta (019): funções do banco que só
-- quem administra chama.
--
-- Senha: a receita da 019 (14 caracteres, sem 0/O e 1/l/I, com maiúscula, minúscula e número). Volta
-- uma vez só, para ele mandar ao motorista; o banco guarda só o embaralhado. Só para conta de
-- motorista: a de outro administrador não se troca por aqui. Como no terminal, quem já estava
-- dentro do app continua dentro; a senha nova vale para o próximo login.
--
-- Papel: as travas do terminal (rebaixar o último administrador ativo é recusado; virar
-- administrador deixa a conta ativa), e mais uma: ninguém muda o próprio papel por aqui, porque
-- rebaixar a si mesmo trancaria o Admin para quem está usando.
--
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

create extension if not exists pgcrypto;

create or replace function public.nova_senha(motorista uuid)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  -- sem 0/O, 1/l/I: a senha é lida no WhatsApp e digitada no celular
  letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  s text;
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra pode gerar senha';
  end if;
  if not exists (select 1 from public.perfis p where p.id = motorista and p.papel = 'motorista') then
    raise exception 'só se gera senha nova para conta de motorista';
  end if;
  loop
    select string_agg(substr(letras, 1 + ((get_byte(r.b, 2 * i) * 256 + get_byte(r.b, 2 * i + 1)) % length(letras)), 1), '')
      into s
      from (select gen_random_bytes(28) as b) r, generate_series(0, 13) i;
    exit when s ~ '[0-9]' and s ~ '[A-Z]' and s ~ '[a-z]';
  end loop;
  update auth.users set encrypted_password = crypt(s, gen_salt('bf')), updated_at = now() where id = motorista;
  if not found then
    raise exception 'conta não encontrada';
  end if;
  return s;
end $$;

revoke all on function public.nova_senha(uuid) from public, anon;
grant execute on function public.nova_senha(uuid) to authenticated;

create or replace function public.mudar_papel(pessoa uuid, papel_ text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra pode mudar o papel';
  end if;
  if papel_ not in ('motorista', 'admin') then
    raise exception 'papel desconhecido: %', papel_;
  end if;
  if pessoa = auth.uid() then
    raise exception 'o próprio papel não se muda por aqui';
  end if;
  if papel_ = 'motorista' and not exists (select 1 from public.perfis p where p.papel = 'admin' and p.ativo and p.id <> pessoa) then
    raise exception 'é o único administrador ativo: promova outro antes';
  end if;
  update public.perfis set papel = papel_, ativo = ativo or papel_ = 'admin' where id = pessoa;
  if not found then
    raise exception 'conta não encontrada';
  end if;
end $$;

revoke all on function public.mudar_papel(uuid, text) from public, anon;
grant execute on function public.mudar_papel(uuid, text) to authenticated;

-- ===== Para voltar como era (só se precisar): tire os dois traços do começo de cada linha e rode.
-- O app sem as funções diz que falta rodar este arquivo, e o terminal continua servindo.
-- drop function if exists public.nova_senha(uuid);
-- drop function if exists public.mudar_papel(uuid, text);
