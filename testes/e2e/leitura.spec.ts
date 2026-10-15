import {test, expect, abrir, aviso, colar} from './apoio';

// 15/10: cartões iguais na mesma porta são entregas diferentes (a Augusto Franco 2000 de 07/10 tinha
// cinco cartões e saíam dois). Colar o mesmo endereço duas vezes é engano, e uma lista em texto
// também. Só o repetido que a leitura da imagem viu vira uma parada por cartão. Leitor falso, que
// devolve um texto por leitura; endereços inventados.
test('cartões iguais lidos do print viram uma parada cada, ler de novo não dobra, e repetido colado ou em .txt é um só', async ({page}, info) => {
  await page.addInitScript(() => {
    const porLeitura: Record<string, string> = {
      '4': 'Avenida Teste Inventada 2000\nAvenida Teste Inventada 2000\nRua Teste Outra 15',
      '6': 'Avenida Teste Inventada 2000\nRua Teste Outra 15',
      '3': '',
    };
    (window as any).Tesseract = {createWorker: async () => {
      let psm = '3';
      return {
        setParameters: async (p: any) => { psm = p.tessedit_pageseg_mode; },
        recognize: async () => ({data: {text: porLeitura[psm], blocks: null}}),
        terminate: async () => {},
      };
    }};
    // O aviso do "Adicionar" é trocado na hora pelo da busca no mapa: guarda todos os que passaram.
    const avisos: string[] = (window as any).__avisos = [];
    new MutationObserver(() => {
      const t = document.getElementById('status')?.textContent || '';
      if (t && t !== avisos[avisos.length - 1]) avisos.push(t);
    }).observe(document, {subtree: true, childList: true, characterData: true});
  });
  const print = info.outputPath('print.png');
  await page.setContent('<body style="margin:0;background:#fff;font:600 30px system-ui;padding:24px">print</body>');
  await page.screenshot({path: print});
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Cidade Teste');
  const ler = async (arquivo: string | {name: string; mimeType: string; buffer: Buffer}) => {
    await colar(page);
    await page.locator('#arquivo').setInputFiles(arquivo);
    await expect(aviso(page)).toContainText(/lido\(s\)/, {timeout: 30_000});
    return (await page.locator('#lista').inputValue()).split('\n').filter(Boolean);
  };
  // O aviso sai do mesmo toque que acrescenta, e a tela com o total é desenhada junto com ele.
  const adicionar = async (esperado: string) => {
    await page.getByRole('button', {name: /^Adicionar em/}).click();
    await expect.poll(() => page.evaluate(e => (window as any).__avisos.some((a: string) => a.includes(e)), esperado)).toBe(true);
    return Number((await page.locator('.resumo b').innerText()).match(/^(\d+) entrega/)![1]);
  };

  expect(await ler(print)).toEqual(['Avenida Teste Inventada 2000', 'Avenida Teste Inventada 2000', 'Rua Teste Outra 15']);
  expect(await adicionar('3 adicionada(s).'), 'dois cartões na leitura, duas paradas').toBe(3);

  await ler(print);
  expect(await adicionar('0 adicionada(s), 3 repetida(s) ignorada(s).'), 'a mesma leitura de novo não acrescenta').toBe(3);

  await colar(page);
  await page.getByLabel(/Endereços da área/).fill('Rua Teste Colada 30\nRua Teste Colada 30');
  expect(await adicionar('1 adicionada(s), 1 repetida(s) ignorada(s).'), 'colado duas vezes é engano').toBe(4);

  expect(await ler({name: 'lista.txt', mimeType: 'text/plain', buffer: Buffer.from('Rua Teste Texto 40\nRua Teste Texto 40\n')}),
    'lista em texto também não multiplica').toEqual(['Rua Teste Texto 40']);
  expect(await adicionar('1 adicionada(s).')).toBe(5);
});
