import {test, expect, abrir, carregar, aviso, aba, colar, linhaDe, lista, menu, clicarMapa, montar, pontosNoMaps, ROTA_A} from './apoio';

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
  await expect(aviso(page)).toContainText('1 com posição longe das outras entregas');
  // quantas conferir: o número no botão Mais, e no menu o caminho até elas (o aviso ficava por
  // cima do mapa e atrapalhava, 03/10)
  await expect(page.getByRole('button', {name: 'Mais', exact: true}).locator('[data-selo]')).toHaveText('1');
  await page.getByRole('button', {name: 'Mais', exact: true}).click();
  await page.locator('.menu [data-conferir]').click();
  await expect(page.locator('.cabecalho .titulo')).toHaveText('1 para conferir');
  await expect(page.locator('[data-item]')).toHaveCount(1);
  await aba(page, '2. Conferir');
  await expect(linhaDe(page, RUA_D, 'Marcar no mapa')).toContainText('Longe das outras entregas — confira o pino');
  await corrigirRuaD(page);
  await expect(aviso(page)).toContainText('guardado para as próximas rotas');
  await expect(page.getByText(/\b0 para conferir/)).toBeVisible();
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
  await montar(page);
  await lista(page);
  await expect(page.locator('.bloco').filter({hasText: 'Avenida Central, 1500'})).toContainText('2 entregas perto');
});

// 09/10: a resposta da busca que chegava depois passava por cima da porta marcada no meio dela.
// Sem CEP, como o cartão fechado do Meli: não há chave para a memória devolver a marcação.
test('a porta marcada enquanto a busca anda fica, quando a resposta atrasada chega', async ({page}) => {
  // a resposta do endereço só sai depois da marcação: a ordem não depende do relógio
  let liberar!: () => void;
  const marcou = new Promise<void>(ok => { liberar = ok; });
  let presas = 0, respondidas = 0;
  await page.route('**://nominatim.openstreetmap.org/**', async r => {
    if (!/Inventada/.test(new URL(r.request().url()).searchParams.get('q') || '')) return r.abort();
    presas++;
    await marcou;
    await r.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'},
      body: JSON.stringify([{lat: '-10.9000', lon: '-37.1000', display_name: 'Avenida Inventada das Flores, Aracaju', category: 'highway', addresstype: 'road', address: {road: 'Avenida Inventada das Flores', city: 'Aracaju', state: 'Sergipe'}}])});
    respondidas++;
  });
  await abrir(page);
  await carregar(page, ROTA_A);
  await colar(page);
  await page.getByLabel(/Endereços da área/).fill('Avenida Inventada das Flores 1500');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect.poll(() => presas, {timeout: 30_000}).toBeGreaterThan(0);
  await aba(page, '2. Conferir');
  await linhaDe(page, 'Avenida Inventada das Flores 1500', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.9412, -37.0456);
  liberar();
  await expect.poll(() => respondidas > 0 && respondidas === presas, {timeout: 30_000}).toBe(true);
  await page.waitForTimeout(1500);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.texto.startsWith('Avenida Inventada das Flores 1500')));
  expect({lat: p.lat, lng: p.lng, precisao: p.precisao}).toEqual({lat: -10.9412, lng: -37.0456, precisao: 'manual'});
});

test('arrumar o pino de um condomínio ensina o nome dele para a base', async ({page, nuvem}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await colar(page);
  await page.getByLabel(/Endereços da área/).fill('Avenida das Flores, 1500, Ed Villa Sorrento apto 101, CEP 49000-102');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  // a busca termina antes da marcação: o aviso final dela cobria o "Local definido" (09/10)
  await expect(aviso(page)).toContainText(/Pronto|falharam/, {timeout: 30_000});
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
  await montar(page);
  await lista(page);
  await expect(page.locator('.bloco').filter({hasText: 'Travessa Um, 45'})).toContainText('2 entregas');
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

  await menu(page, 'Resetar a rota');
  expect(perguntas.at(-1)).toContain('Quer resetar mesmo?');
  await expect(page.getByText('Carregar a rota de hoje')).toBeVisible();

  await carregar(page, ROTA_A);
  await expect(aviso(page)).toContainText('1 com a posição que você já tinha corrigido');
  await aba(page, '2. Conferir');
  await expect(page.getByText(/\b0 para conferir/)).toBeVisible();
  await expect(linhaDe(page, RUA_D, 'Marcar no mapa')).toContainText('Corrigida por você antes');

  await menu(page, 'Resetar a rota');
  await colar(page);
  await page.getByLabel(/Endereços da área/).fill('Rua D, 49, CEP 49000-199');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await aba(page, '2. Conferir');
  await expect(linhaDe(page, 'Rua D, 49', 'Marcar no mapa')).toContainText('Corrigida por você antes');

  // Pedro, 02/10: as duas partes de baixo da aba não serviam a ninguém. "Esquecer todas" apagava só
  // o celular, e a nuvem devolvia tudo na próxima rota; a chave do Google desligava o censo.
  await aba(page, '1. Endereços');
  await expect(page.getByText(/Posições que você corrigiu|Precisão extra com Google/)).toHaveCount(0);
});

test('entrega que a planilha joga longe vai para o bairro dela, e o Maps não recebe o ponto errado', async ({page}) => {
  await abrir(page);
  await carregar(page, 'testes/planilhas/rota-c.xlsx');
  await expect(aviso(page)).toContainText('1 com posição longe das outras entregas: levada(s) para o bairro certo, confira no local.');
  await expect(aviso(page)).toContainText('1 com posição aproximada na planilha');
  await expect(aviso(page)).toContainText('2 com número que não bate com a posição');
  await aba(page, '2. Conferir');
  const linha = linhaDe(page, 'Rua do Robalo Errado', 'Marcar no mapa');
  await expect(linha).toContainText('Posição pelo bairro — confira no local');
  await expect(linha).toContainText('Posição pelo bairro Bairro Robalo Teste');
  await page.locator('[data-item]').filter({hasText: 'Rua do Robalo Errado'}).locator('.topo').click();
  await expect(page.getByText('Outras posições encontradas:')).toBeVisible();
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
  await expect(page.getByText(/\b0 para conferir/)).toBeVisible();
  await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
  await expect(aviso(page)).toContainText('Posição anterior de volta.');
  await expect(page.getByText(/\b1 para conferir/)).toBeVisible();
  await expect(linhaDe(page, RUA_D, 'Marcar no mapa')).toContainText('Longe das outras entregas — confira o pino');
  // e o celular esqueceu a correção desfeita
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rota-entregas-posicoes') || '{}')).length)).toBe(0);
});

test('reset cancelado não apaga nada', async ({page}) => {
  page.on('dialog', d => d.dismiss());
  await abrir(page);
  await carregar(page, ROTA_A);
  await menu(page, 'Resetar a rota');
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
    await cartao.getByRole('button', {name: 'Estou aqui'}).click();
    await expect(aviso(page)).toContainText('Local corrigido pela sua localização e guardado para as próximas rotas.');
    await expect(cartao).toContainText('Sua localização na porta (±10 m)');
    await expect(page.getByText(/\b0 para conferir/)).toBeVisible();
    await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
    await expect(page.getByText(/\b1 para conferir/)).toBeVisible();
  });

  // Pedido deles, 28/09: "esse endereço já foi confirmado, tem certeza que deseja arrumar?". A
  // correção nova de um motorista substitui a dele na nuvem: quem confirmou e arruma sem querer
  // tira a confirmação de todo mundo.
  test('porta confirmada pergunta antes de arrumar; recusando, nada muda', async ({page}) => {
    let aceitar = false;
    const perguntas: string[] = [];
    page.on('dialog', d => { perguntas.push(d.message()); aceitar ? d.accept() : d.dismiss(); });
    await abrir(page);
    await carregar(page, ROTA_A);
    const antes = await page.evaluate(t => {
      const s = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
      const p = s.paradas.find((x: any) => x.texto.includes(t));
      Object.assign(p, {precisao: 'confirmado', exibido: 'Endereço verificado: 2 entregas feitas aqui'});
      localStorage.setItem('rota-entregas-v2', JSON.stringify(s));
      return {lat: p.lat, lng: p.lng};
    }, RUA_D);
    await page.reload();
    await abrir(page);
    await aba(page, '2. Conferir');
    // a verificada fica recolhida no fim da lista (07/10)
    await page.locator('[data-grupo="verificadas"] summary').click();
    const cartao = page.locator('[data-item]').filter({hasText: RUA_D});
    const onde = () => page.evaluate(t => {
      const p = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.texto.includes(t));
      return {lat: p.lat, lng: p.lng};
    }, RUA_D);

    await cartao.getByRole('button', {name: 'Estou aqui'}).click();
    expect(perguntas.at(-1)).toContain('Este endereço já está verificado');
    expect(perguntas.at(-1)).toContain('Endereço verificado: 2 entregas feitas aqui');
    expect(perguntas.at(-1)).toContain('Tem certeza que quer arrumar?');
    await page.waitForTimeout(500);
    expect(await onde()).toEqual(antes);

    await cartao.getByRole('button', {name: 'Marcar no mapa'}).click();
    expect(perguntas).toHaveLength(2);
    await expect(cartao.getByRole('button', {name: 'Marcar no mapa'}), 'recusou: não entra no modo de marcar').toBeVisible();

    aceitar = true;
    await cartao.getByRole('button', {name: 'Marcar no mapa'}).click();
    // aceitou: vai ao mapa, armado para o toque, como antes
    await expect(page.locator('[data-armado]'), 'aceitou: arruma como antes').toBeVisible();
  });

  test('com GPS impreciso, pergunta antes; recusando, nada muda', async ({page, context}) => {
    const perguntas: string[] = [];
    page.on('dialog', d => { perguntas.push(d.message()); d.dismiss(); });
    await context.setGeolocation({latitude: -10.9605, longitude: -37.0455, accuracy: 200});
    await abrir(page);
    await carregar(page, ROTA_A);
    await aba(page, '2. Conferir');
    await page.locator('[data-item]').filter({hasText: RUA_D}).getByRole('button', {name: 'Estou aqui'}).click();
    await expect(aviso(page)).toHaveText('Posição não alterada.');
    expect(perguntas[0]).toContain('O GPS está impreciso agora (±200 m)');
    await expect(page.getByText(/\b1 para conferir/)).toBeVisible();
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

    await page.locator('.proxima').getByRole('button', {name: 'Estou aqui'}).click();
    await expect(aviso(page)).toContainText('Local corrigido pela sua localização');
    await expect(aviso(page)).toContainText('A sequência continua de pé');

    await expect(page.locator('.resumo'), 'a rota tem de continuar montada').toBeVisible();
    await expect(page.locator('.proxima .endereco')).toHaveText(proxima);
    await expect(page.getByText('a sequência continua valendo')).toBeVisible();
    await expect(page.getByRole('button', {name: 'Refazer a rota'})).toBeVisible();
    // o que envelheceu aparece envelhecido: km, tempo e previsão de fim
    await expect(page.locator('.resumo .velho')).toBeVisible();
  });

  // O outro lado da regra: quando a parada deixa de existir, a rota deixa de descrever o dia.
  test('remover uma parada, essa sim, desmonta a rota', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await aba(page, '2. Conferir');
    const cartao = page.locator('[data-item]').first();
    await cartao.locator('.topo').click();
    await cartao.getByRole('button', {name: /Remover/}).click();
    await aba(page, '3. Rota');
    await expect(page.getByRole('button', {name: 'Montar a rota', exact: true})).toBeVisible();
    await expect(page.locator('[data-folha="proxima"]')).toHaveCount(0);
  });
});

test.describe('a entrega marcada na porta vira posição para a base', () => {
  test.use({permissions: ['geolocation'], geolocation: {latitude: -10.9605, longitude: -37.0455, accuracy: 12}});

  test('marcar entregue guarda onde o motorista estava, e GPS ruim não guarda', async ({page, context, nuvem}) => {
    // a porta espera o prazo de desfazer: o relógio controlado pula a espera
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    await page.waitForTimeout(1000);
    await page.clock.fastForward('11:00');
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'observacoes').length, {timeout: 20_000}).toBe(1);
    const passagem = nuvem.pedidos.find(p => p.caminho === 'observacoes')!;
    expect(passagem.metodo).toBe('POST');
    expect(passagem.corpo).toMatchObject({lat: -10.9605, lng: -37.0455, precisao_m: 12});
    expect(String((passagem.corpo as any).chave_lugar).length).toBeGreaterThan(3);
    // a próxima desta rota está a km daqui: entrega marcada longe do pino não verifica nada
    expect(passagem.corpo).not.toHaveProperty('no_pino');

    await context.setGeolocation({latitude: -10.9605, longitude: -37.0455, accuracy: 300});
    await page.waitForTimeout(5500);
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    await page.waitForTimeout(1500);
    await page.clock.fastForward('11:00');
    await page.waitForTimeout(1500);
    expect(nuvem.pedidos.filter(p => p.caminho === 'observacoes')).toHaveLength(1);
  });

  // "Igual o Mercado Livre faz, endereço verificado" (28/09): entregou no pino, o pino estava
  // certo, e essa entrega sozinha já verifica o endereço para os outros (017 no banco).
  test('entrega marcada no pino vai como "no pino", que verifica o endereço', async ({page, context, nuvem}) => {
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await page.locator('.proxima .endereco').innerText().then(t => page.evaluate(t2 => {
      const p = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.texto === t2);
      return {lat: p.lat, lng: p.lng};
    }, t));
    // uns 10 m do pino, e o GPS velho do teste não pode valer mais
    await context.setGeolocation({latitude: alvo.lat + 0.00009, longitude: alvo.lng, accuracy: 8});
    await page.waitForTimeout(5500);
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    await page.waitForTimeout(1000);
    await page.clock.fastForward('11:00');
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'observacoes').length, {timeout: 20_000}).toBe(1);
    expect(nuvem.pedidos.find(p => p.caminho === 'observacoes')!.corpo).toMatchObject({no_pino: true, precisao_m: 8});
  });
});

// Revisão de 05/10: "Entreguei aqui" na parada errada e Desfazer deixavam o endereço verificado no
// lugar errado para todos. O pino ia para o GPS antes da passagem ser feita, ela saía "no pino",
// e uma passagem no pino verifica sozinha (017); o Desfazer tirava a correção, não a passagem. E o
// toque errado se percebe na parada seguinte, desfazendo pela lista. Agora a passagem e o lugar
// esperam o prazo de desfazer na fila do celular, e qualquer desfazer da entrega os tira de lá.
test.describe('a porta espera o prazo de desfazer antes de ir para a nuvem', () => {
  test.use({permissions: ['geolocation'], geolocation: {latitude: -10.9605, longitude: -37.0455, accuracy: 12}});
  const enviados = (nuvem, tabela: string) => nuvem.pedidos.filter(p => p.caminho === tabela && p.metodo === 'POST');
  const PRAZO = '11:00';
  // o relógio controlado anda sozinho; depois de pular o prazo, o envio ainda tem de acontecer
  const depoisDoPrazo = async (page) => { await page.clock.fastForward(PRAZO); await page.waitForTimeout(1500); };

  test('"Entreguei aqui" desfeito não manda passagem nem lugar, nem depois do prazo', async ({page, nuvem}) => {
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.locator('.proxima [data-acao="aqui"]').click();
    await expect(aviso(page)).toContainText('com a porta marcada aqui');
    await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
    await expect(aviso(page)).toContainText('Desfeito');
    await depoisDoPrazo(page);
    expect(enviados(nuvem, 'observacoes')).toHaveLength(0);
    expect(enviados(nuvem, 'lugares')).toHaveLength(0);
  });

  test('sem desfazer, a passagem chega só depois do prazo', async ({page, nuvem}) => {
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.locator('.proxima [data-acao="aqui"]').click();
    await expect(aviso(page)).toContainText('com a porta marcada aqui');
    await page.waitForTimeout(1500);
    expect(enviados(nuvem, 'observacoes'), 'foi antes do prazo de desfazer').toHaveLength(0);
    await depoisDoPrazo(page);
    await expect.poll(() => enviados(nuvem, 'observacoes').length).toBe(1);
    // o GPS do teste está a km do pino que ele seguia: o "aqui" levou o pino até o GPS, mas isso
    // não faz a entrega ter sido "no pino"
    expect(enviados(nuvem, 'observacoes')[0].corpo).not.toHaveProperty('no_pino');
  });

  // O Android fecha o app quando ele vai para o Waze, logo depois do toque: a espera não pode
  // morar só na memória.
  test('fechar e abrir o app no meio do prazo não perde a passagem', async ({page, nuvem}) => {
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    await page.waitForTimeout(1500);
    expect(enviados(nuvem, 'observacoes'), 'foi antes do prazo de desfazer').toHaveLength(0);
    await page.reload();
    await expect(page.locator('[data-folha="proxima"]')).toBeVisible();
    await depoisDoPrazo(page);
    await expect.poll(() => enviados(nuvem, 'observacoes').length).toBe(1);
  });

  // O aviso tem uma vaga só: entregou a seguinte, e o Desfazer do aviso já é o dela. A primeira
  // se desfaz pela lista, e é por ela que a passagem tem de sair.
  test('o Desfazer da lista tira a passagem que ainda espera, e só a dela', async ({page, nuvem}) => {
    const {lista} = await import('./apoio');
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const primeira = await page.locator('.proxima .endereco').innerText();
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    await expect(page.locator('.proxima .endereco')).not.toHaveText(primeira);
    const segunda = await page.locator('.proxima .endereco').innerText();
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    await expect(page.locator('.proxima .endereco')).not.toHaveText(segunda);

    await lista(page);
    await page.locator('details.feitas summary').click();
    await page.locator('[data-item]').filter({hasText: primeira}).getByRole('button', {name: 'Desfazer'}).click();
    await depoisDoPrazo(page);
    await expect.poll(() => enviados(nuvem, 'observacoes').length).toBe(1);
    expect((enviados(nuvem, 'observacoes')[0].corpo as any).endereco).toBe(segunda);
  });
});

// O "Entreguei" e o "Depois" ficam lado a lado, e o cartão já pula para a próxima: o toque errado
// se desfazia abrindo a lista e procurando a linha, de luva e na rua (revisão de 05/10).
test.describe('o toque que muda o dia se desfaz no próprio aviso', () => {
  test('Entreguei: o aviso desfaz, e o cartão volta para a mesma entrega', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const antes = await page.locator('.proxima .endereco').innerText();
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    await expect(page.locator('.proxima .endereco')).not.toHaveText(antes);
    await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
    await expect(page.locator('.proxima .endereco')).toHaveText(antes);
    await expect(page.locator('.resumo')).toContainText('0 de');
  });

  // Desfazer não é "Voltar para a rota": aquele pede Refazer, e a rota nunca se refaz sozinha.
  test('Depois: o aviso desfaz, e a entrega volta ao mesmo lugar da sequência', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const ordem = () => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).rota.areas.map((a: any) => a.ordem));
    const antes = await ordem();
    const endereco = await page.locator('.proxima .endereco').innerText();
    await page.locator('.proxima').getByRole('button', {name: 'Depois', exact: true}).click();
    await expect(page.locator('.proxima .endereco')).not.toHaveText(endereco);
    await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
    await expect(page.locator('.proxima .endereco')).toHaveText(endereco);
    expect(await ordem()).toEqual(antes);
  });

  // Um pulso curto confirma o toque sem olhar para a tela. O de 200 ms continua sendo o de
  // "próxima a pé", e é o único que o app tinha.
  test('Entreguei dá um pulso curto, diferente do de "próxima a pé"', async ({page}) => {
    await page.addInitScript(() => {
      (window as any).pulsos = [];
      Object.defineProperty(navigator, 'vibrate', {value: (p: number) => { (window as any).pulsos.push(p); return true; }});
    });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    const pulsos = await page.evaluate(() => (window as any).pulsos);
    expect(pulsos[0]).toBeGreaterThanOrEqual(20);
    expect(pulsos[0]).toBeLessThanOrEqual(50);
  });
});

// A linha do Mercado Livre com o cartão fechado vem só "Avenida Tal 184", sem CEP e sem bairro.
// A chave do lugar precisa de um dos dois, senão a porta que o motorista marca vale só para hoje:
// não fica no aparelho nem chega no Pedro, no João e na Leudy. Quem achou o endereço sabe o
// bairro, e agora a parada adota ele.
test('endereço sem CEP nem bairro guarda a porta marcada, com o bairro que a busca achou', async ({page}) => {
  await abrir(page);
  await colar(page);
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
  await menu(page, 'Resetar a rota');
  await colar(page);
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

// Print de 29/09: no Editar ele apagou o endereço e colou só o link, que é o jeito natural de colar
// num campo de texto. A parada ficou sem nome — "#70 ·" e mais nada — e, sem endereço, sem chave:
// a porta que ele foi buscar no mapa não ficou guardada nem foi para os outros motoristas.
test('colar só o link no Editar mantém o endereço, põe na porta e guarda', async ({page}) => {
  const LINK = 'https://www.google.com/maps/place/x/@-10.90,-37.10,13z/data=!3m1!4b1!8m2!3d-10.9571234!4d-37.0512345';
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(LINK) : d.dismiss());
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  await linhaDe(page, RUA_D, 'Editar').getByRole('button', {name: 'Editar'}).click();
  await expect(aviso(page)).toContainText('Local colado do mapa');
  await expect(aviso(page)).toContainText('guardado para as próximas rotas');
  const p = await page.evaluate(t => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.texto.startsWith(t)), RUA_D);
  expect(p, 'o endereço continua na parada').toBeTruthy();
  expect({lat: p.lat, lng: p.lng, precisao: p.precisao}).toEqual({lat: -10.9571234, lng: -37.0512345, precisao: 'manual'});
});

// O dono chega com a porta copiada do Google Maps porque o censo não tem aquela rua. Consertar
// uma parada que já está na lista é pelo "Editar" — colar o link ali tinha de valer igual. E o
// link arruma a posição, não o nome do pino (29/09): o texto que vier junto com ele não troca o
// endereço — aqui, o título do lugar que o Google copia junto.
test('colar o link do mapa no Editar põe a parada na porta, guarda, e não troca o endereço', async ({page}) => {
  page.on('dialog', d => d.accept('Auto Peças Qualquer Coisa, 999 '
    + 'https://www.google.com/maps/place/x/@-10.9436597,-37.0553986,17z/data=!3m1!4b1!8m2!3d-10.943665!4d-37.0528237'));
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Avenida Deputado Sílvio Teixeira 200, CEP 49025-400');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  // sem rede no teste, essa rua não tem como ser achada — é justamente o caso do link colado
  await expect(aviso(page)).toContainText(/Pronto!|falharam/, {timeout: 30_000});
  await aba(page, '2. Conferir');
  await linhaDe(page, 'Sílvio Teixeira 200', 'Editar').getByRole('button', {name: 'Editar'}).click();
  await expect(aviso(page)).toContainText('Local colado do mapa');
  await expect(aviso(page)).toContainText('guardado para as próximas rotas');
  const onde = await page.evaluate(() => {
    const ps = JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas || [];
    return {lat: ps[0].lat, lng: ps[0].lng, texto: ps[0].texto, precisao: ps[0].precisao};
  });
  // a porta do link (!3d!4d), não o enquadramento do mapa (@), que ali está a 270 m
  expect(onde.lat).toBeCloseTo(-10.943665, 6);
  expect(onde.lng).toBeCloseTo(-37.0528237, 6);
  expect(onde.precisao).toBe('manual');
  expect(onde.texto, 'o endereço é o de antes, não o texto colado junto com o link').toBe('Avenida Deputado Sílvio Teixeira 200, CEP 49025-400');
});
