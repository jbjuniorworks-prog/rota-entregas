-- O dia e a hora da evidência quem põe é o banco, e porta verificada só muda com quem administra
-- (07/11). O app nunca manda `dia` nem `criado_em` (servicos/nuvem.ts): os dois vêm do padrão da
-- tabela, o dia em Maceió e a hora em que a marca chega. Mas o banco aceitava os dois vindos de
-- fora, e a contagem das portas e dos lugares usa o dia: um mesmo motorista com dias escolhidos
-- somava passagens. E mesmo com o dia de verdade, dias acumulados pela mesma conta são a mesma
-- fonte repetida, não confirmação de outra pessoa.
--
-- - Gravar: o motorista escreve só as colunas que o app manda. `criado_em`, `dia`,
--   `motorista_id`, `pendente`, `recusada` e `disputa` ficam com o padrão e com o gatilho. Quem
--   manda uma delas recebe erro (42501), em vez de ver o valor trocado sem saber. A chave de
--   serviço (`npm run restaurar`) continua gravando o que o backup tinha.
-- - Disputa: marcação ou passagem nova de quem não administra, a mais de 30 m da porta verificada
--   daquele endereço, nasce pendente e em disputa, de qualquer conta. A até 30 m continua apoiando
--   a porta como antes, e ainda pode mexer nela dentro desses 30 m (limite conhecido). Porta nova,
--   sem nada verificado antes, continua como era.
-- - Na disputa, aprovar não serve: pela contagem, a marca aprovada pode trocar a porta ou não, e o
--   resultado seria da conta, não de quem decidiu. O Admin define a posição como porta (grava a
--   marcação dele, que vence) ou apaga. `decidir_marcas` recusa aprovar enquanto a marca estiver
--   a mais de 30 m da porta verificada.
-- - O que já está gravado não muda: a regra de leitura (`posicoes_com`) é a mesma, e a disputa
--   vale só para o que chegar depois.
--
-- Como toda pendente, a passagem em disputa também sai da âncora do CEP e do nome das ruas.
--
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

alter table public.correcoes add column if not exists disputa boolean not null default false;
alter table public.observacoes add column if not exists disputa boolean not null default false;

-- Tirar o direito de gravar na tabela inteira tira junto o das colunas. Por isso a ordem: primeiro
-- tira, depois devolve coluna por coluna (e rodar de novo dá no mesmo).
revoke insert on public.correcoes, public.observacoes, public.lugares, public.reclamacoes from authenticated;
grant insert (chave_lugar, lat, lng) on public.correcoes to authenticated;
grant insert (chave_lugar, lat, lng, precisao_m, endereco, rua, rua_chave, no_pino) on public.observacoes to authenticated;
grant insert (nome_chave, nome, cidade, lat, lng, endereco) on public.lugares to authenticated;
grant insert (chave_lugar, motivo) on public.reclamacoes to authenticated;

-- A da 022, e a disputa. O lugar com nome não tem porta: fica só com a conferência.
create or replace function public.nasce_pendente() returns trigger
language plpgsql security definer set search_path = public as $$
declare admin boolean; conferir boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  select p.papel = 'admin', p.conferir into admin, conferir from public.perfis p where p.id = new.motorista_id;
  new.pendente := coalesce(conferir and not admin, false);
  -- separado: o `new.chave_lugar` de dentro não existe no lugar com nome
  if tg_table_name in ('correcoes', 'observacoes') and not coalesce(admin, false) then
    if exists (select 1 from public.posicoes_com(array[new.chave_lugar], null) v
                where v.situacao = 'confirmado' and not public.perto(v.lat, v.lng, new.lat, new.lng)) then
      new.pendente := true;
      new.disputa := true;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.nasce_pendente() from public, anon, authenticated;

-- A da 022, e mais três colunas: `disputa` quando a marca dele ainda está a mais de 30 m da porta
-- verificada, e o ponto dela (`marca_*`), que é o que o Admin define como porta. A disputa com
-- marcação aparece sempre: é alguém dizendo que a porta está em outro lugar. A só de passagem
-- aparece quando mudaria a porta, como antes: passagem longe, sozinha, costuma ser o GPS.
drop function if exists public.marcas_em_conferencia();

create function public.marcas_em_conferencia()
returns table (motorista_id uuid, nome text, chave_lugar text, endereco text, criado_em timestamptz,
               lat double precision, lng double precision, situacao text,
               lat_antes double precision, lng_antes double precision, situacao_antes text,
               pino_lat double precision, pino_lng double precision, no_pino boolean,
               disputa boolean, marca_lat double precision, marca_lng double precision)
language plpgsql stable security definer set search_path = public as $$
declare d record;
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra confere as marcações';
  end if;
  for d in
    select x.mid, array_agg(distinct x.chave) as ks
    from (select c.motorista_id as mid, c.chave_lugar as chave from public.correcoes c where c.pendente
          union all
          select o.motorista_id, o.chave_lugar from public.observacoes o where o.pendente) x
    group by x.mid
  loop
    return query
      with com as (select * from public.posicoes_com(d.ks, d.mid)),
           sem as (select * from public.posicoes_com(d.ks, null)),
           briga as (
             select distinct on (b.chave) b.chave, b.lat, b.lng, b.de_correcao
             from (select c.chave_lugar as chave, c.lat, c.lng, c.criado_em, true as de_correcao
                     from public.correcoes c
                    where c.pendente and c.disputa and c.motorista_id = d.mid and c.chave_lugar = any (d.ks)
                   union all
                   select o.chave_lugar, o.lat, o.lng, o.criado_em, false
                     from public.observacoes o
                    where o.pendente and o.disputa and not o.recusada and o.motorista_id = d.mid and o.chave_lugar = any (d.ks)) b
             join sem v on v.chave_lugar = b.chave and v.situacao = 'confirmado' and not public.perto(v.lat, v.lng, b.lat, b.lng)
             order by b.chave, b.de_correcao desc, b.criado_em desc)
      select d.mid, pf.nome, k.chave,
        coalesce(
          (select pa.endereco || coalesce(', ' || nullif(pa.bairro, ''), '') from public.pacotes pa join public.rotas r on r.id = pa.rota_id
            where r.motorista_id = d.mid and pa.chave_lugar = k.chave order by pa.criado_em desc limit 1),
          (select o.endereco from public.observacoes o
            where o.motorista_id = d.mid and o.chave_lugar = k.chave and o.endereco is not null order by o.criado_em desc limit 1),
          k.chave),
        (select max(t.criado_em) from (
          select c.criado_em from public.correcoes c where c.pendente and c.motorista_id = d.mid and c.chave_lugar = k.chave
          union all
          select o.criado_em from public.observacoes o where o.pendente and o.motorista_id = d.mid and o.chave_lugar = k.chave) t),
        com.lat, com.lng, com.situacao, sem.lat, sem.lng, sem.situacao,
        pino.lat, pino.lng,
        not exists (select 1 from public.correcoes c where c.pendente and c.motorista_id = d.mid and c.chave_lugar = k.chave)
          and not exists (select 1 from public.observacoes o
                           where o.pendente and o.motorista_id = d.mid and o.chave_lugar = k.chave and not o.no_pino),
        briga.chave is not null, briga.lat, briga.lng
      from unnest(d.ks) k(chave)
      join public.perfis pf on pf.id = d.mid
      left join com on com.chave_lugar = k.chave
      left join sem on sem.chave_lugar = k.chave
      left join briga on briga.chave = k.chave
      left join lateral (
        select pa.lat, pa.lng from public.pacotes pa join public.rotas r on r.id = pa.rota_id
        where r.motorista_id = d.mid and pa.chave_lugar = k.chave and pa.lat is not null and com.lat is not null
        order by power(pa.lat - com.lat, 2) + power(pa.lng - com.lng, 2) limit 1) pino on true
      where com.chave_lugar is distinct from sem.chave_lugar
         or com.situacao is distinct from sem.situacao
         or not public.perto(com.lat, com.lng, sem.lat, sem.lng, 1)
         or briga.de_correcao;
  end loop;
end $$;

revoke all on function public.marcas_em_conferencia() from public, anon;
grant execute on function public.marcas_em_conferencia() to authenticated;

-- A da 022, e a recusa de aprovar a disputa. Depois que o Admin define a porta no ponto dela, a
-- marca deixa de estar longe e pode ser aprovada como qualquer outra.
drop function if exists public.decidir_marcas(uuid, text[], boolean);

create function public.decidir_marcas(motorista uuid, chaves text[], aprovar boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int;
begin
  if not public.eh_admin() then
    raise exception 'apenas quem administra confere as marcações';
  end if;
  if cardinality(chaves) > 500 then
    raise exception 'no máximo 500 endereços de uma vez';
  end if;
  if aprovar and exists (
    select 1
    from (select c.chave_lugar, c.lat, c.lng from public.correcoes c
           where c.pendente and c.disputa and c.motorista_id = motorista and c.chave_lugar = any (chaves)
          union all
          select o.chave_lugar, o.lat, o.lng from public.observacoes o
           where o.pendente and o.disputa and o.motorista_id = motorista and o.chave_lugar = any (chaves)) b
    join public.posicoes_com(chaves, null) v on v.chave_lugar = b.chave_lugar and v.situacao = 'confirmado'
    where not public.perto(v.lat, v.lng, b.lat, b.lng)) then
    raise exception 'marcação em disputa com uma porta verificada: defina a posição como porta ou apague';
  end if;
  if aprovar then
    update public.lugares l set pendente = false
     where l.pendente and l.motorista_id = motorista and exists (
       select 1 from public.correcoes c where c.pendente and c.motorista_id = motorista and c.chave_lugar = any (chaves) and public.perto(l.lat, l.lng, c.lat, c.lng, 1)
       union all
       select 1 from public.observacoes o where o.pendente and o.motorista_id = motorista and o.chave_lugar = any (chaves) and public.perto(l.lat, l.lng, o.lat, o.lng, 1));
    update public.correcoes set pendente = false where pendente and correcoes.motorista_id = motorista and chave_lugar = any (chaves);
    get diagnostics m = row_count; n := n + m;
    update public.observacoes set pendente = false where pendente and observacoes.motorista_id = motorista and chave_lugar = any (chaves);
    get diagnostics m = row_count; n := n + m;
  else
    delete from public.lugares l
     where l.pendente and l.motorista_id = motorista and exists (
       select 1 from public.correcoes c where c.pendente and c.motorista_id = motorista and c.chave_lugar = any (chaves) and public.perto(l.lat, l.lng, c.lat, c.lng, 1)
       union all
       select 1 from public.observacoes o where o.pendente and o.motorista_id = motorista and o.chave_lugar = any (chaves) and public.perto(l.lat, l.lng, o.lat, o.lng, 1));
    delete from public.correcoes where pendente and correcoes.motorista_id = motorista and chave_lugar = any (chaves);
    get diagnostics m = row_count; n := n + m;
    update public.observacoes set pendente = false, recusada = true where pendente and observacoes.motorista_id = motorista and chave_lugar = any (chaves);
    get diagnostics m = row_count; n := n + m;
  end if;
  return n;
end $$;

revoke all on function public.decidir_marcas(uuid, text[], boolean) from public, anon;
grant execute on function public.decidir_marcas(uuid, text[], boolean) to authenticated;

-- ===== Para voltar como era (só se precisar): tire os dois traços do começo de cada linha e rode,
-- e depois rode de novo, da 022, o trecho do `nasce_pendente`, da `marcas_em_conferencia` e da
-- `decidir_marcas`. As colunas `disputa` podem ficar: sem o gatilho, nascem falsas.
-- grant insert on public.correcoes, public.observacoes, public.lugares, public.reclamacoes to authenticated;
