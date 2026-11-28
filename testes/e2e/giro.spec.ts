import type {Page} from '@playwright/test';
import {abrir, carregar, expect, lista, menu, montar, paraABase, test, ROTA_A} from './apoio';

// Dono, 28/11, com a foto da faixa "↖ vire levemente à esquerda" e a linha descendo na tela: "o
// caminho sempre para cima". Andando, o mapa gira para o rumo dele; os pinos ficam em pé; tocar num
// pino volta o norte para cima; a chave nos Ajustes desliga.
test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation']});

// o GPS de mentira, com rumo e velocidade (o do navegador de teste não tem)
test.beforeEach(async ({context}) => {
  await context.addInitScript(() => {
    const vigias = new Map<number, (p: any) => void>();
    let ultima: any = null, n = 0;
    Object.defineProperty(navigator, 'geolocation', {configurable: true, value: {
      watchPosition(cb: (p: any) => void) { const id = ++n; vigias.set(id, cb); if (ultima) setTimeout(() => cb(ultima)); return id; },
      clearWatch(id: number) { vigias.delete(id); },
      getCurrentPosition(cb: (p: any) => void) { if (ultima) setTimeout(() => cb(ultima)); },
    }});
    (window as any).__gps = (lat: number, lng: number, heading: number | null, speed: number | null) => {
      ultima = {coords: {latitude: lat, longitude: lng, accuracy: 8, heading, speed, altitude: null, altitudeAccuracy: null}, timestamp: Date.now()};
      vigias.forEach(cb => cb(ultima));
    };
  });
});

const P = {lat: -10.9605, lng: -37.0455};
const gps = (page: Page, lat: number, lng: number, heading: number | null, speed: number | null) =>
  page.evaluate(([a, b, h, s]) => (window as any).__gps(a, b, h, s), [lat, lng, heading, speed] as const);
// o giro do elemento do mapa, em graus (0 sem giro)
const giroDoMapa = (page: Page) => page.locator('#map').evaluate(el => {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  const [a, b] = t.slice(7, -1).split(',').map(Number);
  return Math.round(Math.atan2(b, a) * 180 / Math.PI);
});
// onde a bolinha dele está na tela, em relação ao meio da área do mapa, em fração da altura
const ondeEle = (page: Page) => page.evaluate(() => {
  const m = document.querySelector('.mapwrap')!.getBoundingClientRect(), eu = document.querySelector('.leaflet-marker-icon:has(.eu)')!.getBoundingClientRect();
  return {x: (eu.left + eu.width / 2 - (m.left + m.width / 2)) / m.width, y: (eu.top + eu.height / 2 - (m.top + m.height / 2)) / m.height};
});

async function andandoParaOLeste(page: Page) {
  await abrir(page);
  await carregar(page, ROTA_A);
  await gps(page, P.lat, P.lng, null, null);
  await montar(page);
  await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
  expect(await giroDoMapa(page), 'a premissa: parado, sem giro').toBe(0);
  await page.waitForTimeout(4000);
  await gps(page, P.lat, P.lng + 40 / 109300, 90, 10);
}

test('andando para o leste, o mapa gira 90° para o caminho ficar para cima, e ele fica embaixo do meio', async ({page}) => {
  await andandoParaOLeste(page);
  // girar o mapa 90° para a esquerda põe o leste para cima
  await expect.poll(() => giroDoMapa(page)).toBe(-90);
  await page.waitForTimeout(800);
  const eu = await ondeEle(page);
  expect(eu.y, 'adiante é para cima: ele fica embaixo do meio').toBeGreaterThan(0.2);
  expect(Math.abs(eu.x)).toBeLessThan(0.03);
  // o pino gira de volta e fica em pé
  await expect(page.locator('#map .em-pe').first()).toHaveCSS('transform', /matrix\(0, 1, -1, 0|matrix\(6\.12[0-9e-]+, 1, -1/);
  // o + e o − ficam fora do mapa que gira, e funcionam
  const z0 = await page.evaluate(() => (window as any).rotaTeste.zoomAtual());
  await page.locator('.controles-do-mapa .leaflet-control-zoom-out').click();
  await expect.poll(() => page.evaluate(() => (window as any).rotaTeste.zoomAtual())).toBe(z0 - 1);
});

test('abrindo o cartão de um pino, o norte volta para cima', async ({page}) => {
  await andandoParaOLeste(page);
  await expect.poll(() => giroDoMapa(page)).toBe(-90);
  await lista(page);
  await page.locator('[data-folha="lista"] .parada .txt').first().click();
  await expect(page.locator('[data-folha="pino"]')).toBeVisible();
  await expect.poll(() => giroDoMapa(page)).toBe(0);
});

test('com a chave desligada nos Ajustes, o mapa não gira', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await menu(page, 'Ajustes deste celular');
  await page.locator('[data-chave="giro"]').click();
  await expect(page.locator('[data-chave="giro"]')).toHaveAttribute('aria-checked', 'false');
  await paraABase(page);
  await gps(page, P.lat, P.lng, null, null);
  await montar(page);
  await page.waitForTimeout(4000);
  await gps(page, P.lat, P.lng + 40 / 109300, 90, 10);
  await page.waitForTimeout(1500);
  expect(await giroDoMapa(page)).toBe(0);
});

// Os controles saíram de dentro do mapa (para não girarem): o crédito do OpenStreetMap, que a licença
// dos mapas pede, ficava escondido atrás da borda do cartão, e o + e o − também.
test('o crédito do mapa e o + e o − ficam à vista, por cima de tudo', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await gps(page, P.lat, P.lng, null, null);
  await montar(page);
  await paraABase(page);
  // a mensagem do topo cobre o + e o − enquanto está aberta (como antes desta mudança)
  if (await page.locator('[data-fechar-aviso]').isVisible()) await page.locator('[data-fechar-aviso]').click();
  for (const sel of ['.leaflet-control-attribution', '.leaflet-control-zoom-in']) {
    const noMeio = await page.locator(sel).evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    });
    expect(noMeio, sel).toBe(true);
  }
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
});
