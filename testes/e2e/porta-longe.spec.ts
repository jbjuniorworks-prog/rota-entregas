import type {Page} from '@playwright/test';
import {abrir, aviso, carregar, expect, menu, montar, test, ROTA_A} from './apoio';

// Pedro, 26/10: pôs em dia, na base, a rota da manhã, e o "Entreguei aqui" gravou a 18 km a porta
// da mercearia e a de um condomínio da Chico Mendes, confirmadas para todos. Mais de 3 km do pino,
// o GPS não é a porta: a entrega vale, e porta, passagem e verificação ficam como estavam.
type Gravada = {id: string; texto: string; lat: number; lng: number; entregue: boolean; precisao: string};
const estado = (page: Page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('rota-entregas-v2')!) as {paradas: Gravada[]; rota: {areas: {ordem: string[]}[]}});
const lembradas = (page: Page) => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rota-entregas-posicoes') || '{}')).length);
const enviados = (nuvem: {pedidos: {caminho: string; metodo: string}[]}, tabela: string) => nuvem.pedidos.filter(p => p.caminho === tabela && p.metodo === 'POST');
// a próxima da rota, a do cartão
async function proxima(page: Page): Promise<Gravada> {
  const e = await estado(page);
  const id = e.rota.areas.flatMap(a => a.ordem).find(i => !e.paradas.find(p => p.id === i)!.entregue)!;
  return e.paradas.find(p => p.id === id)!;
}
const aNorte = (p: {lat: number; lng: number}, metros: number) => ({latitude: p.lat + metros / 111320, longitude: p.lng, accuracy: 4});

test.describe('"Entreguei aqui" longe do pino', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: {latitude: -10.9605, longitude: -37.0455, accuracy: 4}});

  test('a mais de 3 km: entrega, e a porta fica como estava, também ao reabrir e ao ler a planilha de novo', async ({page, context, nuvem}) => {
    page.on('dialog', d => d.accept());
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    await context.setGeolocation(aNorte(alvo, 5000));
    await page.waitForTimeout(5500);
    await page.locator('.proxima [data-acao="aqui"]').click();
    await expect(aviso(page)).toContainText(/a \d+,\d km do pino, longe demais para ser a porta/);
    // e diz como arrumar de onde ele está: "Arrumar o pino" mora no cartão do pino
    await expect(aviso(page)).toContainText('Para arrumar daqui, toque no pino e em "Arrumar o pino".');
    await expect(page.locator('.resumo')).toContainText('1 de 10 entregas');
    // nem depois do prazo de desfazer: nada de porta nem passagem na nuvem, nada lembrado no aparelho
    await page.clock.fastForward('11:00');
    await page.waitForTimeout(1500);
    expect(enviados(nuvem, 'correcoes')).toEqual([]);
    expect(enviados(nuvem, 'observacoes')).toEqual([]);
    expect(await lembradas(page)).toBe(0);
    const comoEstava = async () => expect((await estado(page)).paradas.find(p => p.id === alvo.id))
      .toMatchObject({entregue: true, lat: alvo.lat, lng: alvo.lng, precisao: alvo.precisao});
    await comoEstava();
    await page.reload();
    await comoEstava();
    // outro dia, a mesma planilha: a parada chega no ponto de antes, sem nada do toque de longe
    await menu(page, 'Resetar a rota');
    await carregar(page, ROTA_A);
    expect((await estado(page)).paradas.find(p => p.texto === alvo.texto)).toMatchObject({lat: alvo.lat, lng: alvo.lng, entregue: false});
  });

  test('a menos de 3 km (a correção de 1,4 km da mercearia): a porta é marcada como sempre', async ({page, context, nuvem}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    await context.setGeolocation(aNorte(alvo, 1400));
    await page.waitForTimeout(5500);
    await page.locator('.proxima [data-acao="aqui"]').click();
    await expect(aviso(page)).toContainText('com a porta marcada aqui');
    await expect.poll(() => enviados(nuvem, 'correcoes').length).toBe(1);
  });

  // O "Pino errado? Estou aqui" também leva o pino para o GPS: da base, levaria para a base.
  test('o Estou aqui a mais de 3 km não mexe no pino e diz como arrumar', async ({page, context, nuvem}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    await context.setGeolocation(aNorte(alvo, 5000));
    await page.waitForTimeout(5500);
    await page.getByRole('button', {name: 'Pino errado? Estou aqui'}).click();
    await expect(aviso(page)).toContainText(/a \d+,\d km do pino, longe demais para ser a porta\. O pino ficou onde estava\. Para arrumar daqui/);
    await page.waitForTimeout(1500);
    expect(enviados(nuvem, 'correcoes')).toEqual([]);
    expect(await lembradas(page)).toBe(0);
    expect((await estado(page)).paradas.find(p => p.id === alvo.id)).toMatchObject({entregue: false, lat: alvo.lat, lng: alvo.lng, precisao: alvo.precisao});
  });

  test('o Entreguei com o GPS a mais de 3 km entrega e não manda passagem', async ({page, context, nuvem}) => {
    page.on('dialog', d => d.accept());
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    await context.setGeolocation(aNorte(alvo, 5000));
    await page.waitForTimeout(5500);
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    await expect(page.locator('.resumo')).toContainText('1 de 10 entregas');
    await page.clock.fastForward('11:00');
    await page.waitForTimeout(1500);
    expect(enviados(nuvem, 'observacoes')).toEqual([]);
  });
});

// Sem GPS nenhum (permissão negada): a entrega vale, e não há posição para virar porta.
test.describe('"Entreguei aqui" sem GPS', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: []});

  test('entrega, e não grava porta nem passagem', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    await page.locator('.proxima [data-acao="aqui"]').click();
    await expect(aviso(page)).toContainText('Não consegui o GPS');
    await expect(page.locator('.resumo')).toContainText('1 de 10 entregas');
    await page.clock.fastForward('11:00');
    await page.waitForTimeout(1500);
    expect(enviados(nuvem, 'correcoes')).toEqual([]);
    expect(enviados(nuvem, 'observacoes')).toEqual([]);
    expect((await estado(page)).paradas.find(p => p.id === alvo.id)).toMatchObject({entregue: true, lat: alvo.lat, lng: alvo.lng, precisao: alvo.precisao});
  });
});
