import type {Page} from '@playwright/test';
import {abrir, aviso, carregar, expect, lista, montar, test} from './apoio';

// Pedro e Luan, 26/10: "Rodovia Ecologista Chico Mendes, 67" para clientes diferentes, a mercearia
// e o condomínio a 1,4 km um do outro, e o app juntava tudo numa parada, sem deixar marcar cada um
// no lugar certo. A planilha de teste é a mesma rodovia com nomes inventados (rota-e).
const ROTA_E = 'testes/planilhas/rota-e.xlsx';
const CONDOMINIO = {latitude: -10.9626, longitude: -37.05};
const MERCEARIA = {latitude: -10.948, longitude: -37.05};
const DO_CONDOMINIO = /\|por tras do condominio portal teste$/;

const paradas = (page: Page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {id: string; texto: string; lat: number; lng: number; entregue: boolean; precisao: string; pacotes: string[]; separada?: boolean}[]));
const porLinha = (page: Page) => page.locator('[data-folha="proxima"] [data-acao="aqui-uma"]');

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
    // a separação fica gravada: reaberto, o app continua com as quatro, cada uma com o seu botão
    await page.reload();
    await expect(page.locator('.resumo')).toContainText('0 de 5 entregas');
    await expect(porLinha(page)).toHaveCount(4);
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

    // reaberto, a entregue continua com o texto, o pacote, a entrega e a porta dela; as outras, separadas
    await page.reload();
    await expect(page.locator('.resumo')).toContainText('1 de 5 entregas');
    const depois = await paradas(page);
    expect(depois.find(p => p.texto.includes('condomínio'))).toMatchObject({entregue: true, pacotes: ['BRTESTE0002'], lat: expect.closeTo(CONDOMINIO.latitude, 4)});
    expect(depois.filter(p => p.texto.includes('Rodovia') && !p.entregue).map(p => [p.pacotes, p.separada]))
      .toEqual([[['BRTESTE0001'], true], [['BRTESTE0003'], true], [['BRTESTE0004'], true]]);
    await lista(page);
    const feitas = page.locator('[data-folha="lista"] details.feitas');
    await expect(feitas.locator('summary')).toHaveText('1 entregue(s)');
    await feitas.locator('summary').click();
    await expect(feitas.locator('.parada.feito')).toHaveCount(1);
    await expect(feitas.locator('.parada.feito')).toContainText('Por trás do condomínio Portal Teste');
  });

  // Sem sinal, a consulta às portas da nuvem não roda, e é só o separar que grava: com rede, ela
  // gravava de novo logo depois e escondia a falta.
  test('separada sem sinal continua separada quando o app reabre', async ({page, context}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_E);
    await montar(page);
    await context.setOffline(true);
    await page.locator('[data-folha="proxima"]').getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    await expect(page.locator('.resumo')).toContainText('0 de 5 entregas');
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator('.resumo')).toContainText('0 de 5 entregas');
    await expect(porLinha(page)).toHaveCount(4);
  });

  test('desfazer junta de novo antes de entregar; depois de uma entrega, desfaz só a entrega', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_E);
    await montar(page);
    const proxima = page.locator('[data-folha="proxima"]');
    await proxima.getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    await expect(page.locator('.resumo')).toContainText('0 de 5 entregas');
    await aviso(page).getByRole('button', {name: 'Desfazer'}).click();
    await expect(page.locator('.resumo')).toContainText('0 de 2 entregas');
    await expect(proxima.getByRole('button', {name: 'Separar os 4 pacotes'})).toBeVisible();
    expect((await paradas(page)).map(p => p.pacotes.length)).toEqual([4, 1]);

    // separada de novo e com uma entregue, o Desfazer da tela é o da entrega: as quatro continuam
    await proxima.getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    await proxima.locator('.sub-entrega', {hasText: 'Sem complemento'}).locator('[data-acao="entregue-uma"]').click();
    await expect(page.locator('.resumo')).toContainText('1 de 5 entregas');
    await aviso(page).getByRole('button', {name: 'Desfazer'}).click();
    await expect(page.locator('.resumo')).toContainText('0 de 5 entregas');
    expect(await paradas(page)).toHaveLength(5);
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

  // O print do dono, 26/10: a porta geral do "67" estava verificada, as separadas herdaram o
  // "verificado", e o app escondia delas o Arrumar e o Entreguei aqui. Só sobrava o ✓.
  test('com a porta geral verificada, a separada com complemento ainda se arruma e se entrega na porta', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    // a nuvem conhece só a porta geral do "67": a chave da rua, sem complemento
    nuvem.rpc.posicoes = (corpo: {chaves: string[]}) => corpo.chaves.filter(k => k.startsWith('r|') && k.split('|').length === 5).map(chave_lugar =>
      ({chave_lugar, lat: -10.9501, lng: -37.0501, situacao: 'confirmado', motoristas: 2, entregas: 2, fonte: 'entrega', minha: false}));
    await abrir(page);
    await carregar(page, ROTA_E);
    await montar(page);
    const proxima = page.locator('[data-folha="proxima"]');
    await expect(proxima.getByText('Endereço verificado')).toBeVisible();
    await proxima.getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    // as três com complemento; a sem complemento é a porta geral, e continua verificada
    await expect(porLinha(page)).toHaveCount(3);
    await proxima.locator('[data-acao="ver-uma"]', {hasText: 'condomínio'}).click();
    const pino = page.locator('[data-folha="pino"]');
    await expect(pino).toContainText('Por trás do condomínio Portal Teste');
    await expect(pino.getByRole('button', {name: 'Arrumar o pino'})).toBeVisible();
  });

  test('as separadas no mesmo ponto abrem em leque no mapa, cada uma com o seu pino', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_E);
    await montar(page);
    const antes = (await paradas(page))[0];
    await page.locator('[data-folha="proxima"]').getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    const separadas = (await paradas(page)).filter(p => p.separada);
    expect(separadas).toHaveLength(4);
    // o leque é só desenho: a posição gravada de cada uma é a de antes
    for (const p of separadas) expect([p.lat, p.lng]).toEqual([antes.lat, antes.lng]);
    const ids = separadas.map(p => p.id);
    const centros: {x: number; y: number}[] = [];
    for (const id of ids) {
      const caixa = await page.locator(`.pino[data-ids="${id}"]`).boundingBox();
      expect(caixa).not.toBeNull();
      centros.push({x: caixa!.x + caixa!.width / 2, y: caixa!.y + caixa!.height / 2});
    }
    for (let i = 0; i < centros.length; i++) for (let j = i + 1; j < centros.length; j++) {
      expect(Math.hypot(centros[i].x - centros[j].x, centros[i].y - centros[j].y)).toBeGreaterThan(20);
    }
    // o pino de uma abre o cartão só dela
    await page.getByRole('button', {name: 'Minimizar'}).click();
    const doCondominio = separadas.find(p => p.texto.includes('condomínio'))!;
    await page.locator(`.pino[data-ids="${doCondominio.id}"]`).click();
    const cartao = page.locator('[data-folha="pino"]');
    await expect(cartao.locator('.titulo')).toHaveText('Neste pino');
    await expect(cartao).toContainText('Por trás do condomínio Portal Teste');
    await expect(cartao.getByRole('button', {name: 'Arrumar o pino'})).toBeVisible();
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
