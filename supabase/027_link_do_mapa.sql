-- O banco abre o link curto do Maps para o celular (28/10).
--
-- "Tem que usar os dois, a versão curta e a longa" (dono, 28/10). O cliente manda a localização
-- pelo WhatsApp; o motorista abre no Maps e toca em Compartilhar, e o que chega no app é só o nome
-- do lugar e um link maps.app.goo.gl, que não traz a posição. Ela só aparece para onde o link leva,
-- e o celular não consegue ver isso: o navegador não deixa ler o destino de um link de outro site.
-- O banco consegue. Medido em 28/10 com o link que o dono testou no celular: o primeiro salto leva
-- à página do lugar, com a posição exata no endereço (!3d…!4d…); seguindo até o fim, a página traz
-- a mesma posição uma vez, e também um centro de mapa que não é o lugar. Por isso só vale o !3d…!4d.
--
-- Devolve o destino do link quando o servidor responde com o salto; quando a extensão segue o salto
-- sozinha, devolve só o pedaço !3d…!4d… da página final. Quem lê a posição desse texto é o app, com a
-- mesma regra do link longo colado (logica/texto.ts). Sem posição, devolve nulo.
--
-- Só o link curto do Maps, e só para motorista ativo (ou a chave de serviço, para conferir daqui):
-- o banco não sai abrindo endereço qualquer em nome de quem pede. A extensão desiste em 5 segundos.
--
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

create extension if not exists http with schema extensions;

create or replace function public.abrir_link_do_mapa(link text)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  r extensions.http_response;
  destino text;
begin
  if not (public.eh_ativo() or auth.role() = 'service_role') then
    return null;
  end if;
  if link !~ '^https://(maps\.app\.goo\.gl|goo\.gl/maps)/[A-Za-z0-9_-]{1,64}$' then
    return null;
  end if;
  r := extensions.http_get(link);
  select h.value into destino from unnest(r.headers) h where lower(h.field) = 'location' limit 1;
  return coalesce(destino, substring(r.content from '!3d-?[0-9]+\.[0-9]+!4d-?[0-9]+\.[0-9]+'));
end $$;

revoke all on function public.abrir_link_do_mapa(text) from public, anon;
grant execute on function public.abrir_link_do_mapa(text) to authenticated, service_role;

-- ===== Para voltar como era (só se precisar): tire os dois traços do começo de cada linha e rode.
-- O app sem a função só deixa de abrir o link curto e diz para tocar no mapa.
-- drop function if exists public.abrir_link_do_mapa(text);
-- A extensão sozinha não muda nada e pode ficar. Para tirar também: drop extension if exists http;
