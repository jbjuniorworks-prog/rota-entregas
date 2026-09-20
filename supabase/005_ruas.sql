-- Nossa cópia das ruas das cidades onde os motoristas trabalham, vinda do OpenStreetMap
-- (dados livres) e melhorada pelas entregas. Cada linha é um trecho de rua.
-- Rodar uma vez em SQL Editor > New query > Run. Depois, no computador: npm run ruas -- Aracaju

create table public.ruas (
  id bigint generated always as identity primary key,
  osm_id bigint unique,
  nome text,
  nome_chave text,
  cidade text not null,
  lat double precision not null,
  lng double precision not null,
  linha jsonb not null,
  fonte text not null default 'osm' check (fonte in ('osm', 'motorista')),
  atualizado_em timestamptz not null default now()
);
create index ruas_chave on public.ruas (nome_chave, cidade);
create index ruas_sem_nome on public.ruas (cidade) where nome_chave is null;

alter table public.ruas enable row level security;
revoke all on public.ruas from anon, authenticated;
grant select on public.ruas to authenticated;

create policy ruas_ver on public.ruas for select to authenticated using (public.eh_ativo());
