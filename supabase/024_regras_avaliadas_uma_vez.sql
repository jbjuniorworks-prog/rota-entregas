-- As regras de acesso avaliadas uma vez por consulta, e não uma vez por linha (20/10).
--
-- Rodada na produção em 20/10, entre duas medições com a mesma consulta
-- (`supabase/medir_regras_do_admin.sql`; os números no ABERTO.md, "Regras de acesso (024)").
--
-- As 23 regras chamam `eh_admin()`, `eh_ativo()` e `auth.uid()` soltas. Elas não dependem da
-- linha, mas solta o Postgres pode chamá-las de novo a cada linha que confere. Dentro de um
-- `(select …)` viram uma subconsulta sem nada da linha, que ele calcula uma vez por consulta e
-- reaproveita: é o que o Supabase recomenda (aviso `auth_rls_initplan` do Advisor). A hipótese é
-- que é isso que pesa no Admin, que confere milhares de pacotes de uma vez, e na busca de rua de
-- todo motorista, que confere a base de ruas inteira contra `eh_ativo()`.
--
-- Nenhuma regra muda: mesmos nomes, mesmos comandos, mesmos papéis, a mesma conta. Só a forma de
-- avaliar. `alter policy` troca a expressão sem apagar a regra, então não há instante sem ela.
-- Conferido num Postgres local com o banco-inteiro.sql: o que cada perfil (admin, motorista,
-- outro motorista, motorista desativado) vê em cada tabela e o que consegue gravar, apagar e
-- mudar saiu igual antes e depois.
--
-- Para voltar: o bloco comentado no fim põe cada regra de volta como era.
-- Rodar uma vez em SQL Editor > New query > Run. Pode rodar de novo sem medo.

alter policy correcoes_admin_apaga on public.correcoes
  using ((select public.eh_admin()));
alter policy correcoes_criar on public.correcoes
  with check (motorista_id = (select auth.uid()) and (select public.eh_ativo()));
alter policy correcoes_desfazer on public.correcoes
  using (motorista_id = (select auth.uid()) and (select public.eh_ativo()) and criado_em > now() - interval '1 day');
alter policy correcoes_ver on public.correcoes
  using ((motorista_id = (select auth.uid()) and (select public.eh_ativo())) or (select public.eh_admin()));

alter policy lugares_criar on public.lugares
  with check (motorista_id = (select auth.uid()) and (select public.eh_ativo()));
alter policy lugares_ver on public.lugares
  using ((motorista_id = (select auth.uid()) and (select public.eh_ativo())) or (select public.eh_admin()));

alter policy observacoes_criar on public.observacoes
  with check (motorista_id = (select auth.uid()) and (select public.eh_ativo()));
alter policy observacoes_ver on public.observacoes
  using ((motorista_id = (select auth.uid()) and (select public.eh_ativo())) or (select public.eh_admin()));

alter policy pacotes_criar on public.pacotes
  with check ((select public.eh_ativo()) and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = (select auth.uid())));
alter policy pacotes_marcar on public.pacotes
  using ((select public.eh_ativo()) and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = (select auth.uid())))
  with check ((select public.eh_ativo()) and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = (select auth.uid())));
alter policy pacotes_ver on public.pacotes
  using ((select public.eh_admin()) or ((select public.eh_ativo()) and exists (
    select 1 from public.rotas r where r.id = rota_id and r.motorista_id = (select auth.uid()))));

alter policy perfis_admin_edita on public.perfis
  using ((select public.eh_admin())) with check ((select public.eh_admin()));
alter policy perfis_ver on public.perfis
  using (id = (select auth.uid()) or (select public.eh_admin()));

alter policy reclamacoes_criar on public.reclamacoes
  with check (motorista_id = (select auth.uid()) and (select public.eh_ativo()));
alter policy reclamacoes_tirar on public.reclamacoes
  using ((motorista_id = (select auth.uid()) and (select public.eh_ativo())) or (select public.eh_admin()));
alter policy reclamacoes_ver on public.reclamacoes
  using ((motorista_id = (select auth.uid()) and (select public.eh_ativo())) or (select public.eh_admin()));

alter policy rotas_admin_apaga on public.rotas
  using ((select public.eh_admin()));
alter policy rotas_criar on public.rotas
  with check (motorista_id = (select auth.uid()) and (select public.eh_ativo()));
alter policy rotas_ver on public.rotas
  using ((motorista_id = (select auth.uid()) and (select public.eh_ativo())) or (select public.eh_admin()));

alter policy ruas_ver on public.ruas
  using ((select public.eh_ativo()));

alter policy uso_atualizar on public.uso_dos_botoes
  using (motorista_id = (select auth.uid()) and (select public.eh_ativo()))
  with check (motorista_id = (select auth.uid()) and (select public.eh_ativo()));
alter policy uso_gravar on public.uso_dos_botoes
  with check (motorista_id = (select auth.uid()) and (select public.eh_ativo()));
alter policy uso_ver on public.uso_dos_botoes
  using ((motorista_id = (select auth.uid()) and (select public.eh_ativo())) or (select public.eh_admin()));

-- ===== Para voltar como era (só se precisar): tire os dois traços do começo de cada linha e rode.
-- alter policy correcoes_admin_apaga on public.correcoes using (public.eh_admin());
-- alter policy correcoes_criar on public.correcoes with check (motorista_id = auth.uid() and public.eh_ativo());
-- alter policy correcoes_desfazer on public.correcoes using (motorista_id = auth.uid() and public.eh_ativo() and criado_em > now() - interval '1 day');
-- alter policy correcoes_ver on public.correcoes using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
-- alter policy lugares_criar on public.lugares with check (motorista_id = auth.uid() and public.eh_ativo());
-- alter policy lugares_ver on public.lugares using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
-- alter policy observacoes_criar on public.observacoes with check (motorista_id = auth.uid() and public.eh_ativo());
-- alter policy observacoes_ver on public.observacoes using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
-- alter policy pacotes_criar on public.pacotes with check (public.eh_ativo() and exists (select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid()));
-- alter policy pacotes_marcar on public.pacotes using (public.eh_ativo() and exists (select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid())) with check (public.eh_ativo() and exists (select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid()));
-- alter policy pacotes_ver on public.pacotes using (public.eh_admin() or (public.eh_ativo() and exists (select 1 from public.rotas r where r.id = rota_id and r.motorista_id = auth.uid())));
-- alter policy perfis_admin_edita on public.perfis using (public.eh_admin()) with check (public.eh_admin());
-- alter policy perfis_ver on public.perfis using (id = auth.uid() or public.eh_admin());
-- alter policy reclamacoes_criar on public.reclamacoes with check (motorista_id = auth.uid() and public.eh_ativo());
-- alter policy reclamacoes_tirar on public.reclamacoes using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
-- alter policy reclamacoes_ver on public.reclamacoes using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
-- alter policy rotas_admin_apaga on public.rotas using (public.eh_admin());
-- alter policy rotas_criar on public.rotas with check (motorista_id = auth.uid() and public.eh_ativo());
-- alter policy rotas_ver on public.rotas using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
-- alter policy ruas_ver on public.ruas using (public.eh_ativo());
-- alter policy uso_atualizar on public.uso_dos_botoes using (motorista_id = auth.uid() and public.eh_ativo()) with check (motorista_id = auth.uid() and public.eh_ativo());
-- alter policy uso_gravar on public.uso_dos_botoes with check (motorista_id = auth.uid() and public.eh_ativo());
-- alter policy uso_ver on public.uso_dos_botoes using ((motorista_id = auth.uid() and public.eh_ativo()) or public.eh_admin());
