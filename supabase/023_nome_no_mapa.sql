-- O nome da rua no mapa (17/10). O mapa do app é o OpenStreetMap, que no Robalo tem o traçado de
-- quase todas as ruas, mas com nome de projeto do loteamento: a Professora Albertina Bezerra
-- Ribeiro da planilha e da prefeitura lá é "Rua B". Na cidade, 10% das portas entregues ficam numa
-- rua que o mapa mostra com outro nome ou sem nenhum.
-- Esta coluna diz, para cada trecho da prefeitura (e para os que os motoristas nomearam), como ele
-- está no mapa: 'com_nome' (o mapa já mostra este nome ali), 'sem_nome' (o mapa desenha a rua, com
-- outro nome ou nenhum) ou 'fora' (o mapa não tem o trecho). O celular busca só os das ruas das
-- entregas do dia, e escreve o nome ou desenha o trecho.
-- Quem preenche é `npm run nomes-no-mapa -- gravar`, no computador, com o mapa inteiro: buscando o
-- mapa em volta das entregas, as rodovias, que vão a 7 km do ponto guardado, ficavam de fora.
-- Rodar uma vez em SQL Editor > New query > Run. Depois, no computador: npm run nomes-no-mapa -- gravar

alter table public.ruas add column if not exists no_mapa text;
alter table public.ruas drop constraint if exists ruas_no_mapa_check;
alter table public.ruas add constraint ruas_no_mapa_check check (no_mapa in ('com_nome', 'sem_nome', 'fora'));
create index if not exists ruas_no_mapa on public.ruas (nome_chave) where no_mapa in ('sem_nome', 'fora');
