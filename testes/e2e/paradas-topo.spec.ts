import type {Page} from '@playwright/test';
import {abrir, carregar, colar, lista, montar, paraABase, test, expect} from './apoio';

// Luan, 17/11, pelo dono: no topo da rota ele quer as paradas, não os verificados. Desde 18/11 elas
// são os pinos do mapa (Luan: "as paradas que aparecem pra ele sejam a quantidade de pinos"), não as
// paradas da Shopee, que não batiam com o mapa. Planilhas inventadas: na rota-f, três entregas do
// mesmo número no mesmo ponto (um pino) e uma em outra rua; na rota-g, a P6 e a P40 juntas numa
// entrega (um pino) e a P7 em outra rua.
const ROTA_F = 'testes/planilhas/rota-f.xlsx', ROTA_G = 'testes/planilhas/rota-g.xlsx';

test.use({viewport: {width: 412, height: 915}});

const paradas = (page: Page) => page.locator('[data-paradas-topo]');
const entregas = (page: Page) => page.locator('[data-topo] .resumo b');

async function montarPelaSequencia(page: Page) {
  await paraABase(page);
  await page.locator('[data-montar="sequencia"]').click();
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible({timeout: 20_000});
}

test('as paradas do topo são os pinos do mapa: nem as paradas da Shopee, nem as entregas', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_F);
  await carregar(page, ROTA_G);
  await montarPelaSequencia(page);
  // 5 paradas da Shopee (P6 e P7 de uma planilha; P6, P7 e P40 da outra), 6 entregas, 4 pinos
  await expect(entregas(page)).toHaveText('0 de 6 entregas');
  await expect(paradas(page)).toHaveText('0/4 paradas');
  await expect(page.locator('[data-topo]')).not.toContainText('verificados');
});

test('o pino só conta com todas as entregas dele entregues, e o desfazer tira da conta', async ({page}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await carregar(page, ROTA_F);
  await montarPelaSequencia(page);
  await expect(entregas(page)).toHaveText('0 de 4 entregas');
  await expect(paradas(page)).toHaveText('0/2 paradas');
  // a primeira da sequência é o pino das três entregas do mesmo número
  await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
  await expect(entregas(page)).toHaveText('3 de 4 entregas');
  await expect(paradas(page)).toHaveText('1/2 paradas');

  await lista(page);
  await page.locator('details.feitas > summary').click();
  await page.locator('details.feitas [aria-label="Desfazer"]').first().click();
  // a entrega chega no topo antes de olhar o pino: senão o "1/2" seria o de antes dela
  await expect(entregas(page)).toHaveText('2 de 4 entregas');
  await expect(paradas(page)).toHaveText('0/2 paradas');
});

// Sem planilha da Shopee, o lado da barra fica vazio, como era.
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
