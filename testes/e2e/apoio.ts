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
  await expect(page.getByRole('button', {name: '1. Endereços'})).toBeVisible();
}

export function aviso(page: Page): Locator {
  return page.locator('#status');
}

export async function carregar(page: Page, arquivo: string) {
  await page.locator('input[type=file]').setInputFiles(arquivo);
  await expect(aviso(page)).toContainText('parada(s) da planilha');
}

export async function aba(page: Page, nome: '1. Endereços' | '2. Conferir' | '3. Rota') {
  await page.getByRole('button', {name: nome}).click();
}

export async function montar(page: Page) {
  await aba(page, '3. Rota');
  const botao = page.getByRole('button', {name: /Montar melhor sequência/});
  if (!(await botao.isVisible())) await page.getByText('Ponto de saída / refazer rota').click();
  await botao.click();
  await expect(page.getByText(/Total estimado/)).toBeVisible();
}

export async function ordem(page: Page, nomes: string[]): Promise<string[]> {
  const texto = await page.locator('body').innerText();
  return nomes.filter(n => texto.includes(n)).sort((a, b) => texto.indexOf(a) - texto.indexOf(b));
}

export function linhaDe(page: Page, endereco: string, botao: string | RegExp): Locator {
  return page.locator('div').filter({hasText: endereco}).filter({has: page.getByRole('button', {name: botao})}).last();
}

export async function clicarMapa(page: Page, lat: number, lng: number) {
  await page.evaluate(([a, b]) => (window as any).rotaTeste.clicarMapa(a, b), [lat, lng]);
}

export async function pontosNoMaps(page: Page): Promise<string[]> {
  const links = await page.getByRole('link', {name: /Maps trecho/}).evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
  return links.flatMap(h => {
    const u = new URL(h);
    return [...(u.searchParams.get('waypoints') || '').split('|').filter(Boolean), u.searchParams.get('destination') || ''];
  });
}
