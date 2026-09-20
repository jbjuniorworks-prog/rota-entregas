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

test('rua que o mapa não tem vai para o bairro certo, e a rua trocada fica só como opção', async ({page}) => {
  const OUTRA_RUA = {lat: '-10.9401', lon: '-37.0620', display_name: 'Rua Acrísio Moreira Siqueira, Aracaju', category: 'highway', addresstype: 'road', address: {road: 'Rua Acrísio Moreira Siqueira', suburb: 'Jardins', city: 'Aracaju'}};
  const BAIRRO = {lat: '-10.9350', lon: '-37.0550', display_name: 'Jardins, Aracaju', category: 'place', addresstype: 'suburb', address: {suburb: 'Jardins', city: 'Aracaju'}};
  await page.route('**://viacep.com.br/**', r => r.fulfill({
    status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'},
    body: JSON.stringify([{cep: '49025-530', logradouro: 'Rua Orlando Magalhães Maia', bairro: 'Jardins', localidade: 'Aracaju', uf: 'SE'}]),
  }));
  await page.route('**://nominatim.openstreetmap.org/**', r => {
    const q = new URL(r.request().url()).searchParams.get('q') || '';
    const corpo = q.trim() === 'Aracaju, SE' ? ARACAJU : /^Jardins/.test(q) ? BAIRRO : OUTRA_RUA;
    r.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify([corpo])});
  });
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Orlando Magalhães Maia 1520');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  const linha = linhaDe(page, 'Rua Orlando Magalhães Maia 1520', 'Marcar no mapa');
  await expect(linha).toContainText('o mapa não tem esta rua: posição pelo bairro Jardins', {timeout: 30_000});
  await expect(linha).toContainText('Posição pelo bairro — confira no local');
  await page.locator('[data-item]').filter({hasText: 'Orlando Magalhães Maia'}).getByRole('button', {name: 'Ver', exact: true}).click();
  await expect(page.getByRole('button', {name: /Acrísio Moreira Siqueira/})).toBeVisible();
});

test('rua que mudou de nome é reconhecida pelo nome antigo, e o app mostra os dois', async ({page}) => {
  const MESMA_RUA = {
    lat: '-10.9401', lon: '-37.0620', display_name: 'Rua Acrísio Moreira Siqueira, Aracaju', category: 'highway', addresstype: 'road',
    address: {road: 'Rua Acrísio Moreira Siqueira', suburb: 'Jardins', city: 'Aracaju'},
    namedetails: {name: 'Rua Acrísio Moreira Siqueira', alt_name: 'Rua Orlando Magalhaes Maia'},
  };
  await mapaFalso(page, MESMA_RUA);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Orlando Magalhães Maia 1520');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  const linha = linhaDe(page, 'Rua Orlando Magalhães Maia 1520', 'Marcar no mapa');
  await expect(linha).toContainText('Rua encontrada', {timeout: 30_000});
  await expect(linha).toContainText('no mapa: Rua Acrísio Moreira Siqueira');
});

test('a mesma rua dentro da região entra normalmente', async ({page}) => {
  await mapaFalso(page, NA_CIDADE);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Lúcio Mota 114');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect(linhaDe(page, 'Rua Lúcio Mota 114', 'Marcar no mapa')).toContainText('Rua Lúcio Mota — Aracaju', {timeout: 30_000});
});
