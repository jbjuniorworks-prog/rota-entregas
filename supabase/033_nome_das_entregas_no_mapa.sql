-- O nome das ruas das entregas no mapa (24/11, dono: "colocar os nomes, deixar o melhor possível pros
-- entregadores").
--
-- A 023 escreve no mapa o nome da prefeitura onde o mapa (OpenStreetMap) mostra outro nome ou nenhum.
-- As ruas que nasceram das entregas (fonte 'entregas') ficaram de fora, porque o traçado delas sai dos
-- pontos das portas, e desenhá-lo seria inventar a rua. Medido em 24/11: as 70 ruas das entregas
-- estão todas desenhadas no mapa, a 1–20 m das portas, só com outro nome ("Rua Zenza" para a Rua
-- Josefina Alves), grafia diferente ("Travessa Izaura") ou nenhum (a Estrada Aguachuma, 80 entregas).
--
-- Esta coluna guarda, para a rua das entregas, o pedaço do traçado do PRÓPRIO MAPA onde ficam as
-- portas dela: uma lista de linhas [[lat, lng], ...]. O celular escreve ali o nome da planilha, e só
-- o nome: nunca desenha um traço a partir das portas. Quem preenche é `npm run nomes-no-mapa -- gravar`,
-- no computador, junto com a marca `no_mapa = 'sem_nome'` na mesma linha. As outras linhas ficam nulas.
--
-- Sem esta coluna, o celular segue com os nomes da prefeitura, como antes.
--
-- Rodar uma vez em SQL Editor > New query > Run. Depois, no computador: npm run nomes-no-mapa -- gravar

alter table public.ruas add column if not exists linha_no_mapa jsonb;

-- ===== Para voltar como era (só se precisar): tire os dois traços da linha abaixo e rode.
-- alter table public.ruas drop column if exists linha_no_mapa;
