import {abrir, aba, expect, test} from './apoio';

// Fotografa as telas com uma rota de verdade, no tamanho de celular, para olhar a UI em vez
// de opinar sobre ela. A planilha fica fora do git: ROTA_REAL aponta para a do dia.
//   ROTA_REAL="/caminho/rota.xlsx" npm run test:ui
const ROTA = process.env.ROTA_REAL || '';
test.use({viewport: {width: 412, height: 915}});
test.setTimeout(5 * 60_000);
test.skip(!ROTA, 'defina ROTA_REAL com o caminho de uma planilha de rota');

test('@ui fotografa as telas como o motorista vê', async ({page}, info) => {
  await abrir(page);
  await page.screenshot({path: info.outputPath('1-vazio.png'), fullPage: true});

  await page.locator('#cidade').fill('Aracaju, SE');
  await page.locator('input[type=file]').setInputFiles(ROTA);
  await expect(page.locator('#status')).toContainText('parada(s) da planilha', {timeout: 60_000});
  await page.waitForTimeout(2500);
  await page.screenshot({path: info.outputPath('2-conferir.png'), fullPage: false});

  await aba(page, '1. Endereços');
  await page.screenshot({path: info.outputPath('3-enderecos.png'), fullPage: true});

  await aba(page, '3. Rota');
  await page.waitForTimeout(800);
  await page.screenshot({path: info.outputPath('4-rota-antes.png'), fullPage: false});

  const montar = page.getByRole('button', {name: /Montar melhor sequência/});
  if (!(await montar.isVisible())) await page.getByText('Ponto de saída / refazer rota').click();
  await montar.click();
  await expect(page.locator('.resumo')).toBeVisible({timeout: 90_000});
  await page.waitForTimeout(1200);
  await page.screenshot({path: info.outputPath('5-rota-montada.png'), fullPage: false});
  await page.locator('.resumo').scrollIntoViewIfNeeded();
  await page.screenshot({path: info.outputPath('6-rota-lista.png'), fullPage: true});

  console.log('fotos em:', info.outputDir);
});
