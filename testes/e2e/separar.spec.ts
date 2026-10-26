import type {Page} from '@playwright/test';
import {abrir, aviso, carregar, expect, montar, test} from './apoio';

// Pedro e Luan, 26/10: "Rodovia Ecologista Chico Mendes, 67" para clientes diferentes, a mercearia
// e o condomínio a 1,4 km um do outro, e o app juntava tudo numa parada, sem deixar marcar cada um
// no lugar certo. A planilha de teste é a mesma rodovia com nomes inventados (rota-e).
const ROTA_E = 'testes/planilhas/rota-e.xlsx';
const CONDOMINIO = {latitude: -10.9626, longitude: -37.05};
const MERCEARIA = {latitude: -10.948, longitude: -37.05};
const DO_CONDOMINIO = /\|por tras do condominio portal teste$/;

const paradas = (page: Page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {texto: string; lat: number; entregue: boolean; precisao: string}[]));

test.describe('separar os pacotes de uma parada', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: {latitude: -10.95, longitude: -37.05, accuracy: 8}});

  test('cada pacote vira uma entrega, e a porta de uma não leva as outras', async ({page, context, nuvem}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_E);
    await montar(page);
    const proxima = page.locator('[data-folha="proxima"]');
    await expect(proxima.getByText('Os 4 pacotes desta parada')).toBeVisible();
    await proxima.getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    await expect(page.locator('.resumo')).toContainText('0 de 5 entregas');
    const doCondominio = proxima.locator('.sub-entrega', {hasText: 'condomínio'});
    await expect(doCondominio).toBeVisible();

    // na porta do condomínio, 1,4 km dali
    await context.setGeolocation({...CONDOMINIO, accuracy: 6});
    await page.waitForTimeout(5500);
    await doCondominio.getByRole('button', {name: 'Entreguei aqui'}).click();
    await expect(page.locator('.resumo')).toContainText('1 de 5 entregas');
    await expect.poll(async () => (await paradas(page)).find(p => p.texto.includes('condomínio'))!.lat).toBeCloseTo(CONDOMINIO.latitude, 4);
    // só ela foi entregue e saiu do lugar
    const outras = (await paradas(page)).filter(p => p.texto.includes('Rodovia') && !p.texto.includes('condomínio'));
    expect(outras).toHaveLength(3);
    for (const p of outras) expect(p).toMatchObject({entregue: false, lat: expect.closeTo(-10.95, 4)});
    // e a porta vai para a nuvem com o complemento: a da mercearia continua livre
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'POST').map(p => (p.corpo as {chave_lugar: string}).chave_lugar))
      .toEqual([expect.stringMatching(DO_CONDOMINIO)]);
  });

  // A pergunta de levar as outras do mesmo endereço junto desfazia a separação: separada, só vai
  // junto a de mesmo complemento ("Na mercearia" é a mesma mercearia).
  test('arrumar a porta de uma separada leva junto só a de mesmo complemento', async ({page, context}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_E);
    await montar(page);
    await page.locator('[data-folha="proxima"]').getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    await context.setGeolocation({...MERCEARIA, accuracy: 6});
    await page.waitForTimeout(5500);
    await page.getByRole('button', {name: 'Pino errado? Estou aqui'}).click();
    const naMercearia = async () => (await paradas(page)).filter(p => Math.abs(p.lat - MERCEARIA.latitude) < 1e-4).map(p => p.texto.split(',')[2].trim());
    await expect.poll(naMercearia).toEqual(['Mercearia Nova Opção Teste', 'Na mercearia nova opção teste']);
  });

  test('a porta que alguém já marcou para o complemento chega quando separa', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    nuvem.rpc.posicoes = (corpo: {chaves: string[]}) => corpo.chaves.filter(k => DO_CONDOMINIO.test(k)).map(chave_lugar =>
      ({chave_lugar, lat: CONDOMINIO.latitude, lng: CONDOMINIO.longitude, situacao: 'confirmado', motoristas: 2, entregas: 2, fonte: 'entrega', minha: false}));
    await abrir(page);
    await carregar(page, ROTA_E);
    await montar(page);
    await page.locator('[data-folha="proxima"]').getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    await expect(aviso(page)).toContainText('1 já foi para a porta guardada do complemento');
    const todas = await paradas(page);
    expect(todas.find(p => p.texto.includes('condomínio'))).toMatchObject({precisao: 'confirmado', lat: CONDOMINIO.latitude});
    for (const p of todas.filter(p => p.texto.includes('Rodovia') && !p.texto.includes('condomínio'))) expect(p.lat).toBeCloseTo(-10.95, 4);
  });
});
