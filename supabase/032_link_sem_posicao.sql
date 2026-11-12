-- O link do cliente que não traz a posição (12/11).
--
-- O cliente manda a localização pelo WhatsApp; o motorista abre no Maps, compartilha, e o link curto
-- (maps.app.goo.gl) de muitos lugares (endereço de casa, conjunto habitacional) leva só ao endereço e
-- ao código do lugar no Google (!1s0x…:0x…), sem a posição. A 027 devolvia isso, e o app dizia "Esse
-- link do Maps não traz a posição". O Luan colou dois desses no mesmo dia.
--
-- A página "embutida" do Google, aberta pelo número desse lugar, traz a posição colada ao código e ao
-- endereço: [["0x…:0x…","<endereço>",[lat,lng]. O centro do mapa é outro registro da página e não é
-- lido. Esta versão da abrir_link_do_mapa, quando o destino do link curto não traz !3d…!4d…, abre essa
-- página e devolve a posição como !3d<lat>!4d<lng>, que o app já lê: o app não muda, e ela vale como
-- qualquer posição de link colado (decisão do dono, 12/11).
--
-- É a posição que o Google tem do LUGAR. Medida em 12/11 contra marcas de GPS de entrega: 15 m num
-- caso e 128 m noutro. A porta continua vindo do "Entreguei aqui".
--
-- Testada num Postgres local (supabase/postgres 17.11, extensão http 1.6): 21 testes, com sabotagens.
-- - O primeiro pedido é o da 027, sem mudar. Lá a extensão seguiu o salto do link curto e devolveu
--   junto o cabeçalho Location do primeiro salto; o registro de 28/10 diz que a de produção não segue.
--   A função lê o primeiro Location nos dois casos.
-- - O pedido novo vai a um endereço FIXO do Google, montado só com dígitos (o número do lugar,
--   convertido do hexadecimal): nada do que o motorista manda entra nele. E só sai se o destino do
--   link curto for do próprio Google Maps.
-- - Tempo: 3 s no pedido novo. Nesta extensão, set_config('http.curlopt_timeout_ms', …) não tem efeito;
--   http_set_curlopt tem, mas vale para a sessão inteira, e a conexão do banco é reaproveitada entre
--   pedidos: a saída é uma só e sempre limpa o ajuste (sem isso, o limite vazava para os pedidos
--   seguintes e quebrava links que hoje abrem). A extensão não limita o tamanho da resposta antes de
--   lê-la; a página embutida tem ~3 KB, e acima de 64 KB ela é descartada.
-- - Falha (tempo, rede, página fora ou mudada, sem a posição): devolve o que a 027 devolve hoje, e o
--   app mostra o aviso de link sem posição. Nada é gravado por esta função.
--
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

-- O número do lugar em decimal, a partir do hexadecimal do código (até 16 dígitos, até 2^64).
create or replace function public.numero_do_lugar(hex text) returns text
language plpgsql immutable set search_path = public as $$
declare
  v numeric := 0;
  c text;
begin
  if hex is null or hex !~ '^[0-9a-f]{1,16}$' then
    return null;
  end if;
  foreach c in array regexp_split_to_array(hex, '') loop
    v := v * 16 + (position(c in '0123456789abcdef') - 1);
  end loop;
  return v::text;
end $$;

-- A posição colada ao código do lugar na página embutida, já no formato que o app lê. Só o registro
-- do próprio lugar: o centro do mapa e outros lugares da página não contam.
create or replace function public.posicao_da_embutida(pagina text, codigo text) returns text
language plpgsql immutable set search_path = public as $$
declare
  m text[];
begin
  if pagina is null or codigo is null or codigo !~ '^0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16}$' or length(pagina) > 65536 then
    return null;
  end if;
  m := regexp_match(pagina, '\[\["' || codigo || '","(?:[^"\\]|\\.)*",\[(-?[0-9]{1,2}\.[0-9]{4,}),(-?[0-9]{1,3}\.[0-9]{4,})\]');
  if m is null then
    return null;
  end if;
  return '!3d' || m[1] || '!4d' || m[2];
end $$;

revoke all on function public.numero_do_lugar(text), public.posicao_da_embutida(text, text) from public, anon, authenticated;

-- Os dois pedidos. Chamada só pela abrir_link_do_mapa, que confere quem pede e o link antes.
create or replace function public.seguir_link_do_mapa(link text)
returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  r extensions.http_response;
  destino text;
  codigo text[];
begin
  r := extensions.http_get(link);
  select h.value into destino from unnest(r.headers) h where lower(h.field) = 'location' limit 1;
  if destino is null then
    return substring(r.content from '!3d-?[0-9]+\.[0-9]+!4d-?[0-9]+\.[0-9]+');
  end if;
  -- o destino já traz a posição (o lugar de comércio), ou não é do Google Maps: como era
  if destino ~ '!3d-?[0-9]+\.[0-9]+!4d-?[0-9]+\.[0-9]+' or destino !~ '^https://www\.google\.com/maps/' then
    return destino;
  end if;
  codigo := regexp_match(destino, '!1s(0x[0-9a-f]{1,16}:0x([0-9a-f]{1,16}))(?![0-9a-f])');
  if codigo is null then
    return destino;
  end if;
  -- só o pedido novo tem o limite de 3 s; o primeiro fica como a 027 faz hoje
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '3000');
  begin
    r := extensions.http_get('https://www.google.com/maps/embed?origin=mfe&pb=!1m3!3m2!1m1!4s' || public.numero_do_lugar(codigo[2]));
  exception when others then
    return destino;
  end;
  if r.status <> 200 then
    return destino;
  end if;
  return coalesce(public.posicao_da_embutida(r.content, codigo[1]), destino);
end $$;

revoke all on function public.seguir_link_do_mapa(text) from public, anon, authenticated;

-- Quem pede e o link são conferidos aqui. O limite de 3 s, ligado só antes do pedido à página
-- embutida, é limpo na saída, por qualquer caminho.
create or replace function public.abrir_link_do_mapa(link text)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  resultado text;
begin
  if not (public.eh_ativo() or auth.role() = 'service_role') then
    return null;
  end if;
  if link !~ '^https://(maps\.app\.goo\.gl|goo\.gl/maps)/[A-Za-z0-9_-]{1,64}$' then
    return null;
  end if;
  begin
    resultado := public.seguir_link_do_mapa(link);
  exception when others then
    resultado := null;
  end;
  perform extensions.http_reset_curlopt();
  return resultado;
end $$;

revoke all on function public.abrir_link_do_mapa(text) from public, anon;
grant execute on function public.abrir_link_do_mapa(text) to authenticated, service_role;

-- ===== Para voltar como era (só se precisar): rode de novo o 027_link_do_mapa.sql e depois tire os
-- dois traços da linha abaixo e rode.
-- drop function if exists public.seguir_link_do_mapa(text), public.numero_do_lugar(text), public.posicao_da_embutida(text, text);
