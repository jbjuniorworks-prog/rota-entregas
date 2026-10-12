-- Conta criada por fora da aba Admin nasce desativada (12/10).
-- O perfil nascia ativo para toda conta nova, e quem segurava isso era uma opção do painel do
-- Supabase, "Allow new users to sign up", desligada neste projeto. Ligada, qualquer um com a chave
-- pública do app (está no código, e o repositório é público) criava a própria conta e virava
-- motorista ativo: lia as posições confirmadas das entregas e mandava correção de pino. Projeto
-- novo do Supabase vem com ela ligada, e montar projeto novo é o caminho do banco-inteiro.sql.
-- Agora a conta só nasce ativa quando quem a cria é um admin ativo, pela aba Admin: o
-- criar_motorista roda com a sessão dele. Pelo cadastro do Supabase, pelo painel ou pelo
-- `npm run motoristas -- criar` não há sessão de admin, e ela nasce desativada; a ferramenta ativa
-- logo depois, e a criada no painel se ativa no Admin.
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

alter table public.perfis alter column ativo set default false;

create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, ativo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)), public.eh_admin())
  on conflict (id) do nothing;
  return new;
end $$;

revoke all on function public.criar_perfil() from public, anon;
