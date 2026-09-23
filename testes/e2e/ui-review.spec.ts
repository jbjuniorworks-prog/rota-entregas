import {aba, abrir, carregar, expect, test} from './apoio';

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
        .map(a => (a.textContent || '').replace(/^📍\s*/, '').trim())
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
    await cartao.getByRole('button', {name: 'Ver', exact: true}).click();
    await expect(cartao.getByRole('button', {name: /Remover/})).toBeVisible();
  });

  test('na Rota o endereço da próxima entrega aparece sem precisar rolar', async ({page}) => {
    await abrir(page);
    await carregar(page, ROTA_GRANDE);
    await aba(page, '3. Rota');
    const botao = page.getByRole('button', {name: /Montar melhor sequência/});
    if (!(await botao.isVisible())) await page.getByText('Ponto de saída / refazer rota').click();
    await botao.click();
    await expect(page.locator('.resumo')).toBeVisible({timeout: 90_000});

    const alvo = page.locator('.proxima .endereco').first();
    await expect(alvo).toBeVisible();
    const daTela = await alvo.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    });
    expect(daTela, 'o endereço tem de caber na tela sem rolar').toBe(true);
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
    await page.screenshot({path: info.outputPath('1-vazio.png'), fullPage: true});
    await page.locator('#cidade').fill('Aracaju, SE');
    await page.locator('input[type=file]').setInputFiles(ROTA);
    await expect(page.locator('#status')).toContainText('parada(s) da planilha', {timeout: 60_000});
    await page.waitForTimeout(2500);
    await page.screenshot({path: info.outputPath('2-conferir.png')});
    await aba(page, '1. Endereços');
    await page.screenshot({path: info.outputPath('3-enderecos.png'), fullPage: true});
    await aba(page, '3. Rota');
    const montar = page.getByRole('button', {name: /Montar melhor sequência/});
    if (!(await montar.isVisible())) await page.getByText('Ponto de saída / refazer rota').click();
    await montar.click();
    await expect(page.locator('.resumo')).toBeVisible({timeout: 90_000});
    await page.waitForTimeout(1200);
    await page.screenshot({path: info.outputPath('4-rota.png'), fullPage: true});
    console.log('fotos em:', info.outputDir);
  });
});
