import type {Page} from '@playwright/test';
import {abrir, aviso, carregar, expect, montar, test, ROTA_A} from './apoio';

// Dono, 26/11: "ao invés de 2 botões pra entreguei aqui e entreguei, cada um só aparecer na hora
// que precisa". Na porta que falta verificar, o botão de entregar é o Entreguei aqui. Quem entregou
// na portaria ou ao vizinho tem "Entregar sem marcar a porta" antes, e "Não foi na porta" depois.
test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: {latitude: 0, longitude: 0, accuracy: 8}});

const cartao = (page: Page) => page.locator('[data-folha="proxima"]');
const paradaDe = (page: Page, id: string) => page.evaluate(i =>
  JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.id === i), id);

// a próxima, que não é porta verificada, com o GPS em cima dela
async function naPortaDaProxima(page: Page, context: any) {
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  await expect(cartao(page).locator('[data-acao="aqui"]'), 'a premissa: a próxima ainda não é porta verificada').toBeVisible();
  const e = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
  const ordem: string[] = e.rota.areas.flatMap((a: any) => a.ordem);
  const id = ordem.find(i => !e.paradas.find((p: any) => p.id === i).entregue)!;
  const p = e.paradas.find((x: any) => x.id === id);
  await context.setGeolocation({latitude: p.lat + 0.00005, longitude: p.lng, accuracy: 8});
  return {id, antes: {lat: p.lat, lng: p.lng}};
}

test('na porta por verificar, um botão de entregar só: a fileira de baixo fica com Waze e Depois', async ({page, context}) => {
  await naPortaDaProxima(page, context);
  await expect(cartao(page).getByRole('button', {name: /^Entreguei/})).toHaveCount(1);
  await expect(cartao(page).locator('.tres > *')).toHaveText(['Waze', 'Depois']);
  await expect(cartao(page).locator('[data-sem-porta]')).toHaveText('Entregar sem marcar a porta');
});

test('"Entregar sem marcar a porta" entrega e deixa o pino onde estava', async ({page, context, nuvem}) => {
  const {id, antes} = await naPortaDaProxima(page, context);
  await cartao(page).locator('[data-sem-porta]').click();
  await expect.poll(async () => (await paradaDe(page, id)).entregue).toBe(true);
  expect(await paradaDe(page, id)).toMatchObject(antes);
  await page.waitForTimeout(1500);
  expect(nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'POST'), 'nenhuma porta vai para a nuvem').toEqual([]);
});

test('depois do Entreguei aqui, "Não foi na porta" tira só a porta: a entrega fica', async ({page, context}) => {
  const {id, antes} = await naPortaDaProxima(page, context);
  await cartao(page).locator('[data-acao="aqui"]').click();
  await expect(aviso(page)).toContainText('com a porta marcada aqui');
  expect(await paradaDe(page, id), 'a premissa: a porta saiu do lugar').not.toMatchObject(antes);
  await aviso(page).getByRole('button', {name: 'Não foi na porta'}).click();
  await expect(aviso(page)).toContainText('Entregue, sem marcar a porta');
  const depois = await paradaDe(page, id);
  expect(depois.entregue).toBe(true);
  expect(depois).toMatchObject(antes);
});
