import {readFileSync, existsSync} from 'node:fs';
import {test, expect, carregar, montar, ordem, linhaDe, ROTA_A} from './apoio';

const env = existsSync('.env')
  ? Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)))
  : {};
const URL = env.SUPABASE_URL, SERVICO = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'juniorpiks+motorista-teste@hotmail.com';
const SENHA = 'Teste-' + Math.random().toString(36).slice(2) + '-9Z';
const RUA_TESTE = 'rua so de teste automatizado';

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
  await api(`/rest/v1/observacoes?motorista_id=eq.${u.id}`, {method: 'DELETE'});
  await api(`/rest/v1/lugares?motorista_id=eq.${u.id}`, {method: 'DELETE'});
  await api(`/rest/v1/ruas?nome_chave=eq.${encodeURIComponent(RUA_TESTE)}&fonte=eq.entregas`, {method: 'DELETE'});
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
    await page.getByLabel('Senha', {exact: true}).fill(SENHA);
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
    // A linha crua da planilha não sobe mais: podia levar nome, telefone ou CPF junto (38b3e0b).
    expect(pacotes.every((p: any) => p.linha === null)).toBe(true);
    expect(pacotes.filter((p: any) => p.entregue_em).length).toBeGreaterThan(0);

    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-auth') || '{}').access_token);
    const admin = (await api('/rest/v1/perfis?papel=eq.admin&select=id')).corpo[0].id;
    expect((await api('/rest/v1/rotas', {method: 'POST', body: JSON.stringify({motorista_id: admin, at_id: 'FORJADA'})}, token)).status).toBe(403);
    await api(`/rest/v1/perfis?id=eq.${uid}`, {method: 'PATCH', body: JSON.stringify({papel: 'admin'})}, token);
    expect((await api(`/rest/v1/perfis?id=eq.${uid}&select=papel`)).corpo[0].papel).toBe('motorista');
    await api(`/rest/v1/rotas?id=eq.${rotas[0].id}`, {method: 'DELETE'}, token);
    expect((await api(`/rest/v1/rotas?motorista_id=eq.${uid}&select=id`)).corpo).toHaveLength(1);
  });

  test('o CEP aprende com as entregas marcadas na porta', async ({page}) => {
    await page.goto('./');
    await page.getByLabel('E-mail').fill(EMAIL);
    await page.getByLabel('Senha', {exact: true}).fill(SENHA);
    await page.getByRole('button', {name: 'Entrar', exact: true}).click();
    await expect(page.getByText('Conectado como Motorista Teste')).toBeVisible();
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-auth') || '{}').access_token);

    // CEP inventado, para não mexer em nada que os motoristas de verdade já ensinaram
    const CEP = '49099999';
    const pontos = [[-10.9500, -37.0900], [-10.9510, -37.0910], [-10.9520, -37.0920]];
    for (const [i, [lat, lng]] of pontos.entries()) {
      const r = await api('/rest/v1/observacoes', {method: 'POST', body: JSON.stringify({
        chave_lugar: `${CEP}|${(i + 1) * 10}`, lat, lng, precisao_m: 10, rua: 'Rua de Teste',
      })}, token);
      expect(r.status).toBe(201);
    }

    const {status, corpo} = await api('/rest/v1/rpc/ancoras_de_cep', {method: 'POST', body: JSON.stringify({ceps: [CEP]})}, token);
    expect(status).toBe(200);
    expect(corpo).toHaveLength(1);
    expect(corpo[0].cep).toBe(CEP);
    expect(corpo[0].marcas).toBe(3);
    expect(corpo[0].lat).toBeCloseTo(-10.9510, 4);
    expect(corpo[0].lng).toBeCloseTo(-37.0910, 4);
    // o raio é o espalhamento das próprias marcações, não um número fixo
    expect(corpo[0].raio).toBeGreaterThan(100);
    expect(corpo[0].raio).toBeLessThan(300);

    // CEP sobre o qual ninguém ensinou nada não inventa resposta
    expect((await api('/rest/v1/rpc/ancoras_de_cep', {method: 'POST', body: JSON.stringify({ceps: ['49098888']})}, token)).corpo).toHaveLength(0);
  });

  test('a rua que nenhum mapa tem nasce das entregas feitas nela', async ({page}) => {
    await page.goto('./');
    await page.getByLabel('E-mail').fill(EMAIL);
    await page.getByLabel('Senha', {exact: true}).fill(SENHA);
    await page.getByRole('button', {name: 'Entrar', exact: true}).click();
    await expect(page.getByText('Conectado como Motorista Teste')).toBeVisible();
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-auth') || '{}').access_token);

    const passagem = (porta: string, lat: number, lng: number) => api('/rest/v1/observacoes', {method: 'POST', body: JSON.stringify({
      chave_lugar: porta, lat, lng, precisao_m: 12, rua: 'Rua Só De Teste Automatizado', rua_chave: RUA_TESTE,
    })}, token);

    // uma porta só não desenha rua: é assim que nome mal lido é barrado
    expect((await passagem('49097001|10', -10.9450, -37.0820)).status).toBe(201);
    await api(`/rest/v1/perfis?id=eq.${uid}`, {method: 'PATCH', body: JSON.stringify({papel: 'admin'})});
    let r = await api('/rest/v1/rpc/criar_ruas_das_entregas', {method: 'POST', body: JSON.stringify({vao_maximo: 2000, apenas: [RUA_TESTE]})}, token);
    expect(r.status).toBe(200);
    expect(r.corpo[0].gravadas).toBe(0);

    // a segunda porta confirma o nome, e aí a rua nasce
    expect((await passagem('49097001|40', -10.9455, -37.0825)).status).toBe(201);
    r = await api('/rest/v1/rpc/criar_ruas_das_entregas', {method: 'POST', body: JSON.stringify({vao_maximo: 2000, apenas: [RUA_TESTE]})}, token);
    expect(r.corpo[0].gravadas).toBe(1);

    const [rua] = (await api(`/rest/v1/ruas?nome_chave=eq.${encodeURIComponent(RUA_TESTE)}&select=nome,cidade,bairro,linha,fonte,lat,lng`)).corpo;
    expect(rua.fonte).toBe('entregas');
    expect(rua.nome).toBe('Rua Só De Teste Automatizado');
    expect(rua.cidade).toBe('Aracaju');
    expect(rua.linha).toHaveLength(2);
    expect(rua.lat).toBeCloseTo(-10.94525, 4);

    // rodar de novo não duplica: atualiza a mesma
    r = await api('/rest/v1/rpc/criar_ruas_das_entregas', {method: 'POST', body: JSON.stringify({vao_maximo: 2000, apenas: [RUA_TESTE]})}, token);
    expect(r.corpo[0].gravadas).toBe(1);
    expect((await api(`/rest/v1/ruas?nome_chave=eq.${encodeURIComponent(RUA_TESTE)}&select=id`)).corpo).toHaveLength(1);
  });

  test('a origem de cada posição chega ao banco', async ({page}) => {
    await page.goto('./');
    await page.getByLabel('E-mail').fill(EMAIL);
    await page.getByLabel('Senha', {exact: true}).fill(SENHA);
    await page.getByRole('button', {name: 'Entrar', exact: true}).click();
    await expect(page.getByText('Conectado como Motorista Teste')).toBeVisible();
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-auth') || '{}').access_token);

    const rota = (await api('/rest/v1/rotas', {method: 'POST', body: JSON.stringify({at_id: 'ATREGISTRO001'})}, token)).corpo[0];
    await api('/rest/v1/pacotes', {method: 'POST', body: JSON.stringify([
      {rota_id: rota.id, spx_tn: 'BRTESTE0001', endereco: 'Rua de Teste, 10'},
    ])}, token);

    // é isto que o app faz ao fim da busca de endereços; sem a permissão de coluna ele
    // devolvia 0 e a fila descartava calada, deixando fonte e precisao nulos para sempre
    const r = await api('/rest/v1/rpc/registrar_posicoes', {method: 'POST', body: JSON.stringify({
      rota: rota.id,
      itens: [{tn: 'BRTESTE0001', lat: -10.95, lng: -37.05, fonte: 'IBGE', precisao: 'bom'}],
    })}, token);
    expect(r.status).toBe(200);
    expect(r.corpo, 'o registro tem de alcançar o pacote').toBe(1);

    const [p] = (await api(`/rest/v1/pacotes?rota_id=eq.${rota.id}&select=lat,lng,fonte,precisao`)).corpo;
    expect(p.fonte).toBe('IBGE');
    expect(p.precisao).toBe('bom');
    expect(p.lat).toBeCloseTo(-10.95, 4);

    // e não deixa mexer em rota de outro motorista
    const outra = (await api('/rest/v1/rotas?select=id&at_id=neq.ATREGISTRO001&limit=1')).corpo[0];
    if (outra) {
      const alheia = await api('/rest/v1/rpc/registrar_posicoes', {method: 'POST', body: JSON.stringify({
        rota: outra.id, itens: [{tn: 'X', lat: 0, lng: 0, fonte: 'x', precisao: 'x'}],
      })}, token);
      expect(alheia.corpo, 'não pode escrever na rota de outro').toBe(0);
    }
  });
});
