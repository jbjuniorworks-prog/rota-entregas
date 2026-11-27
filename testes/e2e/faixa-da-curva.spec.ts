import type {Page} from '@playwright/test';
import {abrir, carregar, expect, montar, test, ROTA_A} from './apoio';

// Dono, 27/11, com a foto do Google Maps na rua: "↰ 30 m, Av. Principal; depois, ↱". A faixa da
// próxima curva, em cima do mapa, com o caminho até a próxima que o serviço de ruas devolve.
test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: {latitude: 0, longitude: 0, accuracy: 8}});

const metros = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) =>
  111320 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180));
const faixa = (page: Page) => page.locator('[data-faixa]');

test('a faixa mostra a curva até a próxima e, feita a curva, a chegada', async ({page, context}) => {
  // O serviço de ruas de mentira: no pedido com as manobras, o caminho vai do primeiro ponto ao
  // segundo com uma curva à esquerda no meio, na Av. Principal.
  let curva = {lat: 0, lng: 0};
  await context.route('**://router.project-osrm.org/**', r => {
    const url = new URL(r.request().url());
    const pts = url.pathname.split('/').pop()!.split(';').map(s => { const [lng, lat] = s.split(',').map(Number); return {lat, lng}; });
    if (url.pathname.includes('/table/')) {
      const distances = pts.map(a => pts.map(b => metros(a, b)));
      return r.fulfill({json: {code: 'Ok', distances, durations: distances.map(l => l.map(m => m / 10))}});
    }
    if (url.searchParams.get('steps') !== 'true') return r.fulfill({json: {code: 'Ok', routes: [{geometry: {coordinates: pts.map(p => [p.lng, p.lat])}}]}});
    const [a, b] = pts;
    curva = {lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2};
    const passo = (p: {lat: number; lng: number}, type: string, modifier?: string, name = '') => ({maneuver: {location: [p.lng, p.lat], type, modifier}, name});
    return r.fulfill({json: {code: 'Ok', routes: [{geometry: {coordinates: [a, curva, b].map(p => [p.lng, p.lat])},
      legs: [{steps: [passo(a, 'depart'), passo(curva, 'turn', 'left', 'Av. Principal'), passo(b, 'arrive')]}]}]}});
  });
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  const e = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
  const ordem: string[] = e.rota.areas.flatMap((x: any) => x.ordem);
  const parada = (id: string) => e.paradas.find((p: any) => p.id === id);
  const de = parada(ordem[0]), ate = parada(ordem[1]);
  expect(metros(de, ate), 'a premissa: a curva fica a mais de 50 m').toBeGreaterThan(100);

  // ele está na porta da primeira, e entrega
  await context.setGeolocation({latitude: de.lat, longitude: de.lng, accuracy: 8});
  await expect.poll(() => page.evaluate(() => (window as any).rotaTeste?.eu()?.lat)).toBeCloseTo(de.lat, 6);
  const resumo = await page.locator('.resumo').innerText();
  await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
  await expect(page.locator('.resumo')).not.toHaveText(resumo);
  await expect(faixa(page)).toBeVisible();
  expect(metros(curva, {lat: (de.lat + ate.lat) / 2, lng: (de.lng + ate.lng) / 2}), 'o caminho pedido saiu de onde ele está').toBeLessThan(5);
  await expect(faixa(page).locator('[data-frase]')).toHaveText('Av. Principal');
  await expect(faixa(page)).toContainText('Vire à esquerda');
  const d = metros(de, curva);
  await expect(faixa(page).locator('[data-metros]')).toHaveText(d >= 995 ? (Math.round(d / 100) / 10).toFixed(1).replace('.', ',') + ' km' : `${Math.round(d / 10) * 10} m`);

  // fez a curva: a da vez é a chegada
  await context.setGeolocation({latitude: curva.lat, longitude: curva.lng, accuracy: 8});
  await expect(faixa(page).locator('[data-frase]')).toHaveText('Chegando');
});
