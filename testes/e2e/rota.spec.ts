import {test, expect, abrir, carregar, aviso, aba, montar, ordem, linhaDe, clicarMapa, pontosNoMaps, ROTA_A, ROTA_B} from './apoio';

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
    await expect.poll(async () => (await ordem(page, NOMES))[0]).toBe(P5);
  });

  test('ao marcar entrega com a próxima perto, avisa que dá para ir a pé', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_B);
    await montar(page);
    expect((await ordem(page, NOMES)).slice(0, 2)).toEqual([P1, Q]);
    await expect(page.locator('.proxima')).toContainText('Aqui perto, fora desta parada');
    await expect(page.locator('.proxima')).toContainText(/Rua Oeste, 150.*~1\d\d m/);
    await linhaDe(page, P1, 'Entregue').getByRole('button', {name: 'Entregue'}).click();
    await expect(aviso(page)).toContainText(/Próxima a ~1[45]0 m: Rua Oeste, 150\. Dá para ir a pé\./);
  });

  test('dá para entregar tudo da parada de uma vez, e continua dando para marcar uma a uma', async ({page}) => {
    const perguntas: string[] = [];
    page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const cartao = page.locator('.proxima');
    const umPorUm = cartao.getByRole('button', {name: 'Entregue', exact: true});
    const todas = cartao.getByRole('button', {name: /Entreguei as \d+ daqui/});

    let entregues = 0;
    for (let i = 0; i < 15 && !(await todas.count()); i++) {
      await umPorUm.first().click();
      entregues++;
      await page.waitForTimeout(250);
    }
    expect(entregues).toBeGreaterThan(0);
    expect(await umPorUm.count()).toBe(2);

    await todas.click();
    expect(perguntas.at(-1)).toMatch(/Marcar como entregue tudo desta parada\?[\s\S]*2 entrega\(s\), \d+ pacote\(s\)/);
    await expect(aviso(page)).toContainText('2 entrega(s) marcada(s) aqui');
    await expect(page.getByText(`${entregues + 2}/10 entregues`)).toBeVisible();

    await umPorUm.first().click();
    await expect(page.getByText(`${entregues + 3}/10 entregues`)).toBeVisible();
  });

  test('deixar para depois tira a parada da sequência sem desmontar a rota, e dá para arrumar e voltar', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_B);
    await montar(page);
    await linhaDe(page, P1, 'Deixar para depois').getByRole('button', {name: 'Deixar para depois'}).click();
    await expect(page.getByText('⏸ Deixadas para depois (1)')).toBeVisible();
    expect((await ordem(page, NOMES))[0]).toBe(Q);
    expect((await pontosNoMaps(page)).some(p => p.startsWith('-10.9300013,-37.1000013'))).toBe(false);
    await page.getByRole('button', {name: 'Marcar no mapa'}).last().click();
    await clicarMapa(page, -10.9301, -37.1001);
    await expect(page.getByText(/Total estimado/)).toBeVisible();
    await page.getByRole('button', {name: 'Voltar para a rota'}).click();
    await expect(page.getByText(/1 parada\(s\) nova\(s\) ou corrigida\(s\) fora da rota/)).toBeVisible();
    await page.getByRole('button', {name: 'Refazer rota'}).click();
    await expect(page.getByText('⏸ Deixadas para depois')).toHaveCount(0);
    await expect.poll(async () => (await ordem(page, NOMES)).length).toBe(6);
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
