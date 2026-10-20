-- O registro de cada busca de lista, só com contagens e tempos, para saber onde vai o minuto (20/10).
--
-- RASCUNHO, não rodada na produção.
--
-- Uma lista de 60 paradas leva mais de um minuto para ser localizada, e nada guardado hoje diz
-- onde vai esse tempo. `pacotes.fonte` não serve: só a planilha cria pacote, e a lista que demora
-- é a de print, gravação ou colada, que não cria; e ele guarda a origem final da posição, que
-- esconde o caminho (ABERTO.md, "O minuto de localizar a lista"). Esta tabela não depende de rota
-- nem de pacote: uma linha por vez que o app busca as paradas sem posição de uma lista.
--
-- Sem nada de lugar nem de pessoa além de quem buscou: nenhum endereço, CEP, rua, bairro,
-- condomínio, coordenada ou texto da lista, e nenhum campo livre. Só números com limite e a origem
-- da lista numa lista fechada, para não caber outra coisa.
--
-- Quem pode: o motorista ativo grava e lê só os registros dele; quem administra lê todos; ninguém
-- muda nem apaga. Ler os dele é o que deixa a fila reenviar sem erro: com a regra de acesso, o
-- "se já existe, ignora" do Postgres só vale para quem enxerga a linha que já existe (sem isso o
-- reenvio era recusado, conferido num Postgres local). O registro some sozinho depois de 90 dias. Cada motorista
-- grava no máximo 50 por dia, e o que passar é ignorado sem erro: o limite é contra um defeito que
-- grave em laço, não contra uso, e o esperado é de 1 a 5 por dia. As duas coisas ficam num gatilho
-- porque a regra de acesso não conta o que o motorista não pode ler, e o banco não tem agendador.
--
-- O id vem do app, sem valor padrão: a fila entrega pelo menos uma vez, e o registro que ela
-- reenviar depois de uma falha de rede tem de bater no mesmo id e não entrar de novo.
--
-- O app ainda não grava nada aqui; a mudança dele vem depois, publicada à parte.
-- Para voltar: o bloco comentado no fim.
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

create table if not exists public.buscas_de_lista (
  id uuid primary key,
  motorista_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  -- de onde veio a lista; 'mista' é mais de uma de uma vez, e 'de_novo' é buscar outra vez as que
  -- ficaram sem posição (o botão em Conferir, ou os nomes que o censo corrigiu ao abrir o app)
  origem text not null check (origem in ('planilha', 'print', 'gravacao', 'colada', 'mista', 'de_novo')),
  -- a hora do aparelho: a fila pode entregar horas depois, justamente quando não há sinal
  buscado_em timestamptz not null,
  versao text not null check (length(versao) between 1 and 40),
  paradas int not null,
  pendentes int not null,
  tempo_ms int not null,
  -- a espera é a vez na fila do Nominatim (1,1 s entre chamadas); o resto é a chamada em si
  nominatim_chamadas int not null default 0,
  nominatim_espera_ms int not null default 0,
  nominatim_ms int not null default 0,
  cep_chamadas int not null default 0,
  cep_ms int not null default 0,
  censo_ms int not null default 0,
  banco_chamadas int not null default 0,
  banco_ms int not null default 0,
  -- As pendentes cuja porta a nuvem já conhecia (verificada, ou arrumada pelo próprio motorista):
  -- hoje elas passam pela busca inteira e no fim a porta conhecida passa por cima. Quanto tempo e
  -- quantas chamadas ao Nominatim isso custou, e em quantas a busca achou outro lugar, a 30 m ou
  -- mais: essa é a "posição de antes" que fica em Conferir, e o que se perderia pulando a busca.
  conhecidas int not null default 0,
  conhecidas_ms int not null default 0,
  conhecidas_nominatim int not null default 0,
  conhecidas_longe int not null default 0,
  -- onde cada pendente terminou, depois das portas da nuvem; a soma é `pendentes`
  terminou_memoria int not null default 0,
  terminou_censo int not null default 0,
  terminou_base int not null default 0,
  terminou_cep int not null default 0,
  terminou_nominatim int not null default 0,
  terminou_conhecida int not null default 0,
  terminou_sem_posicao int not null default 0,
  terminou_outras int not null default 0,
  criado_em timestamptz not null default now(),
  check (least(paradas, pendentes, nominatim_chamadas, cep_chamadas, banco_chamadas, conhecidas,
    conhecidas_nominatim, conhecidas_longe, terminou_memoria, terminou_censo, terminou_base, terminou_cep,
    terminou_nominatim, terminou_conhecida, terminou_sem_posicao, terminou_outras) >= 0
    and greatest(paradas, pendentes, nominatim_chamadas, cep_chamadas, banco_chamadas, conhecidas,
    conhecidas_nominatim, conhecidas_longe, terminou_memoria, terminou_censo, terminou_base, terminou_cep,
    terminou_nominatim, terminou_conhecida, terminou_sem_posicao, terminou_outras) <= 5000),
  -- até um dia, em milissegundos
  check (least(tempo_ms, nominatim_espera_ms, nominatim_ms, cep_ms, censo_ms, banco_ms, conhecidas_ms) >= 0
    and greatest(tempo_ms, nominatim_espera_ms, nominatim_ms, cep_ms, censo_ms, banco_ms, conhecidas_ms) <= 86400000)
);
create index if not exists buscas_de_lista_quando on public.buscas_de_lista (criado_em desc);

create or replace function public.buscas_de_lista_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.buscas_de_lista b
      where b.motorista_id = new.motorista_id and b.criado_em > now() - interval '1 day') >= 50 then
    return null;
  end if;
  delete from public.buscas_de_lista b where b.criado_em < now() - interval '90 days';
  return new;
end $$;
revoke all on function public.buscas_de_lista_antes() from public, anon, authenticated;

drop trigger if exists buscas_de_lista_antes on public.buscas_de_lista;
create trigger buscas_de_lista_antes before insert on public.buscas_de_lista
  for each row execute function public.buscas_de_lista_antes();

alter table public.buscas_de_lista enable row level security;
-- o Supabase dá tudo ao anon e ao authenticated em tabela nova; aqui fica só gravar e ler
revoke all on public.buscas_de_lista from anon, authenticated;
grant insert, select on public.buscas_de_lista to authenticated;

drop policy if exists buscas_gravar on public.buscas_de_lista;
create policy buscas_gravar on public.buscas_de_lista for insert to authenticated
  with check (motorista_id = (select auth.uid()) and (select public.eh_ativo()));
drop policy if exists buscas_ver on public.buscas_de_lista;
create policy buscas_ver on public.buscas_de_lista for select to authenticated
  using ((motorista_id = (select auth.uid()) and (select public.eh_ativo())) or (select public.eh_admin()));

-- ===== Para voltar como era (só se precisar): tire os dois traços do começo de cada linha e rode.
-- Antes, publique o app sem o envio, se ele já estiver gravando aqui.
-- drop table if exists public.buscas_de_lista;
-- drop function if exists public.buscas_de_lista_antes();
