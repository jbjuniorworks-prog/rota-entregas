import type {BrowserContext, Page} from '@playwright/test';
import {abrir, carregar, garantirMapa, menu, montar, paraABase, test, expect, ROTA_A} from './apoio';

// O teste do caminho (dono, 24/11): gravar, com a Rota aberta, o caminho que o GPS do app já lê, e
// a bateria, para ver se gasta e quanto o caminho cobre. Só no celular.
const INICIO = {latitude: -10.93127, longitude: -37.03119, accuracy: 9};
const andar = (metros: number) => ({latitude: INICIO.latitude + metros / 111320, longitude: INICIO.longitude, accuracy: 9});

test.describe('o teste do caminho', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: INICIO});

  // espera a leitura chegar ao app (o mesmo do teste do som perto do pino)
  const chegou = (page: Page, g: {latitude: number}) =>
    expect.poll(() => page.evaluate(() => (window as any).rotaTeste?.eu()?.lat), {timeout: 10_000}).toBeCloseTo(g.latitude, 6);

  async function rotaAberta(page: Page) {
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);
  }

  async function ligar(page: Page) {
    await menu(page, 'Ajustes deste celular');
    await page.getByRole('button', {name: 'Teste do caminho'}).click();
    await page.locator('[data-gravar]').click();
    await expect(page.locator('[data-gravando]')).toBeVisible();
    await garantirMapa(page);
  }

  // 4 passos de 40 m, 15 s um do outro: com o primeiro ponto, 5 pontos
  async function andarUmPouco(page: Page, context: BrowserContext) {
    await chegou(page, INICIO);
    for (let i = 1; i <= 4; i++) {
      await page.clock.fastForward(15_000);
      await context.setGeolocation(andar(40 * i));
      await chegou(page, andar(40 * i));
    }
  }

  async function verOTeste(page: Page) {
    await menu(page, /^Ajustes deste celular/);
    await page.getByRole('button', {name: /^Teste do caminho/}).click();
    await expect(page.locator('[data-caminho]')).toBeVisible();
  }

  test('desligado, andar com a Rota aberta não grava nada', async ({page, context}) => {
    await rotaAberta(page);
    await andarUmPouco(page, context);
    await verOTeste(page);
    await expect(page.locator('[data-hoje-vazio]')).toHaveText('Nada gravado hoje.');
  });

  test('gravando, o caminho da Rota aparece no teste', async ({page, context}) => {
    await rotaAberta(page);
    await ligar(page);
    await andarUmPouco(page, context);
    await verOTeste(page);
    await expect(page.locator('[data-hoje]')).toContainText(/^5 pontos, das \d\d:\d\d às \d\d:\d\d\. O caminho cobriu 100% desse tempo\./);
  });

  test('gravando, o Mais diz que está gravando', async ({page}) => {
    await rotaAberta(page);
    await ligar(page);
    await paraABase(page);
    await page.getByRole('button', {name: 'Mais', exact: true}).click();
    await expect(page.locator('.menu').getByRole('button', {name: 'Ajustes deste celular (gravando o caminho)'})).toBeVisible();
  });

  test('nada do caminho vai para a rede', async ({page, context}) => {
    await rotaAberta(page);
    await ligar(page);
    const saiu: string[] = [];
    // O serviço de ruas recebe o ponto de agora quando ele sai da linha até a próxima (acoes/desvio.ts),
    // gravando ou não, como já recebia a saída da rota. O que este teste guarda é o caminho gravado.
    page.on('request', r => { if (!r.url().includes('router.project-osrm.org')) saiu.push(r.url() + ' ' + (r.postData() || '')); });
    await andarUmPouco(page, context);
    await page.clock.fastForward(5 * 60_000);
    await verOTeste(page);
    await expect(page.locator('[data-hoje]')).toContainText('5 pontos');
    // a latitude de cada passo, com as casas que o caminho guarda
    for (let i = 1; i <= 4; i++) {
      const lat = andar(40 * i).latitude.toFixed(5);
      expect(saiu.filter(s => s.includes(lat)), `o passo ${i} (${lat}) saiu do celular`).toEqual([]);
    }
  });

  test('o app escondido no meio vira buraco do app escondido, e o navegador sem GPS ali é dito', async ({page, context}) => {
    await rotaAberta(page);
    await ligar(page);
    await chegou(page, INICIO);
    const visivel = (v: 'hidden' | 'visible') => page.evaluate(x => {
      Object.defineProperty(document, 'visibilityState', {value: x, configurable: true});
      document.dispatchEvent(new Event('visibilitychange'));
    }, v);
    await visivel('hidden');
    await page.clock.fastForward(5 * 60_000);
    await visivel('visible');
    await context.setGeolocation(andar(300));
    await chegou(page, andar(300));
    await verOTeste(page);
    await expect(page.locator('[data-buraco="escondido"]')).toHaveText('Com o app escondido (Waze, tela apagada): 1 vez, 5 min.');
    await expect(page.locator('[data-veredito]')).toHaveText('Com o app escondido (5 min), o navegador não mandou o GPS: nenhum ponto.');
  });

  test('com a bateria caindo, o teste mostra quanto gastou por hora gravando', async ({page, context}) => {
    // cada leitura, 1% a menos: a cada 5 minutos, 12% por hora
    await context.addInitScript(() => {
      let n = 0;
      Object.defineProperty(navigator, 'getBattery', {configurable: true,
        value: () => Promise.resolve({level: 0.9 - 0.01 * n++, charging: false, addEventListener() {}})});
    });
    await rotaAberta(page);
    await ligar(page);
    for (let i = 0; i < 7; i++) await page.clock.runFor(5 * 60_000);
    await verOTeste(page);
    await expect(page.locator('[data-gasto="gravando"]')).toHaveText('Gravando: 12% por hora, em 35 min de app aberto.');
    await expect(page.locator('[data-gasto="sem-gravar"]')).toHaveText('Sem gravar: nada ainda.');
  });

  test('sem a bateria no navegador, o teste diz que o celular não informa', async ({page, context}) => {
    await context.addInitScript(() => { delete (Navigator.prototype as any).getBattery; });
    await rotaAberta(page);
    await ligar(page);
    await verOTeste(page);
    await expect(page.locator('[data-sem-bateria]')).toHaveText('Este celular não informa a bateria ao app (o iPhone não informa).');
  });

  test('Apagar o teste apaga o caminho e para de gravar', async ({page, context}) => {
    page.on('dialog', d => d.accept());
    await rotaAberta(page);
    await ligar(page);
    await andarUmPouco(page, context);
    await verOTeste(page);
    await expect(page.locator('[data-hoje]')).toContainText('5 pontos');
    await page.locator('[data-apagar]').click();
    await expect(page.locator('[data-hoje-vazio]')).toHaveText('Nada gravado hoje.');
    await expect(page.locator('[data-gravar]')).toHaveText('Gravar meu caminho');
    // e não volta a gravar sozinho
    await garantirMapa(page);
    await page.clock.fastForward(60_000);
    await context.setGeolocation(andar(500));
    await chegou(page, andar(500));
    await verOTeste(page);
    await expect(page.locator('[data-hoje-vazio]')).toHaveText('Nada gravado hoje.');
  });
});
