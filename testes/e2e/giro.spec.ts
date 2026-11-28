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

// Dono, 28/11: "parece que vira dando umas pancadas". O giro mudava de 10 em 10 graus, cada leitura
// do GPS recomeçava a animação, e o mapa pulava de lugar a cada leitura.
test('uma virada pequena, de 6°, já gira, sem esperar juntar 10°', async ({page}) => {
  await andandoParaOLeste(page);
  await expect.poll(() => giroDoMapa(page)).toBe(-90);
  await page.waitForTimeout(4000);
  await gps(page, P.lat - 4 / 111320, P.lng + 80 / 109300, 96, 10);
  await expect.poll(() => giroDoMapa(page)).toBe(-96);
});

test('girando, o mapa anda junto aos poucos, e ele fica no lugar dele na tela', async ({page}) => {
  await andandoParaOLeste(page);
  await expect.poll(() => giroDoMapa(page)).toBe(-90);
  // onde ele fica quando o mapa assenta: no meio, 28% da altura abaixo
  const longeDoLugar = async () => { const e = await ondeEle(page); return Math.hypot(e.x, e.y - 0.28); };
  await expect.poll(longeDoLugar).toBeLessThan(0.01);
  // um pino do mapa, que não desliza sozinho: é o mapa andando que o leva
  const pino = () => page.locator('#map .em-pe').first().evaluate(el => { const r = el.getBoundingClientRect(); return {x: r.left, y: r.top}; });
  const antes = await pino();
  await page.waitForTimeout(4000);
  await gps(page, P.lat, P.lng + 80 / 109300, 90, 10);
  await page.waitForTimeout(250);
  const noMeio = await pino();
  expect(await longeDoLugar(), 'deslizando, ele continua no lugar dele').toBeLessThan(0.02);
  await page.waitForTimeout(1200);
  const depois = await pino();
  const andou = (a: {x: number; y: number}) => Math.hypot(a.x - antes.x, a.y - antes.y);
  expect(andou(depois), 'a premissa: o mapa andou').toBeGreaterThan(20);
  expect(andou(noMeio), 'no meio do deslize, o mapa andou só uma parte: não pulou').toBeLessThan(andou(depois) * 0.8);
  expect(andou(noMeio)).toBeGreaterThan(0);
  expect(await longeDoLugar()).toBeLessThan(0.01);
});

// Dono, 28/11: "ao clicar em outro pino buga". Com o mapa girado, o toque abria o cartão certo, mas o
// norte voltava girando em volta do meio da tela e o pino tocado ia parar fora dela.
test('tocando num pino com o mapa girado, o cartão abre nele e o pino fica à vista', async ({page}) => {
  // como na reprodução: indo quase para o sul (160°), perto da 6ª parada
  await abrir(page);
  await carregar(page, ROTA_A);
  const e = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
  const perto = e.paradas[5];
  await gps(page, perto.lat - 0.0003, perto.lng, null, null);
  await montar(page);
  await page.waitForTimeout(3000);
  await gps(page, perto.lat - 0.0001, perto.lng, 160, 8);
  await expect.poll(() => giroDoMapa(page)).toBe(-160);
  await page.waitForTimeout(800);
  // um pino visível, longe do meio, que não é ele
  const alvo = await page.evaluate(() => {
    const area = document.querySelector('.mapwrap')!.getBoundingClientRect();
    const pinos = [...document.querySelectorAll('#map .leaflet-marker-icon .pino')].map(p => {
      const r = p.getBoundingClientRect();
      return {ids: (p as HTMLElement).dataset.ids!, x: r.left + r.width / 2, y: r.top + r.height / 2};
    }).filter(p => p.x > area.left && p.x < area.right && p.y > area.top + 60 && p.y < area.bottom);
    pinos.sort((a, b) => Math.hypot(b.x - (area.left + area.width / 2), b.y - (area.top + area.height / 2)) - Math.hypot(a.x - (area.left + area.width / 2), a.y - (area.top + area.height / 2)));
    return pinos[0];
  });
  expect(alvo, 'a premissa: um pino à vista').toBeTruthy();
  await page.mouse.click(alvo.x, alvo.y);
  await expect(page.locator('[data-folha="pino"]')).toBeVisible();
  await expect(page.locator('[data-folha="pino"] [data-item]').first()).toHaveAttribute('data-item', alvo.ids.split('+')[0]);
  await expect.poll(() => giroDoMapa(page)).toBe(0);
  // o pino tocado continua na tela, acima do cartão
  const onde = await page.evaluate(ids => {
    const p = document.querySelector(`#map .pino[data-ids="${ids}"]`)!.getBoundingClientRect(), area = document.querySelector('.mapwrap')!.getBoundingClientRect();
    return {dentro: p.top >= area.top && p.bottom <= area.bottom && p.left >= area.left && p.right <= area.right};
  }, alvo.ids);
  expect(onde.dentro, 'o pino tocado à vista').toBe(true);
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
