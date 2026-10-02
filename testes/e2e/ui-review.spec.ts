import {aba, abrir, carregar, colar, lista, montar, expect, test} from './apoio';

// A tela é testada no tamanho em que ela roda, com uma rota do tamanho que ela tem: numa lista
// de 80 cartões, o ruído que se repete por cartão é o que torna a tela cansativa de usar.
const ROTA_GRANDE = 'testes/planilhas/rota-d.xlsx';

test.describe('a tela no celular', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('nenhum cartão diz a mesma coisa duas vezes', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_GRANDE);
    await aba(page, '2. Conferir');
    await expect(page.locator('[data-item]').first()).toBeVisible();

    const repetidos = await page.locator('[data-item]').evaluateAll(cartoes => cartoes.flatMap(c => {
      const etiqueta = c.querySelector('.tag')?.textContent?.trim();
      if (!etiqueta) return [];
      return [...c.querySelectorAll('.achado')]
        .map(a => (a.textContent || '').trim())
        .filter(texto => texto && texto === etiqueta);
    }));
    expect(repetidos, `cartões repetindo a etiqueta: ${repetidos.slice(0, 3).join(' | ')}`).toEqual([]);
  });

  test('Remover não fica ao lado dos botões de todo dia', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_GRANDE);
    await aba(page, '2. Conferir');
    const cartao = page.locator('[data-item]').first();
    await expect(cartao.getByRole('button', {name: 'Marcar no mapa'})).toBeVisible();
    await expect(cartao.getByRole('button', {name: /Remover/})).toHaveCount(0);

    // só aparece para quem abriu o cartão de propósito
    await cartao.locator('.topo').click();
    await expect(cartao.getByRole('button', {name: /Remover/})).toBeVisible();
  });

  // "O mapa fica pequeno" (setembro): era uma faixa de 28% da tela embaixo do cartão. Agora ele é
  // a tela, e o cartão da próxima cabe inteiro por cima, sem rolar, com o endereço e o botão.
  test('na Rota o mapa ocupa a tela, e o cartão da próxima cabe inteiro', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_GRANDE);
    await montar(page);
    const caixa = async (seletor: string) => (await page.locator(seletor).first().boundingBox())!;
    expect((await caixa('#map')).height, 'altura do mapa').toBeGreaterThan(915 * 0.4);
    for (const s of ['.proxima .endereco', '.proxima [data-acao="entregue"]']) {
      const b = await caixa(s);
      expect(b.y >= 0 && b.y + b.height <= 915, `${s} tem de caber na tela sem rolar`).toBe(true);
    }
    // e a lista puxada para cima é quase a tela inteira, com uma faixa do mapa para se situar
    await lista(page);
    expect((await caixa('[data-folha="lista"]')).height).toBeGreaterThan(915 * 0.6);
    expect((await caixa('#map')).height).toBeGreaterThan(60);
  });
});

// As fotos das telas, para olhar em vez de opinar. Com a planilha do dia, que não entra no git:
//   ROTA_REAL="/caminho/rota.xlsx" npm run test:ui
test.describe('fotos', () => {
  const ROTA = process.env.ROTA_REAL || '';
  test.use({viewport: {width: 412, height: 915}});
  test.skip(!ROTA, 'defina ROTA_REAL com o caminho de uma planilha de rota');
  test.setTimeout(5 * 60_000);

  test('@ui fotografa as telas como o motorista vê', async ({page}, info) => {
    await abrir(page);
    await page.screenshot({path: info.outputPath('1-inicio.png')});
    await colar(page);
    await page.locator('#cidade').fill('Aracaju, SE');
    await page.locator('#arquivo').setInputFiles(ROTA);
    await expect(page.locator('#status')).toContainText('parada(s) da planilha', {timeout: 60_000});
    await page.waitForTimeout(2500);
    await page.screenshot({path: info.outputPath('2-carregada.png')});
    await aba(page, '2. Conferir');
    await page.screenshot({path: info.outputPath('3-conferir.png')});
    await montar(page);
    await page.waitForTimeout(1200);
    await page.screenshot({path: info.outputPath('4-rota.png')});
    await lista(page);
    await page.screenshot({path: info.outputPath('5-lista.png')});
    console.log('fotos em:', info.outputDir);
  });
});
