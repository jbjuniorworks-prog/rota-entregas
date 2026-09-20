import {test, expect, abrir, aba, linhaDe} from './apoio';

const ARACAJU = {lat: '-10.9472', lon: '-37.0731', display_name: 'Aracaju, Sergipe', category: 'place', addresstype: 'city', address: {city: 'Aracaju', state: 'Sergipe'}};
const EM_SAO_PAULO = {lat: '-23.5505', lon: '-46.6333', display_name: 'Rua Lúcio Mota, São Paulo', category: 'highway', addresstype: 'road', address: {road: 'Rua Lúcio Mota', city: 'São Paulo', state: 'São Paulo'}};
const NA_CIDADE = {lat: '-10.9401', lon: '-37.0620', display_name: 'Rua Lúcio Mota, Aracaju', category: 'highway', addresstype: 'road', address: {road: 'Rua Lúcio Mota', city: 'Aracaju', state: 'Sergipe'}};

async function mapaFalso(page: any, ruaEncontrada: object) {
  const buscas: string[] = [];
  await page.route('**://nominatim.openstreetmap.org/**', (r: any) => {
    const u = new URL(r.request().url());
    buscas.push(u.search);
    const cidade = (u.searchParams.get('q') || '').trim() === 'Aracaju, SE';
    r.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify([cidade ? ARACAJU : ruaEncontrada])});
  });
  return buscas;
}

test('rua de mesmo nome em outro estado não entra na rota', async ({page}) => {
  const buscas = await mapaFalso(page, EM_SAO_PAULO);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Lúcio Mota 114');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect(page.getByText(/❗ 1 para conferir/)).toBeVisible({timeout: 30_000});
  await expect(linhaDe(page, 'Rua Lúcio Mota 114', 'Marcar no mapa')).toContainText('Não encontrado');
  await expect(page.getByText('São Paulo')).toHaveCount(0);
  expect(buscas.some(b => b.includes('bounded=1') && b.includes('viewbox='))).toBe(true);
  await aba(page, '1. Endereços');
  await expect(page.getByText(/Só procuro endereço até 100 km de Aracaju, SE/)).toBeVisible();
});

test('a mesma rua dentro da região entra normalmente', async ({page}) => {
  await mapaFalso(page, NA_CIDADE);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Lúcio Mota 114');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect(linhaDe(page, 'Rua Lúcio Mota 114', 'Marcar no mapa')).toContainText('Rua Lúcio Mota — Aracaju', {timeout: 30_000});
});
