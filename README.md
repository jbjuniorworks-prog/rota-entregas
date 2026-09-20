# Rota de Entregas

App (PWA) que os entregadores usam para ordenar as paradas do dia.

Lê a planilha da rota (Shopee, inclusive a que vem como .txt), prints ou PDF
da lista de paradas, localiza cada endereço, agrupa as entregas próximas e
calcula a sequência mais curta pelas ruas. Abre cada parada no Waze ou no
Google Maps, em trechos que respeitam o limite de pontos do Maps.
Instalável no Android: ao compartilhar prints com o app, a rota é montada
automaticamente.

Só entra quem tem conta (criada pelo administrador). As rotas, as entregas e
as correções de pino vão para o Supabase; a correção de um motorista vira
sugestão para os outros, e com 2 motoristas no mesmo ponto (ou o admin) vale
para todos. Ao marcar uma entrega na porta, o app guarda a posição do celular:
duas passagens no mesmo ponto também confirmam o lugar, e elas dão nome aos
trechos de rua que o mapa livre não tem. Consultas de endereço vão ao OpenStreetMap/ViaCEP e de rota ao OSRM.

## Código

- `app/`: Vite + React + TypeScript. Lógica pura em `app/src/logica` (com testes).
- `supabase/`: estrutura do banco, rodada em ordem no SQL Editor.
- `ferramentas/ruas.mjs`: copia as ruas de uma cidade do OpenStreetMap para a nossa base
  (`npm run ruas -- Aracaju "Nossa Senhora do Socorro"`). Na aba Admin dá para nomear, com as
  entregas dos motoristas, os trechos que vieram sem nome.
- `ferramentas/motoristas.mjs`: criar conta, trocar senha, desativar
  (`npm run motoristas -- listar | criar email Nome | senha email | desativar email | ativar email`).
  Precisa do `.env` com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, fora do git.

## Testes e publicação

- `npm run tipos`, `npm run test:unidade`, `npm test` (e2e sobre o build, com a nuvem simulada).
- `npm run test:nuvem`: contra o banco de verdade (cria e apaga usuários de teste).
- Cada push na `main` roda os testes no GitHub Actions e, se passarem, publica no GitHub Pages.
