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

// Luan, 01/10: a planilha pôs a porta a 168 m e a 773 m do lugar, e o censo tinha as duas certas.
// Quem desempata é a rua: planilha fora dela errou o lugar; em cima dela, o censo pode ter errado o número.
test('planilha fora da rua vai para a porta do censo; em cima da rua, fica como veio', async ({page}) => {
  const XLSX = (await import('xlsx')).default;
  const PORTA_170 = {lat: -10.935879, lng: -37.078077};
  const FORA_DA_RUA = {lat: -10.938579, lng: -37.078077};
  const cab = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
  const ws = XLSX.utils.aoa_to_sheet([cab,
    ['AT-TESTE', 1, 1, '', 'Rua Francisco de Assis Delmondes Pereira Freitas, 170', 'Ponto Novo', 'Aracaju', '49097-710', FORA_DA_RUA.lat, FORA_DA_RUA.lng],
    // o censo põe o 802 a 166 m daqui, mas a planilha está em cima da rua: fica
    ['AT-TESTE', 2, 2, '', 'Rua Francisco de Assis Delmondes Pereira Freitas, 802', 'Ponto Novo', 'Aracaju', '49097-710', PORTA_170.lat, PORTA_170.lng],
    // o censo não tem este CEP
    ['AT-TESTE', 3, 3, '', 'Rua Que Não Existe, 12', 'Ponto Novo', 'Aracaju', '49999-999', -10.9372, -37.0790],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
  await abrir(page);
  await page.locator('input[type=file]').setInputFiles({name: 'censo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'})});
  await expect(page.locator('#status')).toContainText('1 levada(s) para a porta do censo do IBGE', {timeout: 30_000});

  const como = (inicio: string) => page.evaluate(t => {
    const p = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas.find((x: any) => x.texto.startsWith(t));
    return {lat: p.lat, lng: p.lng, precisao: p.precisao};
  }, inicio);
  expect(await como('Rua Francisco de Assis Delmondes Pereira Freitas, 170')).toEqual({...PORTA_170, precisao: 'censo'});
  expect(await como('Rua Francisco de Assis Delmondes Pereira Freitas, 802')).toEqual({...PORTA_170, precisao: 'planilha'});
  expect((await como('Rua Que Não Existe')).precisao).toBe('planilha');

  // e a planilha continua a um toque, em 2. Conferir
  const linha = linhaDe(page, 'Rua Francisco de Assis Delmondes Pereira Freitas, 170', 'Ver');
  await expect(linha).toContainText('a planilha punha este pino a 300 m, fora da rua');
  await linha.getByRole('button', {name: 'Ver'}).click();
  await linha.getByRole('button', {name: /A posição que veio na planilha/}).click();
  expect(await como('Rua Francisco de Assis Delmondes Pereira Freitas, 170')).toEqual({...FORA_DA_RUA, precisao: 'planilha'});
});
