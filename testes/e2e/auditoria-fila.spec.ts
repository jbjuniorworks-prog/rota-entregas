import type {Page} from '@playwright/test';
import {abrir, aba, aviso, base64url, carregar, clicarMapa, expect, lista, menu, montar, test, ROTA_A} from './apoio';

// Auditoria da fila do motorista, primeira rodada (20/10): o retrato de como é HOJE, defeitos
// incluídos, antes de decidir qualquer conserto. Cada teste afirma o comportamento atual; quando
// um conserto mudar esse comportamento, o teste muda junto, de propósito, com a decisão escrita.

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-0000000000b2';
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};

const fila = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-fila') || '[]') as {tipo: string; chave?: string}[]);
const seguradas = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-fila-seguradas') || '[]') as {ops: {tipo: string}[]}[]);

function sessaoDe(id: string) {
  const expira = Math.floor(Date.now() / 1000) + 86400;
  const user = {id, email: 'outro@exemplo.com', aud: 'authenticated', role: 'authenticated', app_metadata: {provider: 'email'}, user_metadata: {nome: 'Outro Motorista'}, created_at: new Date().toISOString()};
  const token = [base64url({alg: 'HS256', typ: 'JWT'}), base64url({sub: id, role: 'authenticated', aud: 'authenticated', exp: expira}), 'assinatura'].join('.');
  return {access_token: token, refresh_token: 'renovar-b', token_type: 'bearer', expires_in: 86400, expires_at: expira, user};
}

test('hoje: trocar de conta no aparelho manda o trabalho guardado do primeiro na sessão do segundo', async ({page, nuvem}) => {
  page.on('dialog', d => d.accept());
  nuvem.tabelas.perfis = [{id: B, nome: 'Outro Motorista', papel: 'motorista', ativo: true}];
  // sem sinal para gravar: o que A faz fica na fila do aparelho
  let semRede = true;
  await page.route('**/rest/v1/**', r => semRede && r.request().method() !== 'GET' && r.request().method() !== 'OPTIONS' ? r.abort() : r.fallback());
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  await page.locator('[data-item]').first().getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.9605, -37.0455);
  await expect.poll(async () => (await fila(page)).map(o => o.tipo)).toEqual(expect.arrayContaining(['rota', 'correcao']));
  const correcaoDeA = (await fila(page)).find(o => o.tipo === 'correcao')!.chave;

  // A sai: o aviso diz que o que não foi enviado fica no celular, e fica
  await menu(page, 'Sair');
  await expect(page.getByText('Entre com a conta que o responsável criou para você.')).toBeVisible();
  expect((await fila(page)).length).toBeGreaterThan(0);

  // B entra no mesmo aparelho, com sinal
  await page.route('**/auth/v1/token**', r => r.request().method() === 'OPTIONS'
    ? r.fulfill({status: 204, headers: CORS})
    : r.fulfill({status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(sessaoDe(B))}));
  semRede = false;
  await page.getByLabel('E-mail').fill('outro@exemplo.com');
  await page.getByLabel('Senha', {exact: true}).fill('senha-do-outro');
  await page.getByRole('button', {name: 'Entrar'}).click();

  // a fila de A sai inteira na sessão de B: a rota da planilha de A é criada como de B
  await expect.poll(() => nuvem.pedidos.filter(p => p.metodo === 'POST' && p.caminho === 'rotas').length, {timeout: 20_000}).toBe(1);
  const rota = nuvem.pedidos.find(p => p.metodo === 'POST' && p.caminho === 'rotas')!;
  expect(rota.quem).toBe(B);
  expect(rota.corpo).toMatchObject({at_id: 'ATTESTE0001'});
  expect(nuvem.pedidos.filter(p => p.caminho === 'pacotes' && p.metodo === 'POST').every(p => p.quem === B)).toBe(true);
  // e a correção do pino que A arrumou entra no nome de B
  await expect.poll(() => nuvem.pedidos.filter(p => p.metodo === 'POST' && p.caminho === 'correcoes').length).toBe(1);
  const correcao = nuvem.pedidos.find(p => p.metodo === 'POST' && p.caminho === 'correcoes')!;
  expect(correcao.quem).toBe(B);
  expect(correcao.corpo).toMatchObject({chave_lugar: correcaoDeA});
  // na sessão de A só saiu o próprio sair; nada do trabalho dele
  expect(nuvem.pedidos.filter(p => p.metodo !== 'GET' && p.quem === A).map(p => p.caminho)).toEqual(['logout']);
  // a rota de A continua na tela de B
  await expect(page.locator('#app')).toBeVisible();
  await expect.poll(async () => (await fila(page)).length).toBe(0);
});

test('hoje: com a memória do navegador cheia, a entrega aparece feita e some ao reabrir, sem aviso', async ({page}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
  await expect(page.locator('.resumo')).toContainText('0 de 10 entregas');
  // dali em diante nada mais cabe (a sessão fica de fora, para o login não cair junto)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.startsWith('rota-entregas') && k !== 'rota-entregas-auth') throw new DOMException('cheio', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  });
  await page.locator('.proxima').getByRole('button', {name: 'Entreguei', exact: true}).click();
  await expect(page.locator('.resumo')).toContainText('1 de 10 entregas');
  await expect(aviso(page)).toContainText('Entregue.');
  await expect(aviso(page)).not.toContainText(/grav|memória|espaço|cheio/i);
  // nem a entrega nem o envio dela ficaram no aparelho
  expect((await fila(page)).filter(o => o.tipo === 'entregue')).toEqual([]);
  await page.reload();
  await expect(page.locator('.resumo')).toContainText('0 de 10 entregas');
});

test.describe('o Entregue da Lista e o GPS', () => {
  test.use({permissions: ['geolocation']});

  async function entregarPelaLista(page: Page, precisao: number) {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    // antes de montar: a rota sai de onde ele está, e sem posição o app espera o GPS
    const parada = await page.evaluate(() => (JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {lat: number; lng: number}[]).find(p => p.lat != null)!);
    await page.context().setGeolocation({latitude: parada.lat, longitude: parada.lng, accuracy: precisao});
    await montar(page);
    await lista(page);
    await page.locator('[data-folha="lista"]').getByRole('button', {name: /^Entregue/}).first().click();
    await expect(page.locator('.resumo')).toContainText('1 de 10 entregas');
  }

  test('hoje: com o GPS a 80 m, entrega, não avisa nada do GPS, e a passagem é descartada', async ({page, nuvem}) => {
    await entregarPelaLista(page, 80);
    // o GPS responde na hora no teste; a passagem, se fosse guardada, já estaria segurada
    await page.waitForTimeout(1500);
    expect(await seguradas(page)).toEqual([]);
    await expect(aviso(page)).not.toContainText(/GPS|impreciso|localização/i);
    // a entrega vale: chega à nuvem como sempre
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'pacotes' && p.metodo === 'PATCH' && p.busca.includes('rota_id')).length).toBe(1);
  });

  test('controle: com o GPS a 6 m, o mesmo toque segura a passagem para depois do prazo de desfazer', async ({page}) => {
    await entregarPelaLista(page, 6);
    await expect.poll(async () => (await seguradas(page)).flatMap(s => s.ops.map(o => o.tipo))).toContain('observacao');
  });
});
