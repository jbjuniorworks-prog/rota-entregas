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

// Pedido de 07/10: numa rota de 67, achar os problemas rolando por entregues e verificados
// atrapalhava. A busca continua achando tudo, porque é ela que serve ao B.O.
test('a Conferir mostra primeiro o que tem problema, e recolhe os verificados e os entregues', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  const [verificada, entregue] = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
    const sem = s.paradas.filter((p: any) => ['exato', 'planilha', 'bom'].includes(p.precisao));
    Object.assign(sem[0], {precisao: 'confirmado', exibido: 'Endereço verificado'});
    Object.assign(sem[1], {entregue: true, entregueEm: Date.now()});
    localStorage.setItem('rota-entregas-v2', JSON.stringify(s));
    return [sem[0].texto, sem[1].texto];
  });
  await page.reload();
  await abrir(page);
  await aba(page, '2. Conferir');

  await expect(page.locator('.corpo [data-item]').first()).toContainText('Rua D, 49');
  await expect(page.locator('[data-grupo="conferir"]')).toContainText('Rua D, 49');
  await expect(page.locator('[data-item]').filter({hasText: verificada})).toBeHidden();
  await expect(page.locator('[data-item]').filter({hasText: entregue})).toBeHidden();
  await page.locator('[data-grupo="entregues"] summary').click();
  await expect(page.locator('[data-grupo="entregues"] [data-item]').filter({hasText: entregue})).toBeVisible();
  await page.locator('[data-grupo="verificadas"] summary').click();
  await expect(page.locator('[data-grupo="verificadas"] [data-item]').filter({hasText: verificada})).toBeVisible();

  await page.getByRole('searchbox', {name: 'Buscar'}).fill(entregue.split(',')[0]);
  await expect(page.locator('[data-item]').filter({hasText: entregue})).toBeVisible();
});

// Leudy, 09/10: a versão de antes marcou o grupo do Jatobá inteiro como longe e o levou para um
// ponto do mapa a 13 km. Com a rota já na tela, abrir a versão nova tem de trazer o grupo de volta.
test('ao abrir, o grupo que a versão de antes levou para o bairro do mapa volta para a planilha', async ({page}) => {
  const XLSX = (await import('xlsx')).default;
  const cab = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
  const SUL = [-10.887196, -37.003029], NORTE = [-10.775231, -36.950412];
  const em = ([lat, lng]: number[], d: number) => [+(lat + d).toFixed(6), +(lng - d).toFixed(6)];
  const linha = (n: number, base: number[], bairro: string) => ['AT-TESTE', n, n, `BRTESTEG${n}`, `Rua Inventada ${n}, 10`, bairro, 'Barra dos Coqueiros', `49099-9${String(n).padStart(2, '0')}`, ...em(base, n * 0.0007)];
  const ws = XLSX.utils.aoa_to_sheet([cab,
    ...[1, 2, 3, 4, 5].map(n => linha(n, SUL, 'Bairro Sul Teste')),
    ...[6, 7, 8].map(n => linha(n, NORTE, 'Bairro Norte Teste')),
    // o mesmo portão de condomínio na rodovia, com o número dela e o da casa
    ['AT-TESTE', 9, 9, 'BRTESTEG9', 'Rodovia Inventada, 7300, Cond Teste casa 288', 'Bairro Sul Teste', 'Barra dos Coqueiros', '49099-909', ...em(SUL, 0.0001)],
    ['AT-TESTE', 10, 10, 'BRTESTEG10', 'Rodovia Inventada, 1120, Cond Teste', 'Bairro Sul Teste', 'Barra dos Coqueiros', '49099-910', ...em(SUL, 0.0001)],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
  await abrir(page);
  await page.locator('input[type=file]').setInputFiles({name: 'grupo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'})});
  await expect(aviso(page)).toContainText('10 parada(s) da planilha');
  const rodovia = () => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas
    .filter((p: any) => /^Rodovia Inventada/.test(p.texto)).map((p: any) => p.precisao));
  expect(await rodovia()).toEqual(['planilha', 'planilha']);
  const norte = () => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas
    .filter((p: any) => /Inventada [678],/.test(p.texto)).map((p: any) => ({lat: p.lat, precisao: p.precisao})));
  // a versão nova já não marca o grupo
  expect((await norte()).map(p => p.precisao)).toEqual(['planilha', 'planilha', 'planilha']);
  const daPlanilha = (await norte()).map(p => p.lat);

  // como a versão de antes deixava: o grupo do norte no "bairro" do mapa, longe dele
  await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
    for (const p of e.paradas.filter((x: any) => /Inventada [678],/.test(x.texto))) {
      p.candidatos = [{lat: -10.95, lng: -37.07, exibido: 'Pelo bairro', precisao: 'bairro', fonte: 'bairro'},
        {lat: p.lat, lng: p.lng, exibido: 'Posição que veio na planilha (longe das outras entregas)', precisao: 'longe', fonte: 'planilha'}];
      Object.assign(p, {lat: -10.95, lng: -37.07, precisao: 'bairro', fonte: 'bairro', exibido: 'Posição pelo bairro Bairro Norte Teste'});
    }
    // e o "número não bate" que ela punha no portão da rodovia
    for (const p of e.paradas.filter((x: any) => /^Rodovia Inventada/.test(x.texto))) p.precisao = 'numero';
    localStorage.setItem('rota-entregas-v2', JSON.stringify(e));
  });
  await page.reload();
  await expect(aviso(page)).toContainText('3 parada(s) de um grupo longe do resto da rota voltaram para a posição da planilha', {timeout: 30_000});
  expect(await norte()).toEqual(daPlanilha.map(lat => ({lat, precisao: 'planilha'})));
  expect(await rodovia()).toEqual(['planilha', 'planilha']);

  // abrir de novo não muda mais nada
  const salvo = await page.evaluate(() => localStorage.getItem('rota-entregas-v2'));
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(aviso(page)).not.toContainText('voltaram para a posição da planilha');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('rota-entregas-v2')))!).paradas).toEqual(JSON.parse(salvo!).paradas);
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
