import {aba, abrir, carregar, lista, montar, test, expect, ROTA_A} from './apoio';

const PEDACO_DO_MAPA = /\/assets\/Mapa-[^/]+\.(js|css)$/;
const PINO = '[data-folha="pino"]';

// O mapa é a tela da Rota: sem ele, a próxima entrega e a lista têm de continuar ali.
test('sem o pedaço do mapa, o app continua de pé', async ({page, context}) => {
  await context.route(PEDACO_DO_MAPA, r => r.abort());
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect(page.getByText('Não consegui carregar o mapa')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Melhor caminho'})).toBeVisible();
});

test('quando a rede volta, o botão traz o mapa', async ({page, context}) => {
  let bloquear = true;
  await context.route(PEDACO_DO_MAPA, r => bloquear ? r.abort() : r.continue());
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect(page.getByText('Não consegui carregar o mapa')).toBeVisible();
  bloquear = false;
  await page.getByRole('button', {name: 'Tentar de novo'}).click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.getByText('Não consegui carregar o mapa')).toBeHidden();
});

test.describe('no celular', () => {
  test.use({viewport: {width: 412, height: 915}});

  // Ir à Conferir e voltar desmontava o mapa: voltava baixando tudo de novo e perdia o zoom.
  test('ir à Conferir e voltar não refaz o mapa', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.waitForFunction(() => !!(window as any).rotaTeste);
    // o rotaTeste nasce com o mapa: montado de novo, a marca some
    await page.evaluate(() => { (window as any).rotaTeste.marca = 'o mesmo'; });
    await aba(page, '2. Conferir');
    await aba(page, '3. Rota');
    expect(await page.evaluate(() => (window as any).rotaTeste.marca), 'o mapa foi montado de novo').toBe('o mesmo');
  });
});

// Escondido, o mapa não tem tamanho. "Buscar sem posição", na Conferir, pede para enquadrar a
// rota com ele fora da vista: enquadrado ali, ele ia ao zoom máximo, e na volta metade das
// entregas estava fora da tela.
test.describe('enquadrar com o mapa escondido', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('o pedido espera o mapa aparecer, e todas as entregas cabem nele', async ({page}) => {
    const {colar, paraABase} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await page.waitForFunction(() => !!(window as any).rotaTeste);
    // um endereço que nenhum mapa acha (aqui eles nem respondem) fica esperando busca
    await colar(page);
    await page.getByLabel(/Endereços da área/).fill('Rua Que Nao Existe Em Lugar Nenhum 10');
    await page.getByRole('button', {name: /^Adicionar em/}).click();
    await aba(page, '2. Conferir');
    await page.getByRole('button', {name: 'Buscar 1 sem posição'}).click();
    await expect(page.locator('#status')).toContainText(/Alguns falharam|Pronto/);
    await paraABase(page);
    await expect.poll(() => foraDoMapa(page, '.leaflet-marker-icon'), {timeout: 5000}).toBe(0);
  });
});

// quantos destes estão fora do retângulo do mapa (pino fora da vista existe no DOM, só não aparece)
const foraDoMapa = (page, seletor: string) => page.evaluate(s => {
  const m = document.querySelector('#map')!.getBoundingClientRect();
  return [...document.querySelectorAll(s)].filter(el => {
    const r = el.getBoundingClientRect();
    return r.right < m.left || r.left > m.right || r.bottom < m.top || r.top > m.bottom;
  }).length;
}, seletor);

// "Todas as respostas são onde você está" (02/10): ele não tocava em "onde estou" para se ver.
// E o mapa fica perto (Pedro, 03/10): mostrar ele e a próxima juntos afastava até a cidade inteira
// enquanto a entrega estava longe. Ele fica no meio, o mapa vai junto, e pinçar só muda a
// distância. Arrastar para; a mira volta.
test.describe('o mapa anda junto com ele', () => {
  const NA_ROTA = {latitude: -10.9605, longitude: -37.0455, accuracy: 10};
  // a uns 4 km, fora do que o mapa mostrava
  const LONGE = {latitude: -10.9300, longitude: -37.0300, accuracy: 10};
  test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: NA_ROTA});

  // quantos pixels ele está do meio do mapa: o meio do ícone é o ponto do GPS (a bolinha azul
  // tem margem dentro dele)
  const doMeio = (page) => page.evaluate(() => {
    const m = document.querySelector('#map')!.getBoundingClientRect(), eu = document.querySelector('.leaflet-marker-icon:has(.eu)');
    if (!eu) return Infinity;
    const r = eu.getBoundingClientRect();
    return Math.round(Math.hypot(r.left + r.width / 2 - (m.left + m.width / 2), r.top + r.height / 2 - (m.top + m.height / 2)));
  });
  const zoomAgora = (page) => page.evaluate(() => (window as any).rotaTeste.zoomAtual());
  // 0,0001 grau de latitude são uns 11 m
  const aNorte = (p: typeof NA_ROTA, metros: number) => ({...p, latitude: p.latitude + metros / 111320});
  // Como o GPS de quem roda: chega lá e, um pouco depois, mais uma leitura adiante. Um salto de
  // 4 km sozinho, em menos de um segundo, o mapa trata como erro do GPS (seguir.ts) e espera.
  const andarAte = async (context, p: typeof NA_ROTA) => {
    await context.setGeolocation(p);
    await new Promise(r => setTimeout(r, 300));
    await context.setGeolocation(aNorte(p, 15));
  };

  test('sem tocar em nada, ele fica no meio do mapa, de perto, e o mapa vai atrás quando ele anda', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    expect(await zoomAgora(page), 'de perto, como no "onde estou" de antes').toBeGreaterThanOrEqual(17);

    await andarAte(context, LONGE);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    expect(await zoomAgora(page)).toBeGreaterThanOrEqual(17);
  });

  // "O mapa não está sempre seguindo o ponto, isso é bem chato enquanto roda" (dono, 05/11): ele
  // só ia atrás depois de 30 m, e entre um salto e outro o ponto escorregava para fora do meio.
  test('andando poucos metros, ele continua no meio: o mapa vai a cada leitura', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    // 12 m: no zoom 17, uns 10 px fora do meio se o mapa esperasse os 30 m
    await context.setGeolocation(aNorte(NA_ROTA, 12));
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
  });

  test('um salto do GPS sozinho não leva o mapa; a leitura seguinte, perto dele, confirma', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    await context.setGeolocation(LONGE);
    await page.waitForTimeout(1500);
    expect(await foraDoMapa(page, '.eu'), 'o mapa foi atrás de um salto de 4 km em menos de um segundo').toBe(1);
    await expect(page.locator('#btnEu'), 'o salto não desliga o seguir').toHaveAttribute('aria-pressed', 'true');
    await context.setGeolocation(aNorte(LONGE, 15));
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  // A margem era 300 m; com o mapa indo a cada leitura, um ponto tão incerto o levava junto.
  test('GPS com margem acima de 50 m não move o mapa; voltando para 49 m, move', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    // 40 m: uns 34 px no zoom 17, e devagar o bastante para não ser salto
    await context.setGeolocation({...aNorte(NA_ROTA, 40), accuracy: 51});
    await page.waitForTimeout(1500);
    expect(await doMeio(page), 'o mapa foi atrás de um ponto com 51 m de margem').toBeGreaterThan(20);
    await context.setGeolocation({...aNorte(NA_ROTA, 45), accuracy: 49});
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  test('pinçar muda a distância e o mapa continua indo junto, nela', async ({page, context}) => {
    const {zoom} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await zoom(page, 15);
    await andarAte(context, LONGE);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    expect(await zoomAgora(page), 'voltou para a distância de antes de ele pinçar').toBe(15);
  });

  // O dedo fica onde der, longe do meio: seguindo, o zoom é em volta dele, senão ele sai do meio
  // até a próxima leitura do GPS.
  test('aproximar com o dedo longe do meio não tira ele do meio', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    const caixa = (await page.locator('#map').boundingBox())!;
    await page.mouse.move(caixa.x + 60, caixa.y + 120);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => zoomAgora(page)).toBeLessThan(17);
    await page.waitForTimeout(500);
    expect(await doMeio(page)).toBeLessThan(4);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
  });

  // Desde 06/11 o arrasto não desliga o seguir: é a mira que liga e desliga. Desligado, o mapa fica
  // onde ele deixou, como era antes depois de arrastar.
  test('a mira desliga o seguir: arrastar deixa o mapa onde ficou; a mira liga de novo e volta para ele', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await page.locator('#btnEu').click();
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'false');
    // arrastar com o dedo (aqui, o mouse)
    const caixa = (await page.locator('#map').boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width / 2 + 80, caixa.y + caixa.height / 2 + 40, {steps: 8});
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(await doMeio(page), 'desligado, o mapa voltou para ele ao soltar').toBeGreaterThan(40);

    // andou, e o mapa ficou onde ele deixou
    await andarAte(context, LONGE);
    await page.waitForTimeout(1500);
    expect(await foraDoMapa(page, '.eu'), 'o mapa foi atrás com o seguir desligado').toBe(1);

    await page.locator('#btnEu').click();
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  test('arrastar com o mouse e o seguir ligado: ao soltar, volta para ele, e o seguir continua', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    const caixa = (await page.locator('#map').boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width / 2 + 80, caixa.y + caixa.height / 2 + 40, {steps: 8});
    // segurando: a leitura do GPS que chega agora não puxa o mapa da mão
    await context.setGeolocation(aNorte(NA_ROTA, 12));
    await page.waitForTimeout(800);
    expect(await doMeio(page), 'com o botão apertado, o mapa voltou para ele').toBeGreaterThan(40);
    await page.mouse.up();
    await expect.poll(() => doMeio(page), {timeout: 5_000}).toBeLessThan(4);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await andarAte(context, LONGE);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  // O dono, em 15/10, trabalhando quase todo pela Lista: o mapa parava de segui-lo e só voltava
  // na mira. Tocar numa parada da Lista desligava o seguir de vez.
  test('olhar paradas pela lista não desliga o seguir: fechou, o mapa volta para ele', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await lista(page);
    for (const n of [0, 1]) {
      await page.locator('[data-folha="lista"] .parada .txt').nth(n).click();
      await expect(page.locator(PINO)).toBeVisible();
      await page.locator(PINO).getByRole('button', {name: 'Fechar'}).click();
      await expect(page.locator('[data-folha="lista"]')).toBeVisible();
    }
    await page.getByRole('button', {name: 'Voltar ao mapa'}).click();
    await expect(page.locator('[data-folha="proxima"]')).toBeVisible();

    await andarAte(context, LONGE);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
  });

  // Com o cartão aberto o seguir pausa, e arrastar não o desliga mais (06/11): fechou o cartão, o
  // mapa volta para ele. Era o contrário: desligava, e só a mira religava.
  test('arrastar com o cartão aberto não desliga o seguir: fechou, o mapa volta para ele', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await lista(page);
    await page.locator('[data-folha="lista"] .parada .txt').first().click();
    await expect(page.locator(PINO)).toBeVisible();
    // em cima, longe do cartão e da parada, que fica no meio
    const caixa = (await page.locator('#map').boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + 150);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width / 2 + 80, caixa.y + 190, {steps: 8});
    await page.mouse.up();
    // com o cartão aberto a mira fica apagada (07/11); que o arrasto não desligou, mostra o fechar
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'false');
    await page.locator(PINO).getByRole('button', {name: 'Fechar'}).click();
    await page.getByRole('button', {name: 'Voltar ao mapa'}).click();
    await expect(page.locator('[data-folha="proxima"]')).toBeVisible();

    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    await andarAte(context, LONGE);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  // Pedro, 07/11: "não está seguindo a localização dele". Entregou a 51 pelo cartão do pino, o
  // cartão ficou aberto, e o mapa ficou no pino enquanto ele rodava, com a mira acesa. O cartão
  // aberto pausa o seguir, para ele olhar o lugar; afastando 50 m de onde abriu, ele já foi embora.
  test('com o cartão do pino aberto a mira apaga; parado na porta o cartão fica; afastando 50 m, fecha e o mapa volta a segui-lo', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await page.locator('.pino.alvo').click({force: true});
    await page.locator(`${PINO} [data-acao=entregue]`).first().click();
    await expect(page.locator(PINO), 'depois de entregar, o cartão continua aberto').toBeVisible();
    await expect(page.locator('#btnEu'), 'com o cartão aberto o mapa não segue: a mira não pode dizer que segue').toHaveAttribute('aria-pressed', 'false');

    // na porta, o GPS anda uns metros sem ele sair dali
    await context.setGeolocation(aNorte(NA_ROTA, 20));
    await page.waitForTimeout(1500);
    await expect(page.locator(PINO), 'parado na porta, o cartão fica').toBeVisible();

    await context.setGeolocation(aNorte(NA_ROTA, 60));
    await expect(page.locator(PINO), 'a 60 m de onde abriu, o cartão fecha').toHaveCount(0);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    // e continua indo junto (20 m: 60 m num segundo seria salto do GPS, que espera confirmar)
    await context.setGeolocation(aNorte(NA_ROTA, 80));
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  // Dono, 27/11: abriu o cartão do P33 vindo de longe e andou até a porta; o cartão fechou sozinho, o
  // da próxima apareceu debaixo do dedo, e o Entreguei caiu na Rua João Dionízio 208, a 600 m dali.
  const pinoDoAlvo = async (page) => {
    const e = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
    const ordem: string[] = e.rota.areas.flatMap((a: any) => a.ordem);
    const p = e.paradas.find((x: any) => x.id === ordem.find(id => !e.paradas.find((y: any) => y.id === id).entregue));
    return {lat: p.lat, lng: p.lng};
  };
  const metrosAte = (a: {latitude: number; longitude: number}, b: {lat: number; lng: number}) =>
    111320 * Math.hypot(a.latitude - b.lat, (a.longitude - b.lng) * Math.cos(b.lat * Math.PI / 180));
  // a fração f do caminho de NA_ROTA até o ponto (f negativa: para o lado oposto)
  const rumo = (b: {lat: number; lng: number}, f: number) =>
    ({...NA_ROTA, latitude: NA_ROTA.latitude + (b.lat - NA_ROTA.latitude) * f, longitude: NA_ROTA.longitude + (b.lng - NA_ROTA.longitude) * f});

  test('com o cartão do pino aberto, andando até o pino, o cartão fica', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    const pino = await pinoDoAlvo(page);
    // ele vem de 300 m ao sul do pino, de 30 em 30 m, devagar, até 20 m da porta
    const vindo = (m: number) => ({...NA_ROTA, latitude: pino.lat - m / 111320, longitude: pino.lng});
    await andarAte(context, vindo(300));
    await page.waitForTimeout(500);
    // daqui o pino fica fora da tela: o cartão vem da lista, que abre na próxima
    await lista(page);
    await page.locator('[data-folha="lista"] .parada .txt').first().click();
    await expect(page.locator(PINO)).toBeVisible();
    for (let m = 270; m >= 20; m -= 30) {
      await context.setGeolocation(vindo(m));
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1200);
    await expect(page.locator(PINO), 'chegando na porta, o cartão continua o do pino').toBeVisible();
  });

  test('o cartão do pino fechou sozinho: o toque logo em seguida não entrega a próxima que apareceu', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    const pino = await pinoDoAlvo(page);
    const entregues = () => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.filter((p: any) => p.entregue).length);
    await page.locator('.pino.alvo').click({force: true});
    await expect(page.locator(PINO)).toBeVisible();
    await context.setGeolocation(rumo(pino, -60 / metrosAte(NA_ROTA, pino)));
    await expect(page.locator(PINO), 'indo embora, o cartão fecha').toHaveCount(0);
    await page.locator('[data-folha="proxima"] .grande-btn').click();
    await page.waitForTimeout(800);
    expect(await entregues(), 'o toque que já vinha não entregou').toBe(0);
    await page.waitForTimeout(400);
    await page.locator('[data-folha="proxima"] .grande-btn').click();
    await expect.poll(entregues, 'passado o segundo, o toque entrega').toBe(1);
  });

  // Era uma armadilha: com o cartão aberto, a mira acesa desligava o seguir no primeiro toque, e o
  // segundo centrava uma vez só.
  test('com o cartão do pino aberto, um toque na mira fecha o cartão, vai até ele e volta a seguir', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await page.locator('.pino.alvo').click({force: true});
    await expect(page.locator(PINO)).toBeVisible();
    // 30 m: menos que os 50 m que fecham o cartão, e o mapa fica para trás
    await context.setGeolocation(aNorte(NA_ROTA, 30));
    await page.waitForTimeout(1500);
    expect(await doMeio(page), 'com o cartão aberto, o mapa foi atrás').toBeGreaterThan(10);

    await page.locator('#btnEu').click();
    await expect(page.locator(PINO), 'um toque fecha o cartão').toHaveCount(0);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    await context.setGeolocation(aNorte(NA_ROTA, 45));
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  // A mesma armadilha do cartão (07/11), com a lista puxada: o mapa não segue, a mira dizia que
  // seguia, e o toque nela desligava o seguir sem nada mudar na tela.
  test('com a lista puxada a mira apaga, e um toque volta ao mapa seguindo', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await lista(page);
    await expect(page.locator('#btnEu'), 'com a lista o mapa não segue: a mira não pode dizer que segue').toHaveAttribute('aria-pressed', 'false');
    await page.locator('#btnEu').click();
    await expect(page.locator('[data-folha="proxima"]'), 'um toque volta ao mapa').toBeVisible();
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    await context.setGeolocation(aNorte(NA_ROTA, 20));
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  // Escolhendo pinos (ou circulando grupos, ou com o toque no mapa armado), o mapa também não segue.
  // Aqui o toque na mira não larga o que ele está fazendo: só traz o mapa até ele, e o seguir volta
  // quando ele sai do modo. Antes, o toque desligava o seguir, e saindo do modo o mapa ficava parado.
  test('escolhendo pinos para o Maps a mira apaga; o toque não larga a escolha, e saindo o mapa segue', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await page.locator('[data-folha="proxima"] [data-escolher-maps]').click();
    const cartao = page.locator('[data-folha="escolher"]');
    await expect(cartao).toBeVisible();
    await expect(page.locator('#btnEu'), 'escolhendo, o mapa não segue: a mira não pode dizer que segue').toHaveAttribute('aria-pressed', 'false');
    await page.locator('#btnEu').click();
    await expect(cartao, 'a mira não larga a escolha').toBeVisible();

    await page.goBack();
    await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await context.setGeolocation(aNorte(NA_ROTA, 20));
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  // Pelas outras telas, o mesmo: o "Ver no mapa" e o Editar da Conferir abrem o pino na Rota, e
  // voltar devolve à Conferir. De volta à Rota, o mapa segue sem a mira.
  test('ver no mapa e editar pela Conferir não desligam o seguir', async ({page, context}) => {
    // o primeiro Editar é cancelado; o segundo cola um link com a posição
    const respostas: (string | null)[] = [null, 'https://www.google.com/maps/place/x/@-10.9436597,-37.0553986,17z/data=!3m1!4b1!8m2!3d-10.943665!4d-37.0528237'];
    page.on('dialog', d => { const r = respostas.shift(); return r == null ? d.dismiss() : d.accept(r); });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await aba(page, '2. Conferir');
    const item = page.locator('[data-item]').first();
    await item.getByRole('button', {name: 'Ver no mapa'}).click();
    await expect(page.locator(PINO)).toBeVisible();
    await page.goBack();
    await item.getByRole('button', {name: 'Editar'}).click();
    await expect(page.locator(PINO)).toHaveCount(0);
    await item.getByRole('button', {name: 'Editar'}).click();
    await expect(page.locator(PINO)).toBeVisible();
    await page.goBack();
    await aba(page, '3. Rota');
    await expect(page.locator('[data-folha="proxima"]')).toBeVisible();

    await andarAte(context, LONGE);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
  });
});

// "Qualquer mexida ainda para de seguir": arrastar e pinçar desligavam o seguir, e só a mira
// religava (dono, 06/11). Com dedos de verdade, como no celular: o primeiro dedo encosta e anda um
// pouco antes de o segundo chegar.
test.describe('o seguir com os dedos', () => {
  const NA_ROTA = {latitude: -10.9605, longitude: -37.0455, accuracy: 10};
  test.use({viewport: {width: 412, height: 915}, hasTouch: true, isMobile: true, permissions: ['geolocation'], geolocation: NA_ROTA});
  const doMeio = (page) => page.evaluate(() => {
    const m = document.querySelector('#map')!.getBoundingClientRect(), eu = document.querySelector('.leaflet-marker-icon:has(.eu)');
    if (!eu) return Infinity;
    const r = eu.getBoundingClientRect();
    return Math.round(Math.hypot(r.left + r.width / 2 - (m.left + m.width / 2), r.top + r.height / 2 - (m.top + m.height / 2)));
  });
  const zoomAgora = (page) => page.evaluate(() => (window as any).rotaTeste.zoomAtual() as number);
  async function comRotaMontada(page) {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    const caixa = (await page.locator('#map').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const toque = (type: string, touchPoints: {x: number; y: number}[]) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});
    // o meio do mapa, acima do cartão de baixo
    return {toque, cx: caixa.x + caixa.width / 2, cy: caixa.y + 260};
  }

  test('pinçar não desliga o seguir: fica na distância nova, e ele no meio', async ({page}) => {
    const {toque, cx, cy} = await comRotaMontada(page);
    const antes = await zoomAgora(page);
    // o primeiro dedo anda uns 40 px sozinho, como quando a mão ainda está chegando
    await toque('touchStart', [{x: cx - 30, y: cy}]);
    for (let k = 1; k <= 8; k++) await toque('touchMove', [{x: cx - 30 - k * 4, y: cy + k * 3}]);
    for (let k = 0; k <= 10; k++) await toque(k ? 'touchMove' : 'touchStart', [{x: cx - 62 - k * 8, y: cy + 24}, {x: cx + 30 + k * 8, y: cy - 8}]);
    await toque('touchEnd', []);
    await expect.poll(() => zoomAgora(page), {message: 'a pinça aproximou'}).toBeGreaterThan(antes);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
  });

  test('arrastar com o seguir ligado: o mapa obedece ao dedo e, ao soltar, volta para ele', async ({page}) => {
    const {toque, cx, cy} = await comRotaMontada(page);
    await toque('touchStart', [{x: cx, y: cy}]);
    for (let k = 1; k <= 10; k++) await toque('touchMove', [{x: cx + k * 12, y: cy + k * 6}]);
    expect(await doMeio(page), 'com o dedo na tela, o mapa foi com ele').toBeGreaterThan(60);
    await toque('touchEnd', []);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => doMeio(page), {timeout: 5_000}).toBeLessThan(4);
  });
});

// Vídeos do dono (14/11): no zoom máximo, a pinça estica o mapa além dele e, ao soltar, o mapa
// volta. Os balões voltavam para o lugar e os pinos ficavam onde estavam no meio da pinça, longe
// do balão e da entrega, até a próxima mexida. Com dedos de verdade, como no celular.
test.describe('a pinça além do zoom máximo', () => {
  const NA_ROTA = {latitude: -10.9605, longitude: -37.0455, accuracy: 10};
  test.use({viewport: {width: 412, height: 915}, hasTouch: true, isMobile: true, permissions: ['geolocation'], geolocation: NA_ROTA});
  const zoomAgora = (page) => page.evaluate(() => (window as any).rotaTeste.zoomAtual() as number);
  // Os pinos cuja ponta (o pé do ícone) não cai no ponto da entrega que ele desenha, a primeira da
  // pilha. Os que estão fora da tela também contam: o Leaflet os mantém no lugar do mesmo jeito.
  const foraDoLugar = (page) => page.evaluate(() => {
    const ps = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {id: string; lat: number; lng: number}[];
    const m = document.querySelector('#map')!.getBoundingClientRect();
    const icones = [...document.querySelectorAll('.leaflet-marker-icon')].filter(el => el.querySelector('.pino[data-ids]'));
    return {
      pinos: icones.length,
      fora: icones.filter(el => {
        const p = ps.find(q => q.id === el.querySelector('.pino')!.getAttribute('data-ids')!.split('+')[0])!;
        const r = el.getBoundingClientRect(), alvo = (window as any).rotaTeste.pixel(p.lat, p.lng);
        return Math.hypot(r.left - m.left + r.width / 2 - alvo.x, r.top - m.top + r.height - alvo.y) > 3;
      }).length,
    };
  });
  // dois dedos se afastando devagar, até passar do máximo; devolve o zoom com os dedos na tela
  async function pincarAlemDoMaximo(page, x: number, y: number) {
    const cdp = await page.context().newCDPSession(page);
    const toque = (type: string, touchPoints: {x: number; y: number}[]) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});
    await toque('touchStart', [{x: x - 30, y}, {x: x + 30, y}]);
    for (let k = 1; k <= 14; k++) {
      await toque('touchMove', [{x: x - 30 - k * 9, y: y - k * 2}, {x: x + 30 + k * 9, y: y + k * 2}]);
      await page.waitForTimeout(40);
    }
    const esticado = await zoomAgora(page);
    await toque('touchEnd', []);
    await cdp.detach();
    return esticado;
  }
  // a volta do mapa acabou: no máximo de novo, sem animação, e passado o prazo de 250 ms com que o
  // Leaflet encerra a animação quando o navegador não avisa
  const voltou = async (page) => {
    await expect.poll(() => zoomAgora(page)).toBe(19);
    await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0);
    await page.waitForTimeout(400);
  };

  test('com o mapa solto, cada pino volta para o ponto da sua entrega', async ({page}) => {
    const {garantirMapa, verNoMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await garantirMapa(page);
    const [p] = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.filter((q: any) => q.lat != null));
    await verNoMapa(page, p.lat, p.lng, 19);
    expect((await foraDoLugar(page)).fora, 'antes da pinça, no lugar').toBe(0);
    const caixa = (await page.locator('#map').boundingBox())!;
    // a volta nem sempre cai no mesmo caminho do Leaflet: três pinças seguidas, como no vídeo
    for (let vez = 1; vez <= 3; vez++) {
      expect(await pincarAlemDoMaximo(page, caixa.x + caixa.width / 2, caixa.y + 250), 'a pinça passou do máximo').toBeGreaterThan(19.5);
      await voltou(page);
      const r = await foraDoLugar(page);
      expect(r.pinos).toBeGreaterThan(0);
      expect(r.fora, `pinça ${vez}: pinos fora do ponto da entrega`).toBe(0);
    }
  });

  test('seguindo, a pinça em volta dele também devolve cada pino ao seu ponto', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => (window as any).rotaTeste.zoom(19));
    await voltou(page);
    expect((await foraDoLugar(page)).fora, 'antes da pinça, no lugar').toBe(0);
    const caixa = (await page.locator('#map').boundingBox())!;
    expect(await pincarAlemDoMaximo(page, caixa.x + caixa.width / 2, caixa.y + 250), 'a pinça passou do máximo').toBeGreaterThan(19.5);
    await voltou(page);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    const r = await foraDoLugar(page);
    expect(r.pinos).toBeGreaterThan(0);
    expect(r.fora, 'pinos fora do ponto da entrega').toBe(0);
  });
});

// O cartão de baixo muda de altura, e o Leaflet só desenha no tamanho que ele conhece: no print
// do Pedro (03/10), o cartão de um pino, mais baixo, deixou uma faixa cinza no pé do mapa.
test.describe('o mapa acompanha a altura do cartão', () => {
  test.use({viewport: {width: 384, height: 760}});

  const confere = async (page) => {
    await expect.poll(async () => {
      const t = await page.evaluate(() => (window as any).rotaTeste.tamanho());
      const b = (await page.locator('#map').boundingBox())!;
      return Math.abs(t.altura - Math.round(b.height));
    }).toBeLessThan(2);
  };

  test('ao abrir o cartão de um pino e ao minimizar', async ({page}) => {
    const {verNoMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await confere(page);

    const alvo = await page.locator('.proxima .endereco').innerText().then(t => page.evaluate(t2 => {
      const p = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.texto === t2);
      return {lat: p.lat, lng: p.lng};
    }, t));
    await verNoMapa(page, alvo.lat, alvo.lng, 18);
    await page.locator('.leaflet-marker-icon .pino.alvo').click();
    await expect(page.locator(PINO)).toBeVisible();
    await confere(page);

    await page.getByRole('button', {name: 'Fechar'}).click();
    await page.getByRole('button', {name: 'Minimizar'}).click();
    await expect(page.getByRole('button', {name: 'Mostrar a próxima entrega'})).toBeVisible();
    await confere(page);
  });
});

// Na rua ele está na porta com o mapa aberto. Tocar no pino abre embaixo as entregas dele, com
// os mesmos botões do cartão da próxima: marcar entregue e arrumar o pino sem sair do mapa.
test.describe('agir pelo pino', () => {
  // sem GPS de propósito: com ele, o marcador da saída cai em cima da entrega e tapa o pino
  test.use({viewport: {width: 412, height: 915}});

  test('o cartão do pino marca entregue e abre a correção da posição', async ({page}) => {
    const {aviso, garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);

    // a próxima parada da sequência sai destacada
    await expect(page.locator('.pino.alvo')).toHaveCount(1);
    const feitasAntes = await page.locator('.resumo').innerText();

    await page.locator('.pino.alvo').click();
    await page.locator(`${PINO} [data-acao=entregue]`).first().click();
    await expect.poll(async () => (await page.locator('.resumo').innerText()) !== feitasAntes, {timeout: 10_000}).toBe(true);

    // e o outro botão começa a correção ali mesmo — na próxima, que ainda não foi entregue
    await page.locator('.pino.alvo').click();
    await page.locator(`${PINO} [data-acao=arrumar]`).first().click();
    await expect(aviso(page)).toContainText('Toque no mapa, no local da entrega');
  });

  // Leudy, 29/09: tocou em Arrumar, entregou pelo outro botão, e meio minuto depois um toque no
  // mapa levou o pino da entrega feita para o mato — e a nuvem recebeu aquilo como correção dela.
  const posicaoDaProxima = (page) => page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}');
    const t = document.querySelector('.proxima .endereco')!.textContent;
    const p = e.paradas.find((x: any) => x.texto === t);
    return {id: p.id, lat: p.lat, lng: p.lng};
  });
  const posicaoDe = (page, id: string) => page.evaluate(i => {
    const p = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas.find((x: any) => x.id === i);
    return {lat: p.lat, lng: p.lng, entregue: !!p.entregue};
  }, id);

  // "Tirou a função de pausar?" (05/10): na porta ele toca no pino, e o Depois só existia no
  // cartão da próxima. Do pino: adia, sai da sequência, e o mesmo lugar traz de volta.
  test('o cartão do pino deixa para depois, e traz de volta', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);
    const {id} = await posicaoDaProxima(page);
    const situacao = () => page.evaluate(i => {
      const e = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}');
      return {adiada: !!e.paradas.find((x: any) => x.id === i).adiada, naSequencia: e.rota.areas.some((a: any) => a.ordem.includes(i))};
    }, id);

    await page.locator('.pino.alvo').click();
    await page.locator(`${PINO} [data-acao=depois][data-ids="${id}"]`).click();
    await expect.poll(situacao).toEqual({adiada: true, naSequencia: false});

    await page.locator(`${PINO} [data-acao=voltar-rota][data-ids="${id}"]`).click();
    await expect.poll(async () => (await situacao()).adiada).toBe(false);
    await expect(page.locator(`${PINO} [data-acao=depois][data-ids="${id}"]`)).toBeVisible();
  });

  // "Cadê o botão do Waze?" (Luan, 06/10): ele tocou no pino da próxima, e o Waze só existia no
  // cartão que o toque troca.
  test('o cartão do pino abre o Waze na posição daquele pino', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);
    const {id, lat, lng} = await posicaoDaProxima(page);

    await page.locator('.pino.alvo').click();
    await expect(page.locator(`${PINO} [data-acao=waze][data-ids="${id}"]`))
      .toHaveAttribute('href', `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`);
  });

  // "Tiramos a parte que joga as paradas pro Maps?" (dono, 16/10): desde 02/10 só a lista tinha.
  // Mas o botão levar o trecho todo atrapalhava: "ao clicar num Maps continua indo pra 9 pinos, só
  // quero um" (dono, na rua, 25/11). O Maps vai só até o pino; o trecho fica num link à parte.
  test('o Maps do cartão do pino vai só até este pino, entre o Waze e o Depois', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);
    const {id, lat, lng} = await posicaoDaProxima(page);

    await page.locator('.pino.alvo').click();
    const maps = page.locator(`${PINO} [data-acao=maps][data-ids="${id}"]`);
    const u = new URL((await maps.getAttribute('href'))!);
    expect(u.searchParams.get('destination')).toBe(`${lat},${lng}`);
    expect(u.searchParams.get('waypoints'), 'nenhuma parada no meio').toBeNull();
    expect(await maps.locator('xpath=..').locator('.btn').evaluateAll(bs => bs.map(b => b.getAttribute('data-acao'))))
      .toEqual(['waze', 'maps', 'depois']);
  });

  test('o trecho para o Maps fica num link à parte, que começa neste pino e diz quantas paradas leva', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);
    const {id, lat, lng} = await posicaoDaProxima(page);

    await page.locator('.pino.alvo').click();
    const trecho = page.locator(`${PINO} [data-acao=maps-varios][data-ids="${id}"]`);
    const u = new URL((await trecho.getAttribute('href'))!);
    const pontos = [...u.searchParams.get('waypoints')!.split('|'), u.searchParams.get('destination')];
    expect(pontos[0], 'começa neste pino').toBe(`${lat},${lng}`);
    expect(pontos.length).toBeGreaterThan(1);
    expect(pontos.length).toBeLessThanOrEqual(9);
    // sem ponto de fim nesta rota: cada ponto do link é uma parada
    await expect(trecho).toHaveText(`Maps com as próximas ${pontos.length}`);
  });

  // Os pinos à vista (acima do cartão, abaixo do topo), cada um com os lugares que junta: entregas
  // por entregar a mais de 10 m uma da outra, como a escolha conta.
  const pinosAVista = (page) => page.evaluate(() => {
    const ps = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {id: string; lat: number; lng: number; entregue?: boolean}[];
    const m = document.querySelector('#map')!.getBoundingClientRect(), painel = document.querySelector('#painel')!.getBoundingClientRect();
    const longe = (a: any, b: any) => 111320 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180)) > 10;
    return [...document.querySelectorAll('.pino[data-ids]')].flatMap(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.left >= m.left && r.right <= m.right && r.top >= m.top + 70 && r.bottom <= painel.top - 5)) return [];
      const lugares: any[] = [];
      for (const id of el.getAttribute('data-ids')!.split('+')) {
        const p = ps.find(q => q.id === id)!;
        if (!p.entregue && lugares.every(q => longe(q, p))) lugares.push(p);
      }
      return lugares.length ? [{chave: el.getAttribute('data-ids')!, lugares: lugares.map(p => p.id)}] : [];
    });
  });
  const doPino = (page, id: string, o: 'chave' | 'texto') => page.evaluate(([i, oq]) => {
    const el = [...document.querySelectorAll('.pino[data-ids]')].find(p => p.getAttribute('data-ids')!.split('+').includes(i));
    return el ? (oq === 'chave' ? el.getAttribute('data-ids') : el.textContent) : null;
  }, [id, o]);
  const meioDe = (page, ids: string[]) => page.evaluate(is => {
    const ps = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas;
    const [p, q] = is.map((i: string) => ps.find((x: any) => x.id === i));
    return {lat: (p.lat + q.lat) / 2, lng: (p.lng + q.lng) / 2};
  }, ids);

  // "Ou escolher quais pinos colocar, até 9" (dono, 16/10): tocando nos pinos do mapa.
  test('escolher pinos para o Maps: a ordem dos toques é a do Maps, tocar de novo tira, e o voltar sai', async ({page}) => {
    const {garantirMapa, verNoMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await montar(page);
    await garantirMapa(page);
    const estado = () => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {id: string; lat: number; lng: number}[]);
    const pino = (k: string) => page.locator(`.pino[data-ids="${k}"]`);
    const proxima = await posicaoDaProxima(page);

    await page.locator('[data-folha="proxima"] [data-escolher-maps]').click();
    const cartao = page.locator('[data-folha="escolher"]');
    await expect(cartao.locator('[data-quantas]')).toHaveText('0 de 9');
    // três pinos à vista que, somados, cabem nos nove: as letras de cada um seguem quantos lugares
    // ele junta ("A+1" para dois)
    const tres = async () => (await pinosAVista(page)).sort((v, w) => v.lugares.length - w.lugares.length).slice(0, 3);
    let vista = await tres();
    for (const zz of [16, 17, 18]) {
      if (vista.length === 3 && vista.reduce((n, v) => n + v.lugares.length, 0) <= 9) break;
      await verNoMapa(page, proxima.lat, proxima.lng, zz);
      vista = await tres();
    }
    expect(vista.length, 'três pinos à vista').toBe(3);
    const [x, y, z] = vista;
    const rotulo = (de: number, n: number) => 'ABCDEFGHI'[de] + (n > 1 ? `+${n - 1}` : '');
    // fora da ordem do mapa, de propósito
    for (const v of [z, x, y]) await pino(v.chave).click();
    const [nz, nx, ny] = [z, x, y].map(v => v.lugares.length);
    await expect(cartao.locator('[data-quantas]')).toHaveText(`${nz + nx + ny} de 9`);
    await expect(pino(z.chave)).toHaveText(rotulo(0, nz));
    await expect(pino(x.chave)).toHaveText(rotulo(nz, nx));
    await expect(pino(y.chave)).toHaveText(rotulo(nz + nx, ny));
    await expect(page.locator(PINO), 'tocar escolhe, não abre o cartão do pino').toHaveCount(0);

    const escolhidas = await cartao.locator('[data-escolhida]').evaluateAll(es => es.map(e => e.getAttribute('data-escolhida')!));
    expect(escolhidas, 'na ordem dos toques, e cada pino com os seus lugares').toEqual([...z.lugares, ...x.lugares, ...y.lugares]);
    const ps = await estado();
    const ponto = (id: string) => { const p = ps.find(q => q.id === id)!; return `${p.lat},${p.lng}`; };
    const u = new URL((await cartao.locator('[data-acao=abrir-maps]').getAttribute('href'))!);
    expect(u.searchParams.get('waypoints')).toBe(escolhidas.slice(0, -1).map(ponto).join('|'));
    expect(u.searchParams.get('destination')).toBe(ponto(escolhidas.at(-1)!));

    await pino(x.chave).click();
    await expect(cartao.locator('[data-quantas]')).toHaveText(`${nz + ny} de 9`);
    await expect(pino(y.chave), 'quem vinha depois sobe').toHaveText(rotulo(nz, ny));

    await page.goBack();
    await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
    await expect(pino(z.chave)).not.toHaveText(rotulo(0, nz));
    await pino(z.chave).click();
    await expect(page.locator(PINO), 'fora da escolha, o pino volta a abrir o cartão').toBeVisible();
  });

  // Ideia do Luan (16/10), como no Circuit: circular no mapa o que fazer primeiro, depois o
  // seguinte. A rota vai grupo por grupo, na ordem do dedo, e as de fora por último.
  test('circular grupos no mapa: a rota segue os círculos na ordem desenhada, e as de fora vão por último', async ({page}) => {
    const {aviso, garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await garantirMapa(page);
    await page.locator('[data-folha="montar"] [data-circular]').click();
    const cartao = page.locator('[data-folha="circular"]');
    await expect(cartao.locator('[data-acao="montar-grupos"]')).toBeDisabled();
    await page.waitForFunction(() => !!(window as any).rotaTeste);

    // as por fazer, com onde caem na tela
    const naTela = () => page.evaluate(() => {
      const ps = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {id: string; lat: number | null; lng: number; entregue?: boolean; adiada?: boolean}[];
      const m = document.querySelector('#map')!.getBoundingClientRect();
      return ps.filter(p => !p.entregue && !p.adiada && p.lat != null).map(p => {
        const q = (window as any).rotaTeste.pixel(p.lat, p.lng);
        return {id: p.id, x: m.left + q.x, y: m.top + q.y};
      });
    });
    // o mapa se ajeita ao cartão novo: as posições valem depois que param de mudar
    let todas = await naTela();
    await expect.poll(async () => { const antes = JSON.stringify(todas); todas = await naTela(); return JSON.stringify(todas) === antes; }).toBe(true);
    const caixa = (await page.locator('#map').boundingBox())!, painel = (await page.locator('#painel').boundingBox())!;
    // o corte entre os dois lados passa no maior vão entre pinos, no terço do meio: nenhum fica
    // em cima da linha
    const xs = todas.map(p => p.x).filter(x => x > caixa.x + caixa.width / 3 && x < caixa.x + 2 * caixa.width / 3).sort((a, b) => a - b);
    let corte = caixa.x + caixa.width / 2, vao = 0;
    for (let k = 1; k < xs.length; k++) if (xs[k] - xs[k - 1] > vao) { vao = xs[k] - xs[k - 1]; corte = (xs[k] + xs[k - 1]) / 2; }
    const [cima, baixo] = [caixa.y + 40, painel.y - 3];
    const direita = {x0: corte, x1: caixa.x + caixa.width - 5}, esquerda = {x0: caixa.x + 5, x1: corte};
    const dentro = (r: {x0: number; x1: number}) => todas.filter(p => p.x > r.x0 && p.x < r.x1 && p.y > cima && p.y < baixo).map(p => p.id).sort();
    const daDireita = dentro(direita), daEsquerda = dentro(esquerda);
    expect(daDireita.length, 'pinos dos dois lados').toBeGreaterThan(2);
    expect(daEsquerda.length).toBeGreaterThan(2);
    expect(daDireita.length + daEsquerda.length, 'todas à vista').toBe(todas.length);
    // com o mouse, como o dedo: começa embaixo, à esquerda do retângulo, longe do + e −
    const desenhar = async (r: {x0: number; x1: number}) => {
      await page.mouse.move(r.x0, baixo);
      await page.mouse.down();
      for (const [x, y] of [[r.x0, cima], [r.x1, cima], [r.x1, baixo], [r.x0 + 3, baixo]]) await page.mouse.move(x, y, {steps: 8});
      await page.mouse.up();
    };
    const doGrupo = (k: number) => cartao.locator(`[data-grupo="${k}"]`);
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

    await desenhar(direita);
    await expect(doGrupo(1)).toContainText(`${daDireita.length} entrega(s)`);
    await expect(cartao.locator('[data-fora]')).toHaveText(`As outras ${daEsquerda.length} vão por último, na melhor ordem.`);
    // o pino circulado ganha a cor do grupo
    const corDoGrupo = await cartao.locator('[data-grupo="1"] .badge').evaluate(b => getComputedStyle(b).backgroundColor);
    const pinoDaDireita = page.locator(`.pino[data-ids*="${daDireita[0]}"]`);
    expect(await pinoDaDireita.evaluate(b => getComputedStyle(b).backgroundColor)).toBe(corDoGrupo);
    // tocar num pino não abre o cartão dele, e um toque não é círculo
    await pinoDaDireita.click();
    await expect(page.locator(PINO)).toHaveCount(0);
    await expect(cartao.locator('[data-grupo]')).toHaveCount(1);

    expect(await page.locator('#painel').boundingBox(), 'o cartão não cresceu com o grupo').toEqual(painel);
    await desenhar(esquerda);
    await expect(doGrupo(2)).toContainText(`${daEsquerda.length} entrega(s)`);
    await expect(cartao.locator('[data-fora]')).toHaveText('Todas as entregas estão num grupo.');
    await cartao.locator('[data-desfazer-circulo]').click();
    await expect(cartao.locator('[data-grupo]')).toHaveCount(1);
    // o mesmo lado de novo: quem já tem grupo fica nele
    await desenhar(direita);
    await expect(aviso(page)).toContainText('As entregas deste círculo já estão num grupo.');
    await expect(cartao.locator('[data-grupo]')).toHaveCount(1);

    await cartao.locator('[data-acao="montar-grupos"]').click();
    await expect(page.locator('[data-folha="proxima"]')).toBeVisible({timeout: 20_000});
    const e = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
    expect(e.rota.areas.map((ra: {ordem: string[]}) => [...ra.ordem].sort()), 'primeiro o círculo, depois as de fora').toEqual([daDireita, daEsquerda]);
    expect(rgb(e.areas[0].cor), 'a área do grupo tem a cor que o pino tinha').toBe(corDoGrupo);
    const proxima = await page.locator('[data-folha="proxima"] .endereco').innerText();
    const textos = e.paradas.filter((p: {id: string}) => daDireita.includes(p.id)).map((p: {texto: string}) => p.texto);
    expect(textos, 'a próxima é do primeiro círculo').toContain(proxima);

    // livre para voltar atrás: tirar os grupos refaz a rota inteira, numa área só
    await lista(page);
    await page.locator('[data-folha="lista"] [data-tirar-grupos]').click();
    const salvo = () => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
    await expect.poll(async () => (await salvo()).rota.areas.length).toBe(1);
    const depois = await salvo();
    expect(depois.areas.some((a: {circulo?: boolean}) => a.circulo)).toBe(false);
    expect(depois.areasManual).toBe(false);
    expect(depois.rota.areas[0].ordem).toHaveLength(todas.length);
    await expect(page.locator('[data-folha="lista"] [data-tirar-grupos]')).toHaveCount(0);
  });

  // Revisão de 16/10: o mapa afastado junta num pino entregas de lugares diferentes. Escolher esse
  // pino não pode parecer que levou todos e mandar um só, nem o contador discordar das letras.
  test('escolher com pinos juntados pelo zoom: cada lugar é um destino, e afastar mostra quantos há no pino', async ({page}) => {
    const {garantirMapa, verNoMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await montar(page);
    await garantirMapa(page);
    const cartao = page.locator('[data-folha="escolher"]');
    const quantas = cartao.locator('[data-quantas]');
    const entrar = async () => {
      await page.locator('[data-folha="proxima"] [data-escolher-maps]').click();
      await expect(quantas).toHaveText('0 de 9');
    };
    await entrar();
    const afastado = await page.evaluate(() => ({z: (window as any).rotaTeste.zoomAtual(), c: (window as any).rotaTeste.centro()}));
    const afastar = () => verNoMapa(page, afastado.c.lat, afastado.c.lng, afastado.z);

    // um pino juntado que, de perto, se separa: o primeiro e o segundo lugar em pinos diferentes
    const juntados = (await pinosAVista(page)).filter(v => v.lugares.length > 1 && v.lugares.length <= 9);
    let g: {chave: string; lugares: string[]} | null = null, perto: any = null;
    for (const c of juntados) {
      const meio = await meioDe(page, c.lugares.slice(0, 2));
      await verNoMapa(page, meio.lat, meio.lng, 18);
      const [ka, kb] = [await doPino(page, c.lugares[0], 'chave'), await doPino(page, c.lugares[1], 'chave')];
      const vista = await pinosAVista(page);
      const va = vista.find(v => v.chave === ka), vb = vista.find(v => v.chave === kb);
      if (ka !== kb && va && vb) { g = c; perto = {meio, ka, kb, n: va.lugares.length + vb.lugares.length}; break; }
      await afastar();
    }
    expect(g, 'um pino juntado que se separa de perto').toBeTruthy();
    const [a, b] = g!.lugares;

    // afastado, o pino juntado vira um destino por lugar, e diz quantos
    await afastar();
    await page.locator(`.pino[data-ids="${g!.chave}"]`).click();
    await expect(quantas).toHaveText(`${g!.lugares.length} de 9`);
    await expect(cartao.locator('[data-escolhida]')).toHaveCount(g!.lugares.length);
    await expect.poll(() => doPino(page, a, 'texto')).toBe(`A+${g!.lugares.length - 1}`);
    const u = new URL((await cartao.locator('[data-acao=abrir-maps]').getAttribute('href'))!);
    expect((u.searchParams.get('waypoints') || '').split('|').filter(Boolean).length + 1, 'um destino por lugar').toBe(g!.lugares.length);

    // de perto, cada lugar com a sua letra
    await verNoMapa(page, perto.meio.lat, perto.meio.lng, 18);
    await expect.poll(() => doPino(page, a, 'texto')).toMatch(/^A/);
    await expect.poll(() => doPino(page, b, 'texto')).toMatch(/^B/);

    // de novo, do zero: de perto, dois pinos separados; afastando, eles caem no mesmo pino, que diz
    // quantos tem, e tocar nele tira os dois
    await page.goBack();
    await entrar();
    await verNoMapa(page, perto.meio.lat, perto.meio.lng, 18);
    await page.locator(`.pino[data-ids="${perto.ka}"]`).click();
    await page.locator(`.pino[data-ids="${perto.kb}"]`).click();
    await expect(quantas).toHaveText(`${perto.n} de 9`);
    await afastar();
    await expect.poll(() => doPino(page, a, 'texto')).toBe(`A+${perto.n - 1}`);
    await page.locator(`.pino[data-ids="${g!.chave}"]`).click();
    await expect(quantas).toHaveText('0 de 9');
  });

  test('na porta verificada, Entreguei, Waze, Maps e Depois cabem numa fileira do celular', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const {id} = await posicaoDaProxima(page);
    await page.evaluate(i => {
      const e = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
      e.paradas.find((x: any) => x.id === i).precisao = 'confirmado';
      localStorage.setItem('rota-entregas-v2', JSON.stringify(e));
    }, id);
    await page.reload();
    await garantirMapa(page);

    await page.locator('.pino.alvo').click();
    const fileiras = page.locator(`${PINO} .fileira`);
    await expect(fileiras).toHaveCount(1);
    expect(await fileiras.locator('.btn').evaluateAll(bs => bs.map(b => b.getAttribute('data-acao'))))
      .toEqual(['entregue', 'waze', 'maps', 'depois']);
    // nenhum texto passa da borda do botão, nem a fileira da largura do cartão
    expect(await fileiras.locator('.btn').evaluateAll(bs => bs.filter(b => b.scrollWidth > b.clientWidth).map(b => b.textContent))).toEqual([]);
    expect(await fileiras.evaluate(f => f.scrollWidth <= f.clientWidth)).toBe(true);
  });

  test('entregar depois de tocar em Arrumar desarma: o toque seguinte no mapa não leva o pino', async ({page}) => {
    const {garantirMapa, clicarMapa} = await import('./apoio');
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);
    const antes = await posicaoDaProxima(page);

    await page.locator('.pino.alvo').click();
    await page.locator(`${PINO} [data-acao=arrumar][data-ids="${antes.id}"]`).click();
    await page.locator(`${PINO} [data-acao=entregue]`).first().click();
    await expect.poll(async () => (await posicaoDe(page, antes.id)).entregue).toBe(true);
    await expect(page.locator('[data-armado]')).toHaveCount(0);

    await clicarMapa(page, antes.lat + 0.001, antes.lng + 0.001);
    expect(await posicaoDe(page, antes.id)).toEqual({lat: antes.lat, lng: antes.lng, entregue: true});
  });

  test('armado, o aviso fica na tela e diz qual pino; Cancelar desarma', async ({page}) => {
    const {garantirMapa, clicarMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);
    const antes = await posicaoDaProxima(page);
    const rua = (await page.locator('.proxima .endereco').innerText()).split(',')[0];

    await page.locator('.pino.alvo').click();
    await page.locator(`${PINO} [data-acao=arrumar][data-ids="${antes.id}"]`).click();
    // o aviso antigo sumia em 4 s, e o modo seguia armado sem nada na tela
    await page.waitForTimeout(5000);
    await expect(page.locator('[data-armado]')).toContainText(rua);

    await page.locator('[data-armado]').getByRole('button', {name: 'Cancelar'}).click();
    await expect(page.locator('[data-armado]')).toHaveCount(0);
    await clicarMapa(page, antes.lat + 0.001, antes.lng + 0.001);
    expect(await posicaoDe(page, antes.id)).toEqual({lat: antes.lat, lng: antes.lng, entregue: false});
  });
});

// Na porta, com o pacote na mão: "Estou aqui" num cartão e "Entreguei" em outro eram dois toques,
// cada um lendo o GPS de novo. O par que a nuvem aceita como porta confirmada é correção e
// passagem no mesmo ponto — então as duas têm de sair da mesma leitura.
// Dono, 17/10: no Robalo o mapa chama de "Rua B" a Professora Albertina Bezerra Ribeiro da
// planilha. Os trechos da prefeitura vêm marcados pela `npm run nomes-no-mapa` (023).
test.describe('o nome da rua no mapa', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('de perto, o nome da planilha vai em cima da rua que o mapa chama de outro jeito, e o trecho que falta é desenhado', async ({page, nuvem}) => {
    const {garantirMapa, verNoMapa} = await import('./apoio');
    const deitada = (lat: number): [number, number][] => [[lat, -37.0512], [lat, -37.0488]];
    nuvem.tabelas.ruas = [
      {nome_chave: 'acacias', fonte: 'prefeitura', linha: deitada(-10.95002), no_mapa: 'sem_nome'},
      {nome_chave: 'central', fonte: 'prefeitura', linha: deitada(-10.95122), no_mapa: 'fora'},
      // o mesmo nome noutro loteamento, longe das entregas dela
      {nome_chave: 'acacias', fonte: 'prefeitura', linha: [[-10.99, -37.0905], [-10.99, -37.0895]], no_mapa: 'sem_nome'},
      // o mapa já mostra este nome: nem vem na busca
      {nome_chave: 'palmeiras', fonte: 'prefeitura', linha: deitada(-10.95362), no_mapa: 'com_nome'},
    ];
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await garantirMapa(page);
    const nomes = page.locator('.nome-rua');
    const tracos = page.locator('path.traco-rua');

    await verNoMapa(page, -10.9506, -37.05, 17);
    await expect(nomes.filter({hasText: 'Rua das Acácias'})).toHaveCount(1);
    await expect(nomes.filter({hasText: 'Avenida Central'})).toHaveCount(1);
    await expect(nomes.filter({hasText: 'Rua das Palmeiras'})).toHaveCount(0);
    await expect(tracos, 'só o trecho que o mapa não tem').toHaveCount(1);
    // em cima da linha dela, deitado como ela
    const ondeEsta = await nomes.filter({hasText: 'Rua das Acácias'}).evaluate(el => { const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2, largura: r.width, altura: r.height}; });
    const ondeDevia = await page.evaluate(() => {
      const m = document.querySelector('#map')!.getBoundingClientRect(), q = (window as any).rotaTeste.pixel(-10.95002, -37.05);
      return {x: m.left + q.x, y: m.top + q.y};
    });
    expect(Math.abs(ondeEsta.x - ondeDevia.x)).toBeLessThan(3);
    expect(Math.abs(ondeEsta.y - ondeDevia.y)).toBeLessThan(3);
    expect(ondeEsta.largura).toBeGreaterThan(ondeEsta.altura * 3);
    const pedido = nuvem.pedidos.find(p => p.caminho === 'ruas' && p.busca.includes('no_mapa'))!;
    expect(decodeURIComponent(pedido.busca), 'pede só as ruas da planilha').toContain('acacias');
    expect(decodeURIComponent(pedido.busca)).not.toContain('albertina');

    await verNoMapa(page, -10.99, -37.09, 17);
    await expect(nomes, 'o mesmo nome longe das entregas não aparece').toHaveCount(0);

    await verNoMapa(page, -10.9506, -37.05, 14);
    await expect(nomes, 'de longe, sem nomes').toHaveCount(0);
    await expect(tracos).toHaveCount(1);
  });

  // O ajudante do teste acima: ir para longe no meio de um zoom animado, e o Leaflet voltava sozinho
  // para onde o zoom ia quando a transição acabava, depois de o teste já ter conferido o centro.
  test('o verNoMapa no meio de um zoom animado deixa o mapa onde pediu', async ({page}) => {
    const {garantirMapa, verNoMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await garantirMapa(page);
    await verNoMapa(page, -10.9506, -37.05, 14);
    // parado antes: com um zoom ainda andando, o Leaflet ignora o pedido de zoom seguinte
    await page.waitForFunction(() => !document.querySelector('.leaflet-zoom-anim'));
    // o zoom anima por 250 ms: o verNoMapa vem logo atrás, ainda dentro deles
    await page.evaluate(() => (window as any).rotaTeste.irPara(-10.9506, -37.05, 17));
    await verNoMapa(page, -10.99, -37.09, 17);
    await page.waitForTimeout(600);
    const c = await page.evaluate(() => (window as any).rotaTeste.centro());
    expect(Math.abs(c.lat + 10.99)).toBeLessThan(1e-4);
    expect(Math.abs(c.lng + 37.09)).toBeLessThan(1e-4);
  });

  // Dono, 24/11 (033): as ruas que nasceram das entregas estão no mapa com outro nome ou nenhum. O
  // nome da planilha vai no traçado do mapa onde ficam as portas, que a `npm run nomes-no-mapa` grava
  // em `linha_no_mapa`; o traçado da própria rua, que sai das portas, nunca é desenhado.
  test('a rua das entregas ganha o nome da planilha em cima da rua do mapa, sem traço', async ({page, nuvem}) => {
    const {garantirMapa, verNoMapa} = await import('./apoio');
    const deitada = (lat: number): [number, number][] => [[lat, -37.0512], [lat, -37.0488]];
    nuvem.tabelas.ruas = [
      // a Rua das Flores da rota-d tem entrega em -10.9548, -37.05
      {nome_chave: 'flores', fonte: 'entregas', linha: [[-10.9548, -37.05]], no_mapa: 'sem_nome', linha_no_mapa: [deitada(-10.95482)]},
    ];
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await garantirMapa(page);
    await verNoMapa(page, -10.9548, -37.05, 17);
    const flores = page.locator('.nome-rua').filter({hasText: 'Rua das Flores'});
    await expect(flores).toHaveCount(1);
    await expect(page.locator('path.traco-rua'), 'só o nome: o traçado é o do mapa').toHaveCount(0);
    // em cima da linha do mapa, deitado como ela
    const ondeEsta = await flores.evaluate(el => { const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2, largura: r.width, altura: r.height}; });
    const ondeDevia = await page.evaluate(() => {
      const m = document.querySelector('#map')!.getBoundingClientRect(), q = (window as any).rotaTeste.pixel(-10.95482, -37.05);
      return {x: m.left + q.x, y: m.top + q.y};
    });
    expect(Math.abs(ondeEsta.x - ondeDevia.x)).toBeLessThan(3);
    expect(Math.abs(ondeEsta.y - ondeDevia.y)).toBeLessThan(3);
    expect(ondeEsta.largura).toBeGreaterThan(ondeEsta.altura * 3);
  });

  test('sem a coluna da 033 na nuvem, os nomes da prefeitura seguem como antes', async ({page, context, nuvem}) => {
    const {aviso, garantirMapa, verNoMapa} = await import('./apoio');
    nuvem.tabelas.ruas = [{nome_chave: 'acacias', fonte: 'prefeitura', linha: [[-10.95002, -37.0512], [-10.95002, -37.0488]], no_mapa: 'sem_nome'}];
    let pedidos = 0;
    await context.route(/\/rest\/v1\/ruas\?.*linha_no_mapa/, r => {
      pedidos++;
      return r.fulfill({status: 400, contentType: 'application/json', headers: {'access-control-allow-origin': '*'},
        body: JSON.stringify({code: '42703', details: null, hint: null, message: 'column ruas.linha_no_mapa does not exist'})});
    });
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await garantirMapa(page);
    await expect.poll(() => pedidos, 'o app pediu os nomes das ruas das entregas').toBeGreaterThan(0);
    await verNoMapa(page, -10.9506, -37.05, 17);
    await expect(page.locator('.nome-rua').filter({hasText: 'Rua das Acácias'})).toHaveCount(1);
    await expect(aviso(page)).not.toContainText(/linha_no_mapa|não deu|erro/i);
  });

  // Revisão de 17/10: desfazer a 023 tira a coluna. O app tem de seguir igual, só sem os nomes, e o
  // erro de JavaScript que escapasse a fixture pega.
  test('sem a coluna da 023 na nuvem, o mapa e a rota seguem como sempre, sem nomes e sem aviso', async ({page, context, nuvem}) => {
    const {aviso, garantirMapa, montar, verNoMapa} = await import('./apoio');
    nuvem.tabelas.ruas = [{nome_chave: 'acacias', fonte: 'prefeitura', linha: [[-10.95002, -37.0512], [-10.95002, -37.0488]], no_mapa: 'sem_nome'}];
    let pedidos = 0;
    // como o PostgREST responde a uma coluna que não existe
    await context.route(/\/rest\/v1\/ruas\?.*no_mapa/, r => {
      pedidos++;
      return r.fulfill({status: 400, contentType: 'application/json', headers: {'access-control-allow-origin': '*'},
        body: JSON.stringify({code: '42703', details: null, hint: null, message: 'column ruas.no_mapa does not exist'})});
    });
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await garantirMapa(page);
    await expect.poll(() => pedidos, 'o app pediu os nomes').toBeGreaterThan(0);
    await verNoMapa(page, -10.9506, -37.05, 17);
    await expect(page.locator('.nome-rua')).toHaveCount(0);
    await expect(page.locator('path.traco-rua')).toHaveCount(0);
    await expect(aviso(page)).not.toContainText(/no_mapa|não deu|erro/i);
    await montar(page);
    await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
  });
});

// Luan, 16/10: no celular, o dedo não desenhava nada. O teste de cima desenha com o mouse, e só o
// dedo o navegador toma como rolagem: a regra de toque do Leaflet chegava depois e ganhava.
test.describe('circular com o dedo', () => {
  test.use({viewport: {width: 412, height: 915}, hasTouch: true, isMobile: true});

  test('dois dedos aproximam o mapa e não desenham; um dedo desenha o grupo', async ({page}) => {
    const {aviso, garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await garantirMapa(page);
    await page.locator('[data-folha="montar"] [data-circular]').tap();
    const cartao = page.locator('[data-folha="circular"]');
    await expect(cartao).toBeVisible();
    await page.waitForFunction(() => !!(window as any).rotaTeste);
    const caixa = (await page.locator('#map').boundingBox())!, painel = (await page.locator('#painel').boundingBox())!;
    const cx = caixa.x + caixa.width / 2, cy = (caixa.y + painel.y) / 2;
    const cdp = await page.context().newCDPSession(page);
    const toque = (type: string, touchPoints: {x: number; y: number}[]) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});
    const zoom = () => page.evaluate(() => (window as any).rotaTeste.zoomAtual() as number);

    // pinça girando: o primeiro dedo faz um arco, que desenhado viraria círculo
    const antes = await zoom();
    const dedos = (k: number) => {
      const r = 30 + k * 10, a = Math.PI + k * 0.15;
      return [{x: cx + r * Math.cos(a), y: cy + r * Math.sin(a)}, {x: cx - r * Math.cos(a), y: cy - r * Math.sin(a)}];
    };
    await toque('touchStart', dedos(0));
    for (let k = 1; k <= 12; k++) await toque('touchMove', dedos(k));
    await toque('touchEnd', []);
    await expect.poll(zoom, 'o mapa aproximou').toBeGreaterThan(antes);
    await expect(cartao.locator('[data-grupo]')).toHaveCount(0);
    await expect(aviso(page), 'nem tentou fechar um círculo').not.toContainText('círculo');

    // um dedo, em volta do que está à vista
    const [x0, x1, y0, y1] = [caixa.x + 15, caixa.x + caixa.width - 15, caixa.y + 90, painel.y - 15];
    await toque('touchStart', [{x: x0, y: y1}]);
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0 + 5, y1]]) {
      for (let k = 1; k <= 6; k++) await toque('touchMove', [{x: x0 + (x - x0) * k / 6, y: y1 + (y - y1) * k / 6}]);
    }
    await toque('touchEnd', []);
    await expect(cartao.locator('[data-grupo]')).toHaveCount(1);
    await expect(cartao.locator('[data-grupo="1"]')).toContainText('entrega(s)');
  });
});

test.describe('entreguei aqui, pelo pino', () => {
  // o GPS só é ligado depois de montar: com ele, o marcador da saída cai em cima da entrega
  test.use({viewport: {width: 412, height: 915}});
  const PORTA = {latitude: -10.9605, longitude: -37.0455};

  const paradas = (page, ids: string[]) => page.evaluate(ids2 => {
    const ps = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas || [];
    return ps.filter((p: any) => ids2.includes(p.id)).map((p: any) => ({entregue: !!p.entregue, lat: p.lat, lng: p.lng, precisao: p.precisao}));
  }, ids);
  const enviados = (nuvem, caminho: string) => nuvem.pedidos.filter(p => p.caminho === caminho && p.metodo === 'POST')
    .flatMap(p => Array.isArray(p.corpo) ? p.corpo : [p.corpo]);

  // de perto, que é como ele está na porta
  async function abrirPinoDaProxima(page) {
    const {verNoMapa} = await import('./apoio');
    const texto = await page.locator('.proxima .endereco').innerText();
    const [lat, lng] = await page.evaluate(t => {
      const p = (JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas || []).find((x: any) => x.texto === t);
      return [p.lat, p.lng];
    }, texto);
    await verNoMapa(page, lat, lng, 18);
    await page.locator('.pino.alvo').click();
  }

  async function tocarAqui(page, context, precisao: number) {
    const {garantirMapa} = await import('./apoio');
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({...PORTA, accuracy: precisao});
    await abrirPinoDaProxima(page);
    const botao = page.locator(`${PINO} [data-acao=aqui]`).first();
    const ids = (await botao.getAttribute('data-ids'))!.split('+');
    const antes = await paradas(page, ids);
    await botao.click();
    return {ids, antes};
  }

  // A passagem espera o prazo de desfazer na fila do celular (05/10); a correção vai na hora.
  test('um toque entrega, põe o pino na porta e manda o par que confirma; desfazer volta tudo', async ({page, context, nuvem}) => {
    const {aviso} = await import('./apoio');
    await page.clock.install();
    const {ids, antes} = await tocarAqui(page, context, 8);
    await expect(aviso(page)).toContainText('com a porta marcada aqui (±8 m)');
    await expect(aviso(page)).toContainText('Vai para os outros motoristas como porta confirmada');
    expect(await paradas(page, ids)).toEqual(ids.map(() => ({entregue: true, lat: PORTA.latitude, lng: PORTA.longitude, precisao: 'manual'})));

    await expect.poll(() => enviados(nuvem, 'correcoes').length, {timeout: 20_000}).toBeGreaterThan(0);
    const [correcao] = enviados(nuvem, 'correcoes') as any[];
    expect(correcao).toMatchObject({lat: PORTA.latitude, lng: PORTA.longitude});
    // a passagem que espera é a outra metade do par que a `posicoes` cruza: mesma chave, mesmo
    // ponto, e GPS bom o bastante para ser passagem
    const esperando = () => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-fila-seguradas') || '[]')
      .flatMap((s: any) => s.ops).filter((op: any) => op.tipo === 'observacao'));
    const [passagem] = await esperando();
    expect(passagem).toMatchObject({chave: correcao.chave_lugar, lat: correcao.lat, lng: correcao.lng, precisao: 8});

    await aviso(page).getByRole('button', {name: 'Desfazer'}).click();
    await expect(aviso(page)).toContainText('a entrega voltou para a lista e o pino para onde estava');
    expect(await paradas(page, ids)).toEqual(antes);
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'DELETE').length, {timeout: 20_000}).toBeGreaterThan(0);
    expect(await esperando(), 'a passagem desfeita continua esperando para ir').toEqual([]);
    await page.clock.fastForward('11:00');
    await page.waitForTimeout(1500);
    expect(enviados(nuvem, 'observacoes')).toEqual([]);
  });

  // O aviso de 10 s já passou, o app foi fechado e aberto de novo (o Waze), e ele percebe o erro
  // na parada seguinte: desfaz pela lista. A porta volta junto, como no aviso (05/10).
  test('desfeita pela lista, com o app reaberto, a porta volta junto com a entrega', async ({page, context, nuvem}) => {
    const {aviso, lista} = await import('./apoio');
    await page.clock.install();
    const {ids, antes} = await tocarAqui(page, context, 8);
    await expect(aviso(page)).toContainText('com a porta marcada aqui (±8 m)');
    await expect.poll(() => enviados(nuvem, 'correcoes').length, {timeout: 20_000}).toBeGreaterThan(0);
    const texto = await page.evaluate(i => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((p: any) => p.id === i).texto, ids[0]);

    await page.reload();
    await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
    await lista(page);
    await page.locator('details.feitas summary').click();
    for (const _ of ids) await page.locator('details.feitas [data-item]').filter({hasText: texto}).first().getByRole('button', {name: 'Desfazer'}).click();

    await expect.poll(() => paradas(page, ids)).toEqual(antes);
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'DELETE').length, {timeout: 20_000}).toBeGreaterThan(0);
    await page.clock.fastForward('11:00');
    await page.waitForTimeout(1500);
    expect(enviados(nuvem, 'observacoes')).toEqual([]);
  });

  // "Às vezes o cliente fala depois que é uma localização errada" (dono, 25/11): a entrega foi feita,
  // o lugar é que não era a porta. Passado o aviso e com o app reaberto, o cartão desfaz só a porta.
  test('depois do aviso, com o app reaberto, o cartão desfaz a porta do "Entreguei aqui" e a entrega fica', async ({page, context, nuvem}) => {
    const {aviso, garantirMapa, verNoMapa} = await import('./apoio');
    const {ids, antes} = await tocarAqui(page, context, 8);
    await expect(aviso(page)).toContainText('com a porta marcada aqui (±8 m)');
    await expect.poll(() => enviados(nuvem, 'correcoes').length, {timeout: 20_000}).toBeGreaterThan(0);

    await page.reload();
    await abrir(page);
    await garantirMapa(page);
    await verNoMapa(page, PORTA.latitude, PORTA.longitude, 18);
    const chave = await page.evaluate(i => [...document.querySelectorAll('.pino[data-ids]')]
      .map(el => el.getAttribute('data-ids')!).find(k => k.split('+').includes(i)), ids[0]);
    await page.locator(`.pino[data-ids="${chave}"]`).click();
    const cartao = page.locator(`${PINO} [data-item="${ids[0]}"]`);
    await expect(cartao).toContainText('Entregue');
    await expect(cartao.locator('[data-desfazer-porta]')).toContainText(/Porta marcada por você às \d\d:\d\d\./);
    await cartao.getByRole('button', {name: 'Desfazer a porta'}).click();

    // o pino volta ao ponto de antes e a entrega fica. A etiqueta de "longe" não volta: entregue não
    // entra na conta das isoladas (marcarEntregue), e é ela que a dá.
    await expect.poll(async () => (await paradas(page, ids)).map(({entregue, lat, lng}) => ({entregue, lat, lng})))
      .toEqual(antes.map(p => ({entregue: true, lat: p.lat, lng: p.lng})));
    expect((await paradas(page, ids)).map(p => p.precisao), 'não é mais a porta marcada').not.toContain('manual');
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'DELETE').length, {timeout: 20_000}).toBeGreaterThan(0);
    await expect(page.locator('[data-desfazer-porta]'), 'desfeita, não há mais o que desfazer').toHaveCount(0);
  });

  test('com GPS ruim, entrega mas não mexe no pino nem manda porta para a nuvem', async ({page, context, nuvem}) => {
    const {aviso} = await import('./apoio');
    const {ids, antes} = await tocarAqui(page, context, 200);
    await expect(aviso(page)).toContainText('O GPS está impreciso agora (±200 m). O pino ficou onde estava.');
    expect(await paradas(page, ids)).toEqual(antes.map(p => ({...p, entregue: true})));
    await page.waitForTimeout(1500);
    expect(enviados(nuvem, 'correcoes')).toEqual([]);
    expect(enviados(nuvem, 'observacoes')).toEqual([]);
  });

  // Pilha é coisa da tela. Com as 80 paradas enquadradas, a próxima junta 24 entregas de ruas
  // diferentes num pino só, e um "Entreguei aqui" por endereço ali era um toque errado de dar
  // como entregue, e com a porta aqui, o pacote de outra rua.
  test('com o mapa afastado, a pilha de ruas diferentes não oferece o Entreguei aqui', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await montar(page);
    await garantirMapa(page);
    await page.locator('.pino.alvo').click();
    const cartao = page.locator(PINO);
    await expect(cartao, 'o caso depende de a próxima estar empilhada com outras').toContainText(/Neste pino: \d+ entregas/);
    await expect(cartao.locator('[data-acao=aqui]')).toHaveCount(0);
    // a distância, que é o que se sabe; "ruas diferentes" era chute (25/11)
    await expect(cartao.locator('[data-aproxime]')).toHaveText(/^Entregas a (até )?[\d,]+ k?m uma da outra neste pino: aproxime o mapa para marcar a porta de cada uma\.$/);
    // e o "Entreguei" de antes continua lá, com a pergunta que ele sempre fez
    await expect(cartao.locator('[data-acao=entregue]').first()).toBeVisible();

    await cartao.getByRole('button', {name: 'Fechar'}).click();
    await abrirPinoDaProxima(page);
    await expect(page.locator(`${PINO} [data-acao=aqui]`).first()).toBeVisible();
  });

  // O P24 de 25/11 (foto do dono na rua): as duas entregas do pino com porta verificada, e o cartão
  // mandava aproximar o mapa para marcar a porta de cada uma, que ali não se marca de novo.
  test('com todas as portas do pino verificadas, o cartão não manda aproximar para marcar porta', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-d.xlsx');
    await montar(page);
    await garantirMapa(page);
    await page.locator('.pino.alvo').click();
    await expect(page.locator(`${PINO} [data-aproxime]`), 'o caso depende de a pilha ter o aviso antes').toBeVisible();
    const ids = (await page.locator('.pino.alvo').getAttribute('data-ids'))!.split('+');
    await page.evaluate(is => {
      const s = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
      for (const p of s.paradas) if (is.includes(p.id)) p.precisao = 'confirmado';
      localStorage.setItem('rota-entregas-v2', JSON.stringify(s));
    }, ids);
    await page.reload();
    await abrir(page);
    await garantirMapa(page);
    await page.locator('.pino.alvo').click();
    await expect(page.locator(PINO), 'a mesma pilha de antes').toContainText(`Neste pino: ${ids.length} entregas`);
    await expect(page.locator(`${PINO} [data-aproxime]`)).toHaveCount(0);
  });
});

// Pedidos de 28/09: "endereço verificado, igual o Mercado Livre" e "cliente xarope" — o cliente
// que já reclamou de pacote jogado ou deixado com vizinho. Os dois chegam da nuvem ao carregar a
// rota, e o xarope se marca depois da entrega, que é quando a reclamação costuma aparecer.
test.describe('o que os outros motoristas já sabem do endereço', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('endereço verificado e cliente xarope chegam ao carregar, no cartão e no pino', async ({page}) => {
    const {garantirMapa, verNoMapa} = await import('./apoio');
    const primeira = (r) => (r.request().postDataJSON() as {chaves: string[]}).chaves[0];
    const cors = {'access-control-allow-origin': '*'};
    await page.route('**/rest/v1/rpc/posicoes', r => r.fulfill({contentType: 'application/json', headers: cors, body: JSON.stringify([
      {chave_lugar: primeira(r), lat: -10.9605, lng: -37.0455, situacao: 'confirmado', motoristas: 0, entregas: 1, fonte: 'entrega', minha: false}])}));
    await page.route('**/rest/v1/rpc/reclamacoes_dos_lugares', r => r.fulfill({contentType: 'application/json', headers: cors, body: JSON.stringify([
      {chave_lugar: primeira(r), motivo: 'vizinho', quando: '2026-09-20T12:00:00Z', minha: false}])}));
    await abrir(page);
    await carregar(page, ROTA_A);
    await expect(page.locator('#status')).toContainText('1 de cliente xarope');
    const xarope = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.reclamacoes?.length));
    expect(xarope.precisao, 'a mesma parada é a verificada: as duas respostas vieram para a mesma chave').toBe('confirmado');

    await aba(page, '2. Conferir');
    const cartao = page.locator(`[data-item="${xarope.id}"]`);
    await expect(cartao).toContainText('Endereço verificado: já entregaram aqui');
    await expect(cartao.locator('[data-xarope]')).toContainText('Cliente xarope: alguém que comprou neste endereço já reclamou de deixar com vizinho');

    await garantirMapa(page);
    await verNoMapa(page, xarope.lat, xarope.lng, 18);
    const pino = page.locator('.leaflet-marker-icon .pino.xarope');
    await expect(pino, 'o pino chega com outra cor, antes de tocar').toHaveCount(1);
    await pino.click();
    await expect(page.locator(`${PINO} [data-xarope]`)).toContainText('Cliente xarope');
  });

  // "Tem que saber a diferença quando for em condomínio" (28/09): o xarope do apartamento 101
  // não é o do prédio inteiro.
  test('no condomínio, a reclamação do apartamento não passa para o vizinho de prédio', async ({page, nuvem}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await aba(page, '2. Conferir');
    const a101 = page.locator('[data-item]').filter({hasText: 'Bloco A ap 101'});
    const b202 = page.locator('[data-item]').filter({hasText: 'Bloco B ap 202'});
    await a101.locator('[data-acao="xarope"]').click();
    await a101.locator('[data-marcar-xarope]').getByRole('button', {name: /deixar com vizinho/}).click();
    await expect(a101.locator('[data-xarope]')).toContainText('Cliente xarope');
    await expect(b202.locator('[data-xarope]')).toHaveCount(0);
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'reclamacoes' && p.metodo === 'POST').length, {timeout: 20_000}).toBe(1);
  });

  // Dono, 26/11: "queria colocar cliente xarope e não conseguia". No Conferir ele só aparecia com o
  // cartão aberto, tocando no endereço, que ninguém sabia que abria.
  test('no Conferir, o "Cliente xarope" está nos botões do endereço, sem abrir o cartão, e vai para a nuvem', async ({page, nuvem}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await aba(page, '2. Conferir');
    const item = page.locator('[data-item]').filter({hasText: 'Bloco A ap 101'});
    await expect(item.locator('.topo')).toHaveAttribute('aria-expanded', 'false');
    await item.getByRole('button', {name: 'Cliente xarope'}).click();
    await item.locator('[data-marcar-xarope]').getByRole('button', {name: /deixar com vizinho/}).click();
    await expect(page.locator('#status')).toContainText('Cliente xarope marcado');
    await expect(item.locator('[data-xarope]')).toContainText('Cliente xarope');
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'reclamacoes' && p.metodo === 'POST').length, {timeout: 20_000}).toBe(1);
  });

  test('entregou e depois soube da reclamação: marca na entrega feita, vai para a nuvem, e desfaz', async ({page, nuvem}) => {
    const {lista} = await import('./apoio');
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const texto = await page.locator('.proxima .endereco').innerText();
    await page.locator('.proxima [data-acao="entregue"]').first().click();

    await lista(page);
    await page.getByText(/entregue\(s\)$/).first().click();
    const linha = page.locator('.parada.feito').filter({hasText: texto});
    await linha.getByRole('button', {name: 'Cliente xarope'}).click();
    await page.locator('[data-marcar-xarope]').getByRole('button', {name: /deixar com vizinho/}).click();
    await expect(page.locator('#status')).toContainText('Cliente xarope marcado');
    await expect(linha).toContainText('Cliente xarope');

    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'reclamacoes' && p.metodo === 'POST').length, {timeout: 20_000}).toBe(1);
    const corpo = nuvem.pedidos.find(p => p.caminho === 'reclamacoes')!.corpo as any;
    expect(Array.isArray(corpo) ? corpo[0] : corpo).toMatchObject({motivo: 'vizinho'});

    await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
    await expect(linha).not.toContainText('Cliente xarope');
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'reclamacoes' && p.metodo === 'DELETE').length, {timeout: 20_000}).toBe(1);
  });
});

// Pedido deles, 28/09: entregue e porta confirmada não têm o que arrumar na rua. Botão ali é só
// toque errado esperando acontecer; quem precisa mudar (cliente se mudou) vai na Conferir.
test.describe('na rua, sem arrumar o que já está certo', () => {
  test.use({viewport: {width: 412, height: 915}});

  const daProxima = (page) => page.locator('.proxima .endereco').innerText().then(t => page.evaluate(t2 => {
    const p = (JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas || []).find((x: any) => x.texto === t2);
    return {id: p.id as string, lat: p.lat as number, lng: p.lng as number};
  }, t));

  // o pino mais perto do meio do mapa, depois de centralizar nele
  async function abrirPinoEm(page, lat: number, lng: number) {
    const {verNoMapa} = await import('./apoio');
    await verNoMapa(page, lat, lng, 18);
    const caixa = (await page.locator('#map').boundingBox())!;
    const meio = {x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2};
    const pinos = await page.locator('.leaflet-marker-icon .pino').all();
    const longes = await Promise.all(pinos.map(async l => { const b = (await l.boundingBox())!; return Math.hypot(b.x + b.width / 2 - meio.x, b.y + b.height - meio.y); }));
    await pinos[longes.indexOf(Math.min(...longes))].click();
    await expect(page.locator(PINO)).toBeVisible();
  }

  test('o pino já entregue não oferece botão de entrega nem de arrumar', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await garantirMapa(page);
    const alvo = await daProxima(page);
    await abrirPinoEm(page, alvo.lat, alvo.lng);
    await page.locator(`${PINO} [data-acao=entregue]`).first().click();
    await expect(page.locator(`${PINO} [data-item="${alvo.id}"]`), 'o cartão tem de ser o da entregue').toContainText('Entregue');
    await expect(page.locator(`${PINO} [data-item="${alvo.id}"] [data-acao]`)).toHaveCount(0);
  });

  // a próxima entrega volta confirmada, como vem da nuvem quando o endereço já foi entregue antes
  async function proximaConfirmada(page) {
    const alvo = await daProxima(page);
    await page.evaluate(id => {
      const s = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
      Object.assign(s.paradas.find((x: any) => x.id === id), {precisao: 'confirmado', exibido: 'Endereço verificado por 2 motoristas'});
      localStorage.setItem('rota-entregas-v2', JSON.stringify(s));
    }, alvo.id);
    await page.reload();
    await abrir(page);
    return alvo;
  }

  test('porta confirmada: sem "Entreguei aqui" nem "Arrumar" na Rota; o conserto é o "Porta errada?"', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proximaConfirmada(page);
    await expect(page.locator('.proxima [data-confirmada]')).toContainText('Endereço verificado');
    // junto do endereço, acima dos botões: embaixo deles só rolando o cartão, e o Pedro não via (10/10)
    const selo = (await page.locator('.proxima [data-confirmada]').boundingBox())!;
    const botao = (await page.locator('.proxima [data-acao=entregue]').first().boundingBox())!;
    expect(selo.y + selo.height).toBeLessThanOrEqual(botao.y);
    // o "Pino errado?" é da porta que ninguém verificou; na verificada, o botão diz o que ela é
    await expect(page.locator('.proxima').getByRole('button', {name: /Pino errado/})).toHaveCount(0);
    await expect(page.locator('.proxima [data-acao=porta-errada]')).toHaveText('Porta errada? Estou aqui');
    // e o botão grande é o Entreguei simples: marcar a porta de novo é mexer na confirmada
    await expect(page.locator('.proxima [data-acao=aqui]')).toHaveCount(0);
    await expect(page.locator('.proxima [data-acao=entregue]')).toBeVisible();

    await garantirMapa(page);
    await abrirPinoEm(page, alvo.lat, alvo.lng);
    const cartao = page.locator(`${PINO} [data-item="${alvo.id}"]`);
    await expect(cartao.locator('[data-acao=entregue]')).toBeVisible();
    await expect(cartao.locator('[data-acao=aqui], [data-acao=arrumar]')).toHaveCount(0);
    await expect(cartao.locator('[data-acao=porta-errada]')).toHaveText('Porta errada? Estou aqui');
    await expect(cartao, 'o caminho longo de antes não é mais o que o cartão manda fazer').not.toContainText('arrume em Conferir endereços');
  });

  // "Você percebe o trabalho que é pra arrumar um pino?" (dono, na rua, 25/11): a porta verificada
  // errada só se arrumava por Conferir endereços. Agora é o botão do cartão e uma pergunta.
  test.describe('o "Porta errada? Estou aqui" do cartão do pino', () => {
    test.use({permissions: ['geolocation'], geolocation: {latitude: 0, longitude: 0, accuracy: 8}});

    // na porta: 30 m ao norte do pino verificado, perto o bastante para o GPS valer como porta
    async function naPorta(page, context) {
      const {garantirMapa} = await import('./apoio');
      await abrir(page);
      await carregar(page, ROTA_A);
      await montar(page);
      const alvo = await proximaConfirmada(page);
      const gps = {lat: +(alvo.lat + 0.00027).toFixed(6), lng: +alvo.lng.toFixed(6)};
      await context.setGeolocation({latitude: gps.lat, longitude: gps.lng, accuracy: 8});
      await garantirMapa(page);
      await abrirPinoEm(page, alvo.lat, alvo.lng);
      return {alvo, gps};
    }
    const onde = (page, id: string) => page.evaluate(i => {
      const p = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.id === i);
      return {lat: p.lat, lng: p.lng, precisao: p.precisao};
    }, id);

    test('na conta do motorista: uma pergunta curta, e a porta vai para onde ele está', async ({page, context}) => {
      const perguntas: string[] = [];
      page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
      const {alvo, gps} = await naPorta(page, context);

      await page.locator(`${PINO} [data-item="${alvo.id}"] [data-acao=porta-errada]`).click();
      await expect.poll(() => onde(page, alvo.id)).toEqual({lat: gps.lat, lng: gps.lng, precisao: 'manual'});
      expect(perguntas, 'uma pergunta só, sem a do GPS nem a das vizinhas').toHaveLength(1);
      expect(perguntas[0]).toMatch(/^Mudar a porta verificada de .+\?/);
      expect(perguntas[0]).toContain('Quem administra vai ver a mudança.');
    });

    test('recusando a pergunta, a porta verificada fica onde estava', async ({page, context}) => {
      page.on('dialog', d => d.dismiss());
      const {alvo} = await naPorta(page, context);

      await page.locator(`${PINO} [data-item="${alvo.id}"] [data-acao=porta-errada]`).click();
      await page.waitForTimeout(800);
      expect(await onde(page, alvo.id)).toEqual({lat: alvo.lat, lng: alvo.lng, precisao: 'confirmado'});
    });

    test.describe('na conta do admin', () => {
      test.use({papel: 'admin'});

      test('a pergunta diz que vale para todos, e a correção sobe para a nuvem', async ({page, context, nuvem}) => {
        const perguntas: string[] = [];
        page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
        const {alvo, gps} = await naPorta(page, context);

        await page.locator(`${PINO} [data-item="${alvo.id}"] [data-acao=porta-errada]`).click();
        await expect.poll(() => onde(page, alvo.id)).toEqual({lat: gps.lat, lng: gps.lng, precisao: 'manual'});
        expect(perguntas[0]).toContain('Passa a valer para todos os motoristas.');
        const correcoes = () => nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'POST').flatMap(p => p.corpo as Record<string, unknown>[]);
        await expect.poll(() => correcoes().map(c => [c.lat, c.lng]), {timeout: 20_000}).toContainEqual([gps.lat, gps.lng]);
      });
    });
  });
});

// Print de 12/10: as 23 entregas de um condomínio no mesmo pino. O cartão juntava os 23 números numa
// faixa só ("#62+#63+…") que não quebra linha, e o endereço e os botões saíam da tela pela direita.
// O bloco ainda dizia "23 pacotes" para 23 entregas, e só mostrava o apartamento da primeira.
test.describe('um condomínio com muitas entregas no mesmo pino', () => {
  test.use({viewport: {width: 412, height: 915}});
  const PORTA = {lat: -10.980123, lng: -37.050456};

  test('o cartão do pino cabe na tela, conta os pacotes e mostra o apartamento de cada entrega', async ({page}) => {
    const XLSX = (await import('xlsx')).default;
    const {garantirMapa, verNoMapa} = await import('./apoio');
    const cab = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
    const linhas: unknown[][] = [];
    let seq = 61;
    for (let i = 1; i <= 23; i++) {
      // de três em três, um apartamento com dois pacotes: 23 entregas, 30 pacotes
      for (let k = 0; k < (i % 3 === 0 ? 2 : 1); k++) {
        linhas.push(['AT-TESTE', ++seq, 12, '', `Rua Inventada Teste Oliveira, 200, Bloco ${Math.ceil(i / 4)} Apto ${100 + i}, Condomínio Teste Mar 2`,
          'Bairro Inventado', 'Aracaju', '49099-950', PORTA.lat, PORTA.lng]);
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...linhas]), 'Planilha');
    await abrir(page);
    await page.locator('#arquivo').setInputFiles({name: 'condominio.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'})});
    await expect(page.locator('#status')).toContainText('parada(s) da planilha', {timeout: 30_000});

    await garantirMapa(page);
    await verNoMapa(page, PORTA.lat, PORTA.lng);
    await page.locator('.leaflet-marker-icon .pino').filter({hasText: '+22'}).click();
    const cartao = page.locator(PINO);
    await expect(cartao).toContainText('Neste pino: 23 entregas');

    // A faixa com os números não passava da borda do bloco: ela vazava por cima e espremia o
    // endereço numa coluna de uma letra por linha, que empurrava os botões para baixo da tela.
    const selo = (await cartao.locator('.entrega .badge').first().boundingBox())!;
    expect(selo.x + selo.width, 'o selo cabe na largura do celular').toBeLessThanOrEqual(412);
    const endereco = (await cartao.locator('.entrega .end').first().boundingBox())!;
    expect(endereco.width, 'o endereço tem largura para ser lido').toBeGreaterThan(200);
    expect(endereco.x + endereco.width).toBeLessThanOrEqual(412);
    const entreguei = (await cartao.locator('[data-acao=entregue]').first().boundingBox())!;
    expect(entreguei.y + entreguei.height, 'o Entreguei aparece sem rolar o cartão').toBeLessThanOrEqual(915);

    await expect(cartao).toContainText('23 entregas · 30 pacotes');
    // o que muda de uma entrega para a outra é o apartamento; o resto do endereço aparece uma vez
    const doEndereco = cartao.locator('.do-endereco');
    await doEndereco.locator('summary').click();
    await expect(doEndereco).toContainText('Bloco 1 Apto 101');
    await expect(doEndereco).toContainText('Bloco 6 Apto 123');
    await expect(cartao.locator('.entrega .end').first()).toHaveText('Rua Inventada Teste Oliveira, 200, Condomínio Teste Mar 2, Bairro Inventado');

    // uma entrega só, pela linha dela: o morador do 101 recebeu, o resto fica
    await doEndereco.locator('.sub-entrega').filter({hasText: 'Bloco 1 Apto 101'}).locator('[data-acao=entregue-uma]').click();
    const feitas = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas
      .filter((p: any) => p.entregue).map((p: any) => p.texto));
    expect(feitas).toEqual([expect.stringContaining('Bloco 1 Apto 101')]);
    await expect(cartao.locator('[data-acao=entregue]').first()).toHaveText('Entreguei as 22');

    // e a próxima entrega, quando é o condomínio, tem a mesma lista
    await montar(page);
    await expect(page.locator('.proxima .do-endereco summary')).toHaveText('As 22 entregas deste endereço');
  });

  // Luan, vídeo de 10/11: deu baixa numa entrega do condomínio, e o pino dela, entregue, ficou em
  // cima do pino das 11 que faltavam, no mesmo ponto. Todo toque ali abria a que já tinha baixa,
  // com ou sem o seguir, e aproximar não separa dois pinos no mesmo lugar. "Dar prioridade a quem
  // não deu baixa na hora de apertar em cima."
  test('o toque no ponto de um condomínio abre as que faltam, não a que já teve baixa', async ({page}) => {
    const XLSX = (await import('xlsx')).default;
    const {garantirMapa, verNoMapa} = await import('./apoio');
    const cab = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
    const linhas = [101, 102, 103, 104].map((apto, i) => ['AT-TESTE', 61 + i, 2, '',
      `Rua Inventada Teste Oliveira, 200, Apto ${apto}, Condomínio Teste Mar 2`, 'Bairro Inventado', 'Aracaju', '49099-950', PORTA.lat, PORTA.lng]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...linhas]), 'Planilha');
    await abrir(page);
    await page.locator('#arquivo').setInputFiles({name: 'condominio.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'})});
    await expect(page.locator('#status')).toContainText('parada(s) da planilha', {timeout: 30_000});
    // com a rota montada os pinos saem na ordem dela; a baixa do vídeo foi fora de ordem (a #5,
    // com a #1 ainda por fazer), e o pino da entregue saiu por último, em cima
    await montar(page);
    const ultima = await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
      const ordem: string[] = e.rota.areas.flatMap((a: any) => a.ordem);
      return e.paradas.find((p: any) => p.id === ordem[ordem.length - 1]).texto.match(/Apto \d+/)[0];
    });
    await garantirMapa(page);
    await verNoMapa(page, PORTA.lat, PORTA.lng);

    const cartao = page.locator(PINO);
    await page.locator('.leaflet-marker-icon .pino').filter({hasText: '+3'}).click();
    await expect(cartao).toContainText('Neste pino: 4 entregas');
    const doEndereco = cartao.locator('.do-endereco');
    await doEndereco.locator('summary').click();
    await doEndereco.locator('.sub-entrega').filter({hasText: ultima}).locator('[data-acao=entregue-uma]').click();
    await cartao.getByRole('button', {name: 'Fechar'}).click();
    await expect(cartao).toBeHidden();

    // os dois pinos no mesmo ponto: o da entregue e o das três que faltam
    const pendente = page.locator('.leaflet-marker-icon').filter({has: page.locator('.pino', {hasText: '+2'})});
    const entregue = page.locator('.leaflet-marker-icon').filter({has: page.locator('.pino', {hasText: '✓'})});
    await expect(pendente).toHaveCount(1);
    await expect(entregue).toHaveCount(1);
    // Fechado o cartão, o mapa cresce e só no quadro seguinte o Leaflet sabe, e o arrasta para
    // manter o meio: 92 px, com a lista do condomínio aberta. Medidos um de cada vez, um pino podia
    // sair de antes do arraste e o outro de depois, e o CI de 16/11 viu 92 px entre dois pinos que
    // estavam juntos. Os dois saem da mesma leitura, com o mapa do tamanho da caixa e parado: é
    // nessa posição que o dedo toca.
    const lerOsDois = () => page.evaluate(() => {
      const caixa = (txt: string) => [...document.querySelectorAll('.leaflet-marker-icon')]
        .find(el => el.querySelector('.pino')?.textContent?.includes(txt))!.getBoundingClientRect();
      const p = caixa('+2'), e = caixa('✓');
      const emDia = (window as any).rotaTeste.tamanho().altura === document.querySelector('#map')!.clientHeight;
      return {x: p.x, y: p.y, largura: p.width, altura: p.height, longe: Math.abs(p.x - e.x) + Math.abs(p.y - e.y), emDia};
    });
    let a = await lerOsDois();
    await expect.poll(async () => {
      const antes = a;
      a = await lerOsDois();
      return a.emDia && a.x === antes.x && a.y === antes.y;
    }, {message: 'o mapa para depois de o cartão fechar'}).toBe(true);
    expect(a.longe, 'os dois pinos estão um em cima do outro').toBeLessThan(4);

    // o dedo no ponto, como na rua: quem recebe é o que estiver por cima
    await page.mouse.click(a.x + a.largura / 2, a.y + a.altura / 2);
    await expect(cartao).toContainText('Neste pino: 3 entregas');
    await expect(cartao.locator('[data-acao=entregue]').first()).toBeVisible();
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
    const {aviso, garantirMapa, clicarMapa, linhaDe, verNoMapa} = await import('./apoio');
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
    await expect(page.locator(PINO)).toContainText('Neste pino: 2 entregas');
    await expect(page.locator(PINO)).toContainText('Travessa Um');

    // um botão por entrega, cada um ao lado do endereço dele — e não um só, escolhendo calado
    const arrumar = page.locator(`${PINO} [data-acao=arrumar]`);
    await expect(arrumar).toHaveCount(2);
    const travessa = page.locator(`${PINO} .entrega`).filter({hasText: 'Travessa Um'});

    perguntas.length = 0;
    await travessa.locator('[data-acao=arrumar]').click();
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

// Dono, 26/11: "parar de ficar botando o ponto de saída, atrapalha; o ponto de saída sempre será
// nosso GPS, que fica marcando no mapa". A saída continua guardada para a rota; só não tem pino.
test.describe('o ponto de saída', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: {latitude: -10.9605, longitude: -37.0455, accuracy: 10}});
  test('a rota sai do GPS, e o mapa mostra só a bolinha do GPS, sem pino de saída', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).inicio?.lat), 'a premissa: a saída foi guardada')
      .toBeCloseTo(-10.9605, 3);
    await expect(page.locator('.leaflet-marker-icon:has(.eu)')).toHaveCount(1);
    await expect(page.locator('#map .leaflet-marker-icon .pino').filter({hasText: /^S$/})).toHaveCount(0);
  });
});

// Dono, 26/11, foto do mapa na rua: "pinos que foram feitos não precisam mais estar com caminhos,
// sempre ao próximo". O serviço de ruas de mentira devolve a linha passando pelos pontos pedidos.
test.describe('a linha da rota só até a próxima', () => {
  test.use({viewport: {width: 412, height: 915}});
  const metros = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) =>
    111320 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180));
  const tracos = (page): Promise<[number, number][][]> => page.evaluate(() => (window as any).rotaTeste.linhaDaRota());

  test('entregues as primeiras, a linha vai da última delas só até a próxima; toda feita, não há linha', async ({page, context}) => {
    page.on('dialog', d => d.accept());
    await context.route('**://router.project-osrm.org/**', r => {
      const url = new URL(r.request().url());
      const pts = url.pathname.split('/').pop()!.split(';').map(s => { const [lng, lat] = s.split(',').map(Number); return {lat, lng}; });
      if (url.pathname.includes('/table/')) {
        const distances = pts.map(a => pts.map(b => metros(a, b)));
        return r.fulfill({json: {code: 'Ok', distances, durations: distances.map(l => l.map(m => m / 10))}});
      }
      return r.fulfill({json: {code: 'Ok', routes: [{geometry: {coordinates: pts.map(p => [p.lng, p.lat])}}]}});
    });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.waitForFunction(() => !!(window as any).rotaTeste);
    const estado = () => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
    const e0 = await estado();
    const ordem: string[] = e0.rota.areas.flatMap((a: any) => a.ordem);
    const posicao = (e: any, id: string) => e.paradas.find((p: any) => p.id === id);
    // sem GPS a rota sai da primeira parada: até ela não há caminho a desenhar
    await expect.poll(() => tracos(page)).toEqual([]);

    for (let i = 0; i < 2; i++) {
      const resumo = await page.locator('.resumo').innerText();
      await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
      await expect(page.locator('.resumo')).not.toHaveText(resumo);
    }
    await expect.poll(async () => (await tracos(page)).length).toBe(1);
    const e1 = await estado();
    const feitas = ordem.filter(id => posicao(e1, id).entregue);
    const ultimaFeita = posicao(e1, feitas[feitas.length - 1]);
    const depois = await tracos(page);
    expect(depois).toHaveLength(1);
    const [lat, lng] = depois[0][0];
    expect(metros({lat, lng}, ultimaFeita), 'a linha sai da última entregue').toBeLessThan(2);
    // nenhum ponto da linha passa nas outras entregues
    for (const id of feitas.slice(0, -1)) for (const [la, ln] of depois[0]) expect(metros({lat: la, lng: ln}, posicao(e1, id))).toBeGreaterThan(2);
    // e acaba na próxima: as que vêm depois dela não têm linha (dono, 27/11: "tem vários lados pintados")
    const proxima = posicao(e1, ordem.find(id => !posicao(e1, id).entregue)!);
    const [laF, lnF] = depois[0][depois[0].length - 1];
    expect(metros({lat: laF, lng: lnF}, proxima)).toBeLessThan(2);

    for (let i = 0; i < 30 && await page.locator('[data-folha="proxima"]').isVisible(); i++) {
      await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
    }
    await expect(page.locator('[data-folha="fim"]')).toBeVisible();
    await expect.poll(() => tracos(page)).toEqual([]);
  });
});

// Dono, 27/11, foto do mapa ao vivo: "a linha continua atrás de onde estou, atrapalha mais que ajuda".
test.describe('a linha da rota começa no entregador', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: {latitude: 0, longitude: 0, accuracy: 8}});
  const metros = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) =>
    111320 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180));
  const tracos = (page): Promise<[number, number][][]> => page.evaluate(() => (window as any).rotaTeste.linhaDaRota());

  test('no meio do caminho até a próxima, o trecho que ficou para trás sai do mapa', async ({page, context}) => {
    // o serviço de ruas de mentira devolve a linha reta pelos pontos pedidos
    await context.route('**://router.project-osrm.org/**', r => {
      const url = new URL(r.request().url());
      const pts = url.pathname.split('/').pop()!.split(';').map(s => { const [lng, lat] = s.split(',').map(Number); return {lat, lng}; });
      if (url.pathname.includes('/table/')) {
        const distances = pts.map(a => pts.map(b => metros(a, b)));
        return r.fulfill({json: {code: 'Ok', distances, durations: distances.map(l => l.map(m => m / 10))}});
      }
      return r.fulfill({json: {code: 'Ok', routes: [{geometry: {coordinates: pts.map(p => [p.lng, p.lat])}}]}});
    });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.waitForFunction(() => !!(window as any).rotaTeste);
    await expect.poll(async () => (await tracos(page)).length, 'a premissa: há linha').toBe(1);
    const resumo = await page.locator('.resumo').innerText();
    await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
    await expect(page.locator('.resumo')).not.toHaveText(resumo);
    const e = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
    const ordem: string[] = e.rota.areas.flatMap((a: any) => a.ordem);
    const parada = (id: string) => e.paradas.find((p: any) => p.id === id);
    const de = parada(ordem.find(id => parada(id).entregue)!);
    const ate = parada(ordem.find(id => !parada(id).entregue)!);
    expect(metros(de, ate), 'a premissa: um caminho de verdade entre as duas').toBeGreaterThan(100);
    const meio = {lat: (de.lat + ate.lat) / 2, lng: (de.lng + ate.lng) / 2};
    const [inicio] = (await tracos(page))[0];
    expect(metros({lat: inicio[0], lng: inicio[1]}, de), 'a premissa: antes, a linha sai da entregue').toBeLessThan(2);

    await context.setGeolocation({latitude: meio.lat, longitude: meio.lng, accuracy: 8});
    await expect.poll(async () => { const [[la, ln]] = (await tracos(page))[0]; return metros({lat: la, lng: ln}, meio); },
      'a linha começa onde o GPS está').toBeLessThan(2);
    const [linha] = await tracos(page);
    const [la, ln] = linha[linha.length - 1];
    expect(metros({lat: la, lng: ln}, ate), 'e acaba na próxima: o resto da rota não é desenhado').toBeLessThan(2);
  });

  // Dono, 28/11: "tanto a rotação quanto as linhas sumindo, quanto mais suave melhor". A linha era
  // cortada aos pulos, a cada leitura do GPS; agora o corte desliza com a bolinha até a leitura nova.
  test('andando uns metros, a linha vai sumindo aos poucos atrás dele, não aos pulos', async ({page, context}) => {
    await context.route('**://router.project-osrm.org/**', r => {
      const url = new URL(r.request().url());
      const pts = url.pathname.split('/').pop()!.split(';').map(s => { const [lng, lat] = s.split(',').map(Number); return {lat, lng}; });
      if (url.pathname.includes('/table/')) {
        const distances = pts.map(a => pts.map(b => metros(a, b)));
        return r.fulfill({json: {code: 'Ok', distances, durations: distances.map(l => l.map(m => m / 10))}});
      }
      return r.fulfill({json: {code: 'Ok', routes: [{geometry: {coordinates: pts.map(p => [p.lng, p.lat])}}]}});
    });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.waitForFunction(() => !!(window as any).rotaTeste);
    const e = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
    const ordem: string[] = e.rota.areas.flatMap((a: any) => a.ordem);
    const de = e.paradas.find((p: any) => p.id === ordem[0]), ate = e.paradas.find((p: any) => p.id === ordem[1]);
    const ponto = (m: number) => { const f = m / metros(de, ate); return {lat: de.lat + (ate.lat - de.lat) * f, lng: de.lng + (ate.lng - de.lng) * f}; };
    await context.setGeolocation({latitude: de.lat, longitude: de.lng, accuracy: 8});
    const resumo = await page.locator('.resumo').innerText();
    await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
    await expect(page.locator('.resumo')).not.toHaveText(resumo);
    const comeco = async () => { const [t] = await tracos(page); return t ? {lat: t[0][0], lng: t[0][1]} : null; };
    const a100 = ponto(100), a160 = ponto(160);
    await context.setGeolocation({latitude: a100.lat, longitude: a100.lng, accuracy: 8});
    await expect.poll(async () => metros((await comeco())!, a100), 'a premissa: a linha começa nele').toBeLessThan(2);
    await page.waitForTimeout(1500);
    // 60 m adiante: no meio do deslize, o corte está entre os dois pontos
    await context.setGeolocation({latitude: a160.lat, longitude: a160.lng, accuracy: 8});
    await page.waitForTimeout(350);
    const meio = (await comeco())!;
    expect(metros(meio, a100), 'já saiu de onde estava').toBeGreaterThan(5);
    expect(metros(meio, a160), 'e ainda não chegou: não pulou').toBeGreaterThan(5);
    await expect.poll(async () => metros((await comeco())!, a160)).toBeLessThan(2);
  });
});
