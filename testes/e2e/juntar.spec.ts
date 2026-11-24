import type {Page} from '@playwright/test';
import {abrir, aviso, carregar, clicarMapa, expect, montar, test} from './apoio';

// Dono, 23/11: separou os 15 pacotes de um condomínio que a planilha punha a 21 km, arrumou e
// entregou um por um, e não havia como juntar. A planilha inventada é a rodovia da rota-e: o mesmo
// número para a mercearia, o condomínio e uma casa, todos no mesmo ponto.
const ROTA_E = 'testes/planilhas/rota-e.xlsx';
const CONDOMINIO = {latitude: -10.9626, longitude: -37.05};
const DO_CONDOMINIO = /\|por tras do condominio portal teste$/;
const DA_RODOVIA = /^r\|.*\|67\|[^|]*\|[^|]*$/;

const paradas = (page: Page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {texto: string; lat: number; separada?: boolean}[]));
const daRodovia = async (page: Page) => (await paradas(page)).filter(p => p.texto.startsWith('Rodovia'));
const correcoes = (nuvem: {pedidos: {caminho: string; metodo: string; corpo: unknown}[]}) =>
  nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'POST').map(p => p.corpo as {chave_lugar: string; lat: number});

test.describe('juntar as separadas do mesmo número', () => {
  test.use({viewport: {width: 412, height: 915}});

  // separa os 4 pacotes e arruma o pino do condomínio no mapa
  async function separarEArrumar(page: Page) {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_E);
    await montar(page);
    const proxima = page.locator('[data-folha="proxima"]');
    await proxima.getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    await proxima.locator('[data-acao="ver-uma"]', {hasText: 'condomínio'}).click();
    await page.locator('[data-folha="pino"]').getByRole('button', {name: 'Arrumar o pino'}).click();
    await clicarMapa(page, CONDOMINIO.latitude, CONDOMINIO.longitude);
    await expect.poll(async () => (await daRodovia(page)).find(p => p.texto.includes('condomínio'))!.lat).toBeCloseTo(CONDOMINIO.latitude, 5);
    await page.locator('[data-folha="pino"]').getByRole('button', {name: 'Fechar'}).click();
  }
  const juntar = (page: Page) => page.locator('[data-folha="proxima"] [data-acao="juntar"]');

  test('juntadas, nenhuma continua separada', async ({page}) => {
    await separarEArrumar(page);
    await juntar(page).click();
    await expect.poll(async () => (await daRodovia(page)).filter(p => p.separada).length).toBe(0);
  });

  test('juntadas, todas vão para o ponto que ele arrumou numa delas', async ({page}) => {
    await separarEArrumar(page);
    await expect(juntar(page)).toHaveText('Juntar as 4 entregas deste endereço');
    await juntar(page).click();
    await expect(aviso(page)).toContainText('Juntadas as 4 entregas deste endereço no ponto arrumado de uma delas');
    for (const p of await daRodovia(page)) expect(p.lat).toBeCloseTo(CONDOMINIO.latitude, 5);
  });

  test('o ponto arrumado vai para a nuvem como porta do endereço, sem o complemento', async ({page, nuvem}) => {
    await separarEArrumar(page);
    await expect.poll(() => correcoes(nuvem).length).toBe(1);
    await juntar(page).click();
    await expect.poll(() => correcoes(nuvem).map(c => c.chave_lugar)).toEqual([expect.stringMatching(DO_CONDOMINIO), expect.stringMatching(DA_RODOVIA)]);
    expect(correcoes(nuvem)[1].lat).toBeCloseTo(CONDOMINIO.latitude, 5);
  });

  test('o Desfazer separa de novo, cada uma no seu lugar', async ({page}) => {
    await separarEArrumar(page);
    await juntar(page).click();
    await aviso(page).getByRole('button', {name: 'Desfazer'}).click();
    await expect.poll(async () => (await daRodovia(page)).filter(p => p.separada).length).toBe(4);
    const condominio = (await daRodovia(page)).find(p => p.texto.includes('condomínio'))!;
    expect(condominio.lat).toBeCloseTo(CONDOMINIO.latitude, 5);
    for (const p of (await daRodovia(page)).filter(p => !p.texto.includes('condomínio'))) expect(p.lat).toBeCloseTo(-10.95, 3);
  });

  test('sem separadas, não há o que juntar', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_E);
    await montar(page);
    await expect(page.locator('[data-folha="proxima"] [data-acao="separar"]')).toBeVisible();
    await expect(juntar(page)).toHaveCount(0);
  });
});

// A porta do complemento no mesmo lugar que a do endereço não separa nada ao ler a planilha (23/11:
// 21 das 38 portas de complemento do banco). Longe dela, separa, como antes.
test.describe('a planilha e as portas de complemento', () => {
  const portas = (complemento: {latitude: number; longitude: number}) => (corpo: {chaves: string[]}) => corpo.chaves
    .flatMap(k => DO_CONDOMINIO.test(k) ? [{k, ...complemento}] : DA_RODOVIA.test(k) ? [{k, latitude: -10.9601, longitude: -37.0501}] : [])
    .map(({k, latitude, longitude}) => ({chave_lugar: k, lat: latitude, lng: longitude, situacao: 'confirmado', motoristas: 2, entregas: 2, fonte: 'entrega', minha: false}));

  test('com a porta do complemento a poucos metros da do endereço, chega junta', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    nuvem.rpc.posicoes = portas({latitude: -10.96012, longitude: -37.05012});
    await abrir(page);
    await carregar(page, ROTA_E);
    await expect.poll(async () => (await daRodovia(page)).length).toBe(1);
    expect((await daRodovia(page))[0].separada).toBeFalsy();
  });

  test('com a porta do complemento longe da do endereço, chega separada', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    nuvem.rpc.posicoes = portas(CONDOMINIO);
    await abrir(page);
    await carregar(page, ROTA_E);
    await expect(aviso(page)).toContainText('com as entregas separadas pelo complemento');
    expect((await daRodovia(page)).filter(p => p.separada)).toHaveLength(4);
  });
});
