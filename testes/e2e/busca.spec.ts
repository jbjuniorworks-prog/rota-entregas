import {test, expect, abrir, aba, carregar, montar} from './apoio';

// B.O. numa entrega (pedido de 02/10): achar logo qual foi, pelo código da etiqueta ou pela rua,
// numa lista de 80 que não dá para rolar procurando.
test.use({viewport: {width: 412, height: 915}});
const ROTA_GRANDE = 'testes/planilhas/rota-d.xlsx';

test('acha a entrega pelo fim do código do pacote, e diz a hora em que foi entregue', async ({page}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await carregar(page, ROTA_GRANDE);
  await montar(page);
  await page.locator('.proxima [data-acao="entregue"]').first().click();
  const entregue = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.entregue);
    return {id: p.id, codigo: p.pacotes[0] as string, hora: new Date(p.entregueEm).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})};
  });

  await aba(page, '2. Conferir');
  const itens = page.locator('[data-item]');
  await expect(itens).toHaveCount(80);
  await page.getByLabel('Buscar').fill(entregue.codigo.slice(-4));
  await expect(itens).toHaveCount(1);
  const cartao = page.locator(`[data-item="${entregue.id}"]`);
  await expect(cartao.locator('[data-pacote]')).toHaveText(`Pacote ${entregue.codigo}`);
  await expect(cartao.locator('[data-entregue]')).toHaveText(`Entregue às ${entregue.hora}`);
});

test('pela rua e o número, sem confundir o 35 com o 135 da mesma avenida', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_GRANDE);
  await aba(page, '2. Conferir');
  const itens = page.locator('[data-item]');
  await page.getByLabel('Buscar').fill('central 35');
  await expect(itens.first()).toBeVisible();
  const achados = await itens.allInnerTexts();
  expect(achados.length).toBeGreaterThan(0);
  for (const t of achados) expect(t).toContain('Avenida Central, 35,');
  // a planilha tem duas Acácias 110, em bairros diferentes: o bairro separa
  await page.getByLabel('Buscar').fill('acácias 110');
  await expect(itens).toHaveCount(2);
  await page.getByLabel('Buscar').fill('acácias 110 leste');
  await expect(itens).toHaveCount(1);
  await expect(itens).toContainText('Rua das Acácias, 110, Bairro Leste');
  await page.getByLabel('Buscar').fill('rua que não existe');
  await expect(itens).toHaveCount(0);
  await expect(page.getByText('Nenhuma entrega da rota de hoje com isso.')).toBeVisible();
});
