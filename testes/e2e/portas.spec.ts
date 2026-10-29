import type {Page} from '@playwright/test';
import {abrir, carregar, expect, lista, montar, test} from './apoio';

// "Esses dois pinos não verificaram por quê?" (o Luan sempre pergunta ao dono, 29/10): a resposta
// do Admin, no celular dele, para as entregas dele. Planilha de teste rota-f: um número com três
// entregas e uma rua a mais.
const ROTA_F = 'testes/planilhas/rota-f.xlsx';
const EU = '00000000-0000-4000-8000-000000000001';
const paradas = (page: Page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {texto: string; lat: number; lng: number; entregue: boolean}[]));

test.describe('por que o pino não verificou, no celular', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('no fim da rota e na lista de entregues, com o motivo de cada endereço', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_F);
    await montar(page);
    const proxima = page.locator('[data-folha="proxima"]');
    await proxima.locator('[data-acao="entregue"]').first().click();
    await expect(page.locator('.resumo')).toContainText('3 de 4 entregas');
    await proxima.locator('[data-acao="entregue"]').first().click();
    const fim = page.locator('[data-folha="fim"]');
    await expect(fim).toContainText('Todas as entregas da rota foram feitas!');

    // a nuvem: o número das três verificado; a rua a mais com a entrega a 200 m do pino
    const outra = (await paradas(page)).find(p => p.texto.startsWith('Rua Outra Teste'))!;
    let perguntou: string[] = [];
    nuvem.rpc.posicoes = (corpo: {chaves: string[]}) => {
      perguntou = corpo.chaves;
      // a sugestão não é porta verificada
      return corpo.chaves.map(chave_lugar => ({chave_lugar, lat: -10.96, lng: -37.06, situacao: chave_lugar.endsWith('|101') ? 'confirmado' : 'sugestao', motoristas: 1, minha: false}));
    };
    nuvem.tabelas.observacoes = [{id: 1, motorista_id: EU, chave_lugar: '49098233|20', lat: outra.lat + 200 / 111320, lng: outra.lng,
      criado_em: new Date(Date.now() - 3600_000).toISOString(), no_pino: false, pendente: false, recusada: false}];
    await fim.getByRole('button', {name: 'Por que algum pino não verificou?'}).click();
    const portas = fim.locator('[data-portas]');
    await expect(portas).toContainText('1 de 2 endereço(s) entregue(s) com a porta verificada.');
    await expect(portas.locator('[data-motivo="longe"]')).toContainText('Entregues longe do pino (1)');
    // falando com ele, não com o dono
    await expect(portas.locator('[data-motivo="longe"]')).toContainText('Você tocou em "Entreguei"');
    await expect(portas.locator('[data-motivo="longe"]')).toContainText('Rua Outra Teste, 20');
    await expect(portas.locator('[data-motivo="longe"]')).toContainText('a 200 m do pino');
    // perguntou só pelas portas das entregas feitas, e só pelas marcas dele
    expect(perguntou.sort()).toEqual(['49098232|101', '49098233|20']);
    const marcas = nuvem.pedidos.filter(p => p.caminho === 'observacoes' && p.metodo === 'GET').map(p => new URLSearchParams(p.busca).get('motorista_id'));
    expect(marcas).toEqual([`eq.${EU}`]);

    // a mesma pergunta na lista, no "entregue(s)"
    await lista(page);
    const feitas = page.locator('[data-folha="lista"] details.feitas');
    await feitas.locator('summary').click();
    await feitas.getByRole('button', {name: 'Por que algum pino não verificou?'}).click();
    await expect(feitas.locator('[data-portas] [data-motivo="longe"]')).toContainText('a 200 m do pino');
  });

  test('sem sinal, diz que precisa de sinal e deixa tentar de novo', async ({page, context}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_F);
    await montar(page);
    await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
    await lista(page);
    const feitas = page.locator('[data-folha="lista"] details.feitas');
    await feitas.locator('summary').click();
    await context.setOffline(true);
    await feitas.getByRole('button', {name: 'Por que algum pino não verificou?'}).click();
    await expect(feitas).toContainText('Não consegui ver as portas: sem sinal agora.');
    await context.setOffline(false);
    await feitas.getByRole('button', {name: 'Tentar de novo'}).click();
    await expect(feitas.locator('[data-portas]')).toContainText('endereço(s) entregue(s) com a porta verificada');
  });
});
