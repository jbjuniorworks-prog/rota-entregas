import {test, expect, abrir, carregar, paraABase, montar} from './apoio';

// A hora do fim no topo (Luan, 24/11): arredondada até a metade das entregas, porque no começo a
// previsão erra uns 20 a 30 minutos, e forte, porque em cinza ele não a via.
const ROTA_D = 'testes/planilhas/rota-d.xlsx';
const FIM = '[data-topo] [data-fim]';

test.use({viewport: {width: 412, height: 915}});

async function entregasFeitas(page: import('@playwright/test').Page) {
  const [, feitas, todas] = (await page.locator('[data-topo] .resumo b').innerText()).match(/(\d+) de (\d+)/)!;
  return {feitas: +feitas, todas: +todas};
}

test('no começo da rota, o fim vem arredondado para o quarto de hora', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_D);
  await paraABase(page);
  await montar(page);
  await expect(page.locator(FIM)).toHaveText(/^ · fim pelas? \d{1,2}h(00|15|30|45)?$/);
});

test('a hora do fim fica forte, na cor do texto, e não quebra a linha do topo', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_D);
  await paraABase(page);
  await montar(page);
  const fim = page.locator(FIM);
  await expect(fim).toBeVisible();
  const [cor, peso] = await fim.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).fontWeight]);
  expect(cor).toBe('rgb(17, 24, 39)');
  expect(+peso).toBeGreaterThanOrEqual(600);
  // uma linha só: a quebra empurrava o mapa para baixo (17/11)
  const altura = await page.locator('[data-topo] .resumo').evaluate(el => el.getBoundingClientRect().height);
  expect(altura).toBeLessThan(30);
});

test('da metade das entregas em diante, o fim volta com o minuto', async ({page}) => {
  test.setTimeout(120_000);
  await abrir(page);
  await carregar(page, ROTA_D);
  await paraABase(page);
  await montar(page);
  for (let n = await entregasFeitas(page); n.feitas * 2 < n.todas; ) {
    await expect(page.locator(FIM)).toHaveText(/fim pelas? /);
    await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
    const antes = n.feitas;
    await expect.poll(async () => (n = await entregasFeitas(page)).feitas).toBeGreaterThan(antes);
  }
  await expect(page.locator(FIM)).toHaveText(/^ · fim às \d\d:\d\d$/);
});
