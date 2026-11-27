-- Comentário no pino (dono, 26/11: "opção de comentário no pino, tipo casa da filha, número da
-- casa ao lado é 500"). O que quem já foi lá sabe e a planilha não diz, para o próximo motorista.
--
-- A 018 decidiu que "texto livre sobre cliente é o tipo de coisa que não se guarda". Aqui o dono
-- escolheu um texto curto sobre o LUGAR: até 120 letras, e o banco recusa o que parece telefone
-- (8 dígitos ou mais seguidos, com espaço, ponto, traço ou parênteses no meio). O app avisa antes,
-- mas quem decide é o banco.
--
-- Como o "cliente xarope" (018) e o pino comercial (031): por endereço (a chave do cliente, com o
-- apartamento num condomínio), um comentário por motorista, que ele troca ou apaga; o admin apaga
-- qualquer um. Os outros motoristas recebem o texto e a data, sem o nome de quem escreveu.
-- Quem escreveu e quando o banco põe sozinho.
--
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

create table if not exists public.comentarios (
  id bigint generated always as identity primary key,
  chave_lugar text not null check (length(chave_lugar) between 3 and 300),
  texto text not null check (char_length(texto) between 1 and 120 and texto !~ '([0-9][ .()-]*){8,}'),
  motorista_id uuid not null default auth.uid() references public.perfis (id),
  criado_em timestamptz not null default now()
);
-- um por motorista e endereço: escrever de novo troca o texto, e a fila do celular, que entrega
-- pelo menos uma vez, não vira dois
create unique index if not exists comentarios_um on public.comentarios (chave_lugar, motorista_id);

alter table public.comentarios enable row level security;
-- Ninguém lê nem escreve a tabela direto: só pelas funções abaixo, que checam quem é.
revoke all on public.comentarios from anon, authenticated;

-- Escrever, trocar ou apagar (texto vazio) o comentário de quem chama.
create or replace function public.comentar(chave text, texto_ text)
returns void
language plpgsql security definer set search_path = public as $$
declare t text := trim(coalesce(texto_, ''));
begin
  if not public.eh_ativo() then
    raise exception 'conta desativada';
  end if;
  if t = '' then
    delete from public.comentarios c where c.chave_lugar = chave and c.motorista_id = auth.uid();
    return;
  end if;
  insert into public.comentarios (chave_lugar, texto, motorista_id) values (chave, t, auth.uid())
  on conflict (chave_lugar, motorista_id) do update set texto = excluded.texto, criado_em = now();
end $$;

revoke all on function public.comentar(text, text) from public, anon;
grant execute on function public.comentar(text, text) to authenticated;

-- Quem administra apaga o de qualquer motorista, pelo id que a leitura devolve.
create or replace function public.apagar_comentario(id_ bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra apaga o comentário de outro motorista';
  end if;
  delete from public.comentarios c where c.id = id_;
end $$;

revoke all on function public.apagar_comentario(bigint) from public, anon;
grant execute on function public.apagar_comentario(bigint) to authenticated;

-- O que cada motorista recebe ao carregar a rota: de motoristas ativos, sem o nome de quem escreveu.
create or replace function public.comentarios_dos_lugares(chaves text[])
returns table (id bigint, chave_lugar text, texto text, quando timestamptz, minha boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.chave_lugar, c.texto, c.criado_em, c.motorista_id = auth.uid()
  from public.comentarios c
  join public.perfis p on p.id = c.motorista_id and p.ativo
  where c.chave_lugar = any (chaves) and public.eh_ativo() and cardinality(chaves) <= 500
  order by c.criado_em desc;
$$;

revoke all on function public.comentarios_dos_lugares(text[]) from public, anon;
grant execute on function public.comentarios_dos_lugares(text[]) to authenticated;

-- ===== Para voltar como era (só se precisar): tire os dois traços do começo de cada linha e rode.
-- Apaga os comentários junto.
-- drop function if exists public.comentarios_dos_lugares(text[]);
-- drop function if exists public.apagar_comentario(bigint);
-- drop function if exists public.comentar(text, text);
-- drop table if exists public.comentarios;
