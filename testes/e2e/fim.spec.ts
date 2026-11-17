import type {Page} from '@playwright/test';
import {abrir, carregar, montar, test, expect} from './apoio';

// "Finalizei a última entrega, o app fica nisso mesmo, não finaliza nada; aí temos que resetar a
// rota?" (dono, 16/11). O fim da rota encerra com um toque, e a de ontem toda feita sai sozinha.
const ROTA_F = 'testes/planilhas/rota-f.xlsx';
// meio-dia em Aracaju de 16/11, e as 7h do dia seguinte
const ONTEM = Date.parse('2026-11-16T15:00:00Z'), HOJE = Date.parse('2026-11-17T10:00:00Z');

const paradas = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{"paradas":[]}').paradas.length as number);

// O "Entreguei" do primeiro cartão da rota-f leva 3 de uma vez (o bloco pede confirmação).
async function rotaDeOntem(page: Page, toques: number | 'todas') {
  page.on('dialog', d => d.accept());
  await page.clock.install({time: ONTEM});
  await abrir(page);
  await carregar(page, ROTA_F);
  await montar(page);
  const proxima = page.locator('[data-folha="proxima"]'), fim = page.locator('[data-folha="fim"]');
  for (let i = 0; (toques === 'todas' || i < toques) && i < 20 && !(await fim.isVisible()); i++) {
    const antes = await page.locator('.resumo').innerText();
    await proxima.locator('[data-acao="entregue"]').first().click();
    // o topo tem de mudar antes do toque seguinte
    await expect(page.locator('.resumo')).not.toHaveText(antes);
  }
}

const virarODiaAbrindo = async (page: Page) => {
  await page.clock.setSystemTime(HOJE);
  await page.reload();
};
const virarODiaVoltando = async (page: Page) => {
  await page.clock.setSystemTime(HOJE);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
};
const telaDeComeco = (page: Page) => expect(page.getByRole('heading', {name: 'Carregar a rota de hoje'})).toBeVisible();

test.describe('o fim da rota e o dia seguinte', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('na última entrega, "Rota finalizada" com o resumo; Encerrar limpa, e o Desfazer devolve', async ({page}) => {
    await rotaDeOntem(page, 'todas');
    const fim = page.locator('[data-folha="fim"]');
    await expect(fim).toContainText('Rota finalizada');
    await expect(fim.locator('[data-resumo-do-dia]')).toHaveText(/^4 entregas, das \d\d:\d\d às \d\d:\d\d\.$/);
    // inteiro na tela, sem rolar: depois dos links das portas ele saía do cartão
    await expect(fim.getByRole('button', {name: 'Encerrar a rota'})).toBeInViewport({ratio: 1});
    await fim.getByRole('button', {name: 'Encerrar a rota'}).click();
    await telaDeComeco(page);
    await expect(page.locator('#status')).toContainText('Rota encerrada.');
    expect(await paradas(page)).toBe(0);
    await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
    await expect(page.locator('[data-folha="fim"]')).toContainText('Rota finalizada');
    expect(await paradas(page)).toBe(4);
  });

  test('com entrega deixada para depois, a sequência acaba mas a rota não: sem Encerrar', async ({page}) => {
    page.on('dialog', d => d.accept());
    await page.clock.install({time: ONTEM});
    await abrir(page);
    await carregar(page, ROTA_F);
    await montar(page);
    const proxima = page.locator('[data-folha="proxima"]'), fim = page.locator('[data-folha="fim"]');
    await proxima.getByRole('button', {name: 'Depois'}).click();
    for (let i = 0; i < 20 && !(await fim.isVisible()); i++) await proxima.locator('[data-acao="entregue"]').first().click();
    await expect(fim).toContainText('Sequência concluída. Falta(m) 3 deixada(s) para depois, na lista.');
    await expect(fim.getByRole('button', {name: 'Encerrar a rota'})).toHaveCount(0);
  });

  test('no dia seguinte, a rota de ontem toda feita sai sozinha ao abrir o app, com Desfazer', async ({page}) => {
    await rotaDeOntem(page, 'todas');
    await virarODiaAbrindo(page);
    await telaDeComeco(page);
    await expect(page.locator('#status')).toContainText('A rota de 16/11 foi encerrada: todas as entregas estavam feitas.');
    expect(await paradas(page)).toBe(0);
    await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
    await expect(page.locator('[data-folha="fim"]')).toContainText('Rota finalizada');
  });

  test('com o app aberto desde ontem, sai ao voltar para ele', async ({page}) => {
    await rotaDeOntem(page, 'todas');
    await virarODiaVoltando(page);
    await telaDeComeco(page);
    expect(await paradas(page)).toBe(0);
  });

  test('no mesmo dia, abrir de novo não mexe na rota feita', async ({page}) => {
    await rotaDeOntem(page, 'todas');
    await page.clock.setSystemTime(ONTEM + 5 * 3600e3);
    await page.reload();
    await expect(page.locator('[data-folha="fim"]')).toContainText('Rota finalizada');
    expect(await paradas(page)).toBe(4);
  });

  test('ontem com entrega por fazer: pergunta; Continuar mantém e não pergunta de novo', async ({page}) => {
    await rotaDeOntem(page, 1);
    await virarODiaAbrindo(page);
    const aviso = page.locator('[data-dia-novo]').first();
    await expect(aviso).toContainText('A rota de 16/11 ficou com 1 entrega por fazer. Começar o dia de hoje do zero?');
    await aviso.getByRole('button', {name: 'Continuar a de 16/11'}).click();
    await expect(page.locator('[data-dia-novo]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.resumo')).toContainText('3 de 4 entregas');
    await expect(page.locator('[data-dia-novo]')).toHaveCount(0);
    expect(await paradas(page)).toBe(4);
  });

  test('a planilha de ontem carregada e nunca montada: pergunta no cartão de montar', async ({page}) => {
    await page.clock.install({time: ONTEM});
    await abrir(page);
    await carregar(page, ROTA_F);
    await virarODiaAbrindo(page);
    await expect(page.locator('[data-folha="montar"] [data-dia-novo]')).toContainText('A rota de 16/11 ficou com 4 entregas por fazer.');
  });

  test('ontem com entrega por fazer: Começar do zero limpa, com Desfazer', async ({page}) => {
    await rotaDeOntem(page, 1);
    await virarODiaAbrindo(page);
    await page.locator('[data-dia-novo]').first().getByRole('button', {name: 'Começar do zero'}).click();
    await telaDeComeco(page);
    expect(await paradas(page)).toBe(0);
    await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
    await expect(page.locator('.resumo')).toContainText('3 de 4 entregas');
  });
});
