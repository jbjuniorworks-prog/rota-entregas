import {test as base, expect, type BrowserContext, type Page, type Locator} from '@playwright/test';

export const ROTA_A = 'testes/planilhas/rota-a.txt';
export const ROTA_B = 'testes/planilhas/rota-b.xlsx';

export interface NuvemFalsa {
  papel: 'motorista' | 'admin' | null;
  tabelas: Record<string, Record<string, unknown>[]>;
  // a resposta fixa, ou calculada do que o app mandou
  rpc: Record<string, unknown | ((corpo: any) => unknown)>;
  // `quem` é o sub da sessão que mandou: a auditoria da fila confere em nome de quem cada pedido chega
  pedidos: {metodo: string; caminho: string; busca: string; corpo: unknown; prefer?: string; quem?: string | null}[];
}

const EU = {id: '00000000-0000-4000-8000-000000000001', nome: 'Você Teste'};

// O sub do JWT que veio no pedido; a chave pública (anon) não tem.
function quemMandou(autorizacao: string | undefined): string | null {
  try { return JSON.parse(Buffer.from((autorizacao || '').split('.')[1], 'base64url').toString()).sub || null; } catch { return null; }
}

export function base64url(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

function sessaoFalsa() {
  const expira = Math.floor(Date.now() / 1000) + 30 * 86400;
  const user = {id: EU.id, email: 'teste@exemplo.com', aud: 'authenticated', role: 'authenticated', app_metadata: {provider: 'email'}, user_metadata: {nome: EU.nome}, created_at: new Date().toISOString()};
  const token = [base64url({alg: 'HS256', typ: 'JWT'}), base64url({sub: EU.id, role: 'authenticated', aud: 'authenticated', exp: expira}), 'assinatura'].join('.');
  return {access_token: token, refresh_token: 'renovar', token_type: 'bearer', expires_in: 30 * 86400, expires_at: expira, user};
}

// Número com número, o resto como texto: as datas do app e dos testes vêm no mesmo formato ISO.
const comparar = (a: unknown, b: unknown) => {
  const [x, y] = [Number(a), Number(b)];
  if (a !== '' && b !== '' && a != null && b != null && !isNaN(x) && !isNaN(y)) return x - y;
  return String(a ?? '') < String(b ?? '') ? -1 : String(a ?? '') > String(b ?? '') ? 1 : 0;
};

// Os filtros e a ordem do PostgREST que o app usa. A ordem conta para "as 500 mais novas" (revisão
// de 19/10): sem ela, a falsa devolvia na ordem da tabela, e um teste do corte passaria por acaso.
function filtrar(linhas: Record<string, unknown>[], busca: URLSearchParams) {
  let saida = linhas;
  for (const [campo, valor] of busca) {
    if (['select', 'order', 'limit', 'offset'].includes(campo)) continue;
    if (valor.startsWith('eq.')) saida = saida.filter(l => String(l[campo]) === valor.slice(3));
    if (valor.startsWith('in.(')) {
      const ok = new Set(valor.slice(4, -1).split(',').map(v => v.replace(/^"|"$/g, '')));
      saida = saida.filter(l => ok.has(String(l[campo])));
    }
    const m = valor.match(/^(gte|gt|lte|lt)\.(.*)$/);
    if (m) saida = saida.filter(l => l[campo] != null && {gte: (c: number) => c >= 0, gt: (c: number) => c > 0, lte: (c: number) => c <= 0, lt: (c: number) => c < 0}[m[1] as 'gte'](comparar(l[campo], m[2])));
    if (valor === 'is.null') saida = saida.filter(l => l[campo] == null);
    if (valor === 'not.is.null') saida = saida.filter(l => l[campo] != null);
  }
  const ordem = busca.get('order');
  if (ordem) {
    const chaves = ordem.split(',').map(o => { const [c, dir] = o.split('.'); return {c, desc: dir === 'desc'}; });
    saida = [...saida].sort((a, b) => {
      for (const {c, desc} of chaves) { const d = comparar(a[c], b[c]); if (d) return desc ? -d : d; }
      return 0;
    });
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
    nuvem.pedidos.push({metodo, caminho, busca: u.search, corpo, prefer: r.request().headers()['prefer'], quem: quemMandou(r.request().headers()['authorization'])});
    if (caminho === 'user') return json(sessaoFalsa().user);
    if (caminho === 'token') return json(sessaoFalsa());
    if (caminho === 'logout') return r.fulfill({status: 204, headers: cors});
    // Como o servidor de verdade: nunca mais que 1.000 linhas por resposta, e calado.
    const MAXIMO = 1000;
    if (caminho.startsWith('rpc/')) {
      const r = nuvem.rpc[caminho.slice(4)];
      const v = typeof r === 'function' ? r(corpo) : r ?? [];
      // função que devolve um valor só (027) volta como ele é
      return json(Array.isArray(v) ? v.slice(0, MAXIMO) : v);
    }
    if (metodo === 'DELETE') return json([{id: 1}]);
    if (metodo !== 'GET') return json([], metodo === 'POST' ? 201 : 200);
    if (caminho === 'perfis' && u.searchParams.get('id') === 'eq.' + EU.id) {
      return r.request().headers()['accept']?.includes('vnd.pgrst.object') ? json(eu) : json([eu]);
    }
    const linhas = filtrar(caminho === 'perfis' ? [eu, ...(nuvem.tabelas.perfis || [])] : nuvem.tabelas[caminho] || [], u.searchParams);
    // o .range() do app chega como offset e limit
    const de = +(u.searchParams.get('offset') || 0);
    return json(linhas.slice(de, de + Math.min(+(u.searchParams.get('limit') || MAXIMO), MAXIMO)));
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
  // no cartão de montar, a ordem escolhida já monta: o de sempre é o melhor caminho
  const montar = page.locator('[data-montar="melhor"]');
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

// O zoom animado do Leaflet já diz o centro e o zoom novos, mas só termina quando a transição acaba
// (250 ms, mais com a máquina ocupada). Ir para longe no mesmo zoom antes disso, e ele volta para
// onde o zoom ia, sozinho; e o fim redesenha os nomes das ruas. Era a instabilidade do teste dos
// nomes no mapa (20/10): o mapa voltava depois de o teste conferir o centro.
const semZoomAnimado = (page: Page) => page.waitForFunction(() => !document.querySelector('.leaflet-zoom-anim'));

// Leva o mapa até um ponto. Pino fora da tela existe no DOM mas não tem texto nenhum, então
// procurar pilha pelo rótulo só funciona olhando para onde ela está.
export async function verNoMapa(page: Page, lat: number, lng: number, z = 18) {
  await page.waitForFunction(() => !!(window as any).rotaTeste);
  // confere que pegou: o mapa pode reenquadrar sozinho logo depois de montar
  await expect.poll(async () => {
    await semZoomAnimado(page);
    await page.evaluate(([a, b, c]) => (window as any).rotaTeste.irPara(a, b, c), [lat, lng, z]);
    // o zoom pedido começa no quadro seguinte: espera ele começar, se começar, e acabar
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await semZoomAnimado(page);
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
