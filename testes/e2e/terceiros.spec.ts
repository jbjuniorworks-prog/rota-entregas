import {abrir, aviso, expect, test} from './apoio';

// O leitor de texto vem de CDN e roda dentro do app, ao lado da sessão de quem entrou. Se o arquivo
// de lá mudar (a conta do autor tomada, o CDN invadido), o navegador tem de recusar, e não rodar.
test('um leitor adulterado no CDN não roda dentro do app', async ({page}, info) => {
  await page.route('https://cdn.jsdelivr.net/npm/tesseract.js@*/dist/tesseract.min.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript', headers: {'access-control-allow-origin': '*'},
    body: `window.adulterado = true;
      window.Tesseract = {createWorker: async () => ({
        setParameters: async () => {},
        recognize: async () => ({data: {text: 'Rua Laranjeiras 100', blocks: null}}),
        terminate: async () => {},
      })};`,
  }));
  const print = info.outputPath('lista.png');
  await page.setContent('<body style="margin:0;background:#fff;font:600 30px system-ui;padding:24px">Rua Laranjeiras 100</body>');
  await page.screenshot({path: print});
  await abrir(page);
  await page.locator('input[type=file]').setInputFiles(print);
  await expect(aviso(page)).toContainText('Não consegui ler', {timeout: 30_000});
  expect(await page.evaluate(() => (window as any).adulterado), 'o arquivo adulterado rodou').toBeUndefined();
  await expect(page.locator('body')).not.toContainText('Laranjeiras');
});
