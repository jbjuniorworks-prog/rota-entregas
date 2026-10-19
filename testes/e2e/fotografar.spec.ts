import {test, expect, abrir, aviso, colar} from './apoio';

// 19/10: "Fotografar" abre a câmera direto e manda a foto para o mesmo leitor dos prints. Leitor
// falso, que devolve o mesmo texto em toda leitura, ou um por passada quando o teste diz qual;
// endereços inventados.
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    (window as any).Tesseract = {createWorker: async () => {
      let psm = '3';
      return {
        setParameters: async (p: any) => { psm = p.tessedit_pageseg_mode; },
        recognize: async () => ({data: {text: (window as any).__porPassada?.[psm] ?? 'Avenida Teste Inventada 2000\nRua Teste Outra 15', blocks: null}}),
        terminate: async () => {},
      };
    }};
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

  // a de sempre continua escolhendo vários arquivos de qualquer tipo, print e gravação de tela, sem
  // abrir a câmera
  const outra = page.waitForEvent('filechooser');
  await page.getByText('Ler a gravação da tela').click();
  const deSempre = (await outra).element();
  expect(await deSempre.getAttribute('capture')).toBeNull();
  expect((await deSempre.getAttribute('accept'))!.split(',')).toEqual(expect.arrayContaining(['image/*', 'video/*', '.xlsx']));
  expect((await outra).isMultiple()).toBe(true);
});

// 19/10: pelo seletor dos prints, "Ler a planilha" fazia o celular oferecer câmera e filmadora.
test('"Ler a planilha" pede só planilha, e a planilha entra', async ({page}) => {
  await abrir(page);
  const escolha = page.waitForEvent('filechooser');
  await page.getByText('Ler a planilha', {exact: true}).click();
  const chooser = await escolha;
  const accept = (await chooser.element().getAttribute('accept'))!.split(',');
  expect(accept.filter(t => /image|video|pdf|txt|\*/.test(t)), 'nada além de planilha').toEqual([]);
  expect(accept).toEqual(expect.arrayContaining(['.xlsx', '.xls', '.ods', '.csv']));
  expect(await chooser.element().getAttribute('capture')).toBeNull();
  await chooser.setFiles('testes/planilhas/rota-d.xlsx');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas?.length || 0), {timeout: 30_000}).toBeGreaterThan(0);
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

// Comanda do iFood como o leitor devolveu em 19/10: cada passada lê uma parte.
const comanda = (cabecalho: string[], rua: string[]) => [...cabecalho, 'ENTREGA', 'Pedido: #14', 'Fulana Teste',
  'Telefone: 0800 705 6070, localizador: 15346433', 'ID do pedido:836092284', ...rua, 'Aracaju - Bairro Teste',
  'Obs: Desconto do Restaurante: 5', 'Código de Coleta: 8338', 'Entrega para às 20:05'].join('\n');

test('comanda fotografada vira uma entrega só, sem a rua do restaurante e sem o número do pedido', async ({page}, info) => {
  const caminho = await foto(page, info);
  await page.addInitScript(c => { (window as any).__porPassada = c; }, {
    '4': comanda(['Pizzaria Teste', 'CNPJ: 12.345.678/0001-90', 'Rua do Restaurante Teste, 101, Terreo', 'Aracaju - Atalaia'], ['R. Teste da Silva, 151, Chale 2']),
    // nesta passada a rua do cliente não saiu, e a do restaurante saiu sem o CNPJ em cima
    '6': comanda(['Pizzaria Teste', 'Rua do Restaurante Teste, 101, Terreo', 'Aracaju - Atalaia'], []),
    '3': '',
  });
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Cidade Teste');
  const escolha = page.waitForEvent('filechooser');
  await page.getByText('Fotografar', {exact: true}).click();
  await (await escolha).setFiles(caminho);
  await expect(aviso(page)).toContainText(/1 endereço\(s\) lido\(s\)/, {timeout: 30_000});
  await expect(page.locator('#lista')).toHaveValue('R. Teste da Silva, 151, Chale 2, Bairro Teste');
});

test('comanda com a porta lida diferente não entra: o aviso mostra as leituras e a lista fica como estava', async ({page}, info) => {
  const caminho = await foto(page, info);
  await page.addInitScript(c => { (window as any).__porPassada = c; }, {
    '4': comanda([], ['Rua Teste Bell, 181, (Ed Teste, 802)']),
    '6': comanda([], ['Rua Teste Bell, 181, (Ed Teste, 802)']),
    '3': comanda([], ['Rua Teste Bell, 151, (Ed Teste, 802)']),
  });
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Cidade Teste');
  await page.getByLabel(/Endereços da área/).fill('Rua Teste Escrita 5');
  const escolha = page.waitForEvent('filechooser');
  await page.getByText('Fotografar', {exact: true}).click();
  await (await escolha).setFiles(caminho);
  // o texto foi lido: o que falhou foi confirmar, e cada leitura fica numa linha para ele comparar
  await expect(aviso(page)).toContainText('Não deu para confirmar o endereço', {timeout: 30_000});
  expect((await aviso(page).innerText()).split('\n')).toEqual([
    'Não deu para confirmar o endereço. Confira as leituras abaixo ou fotografe novamente.', '"Rua Teste Bell, 181"', '"Rua Teste Bell, 151"']);
  expect((await page.locator('#lista').inputValue()).split('\n').filter(Boolean)).toEqual(['Rua Teste Escrita 5']);
});

test('o apartamento que as passadas leram diferente sai, e o aviso diz isso antes do "lido"', async ({page}, info) => {
  const caminho = await foto(page, info);
  await page.addInitScript(c => { (window as any).__porPassada = c; }, {
    '4': comanda([], ['Rua Teste, 50, (Ed Teste ap 203)']),
    '6': comanda([], ['Rua Teste, 50, (Ed Teste ap 103)']),
    '3': '',
  });
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Cidade Teste');
  const escolha = page.waitForEvent('filechooser');
  await page.getByText('Fotografar', {exact: true}).click();
  await (await escolha).setFiles(caminho);
  await expect(aviso(page)).toContainText('endereço(s) lido(s)', {timeout: 30_000});
  expect((await aviso(page).innerText()).split('\n')[0])
    .toBe('O endereço entrou sem o apartamento: as leituras deram ap 203 e ap 103. Confira no papel antes de entregar.');
  await expect(page.locator('#lista')).toHaveValue('Rua Teste, 50, (Ed Teste), Bairro Teste');
});

// Pelo Compartilhar do celular a comanda entra direto, sem a lista para conferir: o aviso é o que sobra.
test.describe('comanda compartilhada', () => {
  const compartilhar = async (page: any, porPassada: Record<string, string>) => {
    await page.addInitScript(c => { (window as any).__porPassada = c; }, porPassada);
    await abrir(page);
    await page.setContent('<body style="margin:0;background:#fff;font:600 30px system-ui;padding:24px">comanda</body>');
    const png = (await page.screenshot()).toString('base64');
    await abrir(page);
    await page.evaluate(async (b64: string) => {
      const c = await caches.open('compartilhado');
      await c.put('./compartilhado/img0', new Response(new Blob([Uint8Array.from(atob(b64), x => x.charCodeAt(0))], {type: 'image/png'})));
    }, png);
    await page.goto('./?compartilhado=1');
  };

  test('a porta não confirmada mostra as leituras, e não manda compartilhar a planilha', async ({page}) => {
    await compartilhar(page, {'4': comanda([], ['Rua Teste Bell, 181, (Ed Teste, 802)']), '6': '', '3': comanda([], ['Rua Teste Bell, 151, (Ed Teste, 802)'])});
    await expect(aviso(page)).toContainText('Não deu para confirmar o endereço', {timeout: 30_000});
    await expect(aviso(page)).toContainText('"Rua Teste Bell, 151"');
    await expect(aviso(page)).not.toContainText('Compartilhe a planilha');
  });

  test('o apartamento que ficou de fora ainda é o último aviso, depois da rota', async ({page}) => {
    await compartilhar(page, {'4': comanda([], ['Rua Teste, 50, (Ed Teste ap 203)']), '6': comanda([], ['Rua Teste, 50, (Ed Teste ap 103)']), '3': ''});
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas?.length || 0), {timeout: 30_000}).toBe(1);
    await expect(aviso(page)).toHaveText('O endereço entrou sem o apartamento: as leituras deram ap 203 e ap 103. Confira no papel antes de entregar.', {timeout: 30_000});
  });
});
