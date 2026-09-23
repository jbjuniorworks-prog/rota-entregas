import {abrir, aba, expect, test} from './apoio';

// Sem nenhum serviço de fora, que é a condição da rua. A pergunta: o app descreve o estado da
// rede, ou culpa quem digitou? (a fixture já aborta nominatim, viacep, osrm e os tiles)
test('@rede o que a tela diz quando nada de fora responde', async ({page}) => {
  await abrir(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Lúcio Mota 114\nAvenida Hermes Fontes 250');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect(page.locator('#status')).not.toContainText('Buscando endereços', {timeout: 90_000});
  await page.waitForTimeout(2000);

  console.log('\n--- aba Endereços ---');
  await aba(page, '1. Endereços');
  for (const t of await page.locator('.info, .aviso').allInnerTexts()) console.log('   ' + t.replace(/\s+/g, ' ').slice(0, 150));

  console.log('\n--- aba Conferir ---');
  await aba(page, '2. Conferir');
  for (const t of await page.locator('.info, .aviso, .tag, .achado').allInnerTexts()) console.log('   ' + t.replace(/\s+/g, ' ').slice(0, 150));

  console.log('\n--- barra de status ---');
  console.log('   ' + (await page.locator('#status').innerText()).replace(/\s+/g, ' '));
});
