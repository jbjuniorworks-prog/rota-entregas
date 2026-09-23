-- Deixa entrar na base de ruas o cadastro de logradouros da prefeitura, sem atropelar o que
-- veio do OpenStreetMap nem o que foi aprendido com as entregas.
-- O OSM identifica cada trecho pelo osm_id; a prefeitura usa um UUID próprio. Guardar esse
-- identificador é o que faz reimportar atualizar, em vez de duplicar a cidade inteira.
-- Rodar uma vez em SQL Editor > New query > Run. Depois, no computador: npm run prefeitura

alter table public.ruas drop constraint if exists ruas_fonte_check;
alter table public.ruas add constraint ruas_fonte_check check (fonte in ('osm', 'motorista', 'entregas', 'prefeitura'));

alter table public.ruas add column if not exists fonte_id text;
create unique index if not exists ruas_fonte_id on public.ruas (fonte, fonte_id) where fonte_id is not null;
