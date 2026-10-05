import {test, expect, abrir, carregar, aviso, aba, montar, pontosNoMaps, zoom, ROTA_A, ROTA_B, garantirMapa} from './apoio';

test('planilha da Shopee salva como .txt vira paradas, somando pacotes do mesmo endereço', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect(aviso(page)).toContainText('10 parada(s) da planilha, 2 pacote(s) somado(s) a um mesmo endereço.');
  await aba(page, '2. Conferir');
  await expect(page.getByText('3 unid.')).toBeVisible();
  await expect(page.getByText('Rua dos Ipês, 300, Bloco B ap 202', {exact: false})).toBeVisible();
});

test('o balão do mapa mostra a parada da Shopee, o ADS sem parada e os pacotes daquele ponto', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await garantirMapa(page);
  await zoom(page, 18);
  await expect
    .poll(async () => [...new Set(await page.locator('.balao').allInnerTexts())].sort())
    .toEqual(['ADS', 'P1', 'P2 ×4', 'P3', 'P4', 'P5', 'P6', 'P7']);
});

test('pinos em cima uns dos outros viram um pino só, e abrem quando dá zoom', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await garantirMapa(page);
  await zoom(page, 18);
  const separados = await page.locator('.pino').count();
  await zoom(page, 13);
  await expect.poll(async () => await page.locator('.pino').count()).toBeLessThan(separados);
  await expect(page.locator('.pino').filter({hasText: '+'})).not.toHaveCount(0);
  await zoom(page, 18);
  await expect.poll(async () => await page.locator('.pino').count()).toBe(separados);
});

test('planilha .xlsx sem nada estranho não gera alerta', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_B);
  await expect(aviso(page)).toHaveText('6 parada(s) da planilha.');
  // nada para conferir: nem número no botão Mais, nem a linha no menu
  await expect(page.locator('[data-folha="montar"]')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Mais', exact: true}).locator('[data-selo]')).toHaveCount(0);
  await page.getByRole('button', {name: 'Mais', exact: true}).click();
  await expect(page.locator('.menu')).toBeVisible();
  await expect(page.locator('.menu [data-conferir]')).toHaveCount(0);
});

test('cada lugar diferente vira uma marcação no Maps, e só pacotes no mesmo ponto dividem uma', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  const pontos = await pontosNoMaps(page);
  expect(pontos).toHaveLength(9);
  expect(new Set(pontos).size).toBe(9);
});

test('a aba Conferir mostra a origem de cada posição', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_B);
  await aba(page, '2. Conferir');
  await expect(page.getByText('Posição da planilha').first()).toBeVisible();
});

// Planilha do Jeferson, 05/10: a Shopee deu o mesmo ponto, a rotatória da Barra dos Coqueiros,
// para entregas de 7 bairros, e o mapa juntou cinco paradas num pino só. O app tinha Aracaju
// guardado de ontem, e é com ele que esta planilha chega.
test('o ponto que a planilha repete para vários bairros não vira o pino de ninguém', async ({page}) => {
  const XLSX = (await import('xlsx')).default;
  const cab = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
  const ROTATORIA = [-10.907875, -37.026708];
  const linha = (n: number, end: string, bairro: string, cep: string, [lat, lng]: number[]) => ['AT-TESTE', '-', '-', `BRTESTEB${n}`, end, bairro, 'Barra dos Coqueiros', cep, lat, lng];
  const ws = XLSX.utils.aoa_to_sheet([cab,
    linha(1, 'Rua Inventada Um, 10', 'Bairro Alfa', '49140-901', ROTATORIA),
    linha(2, 'Rua Inventada Dois, 20', 'Bairro Beta', '49140-902', ROTATORIA),
    linha(3, 'Rua Inventada Tres, 30', 'Bairro Gama', '49140-903', ROTATORIA),
    linha(4, 'Rua Inventada Quatro, 40', 'Bairro Alfa', '49140-901', [-10.915012, -37.030034]),
    linha(5, 'Rua Inventada Cinco, 50', 'Bairro Beta', '49140-902', [-10.900021, -37.035047]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
  await page.addInitScript(() => {
    if (localStorage.getItem('rota-entregas-v2')) return;
    localStorage.setItem('rota-entregas-v2', JSON.stringify({cidade: 'Aracaju, SE', regiao: null, tamTrecho: 9, inicio: null, voltar: false, ordemDoApp: false,
      areas: [{id: 'a1', nome: 'Verde', cor: '#16a34a', prazo: ''}], areaAtual: 'a1', areasManual: false, paradas: [], rota: null, pernas: {}}));
  });
  await abrir(page);
  await page.locator('input[type=file]').setInputFiles({name: 'barra.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'})});
  await expect(aviso(page)).toContainText('3 com um ponto que a planilha repete para bairros diferentes', {timeout: 30_000});

  const ps = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas
    .map((p: any) => ({rua: p.texto.split(',')[0], lat: p.lat, lng: p.lng, precisao: p.precisao, cidade: p.cidade})));
  const de = (rua: string) => ps.find((p: any) => p.rua === rua);
  // cada uma vai para o meio das outras entregas do seu bairro
  expect(de('Rua Inventada Um')).toMatchObject({lat: -10.915012, lng: -37.030034, precisao: 'bairro'});
  expect(de('Rua Inventada Dois')).toMatchObject({lat: -10.900021, lng: -37.035047, precisao: 'bairro'});
  // sem outra entrega do bairro (e sem o mapa, que aqui não responde), fica vermelha para conferir
  expect(de('Rua Inventada Tres')).toMatchObject({lat: ROTATORIA[0], lng: ROTATORIA[1], precisao: 'aproximada'});
  // cada uma sabe a cidade dela, com Aracaju guardado no app
  expect(ps.every((p: any) => p.cidade === 'Barra dos Coqueiros')).toBe(true);
});
