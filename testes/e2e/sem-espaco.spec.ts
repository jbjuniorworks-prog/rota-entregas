import {abrir, aviso, carregar, expect, montar, ROTA_B, test} from './apoio';

// Revisão de 24/11: com o armazenamento do celular cheio, a rota deixava de ser guardada calada. O
// Android fecha o app quando ele vai ao Waze, e o que ele marcou depois da última gravação se perdia,
// entregas e a fila de envio juntas, sem aviso nenhum.
test.describe('o celular sem espaço para guardar', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('marcar uma entrega sem conseguir guardar avisa', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_B);
    await montar(page);
    // daqui em diante o armazenamento recusa, como cheio
    await page.evaluate(() => {
      Storage.prototype.setItem = function () { throw new DOMException('cheio', 'QuotaExceededError'); };
    });
    await page.locator('[data-folha="proxima"]').getByRole('button', {name: /^Entreguei$/}).click();
    await expect(page.locator('[data-sem-espaco]')).toContainText('O celular não conseguiu guardar a rota');
  });

  test('guardando normalmente, não avisa nada disso', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_B);
    await montar(page);
    await page.locator('[data-folha="proxima"]').getByRole('button', {name: /^Entreguei$/}).click();
    await expect(aviso(page)).toContainText('Entregue');
    await expect(page.locator('[data-sem-espaco]')).toHaveCount(0);
  });
});
