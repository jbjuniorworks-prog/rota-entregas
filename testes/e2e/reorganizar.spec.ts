import type {Page} from '@playwright/test';
import {abrir, aviso, carregar, lista, montar, paraABase, test, expect, ROTA_A} from './apoio';

// Entregou fora da ordem e a rota segue dali (dono, 15/11, na rota: "a rota não se adapta quando
// faço um pino diferente"). O cartão da próxima apontava para a parada pulada, já para trás dele.
const SEGUE = 'Fora da ordem: a sequência agora segue daqui.';

interface P {id: string; texto: string; lat: number; lng: number; entregue: boolean}
interface E {paradas: P[]; rota: {areas: {ordem: string[]; linha: [number, number][] | null; tempos?: {visitas: {ids: string[]; lat: number; lng: number}[]}}[]}}

const estado = (page: Page): Promise<E> => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!));
const ordemDe = (e: E) => e.rota.areas.flatMap(a => a.ordem);
const parada = (e: E, id: string) => e.paradas.find(x => x.id === id)!;
const proxima = (e: E) => parada(e, ordemDe(e).find(id => !parada(e, id).entregue)!);
const metros = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) =>
  111320 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180));
const cartao = (page: Page) => page.locator('[data-folha="proxima"]');

async function entregarNaLista(page: Page, id: string) {
  await lista(page);
  await page.locator(`[data-item="${id}"]`).getByRole('button', {name: 'Entregue', exact: true}).click();
}

test.describe('a rota segue da entrega feita fora da ordem', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('sem rede, entregue a última da ordem, o cartão vai para perto dela; desfeita, a ordem de antes volta', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const antes = await estado(page);
    const ordem0 = ordemDe(antes);
    const primeira = parada(antes, ordem0[0]);
    const ultima = parada(antes, ordem0[ordem0.length - 1]);
    await expect(cartao(page).locator('.endereco')).toHaveText(primeira.texto);

    await context.setOffline(true);
    await entregarNaLista(page, ultima.id);
    await expect(aviso(page)).toContainText(SEGUE);

    const depois = await estado(page);
    const nova = proxima(depois);
    expect(nova.id, 'a próxima continuou sendo a pulada').not.toBe(primeira.id);
    expect(metros(ultima, nova)).toBeLessThan(metros(ultima, primeira));
    // as entregas do dia continuam na rota: a contagem não perde ninguém
    expect([...ordemDe(depois)].sort()).toEqual([...ordem0].sort());
    await paraABase(page);
    await expect(cartao(page).locator('.endereco')).toHaveText(nova.texto);
    // o número no pino é a posição na ordem nova
    await expect(cartao(page).locator('.grande-badge')).toHaveText(String(ordemDe(depois).indexOf(nova.id) + 1));

    await aviso(page).getByRole('button', {name: 'Desfazer'}).click();
    await expect(aviso(page)).toContainText('A ordem de antes voltou.');
    expect(ordemDe(await estado(page))).toEqual(ordem0);
    await expect(cartao(page).locator('.endereco')).toHaveText(primeira.texto);
    await expect(cartao(page).locator('.grande-badge')).toHaveText('1');
  });

  test('entregando a do cartão, a ordem não muda', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const ordem0 = ordemDe(await estado(page));
    await cartao(page).locator('[data-acao="entregue"]').click();
    await expect(aviso(page)).toContainText('Entregue.');
    await expect(aviso(page)).not.toContainText(SEGUE);
    expect(ordemDe(await estado(page))).toEqual(ordem0);
  });

  test('a linha da rota, que precisa de rede, volta a ser desenhada quando a rede volta', async ({page, context}) => {
    // O serviço de ruas de mentira: linha reta a 10 m/s, e a linha passando pelos pontos pedidos.
    // O setOffline não barra o que o teste responde, então "sem rede" é ele recusar o pedido.
    let semRede = false, recusadas = 0;
    await context.route('**://router.project-osrm.org/**', r => {
      if (semRede) { recusadas++; return r.abort('internetdisconnected'); }
      const url = new URL(r.request().url());
      const pts = url.pathname.split('/').pop()!.split(';').map(s => { const [lng, lat] = s.split(',').map(Number); return {lat, lng}; });
      if (url.pathname.includes('/table/')) {
        const distances = pts.map(a => pts.map(b => metros(a, b)));
        return r.fulfill({json: {code: 'Ok', distances, durations: distances.map(l => l.map(m => m / 10))}});
      }
      return r.fulfill({json: {code: 'Ok', routes: [{geometry: {coordinates: pts.map(p => [p.lng, p.lat])}}]}});
    });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const antes = await estado(page);
    expect(antes.rota.areas[0].linha, 'montada com o serviço de ruas, a rota tem linha').not.toBeNull();
    const ordem0 = ordemDe(antes);
    const ultima = parada(antes, ordem0[ordem0.length - 1]);

    semRede = true;
    await context.setOffline(true);
    await entregarNaLista(page, ultima.id);
    await expect(aviso(page)).toContainText(SEGUE);
    // a ordem mudou e a linha velha mentiria sobre o caminho: sai, e o pedido da nova falha
    await expect.poll(() => recusadas, {timeout: 10_000}).toBeGreaterThan(0);
    expect((await estado(page)).rota.areas[0].linha).toBeNull();

    // a linha nova sai da visita entregue, do ponto que o serviço mediu
    const daVisita = antes.rota.areas[0].tempos!.visitas.find(v => v.ids.includes(ultima.id))!;
    semRede = false;
    await context.setOffline(false);
    await expect.poll(async () => (await estado(page)).rota.areas[0].linha?.[0], {timeout: 15_000})
      .toEqual([+daVisita.lat.toFixed(5), +daVisita.lng.toFixed(5)]);
  });
});

// Dono, 27/11, na rota: "a rota sumiu, sem eu fazer nada, só ir entregando".
test.describe('a linha não some depois da entrega fora da ordem', () => {
  test.use({viewport: {width: 412, height: 915}});
  const tracos = (page: Page): Promise<[number, number][][]> => page.evaluate(() => (window as any).rotaTeste.linhaDaRota());

  // o serviço de ruas de mentira; `falhar` recusa os pedidos de linha enquanto for verdade
  async function servico(context: any, falhar: () => boolean) {
    await context.route('**://router.project-osrm.org/**', (r: any) => {
      const url = new URL(r.request().url());
      const pts = url.pathname.split('/').pop()!.split(';').map(s => { const [lng, lat] = s.split(',').map(Number); return {lat, lng}; });
      if (url.pathname.includes('/table/')) {
        const distances = pts.map(a => pts.map(b => metros(a, b)));
        return r.fulfill({json: {code: 'Ok', distances, durations: distances.map(l => l.map(m => m / 10))}});
      }
      if (falhar()) return r.fulfill({status: 503, body: ''});
      return r.fulfill({json: {code: 'Ok', routes: [{geometry: {coordinates: pts.map(p => [p.lng, p.lat])}}]}});
    });
  }

  async function entregarDuasEPular(page: Page) {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.waitForFunction(() => !!(window as any).rotaTeste);
    for (let i = 0; i < 2; i++) {
      const resumo = await page.locator('.resumo').innerText();
      await cartao(page).locator('[data-acao="entregue"]').first().click();
      await expect(page.locator('.resumo')).not.toHaveText(resumo);
    }
    const e0 = await estado(page);
    const ultima = parada(e0, ordemDe(e0)[ordemDe(e0).length - 1]);
    await entregarNaLista(page, ultima.id);
    await expect(aviso(page)).toContainText(SEGUE);
    await paraABase(page);
  }

  test('com as primeiras entregues na ordem e uma fora dela, a linha nova leva até a próxima', async ({page, context}) => {
    await servico(context, () => false);
    await entregarDuasEPular(page);
    await expect.poll(async () => (await estado(page)).rota.areas[0].linha?.length ?? 0, 'a premissa: a linha nova chegou').toBeGreaterThan(1);
    const e = await estado(page);
    const nova = proxima(e);
    await expect.poll(async () => (await tracos(page)).length, 'há linha no mapa').toBe(1);
    const [t] = await tracos(page);
    const [la, ln] = t[t.length - 1];
    expect(metros({lat: la, lng: ln}, nova), 'e ela acaba na próxima').toBeLessThan(2);
  });

  test('o serviço de ruas sem responder: a linha volta sozinha, sem esperar outra entrega', async ({page, context}) => {
    let falhar = false;
    await servico(context, () => falhar);
    await page.clock.install();
    falhar = true;
    await entregarDuasEPular(page);
    await expect.poll(async () => (await tracos(page)).length, 'a premissa: sem resposta, sem linha').toBe(0);
    falhar = false;
    await page.clock.fastForward(25_000);
    await expect.poll(async () => (await tracos(page)).length).toBe(1);
  });
});
