import {aba, abrir, carregar, montar, test, expect, ROTA_A} from './apoio';

const PEDACO_DO_MAPA = /\/assets\/Mapa-[^/]+\.(js|css)$/;
const PINO = '[data-folha="pino"]';

// O mapa é a tela da Rota: sem ele, a próxima entrega e a lista têm de continuar ali.
test('sem o pedaço do mapa, o app continua de pé', async ({page, context}) => {
  await context.route(PEDACO_DO_MAPA, r => r.abort());
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect(page.getByText('Não consegui carregar o mapa')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Montar a rota', exact: true})).toBeVisible();
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

  test('sem tocar em nada, ele fica no meio do mapa, de perto, e o mapa vai atrás quando ele anda', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    expect(await zoomAgora(page), 'de perto, como no "onde estou" de antes').toBeGreaterThanOrEqual(17);

    await context.setGeolocation(LONGE);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    expect(await zoomAgora(page)).toBeGreaterThanOrEqual(17);
  });

  test('pinçar muda a distância e o mapa continua indo junto, nela', async ({page, context}) => {
    const {zoom} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    await zoom(page, 15);
    await context.setGeolocation(LONGE);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    expect(await zoomAgora(page), 'voltou para a distância de antes de ele pinçar').toBe(15);
  });

  // O dedo fica onde der, longe do meio: seguindo, o zoom é em volta dele, senão ele sai da tela
  // até andar 30 m.
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

  test('arrastar o mapa para de seguir, e a mira liga de novo', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);

    // arrastar com o dedo (aqui, o mouse)
    const caixa = (await page.locator('#map').boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width / 2 + 80, caixa.y + caixa.height / 2 + 40, {steps: 8});
    await page.mouse.up();
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'false');

    // andou, e o mapa ficou onde ele deixou
    await context.setGeolocation(LONGE);
    await page.waitForTimeout(1500);
    expect(await foraDoMapa(page, '.eu'), 'o mapa foi atrás mesmo parado pelo dedo').toBe(1);

    await page.locator('#btnEu').click();
    await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => doMeio(page), {timeout: 10_000}).toBeLessThan(4);
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

  test('um toque entrega, põe o pino na porta e manda o par que confirma; desfazer volta tudo', async ({page, context, nuvem}) => {
    const {aviso} = await import('./apoio');
    const {ids, antes} = await tocarAqui(page, context, 8);
    await expect(aviso(page)).toContainText('com a porta marcada aqui (±8 m)');
    await expect(aviso(page)).toContainText('Vai para os outros motoristas como porta confirmada');
    expect(await paradas(page, ids)).toEqual(ids.map(() => ({entregue: true, lat: PORTA.latitude, lng: PORTA.longitude, precisao: 'manual'})));

    await expect.poll(() => enviados(nuvem, 'correcoes').length, {timeout: 20_000}).toBeGreaterThan(0);
    await expect.poll(() => enviados(nuvem, 'observacoes').length, {timeout: 20_000}).toBeGreaterThan(0);
    const [correcao] = enviados(nuvem, 'correcoes') as any[], [passagem] = enviados(nuvem, 'observacoes') as any[];
    expect(correcao).toMatchObject({lat: PORTA.latitude, lng: PORTA.longitude});
    // é isto que a `posicoes` cruza: mesma chave, mesmo ponto, e GPS bom o bastante para a passagem
    expect(passagem).toMatchObject({chave_lugar: correcao.chave_lugar, lat: correcao.lat, lng: correcao.lng, precisao_m: 8});

    await aviso(page).getByRole('button', {name: 'Desfazer'}).click();
    await expect(aviso(page)).toContainText('a entrega voltou para a lista e o pino para onde estava');
    expect(await paradas(page, ids)).toEqual(antes);
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'DELETE').length, {timeout: 20_000}).toBeGreaterThan(0);
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
    await expect(cartao.locator('[data-aproxime]')).toContainText('aproxime o mapa');
    // e o "Entreguei" de antes continua lá, com a pergunta que ele sempre fez
    await expect(cartao.locator('[data-acao=entregue]').first()).toBeVisible();

    await cartao.getByRole('button', {name: 'Fechar'}).click();
    await abrirPinoDaProxima(page);
    await expect(page.locator(`${PINO} [data-acao=aqui]`).first()).toBeVisible();
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
    await a101.locator('.topo').click();
    await a101.locator('[data-marcar-xarope]').getByRole('button', {name: /deixar com vizinho/}).click();
    await expect(a101.locator('[data-xarope]')).toContainText('Cliente xarope');
    await expect(b202.locator('[data-xarope]')).toHaveCount(0);
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

  test('porta confirmada: sem "Estou aqui" nem "Arrumar" na Rota', async ({page}) => {
    const {garantirMapa} = await import('./apoio');
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await daProxima(page);
    // a próxima entrega volta confirmada, como vem da nuvem quando o endereço já foi entregue antes
    await page.evaluate(id => {
      const s = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
      Object.assign(s.paradas.find((x: any) => x.id === id), {precisao: 'confirmado', exibido: 'Endereço verificado por 2 motoristas'});
      localStorage.setItem('rota-entregas-v2', JSON.stringify(s));
    }, alvo.id);
    await page.reload();
    await abrir(page);
    await expect(page.locator('.proxima [data-confirmada]')).toContainText('Endereço verificado');
    await expect(page.locator('.proxima').getByRole('button', {name: /Estou aqui/})).toHaveCount(0);
    // e o botão grande é o Entreguei simples: marcar a porta de novo é mexer na confirmada
    await expect(page.locator('.proxima [data-acao=aqui]')).toHaveCount(0);
    await expect(page.locator('.proxima [data-acao=entregue]')).toBeVisible();

    await garantirMapa(page);
    await abrirPinoEm(page, alvo.lat, alvo.lng);
    const cartao = page.locator(`${PINO} [data-item="${alvo.id}"]`);
    await expect(cartao.locator('[data-acao=entregue]')).toBeVisible();
    await expect(cartao.locator('[data-acao=aqui], [data-acao=arrumar]')).toHaveCount(0);
    await expect(cartao).toContainText('Se estiver errado, arrume em Conferir endereços');
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
