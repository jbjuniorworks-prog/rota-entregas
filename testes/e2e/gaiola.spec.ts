import {readFileSync} from 'node:fs';
import * as XLSX from 'xlsx';
import {abrir, carregar, lista, montar, paraABase, test, expect} from './apoio';

// "Um aviso em vermelho avisando que 3 pacotes não estão na sua gaiola" (dono, 16/11). A rota-c tem
// um pacote que veio sem número de parada ("-" na sequência e na parada); a rota-d não tem nenhum.
const ROTA_C = 'testes/planilhas/rota-c.xlsx', ROTA_D = 'testes/planilhas/rota-d.xlsx';
const linhasDe = (arq: string) => {
  const wb = XLSX.read(readFileSync(arq), {type: 'buffer'});
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: ''});
};
const ADS = linhasDe(ROTA_C).find(l => String(l[2]).trim() === '-')!;
const TN = String(ADS[3]), BAIRRO = String(ADS[5]);

test.describe('o aviso dos pacotes que não estão na gaiola', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['clipboard-read', 'clipboard-write']});

  test('carregada a planilha, o aviso vermelho diz quantos, e o Ver mostra quais', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_C);
    await paraABase(page);
    const aviso = page.locator('[data-folha="montar"] [data-fora-da-gaiola]');
    await expect(aviso).toContainText('1 pacote não está na sua gaiola. Vieram na planilha sem número de parada.');
    await expect(aviso).toHaveClass(/vermelho/);
    await expect(aviso).toBeInViewport();
    await aviso.getByRole('button', {name: 'Ver'}).click();
    await expect(aviso.locator('[data-pacote-fora]')).toHaveCount(1);
    await expect(aviso.locator(`[data-pacote-fora="${TN}"]`)).toContainText(`${TN} · ${BAIRRO}`);
  });

  test('copiar leva o código e o bairro para os analistas', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_C);
    await paraABase(page);
    const aviso = page.locator('[data-fora-da-gaiola]');
    await aviso.getByRole('button', {name: 'Ver'}).click();
    await aviso.getByRole('button', {name: 'Copiar para os analistas'}).click();
    await expect(page.locator('#status')).toContainText('Copiado');
    const copiado = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    expect(copiado).toBe(`1 pacote não está na minha gaiola. Vieram na rota sem número de parada:\n${TN} · ${BAIRRO}`);
  });

  test('com a rota montada, o aviso continua até ele dizer que pegou', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_C);
    await montar(page);
    await lista(page);
    const aviso = page.locator('[data-folha="lista"] [data-fora-da-gaiola]');
    await expect(aviso).toContainText('1 pacote não está na sua gaiola.');
  });

  test('o Já peguei some com o aviso, e ele não volta ao abrir o app de novo', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_C);
    await paraABase(page);
    const aviso = page.locator('[data-fora-da-gaiola]');
    await aviso.getByRole('button', {name: 'Ver'}).click();
    await aviso.getByRole('button', {name: 'Já peguei'}).click();
    await expect(aviso).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-folha="montar"]')).toBeVisible();
    await expect(page.locator('[data-fora-da-gaiola]')).toHaveCount(0);
    await montar(page);
    await lista(page);
    await expect(page.locator('[data-fora-da-gaiola]')).toHaveCount(0);
  });

  test('a planilha sem pacote fora da gaiola não avisa nada', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_D);
    await paraABase(page);
    await expect(page.locator('[data-folha="montar"]')).toBeVisible();
    await expect(page.locator('[data-fora-da-gaiola]')).toHaveCount(0);
  });
});
