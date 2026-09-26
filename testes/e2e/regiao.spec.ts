import {test, expect, abrir, aba, linhaDe} from './apoio';

// Todos os testes daqui são sobre o que acontece QUANDO O CENSO NÃO RESPONDE: o filtro de região,
// a queda para o bairro, o nome antigo da rua, a nossa base de ruas. Por isso a rua usada é a
// Construtora Cunha — rua de verdade de Aracaju que não está no arquivo do IBGE (medido na
// gravação de 26/09). Trocar por uma que o censo conheça faz o censo responder primeiro e estes
// testes param de testar o que dizem testar. Há teste em `ibge.test.ts` travando essa ausência.
const ARACAJU ={lat: '-10.9472', lon: '-37.0731', display_name: 'Aracaju, Sergipe', category: 'place', addresstype: 'city', address: {city: 'Aracaju', state: 'Sergipe'}};
const EM_SAO_PAULO = {lat: '-23.5505', lon: '-46.6333', display_name: 'Rua Construtora Cunha, São Paulo', category: 'highway', addresstype: 'road', address: {road: 'Rua Construtora Cunha', city: 'São Paulo', state: 'São Paulo'}};
const NA_CIDADE = {lat: '-10.9401', lon: '-37.0620', display_name: 'Rua Construtora Cunha, Aracaju', category: 'highway', addresstype: 'road', address: {road: 'Rua Construtora Cunha', city: 'Aracaju', state: 'Sergipe'}};

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
  await page.getByLabel(/Endereços da área/).fill('Rua Construtora Cunha 114');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect(page.getByText(/❗ 1 para conferir/)).toBeVisible({timeout: 30_000});
  await expect(linhaDe(page, 'Rua Construtora Cunha 114', 'Marcar no mapa')).toContainText('Não encontrado');
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
    body: JSON.stringify([{cep: '49025-530', logradouro: 'Rua Construtora Cunha', bairro: 'Jardins', localidade: 'Aracaju', uf: 'SE'}]),
  }));
  await page.route('**://nominatim.openstreetmap.org/**', r => {
    const q = new URL(r.request().url()).searchParams.get('q') || '';
    const corpo = q.trim() === 'Aracaju, SE' ? ARACAJU : /^Jardins/.test(q) ? BAIRRO : OUTRA_RUA;
    r.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify([corpo])});
  });
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Construtora Cunha 1520');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  const linha = linhaDe(page, 'Rua Construtora Cunha 1520', 'Marcar no mapa');
  await expect(linha).toContainText('o mapa não tem esta rua: posição pelo bairro Jardins', {timeout: 30_000});
  await expect(linha).toContainText('Posição pelo bairro — confira no local');
  await page.locator('[data-item]').filter({hasText: 'Construtora Cunha'}).getByRole('button', {name: 'Ver', exact: true}).click();
  await expect(page.getByRole('button', {name: /Acrísio Moreira Siqueira/})).toBeVisible();
});

test('rua que mudou de nome é reconhecida pelo nome antigo, e o app mostra os dois', async ({page}) => {
  const MESMA_RUA = {
    lat: '-10.9401', lon: '-37.0620', display_name: 'Rua Acrísio Moreira Siqueira, Aracaju', category: 'highway', addresstype: 'road',
    address: {road: 'Rua Acrísio Moreira Siqueira', suburb: 'Jardins', city: 'Aracaju'},
    namedetails: {name: 'Rua Acrísio Moreira Siqueira', alt_name: 'Rua Construtora Cunha'},
  };
  await mapaFalso(page, MESMA_RUA);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Construtora Cunha 1520');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  const linha = linhaDe(page, 'Rua Construtora Cunha 1520', 'Marcar no mapa');
  await expect(linha).toContainText('Rua certa, número aproximado', {timeout: 30_000});
  await expect(linha).toContainText('no mapa: Rua Acrísio Moreira Siqueira');
});

test('a mesma rua dentro da região entra normalmente', async ({page}) => {
  await mapaFalso(page, NA_CIDADE);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Construtora Cunha 114');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect(linhaDe(page, 'Rua Construtora Cunha 114', 'Marcar no mapa')).toContainText('Rua Construtora Cunha — Aracaju', {timeout: 30_000});
});

test('com a rua na nossa base, o app nem precisa perguntar ao mapa de fora', async ({page, nuvem}) => {
  nuvem.tabelas = {ruas: [
    {nome: 'Rua Construtora Cunha', nome_chave: 'construtora cunha', cidade: 'Aracaju', lat: -10.9401, lng: -37.062, linha: [[-10.9401, -37.062], [-10.9405, -37.0625]]},
    {nome: 'Rua Construtora Cunha', nome_chave: 'construtora cunha', cidade: 'São Paulo', lat: -23.55, lng: -46.63, linha: [[-23.55, -46.63]]},
  ]};
  const buscas = await mapaFalso(page, ARACAJU);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Construtora Cunha 114');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  const linha = linhaDe(page, 'Rua Construtora Cunha 114', 'Marcar no mapa');
  await expect(linha).toContainText('pela nossa base de ruas', {timeout: 30_000});
  await expect(linha).toContainText('Rua certa, número aproximado');
  expect(buscas.filter(b => !b.includes('Aracaju%2C+SE') && !b.includes('Aracaju%2C%20SE'))).toEqual([]);
});

test('resposta que cai em outro bairro não vira a posição da entrega', async ({page}) => {
  // O caso real: "Rua Principal 17, Jabotiana". Existe Rua Principal em Cidade Nova, 6 km dali,
  // e era ela que ganhava. O censo diz onde Jabotiana fica, e isso vira o piso.
  const EM_CIDADE_NOVA = {
    lat: '-10.8901', lon: '-37.0743', display_name: 'Rua Principal, Cidade Nova', category: 'highway', addresstype: 'road',
    address: {road: 'Rua Principal', suburb: 'Cidade Nova', city: 'Aracaju'},
  };
  await page.route('**://viacep.com.br/**', r => {
    const doCep = /\/ws\/\d{8}\/json/.test(new URL(r.request().url()).pathname);
    r.fulfill({
      status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'},
      body: JSON.stringify(doCep
        ? {cep: '49096-300', logradouro: 'Rua Principal', complemento: '(Aloc)', bairro: 'Jabotiana', localidade: 'Aracaju', uf: 'SE'}
        : []),
    });
  });
  await mapaFalso(page, EM_CIDADE_NOVA);
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Principal 17, Jabotiana, CEP 49096-300');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  const linha = linhaDe(page, 'Rua Principal 17', 'Marcar no mapa');
  await expect(linha).toContainText('Jabotiana', {timeout: 30_000});
  await expect(page.getByText('Cidade Nova')).toHaveCount(0);
});

test('rua que nenhum mapa tem cai onde já entregamos naquele CEP', async ({page, nuvem}) => {
  // Rua Estanislau dos Santos não está no censo, nem no OpenStreetMap, nem nos Correios.
  // O que existe é o que os motoristas marcaram na porta, guardado pelo CEP.
  nuvem.rpc = {ancoras_de_cep: [{cep: '49096270', lat: -10.9512, lng: -37.0921, raio: 80, marcas: 3}]};
  await page.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({
    status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: '[]',
  }));
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Estanislau dos Santos 39, Jabotiana, CEP 49096-270');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  const linha = linhaDe(page, 'Estanislau dos Santos', 'Marcar no mapa');
  await expect(linha).toContainText('pelas entregas já feitas neste CEP', {timeout: 30_000});
  const pedido = nuvem.pedidos.find(p => p.caminho === 'rpc/ancoras_de_cep');
  expect(pedido, 'o app tem de perguntar pelos CEPs da rota').toBeTruthy();
  expect((pedido!.corpo as {ceps: string[]}).ceps).toContain('49096270');
});
