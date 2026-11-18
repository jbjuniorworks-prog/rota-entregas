import type {Page} from '@playwright/test';
import {abrir, carregar, expect, garantirMapa, paraABase, test, zoom} from './apoio';

// Luan, 18/11: a Shopee pôs na P6 e na P40 dois pacotes da mesma porta, com o complemento escrito
// de dois jeitos. O app junta os dois numa parada do celular, e o pino e os cartões só falavam da
// P6: ele procurava a P40 e não achava. Planilha inventada (rota-g).
const ROTA_G = 'testes/planilhas/rota-g.xlsx';

test.use({viewport: {width: 412, height: 915}});

// pela sequência das entregas, a primeira é a parada juntada (a P6 vem antes da P7)
async function montarPelaSequencia(page: Page) {
  await paraABase(page);
  await page.locator('[data-montar="sequencia"]').click();
  await expect(page.locator('[data-folha="proxima"]')).toBeVisible({timeout: 20_000});
}

test.beforeEach(async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_G);
  // a premissa: os dois pacotes viram uma parada só no celular
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.length)).toBe(2);
});

test('o balão do pino da parada juntada mostra as duas paradas da Shopee', async ({page}) => {
  await garantirMapa(page);
  await zoom(page, 17);
  await expect.poll(async () => [...new Set(await page.locator('.balao').allInnerTexts())].sort()).toEqual(['P6+40 ×2', 'P7']);
});

test('o cartão da próxima diz as duas paradas da Shopee', async ({page}) => {
  await montarPelaSequencia(page);
  await expect(page.locator('[data-folha="proxima"] [data-rotulo-proxima]')).toContainText('Próxima · paradas 6 e 40 · 2 pacotes');
});

test('na lista dos pacotes da parada, cada um diz a parada da Shopee dele', async ({page}) => {
  await montarPelaSequencia(page);
  const pacotes = page.locator('[data-folha="proxima"] [data-pacotes] .sub-entrega');
  await expect(pacotes).toHaveCount(2);
  await expect(pacotes.nth(0)).toContainText('P6 · #6 ·');
  await expect(pacotes.nth(1)).toContainText('P40 · #60 ·');
});
