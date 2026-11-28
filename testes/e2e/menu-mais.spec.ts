import {abrir, carregar, expect, menu, montar, paraABase, test, ROTA_A} from './apoio';

// Dono, 28/11: "é bom organizar esse Mais, cheio de coisa". Eram 14 itens soltos; agora em grupos, e
// o que liga e desliga só neste celular foi para uma tela própria, com o estado à vista.
test.use({viewport: {width: 412, height: 915}});

test('o Mais em grupos, com o reset por último, e os ajustes do celular à parte', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  await paraABase(page);
  await page.getByRole('button', {name: 'Mais', exact: true}).click();
  const menuMais = page.locator('.menu');
  await expect(menuMais.locator('.grupo-menu')).toHaveText(['Rota de hoje', 'Antes de sair', 'Meu']);
  await expect(menuMais.locator('.item-menu').last()).toHaveText('Resetar a rota');
  // som, guia e teste do caminho não ficam mais soltos no Mais
  await expect(menuMais.getByRole('button', {name: /som perto do pino|guia das curvas|^Teste do caminho/})).toHaveCount(0);
  await expect(menuMais.locator('.item-menu')).toHaveCount(12);
});

test('nos ajustes do celular, cada chave mostra se está ligada e troca no toque', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await menu(page, 'Ajustes deste celular');
  const som = page.locator('[data-chave="som"]');
  await expect(som).toHaveAttribute('aria-checked', 'true');
  await som.click();
  await expect(som).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#status')).toContainText('Som perto do pino desligado.');
  await expect(page.locator('[data-chave="guia"]')).toHaveAttribute('aria-checked', 'true');
});
