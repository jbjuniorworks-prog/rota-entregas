import {writeFileSync} from 'node:fs';
import {abrir, aviso, expect, test} from './apoio';

// O leitor de texto baixa a biblioteca e o modelo de português de CDN. Na rua, com sinal ruim,
// isso decide se a gravação da lista vira rota ou não vira nada.
test.use({serviceWorkers: 'allow'});
test.setTimeout(10 * 60_000);

const LISTA = `<body style="margin:0;background:#fff;font:600 30px system-ui;padding:24px">
  <div style="margin:18px 0">Rua Laranjeiras 100</div>
  <div style="margin:18px 0">Avenida Hermes Fontes 250</div>
  <div style="margin:18px 0">Travessa Dois Irmaos 44</div>
</body>`;

test('@leitor a gravação da lista ainda é lida quando o sinal cai', async ({page, context}, info) => {
  const print = info.outputPath('lista.png');
  await page.setContent(LISTA);
  await page.screenshot({path: print, fullPage: true});

  await abrir(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 30_000});

  // primeira leitura, com sinal: é aqui que o leitor e o modelo deveriam ficar guardados
  await page.locator('input[type=file]').setInputFiles(print);
  await expect(aviso(page)).toContainText(/endereço\(s\) lido\(s\)/, {timeout: 5 * 60_000});
  const comSinal = (await page.locator('#lista').inputValue()).split('\n').filter(Boolean);
  expect(comSinal.length, 'com sinal o leitor tem de achar os endereços').toBeGreaterThan(0);

  // agora sem sinal nenhum, como na rua
  await page.reload();
  await abrir(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 30_000});
  await context.setOffline(true);
  await page.locator('input[type=file]').setInputFiles(print);
  await expect(aviso(page)).toContainText(/endereço\(s\) lido\(s\)|Não achei|Não consegui/, {timeout: 5 * 60_000});
  const semSinal = (await page.locator('#lista').inputValue()).split('\n').filter(Boolean);
  console.log(`\n  COM sinal: ${comSinal.length} endereços -> ${comSinal.join(' | ')}`);
  console.log(`  SEM sinal: ${semSinal.length} endereços -> ${semSinal.join(' | ')}`);
  console.log(`  aviso na tela: ${await aviso(page).innerText()}`);
});

test('@leitor sem sinal e sem nunca ter lido antes, o app diz o que houve', async ({page, context}, info) => {
  const print = info.outputPath('lista2.png');
  await page.setContent(LISTA);
  await page.screenshot({path: print, fullPage: true});

  await abrir(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 30_000});
  // nada do leitor foi baixado ainda nesta instalação
  await context.setOffline(true);
  await page.locator('input[type=file]').setInputFiles(print);
  await expect(aviso(page)).toContainText(/endereço\(s\) lido\(s\)|Não achei|Não consegui/, {timeout: 3 * 60_000});
  const lidos = (await page.locator('#lista').inputValue()).split('\n').filter(Boolean);
  console.log(`\n  PRIMEIRA vez sem sinal: ${lidos.length} endereços`);
  console.log(`  aviso na tela: ${await aviso(page).innerText()}`);
});

test('@leitor uma parte ruim não leva embora as que já foram lidas', async ({page}, info) => {
  const bons = [];
  for (const [i, texto] of ['Rua Laranjeiras 100', 'Avenida Hermes Fontes 250'].entries()) {
    const caminho = info.outputPath(`bom${i}.png`);
    await page.setContent(`<body style="margin:0;background:#fff;font:600 30px system-ui;padding:24px">${texto}</body>`);
    await page.screenshot({path: caminho, fullPage: true});
    bons.push(caminho);
  }
  // no meio, um arquivo que se diz imagem mas não abre
  const ruim = info.outputPath('quebrado.png');
  writeFileSync(ruim, Buffer.from('isto nao e uma imagem'));

  await abrir(page);
  await page.locator('input[type=file]').setInputFiles([bons[0], ruim, bons[1]]);
  await expect(aviso(page)).toContainText(/endereço\(s\) lido\(s\)|Não consegui|Não achei/, {timeout: 5 * 60_000});
  const lidos = (await page.locator('#lista').inputValue()).split('\n').filter(Boolean);
  console.log(`\n  com um arquivo quebrado no meio: ${lidos.length} endereços -> ${lidos.join(' | ')}`);
  console.log(`  aviso: ${await aviso(page).innerText()}`);
  expect(lidos.length, 'os dois bons têm de sobreviver ao quebrado').toBe(2);
});
