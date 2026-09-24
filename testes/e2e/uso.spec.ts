import {aba, abrir, carregar, clicarMapa, expect, test, ROTA_A} from './apoio';

// A medição que decide quais botões ficam à mão. Vale pouco se não chegar: este teste segue o
// caminho inteiro, do toque no cartão até a chamada que o servidor recebe.
test('os botões do cartão são contados, com a sequência, e a contagem chega na nuvem', async ({page, nuvem}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  const cartao = page.locator('[data-item]').first();

  await cartao.getByRole('button', {name: 'Ver', exact: true}).click();
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
  await page.locator('[data-item]').first().getByRole('button', {name: 'Ver', exact: true}).click();
  await aba(page, '3. Rota');
  await expect(page.locator('#painel')).not.toContainText('para enviar');
});
