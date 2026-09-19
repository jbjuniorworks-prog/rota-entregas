import {test, expect, abrir, carregar, aviso, aba, montar, ordem, linhaDe, clicarMapa, pontosNoMaps, ROTA_B} from './apoio';

const P1 = 'Rua Oeste, 1, Bairro';
const Q = 'Rua Oeste, 150';
const P5 = 'Rua Leste, 5';
const NOMES = [P1, Q, 'Rua Centro Oeste, 2', 'Rua Centro, 3', 'Rua Centro Leste, 4', P5];
const GPS = {
  p1: {latitude: -10.9300, longitude: -37.1000},
  p3: {latitude: -10.9300, longitude: -37.0800},
  p5: {latitude: -10.9300, longitude: -37.0600},
};

test.describe('com GPS', () => {
  test.use({permissions: ['geolocation'], geolocation: GPS.p1});

  test('a rota sai de onde o motorista está e é recalculada quando ele se move', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_B);
    await montar(page);
    expect((await ordem(page, NOMES))[0]).toBe(P1);

    await context.setGeolocation(GPS.p5);
    await montar(page);
    expect((await ordem(page, NOMES))[0]).toBe(P5);
  });

  test('ao marcar entrega com a próxima perto, avisa que dá para ir a pé', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_B);
    await montar(page);
    expect((await ordem(page, NOMES)).slice(0, 2)).toEqual([P1, Q]);
    await linhaDe(page, P1, 'Entregue').getByRole('button', {name: 'Entregue'}).click();
    await expect(aviso(page)).toContainText(/Próxima a ~1[45]0 m: Rua Oeste, 150\. Dá para ir a pé\./);
  });

  test('o ponto final escolhido fica no fim da rota e é o destino do último trecho do Maps', async ({page, context}) => {
    await context.setGeolocation(GPS.p3);
    await abrir(page);
    await carregar(page, ROTA_B);
    await aba(page, '3. Rota');
    await page.getByRole('button', {name: 'Marcar no mapa'}).click();
    await clicarMapa(page, -10.9300, -37.0550);
    await expect(page.getByText(/Local marcado no mapa\. A última entrega/)).toBeVisible();
    await montar(page);
    expect((await ordem(page, NOMES)).at(-1)).toBe(P5);
    expect((await pontosNoMaps(page)).at(-1)).toBe('-10.93,-37.055');
  });
});

test('sem GPS a rota ainda é montada, e "voltar ao ponto de saída" já pode ser marcado', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_B);
  await aba(page, '3. Rota');
  await expect(page.getByLabel('Voltar ao ponto de saída no final')).toBeEnabled();
  await montar(page);
  expect(await ordem(page, NOMES)).toHaveLength(6);
});

test('o ponto final é apagado no reset do dia', async ({page}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await carregar(page, ROTA_B);
  await aba(page, '3. Rota');
  await page.getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.9300, -37.0550);
  await page.getByRole('button', {name: /Resetar rota/}).click();
  await carregar(page, ROTA_B);
  await aba(page, '3. Rota');
  await expect(page.getByText('Sem ponto final')).toBeVisible();
});
