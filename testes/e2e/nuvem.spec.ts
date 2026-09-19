import {readFileSync, existsSync} from 'node:fs';
import {test, expect, carregar, montar, ordem, linhaDe, ROTA_A} from './apoio';

const env = existsSync('.env')
  ? Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)))
  : {};
const URL = env.SUPABASE_URL, SERVICO = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'juniorpiks+motorista-teste@hotmail.com';
const SENHA = 'Teste-' + Math.random().toString(36).slice(2) + '-9Z';

async function api(caminho: string, init: RequestInit = {}, chave = SERVICO) {
  const r = await fetch(URL + caminho, {...init, headers: {apikey: SERVICO, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {})}});
  const t = await r.text();
  return {status: r.status, corpo: t ? JSON.parse(t) : null};
}

async function apagarMotoristaDeTeste() {
  const {corpo} = await api('/auth/v1/admin/users?per_page=200');
  const u = corpo.users.find((x: any) => x.email === EMAIL);
  if (!u) return;
  await api(`/rest/v1/correcoes?motorista_id=eq.${u.id}`, {method: 'DELETE'});
  await api(`/rest/v1/rotas?motorista_id=eq.${u.id}`, {method: 'DELETE'});
  await api(`/auth/v1/admin/users/${u.id}`, {method: 'DELETE'});
}

test.describe('nuvem @nuvem', () => {
  test.use({papel: null});
  test.skip(!URL || !SERVICO, 'precisa do .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  let uid = '';

  test.beforeAll(async () => {
    await apagarMotoristaDeTeste();
    const r = await api('/auth/v1/admin/users', {method: 'POST', body: JSON.stringify({email: EMAIL, password: SENHA, email_confirm: true, user_metadata: {nome: 'Motorista Teste'}})});
    expect(r.status).toBe(200);
    uid = r.corpo.id;
  });
  test.afterAll(apagarMotoristaDeTeste);

  test('rota, entregas e correção chegam ao banco, e o motorista não passa das regras', async ({page}) => {
    await page.goto('./');
    await page.getByLabel('E-mail').fill(EMAIL);
    await page.getByLabel('Senha').fill(SENHA);
    await page.getByRole('button', {name: 'Entrar', exact: true}).click();
    await expect(page.getByText('Conectado como Motorista Teste')).toBeVisible();

    await carregar(page, ROTA_A);
    await montar(page);
    const primeira = (await ordem(page, ['Rua das Acácias, 10,', 'Rua das Acácias, 120', 'Rua dos Ipês, 300, Bloco A', 'Avenida Central', 'Travessa Um', 'Rua das Palmeiras', 'Rua das Flores', 'Alameda dos Coqueiros']))[0];
    await linhaDe(page, primeira, 'Entregue').getByRole('button', {name: 'Entregue'}).click();
    await page.getByRole('button', {name: '1. Endereços'}).click();
    await expect(page.getByText('✓ tudo salvo')).toBeVisible({timeout: 30_000});

    const rotas = (await api(`/rest/v1/rotas?motorista_id=eq.${uid}&select=id,at_id`)).corpo;
    expect(rotas).toHaveLength(1);
    expect(rotas[0].at_id).toBe('ATTESTE0001');
    const pacotes = (await api(`/rest/v1/pacotes?rota_id=eq.${rotas[0].id}&select=spx_tn,entregue_em,linha`)).corpo;
    expect(pacotes).toHaveLength(12);
    expect(pacotes.every((p: any) => Object.keys(p.linha).length === 10)).toBe(true);
    expect(pacotes.filter((p: any) => p.entregue_em).length).toBeGreaterThan(0);

    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-auth') || '{}').access_token);
    const admin = (await api('/rest/v1/perfis?papel=eq.admin&select=id')).corpo[0].id;
    expect((await api('/rest/v1/rotas', {method: 'POST', body: JSON.stringify({motorista_id: admin, at_id: 'FORJADA'})}, token)).status).toBe(403);
    await api(`/rest/v1/perfis?id=eq.${uid}`, {method: 'PATCH', body: JSON.stringify({papel: 'admin'})}, token);
    expect((await api(`/rest/v1/perfis?id=eq.${uid}&select=papel`)).corpo[0].papel).toBe('motorista');
    await api(`/rest/v1/rotas?id=eq.${rotas[0].id}`, {method: 'DELETE'}, token);
    expect((await api(`/rest/v1/rotas?motorista_id=eq.${uid}&select=id`)).corpo).toHaveLength(1);
  });
});
