import {test, expect, abrir, aba, aviso, carregar, clicarMapa, linhaDe, lista, menu, montar, verNoMapa, ROTA_A, ROTA_B} from './apoio';

// O voltar do celular (pedido de 02/10): cada tela e cada painel aberto é um passo, voltar fecha
// o que abriu, e na tela de base o primeiro voltar avisa e o segundo sai do app.
test.use({viewport: {width: 412, height: 915}});

const naConferir = (page) => page.locator('.cabecalho .titulo').getByText(/para conferir|Todos os endereços/);
// uma página antes do app no histórico, do mesmo endereço: o script de teste lê o localStorage,
// que numa página data: não existe
const ANTES = './versao.json';
const AVISO_DE_SAIR = 'Toque de novo em voltar para sair';

test('voltar fecha o que abriu, na ordem, e o menu não reabre', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);

  await page.getByRole('button', {name: 'Mais', exact: true}).click();
  await expect(page.locator('.menu')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible();

  await lista(page);
  await page.goBack();
  await expect(page.locator('[data-folha="lista"]')).toHaveCount(0);
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible();

  // a tela aberta pelo menu volta para a Rota, e não para o menu
  await aba(page, '2. Conferir');
  await expect(naConferir(page)).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
  await expect(page.locator('.menu')).toHaveCount(0);

  // "Ver no mapa" abre o pino; voltar devolve à Conferir, onde ele estava
  await aba(page, '2. Conferir');
  await page.locator('[data-item]').first().getByRole('button', {name: 'Ver no mapa'}).click();
  await expect(page.locator('[data-folha="pino"]')).toBeVisible();
  await page.goBack();
  await expect(naConferir(page)).toBeVisible();
});

test('na tela de base, o primeiro voltar avisa e o segundo sai do app', async ({page}) => {
  await page.goto(ANTES);
  await abrir(page);
  await carregar(page, ROTA_A);
  await page.goBack();
  await expect(aviso(page)).toContainText(AVISO_DE_SAIR);
  await expect(page.locator('[data-topo]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/versao\.json$/);
});

// Passado o aviso, voltar avisa de novo: sair continua pedindo dois toques.
test('depois do aviso de sair, a tela de base volta a ser um passo', async ({page}) => {
  await page.goto(ANTES);
  await abrir(page);
  await carregar(page, ROTA_A);
  await page.goBack();
  await expect(aviso(page)).toContainText(AVISO_DE_SAIR);
  await page.waitForTimeout(3500);
  await page.goBack();
  await expect(aviso(page)).toContainText(AVISO_DE_SAIR);
  await expect(page.locator('[data-topo]')).toBeVisible();
});

// Ler a planilha pelo menu e montar a rota pela tela de Ponto de saída levam à Rota. Trocando só
// o passo de cima, ficavam dois passos de Rota, e o primeiro voltar parecia não fazer nada.
test('chegar à Rota por outra tela não deixa um voltar à toa', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await carregar(page, ROTA_B);
  await expect(page.locator('[data-topo]')).toBeVisible();
  await page.goBack();
  await expect(aviso(page)).toContainText(AVISO_DE_SAIR);

  // logo depois do aviso, o menu ainda tem de funcionar
  await menu(page, 'Ponto de saída e de chegada');
  await expect(page.locator('.cabecalho')).toContainText('Ponto de saída e de chegada');
  await page.getByRole('button', {name: 'Montar a rota', exact: true}).click();
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible({timeout: 20_000});
  await page.goBack();
  await expect(aviso(page)).toContainText(AVISO_DE_SAIR);
});

// Pelo Compartilhar do WhatsApp o app abre com ?compartilhado=1. Limpando a barra, o app apagava o
// passo do voltar daquela entrada: fechar o menu depois avisava que ia sair do app. Com endereços
// no compartilhado a rota é montada e o passo é refeito; o que ficava quebrado era o vazio.
test('aberto pelo Compartilhar sem nada, o voltar continua funcionando', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await page.goto('./?compartilhado=1');
  await expect(page.locator('[data-topo]')).toBeVisible();
  await expect(page).not.toHaveURL(/compartilhado/);
  await page.getByRole('button', {name: 'Mais', exact: true}).click();
  await page.goBack();
  await expect(page.locator('.menu')).toHaveCount(0);
  await page.waitForTimeout(500);
  // lido uma vez: o not.toContainText espera o aviso sumir sozinho, e passava com ele na tela
  expect(await aviso(page).innerText()).not.toContain(AVISO_DE_SAIR);
});

// Na Conferir, "Marcar no mapa" leva ao mapa; marcado, ele volta sozinho para seguir conferindo.
test('marcar no mapa pela Conferir volta para a Conferir, sem passo a mais', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  await linhaDe(page, 'Rua D, 49', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await expect(page.locator('[data-armado]')).toBeVisible();
  await expect(page.locator('#map')).toBeVisible();
  await clicarMapa(page, -10.9605, -37.0455);
  await expect(naConferir(page)).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-topo]')).toBeVisible();
  await page.goBack();
  await expect(aviso(page)).toContainText(AVISO_DE_SAIR);
});

// Armado pela lista e saindo pelo voltar: o modo ficava armado, e o toque seguinte no mapa
// marcava o pino e ainda dava um voltar que ninguém pediu.
test('voltar sem tocar no mapa desarma, e o toque seguinte não mexe em nada', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_B);
  await montar(page);
  await lista(page);
  const linha = page.locator('[data-folha="lista"] .parada').first();
  const id = await linha.getAttribute('data-item');
  await linha.getByRole('button', {name: 'Deixar para depois'}).click();
  await page.locator('[data-folha="lista"]').getByRole('button', {name: 'Marcar no mapa'}).click();
  await expect(page.locator('[data-armado]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-folha="lista"]')).toBeVisible();
  await expect(page.locator('[data-armado]')).toHaveCount(0);

  const antes = await page.evaluate(i => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.id === i), id);
  await page.getByRole('button', {name: 'Voltar ao mapa'}).click();
  await clicarMapa(page, antes.lat + 0.001, antes.lng + 0.001);
  const depois = await page.evaluate(i => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.id === i), id);
  expect([depois.lat, depois.lng]).toEqual([antes.lat, antes.lng]);
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
});

// Com o cartão de um pino aberto, tocar em outro troca o cartão: um voltar fecha, e não volta
// pino por pino por tudo que ele olhou.
test('tocar em outro pino troca o cartão, e um voltar fecha', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_B);
  await montar(page);
  await verNoMapa(page, -10.9300, -37.0800, 13);
  const pinos = page.locator('.leaflet-marker-icon .pino');
  await pinos.nth(0).click();
  const primeiro = await page.locator('[data-folha="pino"]').innerText();
  await pinos.nth(1).click();
  await expect(page.locator('[data-folha="pino"]')).not.toHaveText(primeiro);
  await page.goBack();
  await expect(page.locator('[data-folha="pino"]')).toHaveCount(0);
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
});

// A lista aberta enquanto a rota é refeita fechava sozinha quando ela ficava pronta: a montagem
// mandava para a Rota até quem já estava nela.
test('refazer a rota pela lista deixa a lista aberta', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_B);
  await montar(page);
  await lista(page);
  const linha = page.locator('[data-folha="lista"] .parada').first();
  await linha.getByRole('button', {name: 'Deixar para depois'}).click();
  await page.getByRole('button', {name: 'Voltar para a rota'}).click();
  await page.locator('[data-folha="lista"]').getByRole('button', {name: 'Refazer a rota'}).first().click();
  await expect(aviso(page)).toContainText('Rota pronta');
  await page.waitForTimeout(500);
  await expect(page.locator('[data-folha="lista"]')).toBeVisible();
});
