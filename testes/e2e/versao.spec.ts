import {abrir, carregar, ROTA_A, test, expect} from './apoio';

// Luan, 02/10: a aba do Chrome aberta desde a véspera leu a planilha com a versão antiga, e o pino
// que o censo consertaria ficou a 739 m. O app pergunta qual é a versão publicada.
const OUTRA = {id: 'publicada-depois', quando: '02/10 13:10'};
const publicarOutra = (page) => page.route('**/versao.json*', r => r.fulfill({json: OUTRA}));

test('sem entrega pendente, a versão nova entra sozinha, e só uma vez', async ({page}) => {
  await publicarOutra(page);
  await abrir(page);
  await expect(page).toHaveURL(/\?v=publicada-depois/);
  // o servidor ainda manda a antiga (aqui, sempre): no lugar de recarregar de novo, avisa
  await expect(page.locator('[data-versao-nova]')).toContainText('Versão nova do app, de 02/10 13:10');
});

test('com rota andando, avisa e espera ele tocar em Atualizar; a rota continua', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  const antes = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas.length);
  await publicarOutra(page);
  await page.reload();
  await expect(page.locator('[data-versao-nova]')).toContainText('A rota continua como está');
  await expect(page).not.toHaveURL(/\?v=/);
  await page.locator('[data-versao-nova]').getByRole('button', {name: 'Atualizar'}).click();
  await expect(page).toHaveURL(/\?v=publicada-depois/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas.length)).toBe(antes);
});

test('a mesma versão não mostra nada, e a aba Endereços diz qual é', async ({page}) => {
  await abrir(page);
  await expect(page.locator('[data-versao]')).toContainText(/Versão do app: \d\d\/\d\d/);
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-versao-nova]')).toHaveCount(0);
  await expect(page).not.toHaveURL(/\?v=/);
});
