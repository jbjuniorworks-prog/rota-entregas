import {aba, abrir, test, expect} from './apoio';

const PEDACO_DO_MAPA = /\/assets\/Mapa-[^/]+\.(js|css)$/;

test('sem o pedaço do mapa, o app continua de pé', async ({page, context}) => {
  await context.route(PEDACO_DO_MAPA, r => r.abort());
  await abrir(page);
  await expect(page.getByText('Não consegui carregar o mapa')).toBeVisible();
  await aba(page, '3. Rota');
  await expect(page.getByRole('button', {name: /Montar melhor sequência|Ponto de saída/})).toBeVisible();
});

test('quando a rede volta, o botão traz o mapa', async ({page, context}) => {
  let bloquear = true;
  await context.route(PEDACO_DO_MAPA, r => bloquear ? r.abort() : r.continue());
  await abrir(page);
  await expect(page.getByText('Não consegui carregar o mapa')).toBeVisible();
  bloquear = false;
  await page.getByRole('button', {name: 'Tentar de novo'}).click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.getByText('Não consegui carregar o mapa')).toBeHidden();
});
