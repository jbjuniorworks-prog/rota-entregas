import {aba, abrir, carregar, clicarMapa, expect, lista, montar, test, ROTA_A} from './apoio';

// A medição que decide quais botões ficam à mão. Vale pouco se não chegar: este teste segue o
// caminho inteiro, do toque no cartão até a chamada que o servidor recebe.
test('os botões do cartão são contados, com a sequência, e a contagem chega na nuvem', async ({page, nuvem}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  const cartao = page.locator('[data-item]').first();

  await cartao.getByRole('button', {name: 'Ver no mapa'}).click();
  await expect(page.locator('[data-folha="pino"]')).toBeVisible();
  await page.goBack();
  await cartao.getByRole('button', {name: 'Editar'}).click();  // o prompt é recusado: o toque conta igual
  await cartao.getByRole('button', {name: 'Marcar no mapa'}).click();
  // corrigir a posição é o que empurra a fila; o contador vai junto, de carona
  await clicarMapa(page, -10.9605, -37.0455);

  await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'rpc/contar_uso').length, {timeout: 20_000}).toBeGreaterThan(0);
  const corpo = nuvem.pedidos.filter(p => p.caminho === 'rpc/contar_uso').pop()!.corpo as {dia_: string; linhas: {botao: string; antes: string; vezes: number}[]};

  expect(corpo.dia_).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const conta = (botao: string, antes = '') => (corpo.linhas.find(l => l.botao === botao && l.antes === antes) || {vezes: 0}).vezes;
  expect(conta('ver')).toBe(1);
  expect(conta('editar')).toBe(1);
  expect(conta('mapa')).toBe(1);
  expect(conta('editar', 'ver'), 'Editar logo depois de Ver').toBe(1);
  expect(conta('mapa', 'editar'), 'Marcar no mapa logo depois de Editar').toBe(1);

  // e nada além de nome de botão e contagem sai daqui
  for (const l of corpo.linhas) expect(Object.keys(l).sort()).toEqual(['antes', 'botao', 'vezes']);
  expect(JSON.stringify(corpo)).not.toContain('Rua');
});

test('o contador não aparece como trabalho pendente do motorista', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  await page.locator('[data-item]').first().getByRole('button', {name: 'Ver no mapa'}).click();
  await aba(page, '3. Rota');
  await expect(page.locator('#app')).not.toContainText('para enviar');
});

// Dono, 15/11: "entrou na rua errada, atualiza a rota?". Antes de redesenhar a linha quando ele
// erra a rua, saber se eles seguem a linha do app ou o Waze: cada ida para fora é contada.
test('o toque no Waze e no Maps é contado, sem nada do endereço', async ({page, context}) => {
  // a ida de verdade não importa aqui, só o toque
  await context.route(/waze\.com|google\.com\/maps|maps\.google\.com/, r => r.abort());
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  const cartao = page.locator('[data-folha="proxima"]');
  await cartao.getByRole('link', {name: 'Waze'}).click();
  await cartao.getByRole('link', {name: 'Google Maps'}).click();
  await lista(page);
  await page.getByRole('link', {name: /^Abrir as próximas \d+ no Google Maps$/}).click();
  await page.getByRole('link', {name: /^Trecho 1, pontos/}).click();
  // o cartão do pino: o Maps dele vai só até o pino (25/11), e o trecho a partir dele é outro link
  await page.getByRole('button', {name: 'Voltar ao mapa'}).click();
  await page.locator('.pino.alvo').click();
  await page.locator('[data-folha="pino"] [data-acao="waze"]').first().click();
  await page.locator('[data-folha="pino"] [data-acao="maps"]').first().click();
  await page.locator('[data-folha="pino"] [data-acao="maps-varios"]').first().click();

  const uso = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-uso')!).contas as Record<string, number>);
  expect(uso['waze|']).toBe(2);
  expect(uso['maps|']).toBe(2);
  expect(uso['maps-varios|']).toBe(3);
  expect(uso['maps|waze'], 'Maps logo depois do Waze, no cartão da próxima e no do pino').toBe(2);  expect(JSON.stringify(uso)).not.toContain('Rua');
});
