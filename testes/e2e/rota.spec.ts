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
    const uma = cartao.getByRole('button', {name: '✓ Entreguei', exact: true});
    const umPorUm = cartao.getByRole('button', {name: 'Entregue', exact: true});
    const todas = cartao.getByRole('button', {name: /✓ Entreguei as \d+/});

    let entregues = 0;
    for (let i = 0; i < 15 && !(await todas.count()); i++) {
      await uma.click();
      entregues++;
      await page.waitForTimeout(250);
    }
    expect(entregues).toBeGreaterThan(0);
    expect(await umPorUm.count()).toBe(2);

    await todas.click();
    expect(perguntas.at(-1)).toMatch(/Marcar como entregue tudo desta parada\?[\s\S]*2 entrega\(s\), \d+ pacote\(s\)/);
    await expect(aviso(page)).toContainText('2 entrega(s) marcada(s) aqui');
    await expect(page.locator('.resumo')).toContainText(`${entregues + 2}/10 entregas`);

    await uma.click();
    await expect(page.locator('.resumo')).toContainText(`${entregues + 3}/10 entregas`);
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
    await expect(page.locator('.resumo')).toBeVisible();
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

test('se o pedido de GPS fica sem resposta, a rota sai assim mesmo, e a resposta atrasada não desmonta ela', async ({page}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    (window as unknown as {permitirDepois?: () => void}).permitirDepois = undefined;
    navigator.geolocation.getCurrentPosition = (ok: PositionCallback) => {
      (window as unknown as {permitirDepois?: () => void}).permitirDepois =
        () => ok({coords: {latitude: -10.93, longitude: -37.05, accuracy: 12}} as GeolocationPosition);
    };
  });
  await abrir(page);
  await carregar(page, ROTA_B);
  await aba(page, '3. Rota');
  await page.getByRole('button', {name: /Montar melhor sequência/}).click();
  await expect(aviso(page)).toContainText('Pegando sua localização');
  await expect(page.locator('.resumo')).toBeVisible({timeout: 60_000});
  expect(await ordem(page, NOMES)).toHaveLength(6);

  await page.evaluate(() => (window as unknown as {permitirDepois: () => void}).permitirDepois());
  await expect(aviso(page)).toContainText('chegou depois que a rota ficou pronta');
  await expect(page.locator('.resumo')).toBeVisible();
  expect(await ordem(page, NOMES)).toHaveLength(6);
});

// Refazer não pode piorar. Sem sinal a sequência sai em linha reta, que não sabe de mão única
// nem de canteiro — e a de antes, montada pelas ruas, era melhor. Numa zona morta isso era um
// caminho sem volta: agora a rota de antes volta com um toque.
test('se refazer sair sem as ruas, dá para voltar para a rota de antes', async ({page, context}) => {
  let ruas = true;
  await context.route('**://router.project-osrm.org/**', r => {
    if (!ruas) return r.abort();
    const caminho = new URL(r.request().url()).pathname;
    const pts = caminho.split('/').pop()!.split(';').map(c => c.split(',').map(Number));
    const corpo = caminho.includes('/table/')
      ? {code: 'Ok', durations: pts.map(a => pts.map(b => Math.hypot(a[0] - b[0], a[1] - b[1]) * 14000)),
         distances: pts.map(a => pts.map(b => Math.hypot(a[0] - b[0], a[1] - b[1]) * 111000))}
      : {code: 'Ok', routes: [{geometry: {coordinates: pts}}]};
    return r.fulfill({contentType: 'application/json', body: JSON.stringify(corpo)});
  });
  await abrir(page);
  await carregar(page, ROTA_B);
  await montar(page);
  await expect(page.locator('.resumo')).not.toContainText('aproximado');
  const pelasRuas = await page.locator('.resumo').innerText();

  ruas = false;
  await montar(page);
  await expect(aviso(page)).toContainText('A de antes saiu pelas ruas');
  await expect(page.locator('.resumo')).toContainText('aproximado');

  await page.getByRole('button', {name: '↺ Desfazer'}).click();
  await expect(aviso(page)).toContainText('A rota de antes voltou');
  await expect(page.locator('.resumo')).toHaveText(pelasRuas);
});

test('dá para pedir a rota na ordem do app de entrega, e o app diz o que isso custa', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '3. Rota');
  await page.getByLabel('Seguir a ordem do app de entrega (parada 1, 2, 3…)').check();
  await page.getByRole('button', {name: /Montar melhor sequência/}).click();
  await expect(page.locator('.resumo')).toBeVisible();
  await page.getByText('Detalhes da rota').click();
  await expect(page.getByText(/Você pediu a ordem do app/)).toBeVisible();
  const naOrdem = await ordem(page, ['Rua das Acácias, 120', 'Rua dos Ipês, 300', 'Avenida Central, 1500', 'Travessa Um, 45', 'Rua D, 49']);
  expect(naOrdem).toEqual(['Rua das Acácias, 120', 'Rua dos Ipês, 300', 'Avenida Central, 1500', 'Travessa Um, 45', 'Rua D, 49']);
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
