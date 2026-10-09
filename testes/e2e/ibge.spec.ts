import {test, expect, abrir, aba, colar, linhaDe} from './apoio';

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
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill(ENDERECO);
  await page.getByRole('button', {name: /^Adicionar em/}).click();

  await aba(page, '2. Conferir');
  const linha = linhaDe(page, ENDERECO, 'Marcar no mapa');
  await expect(linha).toContainText('Ponto Novo', {timeout: 30_000});
  // a prova: nem o ViaCEP nem o mapa de fora foram consultados para este endereço
  expect(buscas).toEqual([]);
});

test('endereço que o censo não tem continua indo pelo caminho de sempre', async ({page}) => {
  const buscas = await espiar(page);
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Que Não Existe, 12345, 49999999');
  await page.getByRole('button', {name: /^Adicionar em/}).click();

  // espera a busca terminar de verdade antes de julgar
  await aba(page, '2. Conferir');
  await expect(page.getByRole('button', {name: /sem posição/})).toBeHidden({timeout: 30_000});
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

  // e a planilha continua a um toque, em Conferir, abrindo o cartão
  await aba(page, '2. Conferir');
  const linha = linhaDe(page, 'Rua Francisco de Assis Delmondes Pereira Freitas, 170', 'Editar');
  await expect(linha).toContainText('a planilha punha este pino a 300 m, fora da rua');
  await linha.locator('.topo').click();
  await linha.getByRole('button', {name: /A posição que veio na planilha/}).click();
  // a escolha dele fica: nem abrir o app de novo leva para o censo outra vez
  expect(await como('Rua Francisco de Assis Delmondes Pereira Freitas, 170')).toEqual({...FORA_DA_RUA, precisao: 'manual'});
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await como('Rua Francisco de Assis Delmondes Pereira Freitas, 170')).toEqual({...FORA_DA_RUA, precisao: 'manual'});
});

// Pedro, 08/10: a planilha pôs uma Rua B de um bairro noutra Rua B, a 11,7 km, no meio das outras
// entregas da rota, e o app não disse nada. Aqui com uma Rua B do censo (Aruana, CEP 49000-584).
test('a Rua B que a planilha pôs noutra Rua B vai para a porta do CEP, e fica vermelha longe da rota', async ({page}) => {
  const XLSX = (await import('xlsx')).default;
  const PORTA = {lat: -11.010071, lng: -37.088918};
  // seis casas, como a da Shopee: com poucas, o app trata como posição aproximada
  const GRUPO = {lat: -10.920512, lng: -37.060537};
  const em = (dLat: number, dLng: number) => [+(GRUPO.lat + dLat).toFixed(6), +(GRUPO.lng + dLng).toFixed(6)];
  const cab = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
  // CEPs que o censo não tem: estas ficam onde a planilha pôs
  const perto = (n: number, dLat: number, dLng: number) => ['AT-TESTE', n, n, '', `Rua Inventada ${n}, 10`, 'Bairro Inventado', 'Aracaju', `49099-90${n}`, ...em(dLat, dLng)];
  const ws = XLSX.utils.aoa_to_sheet([cab,
    perto(1, 0.001, 0), perto(2, -0.001, 0.001), perto(3, 0, -0.001), perto(4, 0.0015, 0.0012),
    ['AT-TESTE', 5, 5, '', 'Rua B, 23', 'Aruana', 'Aracaju', '49000-584', ...em(0.0005, 0.0005)],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
  await abrir(page);
  await page.locator('input[type=file]').setInputFiles({name: 'censo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'})});
  await expect(page.locator('#status')).toContainText('1 estava(m) longe das portas do próprio CEP', {timeout: 30_000});

  const ruaB = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas.find((x: any) => x.texto.startsWith('Rua B, 23')));
  expect({lat: ruaB.lat, lng: ruaB.lng}).toEqual(PORTA);
  // a 10 km do resto da rota: vermelho, e o texto diz de onde ela saiu
  expect(ruaB.precisao).toBe('longe');
  expect(ruaB.exibido).toContain('longe das portas do CEP dela');
});

// Luan, 02/10: a rota lida pela versão antiga continuava errada depois de atualizar o app.
test('ao abrir, a rota que já estava na tela também passa pelo censo', async ({page}) => {
  const XLSX = (await import('xlsx')).default;
  const cab = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
  const ws = XLSX.utils.aoa_to_sheet([cab,
    ['AT-TESTE', 1, 1, '', 'Rua Francisco de Assis Delmondes Pereira Freitas, 170', 'Ponto Novo', 'Aracaju', '49097-710', -10.938579, -37.078077]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
  await abrir(page);
  await page.locator('input[type=file]').setInputFiles({name: 'censo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'})});
  await expect(page.locator('#status')).toContainText('levada(s) para a porta do censo', {timeout: 30_000});
  // como a versão de antes deixava: na posição da planilha
  await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}');
    Object.assign(e.paradas[0], {lat: -10.938579, lng: -37.078077, precisao: 'planilha', exibido: 'Posição da planilha', candidatos: []});
    localStorage.setItem('rota-entregas-v2', JSON.stringify(e));
  });
  await page.reload();
  await expect(page.locator('#status')).toContainText('1 parada(s) levada(s) para a porta do censo', {timeout: 30_000});
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas[0].precisao)).toBe('censo');
});

// Pedido de 01/10: a porta do censo é o lugar mais provável, não o certo. Fica laranja, "confira
// na porta", até alguém entregar ali; com "Entreguei aqui" ela vira porta marcada e vai para a nuvem.
test('a porta do censo fica laranja até entregarem ali', async ({page, context}) => {
  const XLSX = (await import('xlsx')).default;
  const {montar, garantirMapa, verNoMapa} = await import('./apoio');
  const PORTA_170 = {lat: -10.935879, lng: -37.078077};
  const cab = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
  const ws = XLSX.utils.aoa_to_sheet([cab,
    ['AT-TESTE', 1, 1, '', 'Rua Francisco de Assis Delmondes Pereira Freitas, 170', 'Ponto Novo', 'Aracaju', '49097-710', -10.938579, -37.078077]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
  page.on('dialog', d => d.accept());
  await abrir(page);
  await page.locator('input[type=file]').setInputFiles({name: 'censo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'})});
  await expect(page.locator('#status')).toContainText('confira na porta', {timeout: 30_000});
  await aba(page, '2. Conferir');
  const linha = linhaDe(page, 'Delmondes Pereira Freitas, 170', 'Editar');
  await expect(linha).toContainText('Porta do censo do IBGE — confira na porta');

  await montar(page);
  // curto, embaixo do endereço: o cartão da próxima ficou baixo para o mapa ser a tela (03/10)
  await expect(page.locator('.proxima [data-quase]')).toHaveText('Pino na porta do censo do IBGE, não onde a planilha punha: confira na porta.');
  await garantirMapa(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({latitude: PORTA_170.lat, longitude: PORTA_170.lng, accuracy: 6});
  await verNoMapa(page, PORTA_170.lat, PORTA_170.lng, 18);
  await expect(page.locator('.pino.alvo.quase')).toHaveCount(1);
  await page.locator('.pino.alvo').click();
  await page.locator('[data-folha="pino"] [data-acao=aqui]').first().click();
  await expect.poll(() => page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas[0];
    return `${p.entregue} ${p.precisao}`;
  }), {timeout: 15_000}).toBe('true manual');
});

// 02/10: com a planilha e o censo a até 80 m, quem acerta a casa é o censo (mediana de 12 m para 9 m
// nas 417 portas marcadas). No prédio, não: o censo marca a porta lá dentro do terreno.
test('casa perto da porta do censo vai para ela, verde; prédio fica como veio', async ({page}) => {
  const XLSX = (await import('xlsx')).default;
  const CASA_802 = {lat: -10.93604, lng: -37.076566};
  const cab = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
  const ws = XLSX.utils.aoa_to_sheet([cab,
    // a 40 m da porta de cada um, longe um do outro (perto, os números distantes dariam "número não bate")
    ['AT-TESTE', 1, 1, '', 'Rua Francisco de Assis Delmondes Pereira Freitas, 802', 'Ponto Novo', 'Aracaju', '49097-710', -10.93568, -37.076566],
    ['AT-TESTE', 2, 2, '', 'Rua Francisco de Assis Delmondes Pereira Freitas, 100', 'Ponto Novo', 'Aracaju', '49097-710', -10.936387, -37.076626],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
  await abrir(page);
  await page.locator('input[type=file]').setInputFiles({name: 'censo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'})});
  const como = (inicio: string) => page.evaluate(t => {
    const p = (JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas || []).find((x: any) => x.texto.startsWith(t));
    return p ? {lat: p.lat, lng: p.lng, precisao: p.precisao} : null;
  }, inicio);
  await expect.poll(() => como('Rua Francisco de Assis Delmondes Pereira Freitas, 802').then(p => p?.precisao), {timeout: 30_000}).toBe('exato');
  expect(await como('Rua Francisco de Assis Delmondes Pereira Freitas, 802')).toEqual({...CASA_802, precisao: 'exato'});
  expect(await como('Rua Francisco de Assis Delmondes Pereira Freitas, 100')).toEqual({lat: -10.936387, lng: -37.076626, precisao: 'planilha'});
  await aba(page, '2. Conferir');
  await expect(linhaDe(page, 'Delmondes Pereira Freitas, 802', 'Editar')).toContainText('Porta do censo do IBGE, a 40 m de onde a planilha punha');
  // andar 40 m não pede para refazer nada, nem avisa
  await expect(page.locator('#status')).not.toContainText('levada(s) para a porta do censo');
});
