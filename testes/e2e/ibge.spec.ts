import {test, expect, abrir, linhaDe} from './apoio';

const ARACAJU = {lat: '-10.9472', lon: '-37.0731', display_name: 'Aracaju, Sergipe', category: 'place', addresstype: 'city', address: {city: 'Aracaju', state: 'Sergipe'}};
const LONGE = {lat: '-10.8000', lon: '-37.2000', display_name: 'Outro canto, Aracaju', category: 'highway', addresstype: 'road', address: {road: 'Outra Rua', city: 'Aracaju', state: 'Sergipe'}};

// Endereço real do censo, conferido contra app/public/aracaju-v1.bin.
const ENDERECO = 'Rua Francisco de Assis Delmondes Pereira Freitas, 170, 49097710';

async function espiar(page: any) {
  const buscas: string[] = [];
  await page.route('**://nominatim.openstreetmap.org/**', (r: any) => {
    const u = new URL(r.request().url());
    const cidade = (u.searchParams.get('q') || '').trim() === 'Aracaju, SE';
    if (!cidade) buscas.push('nominatim' + u.search);
    r.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify([cidade ? ARACAJU : LONGE])});
  });
  await page.route('**://viacep.com.br/**', (r: any) => {
    buscas.push('viacep');
    r.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'},
      body: JSON.stringify({logradouro: 'Rua Francisco de Assis Delmondes Pereira Freitas', bairro: 'Ponto Novo', localidade: 'Aracaju', uf: 'SE'})});
  });
  return buscas;
}

test('endereço que o censo conhece é resolvido sem perguntar nada para fora', async ({page}) => {
  const buscas = await espiar(page);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill(ENDERECO);
  await page.getByRole('button', {name: /^Adicionar em/}).click();

  const linha = linhaDe(page, ENDERECO, 'Marcar no mapa');
  await expect(linha).toContainText('Ponto Novo', {timeout: 30_000});
  // a prova: nem o ViaCEP nem o mapa de fora foram consultados para este endereço
  expect(buscas).toEqual([]);
});

test('endereço que o censo não tem continua indo pelo caminho de sempre', async ({page}) => {
  const buscas = await espiar(page);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Que Não Existe, 12345, 49999999');
  await page.getByRole('button', {name: /^Adicionar em/}).click();

  // espera a busca terminar de verdade antes de julgar
  await expect(page.getByText(/sem buscar/)).toBeHidden({timeout: 30_000});
  // controle negativo: sem resposta do censo, o app tem que ter perguntado para fora
  expect(buscas.length).toBeGreaterThan(0);
});
