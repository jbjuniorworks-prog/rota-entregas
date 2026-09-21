import {test, expect, abrir, carregar, aviso, aba, montar, pontosNoMaps, zoom, ROTA_A, ROTA_B} from './apoio';

test('planilha da Shopee salva como .txt vira paradas, somando pacotes do mesmo endereço', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect(aviso(page)).toContainText('10 parada(s) da planilha, 2 pacote(s) somado(s) a um mesmo endereço.');
  await expect(page.getByText('Conferir locais')).toBeVisible();
  await expect(page.getByText('📦 3 unid.')).toBeVisible();
  await expect(page.getByText('Rua dos Ipês, 300, Bloco B ap 202', {exact: false})).toBeVisible();
});

test('o balão do mapa mostra a parada da Shopee, o ADS sem parada e os pacotes daquele ponto', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await zoom(page, 18);
  await expect
    .poll(async () => [...new Set(await page.locator('.balao').allInnerTexts())].sort())
    .toEqual(['ADS', 'P1', 'P2 ×4', 'P3', 'P4', 'P5', 'P6', 'P7']);
});

test('pinos em cima uns dos outros viram um pino só, e abrem quando dá zoom', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await zoom(page, 18);
  const separados = await page.locator('.pino').count();
  await zoom(page, 13);
  await expect.poll(async () => await page.locator('.pino').count()).toBeLessThan(separados);
  await expect(page.locator('.pino').filter({hasText: '+'})).not.toHaveCount(0);
  await zoom(page, 18);
  await expect.poll(async () => await page.locator('.pino').count()).toBe(separados);
});

test('planilha .xlsx sem nada estranho não gera alerta', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_B);
  await expect(aviso(page)).toHaveText('6 parada(s) da planilha.');
  await expect(page.getByText(/❗ 0 para conferir/)).toBeVisible();
});

test('cada lugar diferente vira uma marcação no Maps, e só pacotes no mesmo ponto dividem uma', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  const pontos = await pontosNoMaps(page);
  expect(pontos).toHaveLength(9);
  expect(new Set(pontos).size).toBe(9);
});

test('a aba Conferir mostra a origem de cada posição', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_B);
  await aba(page, '2. Conferir');
  await expect(page.getByText('Posição da planilha').first()).toBeVisible();
});
