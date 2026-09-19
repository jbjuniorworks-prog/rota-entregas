import {test as base, expect, type Page, type Locator} from '@playwright/test';

export const ROTA_A = 'testes/planilhas/rota-a.txt';
export const ROTA_B = 'testes/planilhas/rota-b.xlsx';

export const test = base.extend<{erros: string[]}>({
  erros: async ({}, use) => { await use([]); },
  page: async ({page, context, erros}, use) => {
    for (const servico of ['router.project-osrm.org', 'nominatim.openstreetmap.org', 'tile.openstreetmap.org', 'cep.awesomeapi.com.br', 'viacep.com.br']) {
      await context.route(`**://${servico}/**`, r => r.abort());
    }
    page.on('pageerror', e => erros.push(String(e)));
    await use(page);
    expect(erros, 'erros de JavaScript na página').toEqual([]);
  },
});
export {expect};

export async function abrir(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', {name: '1. Endereços'})).toBeVisible();
}

export function aviso(page: Page): Locator {
  return page.locator('#status');
}

export async function carregar(page: Page, arquivo: string) {
  await page.locator('input[type=file]').setInputFiles(arquivo);
  await expect(aviso(page)).toContainText('parada(s) da planilha');
}

export async function aba(page: Page, nome: '1. Endereços' | '2. Conferir' | '3. Rota') {
  await page.getByRole('button', {name: nome}).click();
}

export async function montar(page: Page) {
  await aba(page, '3. Rota');
  const botao = page.getByRole('button', {name: /Montar melhor sequência/});
  if (!(await botao.isVisible())) await page.getByText('Ponto de saída / refazer rota').click();
  await botao.click();
  await expect(page.getByText(/Total estimado/)).toBeVisible();
}

export async function ordem(page: Page, nomes: string[]): Promise<string[]> {
  const texto = await page.locator('body').innerText();
  return nomes.filter(n => texto.includes(n)).sort((a, b) => texto.indexOf(a) - texto.indexOf(b));
}

export function linhaDe(page: Page, endereco: string, botao: string | RegExp): Locator {
  return page.locator('div').filter({hasText: endereco}).filter({has: page.getByRole('button', {name: botao})}).last();
}

export async function clicarMapa(page: Page, lat: number, lng: number) {
  await page.evaluate(([a, b]) => (window as any).rotaTeste.clicarMapa(a, b), [lat, lng]);
}

export async function pontosNoMaps(page: Page): Promise<string[]> {
  const links = await page.getByRole('link', {name: /Maps trecho/}).evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
  return links.flatMap(h => {
    const u = new URL(h);
    return [...(u.searchParams.get('waypoints') || '').split('|').filter(Boolean), u.searchParams.get('destination') || ''];
  });
}
