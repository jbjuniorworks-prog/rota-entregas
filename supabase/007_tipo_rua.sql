-- Guarda o tipo da via (rua, travessa, avenida…) e o nome alternativo de cada trecho,
-- para não confundir "Travessa Um" com "Rua Um" e para achar rua que mudou de nome.
-- Rodar uma vez em SQL Editor > New query > Run. Depois: npm run ruas -- Aracaju (de novo).

alter table public.ruas add column if not exists tipo text;
alter table public.ruas add column if not exists nome_chave2 text;
create index if not exists ruas_chave2 on public.ruas (nome_chave2) where nome_chave2 is not null;
