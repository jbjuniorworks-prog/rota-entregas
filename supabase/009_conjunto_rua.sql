-- Guarda também o conjunto/loteamento/condomínio de cada trecho: é ele que diferencia
-- a "Rua B" de um conjunto da "Rua B" do conjunto ao lado.
-- Rodar uma vez em SQL Editor. Depois: npm run ruas -- Aracaju
alter table public.ruas add column if not exists conjunto text;
create index if not exists ruas_conjunto on public.ruas (conjunto) where conjunto is not null;
