import type {Page} from '@playwright/test';
import {abrir, aviso, carregar, clicarMapa, expect, garantirMapa, paraABase, test} from './apoio';

// Dono, 23/11: "já é a segunda vez, nem um aviso nem nada, simplesmente fica na rota". O condomínio
// da Soledade veio com o pino da planilha no meio da rota dele, a 14 km das portas do CEP. Planilha
// inventada com o CEP de verdade (rota-h): uma longe, uma perto, uma de CEP genérico.
const ROTA_H = 'testes/planilhas/rota-h.xlsx';
const AVISO = '[data-longe-do-cep]';

const idDe = (page: Page, texto: string) => page.evaluate(t =>
  JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((p: {texto: string}) => p.texto.startsWith(t)).id as string, texto);

test.describe('o pino longe do próprio CEP', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('a leitura da planilha avisa', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_H);
    await expect(aviso(page)).toContainText('1 entrega(s) com o pino da planilha a mais de 10 km das portas do próprio CEP');
  });

  test('o aviso vermelho fica na tela, com a distância', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_H);
    await expect(page.locator(AVISO)).toContainText(/1 entrega com o pino a 1\d km do próprio CEP\./);
  });

  test('o aviso aponta só a entrega longe, não a de perto nem a de CEP genérico', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_H);
    await page.locator(AVISO).getByRole('button', {name: 'Ver'}).click();
    await expect(page.locator(`${AVISO} [data-pino-longe]`)).toHaveCount(1);
    await expect(page.locator(`${AVISO} [data-pino-longe]`)).toContainText('Rua Teste Longe, 250');
    await expect(page.locator(`${AVISO} [data-pino-longe]`)).toContainText('das portas do CEP 49089-141');
  });

  test('o pino longe tem a borda de dúvida', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_H);
    await garantirMapa(page);
    const longe = await idDe(page, 'Rua Teste Longe');
    // de longe, ela e a de CEP genérico (a 100 m) podem dividir o pino
    await expect(page.locator(`.pino[data-ids*="${longe}"]`)).toHaveClass(/\bduvida\b/);
  });

  // a rota lida antes desta versão, já no celular: ao abrir o app, o aviso aparece
  test('a rota que já estava no celular ganha o aviso ao abrir o app', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_H);
    await expect(page.locator(AVISO)).toBeVisible();
    await page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
      for (const p of e.paradas) delete p.longeDoCep;
      localStorage.setItem('rota-entregas-v2', JSON.stringify(e));
    });
    await page.reload();
    await expect(page.locator(AVISO)).toContainText('1 entrega com o pino a');
  });

  test('arrumado o pino, o aviso sai', async ({page}) => {
    page.on('dialog', d => d.dismiss());
    await abrir(page);
    await carregar(page, ROTA_H);
    await page.locator(AVISO).getByRole('button', {name: 'Ver'}).click();
    await page.locator(`${AVISO} [data-pino-longe]`).getByRole('button', {name: 'Ver no mapa'}).click();
    await page.locator('[data-folha="pino"]').getByRole('button', {name: 'Arrumar o pino'}).click();
    await clicarMapa(page, -10.8750, -37.0880);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas[0].precisao)).toBe('manual');
    // de volta à tela da rota, onde o aviso mora: com o cartão do pino aberto ele nem aparece
    await paraABase(page);
    await expect(page.locator('[data-folha="proxima"], [data-montar]').first()).toBeVisible();
    await expect(page.locator(AVISO)).toHaveCount(0);
  });
});
