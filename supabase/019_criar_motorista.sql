-- Criar a conta de um motorista pela aba Admin, colando o e-mail (pedido de 03/10). Até aqui era
-- `npm run motoristas -- criar`, no computador, porque criar conta pelo Supabase pede a chave de
-- serviço, e ela dentro de um app público entregaria o banco inteiro a qualquer um. Aqui a conta
-- nasce no próprio banco, numa função que só quem administra chama, e a senha gerada volta uma vez
-- só, para ele mandar ao motorista. O perfil sai do gatilho de sempre (ao_criar_usuario).
-- Escreve em auth.users e auth.identities como o cadastro do Supabase escreve. Os campos de token
-- vão como '' e não nulos: nulo ali faz o login do Supabase falhar com "Database error".
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

create extension if not exists pgcrypto;

drop function if exists public.criar_motorista(text, text);

create function public.criar_motorista(email_ text, nome_ text default null)
returns table (id uuid, nome text, senha text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  e text := lower(trim(coalesce(email_, '')));
  n text := left(nullif(trim(coalesce(nome_, '')), ''), 60);
  uid uuid := gen_random_uuid();
  -- sem 0/O, 1/l/I: a senha é lida no WhatsApp e digitada no celular
  letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  s text;
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra pode criar contas';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'e-mail inválido: %', coalesce(email_, '');
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = e) then
    raise exception 'já existe conta com %', e;
  end if;
  n := coalesce(n, split_part(e, '@', 1));
  -- 14 caracteres, com maiúscula, minúscula e número, como o `npm run motoristas -- criar`
  loop
    select string_agg(substr(letras, 1 + ((get_byte(r.b, 2 * i) * 256 + get_byte(r.b, 2 * i + 1)) % length(letras)), 1), '')
      into s
      from (select gen_random_bytes(28) as b) r, generate_series(0, 13) i;
    exit when s ~ '[0-9]' and s ~ '[A-Z]' and s ~ '[a-z]';
  end loop;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
          crypt(s, gen_salt('bf')), now(),
          '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('nome', n), now(), now(),
          '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true), 'email', now(), now(), now());

  return query select uid, n, s;
end $$;

revoke all on function public.criar_motorista(text, text) from public, anon;
grant execute on function public.criar_motorista(text, text) to authenticated;
