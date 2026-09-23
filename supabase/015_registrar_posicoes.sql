-- Faz o registro da origem das posições realmente gravar.
-- `registrar_posicoes` é security invoker de propósito: quem manda em qual linha pode ser
-- tocada é a política `pacotes_marcar`, que já exige que a rota seja do próprio motorista.
-- Só que o motorista tinha permissão de escrita em `entregue_em` e em mais nada, então o
-- update batia em falta de permissão, a fila tratava como recusa do servidor e descartava
-- calado. Resultado: `fonte` e `precisao` nulos em todo pacote desde que isso subiu — e sem
-- eles o `resumo_do_dia` não tem como dizer se o app acertou, que era o motivo de existir.
-- Rodar uma vez em SQL Editor > New query > Run.

grant update (lat, lng, fonte, precisao) on public.pacotes to authenticated;
