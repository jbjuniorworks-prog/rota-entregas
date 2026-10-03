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

  // E a lista puxada para cima é quase a tela inteira, com uma faixa do mapa para se situar.
  test('a lista puxada para cima fica com a tela', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_GRANDE);
    await montar(page);
    await lista(page);
    const caixa = async (seletor: string) => (await page.locator(seletor).first().boundingBox())!;
    expect((await caixa('[data-folha="lista"]')).height).toBeGreaterThan(915 * 0.6);
    expect((await caixa('#map')).height).toBeGreaterThan(60);
  });
});

// "O mapa fica pequeno" (setembro: uma faixa de 28%) e de novo em 03/10, com o print do Pedro: no
// celular dele (384×760) o cartão da próxima tinha 52% da tela e o mapa 39%. "O mapa tem que ser
// de longe a maior parte da tela." O cartão mostra endereço e botões, sem rolar; o resto rola.
for (const tela of [{width: 384, height: 760}, {width: 412, height: 915}]) {
  test.describe(`o mapa é a maior parte da tela, em ${tela.width}×${tela.height}`, () => {
    test.use({viewport: tela});
    const caixa = async (page, seletor: string) => (await page.locator(seletor).first().boundingBox())!;
    // o mapa que se vê: o cartão sobe um pouco por cima dele, com os cantos redondos
    const mapaVisivel = async (page) => ((await caixa(page, '#painel')).y - (await caixa(page, '#map')).y) / tela.height;

    test('com o cartão da próxima aberto, e o endereço e os botões cabem sem rolar', async ({page}) => {
      await abrir(page);
      await carregar(page, ROTA_GRANDE);
      await montar(page);
      expect(await mapaVisivel(page), 'parte da tela com o mapa').toBeGreaterThan(0.55);
      for (const s of ['.proxima .endereco', '.proxima [data-acao="aqui"]', '.proxima .tres [data-acao="entregue"]']) {
        const b = await caixa(page, s);
        expect(b.y >= 0 && b.y + b.height <= tela.height, `${s} tem de caber na tela sem rolar`).toBe(true);
      }
    });

    // "Na prática, o menu pode ser minimizado e deixar o mapa na tela toda" (03/10)
    test('minimizado, o mapa fica com quase tudo, e continua assim ao abrir o app de novo', async ({page}) => {
      await abrir(page);
      await carregar(page, ROTA_GRANDE);
      await montar(page);
      await page.getByRole('button', {name: 'Minimizar'}).click();
      const linha = page.getByRole('button', {name: 'Mostrar a próxima entrega'});
      await expect(linha).toBeVisible();
      expect(await mapaVisivel(page)).toBeGreaterThan(0.8);
      // o Android fecha o app quando ele vai para o Waze
      await page.reload();
      await expect(linha).toBeVisible();
      await linha.click();
      await expect(page.locator('.proxima [data-acao="aqui"]')).toBeVisible();
      expect(await mapaVisivel(page)).toBeLessThan(0.8);
    });
  });
}

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
