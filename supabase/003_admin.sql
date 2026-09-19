-- Deixa o administrador apagar a marcação de pino errada de qualquer motorista (tela Admin do app).
-- Rodar uma vez em SQL Editor > New query > Run.

grant delete on public.correcoes to authenticated;

create policy correcoes_admin_apaga on public.correcoes for delete to authenticated
  using (public.eh_admin());
