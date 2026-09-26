import {test, expect, abrir, carregar, aviso, aba, linhaDe, clicarMapa, montar, pontosNoMaps, ROTA_A} from './apoio';

const RUA_D = 'Rua D, 49, Perto do Vale';
const PERTO_DO_GRUPO = [-10.9605, -37.0455] as const;

async function corrigirRuaD(page) {
  await aba(page, '2. Conferir');
  await linhaDe(page, RUA_D, 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, ...PERTO_DO_GRUPO);
}

test('posição longe das outras entregas vem em vermelho e sai quando o motorista corrige', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect(aviso(page)).toContainText('⚠️ 1 com posição longe das outras entregas');
  await expect(page.getByText(/❗ 1 para conferir/)).toBeVisible();
  await expect(linhaDe(page, RUA_D, 'Marcar no mapa')).toContainText('Longe das outras entregas — confira o pino');
  await corrigirRuaD(page);
  await expect(aviso(page)).toContainText('guardado para as próximas rotas');
  await expect(page.getByText(/❗ 0 para conferir/)).toBeVisible();
});

test('pino marcado perto de outro já marcado pode virar uma parada só', async ({page}) => {
  const perguntas: string[] = [];
  page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  await linhaDe(page, 'Avenida Central, 1500', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.9640, -37.0430);
  await linhaDe(page, 'Travessa Um, 45', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.96412, -37.04305);
  expect(perguntas.at(-1)).toContain('virarem uma parada só');
  await expect(aviso(page)).toContainText('Local definido');
  await aba(page, '3. Rota');
  await page.getByRole('button', {name: /Montar melhor sequência/}).click();
  await expect(page.locator('.resumo')).toBeVisible();
  await expect(page.locator('.item').filter({hasText: 'Avenida Central, 1500'})).toContainText('2 entregas perto');
});

test('arrumar o pino de um condomínio ensina o nome dele para a base', async ({page, nuvem}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '1. Endereços');
  await page.getByLabel(/Endereços da área/).fill('Avenida das Flores, 1500, Ed Villa Sorrento apto 101, CEP 49000-102');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await aba(page, '2. Conferir');
  await linhaDe(page, 'Avenida das Flores, 1500', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.9412, -37.0456);
  await expect(aviso(page)).toContainText('Local definido');
  await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'lugares').length).toBeGreaterThan(0);
  const corpo = nuvem.pedidos.find(p => p.caminho === 'lugares')!.corpo as Record<string, unknown> | Record<string, unknown>[];
  expect(Array.isArray(corpo) ? corpo[0] : corpo).toMatchObject({nome_chave: 'sorrento villa', nome: 'Ed Villa Sorrento', lat: -10.9412, lng: -37.0456});
});

test('marcar ao lado de uma entrega que veio da planilha leva as duas para o ponto novo', async ({page}) => {
  const perguntas: string[] = [];
  page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  await linhaDe(page, 'Travessa Um, 45', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.96502, -37.04201);
  expect(perguntas.at(-1)).toContain('Levar as duas para o ponto que você marcou');
  await aba(page, '3. Rota');
  await page.getByRole('button', {name: /Montar melhor sequência/}).click();
  await expect(page.locator('.resumo')).toBeVisible();
  await expect(page.locator('.item').filter({hasText: 'Travessa Um, 45'})).toContainText('2 entregas');
});

test('corrigir um pino do condomínio leva junto as outras entregas do mesmo endereço', async ({page}) => {
  const perguntas: string[] = [];
  page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  await linhaDe(page, 'Rua dos Ipês, 300, Bloco A ap 101', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.9599, -37.0443);
  expect(perguntas.at(-1)).toContain('Outras 1 entrega(s) deste mesmo endereço');
  await expect(aviso(page)).toContainText('(2 entregas deste endereço)');
  for (const texto of ['Rua dos Ipês, 300, Bloco A ap 101', 'Rua dos Ipês, 300, Bloco B ap 202']) {
    await expect(linhaDe(page, texto, 'Marcar no mapa')).toContainText('Posição marcada no mapa');
  }
});

test('a correção fica guardada depois do reset e vale para a planilha e para texto colado', async ({page}) => {
  const perguntas: string[] = [];
  page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
  await abrir(page);
  await carregar(page, ROTA_A);
  await corrigirRuaD(page);

  await aba(page, '1. Endereços');
  await page.getByRole('button', {name: /Resetar rota/}).click();
  expect(perguntas.at(-1)).toContain('Quer resetar mesmo?');
  await expect(page.getByText('Adicionar endereços por área')).toBeVisible();

  await carregar(page, ROTA_A);
  await expect(aviso(page)).toContainText('📌 1 com a posição que você já tinha corrigido');
  await expect(page.getByText(/❗ 0 para conferir/)).toBeVisible();
  await expect(linhaDe(page, RUA_D, 'Marcar no mapa')).toContainText('Corrigida por você antes');

  await aba(page, '1. Endereços');
  await page.getByRole('button', {name: /Resetar rota/}).click();
  await page.getByLabel(/Endereços da área/).fill('Rua D, 49, CEP 49000-199');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect(linhaDe(page, 'Rua D, 49', 'Marcar no mapa')).toContainText('Corrigida por você antes');

  await aba(page, '1. Endereços');
  await page.getByText('Posições que você corrigiu (1)').click();
  await page.getByRole('button', {name: 'Esquecer todas'}).click();
  await expect(page.getByText(/Posições que você corrigiu/)).toHaveCount(0);
});

test('entrega que a planilha joga longe vai para o bairro dela, e o Maps não recebe o ponto errado', async ({page}) => {
  await abrir(page);
  await carregar(page, 'testes/planilhas/rota-c.xlsx');
  await expect(aviso(page)).toContainText('⚠️ 1 com posição longe das outras entregas: levada(s) para o bairro certo, confira no local.');
  await expect(aviso(page)).toContainText('⚠️ 1 com posição aproximada na planilha');
  await expect(aviso(page)).toContainText('⚠️ 2 com número que não bate com a posição');
  const linha = linhaDe(page, 'Rua do Robalo Errado', 'Marcar no mapa');
  await expect(linha).toContainText('Posição pelo bairro — confira no local');
  await expect(linha).toContainText('Posição pelo bairro Bairro Robalo Teste');
  await page.locator('[data-item]').filter({hasText: 'Rua do Robalo Errado'}).getByRole('button', {name: 'Ver', exact: true}).click();
  await expect(page.getByText('Outras opções encontradas:')).toBeVisible();
  await expect(page.getByRole('button', {name: /Posição que veio na planilha/})).toBeVisible();
  await montar(page);
  const pontos = await pontosNoMaps(page);
  expect(pontos.some(p => p.startsWith('-10.92'))).toBe(false);
  expect(pontos.some(p => p.startsWith('48.'))).toBe(false);
});

test('os pinos não se movem ao arrastar o mapa, e uma correção errada se desfaz com um toque', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  await expect(page.locator('.leaflet-marker-draggable')).toHaveCount(0);
  await corrigirRuaD(page);
  await expect(page.getByText(/❗ 0 para conferir/)).toBeVisible();
  await page.getByRole('button', {name: '↺ Desfazer'}).click();
  await expect(aviso(page)).toContainText('Posição anterior de volta.');
  await expect(page.getByText(/❗ 1 para conferir/)).toBeVisible();
  await expect(linhaDe(page, RUA_D, 'Marcar no mapa')).toContainText('Longe das outras entregas — confira o pino');
  await aba(page, '1. Endereços');
  await expect(page.getByText(/Posições que você corrigiu/)).toHaveCount(0);
});

test('reset cancelado não apaga nada', async ({page}) => {
  page.on('dialog', d => d.dismiss());
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '1. Endereços');
  await page.getByRole('button', {name: /Resetar rota/}).click();
  await aba(page, '2. Conferir');
  await expect(page.getByText(RUA_D)).toBeVisible();
});

test.describe('corrigir pela localização do motorista', () => {
  test.use({permissions: ['geolocation'], geolocation: {latitude: -10.9605, longitude: -37.0455, accuracy: 10}});

  test('"Estou aqui" põe a entrega onde o motorista está, e dá para desfazer', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await aba(page, '2. Conferir');
    const cartao = page.locator('[data-item]').filter({hasText: RUA_D});
    await cartao.getByRole('button', {name: '📍 Estou aqui'}).click();
    await expect(aviso(page)).toContainText('Local corrigido pela sua localização e guardado para as próximas rotas.');
    await expect(cartao).toContainText('Sua localização na porta (±10 m)');
    await expect(page.getByText(/❗ 0 para conferir/)).toBeVisible();
    await page.getByRole('button', {name: '↺ Desfazer'}).click();
    await expect(page.getByText(/❗ 1 para conferir/)).toBeVisible();
  });

  test('com GPS impreciso, pergunta antes; recusando, nada muda', async ({page, context}) => {
    const perguntas: string[] = [];
    page.on('dialog', d => { perguntas.push(d.message()); d.dismiss(); });
    await context.setGeolocation({latitude: -10.9605, longitude: -37.0455, accuracy: 200});
    await abrir(page);
    await carregar(page, ROTA_A);
    await aba(page, '2. Conferir');
    await page.locator('[data-item]').filter({hasText: RUA_D}).getByRole('button', {name: '📍 Estou aqui'}).click();
    await expect(aviso(page)).toHaveText('Posição não alterada.');
    expect(perguntas[0]).toContain('O GPS está impreciso agora (±200 m)');
    await expect(page.getByText(/❗ 1 para conferir/)).toBeVisible();
  });

  // O botão do dia a dia: o motorista arruma o pino na porta, com o pacote na mão. A rota que
  // ele está seguindo não pode sumir por causa disso — refazer precisa de rede, e em zona morta
  // a sequência volta em linha reta, pior do que a que ele tinha.
  test('o cartão da próxima entrega tem o "Estou aqui", e usar ele não apaga a rota', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect(page.getByText('Pino errado?')).toBeVisible();
    const proxima = await page.locator('.proxima .endereco').innerText();

    await page.locator('.proxima').getByRole('button', {name: '📍 Estou aqui'}).click();
    await expect(aviso(page)).toContainText('Local corrigido pela sua localização');
    await expect(aviso(page)).toContainText('A sequência continua de pé');

    await expect(page.locator('.resumo'), 'a rota tem de continuar montada').toBeVisible();
    await expect(page.locator('.proxima .endereco')).toHaveText(proxima);
    await expect(page.getByText('a sequência continua valendo')).toBeVisible();
    await expect(page.getByRole('button', {name: 'Refazer rota'})).toBeVisible();
    // o que envelheceu aparece envelhecido: km, tempo e previsão de fim
    await expect(page.locator('.resumo .velho')).toBeVisible();
  });

  test('definir de onde eu saio, com a rota na tela, também não apaga ela', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.getByText('Ponto de saída / refazer rota').click();
    await page.getByRole('button', {name: '📡 Onde estou agora'}).click();
    await expect(aviso(page)).toContainText('A rota continua na tela');
    await expect(page.locator('.resumo')).toBeVisible();
    await expect(page.locator('.proxima .endereco')).toBeVisible();
  });

  // O outro lado da regra: quando a parada deixa de existir, a rota deixa de descrever o dia.
  test('remover uma parada, essa sim, desmonta a rota', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await aba(page, '2. Conferir');
    const cartao = page.locator('[data-item]').first();
    await cartao.getByRole('button', {name: 'Ver', exact: true}).click();
    await cartao.getByRole('button', {name: /Remover/}).click();
    await aba(page, '3. Rota');
    await expect(page.getByRole('button', {name: /Montar melhor sequência/})).toBeVisible();
    await expect(page.locator('.resumo')).toHaveCount(0);
  });
});

test.describe('a entrega marcada na porta vira posição para a base', () => {
  test.use({permissions: ['geolocation'], geolocation: {latitude: -10.9605, longitude: -37.0455, accuracy: 12}});

  test('marcar entregue guarda onde o motorista estava, e GPS ruim não guarda', async ({page, context, nuvem}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.locator('.proxima').getByRole('button', {name: 'Entregue'}).first().click();
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'observacoes').length, {timeout: 20_000}).toBe(1);
    const passagem = nuvem.pedidos.find(p => p.caminho === 'observacoes')!;
    expect(passagem.metodo).toBe('POST');
    expect(passagem.corpo).toMatchObject({lat: -10.9605, lng: -37.0455, precisao_m: 12});
    expect(String((passagem.corpo as any).chave_lugar).length).toBeGreaterThan(3);

    await context.setGeolocation({latitude: -10.9605, longitude: -37.0455, accuracy: 300});
    await page.waitForTimeout(5500);
    await page.locator('.proxima').getByRole('button', {name: 'Entregue'}).first().click();
    await page.waitForTimeout(1500);
    expect(nuvem.pedidos.filter(p => p.caminho === 'observacoes')).toHaveLength(1);
  });
});

// A linha do Mercado Livre com o cartão fechado vem só "Avenida Tal 184", sem CEP e sem bairro.
// A chave do lugar precisa de um dos dois, senão a porta que o motorista marca vale só para hoje:
// não fica no aparelho nem chega no Pedro, no João e na Leudy. Quem achou o endereço sabe o
// bairro, e agora a parada adota ele.
test('endereço sem CEP nem bairro guarda a porta marcada, com o bairro que a busca achou', async ({page}) => {
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Lúcio Mota 114');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  // espera a busca terminar: é dela que vem o bairro que a parada adota
  await expect(aviso(page)).toContainText('Pronto!', {timeout: 30_000});
  await aba(page, '2. Conferir');
  await linhaDe(page, 'Rua Lúcio Mota 114', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.94395, -37.06460);
  await expect(aviso(page)).toContainText('guardado para as próximas rotas');
  await expect(aviso(page)).not.toContainText('Sem CEP nem bairro');

  // E agora a volta, que é o que decide se o trabalho dele vale: outro dia, a mesma linha crua,
  // de novo sem CEP nem bairro. A memória é consultada antes da busca, quando a chave ainda é
  // null — se ninguém consultar de novo depois que o bairro chega, o app guarda todo dia e nunca
  // usa, e o Luan marca a mesma porta a vida inteira.
  page.on('dialog', d => d.accept());
  await aba(page, '1. Endereços');
  await page.getByRole('button', {name: /Resetar rota/}).click();
  await page.getByLabel(/Endereços da área/).fill('Rua Lúcio Mota 114');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect(aviso(page)).toContainText('Pronto!', {timeout: 30_000});
  await aba(page, '2. Conferir');
  const linha = linhaDe(page, 'Rua Lúcio Mota 114', 'Marcar no mapa');
  await expect(linha).toContainText('Posição que você corrigiu em');
  await expect(linha).toContainText('Corrigida por você antes');
  const onde = await page.evaluate(() => {
    const ps = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas || [];
    return {lat: ps[0].lat, lng: ps[0].lng};
  });
  expect(onde.lat).toBeCloseTo(-10.94395, 5);
  expect(onde.lng).toBeCloseTo(-37.06460, 5);
});
