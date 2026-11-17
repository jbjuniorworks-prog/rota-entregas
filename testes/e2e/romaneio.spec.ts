import type {Page} from '@playwright/test';
import * as XLSX from 'xlsx';
import {abrir, menu, test, expect} from './apoio';

// O romaneio do galpão (dono, 16/11): uma linha por pacote, com o bairro e a gaiola. Inventado, com
// bairros de verdade do censo: a B-7 é da Farolândia e do Inácio Barbosa (a 2 km), a D-2 é de Santos
// Dumont, a uns 7 a 9 km das duas.
const linhas = (gaiola: string, bairro: string, n: number) => Array.from({length: n}, () => [bairro, gaiola]);
const ROMANEIO = [
  ['Neighborhood', 'Corridor Cage'],
  ...linhas('B-7', 'Farolândia', 40),
  ...linhas('B-7', 'Inácio Barbosa', 20),
  // vizinha, a 2 km: é da rota
  ...linhas('B-7', 'Atalaia', 1),
  // longe: parece fora de rota
  ...linhas('B-7', 'Santos Dumont', 1),
  // o censo não sabe onde fica
  ...linhas('B-7', 'Bairro Que Nao Existe', 1),
  ...linhas('D-2', 'Santos Dumont', 50),
  ...linhas('D-2', 'Farolândia', 2),
];
const NA_B7 = 'B-7: 1 pacote(s) de Santos Dumont, a 7 km da área da gaiola. Esse bairro vai na gaiola D-2.';
const NA_D2 = 'D-2: 2 pacote(s) de Farolândia, a 9 km da área da gaiola. Esse bairro vai na gaiola B-7.';

const planilha = (dados: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), 'Página1');
  return {name: 'romaneio.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'}) as Buffer};
};

async function lerRomaneio(page: Page, dados: unknown[][] = ROMANEIO) {
  await abrir(page);
  await menu(page, 'Conferir romaneio');
  await expect(page.locator('.cabecalho .titulo')).toHaveText('Conferir romaneio');
  await page.locator('#romaneio').setInputFiles(planilha(dados));
}

test.describe('conferir o romaneio na hora de pegar a rota', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['clipboard-read', 'clipboard-write']});

  test('o galpão inteiro: os pacotes longe do bairro, e o que ficou sem conferir', async ({page}) => {
    await lerRomaneio(page);
    const tela = page.locator('[data-romaneio]');
    await expect(tela.locator('[data-resumo]')).toContainText('3 pacote(s) parecem fora de rota, em 2 gaiola(s). O romaneio tem 115 pacotes em 2 gaiolas.', {timeout: 30_000});
    await expect(tela.locator('[data-resumo]')).toContainText('1 ficou sem conferir');
    // a Atalaia, vizinha, não aparece
    await expect(tela.locator('[data-suspeito="galpao"]')).toHaveText([NA_B7, NA_D2]);
  });

  test('a sua gaiola: os de fora nela e os da sua área em outras; fica guardada no celular', async ({page}) => {
    await lerRomaneio(page);
    const tela = page.locator('[data-romaneio]');
    await expect(tela.locator('[data-resumo]')).toBeVisible({timeout: 30_000});
    await page.locator('#gaiola').fill('b-7');
    await expect(tela.getByRole('heading', {name: 'Na sua gaiola (B-7)'})).toBeVisible();
    await expect(tela.locator('[data-suspeito="na-gaiola"]')).toHaveText([NA_B7]);
    await expect(tela.locator('[data-suspeito="em-outras"]')).toHaveText([NA_D2]);

    // no dia seguinte, a tela abre na mesma gaiola
    await page.reload();
    await lerRomaneio(page);
    await expect(page.locator('#gaiola')).toHaveValue('B-7');
    await expect(page.locator('[data-suspeito="na-gaiola"]')).toHaveText([NA_B7], {timeout: 30_000});
  });

  test('a gaiola que não está no romaneio diz isso', async ({page}) => {
    await lerRomaneio(page);
    await expect(page.locator('[data-resumo]')).toBeVisible({timeout: 30_000});
    await page.locator('#gaiola').fill('Z-9');
    await expect(page.locator('[data-sem-gaiola]')).toHaveText('A gaiola Z-9 não está neste romaneio.');
    await expect(page.locator('[data-suspeito="na-gaiola"]')).toHaveCount(0);
  });

  test('copiar para os analistas leva a lista inteira; o da gaiola, só os dela', async ({page}) => {
    await lerRomaneio(page, [...ROMANEIO, ...linhas('E-1', 'Atalaia', 30), ...linhas('E-1', 'Santos Dumont', 1)]);
    await expect(page.locator('[data-resumo]')).toBeVisible({timeout: 30_000});
    const copiado = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    const NA_E1 = 'E-1: 1 pacote(s) de Santos Dumont, a 11 km da área da gaiola. Esse bairro vai na gaiola D-2.';

    await page.getByRole('button', {name: 'Copiar a lista para os analistas'}).click();
    await expect(page.locator('#status')).toContainText('Lista copiada');
    expect(await copiado()).toBe(['Romaneio: 4 pacote(s) parecem fora de rota, pelo bairro. Para conferir:', NA_B7, NA_D2, NA_E1].join('\n'));

    // a E-1 não toca a B-7: fica de fora do texto da gaiola
    await page.locator('#gaiola').fill('B-7');
    await page.getByRole('button', {name: 'Copiar só os da sua gaiola'}).click();
    await expect.poll(copiado).toBe(['Romaneio: 3 pacote(s) parecem fora de rota, pelo bairro. Para conferir:', NA_B7, NA_D2].join('\n'));

    // com a gaiola digitada, o botão do galpão continua levando o galpão inteiro
    await page.getByRole('button', {name: 'Copiar a lista para os analistas'}).click();
    await expect.poll(copiado).toBe(['Romaneio: 4 pacote(s) parecem fora de rota, pelo bairro. Para conferir:', NA_B7, NA_D2, NA_E1].join('\n'));
  });

  test('sem o censo de uma das cidades, diz isso em vez de calar os bairros dela', async ({page}) => {
    // de madrugada no galpão, sem sinal e com o censo ainda não guardado no celular
    await page.route('**/barra-dos-coqueiros-v1.bin', r => r.abort());
    await lerRomaneio(page);
    await expect(page.locator('[data-erro]')).toHaveText('Não consegui conferir: não baixou o censo do IBGE. Tente de novo com internet.', {timeout: 30_000});
    await expect(page.locator('[data-resumo]')).toHaveCount(0);
  });

  test('a planilha da rota não é romaneio: diz o que falta', async ({page}) => {
    await lerRomaneio(page, [['Sequence', 'Destination Address', 'Bairro', 'Cidade'], ['1', 'Rua Inventada, 10', 'Farolândia', 'Aracaju']]);
    await expect(page.locator('[data-erro]')).toHaveText('Não consegui conferir: não achei as colunas de bairro e de gaiola.', {timeout: 30_000});
  });
});
