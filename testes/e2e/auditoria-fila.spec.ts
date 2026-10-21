import type {Page} from '@playwright/test';
import {abrir, aba, aviso, base64url, carregar, clicarMapa, colar, expect, lista, menu, montar, test, ROTA_A} from './apoio';

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

// Decidido em 20/10 (auditoria da fila): cada conta tem o seu dia no aparelho. Era "hoje: trocar de
// conta manda o trabalho guardado do primeiro na sessão do segundo": a rota da planilha de A era
// criada como de B, e a correção de pino de A entrava no nome de B.
async function entrarComo(page: Page, quem: string) {
  await page.getByLabel('E-mail').fill(quem === B ? 'outro@exemplo.com' : 'teste@exemplo.com');
  await page.getByLabel('Senha', {exact: true}).fill('senha');
  await page.getByRole('button', {name: 'Entrar'}).click();
  await expect(page.locator('#app')).toBeVisible();
}

test('trocar de conta: B não vê nem manda nada de A, e quando A volta o dia e a fila dele saem na sessão dele', async ({page, nuvem}) => {
  const perguntas: string[] = [];
  page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
  nuvem.tabelas.perfis = [{id: B, nome: 'Outro Motorista', papel: 'motorista', ativo: true}];
  let quemEntra = B;
  await page.route('**/auth/v1/token**', r => r.request().method() === 'OPTIONS'
    ? r.fulfill({status: 204, headers: CORS})
    : r.fulfill({status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(sessaoDe(quemEntra))}));
  // sem sinal para gravar: o que A faz fica no aparelho
  let semRede = true;
  await page.route('**/rest/v1/**', r => semRede && r.request().method() !== 'GET' && r.request().method() !== 'OPTIONS' ? r.abort() : r.fallback());
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  await page.locator('[data-item]').first().getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, -10.9605, -37.0455);
  await expect.poll(async () => (await fila(page)).map(o => o.tipo)).toEqual(expect.arrayContaining(['rota', 'correcao']));
  const correcaoDeA = (await fila(page)).find(o => o.tipo === 'correcao')!.chave;
  const paradasDeA = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.length);

  // A sai: o aviso diz quantos envios ficam e quando saem; e sai só deste aparelho
  await menu(page, 'Sair');
  await expect(page.getByText('Entre com a conta que o responsável criou para você.')).toBeVisible();
  expect(perguntas.at(-1)).toMatch(/Ainda há \d+ envio\(s\) para a nuvem\. Eles ficam guardados neste celular e saem quando você entrar de novo\./);
  expect(nuvem.pedidos.find(p => p.caminho === 'logout')!.busca).toContain('scope=local');

  // B entra no mesmo aparelho, com sinal: começa limpo, e nada de A sai
  semRede = false;
  await entrarComo(page, B);
  await page.waitForTimeout(3000);
  const escritas = (quem: string) => nuvem.pedidos.filter(p => p.metodo !== 'GET' && p.quem === quem && ['rotas', 'pacotes', 'correcoes', 'buscas_de_lista'].includes(p.caminho));
  expect(escritas(B)).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{"paradas":[]}').paradas.length)).toBe(0);
  expect(await fila(page)).toEqual([]);

  // B sai, A volta: o dia de A está como ele deixou, e a fila dele sai na sessão dele
  await menu(page, 'Sair');
  quemEntra = A;
  await entrarComo(page, A);
  await expect.poll(() => escritas(A).filter(p => p.caminho === 'rotas').length, {timeout: 20_000}).toBe(1);
  expect(escritas(A).find(p => p.caminho === 'rotas')!.corpo).toMatchObject({at_id: 'ATTESTE0001'});
  await expect.poll(() => escritas(A).filter(p => p.caminho === 'correcoes').length).toBe(1);
  expect(escritas(A).find(p => p.caminho === 'correcoes')!.corpo).toMatchObject({chave_lugar: correcaoDeA});
  expect(escritas(B)).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.length)).toBe(paradasDeA);
});

// A janela entre a sessão de B ficar pronta e o dia trocar de dono: o perfil dele demora, e o envio
// automático (de minuto em minuto, ou a rede voltando) corre no meio.
test('no meio da entrada de B, o envio automático não manda nada de A', async ({page, nuvem}) => {
  page.on('dialog', d => d.accept());
  nuvem.tabelas.perfis = [{id: B, nome: 'Outro Motorista', papel: 'motorista', ativo: true}];
  await page.route('**/auth/v1/token**', r => r.request().method() === 'OPTIONS'
    ? r.fulfill({status: 204, headers: CORS})
    : r.fulfill({status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(sessaoDe(B))}));
  let semRede = true, perfilDeB: () => void = () => {};
  const segura = new Promise<void>(ok => { perfilDeB = ok; });
  await page.route('**/rest/v1/**', async r => {
    if (semRede && r.request().method() !== 'GET' && r.request().method() !== 'OPTIONS') return r.abort();
    if (r.request().url().includes('/perfis') && r.request().url().includes(B)) await segura;
    return r.fallback();
  });
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect.poll(async () => (await fila(page)).map(o => o.tipo)).toContain('rota');
  await menu(page, 'Sair');
  semRede = false;
  await page.getByLabel('E-mail').fill('outro@exemplo.com');
  await page.getByLabel('Senha', {exact: true}).fill('senha');
  await page.getByRole('button', {name: 'Entrar'}).click();
  // a sessão de B já existe, o perfil dele ainda não chegou: a rede "volta" e o envio corre
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(2000);
  perfilDeB();
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForTimeout(2000);
  expect(nuvem.pedidos.filter(p => p.metodo !== 'GET' && ['rotas', 'pacotes', 'correcoes'].includes(p.caminho))).toEqual([]);
});

test('a telemetria de A também espera A', async ({page, nuvem}) => {
  page.on('dialog', d => d.accept());
  nuvem.tabelas.perfis = [{id: B, nome: 'Outro Motorista', papel: 'motorista', ativo: true}];
  let quemEntra = B, semRede = true;
  await page.route('**/auth/v1/token**', r => r.request().method() === 'OPTIONS'
    ? r.fulfill({status: 204, headers: CORS})
    : r.fulfill({status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(sessaoDe(quemEntra))}));
  await page.route('**/rest/v1/buscas_de_lista**', r => semRede ? r.abort() : r.fallback());
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill('Rua Teste Um, 10, Centro');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-buscas') || '[]').length), {timeout: 40_000}).toBe(1);
  await menu(page, 'Sair');
  semRede = false;
  await entrarComo(page, B);
  await page.waitForTimeout(3000);
  expect(nuvem.pedidos.filter(p => p.caminho === 'buscas_de_lista')).toEqual([]);
  await menu(page, 'Sair');
  quemEntra = A;
  await entrarComo(page, A);
  await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'buscas_de_lista' && p.metodo === 'POST').map(p => p.quem), {timeout: 20_000}).toEqual([A]);
});

// A porta segurada (passagem e lugar esperando os 10 minutos do desfazer) não aparece na tela, e
// tem um temporizador próprio, que pode vencer com outra conta entrada. Pedido da revisão de 20/10:
// até aqui era só o código dizendo que ela vai para o lado junto com o dia.
test.describe('trocar de conta com a porta da entrega ainda segurada', () => {
  test.use({permissions: ['geolocation'], geolocation: {latitude: -10.9605, longitude: -37.0455, accuracy: 12}});
  const passagens = (nuvem, quem?: string) => nuvem.pedidos.filter(p => p.caminho === 'observacoes' && p.metodo === 'POST' && (!quem || p.quem === quem));

  async function entregarESairComA(page: Page, nuvem) {
    page.on('dialog', d => d.accept());
    nuvem.tabelas.perfis = [{id: B, nome: 'Outro Motorista', papel: 'motorista', ativo: true}];
    let quemEntra = B;
    await page.route('**/auth/v1/token**', r => r.request().method() === 'OPTIONS'
      ? r.fulfill({status: 204, headers: CORS})
      : r.fulfill({status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(sessaoDe(quemEntra))}));
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await page.locator('.proxima [data-acao="entregue"]').first().click();
    await expect.poll(async () => (await seguradas(page)).flatMap(s => s.ops.map(o => o.tipo))).toContain('observacao');
    // a entrega mesmo não espera: sai na hora, na sessão de A
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'pacotes' && p.metodo === 'PATCH' && p.busca.includes('rota_id')).map(p => p.quem)).toEqual([A]);
    await menu(page, 'Sair');
    await entrarComo(page, B);
    return {voltaA: () => { quemEntra = A; }};
  }

  async function bNaoTemNadaDeA(page: Page, nuvem) {
    expect(passagens(nuvem)).toEqual([]);
    expect(await seguradas(page)).toEqual([]);
    expect(await fila(page)).toEqual([]);
  }

  test('vence com B na sessão: B não manda, e quando A volta ela sai na sessão de A', async ({page, nuvem}) => {
    const {voltaA} = await entregarESairComA(page, nuvem);
    // o temporizador da porta de A dispara com B entrado
    await page.clock.fastForward('11:00');
    await page.waitForTimeout(1500);
    await bNaoTemNadaDeA(page, nuvem);
    await menu(page, 'Sair');
    voltaA();
    await entrarComo(page, A);
    await expect.poll(() => passagens(nuvem).map(p => p.quem), {timeout: 20_000}).toEqual([A]);
    expect(await seguradas(page)).toEqual([]);
  });

  test('A volta antes de vencer: ela continua segurada, e sai com A quando vence', async ({page, nuvem}) => {
    const {voltaA} = await entregarESairComA(page, nuvem);
    await page.clock.fastForward('04:00');
    await page.waitForTimeout(1500);
    await bNaoTemNadaDeA(page, nuvem);
    await menu(page, 'Sair');
    voltaA();
    await entrarComo(page, A);
    await page.waitForTimeout(1500);
    // ainda dentro do prazo de desfazer: segurada como ele deixou, e nada saiu
    expect((await seguradas(page)).flatMap(s => s.ops.map(o => o.tipo))).toContain('observacao');
    expect(passagens(nuvem)).toEqual([]);
    await page.clock.fastForward('07:00');
    await expect.poll(() => passagens(nuvem).map(p => p.quem), {timeout: 20_000}).toEqual([A]);
  });
});

test.describe('a primeira abertura da versão que separa o dia por conta', () => {
  const ANTIGO = {
    'rota-entregas-v2': JSON.stringify({cidade: 'Aracaju', regiao: null, tamTrecho: 9, inicio: null, voltar: false, ordemDoApp: false,
      areas: [{id: 'a1', nome: 'Verde', cor: '#16a34a', prazo: ''}], areaAtual: 'a1', areasManual: false, rota: null, pernas: {},
      paradas: [{id: 'p1', texto: 'Rua Teste Um, 10, Centro', area: 'a1', lat: -10.95, lng: -37.05, precisao: 'planilha', entregue: false, candidatos: []}]}),
    'rota-entregas-fila': JSON.stringify([{tipo: 'correcao', chave: '49000100|10', lat: -10.95, lng: -37.05}]),
  };

  test('com uma conta entrada, o que estava guardado fica com ela', async ({page, context, nuvem}) => {
    await context.addInitScript(dados => { if (!localStorage.getItem('rota-entregas-dono')) for (const [k, v] of Object.entries(dados)) if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, ANTIGO);
    await abrir(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('rota-entregas-dono'))).toBe(A);
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'POST').map(p => p.quem)).toEqual([A]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.length)).toBe(1);
  });

  test('sem conta entrada, fica reservado para a primeira que entrar', async ({page, context, nuvem}) => {
    // o aparelho sem sessão (a nuvem falsa põe uma; este roteiro tira, só na primeira carga)
    await context.addInitScript(dados => {
      if (sessionStorage.getItem('ja-abriu')) return;
      sessionStorage.setItem('ja-abriu', '1');
      localStorage.removeItem('rota-entregas-auth');
      for (const [k, v] of Object.entries(dados)) localStorage.setItem(k, v);
    }, ANTIGO);
    await page.goto('./');
    await expect(page.getByText('Entre com a conta que o responsável criou para você.')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('rota-entregas-dono'))).toBeNull();
    await page.route('**/auth/v1/token**', r => r.request().method() === 'OPTIONS'
      ? r.fulfill({status: 204, headers: CORS})
      : r.fulfill({status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(sessaoDe(A))}));
    await entrarComo(page, A);
    expect(await page.evaluate(() => localStorage.getItem('rota-entregas-dono'))).toBe(A);
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'correcoes' && p.metodo === 'POST').map(p => p.quem)).toEqual([A]);
  });
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
