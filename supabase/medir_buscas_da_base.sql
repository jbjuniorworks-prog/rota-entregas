-- NÃO É MIGRAÇÃO: é a medição das buscas do celular na base de ruas, para rodar antes e depois da
-- 025 com a mesma consulta (20/10). Fica fora do 000_rodar_tudo.sql e do banco-inteiro.sql.
-- Só lê. As buscas são as do `servicos/base.ts`, rodadas como o app (papel authenticated, com o id
-- de quem está logado), cada uma com um termo que acha e um que não acha. Como o app, e não como
-- postgres: o postgres não passa pela regra de acesso, e sem ela o índice de trigramas aparece
-- usado numa busca em que, para o celular, ele não é (ABERTO.md, "Regras de acesso (024)").
-- Quando as funções da 025 existem, mede também elas, e o plano de dentro de cada uma.
-- A função é temporária (pg_temp): some quando a conexão fecha. Trocar o id na última linha e
-- rodar tudo de uma vez.
create or replace function pg_temp.medir_base(quem uuid) returns setof text language plpgsql as $f$
declare
  -- os padrões com acento são os que o comAcento do base.ts monta
  direto text[][] := array[
    ['rua por parte do nome, que acha',
     $q$select nome, tipo, bairro, conjunto, cidade, lat, lng, linha from public.ruas where nome_chave ilike '%teixeira%' and cidade ilike 'aracaju' limit 80$q$],
    ['rua por parte do nome, que não acha',
     $q$select nome, tipo, bairro, conjunto, cidade, lat, lng, linha from public.ruas where nome_chave ilike '%vochoo%' and cidade ilike 'aracaju' limit 80$q$],
    ['é bairro?, que acha',
     $q$select bairro from public.ruas where bairro ~* '^j[aáàâã]rd[iíì]ns$' limit 1$q$],
    ['é bairro?, que não acha (o caso de todo condomínio)',
     $q$select bairro from public.ruas where bairro ~* '^v[oóòôõ][cç]h[oóòôõ][oóòôõ]$' limit 1$q$],
    ['conjunto parecido, que acha',
     $q$select conjunto, lat, lng from public.ruas where conjunto ~* '[aáàâã][uúù]g[uúù]st[oóòôõ]' and cidade ilike 'aracaju' limit 200$q$],
    ['conjunto parecido, que não acha',
     $q$select conjunto, lat, lng from public.ruas where conjunto ~* 'v[oóòôõ][cç]h[oóòôõ][oóòôõ]' and cidade ilike 'aracaju' limit 200$q$],
    ['controle: rua pela chave, a de todo endereço',
     $q$select nome, tipo, bairro, conjunto, cidade, lat, lng, linha from public.ruas where nome_chave = 'oviedo teixeira' or nome_chave2 = 'oviedo teixeira' limit 80$q$]];
  -- as mesmas buscas pelas funções da 025: nome, argumentos
  funcoes text[][] := array[
    ['ruas_por_parte_do_nome', $a$'teixeira', 'aracaju'$a$],
    ['ruas_por_parte_do_nome', $a$'vochoo', 'aracaju'$a$],
    ['bairro_na_base', $a$'^j[aáàâã]rd[iíì]ns$'$a$],
    ['bairro_na_base', $a$'^v[oóòôõ][cç]h[oóòôõ][oóòôõ]$'$a$],
    ['conjuntos_na_base', $a$'[aáàâã][uúù]g[uúù]st[oóòôõ]', 'aracaju'$a$],
    ['conjuntos_na_base', $a$'v[oóòôõ][cç]h[oóòôõ][oóòôõ]', 'aracaju'$a$]];
  i int;
  f record;
  linha text;
  padrao text;
begin
  -- O conjunto que acha sai da própria base (o "augusto" fixo não achou nada na produção, 20/10):
  -- a palavra mais comprida do conjunto mais comum de Aracaju, sem o tipo, com os acentos que o
  -- comAcento põe.
  select replace(replace(replace(replace(replace(replace(x.w, 'a', '[aáàâã]'), 'e', '[eéèê]'), 'i', '[iíì]'),
           'o', '[oóòôõ]'), 'u', '[uúù]'), 'c', '[cç]') into padrao
  from (select conjunto from public.ruas where conjunto is not null and cidade ilike 'aracaju'
        group by conjunto order by count(*) desc, conjunto limit 1) c,
  lateral (select w from regexp_split_to_table(translate(lower(c.conjunto), 'áàâãéèêíìóòôõúùç', 'aaaaeeeiioooouuc'), '[^a-z0-9]+') w
           where length(w) >= 5 and w not in ('conjunto', 'residencial', 'loteamento', 'condominio', 'jardim', 'parque', 'quadra')
           order by length(w) desc, w limit 1) x;
  if padrao is not null then
    direto := direto || array[['conjunto parecido, que acha (termo tirado da base)',
      format($q$select conjunto, lat, lng from public.ruas where conjunto ~* %L and cidade ilike 'aracaju' limit 200$q$, padrao)]];
    funcoes := funcoes || array[['conjuntos_na_base', format('%L, %L', padrao, 'aracaju')]];
  end if;

  return next 'versão: ' || version();
  return next (select format('banco: ordenação %s, letras %s', datcollate, datctype) from pg_database where datname = current_database());
  return next 'pg_trgm: ' || coalesce(
    (select format('instalada, versão %s, no esquema %s', e.extversion, n.nspname)
     from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm'),
    'não instalada; disponível: ' || coalesce((select default_version from pg_available_extensions where name = 'pg_trgm'), 'não'));
  return next format('ruas: %s trechos, tabela %s, índices %s', (select count(*) from public.ruas),
    pg_size_pretty(pg_table_size('public.ruas')), pg_size_pretty(pg_indexes_size('public.ruas')));
  for linha in select '  índice ' || indexname || ': ' || regexp_replace(indexdef, '^.* USING ', '')
               from pg_indexes where schemaname = 'public' and tablename = 'ruas' order by indexname loop
    return next linha;
  end loop;

  -- o plano de dentro de cada função da 025. Uma função security definer roda como o dono, e a
  -- de linguagem sql planeja sem olhar o valor dos argumentos: o mesmo que preparar o corpo dela
  -- com plano genérico, como o dono. O id vai junto para o eh_ativo() de dentro valer.
  perform set_config('request.jwt.claims', json_build_object('sub', quem, 'role', 'authenticated')::text, true);
  perform set_config('plan_cache_mode', 'force_generic_plan', true);
  for i in 1 .. array_length(funcoes, 1) loop
    select p.oid, p.prosecdef, pg_get_userbyid(p.proowner) dono, oidvectortypes(p.proargtypes) tipos,
           regexp_replace(p.prosrc, ';\s*$', '') corpo
      into f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = funcoes[i][1];
    if f.oid is null then
      if i = 1 then return next '(funções da 025 ainda não existem)'; end if;
      continue;
    end if;
    return next format('===== %s(%s), por dentro, como %s (security definer: %s)', funcoes[i][1], funcoes[i][2],
      f.dono, case when f.prosecdef then 'sim' else 'não; roda como quem chama, veja a chamada como o app' end);
    if not f.prosecdef then continue; end if;
    if f.dono <> current_user then return next format('(atenção: isto roda como %s, não como o dono)', current_user); end if;
    if exists (select 1 from pg_prepared_statements where name = 'medir_base') then execute 'deallocate medir_base'; end if;
    execute format('prepare medir_base(%s) as %s', f.tipos, f.corpo);
    for linha in execute format('explain (analyze, buffers) execute medir_base(%s)', funcoes[i][2]) loop
      return next linha;
    end loop;
    execute 'deallocate medir_base';
  end loop;
  perform set_config('plan_cache_mode', 'auto', true);

  -- daqui em diante, como o app: o mesmo papel e o mesmo id que a requisição leva
  perform set_config('role', 'authenticated', true);
  return next format('rodando como: %s, auth.uid() = %s, ativo: %s', current_user, auth.uid(), public.eh_ativo());
  for i in 1 .. array_length(direto, 1) loop
    return next '===== direto na tabela, como o app faz hoje: ' || direto[i][1];
    for linha in execute 'explain (analyze, buffers) ' || direto[i][2] loop
      return next linha;
    end loop;
  end loop;
  for i in 1 .. array_length(funcoes, 1) loop
    if to_regproc('public.' || funcoes[i][1]) is null then continue; end if;
    return next format('===== pela função, como o app: %s(%s)', funcoes[i][1], funcoes[i][2]);
    for linha in execute format('explain (analyze, buffers) select * from public.%I(%s)', funcoes[i][1], funcoes[i][2]) loop
      return next linha;
    end loop;
  end loop;
end $f$;

select * from pg_temp.medir_base('COLE-AQUI-O-ID-DO-ADMIN');
