import {readFileSync, existsSync} from 'node:fs';
import type {Browser, Page} from '@playwright/test';
import {test, expect, carregar, aviso, aba, linhaDe, clicarMapa, ROTA_A} from './apoio';

const env = existsSync('.env')
  ? Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)))
  : {};
const URL = env.SUPABASE_URL, SERVICO = env.SUPABASE_SERVICE_ROLE_KEY;
const MOTORISTAS = ['a', 'b', 'c', 'adm'].map(x => ({email: `juniorpiks+compartilha-${x}@hotmail.com`, senha: 'Teste-' + Math.random().toString(36).slice(2) + '-9Z', nome: 'Teste ' + x.toUpperCase(), id: ''}));
const RUA_D = 'Rua D, 49, Perto do Vale';
const PONTO = [-10.9605, -37.0455] as const;

async function api(caminho: string, init: RequestInit = {}) {
  const r = await fetch(URL + caminho, {...init, headers: {apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', Prefer: 'return=representation'}});
  const t = await r.text();
  return {status: r.status, corpo: t ? JSON.parse(t) : null};
}

async function limpar() {
  const {corpo} = await api('/auth/v1/admin/users?per_page=1000');
  for (const u of corpo.users.filter((x: any) => MOTORISTAS.some(m => m.email === x.email))) {
    await api(`/rest/v1/correcoes?motorista_id=eq.${u.id}`, {method: 'DELETE'});
    await api(`/rest/v1/rotas?motorista_id=eq.${u.id}`, {method: 'DELETE'});
    await api(`/auth/v1/admin/users/${u.id}`, {method: 'DELETE'});
  }
}

async function comoMotorista(browser: Browser, m: typeof MOTORISTAS[number]): Promise<Page> {
  const ctx = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1280, height: 900}});
  for (const s of ['router.project-osrm.org', 'nominatim.openstreetmap.org', 'tile.openstreetmap.org', 'viacep.com.br']) await ctx.route(`**://${s}/**`, r => r.abort());
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('./');
  await page.getByLabel('E-mail').fill(m.email);
  await page.getByLabel('Senha').fill(m.senha);
  await page.getByRole('button', {name: 'Entrar', exact: true}).click();
  await expect(page.getByText(`Conectado como ${m.nome}`)).toBeVisible();
  return page;
}

const correcoesDe = async (id: string) => (await api(`/rest/v1/correcoes?motorista_id=eq.${id}&select=chave_lugar,lat,lng`)).corpo;

test.describe('correções compartilhadas @nuvem', () => {
  test.skip(!URL || !SERVICO, 'precisa do .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  test.beforeAll(async () => {
    await limpar();
    for (const m of MOTORISTAS) {
      const r = await api('/auth/v1/admin/users', {method: 'POST', body: JSON.stringify({email: m.email, password: m.senha, email_confirm: true, user_metadata: {nome: m.nome}})});
      expect(r.status).toBe(200);
      m.id = r.corpo.id;
    }
    expect((await api(`/rest/v1/perfis?id=eq.${MOTORISTAS[3].id}`, {method: 'PATCH', body: JSON.stringify({papel: 'admin'})})).status).toBe(200);
  });
  test.afterAll(limpar);

  test('1 motorista vira sugestão, 2 no mesmo ponto viram confirmada, e desfazer apaga da nuvem', async ({browser}) => {
    const [A, B, C] = MOTORISTAS;

    const a = await comoMotorista(browser, A);
    await carregar(a, ROTA_A);
    await aba(a, '2. Conferir');
    await linhaDe(a, RUA_D, 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
    await clicarMapa(a, ...PONTO);
    await aba(a, '1. Endereços');
    await expect(a.getByText('✓ tudo salvo')).toBeVisible({timeout: 30_000});
    expect(await correcoesDe(A.id)).toHaveLength(1);

    const b = await comoMotorista(browser, B);
    await carregar(b, ROTA_A);
    await expect(aviso(b)).toContainText('💡 1 com sugestão de outro motorista');
    const cartaoB = b.locator('[data-item]').filter({hasText: RUA_D});
    await expect(cartaoB).toContainText('Outro motorista marcou este endereço em outro lugar');
    await cartaoB.getByRole('button', {name: 'Usar a posição dele'}).click();
    await expect(aviso(b)).toContainText('Local do outro motorista usado');
    await aba(b, '1. Endereços');
    await expect(b.getByText('✓ tudo salvo')).toBeVisible({timeout: 30_000});

    const c = await comoMotorista(browser, C);
    await carregar(c, ROTA_A);
    await expect(aviso(c)).toContainText('🤝 1 com posição confirmada por outros motoristas');
    await expect(c.locator('[data-item]').filter({hasText: RUA_D})).toContainText('Posição confirmada por 2 motoristas');
    await expect(c.getByText(/❗ 0 para conferir/)).toBeVisible();

    await aba(a, '2. Conferir');
    await linhaDe(a, 'Travessa Um, 45', 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
    await clicarMapa(a, -10.9581, -37.0481);
    await expect.poll(async () => (await correcoesDe(A.id)).length, {timeout: 30_000}).toBe(2);
    await a.getByRole('button', {name: '↺ Desfazer'}).click();
    await expect.poll(async () => (await correcoesDe(A.id)).length, {timeout: 30_000}).toBe(1);
    await aba(a, '1. Endereços');
    await expect(a.getByText('✓ tudo salvo')).toBeVisible();
  });

  test('o administrador vê as marcações, confirma a de um, apaga a de outro e desativa um motorista', async ({browser}) => {
    const [A, B, C, ADM] = MOTORISTAS;
    expect(await correcoesDe(A.id)).toHaveLength(1);
    expect(await correcoesDe(B.id)).toHaveLength(1);
    const adm = await comoMotorista(browser, ADM);
    await adm.getByRole('button', {name: '⚙️ Admin'}).click();
    const lugar = adm.locator('[data-lugar]').filter({has: adm.locator('[data-marcacao="Teste A"]')});
    await expect(lugar).toHaveCount(1);
    await expect(lugar).toContainText('Rua D');
    await expect(lugar).toContainText('Confirmada');

    await lugar.locator('[data-marcacao="Teste B"]').getByRole('button', {name: 'Apagar'}).click();
    await expect(aviso(adm)).toContainText('Marcação apagada.');
    expect(await correcoesDe(B.id)).toHaveLength(0);
    await expect(lugar).toContainText('Sugestão');

    await lugar.locator('[data-marcacao="Teste A"]').getByRole('button', {name: 'Confirmar'}).click();
    await expect(aviso(adm)).toContainText('Posição confirmada');
    const [marcadaPorA] = await correcoesDe(A.id);
    expect(await correcoesDe(ADM.id)).toEqual([{...marcadaPorA}]);
    await expect(lugar).toContainText('Confirmada');

    await adm.locator(`[data-motorista="${C.nome}"]`).getByRole('button', {name: 'Desativar'}).click();
    await expect(aviso(adm)).toContainText('desativado(a)');
    expect((await api(`/rest/v1/perfis?id=eq.${C.id}&select=ativo`)).corpo[0].ativo).toBe(false);
  });
});
