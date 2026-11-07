import type {Page} from '@playwright/test';
import {abrir, expect, lista, montar, carregar, test, ROTA_B} from './apoio';

// Parada sem pino com a rota andando (14/10): não podia ser marcada como entregue em lugar nenhum,
// e o aviso "N parada(s) sem local" não levava até ela. Ela fica sem local quando a planilha não
// traz posição e nada a acha; aqui, tirando a posição do estado salvo antes de montar a rota.
const salvo = (page: Page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {id: string; texto: string; lat: number | null; entregue: boolean}[]));

async function semLocal(page: Page, comeco: string) {
  await page.evaluate(comeco => {
    const e = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
    for (const p of e.paradas) if (p.texto.startsWith(comeco)) Object.assign(p, {lat: null, lng: null});
    localStorage.setItem('rota-entregas-v2', JSON.stringify(e));
  }, comeco);
  await page.reload();
}

async function rotaComUmaSemLocal(page: Page) {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await carregar(page, ROTA_B);
  await semLocal(page, 'Rua Centro, 3');
  await montar(page);
}

test.describe('parada sem local com a rota montada', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('aparece na lista, com o aviso levando até ela, e pode ser marcada como entregue', async ({page}) => {
    await rotaComUmaSemLocal(page);
    // o aviso do cartão da próxima leva até ela
    await page.locator('[data-folha="proxima"] [data-ver-sem-local]').click();
    const bloco = page.locator('[data-folha="lista"] [data-sem-local]');
    await expect(bloco).toBeVisible();
    await expect(bloco).toContainText('Sem local (1)');
    await expect(bloco).toContainText('Rua Centro, 3');
    await bloco.getByRole('button', {name: 'Entregue'}).click();
    // entregue de fato, no que fica salvo, e não mais "sem local"
    await expect.poll(async () => (await salvo(page)).find(p => p.texto.startsWith('Rua Centro, 3'))!.entregue).toBe(true);
    await expect(bloco).toHaveCount(0);
    await expect(page.locator('[data-folha="lista"]')).not.toContainText('sem local');
    // e o desfazer, na lista das entregues, devolve ela ao bloco
    const feitas = page.locator('[data-folha="lista"] details.feitas');
    await feitas.locator('summary').click();
    await feitas.locator('.parada', {hasText: 'Rua Centro, 3'}).getByRole('button', {name: 'Desfazer'}).click();
    await expect(bloco).toContainText('Rua Centro, 3');
  });

  test('dá para pôr o local por ali: Marcar no mapa e Estou aqui', async ({page}) => {
    await rotaComUmaSemLocal(page);
    await lista(page);
    const bloco = page.locator('[data-folha="lista"] [data-sem-local]');
    await expect(bloco.getByRole('button', {name: 'Marcar no mapa'})).toBeVisible();
    await expect(bloco.getByRole('button', {name: 'Estou aqui'})).toBeVisible();
    // sem posição, não tem o que deixar para depois
    await expect(bloco.getByRole('button', {name: 'Deixar para depois'})).toHaveCount(0);
  });

  test('com a rota feita e uma sem local, o fim não diz que tudo foi entregue', async ({page}) => {
    await rotaComUmaSemLocal(page);
    const proxima = page.locator('[data-folha="proxima"]');
    const fim = page.locator('[data-folha="fim"]');
    for (let i = 0; i < 20 && !(await fim.isVisible()); i++) await proxima.locator('[data-acao="entregue"]').first().click();
    await expect(fim).toContainText('Sequência concluída. Falta(m) 1 sem local, na lista.');
    await expect(fim).not.toContainText('Todas as entregas da rota foram feitas!');
    await expect(fim.locator('[data-lista]')).toContainText('faltam 1');
  });
});
