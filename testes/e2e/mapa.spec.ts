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

    // A faixa sai do orçamento do mapa, não do painel. Tirando do painel, o endereço da próxima
    // entrega saía da tela — e isso só apareceu no CI, depois de passar aqui.
    const conjunto = await page.locator('.mapwrap').evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(Math.abs(conjunto - Math.round(915 * 0.28)), 'a faixa tem de caber dentro do mapa').toBeLessThan(4);


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

// Na rua ele está na porta com o mapa aberto. Sair da aba para marcar entregue, ou para arrumar
// o pino, era o que custava tempo — as duas coisas passam a caber no próprio balão do pino.
test.describe('agir pelo pino, na aba Rota', () => {
  // sem GPS de propósito: com ele, o marcador da saída cai em cima da entrega e tapa o pino
  test.use({viewport: {width: 412, height: 915}});

  test('o balão marca entregue e abre a correção da posição, sem trocar de aba', async ({page}) => {
    const {carregar, montar, aviso, garantirMapa, ROTA_A} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);

    // a próxima parada da sequência sai destacada
    await expect(page.locator('.pino.alvo')).toHaveCount(1);
    const feitasAntes = await page.locator('.resumo').innerText();

    await page.locator('.pino.alvo').click();
    await page.getByRole('button', {name: /Entreguei/}).first().click();
    await expect.poll(async () => (await page.locator('.resumo').innerText()) !== feitasAntes, {timeout: 10_000}).toBe(true);
    await expect(page.locator('#painel')).toContainText('3. Rota');

    // e o outro botão começa a correção ali mesmo
    await page.locator('.leaflet-marker-icon .pino').first().click();
    await page.getByRole('button', {name: /Arrumar aqui/}).click();
    await expect(aviso(page)).toContainText('Toque no mapa, no local da entrega');
  });
});

// O caso do Luan, 26/09: "Rua Diamante Negro 320" e "Rua Wilson Almeida Santana 31" caíram no
// mesmo pino. São portas diferentes — uma é o restaurante, a outra é "próx. ao restaurante". Ele
// tentou separar e o app ofereceu juntar de novo, porque a zero metro a vizinha está sempre
// colada. E o botão "Arrumar aqui" mexia sempre na primeira da pilha, sem dizer qual era.
test.describe('duas entregas no mesmo pino, de endereços diferentes', () => {
  test.use({viewport: {width: 412, height: 915}});

  const JUNTAS = [-10.9640, -37.0430] as const;
  const QUASE = [-10.96401, -37.04301] as const;
  const AO_LADO = [-10.96411, -37.04310] as const;

  test('dá para arrumar só uma, e arrumar não junta as duas de volta', async ({page}) => {
    const {carregar, montar, aviso, garantirMapa, clicarMapa, linhaDe, verNoMapa, ROTA_A} = await import('./apoio');
    const perguntas: string[] = [];
    page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
    await abrir(page);
    await carregar(page, ROTA_A);

    // põe as duas no mesmo ponto, que é como elas chegam na mão dele
    await aba(page, '2. Conferir');
    await linhaDe(page, 'Avenida Central, 1500', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
    await clicarMapa(page, ...JUNTAS);
    await linhaDe(page, 'Travessa Um, 45', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
    await clicarMapa(page, ...QUASE);
    expect(perguntas.at(-1), 'a montagem do caso depende dessa pergunta').toContain('virarem uma parada só');

    await montar(page);
    await garantirMapa(page);
    // de perto e em cima delas: enquadrado na rota inteira todo pino vira pilha, e pino fora
    // da tela não tem rótulo para procurar
    await verNoMapa(page, ...JUNTAS);
    // a planilha tem outra pilha legítima (os dois blocos do mesmo prédio), então a nossa é a
    // que está no meio do mapa, que é onde acabamos de centralizar
    const caixa = (await page.locator('#map').boundingBox())!;
    const meio = {x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2};
    const pilhas = page.locator('.leaflet-marker-icon .pino').filter({hasText: '+1'});
    const longes = await Promise.all((await pilhas.all()).map(async l => {
      const b = (await l.boundingBox())!;
      return Math.hypot(b.x - meio.x, b.y - meio.y);
    }));
    await pilhas.nth(longes.indexOf(Math.min(...longes))).click();
    await expect(page.locator('.leaflet-popup')).toContainText('2 entregas neste ponto');
    await expect(page.locator('.leaflet-popup')).toContainText('Travessa Um');

    // um botão por entrega, com o número dela — e não um só, escolhendo calado
    const arrumar = page.locator('.leaflet-popup [data-acao=arrumar]');
    await expect(arrumar).toHaveCount(2);
    await expect(page.locator('.leaflet-popup')).toContainText('Arrumar só a');

    perguntas.length = 0;
    await arrumar.nth(1).click();
    await expect(aviso(page)).toContainText('Toque no mapa, no local da entrega');
    await clicarMapa(page, ...AO_LADO);

    expect(perguntas, 'separar duas que já estão no mesmo pino não é pergunta de juntar').toEqual([]);

    // andou a segunda, e só ela: a primeira ficou onde estava
    const onde = await page.evaluate(() => {
      const paradas = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas || [];
      const pega = (t: string) => paradas.find((p: any) => p.texto.includes(t));
      return {central: pega('Avenida Central'), travessa: pega('Travessa Um')};
    });
    expect(onde.central.lat).toBeCloseTo(JUNTAS[0], 5);
    expect(onde.travessa.lat).toBeCloseTo(AO_LADO[0], 5);
  });
});
