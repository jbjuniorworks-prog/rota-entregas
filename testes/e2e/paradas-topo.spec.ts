import type {Page} from '@playwright/test';
import {abrir, carregar, colar, lista, montar, paraABase, test, expect, ROTA_A} from './apoio';

// Luan, 17/11, pelo dono: no topo da rota ele quer as paradas da Shopee (o "P4" dos balões do mapa),
// não os verificados. Planilhas inventadas: na rota-d, cada parada tem dois endereços a 134 m; a
// rota-c tem 9 paradas e um pacote sem número; a rota-e tem uma P9 também.
const ROTA_C = 'testes/planilhas/rota-c.xlsx', ROTA_D = 'testes/planilhas/rota-d.xlsx', ROTA_E = 'testes/planilhas/rota-e.xlsx';

test.use({viewport: {width: 412, height: 915}});

const paradas = (page: Page) => page.locator('[data-paradas-topo]');
const entregas = (page: Page) => page.locator('[data-topo] .resumo b');
const entregar = (page: Page) => page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();

test('a parada da Shopee só conta com os dois endereços entregues, e o desfazer tira da conta', async ({page}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await carregar(page, ROTA_D);
  // pela sequência, as duas primeiras entregas são os dois endereços da P1
  await paraABase(page);
  await page.locator('[data-montar="sequencia"]').click();
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible({timeout: 20_000});
  await expect(paradas(page)).toHaveText('0/40 paradas');
  await expect(page.locator('[data-topo]')).not.toContainText('verificados');

  await entregar(page);
  // a entrega chega no topo antes de olhar a parada: senão o "0/40" seria o de antes dela
  await expect(entregas(page)).toHaveText('1 de 80 entregas');
  await expect(paradas(page)).toHaveText('0/40 paradas');
  await entregar(page);
  await expect(entregas(page)).toHaveText('2 de 80 entregas');
  await expect(paradas(page)).toHaveText('1/40 paradas');

  await lista(page);
  await page.locator('details.feitas > summary').click();
  await page.locator('details.feitas [aria-label="Desfazer"]').first().click();
  await expect(entregas(page)).toHaveText('1 de 80 entregas');
  await expect(paradas(page)).toHaveText('0/40 paradas');
});

test('o pacote sem número de parada não conta como parada', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_C);
  await montar(page);
  await expect(entregas(page)).toHaveText('0 de 10 entregas');
  await expect(paradas(page)).toHaveText('0/9 paradas');
});

test('duas planilhas: a P9 de uma não é a P9 da outra', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_C);
  await carregar(page, ROTA_E);
  await montar(page);
  await expect(paradas(page)).toHaveText('0/11 paradas');
});

// A rota-a, apesar do .txt, é planilha da Shopee com 7 paradas: a rota sem parada é a lista do Meli.
test('a lista do Meli não tem parada da Shopee: o lado da barra fica vazio', async ({page}) => {
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill([
    '#10 Rua Teste Inventada 30, CEP 49000-903 · 1 unid https://maps.google.com/maps?q=-10.9520%2C-37.0520&z=17',
    '#11 Rua Teste Inventada 90, CEP 49000-903 · 1 unid https://maps.google.com/maps?q=-10.9530%2C-37.0530&z=17',
  ].join('\n'));
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await montar(page);
  await expect(entregas(page)).toHaveText('0 de 2 entregas');
  await expect(paradas(page)).toHaveCount(0);
  await expect(page.locator('[data-topo]')).not.toContainText('verificados');
});

test('a rota-a, planilha da Shopee, conta as 7 paradas dela', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  await expect(paradas(page)).toHaveText('0/7 paradas');
});
