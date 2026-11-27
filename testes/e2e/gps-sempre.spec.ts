import {aba, abrir, carregar, expect, montar, test, ROTA_A} from './apoio';

// Dono, 27/11: "pode deixar ativo o GPS o tempo todo, testamos deixando gravando e não come bateria".
// O GPS ficava só na Rota: voltando da Conferir, a bolinha e a linha esperavam ele pegar de novo.
test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: {latitude: -10.95, longitude: -37.05, accuracy: 8}});

test('com a localização liberada, o GPS segue ligado fora da Rota', async ({page, context}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  await page.waitForFunction(() => !!(window as any).rotaTeste?.eu());
  await aba(page, '2. Conferir');
  await context.setGeolocation({latitude: -10.96, longitude: -37.06, accuracy: 8});
  await expect.poll(() => page.evaluate(() => (window as any).rotaTeste.eu()?.lat), 'a leitura nova chega na Conferir').toBeCloseTo(-10.96, 5);
});
