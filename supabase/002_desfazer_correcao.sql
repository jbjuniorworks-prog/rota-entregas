-- Deixa o motorista apagar uma correção de pino que ele mesmo fez nas últimas 24 horas,
-- para o "Desfazer" do app valer também na nuvem.
-- Rodar uma vez em SQL Editor > New query > Run.

grant delete on public.correcoes to authenticated;

create policy correcoes_desfazer on public.correcoes for delete to authenticated
  using (motorista_id = auth.uid() and public.eh_ativo() and criado_em > now() - interval '1 day');
