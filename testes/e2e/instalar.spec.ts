import {abrir, test, expect} from './apoio';

// Eles abriam o app numa aba do Chrome: sem ícone, com a barra do navegador, e sem o Compartilhar
// do celular, que só manda arquivo para app instalado. O Chrome avisa que dá para instalar com o
// evento beforeinstallprompt; aqui ele é imitado, porque o navegador de teste não o dispara.
const chromeOferece = (page) => page.evaluate(() => {
  const ev: any = new Event('beforeinstallprompt', {cancelable: true});
  ev.prompt = () => { (window as any).pediuInstalar = true; return Promise.resolve(); };
  ev.userChoice = Promise.resolve({outcome: 'accepted'});
  window.dispatchEvent(ev);
});

test('o Chrome oferece instalar: o app mostra o botão, e ele abre o pedido do Chrome', async ({page}) => {
  await abrir(page);
  await chromeOferece(page);
  const barra = page.locator('[data-instalar]');
  await expect(barra).toContainText('Instale o app');
  await barra.getByRole('button', {name: 'Instalar'}).click();
  expect(await page.evaluate(() => (window as any).pediuInstalar)).toBe(true);
  await expect(barra).toHaveCount(0);
});

test('"Agora não" some, e não volta na mesma semana', async ({page}) => {
  await abrir(page);
  await chromeOferece(page);
  await page.locator('[data-instalar]').getByRole('button', {name: 'Agora não'}).click();
  await expect(page.locator('[data-instalar]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await chromeOferece(page);
  await page.waitForTimeout(500);
  await expect(page.locator('[data-instalar]')).toHaveCount(0);
});

// instalado, o Chrome não oferece de novo: sem o evento, nada aparece
test('sem a oferta do Chrome, não aparece nada', async ({page}) => {
  await abrir(page);
  await page.waitForTimeout(800);
  await expect(page.locator('[data-instalar]')).toHaveCount(0);
});
