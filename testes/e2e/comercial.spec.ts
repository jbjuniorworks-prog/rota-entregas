import type {Page, Route} from '@playwright/test';
import {abrir, base64url, carregar, colar, expect, menu, montar, paraABase, test, verNoMapa, ROTA_A} from './apoio';

// Pino comercial (pedido do Luan, 07/11): lugar com horário de funcionamento. A marca é por
// endereço e vale para todos os motoristas (031); o leitor do Meli só muda o pino neste celular.

const PINO = '[data-folha="pino"]';
const EU = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-0000000000b2';
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};

// O que o token do pedido diz: o sub é de quem é a marca; o session_id, de qual entrada saiu o pedido.
const doToken = (r: Route) => {
  try { return JSON.parse(Buffer.from((r.request().headers()['authorization'] || '').split(' ')[1].split('.')[1], 'base64url').toString()); } catch { return {}; }
};
const quemMandou = (r: Route) => doToken(r).sub ?? null;

// Um servidor de marcas de mentira, com a regra da 031: cada uma é do motorista do token; a consulta
// diz, para quem pergunta, se é dele e se há de outro. `ausente` faz o papel da migração ainda não
// rodada. `segurarEnvio` e `segurarConsulta` atrasam de propósito o próximo pedido: a consulta
// segurada responde o que valia quando ela chegou, não quando é solta.
function servidorDeMarcas(page: Page) {
  const marcas: {chave: string; de: string}[] = [];
  const pedidos: {metodo: string; busca: string; corpo: any; quem: string | null; sessao: string | null}[] = [];
  const s = {marcas, pedidos, ausente: false, consultas: 0, respondidas: 0, outrosEm: (_chaves: string[]) => [] as string[],
    segurarEnvio: null as Promise<void> | null, segurarConsulta: null as Promise<void> | null, seguradas: 0};
  const responder = (r: Route, corpo: unknown, status = 200) =>
    r.fulfill({status, contentType: 'application/json', headers: CORS, body: JSON.stringify(corpo)});
  const semTabela = (r: Route) => responder(r, {code: 'PGRST205', message: "Could not find the table 'public.comerciais' in the schema cache"}, 404);
  page.route('**/rest/v1/comerciais**', async r => {
    const metodo = r.request().method();
    if (metodo === 'OPTIONS') return r.fulfill({status: 204, headers: CORS});
    const u = new URL(r.request().url());
    let corpo: any = null;
    try { corpo = r.request().postDataJSON(); } catch {}
    const quem = quemMandou(r);
    pedidos.push({metodo, busca: u.search, corpo, quem, sessao: doToken(r).session_id ?? null});
    const espera = s.segurarEnvio;
    if (espera) { s.segurarEnvio = null; s.seguradas++; await espera; }
    if (s.ausente) return semTabela(r);
    const chave = (u.searchParams.get('chave_lugar') || '').replace(/^eq\./, '');
    if (metodo === 'POST') {
      for (const l of [].concat(corpo)) if (!marcas.some(m => m.chave === (l as any).chave_lugar && m.de === quem)) marcas.push({chave: (l as any).chave_lugar, de: quem!});
      return responder(r, [], 201);
    }
    if (metodo === 'DELETE') {
      const so = u.searchParams.get('motorista_id')?.replace(/^eq\./, '');
      for (let i = marcas.length - 1; i >= 0; i--) if (marcas[i].chave === chave && (!so || marcas[i].de === so)) marcas.splice(i, 1);
      return responder(r, []);
    }
    return responder(r, []);
  });
  page.route('**/rest/v1/rpc/comerciais_dos_lugares', async r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({status: 204, headers: CORS});
    s.consultas++;
    const quem = quemMandou(r);
    const chaves = (r.request().postDataJSON() as {chaves: string[]}).chaves;
    const outros = new Set(s.outrosEm(chaves));
    const ausente = s.ausente;
    const corpo = chaves.filter(k => outros.has(k) || marcas.some(m => m.chave === k)).map(k => ({
      chave_lugar: k, minha: marcas.some(m => m.chave === k && m.de === quem), outros: outros.has(k) || marcas.some(m => m.chave === k && m.de !== quem)}));
    const espera = s.segurarConsulta;
    if (espera) { s.segurarConsulta = null; s.seguradas++; await espera; }
    s.respondidas++;
    if (ausente) return responder(r, {code: 'PGRST202', message: 'Could not find the function public.comerciais_dos_lugares'}, 404);
    return responder(r, corpo);
  });
  return s;
}

// Duas contas no mesmo celular, como na auditoria da fila (testes/e2e/auditoria-fila.spec.ts). Cada
// entrada é uma sessão nova, com o seu session_id, como no Supabase de verdade.
let entradas = 0;
function sessaoDe(id: string) {
  const expira = Math.floor(Date.now() / 1000) + 86400;
  const user = {id, email: id === B ? 'outro@exemplo.com' : 'teste@exemplo.com', aud: 'authenticated', role: 'authenticated', app_metadata: {provider: 'email'}, user_metadata: {nome: 'Teste'}, created_at: new Date().toISOString()};
  const token = [base64url({alg: 'HS256', typ: 'JWT'}), base64url({sub: id, role: 'authenticated', aud: 'authenticated', exp: expira, session_id: `sessao-${++entradas}`}), 'assinatura'].join('.');
  return {access_token: token, refresh_token: 'renovar-' + id.slice(-2), token_type: 'bearer', expires_in: 86400, expires_at: expira, user};
}
async function duasContas(page: Page, nuvem: any) {
  page.on('dialog', d => d.accept());
  nuvem.tabelas.perfis = [{id: B, nome: 'Outro Motorista', papel: 'motorista', ativo: true}];
  const contas = {entra: EU};
  await page.route('**/auth/v1/token**', r => r.request().method() === 'OPTIONS'
    ? r.fulfill({status: 204, headers: CORS})
    : r.fulfill({status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(sessaoDe(contas.entra))}));
  return contas;
}
async function trocarPara(page: Page, contas: {entra: string}, quem: string) {
  await menu(page, 'Sair');
  contas.entra = quem;
  await page.getByLabel('E-mail').fill(quem === B ? 'outro@exemplo.com' : 'teste@exemplo.com');
  await page.getByLabel('Senha', {exact: true}).fill('senha');
  await page.getByRole('button', {name: 'Entrar'}).click();
  await expect(page.getByRole('button', {name: 'Mais', exact: true})).toBeVisible();
  // entrando de novo com a mesma conta, o menu de onde ele saiu continua aberto por cima do mapa
  await paraABase(page);
}
const pendentesDe = (page: Page, conta?: string) =>
  page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), conta ? `rota-entregas-comerciais@${conta}` : 'rota-entregas-comerciais');
const solto = () => { let soltar!: () => void; const p = new Promise<void>(r => { soltar = r; }); return {p, soltar}; };

const salvas = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as any[]);

async function abrirPinoDaProxima(page: Page) {
  const texto = await page.locator('.proxima .endereco').innerText();
  const p = (await salvas(page)).find(x => x.texto === texto);
  await verNoMapa(page, p.lat, p.lng, 18);
  await page.locator('.pino.alvo').click();
  await expect(page.locator(PINO)).toBeVisible();
  return p;
}

async function abrirPinoDe(page: Page, p: {lat: number; lng: number}) {
  await verNoMapa(page, p.lat, p.lng, 18);
  await page.locator('.leaflet-marker-icon .pino.comercial').click();
  await expect(page.locator(PINO)).toBeVisible();
}

test.describe('pino comercial', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('marca no cartão, vai para a nuvem, continua ao reabrir o app e desmarca', async ({page}) => {
    const s = servidorDeMarcas(page);
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await abrirPinoDaProxima(page);
    const botao = page.locator(`${PINO} [data-marcar=comercial]`);
    await expect(botao).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.pino.alvo')).not.toHaveClass(/comercial/);

    await botao.click();
    await expect(botao).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(`${PINO} [data-comercial]`)).toContainText('Marcado por você');
    await expect(page.locator('.pino.alvo')).toHaveClass(/comercial/);
    await expect.poll(() => s.pedidos.filter(p => p.metodo === 'POST').length, {timeout: 20_000}).toBe(1);
    // só a chave: quem marcou e quando, o banco põe
    expect(Object.keys([].concat(s.pedidos[0].corpo)[0])).toEqual(['chave_lugar']);

    await page.reload();
    await expect(page.locator('.proxima .endereco')).toBeVisible();
    await abrirPinoDaProxima(page);
    await expect(botao).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pino.alvo')).toHaveClass(/comercial/);

    await botao.click();
    await expect(botao).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.pino.alvo')).not.toHaveClass(/comercial/);
    await expect.poll(() => s.pedidos.filter(p => p.metodo === 'DELETE').length, {timeout: 20_000}).toBe(1);
    expect(s.pedidos.find(p => p.metodo === 'DELETE')!.busca, 'tira só a dele').toContain(`motorista_id=eq.${EU}`);
    expect(s.marcas).toEqual([]);
  });

  test('a marca de outro motorista chega ao carregar, e tirar a minha não apaga a dele', async ({page}) => {
    const s = servidorDeMarcas(page);
    s.outrosEm = chaves => [chaves[0]];
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(async () => (await salvas(page)).filter(p => p.comercialOutros).length).toBe(1);
    const dele = (await salvas(page)).find(p => p.comercialOutros);
    await abrirPinoDe(page, dele);
    const botao = page.locator(`${PINO} [data-marcar=comercial]`);
    const linha = page.locator(`${PINO} [data-comercial]`);
    await expect(linha).toContainText('Marcado por outro motorista.');
    await expect(botao).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator(`${PINO} [data-marcar=comercial-todos]`), 'motorista não tira a dos outros').toHaveCount(0);

    await botao.click();
    await expect(linha).toContainText('Marcado por você e por outro motorista.');
    await botao.click();
    await expect(linha).toContainText('Marcado por outro motorista.');
    await expect(page.locator('.leaflet-marker-icon .pino.comercial'), 'o pino continua quadrado pela marca dele').toHaveCount(1);
    await expect.poll(() => s.pedidos.filter(p => p.metodo === 'DELETE').length, {timeout: 20_000}).toBe(1);
    expect(s.pedidos.find(p => p.metodo === 'DELETE')!.busca).toContain(`motorista_id=eq.${EU}`);
  });

  test('sem sinal, marcar, tirar e marcar de novo sai uma vez só quando o sinal volta', async ({page, context}) => {
    const s = servidorDeMarcas(page);
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await abrirPinoDaProxima(page);
    const botao = page.locator(`${PINO} [data-marcar=comercial]`);
    await context.setOffline(true);
    await botao.click();
    await botao.click();
    await botao.click();
    await expect(botao).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('rota-entregas-comerciais') || '{}')))).toEqual(['marcar']);
    expect(s.pedidos).toEqual([]);
    await context.setOffline(false);
    await expect.poll(() => s.pedidos.filter(p => p.metodo === 'POST').length, {timeout: 20_000}).toBe(1);
    // outro envio (o de minuto em minuto, ou outro toque) não manda de novo
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(1500);
    expect(s.pedidos.map(p => p.metodo)).toEqual(['POST']);
    expect(await page.evaluate(() => localStorage.getItem('rota-entregas-comerciais'))).toBe('{}');
  });

  test('sem a tabela no servidor, a marca fica e espera, e a entrega sai mesmo assim', async ({page, nuvem}) => {
    const s = servidorDeMarcas(page);
    s.ausente = true;
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await abrirPinoDaProxima(page);
    const botao = page.locator(`${PINO} [data-marcar=comercial]`);
    await botao.click();
    await expect.poll(() => s.pedidos.filter(p => p.metodo === 'POST').length, {timeout: 20_000}).toBeGreaterThan(0);
    await expect(page.locator('.pino.alvo')).toHaveClass(/comercial/);
    await expect(page.locator('[data-topo]')).toContainText('1 para enviar');

    await page.locator(`${PINO} [data-acao=entregue]`).first().click();
    await expect.poll(() => nuvem.pedidos.filter(p => p.caminho === 'pacotes' && p.metodo === 'PATCH').length, {timeout: 20_000}).toBe(1);
    expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('rota-entregas-comerciais') || '{}')))).toEqual(['marcar']);
    await expect(page.locator('[data-topo]')).not.toContainText('servidor recusou');

    // a migração rodou
    s.ausente = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => s.marcas.length, {timeout: 20_000}).toBe(1);
    await expect(page.locator('[data-topo]')).not.toContainText('para enviar');
  });

  test('o que o leitor do Meli marca como comercial muda o pino, e não vira marca para os outros', async ({page}) => {
    const s = servidorDeMarcas(page);
    await abrir(page);
    await colar(page);
    await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
    await page.getByLabel(/Endereços da área/).fill([
      '#10 Rua Teste Gonçalves Inventado 19, Loja Teste, CEP 49000-902 · 1 unid · comercial https://maps.google.com/maps?q=-10.9500%2C-37.0500&z=17',
      '#11 Rua Teste Inventada 30, CEP 49000-903 · 1 unid https://maps.google.com/maps?q=-10.9520%2C-37.0520&z=17',
      // sem posição: a busca roda e termina consultando a nuvem, que é onde uma marca nasceria
      '#12 Rua Teste Sem Posicao 40, CEP 49000-906 · 1 unid',
    ].join('\n'));
    await page.getByRole('button', {name: /^Adicionar em/}).click();
    await expect.poll(() => s.consultas, {timeout: 40_000}).toBeGreaterThan(0);
    await abrirPinoDe(page, {lat: -10.95, lng: -37.05});
    await expect(page.locator(PINO)).toContainText('Gonçalves');
    await expect(page.locator(`${PINO} [data-comercial]`)).toContainText('O Mercado Livre diz horário comercial.');
    await expect(page.locator(`${PINO} [data-marcar=comercial]`)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.leaflet-marker-icon .pino.comercial')).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(1500);
    expect(s.pedidos.filter(p => p.metodo !== 'GET')).toEqual([]);
  });
});

// "Ter a opção de marcar separado no pino: esse é comércio, esse não" (Luan, 07/11, com o print do
// cartão). Dois endereços no mesmo ponto: cada um tem o seu botão, e só o marcado vai para a nuvem.
test.describe('pino comercial com dois endereços no mesmo ponto', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('marca um endereço do pino e o outro fica como estava', async ({page}) => {
    const s = servidorDeMarcas(page);
    await abrir(page);
    await colar(page);
    await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
    await page.getByLabel(/Endereços da área/).fill([
      '#20 Rua Teste Comercio Inventado 5, CEP 49000-904 · 1 unid https://maps.google.com/maps?q=-10.9600%2C-37.0600&z=17',
      '#21 Rua Teste Casa Inventada 7, CEP 49000-905 · 1 unid https://maps.google.com/maps?q=-10.9600%2C-37.0600&z=17',
    ].join('\n'));
    await page.getByRole('button', {name: /^Adicionar em/}).click();
    await expect(page.getByText('2 entrega(s) carregada(s)')).toBeVisible({timeout: 20_000});
    await verNoMapa(page, -10.96, -37.06, 18);
    await page.locator('.leaflet-marker-icon .pino').first().click();
    const loja = page.locator(`${PINO} .entrega`).filter({hasText: 'Comercio Inventado'});
    const casa = page.locator(`${PINO} .entrega`).filter({hasText: 'Casa Inventada'});
    await expect(loja).toHaveCount(1);
    await expect(casa).toHaveCount(1);

    await loja.locator('[data-marcar=comercial]').click();
    await expect(loja.locator('[data-marcar=comercial]')).toHaveAttribute('aria-pressed', 'true');
    await expect(loja.locator('[data-comercial]')).toContainText('Marcado por você');
    await expect(casa.locator('[data-marcar=comercial]')).toHaveAttribute('aria-pressed', 'false');
    await expect(casa.locator('[data-comercial]')).toHaveCount(0);
    await expect(page.locator('.leaflet-marker-icon .pino.comercial'), 'o pino junto mostra que há comércio nele').toHaveCount(1);
    await expect.poll(() => s.pedidos.filter(p => p.metodo === 'POST').length, {timeout: 20_000}).toBe(1);
    expect(s.marcas.map(m => m.chave)).toEqual([expect.stringContaining('49000904')]);
  });
});

async function abrirPinoPorId(page: Page, p: {id: string; lat: number; lng: number}) {
  await verNoMapa(page, p.lat, p.lng, 18);
  await page.locator(`.leaflet-marker-icon .pino[data-ids*="${p.id}"]`).click();
  await expect(page.locator(PINO)).toBeVisible();
}

// Revisão de 07/11: troca de conta no meio de um envio, e respostas que chegam atrasadas. O servidor
// de mentira segura um pedido de propósito, e o teste mexe no app enquanto ele está preso.
test.describe('pino comercial com pedidos atrasados', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('A sai e B entra com um envio de A preso: ele termina com A, o resto de A não sai na sessão de B, e sai quando A volta', async ({page, context, nuvem}) => {
    const contas = await duasContas(page, nuvem);
    const s = servidorDeMarcas(page);
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    // dois endereços marcados sem sinal: quando o sinal volta, os dois estão na mesma volta de envio
    await context.setOffline(true);
    const p1 = await abrirPinoDaProxima(page);
    await page.locator(`${PINO} [data-marcar=comercial]`).first().click();
    const todas = await salvas(page);
    const p2 = todas.find(x => x.id !== p1.id && x.lat != null && !todas.some(y => y !== x && y.lat === x.lat && y.lng === x.lng));
    await abrirPinoPorId(page, p2);
    await page.locator(`${PINO} [data-marcar=comercial]`).first().click();
    await expect.poll(async () => Object.keys(await pendentesDe(page) || {}).length).toBe(2);
    // o primeiro pedido fica preso no servidor
    const preso = solto();
    s.segurarEnvio = preso.p;
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => s.seguradas).toBe(1);

    await trocarPara(page, contas, B);
    preso.soltar();
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(1500);
    expect(s.pedidos.map(x => x.quem), 'só o pedido que já tinha saído, com o token de A').toEqual([EU]);
    expect(await pendentesDe(page), 'a fila de B não ganhou nada de A').toBeNull();
    expect(Object.values(await pendentesDe(page, EU)), 'os dois desejos de A ficam guardados com A').toEqual(['marcar', 'marcar']);

    await trocarPara(page, contas, EU);
    await expect.poll(() => s.marcas.filter(m => m.de === EU).length, {timeout: 20_000}).toBe(2);
    expect(s.pedidos.every(x => x.quem === EU), 'nenhum pedido de comercial com o token de B').toBe(true);
    expect(await pendentesDe(page)).toEqual({});
  });

  test('a consulta de A que volta depois de B entrar não marca nada no dia de B', async ({page, nuvem}) => {
    const contas = await duasContas(page, nuvem);
    const s = servidorDeMarcas(page);
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await abrirPinoDaProxima(page);
    await page.locator(`${PINO} [data-marcar=comercial]`).first().click();
    await expect.poll(() => s.marcas.length).toBe(1);
    // A entra de novo, e a consulta dele fica presa dizendo "esta marca é sua"
    const preso = solto();
    s.segurarConsulta = preso.p;
    await trocarPara(page, contas, EU);
    await expect.poll(() => s.seguradas).toBe(1);
    // B entra e carrega a mesma planilha: para ele a marca é de outro motorista
    await trocarPara(page, contas, B);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(async () => (await salvas(page)).filter(x => x.comercialOutros).length).toBe(1);
    const antes = s.respondidas;
    preso.soltar();
    await expect.poll(() => s.respondidas).toBe(antes + 1);
    await page.waitForTimeout(1000);
    expect((await salvas(page)).filter(x => x.comercialMeu).map(x => x.texto), 'nada de "marcado por você" no dia de B').toEqual([]);
  });

  test('marca durante a consulta: a resposta de antes do toque não apaga a marca, mesmo com o envio já feito', async ({page, nuvem}) => {
    const contas = await duasContas(page, nuvem);
    const s = servidorDeMarcas(page);
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const preso = solto();
    s.segurarConsulta = preso.p;
    await trocarPara(page, contas, EU);
    await expect.poll(() => s.seguradas).toBe(1);
    await abrirPinoDaProxima(page);
    const botao = page.locator(`${PINO} [data-marcar=comercial]`).first();
    await botao.click();
    await expect.poll(() => s.marcas.length).toBe(1);
    await expect.poll(() => pendentesDe(page)).toEqual({});
    const antes = s.respondidas;
    preso.soltar();
    await expect.poll(() => s.respondidas).toBe(antes + 1);
    await page.waitForTimeout(1000);
    await expect(botao).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pino.alvo')).toHaveClass(/comercial/);
  });

  test('resetar a rota com uma consulta no caminho: a resposta antiga não entra na rota nova', async ({page, nuvem}) => {
    const contas = await duasContas(page, nuvem);
    const s = servidorDeMarcas(page);
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await abrirPinoDaProxima(page);
    await page.locator(`${PINO} [data-marcar=comercial]`).first().click();
    await expect.poll(() => s.marcas.length).toBe(1);
    const preso = solto();
    s.segurarConsulta = preso.p;
    await trocarPara(page, contas, EU);
    await expect.poll(() => s.seguradas).toBe(1);
    // a marca sai do servidor (outro aparelho, o admin) e ele recomeça o dia com a mesma planilha
    s.marcas.length = 0;
    await menu(page, 'Resetar a rota');
    await carregar(page, ROTA_A);
    await montar(page);
    expect((await salvas(page)).filter(x => x.comercialMeu)).toEqual([]);
    const antes = s.respondidas;
    preso.soltar();
    await expect.poll(() => s.respondidas).toBe(antes + 1);
    await page.waitForTimeout(1000);
    expect((await salvas(page)).filter(x => x.comercialMeu).map(x => x.texto), 'a resposta de antes do reset não marca a rota nova').toEqual([]);
  });
});

// Revisão de 07/11, segunda rodada: o cliente de uma entrada não volta a valer quando a mesma conta
// entra de novo. Comparar só a conta deixava o cliente antigo de A continuar depois de A → B → A.
test.describe('pino comercial: o cliente de uma entrada antiga não volta a valer', () => {
  test.use({viewport: {width: 412, height: 915}});

  async function doisDesejosComUmPreso(page: Page, context: any, nuvem: any) {
    const contas = await duasContas(page, nuvem);
    const s = servidorDeMarcas(page);
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await context.setOffline(true);
    const p1 = await abrirPinoDaProxima(page);
    await page.locator(`${PINO} [data-marcar=comercial]`).first().click();
    const todas = await salvas(page);
    const p2 = todas.find(x => x.id !== p1.id && x.lat != null && !todas.some(y => y !== x && y.lat === x.lat && y.lng === x.lng));
    await abrirPinoPorId(page, p2);
    await page.locator(`${PINO} [data-marcar=comercial]`).first().click();
    await expect.poll(async () => Object.keys(await pendentesDe(page) || {}).length).toBe(2);
    const preso = solto();
    s.segurarEnvio = preso.p;
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => s.seguradas).toBe(1);
    return {contas, s, preso, antiga: s.pedidos[0].sessao};
  }

  // Solto o pedido preso, a volta antiga termina sem mexer nos desejos de A e sem mandar o próximo;
  // depois, a sessão nova de A manda os dois.
  async function conferir(page: Page, s: any, preso: {soltar: () => void}, antiga: string | null) {
    const desejos = await pendentesDe(page);
    expect(Object.values(desejos), 'os dois desejos de A estão de volta').toEqual(['marcar', 'marcar']);
    preso.soltar();
    await page.waitForTimeout(1500);
    expect(await pendentesDe(page), 'a resposta antiga não tira nenhum desejo de A').toEqual(desejos);
    expect(s.pedidos.filter((x: any) => x.sessao === antiga).length, 'o cliente antigo não manda mais nada').toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => s.marcas.filter((m: any) => m.de === EU).length, {timeout: 20_000}).toBe(2);
    expect(s.pedidos.slice(1).every((x: any) => x.sessao !== antiga && x.quem === EU), 'o resto sai pela sessão nova de A').toBe(true);
    expect(await pendentesDe(page)).toEqual({});
  }

  test('A → B → A com um envio de A preso', async ({page, context, nuvem}) => {
    const {contas, s, preso, antiga} = await doisDesejosComUmPreso(page, context, nuvem);
    await trocarPara(page, contas, B);
    await trocarPara(page, contas, EU);
    await conferir(page, s, preso, antiga);
  });

  test('A sai e entra de novo em A com um envio preso', async ({page, context, nuvem}) => {
    const {contas, s, preso, antiga} = await doisDesejosComUmPreso(page, context, nuvem);
    await trocarPara(page, contas, EU);
    await conferir(page, s, preso, antiga);
  });
});

test.describe('pino comercial, quem administra', () => {
  test.use({viewport: {width: 412, height: 915}, papel: 'admin'});

  test('o admin tira a marca de todos os motoristas', async ({page}) => {
    page.on('dialog', d => d.accept());
    const s = servidorDeMarcas(page);
    let outros = true;
    s.outrosEm = chaves => outros ? [chaves[0]] : [];
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await expect.poll(async () => (await salvas(page)).filter(p => p.comercialOutros).length).toBe(1);
    await abrirPinoDe(page, (await salvas(page)).find(p => p.comercialOutros));
    await page.locator(`${PINO} [data-marcar=comercial-todos]`).click();
    await expect(page.locator('.leaflet-marker-icon .pino.comercial')).toHaveCount(0);
    await expect.poll(() => s.pedidos.filter(p => p.metodo === 'DELETE').length, {timeout: 20_000}).toBe(1);
    const busca = s.pedidos.find(p => p.metodo === 'DELETE')!.busca;
    expect(busca).toContain('chave_lugar=eq.');
    expect(busca, 'de todos: sem o filtro do dono').not.toContain('motorista_id');
    outros = false;
  });
});
