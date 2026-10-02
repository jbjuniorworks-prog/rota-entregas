import {test as base, expect, type BrowserContext, type Page, type Locator} from '@playwright/test';

export const ROTA_A = 'testes/planilhas/rota-a.txt';
export const ROTA_B = 'testes/planilhas/rota-b.xlsx';

export interface NuvemFalsa {
  papel: 'motorista' | 'admin' | null;
  tabelas: Record<string, Record<string, unknown>[]>;
  rpc: Record<string, unknown[]>;
  pedidos: {metodo: string; caminho: string; busca: string; corpo: unknown}[];
}

const EU = {id: '00000000-0000-4000-8000-000000000001', nome: 'Você Teste'};

function base64url(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

function sessaoFalsa() {
  const expira = Math.floor(Date.now() / 1000) + 30 * 86400;
  const user = {id: EU.id, email: 'teste@exemplo.com', aud: 'authenticated', role: 'authenticated', app_metadata: {provider: 'email'}, user_metadata: {nome: EU.nome}, created_at: new Date().toISOString()};
  const token = [base64url({alg: 'HS256', typ: 'JWT'}), base64url({sub: EU.id, role: 'authenticated', aud: 'authenticated', exp: expira}), 'assinatura'].join('.');
  return {access_token: token, refresh_token: 'renovar', token_type: 'bearer', expires_in: 30 * 86400, expires_at: expira, user};
}

function filtrar(linhas: Record<string, unknown>[], busca: URLSearchParams) {
  let saida = linhas;
  for (const [campo, valor] of busca) {
    if (valor.startsWith('eq.')) saida = saida.filter(l => String(l[campo]) === valor.slice(3));
    if (valor.startsWith('in.(')) {
      const ok = new Set(valor.slice(4, -1).split(',').map(v => v.replace(/^"|"$/g, '')));
      saida = saida.filter(l => ok.has(String(l[campo])));
    }
  }
  return saida;
}

export async function ligarNuvemFalsa(context: BrowserContext, nuvem: NuvemFalsa) {
  if (!nuvem.papel) return;
  const eu = {...EU, papel: nuvem.papel, ativo: true};
  await context.addInitScript(s => { if (!localStorage.getItem('rota-entregas-auth')) localStorage.setItem('rota-entregas-auth', s); }, JSON.stringify(sessaoFalsa()));
  await context.route('**://hkclzmlcfiksaqqspqsy.supabase.co/**', async r => {
    const u = new URL(r.request().url()), metodo = r.request().method();
    const caminho = u.pathname.replace(/^\/(rest|auth)\/v1\//, '');
    const cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};
    if (metodo === 'OPTIONS') return r.fulfill({status: 204, headers: cors});
    const json = (corpo: unknown, status = 200) => r.fulfill({status, contentType: 'application/json', headers: cors, body: JSON.stringify(corpo)});
    let corpo: unknown = null;
    try { corpo = r.request().postDataJSON(); } catch { corpo = r.request().postData(); }
    nuvem.pedidos.push({metodo, caminho, busca: u.search, corpo});
    if (caminho === 'user') return json(sessaoFalsa().user);
    if (caminho === 'token') return json(sessaoFalsa());
    if (caminho === 'logout') return r.fulfill({status: 204, headers: cors});
    if (caminho.startsWith('rpc/')) return json(nuvem.rpc[caminho.slice(4)] || []);
    if (metodo === 'DELETE') return json([{id: 1}]);
    if (metodo !== 'GET') return json([], metodo === 'POST' ? 201 : 200);
    if (caminho === 'perfis' && u.searchParams.get('id') === 'eq.' + EU.id) {
      return r.request().headers()['accept']?.includes('vnd.pgrst.object') ? json(eu) : json([eu]);
    }
    return json(filtrar(caminho === 'perfis' ? [eu, ...(nuvem.tabelas.perfis || [])] : nuvem.tabelas[caminho] || [], u.searchParams));
  });
}

export const test = base.extend<{erros: string[]; nuvem: NuvemFalsa; papel: 'motorista' | 'admin' | null}>({
  papel: ['motorista', {option: true}],
  erros: async ({}, use) => { await use([]); },
  nuvem: async ({papel}, use) => { await use({papel, tabelas: {}, rpc: {}, pedidos: []}); },
  page: async ({page, context, erros, nuvem}, use) => {
    for (const servico of ['router.project-osrm.org', 'nominatim.openstreetmap.org', 'tile.openstreetmap.org', 'cep.awesomeapi.com.br', 'viacep.com.br']) {
      await context.route(`**://${servico}/**`, r => r.abort());
    }
    await ligarNuvemFalsa(context, nuvem);
    page.on('pageerror', e => erros.push(String(e)));
    await use(page);
    expect(erros, 'erros de JavaScript na página').toEqual([]);
  },
});
export {expect};

export async function abrir(page: Page) {
  await page.goto('./');
  await expect(page.locator('#app')).toBeVisible();
}

export function aviso(page: Page): Locator {
  return page.locator('#status');
}

// Volta pelos cabeçalhos até a tela de base, como o motorista faria pelo voltar.
export async function paraABase(page: Page) {
  for (let i = 0; i < 4; i++) {
    if (await page.locator('.fundo-menu').isVisible()) { await page.locator('.menu').getByRole('button', {name: 'Fechar'}).click(); continue; }
    if (await page.locator('[data-topo]').isVisible()) {
      const fechar = page.locator('[data-folha="pino"]').getByRole('button', {name: 'Fechar'});
      if (await fechar.isVisible()) { await fechar.click(); continue; }
      if (await page.locator('[data-folha="lista"]').isVisible()) { await page.getByRole('button', {name: 'Voltar ao mapa'}).click(); continue; }
      return;
    }
    const voltar = page.locator('.cabecalho').getByRole('button', {name: 'Voltar'});
    if (await voltar.isVisible()) { await voltar.click(); continue; }
    return;
  }
}

export async function menu(page: Page, item: string | RegExp) {
  await paraABase(page);
  await page.getByRole('button', {name: 'Mais', exact: true}).click();
  await page.locator('.menu').getByRole('button', {name: item}).click();
}

export async function carregar(page: Page, arquivo: string) {
  if (!(await page.locator('#arquivo').count())) await menu(page, /Ler mais uma planilha/);
  await page.locator('#arquivo').setInputFiles(arquivo);
  await expect(aviso(page)).toContainText('parada(s) da planilha');
}

// Os nomes das abas de antes, para os testes falarem do lugar e não do caminho até ele.
export async function aba(page: Page, nome: '1. Endereços' | '2. Conferir' | '3. Rota') {
  if (nome === '3. Rota') return paraABase(page);
  if (nome === '1. Endereços') {
    if (await page.locator('#arquivo').count()) return;
    return menu(page, /Ler mais uma planilha/);
  }
  if (await page.locator('.cabecalho .titulo').getByText(/para conferir|Todos os endereços/).isVisible()) return;
  await menu(page, 'Conferir endereços');
}

// Abre a parte de colar endereços do começo do dia.
export async function colar(page: Page) {
  await aba(page, '1. Endereços');
  const botao = page.getByRole('button', {name: 'Colar endereços'});
  if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
}

export async function montar(page: Page) {
  await paraABase(page);
  const montar = page.getByRole('button', {name: 'Montar a rota', exact: true});
  if (await montar.isVisible()) await montar.click();
  else await menu(page, /^(Refazer|Montar) a rota$/);
  await expect(page.locator('[data-folha="proxima"], [data-folha="fim"]')).toBeVisible({timeout: 20_000});
}

// Abre a lista inteira da Rota, puxando o cartão para cima.
export async function lista(page: Page) {
  await paraABase(page);
  if (!(await page.locator('[data-folha="lista"]').isVisible())) await page.locator('[data-lista]').click();
  await expect(page.locator('[data-folha="lista"]')).toBeVisible();
}

// A sequência sai da lista: no mapa só a próxima está escrita.
export async function ordem(page: Page, nomes: string[]): Promise<string[]> {
  await lista(page);
  const cartoes = await page.locator('[data-item]').allInnerTexts();
  const texto = cartoes.join(' | ');
  return nomes.filter(n => texto.includes(n)).sort((a, b) => texto.indexOf(a) - texto.indexOf(b));
}

export function linhaDe(page: Page, endereco: string, botao: string | RegExp): Locator {
  return page.locator('div').filter({hasText: endereco}).filter({has: page.getByRole('button', {name: botao})}).last();
}

// O mapa agora é a tela da Rota: garantir o mapa é estar nela, com ele desenhado.
export async function garantirMapa(page: Page) {
  await paraABase(page);
  await expect(page.locator('#map')).toBeVisible({timeout: 15_000});
}

export async function zoom(page: Page, z: number) {
  await page.waitForFunction(() => !!(window as any).rotaTeste);
  await page.evaluate(z2 => (window as any).rotaTeste.zoom(z2), z);
}

// Leva o mapa até um ponto. Pino fora da tela existe no DOM mas não tem texto nenhum, então
// procurar pilha pelo rótulo só funciona olhando para onde ela está.
export async function verNoMapa(page: Page, lat: number, lng: number, z = 18) {
  await page.waitForFunction(() => !!(window as any).rotaTeste);
  // confere que pegou: o mapa pode reenquadrar sozinho logo depois de montar
  await expect.poll(async () => {
    await page.evaluate(([a, b, c]) => (window as any).rotaTeste.irPara(a, b, c), [lat, lng, z]);
    const c = await page.evaluate(() => (window as any).rotaTeste.centro());
    // o centro cai no pixel inteiro: de longe, um pixel passa de 1e-4 grau
    const folga = Math.max(1e-4, 2 * 360 / (256 * 2 ** z));
    return Math.abs(c.lat - lat) < folga && Math.abs(c.lng - lng) < folga;
  }, {timeout: 10_000}).toBe(true);
}

export async function clicarMapa(page: Page, lat: number, lng: number) {
  await page.waitForFunction(() => !!(window as any).rotaTeste);
  await page.evaluate(([a, b]) => (window as any).rotaTeste.clicarMapa(a, b), [lat, lng]);
}

export async function pontosNoMaps(page: Page): Promise<string[]> {
  await lista(page);
  const links = await page.getByRole('link', {name: /^Trecho \d+, pontos/}).evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
  return links.flatMap(h => {
    const u = new URL(h);
    return [...(u.searchParams.get('waypoints') || '').split('|').filter(Boolean), u.searchParams.get('destination') || ''];
  });
}
