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

// O Luan reclamou que não conseguia se situar no mapa: ele mostrava os pinos das entregas e não
// mostrava ele. Sem se ver no meio deles não dá para saber para que lado sair da esquina.
test.describe('onde o motorista está', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: {latitude: -10.9605, longitude: -37.0455, accuracy: 10}});

  test('a Rota mostra o motorista no mapa, e o botão centraliza nele', async ({page}) => {
    const {carregar, montar, ROTA_A} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('.eu'), 'a bolinha de "você está aqui"').toBeVisible();

    await page.locator('#btnEu').click();
    await expect.poll(async () => {
      const c = await page.evaluate(() => (window as any).rotaTeste.centro());
      return Math.max(Math.abs(c.lat - -10.9605), Math.abs(c.lng - -37.0455));
    }, {timeout: 10_000}).toBeLessThan(0.002);
  });
});

// "o mapa fica pequeno": na Rota ele nasce com 28% da tela, embaixo do cartão. A barra puxa ele
// para cima, e o tamanho escolhido tem de continuar lá na próxima vez.
test.describe('puxar o mapa para cima', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('arrastar a barra aumenta o mapa, e a altura fica guardada', async ({page}) => {
    const {carregar, montar, ROTA_A} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const altura = () => page.locator('#map').evaluate(el => Math.round(el.getBoundingClientRect().height));
    const antes = await altura();
    expect(antes).toBeLessThan(300);

    const barra = page.locator('#pegaMapa');
    const cx = await barra.evaluate(el => { const r = el.getBoundingClientRect(); return Math.round(r.left + r.width / 2); });
    const cy = await barra.evaluate(el => { const r = el.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 260, {steps: 14});
    await page.mouse.up();
    await expect.poll(altura).toBeGreaterThan(antes + 180);

    // e a barra não pode roubar o toque do ⤢ nem do zoom, que ficam nos cantos
    for (const [x, y, quem] of [[380, 0, 'btnMapa'], [30, 0, 'zoom']] as [number, number, string][]) {
      const topo = await page.locator('#map').evaluate(el => Math.round(el.getBoundingClientRect().top));
      const dono = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return el ? (el.id || el.closest('[id]')?.id || el.className) : '';
      }, [x, topo + 14]);
      expect(String(dono), `${quem} coberto pela barra`).not.toContain('pegaMapa');
    }

    const escolhida = await altura();
    await page.reload();
    await abrir(page);
    await expect.poll(altura, {timeout: 15_000}).toBeGreaterThan(escolhida - 20);
  });
});
