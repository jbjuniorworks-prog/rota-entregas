import type {BrowserContext, Page} from '@playwright/test';
import {abrir, aviso, carregar, clicarMapa, garantirMapa, lista, montar, test, expect, ROTA_A} from './apoio';

// Dono, 15/11: "quando mudamos pinos, ela reage?". Com rede, a rota se refaz sozinha quando o pino
// de uma parada por entregar anda mais de 100 m; sem rede, fica o aviso de sempre até a rede voltar.
const PINO = '[data-folha="pino"]';
const REFEITA = 'Um pino mudou de lugar, e a rota foi refeita.';
// a espera de quando ele para de mexer nos pinos (QUIETO, 10 s), com folga
const PASSA_A_ESPERA = 13_000;

interface P {id: string; lat: number; lng: number}
interface E {paradas: P[]; rota: {desatualizada?: boolean; areas: {ordem: string[]}[]}}
const estado = (page: Page): Promise<E> => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
const ordemDe = (e: E) => e.rota.areas.flatMap(a => a.ordem);
const metros = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) =>
  111320 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180));

// O serviço de ruas de mentira: linha reta a 10 m/s. O setOffline não barra o que o teste responde,
// então "sem rede" é ele recusar o pedido. Conta os pedidos de tempos (um por montagem e área).
async function ruasDeMentira(context: BrowserContext) {
  const rede = {fora: false, recusados: 0, tabelas: 0};
  await context.route('**://router.project-osrm.org/**', r => {
    if (rede.fora) { rede.recusados++; return r.abort('internetdisconnected'); }
    const url = new URL(r.request().url());
    const pts = url.pathname.split('/').pop()!.split(';').map(s => { const [lng, lat] = s.split(',').map(Number); return {lat, lng}; });
    if (url.pathname.includes('/table/')) {
      rede.tabelas++;
      const distances = pts.map(a => pts.map(b => metros(a, b)));
      return r.fulfill({json: {code: 'Ok', distances, durations: distances.map(l => l.map(m => m / 10))}});
    }
    return r.fulfill({json: {code: 'Ok', routes: [{geometry: {coordinates: pts.map(p => [p.lng, p.lat])}}]}});
  });
  return rede;
}

async function comRotaMontada(page: Page, context: BrowserContext) {
  // levar outra junto para "virar uma parada só" não é o caso aqui
  page.on('dialog', d => d.message().includes('uma parada só') ? d.dismiss() : d.accept());
  const rede = await ruasDeMentira(context);
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  await garantirMapa(page);
  return rede;
}

// Leva pelo Arrumar o pino uma parada da rota para perto da última: a ordem montada fica errada.
async function levarParaOFim(page: Page, k: number) {
  const antes = await estado(page);
  const ordem = ordemDe(antes);
  const ela = antes.paradas.find(p => p.id === ordem[k])!;
  const ultima = antes.paradas.find(p => p.id === ordem[ordem.length - 1])!;
  const destino = {lat: ultima.lat + 0.0004 * (k + 1), lng: ultima.lng};
  expect(metros(ela, destino), 'o caso pede um pino que anda mais de 100 m').toBeGreaterThan(100);
  await lista(page);
  await page.locator(`[data-item="${ela.id}"] .txt`).click();
  await page.locator(`${PINO} [data-acao=arrumar][data-ids="${ela.id}"]`).click();
  await clicarMapa(page, destino.lat, destino.lng);
  await expect.poll(async () => (await estado(page)).paradas.find(p => p.id === ela.id)!.lat).toBeCloseTo(destino.lat, 5);
  return {ordem, ela: ela.id, ultima: ultima.id};
}

test.describe('a rota se refaz sozinha quando o pino de uma que falta anda demais', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('com rede, refaz uma vez só, sem ele tocar em nada; desfeita, não refaz de novo sozinha', async ({page, context}) => {
    const rede = await comRotaMontada(page, context);
    const tabelasAntes = rede.tabelas;
    const {ordem, ela, ultima} = await levarParaOFim(page, 0);
    // Um segundo pino, ainda dentro da espera: arrumando vários, refaz uma vez só. Os 6 s dão para
    // uma rota refeita sem espera nenhuma terminar no meio (com 10 paradas, uns 3 s), e então
    // seriam dois pedidos.
    await page.waitForTimeout(6_000);
    await levarParaOFim(page, 1);

    await expect(aviso(page)).toContainText(REFEITA, {timeout: 30_000});
    expect(rede.tabelas - tabelasAntes, 'pedidos ao serviço de ruas').toBe(1);
    const nova = ordemDe(await estado(page));
    expect(Math.abs(nova.indexOf(ela) - nova.indexOf(ultima)), 'a que foi para o fim ficou longe da vizinha nova').toBeLessThanOrEqual(2);
    expect((await estado(page)).rota.desatualizada, 'a rota refeita ainda se diz desatualizada').toBeFalsy();

    await aviso(page).getByRole('button', {name: 'Desfazer'}).click();
    await expect(aviso(page)).toContainText('A rota de antes voltou.');
    expect(ordemDe(await estado(page))).toEqual(ordem);
    // outra mudança de posição depois do Desfazer não traz de volta a que ele recusou
    await levarParaOFim(page, 2);
    await page.waitForTimeout(PASSA_A_ESPERA);
    expect(ordemDe(await estado(page))).toEqual(ordem);
  });

  test('sem rede, nem pede ao serviço; quando a rede volta, refaz', async ({page, context}) => {
    const rede = await comRotaMontada(page, context);
    rede.fora = true;
    await context.setOffline(true);
    const {ordem} = await levarParaOFim(page, 0);

    await page.waitForTimeout(PASSA_A_ESPERA);
    expect(ordemDe(await estado(page))).toEqual(ordem);
    expect(rede.recusados, 'pedidos ao serviço de ruas sem rede').toBe(0);

    rede.fora = false;
    await context.setOffline(false);
    await expect(aviso(page)).toContainText(REFEITA, {timeout: 30_000});
    expect(ordemDe(await estado(page))).not.toEqual(ordem);
  });

  test('com sinal fraco (o celular diz que tem rede, o serviço não responde), fica a rota de antes', async ({page, context}) => {
    const rede = await comRotaMontada(page, context);
    rede.fora = true;
    const {ordem} = await levarParaOFim(page, 0);

    await expect.poll(() => rede.recusados, {timeout: 30_000}).toBeGreaterThan(0);
    // a tentativa termina (tempos aproximados e a conta da ordem) antes de conferir
    await page.waitForTimeout(PASSA_A_ESPERA);
    expect(ordemDe(await estado(page))).toEqual(ordem);
    await expect(aviso(page)).not.toContainText(REFEITA);
  });
});
