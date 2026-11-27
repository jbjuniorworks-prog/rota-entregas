import type {Page} from '@playwright/test';
import {abrir, carregar, expect, montar, test, ROTA_A} from './apoio';

// Dono, 27/11, com a foto do Google Maps: "se conseguimos deixar o mapa se adaptando à nossa
// movimentação, paramos de usar o Maps e o Waze". Pegou outra rua: o caminho até a próxima é refeito
// de onde ele está.
test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: {latitude: 0, longitude: 0, accuracy: 8}});

const metros = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) =>
  111320 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180));
const tracos = (page: Page): Promise<[number, number][][]> => page.evaluate(() => (window as any).rotaTeste.linhaDaRota());

test('fora da linha por mais de 10 s, o caminho até a próxima sai de onde ele está', async ({page, context}) => {
  // o serviço de ruas de mentira: a linha passando pelos pontos pedidos
  const pedidos: string[] = [];
  await context.route('**://router.project-osrm.org/**', r => {
    const url = new URL(r.request().url());
    const pts = url.pathname.split('/').pop()!.split(';').map(s => { const [lng, lat] = s.split(',').map(Number); return {lat, lng}; });
    if (url.pathname.includes('/table/')) {
      const distances = pts.map(a => pts.map(b => metros(a, b)));
      return r.fulfill({json: {code: 'Ok', distances, durations: distances.map(l => l.map(m => m / 10))}});
    }
    pedidos.push(url.pathname);
    return r.fulfill({json: {code: 'Ok', routes: [{geometry: {coordinates: pts.map(p => [p.lng, p.lat])}}]}});
  });
  await page.clock.install();
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  await page.waitForFunction(() => !!(window as any).rotaTeste);
  const resumo = await page.locator('.resumo').innerText();
  await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
  await expect(page.locator('.resumo')).not.toHaveText(resumo);
  await expect.poll(async () => (await tracos(page)).length, 'a premissa: há linha até a próxima').toBe(1);

  const e = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
  const ordem: string[] = e.rota.areas.flatMap((a: any) => a.ordem);
  const parada = (id: string) => e.paradas.find((p: any) => p.id === id);
  const de = parada(ordem.find(id => parada(id).entregue)!), ate = parada(ordem.find(id => !parada(id).entregue)!);
  // 300 m para o lado do meio do caminho, de uma linha reta de-ate
  const k = 300 / metros(de, ate), cos = Math.cos(de.lat * Math.PI / 180);
  const fora = {lat: (de.lat + ate.lat) / 2 + (ate.lng - de.lng) * cos * k, lng: (de.lng + ate.lng) / 2 - (ate.lat - de.lat) / cos * k};
  const antes = pedidos.length;

  // o GPS manda uma leitura por segundo, andando um pouco
  for (let i = 0; i <= 12; i++) {
    await context.setGeolocation({latitude: fora.lat + i * 1e-5, longitude: fora.lng, accuracy: 8});
    await page.clock.fastForward(1000);
  }
  await page.clock.fastForward(3000);
  await expect.poll(async () => { const [t] = await tracos(page); return t ? metros({lat: t[0][0], lng: t[0][1]}, fora) : Infinity; },
    'a linha sai de perto dele').toBeLessThan(20);
  const [t] = await tracos(page);
  const [la, ln] = t[t.length - 1];
  expect(metros({lat: la, lng: ln}, ate), 'e vai até a próxima').toBeLessThan(2);
  expect(pedidos.length - antes, 'um pedido só, não um por leitura').toBe(1);
});
