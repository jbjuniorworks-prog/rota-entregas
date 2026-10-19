import {test, expect, abrir, aviso, colar} from './apoio';

// 19/10: "Fotografar" abre a câmera direto e manda a foto para o mesmo leitor dos prints. Leitor
// falso, que devolve o mesmo texto em toda leitura; endereços inventados.
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    (window as any).Tesseract = {createWorker: async () => ({
      setParameters: async () => {},
      recognize: async () => ({data: {text: 'Avenida Teste Inventada 2000\nRua Teste Outra 15', blocks: null}}),
      terminate: async () => {},
    })};
    // o aviso troca rápido: guarda todos os que passaram
    const avisos: string[] = (window as any).__avisos = [];
    new MutationObserver(() => {
      const t = document.getElementById('status')?.textContent || '';
      if (t && t !== avisos[avisos.length - 1]) avisos.push(t);
    }).observe(document, {subtree: true, childList: true, characterData: true});
  });
});

const foto = async (page: any, info: any) => {
  const caminho = info.outputPath('comanda.png');
  await page.setContent('<body style="margin:0;background:#fff;font:600 30px system-ui;padding:24px">comanda</body>');
  await page.screenshot({path: caminho});
  return caminho;
};

test('Fotografar abre a câmera de trás e a foto entra na lista, sem mudar a escolha de arquivo', async ({page}, info) => {
  const caminho = await foto(page, info);
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Cidade Teste');

  const escolha = page.waitForEvent('filechooser');
  await page.getByText('Fotografar', {exact: true}).click();
  const chooser = await escolha;
  // é a câmera de trás, só foto, uma de cada vez
  const entrada = chooser.element();
  expect(await entrada.getAttribute('capture')).toBe('environment');
  expect(await entrada.getAttribute('accept')).toBe('image/*');
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles(caminho);
  await expect(aviso(page)).toContainText(/2 endereço\(s\) lido\(s\)/, {timeout: 30_000});
  await expect(page.locator('#lista')).toHaveValue('Avenida Teste Inventada 2000\nRua Teste Outra 15');

  // a de sempre continua escolhendo vários arquivos de qualquer tipo, sem abrir a câmera
  const outra = page.waitForEvent('filechooser');
  await page.getByText('Mandar prints ou vídeo da lista').click();
  const deSempre = (await outra).element();
  expect(await deSempre.getAttribute('capture')).toBeNull();
  expect(await deSempre.getAttribute('accept')).toContain('.xlsx');
  expect((await outra).isMultiple()).toBe(true);
});

test('cancelar a câmera não apaga a lista, e fotografar de novo soma ao que já estava escrito', async ({page}, info) => {
  const caminho = await foto(page, info);
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Cidade Teste');
  await page.getByLabel(/Endereços da área/).fill('Rua Teste Escrita 5');

  // cancelar: o Chrome do Android não manda arquivo nenhum
  let escolha = page.waitForEvent('filechooser');
  await page.getByText('Fotografar', {exact: true}).click();
  await (await escolha).setFiles([]);
  await expect(page.locator('#lista')).toHaveValue('Rua Teste Escrita 5');

  escolha = page.waitForEvent('filechooser');
  await page.getByText('Fotografar', {exact: true}).click();
  await (await escolha).setFiles(caminho);
  await expect(aviso(page)).toContainText(/2 endereço\(s\) lido\(s\)/, {timeout: 30_000});
  await expect(page.locator('#lista')).toHaveValue('Rua Teste Escrita 5\nAvenida Teste Inventada 2000\nRua Teste Outra 15');
  // o cancelar não começou leitura nenhuma: só a foto de verdade passou pelo leitor
  const avisos: string[] = await page.evaluate(() => (window as any).__avisos);
  expect(avisos.filter(a => /Carregando leitor/.test(a))).toHaveLength(1);
  expect(avisos.filter(a => /Não achei|Não consegui/.test(a))).toEqual([]);
});
