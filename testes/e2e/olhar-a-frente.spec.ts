import type {Page} from '@playwright/test';
import {abrir, carregar, expect, montar, test, ROTA_A} from './apoio';

// Dono, 27/11: "olhar pra frente acho interessante, vamos testar". Andando, o mapa mostra mais do
// caminho adiante: ele fica para a borda de trás, e o mapa continua com o norte para cima.
test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation']});

// O GPS do navegador de teste não tem rumo nem velocidade: este, de mentira, o teste é que manda.
test.beforeEach(async ({context}) => {
  await context.addInitScript(() => {
    const vigias = new Map<number, (p: any) => void>();
    let ultima: any = null, n = 0;
    const leitura = (lat: number, lng: number, heading: number | null, speed: number | null) =>
      ({coords: {latitude: lat, longitude: lng, accuracy: 8, heading, speed, altitude: null, altitudeAccuracy: null}, timestamp: Date.now()});
    Object.defineProperty(navigator, 'geolocation', {configurable: true, value: {
      watchPosition(cb: (p: any) => void) { const id = ++n; vigias.set(id, cb); if (ultima) setTimeout(() => cb(ultima)); return id; },
      clearWatch(id: number) { vigias.delete(id); },
      getCurrentPosition(cb: (p: any) => void) { if (ultima) setTimeout(() => cb(ultima)); },
    }});
    (window as any).__gps = (lat: number, lng: number, heading: number | null, speed: number | null) => {
      ultima = leitura(lat, lng, heading, speed);
      vigias.forEach(cb => cb(ultima));
    };
  });
});

const P = {lat: -10.9605, lng: -37.0455};
const gps = (page: Page, lat: number, lng: number, heading: number | null, speed: number | null) =>
  page.evaluate(([a, b, h, s]) => (window as any).__gps(a, b, h, s), [lat, lng, heading, speed] as const);
// onde a bolinha dele está, em relação ao meio do mapa, em fração da largura e da altura
const ondeEle = (page: Page) => page.evaluate(() => {
  const m = document.querySelector('#map')!.getBoundingClientRect(), eu = document.querySelector('.leaflet-marker-icon:has(.eu)')!.getBoundingClientRect();
  return {x: (eu.left + eu.width / 2 - (m.left + m.width / 2)) / m.width, y: (eu.top + eu.height / 2 - (m.top + m.height / 2)) / m.height};
});

test('andando para o norte ele fica embaixo do meio; para o leste, à esquerda; sem rumo, no meio', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await gps(page, P.lat, P.lng, null, null);
  await montar(page);
  await expect(page.locator('#btnEu')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Math.abs((await ondeEle(page)).y), 'a premissa: sem rumo, ele no meio').toBeLessThan(0.01);

  // 40 m ao norte em 4 s, a 10 m/s
  await page.waitForTimeout(4000);
  await gps(page, P.lat + 40 / 111320, P.lng, 0, 10);
  await expect.poll(async () => (await ondeEle(page)).y, 'indo para o norte, ele fica embaixo do meio').toBeGreaterThan(0.2);
  expect(Math.abs((await ondeEle(page)).x)).toBeLessThan(0.02);

  await page.waitForTimeout(4000);
  await gps(page, P.lat + 40 / 111320, P.lng + 40 / 109300, 90, 10);
  await expect.poll(async () => (await ondeEle(page)).x, 'indo para o leste, ele fica à esquerda do meio').toBeLessThan(-0.2);
  expect(Math.abs((await ondeEle(page)).y)).toBeLessThan(0.02);
});
