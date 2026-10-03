import {test, expect, abrir, carregar, aviso, aba, lista, menu, montar, ordem, linhaDe, clicarMapa, pontosNoMaps, paraABase, ROTA_A, ROTA_B} from './apoio';
import type {Page} from '@playwright/test';

const P1 = 'Rua Oeste, 1, Bairro';
const Q = 'Rua Oeste, 150';
const P5 = 'Rua Leste, 5';
const NOMES = [P1, Q, 'Rua Centro Oeste, 2', 'Rua Centro, 3', 'Rua Centro Leste, 4', P5];
// quantas entregas feitas o topo da Rota mostra ("3 de 10 entregas")
const feitas = async (page: Page) => Number((await page.locator('.resumo b').innerText()).split(' ')[0]);

// Entrega a próxima até o cartão ser de duas ou mais entregas no mesmo endereço.
async function ateUmEnderecoComVarias(page: Page) {
  const cartao = page.locator('.proxima');
  const todas = cartao.getByRole('button', {name: /^Entreguei as \d+$/});
  for (let i = 0; i < 15 && !(await todas.count()); i++) {
    await cartao.locator('[data-acao="entregue"]').first().click();
    await page.waitForTimeout(250);
  }
  await expect(todas).toBeVisible();
  return todas;
}

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
    // refazer usa a posição que o mapa vem seguindo: espera ela chegar, como na rua
    await expect.poll(() => page.evaluate(() => (window as any).rotaTeste.eu()?.lng)).toBe(GPS.p5.longitude);
    await montar(page);
    await expect.poll(async () => (await ordem(page, NOMES))[0]).toBe(P5);
  });

  test('ao marcar entrega com a próxima perto, avisa que dá para ir a pé', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_B);
    await montar(page);
    expect((await ordem(page, NOMES)).slice(0, 2)).toEqual([P1, Q]);
    await paraABase(page);
    await expect(page.locator('.proxima')).toContainText('Aqui perto, fora desta parada');
    await expect(page.locator('.proxima')).toContainText(/Rua Oeste, 150 \(1\d\d m\)/);
    await page.locator('.proxima [data-acao="entregue"]').click();
    await expect(aviso(page)).toContainText(/Próxima a ~1[45]0 m: Rua Oeste, 150\. Dá para ir a pé\./);
  });

  test('dá para entregar tudo da parada de uma vez, e continua dando para marcar uma a uma', async ({page}) => {
    const perguntas: string[] = [];
    page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const todas = await ateUmEnderecoComVarias(page);
    const endereco = await page.locator('.proxima .endereco').innerText();
    const antes = await feitas(page);

    // uma a uma, na lista
    await lista(page);
    const bloco = page.locator('.bloco').filter({hasText: endereco});
    await expect(bloco.getByRole('button', {name: 'Entregue', exact: true})).toHaveCount(2);
    await paraABase(page);

    await todas.click();
    expect(perguntas.at(-1)).toMatch(/Marcar como entregue tudo desta parada\?[\s\S]*2 entrega\(s\), \d+ pacote\(s\)/);
    await expect(aviso(page)).toContainText('2 entrega(s) marcada(s) aqui');
    await expect(page.locator('.resumo')).toContainText(`${antes + 2} de 10 entregas`);

    await page.locator('.proxima').getByRole('button', {name: 'Entreguei', exact: true}).click();
    await expect(page.locator('.resumo')).toContainText(`${antes + 3} de 10 entregas`);
  });

  // Adiando só a primeira, o cartão voltava com o mesmo endereço, e "Depois" parecia quebrado.
  test('"Depois" no cartão adia todas as entregas do endereço', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await ateUmEnderecoComVarias(page);
    const endereco = await page.locator('.proxima .endereco').innerText();
    await page.locator('.proxima').getByRole('button', {name: 'Depois', exact: true}).click();
    await expect(page.locator('.proxima .endereco')).not.toHaveText(endereco);
    await lista(page);
    await expect(page.getByText('Deixadas para depois (2)')).toBeVisible();
  });

  test('deixar para depois tira a parada da sequência sem desmontar a rota, e dá para arrumar e voltar', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_B);
    await montar(page);
    await lista(page);
    await linhaDe(page, P1, 'Deixar para depois').getByRole('button', {name: 'Deixar para depois'}).click();
    await expect(page.getByText('Deixadas para depois (1)')).toBeVisible();
    expect((await ordem(page, NOMES))[0]).toBe(Q);
    expect((await pontosNoMaps(page)).some(p => p.startsWith('-10.9300013,-37.1000013'))).toBe(false);
    // da lista, marcar leva ao mapa, e marcado, volta sozinho para a lista
    await page.getByRole('button', {name: 'Marcar no mapa'}).last().click();
    await expect(page.locator('[data-folha="lista"]')).toHaveCount(0);
    await clicarMapa(page, -10.9301, -37.1001);
    await expect(page.locator('[data-folha="lista"]')).toBeVisible();
    await page.getByRole('button', {name: 'Voltar para a rota'}).click();
    await expect(page.getByText(/1 parada\(s\) nova\(s\) ou corrigida\(s\) fora da rota/)).toBeVisible();
    await page.locator('[data-folha="lista"]').getByRole('button', {name: 'Refazer a rota'}).first().click();
    await expect(page.getByText('Deixadas para depois')).toHaveCount(0);
    await expect.poll(async () => (await ordem(page, NOMES)).length).toBe(6);
  });

  test('o ponto final escolhido fica no fim da rota e é o destino do último trecho do Maps', async ({page, context}) => {
    await context.setGeolocation(GPS.p3);
    await abrir(page);
    await carregar(page, ROTA_B);
    await menu(page, 'Ponto de saída e de chegada');
    await page.getByRole('button', {name: 'Marcar no mapa'}).click();
    await clicarMapa(page, -10.9300, -37.0550);
    // marcado, volta sozinho para a tela de onde saiu
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
  await page.getByRole('button', {name: 'Montar a rota', exact: true}).click();
  await expect(aviso(page)).toContainText('Pegando sua localização');
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible({timeout: 60_000});
  expect(await ordem(page, NOMES)).toHaveLength(6);

  await page.evaluate(() => (window as unknown as {permitirDepois: () => void}).permitirDepois());
  await expect(aviso(page)).toContainText('chegou depois que a rota ficou pronta');
  await paraABase(page);
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
  expect(await ordem(page, NOMES)).toHaveLength(6);
});

// O segundo lote do dia — o adicional, o print que chega depois — não pode custar a sequência
// que o motorista já está fazendo. Parada nova não tira ninguém do lugar: ela entra na conta de
// "fora da rota", e ele refaz quando quiser.
test('importar um segundo lote no meio do dia não apaga a rota', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  const proxima = await page.locator('.proxima .endereco').innerText();

  await aba(page, '1. Endereços');
  await carregar(page, ROTA_B);
  await expect(aviso(page)).toContainText('A rota de agora continua na tela');
  await aba(page, '3. Rota');
  await expect(page.locator('.proxima .endereco')).toHaveText(proxima);
  await expect(page.getByText(/parada\(s\) nova\(s\) ou corrigida\(s\) fora da rota/)).toBeVisible();
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
  // A distância e o tempo ficam no pé da lista. A hora de fim, no topo, sai do relógio: comparar
  // com ela quebrava sozinho quando o minuto virava no meio do teste.
  const pe = page.locator('.rodape-lista');
  await lista(page);
  await expect(pe).not.toContainText('aproximado');
  const pelasRuas = await pe.innerText();

  ruas = false;
  await montar(page);
  await expect(aviso(page)).toContainText('A de antes saiu pelas ruas');
  await expect(page.locator('.proxima')).toContainText('Rota em linha reta');

  await aviso(page).getByRole('button', {name: 'Desfazer'}).click();
  await expect(aviso(page)).toContainText('A rota de antes voltou');
  await lista(page);
  await expect.poll(async () => pe.innerText()).toBe(pelasRuas);
});

test('dá para pedir a rota na ordem do app de entrega, e o app diz o que isso custa', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await menu(page, 'Ponto de saída e de chegada');
  await page.getByLabel('Seguir a ordem do app de entrega (parada 1, 2, 3…)').check();
  await page.getByRole('button', {name: 'Montar a rota', exact: true}).click();
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
  await lista(page);
  await expect(page.locator('.rodape-lista')).toContainText(/Você pediu a ordem do app/);
  const naOrdem = await ordem(page, ['Rua das Acácias, 120', 'Rua dos Ipês, 300', 'Avenida Central, 1500', 'Travessa Um, 45', 'Rua D, 49']);
  expect(naOrdem).toEqual(['Rua das Acácias, 120', 'Rua dos Ipês, 300', 'Avenida Central, 1500', 'Travessa Um, 45', 'Rua D, 49']);
});

test('sem GPS a rota ainda é montada, e "voltar ao ponto de saída" já pode ser marcado', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_B);
  await menu(page, 'Ponto de saída e de chegada');
  await expect(page.getByLabel('Voltar ao ponto de saída no final')).toBeEnabled();
  await montar(page);
  expect(await ordem(page, NOMES)).toHaveLength(6);
});

test('o ponto final é apagado no reset do dia', async ({page}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await carregar(page, ROTA_B);
  await menu(page, 'Ponto de saída e de chegada');
  await page.getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.9300, -37.0550);
  await expect(page.getByText(/Local marcado no mapa/)).toBeVisible();
  await menu(page, 'Resetar a rota');
  await carregar(page, ROTA_B);
  await menu(page, 'Ponto de saída e de chegada');
  await expect(page.getByText(/Sem ponto final/)).toBeVisible();
});

// Num computador o navegador se localiza pela internet e erra quilômetros. Isso não é defeito
// nosso — dizer "Localização definida." e plantar o ponto de saída a 30 km era.
test.describe('localização ruim como ponto de saída', () => {
  test.use({permissions: ['geolocation'], geolocation: {latitude: -10.93, longitude: -37.10, accuracy: 38000}});

  // sem botão de "onde estou": a saída é pega ao montar, e o aviso fica no fim, não some sob o
  // "Rota pronta"
  test('avisa o tamanho do erro ao montar a rota, e o aviso fica na tela', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_B);
    await montar(page);
    await expect(aviso(page)).toContainText('Rota pronta');
    await expect(aviso(page)).toContainText('38 km');
    await expect(aviso(page)).toContainText('Sair de outro endereço');
  });
});
