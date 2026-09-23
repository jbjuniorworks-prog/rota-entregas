import {aba, abrir, test, expect} from './apoio';

const PEDACO_DO_MAPA = /\/assets\/Mapa-[^/]+\.(js|css)$/;

// O mapa é testado na aba Conferir: é onde ele é o trabalho, e é a aba que o mostra por padrão.
// Em Endereços ele nasce fechado de propósito — enquanto se digita a lista não há o que mostrar.
test('sem o pedaço do mapa, o app continua de pé', async ({page, context}) => {
  await context.route(PEDACO_DO_MAPA, r => r.abort());
  await abrir(page);
  await aba(page, '2. Conferir');
  await expect(page.getByText('Não consegui carregar o mapa')).toBeVisible();
  await aba(page, '3. Rota');
  await expect(page.getByRole('button', {name: /Montar melhor sequência|Ponto de saída/})).toBeVisible();
});

test('quando a rede volta, o botão traz o mapa', async ({page, context}) => {
  let bloquear = true;
  await context.route(PEDACO_DO_MAPA, r => bloquear ? r.abort() : r.continue());
  await abrir(page);
  await aba(page, '2. Conferir');
  await expect(page.getByText('Não consegui carregar o mapa')).toBeVisible();
  bloquear = false;
  await page.getByRole('button', {name: 'Tentar de novo'}).click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.getByText('Não consegui carregar o mapa')).toBeHidden();
});

// só no celular: em tela larga o mapa fica ao lado e recolher não faz sentido
test.describe('no celular', () => {
  test.use({viewport: {width: 412, height: 915}});
  test('o mapa é fechado em Endereços e aberto em Conferir, e a escolha fica guardada', async ({page}) => {
  await abrir(page);
  await expect(page.locator('#app')).toHaveClass(/mapa-fechado/);
  await aba(page, '2. Conferir');
  await expect(page.locator('#app')).toHaveClass(/mapa-grande/);

  // a escolha é por aba: fechar aqui não mexe na outra
  await page.locator('#btnMapa').click();
  await expect(page.locator('#app')).toHaveClass(/mapa-fechado/);
  await aba(page, '3. Rota');
  await expect(page.locator('#app')).toHaveClass(/mapa-normal/);

  await page.reload();
  await abrir(page);
  await aba(page, '2. Conferir');
  await expect(page.locator('#app'), 'a escolha tem de sobreviver ao recarregar').toHaveClass(/mapa-fechado/);
  });
});
