-- NÃO É MIGRAÇÃO: é a medição das regras de acesso no caminho do Admin, para rodar antes e depois
-- da 024 com a mesma consulta (20/10). Fica fora do 000_rodar_tudo.sql e do banco-inteiro.sql.
-- Medição das regras de acesso no caminho do Admin. Só lê: as consultas são as do Admin, rodadas
-- como o admin (papel authenticated, com o id dele), e a função é temporária (pg_temp): some quando
-- a conexão fecha e ninguém mais a vê. Trocar o id na última linha e rodar tudo de uma vez.
create or replace function pg_temp.medir_admin(admin uuid) returns setof text language plpgsql as $f$
declare
  consultas text[][] := array[
    ['contagem das rotas de 14 dias (a chamada que o Admin faz)',
     $q$select * from public.contagem_das_rotas(array(select id from public.rotas where dia >= current_date - 14))$q$],
    ['contagem das rotas de 14 dias (por dentro)',
     $q$select i.id, count(p.id), count(p.entregue_em) from unnest(array(select id from public.rotas where dia >= current_date - 14)) i(id) left join public.pacotes p on p.rota_id = i.id group by i.id$q$],
    ['rotas de 14 dias com o motorista',
     $q$select r.id, r.dia, r.arquivo, r.criado_em, r.motorista_id, p.nome, p.papel from public.rotas r left join public.perfis p on p.id = r.motorista_id where r.dia >= current_date - 14 order by r.dia desc, r.criado_em desc, r.id limit 1000$q$],
    ['pacotes do último dia com rota (o painel do dia)',
     $q$select rota_id, chave_lugar, endereco, bairro, lat, lng, entregue_em from public.pacotes where rota_id = any(array(select id from public.rotas where dia = (select max(dia) from public.rotas))) order by id limit 1000$q$],
    ['marcações da semana com o motorista',
     $q$select c.*, p.nome, p.papel from public.correcoes c left join public.perfis p on p.id = c.motorista_id where c.criado_em >= now() - interval '7 days' order by c.id limit 1000$q$],
    ['busca de rua na base (como no celular)',
     $q$select nome, nome_chave, cidade, lat, lng from public.ruas where nome_chave ilike '%teixeira%' and cidade ilike 'aracaju' limit 80$q$]];
  i int;
  linha text;
begin
  return next 'versão: ' || version();
  return next format('linhas: rotas %s, pacotes %s, correcoes %s, observacoes %s, ruas %s, perfis %s',
    (select count(*) from public.rotas), (select count(*) from public.pacotes), (select count(*) from public.correcoes),
    (select count(*) from public.observacoes), (select count(*) from public.ruas), (select count(*) from public.perfis));
  -- 23 antes da 024, 0 depois: o que sobra chamado fora de um select
  return next 'regras com função solta: ' || (select count(*) from pg_policies where schemaname = 'public'
    and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'select\s+(public\.)?(eh_admin|eh_ativo|auth\.uid)\(\)', '', 'gi')
      ~* '(eh_admin|eh_ativo|auth\.uid)\(\)');
  -- daqui em diante, como o admin pelo app: o mesmo papel e o mesmo id que a requisição leva
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  return next format('rodando como: %s, auth.uid() = %s, admin: %s', current_user, auth.uid(), public.eh_admin());
  for i in 1 .. array_length(consultas, 1) loop
    return next '===== ' || consultas[i][1];
    for linha in execute 'explain (analyze, buffers) ' || consultas[i][2] loop
      return next linha;
    end loop;
  end loop;
end $f$;

select * from pg_temp.medir_admin('COLE-AQUI-O-ID-DO-ADMIN');
