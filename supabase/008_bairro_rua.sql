-- Guarda o bairro de cada trecho de rua, para não confundir a "Rua B" de um bairro
-- com a "Rua B" de outro. Rodar uma vez em SQL Editor. Depois: npm run ruas -- Aracaju
alter table public.ruas add column if not exists bairro text;
create index if not exists ruas_bairro on public.ruas (bairro) where bairro is not null;
