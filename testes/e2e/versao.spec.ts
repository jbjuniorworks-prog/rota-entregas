import {abrir, carregar, ROTA_A, test, expect} from './apoio';

// Luan, 02/10: a aba do Chrome aberta desde a véspera leu a planilha com a versão antiga, e o pino
// que o censo consertaria ficou a 739 m. O app pergunta qual é a versão publicada.
const OUTRA = {id: 'publicada-depois', quando: '02/10 13:10'};
const publicarOutra = (page) => page.route('**/versao.json*', r => r.fulfill({json: OUTRA}));

test('sem entrega pendente, a versão nova entra sozinha, e só uma vez', async ({page}) => {
  await publicarOutra(page);
  await abrir(page);
  await expect(page).toHaveURL(/\?v=publicada-depois/);
  // o servidor ainda manda a antiga (aqui, sempre): no lugar de recarregar de novo, avisa
  await expect(page.locator('[data-versao-nova]')).toContainText('Versão nova do app, de 02/10 13:10');
});

test('com rota andando, avisa e espera ele tocar em Atualizar; a rota continua', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  const antes = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas.length);
  await publicarOutra(page);
  await page.reload();
  await expect(page.locator('[data-versao-nova]')).toContainText('A rota continua como está');
  await expect(page).not.toHaveURL(/\?v=/);
  await page.locator('[data-versao-nova]').getByRole('button', {name: 'Atualizar'}).click();
  await expect(page).toHaveURL(/\?v=publicada-depois/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas.length)).toBe(antes);
});

test('a mesma versão não mostra nada, e a aba Endereços diz qual é', async ({page}) => {
  await abrir(page);
  await expect(page.locator('[data-versao]')).toContainText(/Versão do app: \d\d\/\d\d/);
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-versao-nova]')).toHaveCount(0);
  await expect(page).not.toHaveURL(/\?v=/);
});

// Fora da tela por pouco tempo pode ser o seletor de arquivos, com a planilha escolhida: recarregar
// perderia a escolha. Por muito tempo, é a aba esquecida desde a véspera.
test('voltando para a tela: logo depois só avisa; depois de muito tempo fora, recarrega', async ({page}) => {
  // a pergunta da abertura tem de ver a versão de agora, senão ela mesma recarrega
  const primeira = page.waitForResponse(r => r.url().includes('versao.json'));
  await abrir(page);
  await primeira;
  await publicarOutra(page);
  const sair = (minutos: number) => page.evaluate(m => {
    Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
    const agora = Date.now.bind(Date);
    Date.now = () => agora() + m * 60000;
    Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
  }, minutos);
  await sair(2);
  await expect(page.locator('[data-versao-nova]')).toBeVisible();
  await expect(page).not.toHaveURL(/\?v=/);
  await sair(11);
  await expect(page).toHaveURL(/\?v=publicada-depois/);
});

// O compartilhamento sai da fila do aparelho quando a leitura começa: recarregar no meio perdia
// os prints. De manhã, sem nenhuma parada, é justo quando o app recarregaria sozinho.
test('lendo o que foi compartilhado, a versão nova espera', async ({page}) => {
  const {readFileSync} = await import('node:fs');
  await abrir(page);
  const planilha = readFileSync('testes/planilhas/rota-d.xlsx').toString('base64');
  await page.evaluate(async b64 => {
    const c = await caches.open('compartilhado');
    await c.put('./compartilhado/img0', new Response(new Blob([Uint8Array.from(atob(b64), x => x.charCodeAt(0))])));
  }, planilha);
  await publicarOutra(page);
  // a leitura da planilha demora o bastante para a pergunta da versão voltar antes dela
  await page.route('**/assets/xlsx-*.js', async r => { await new Promise(f => setTimeout(f, 3000)); await r.continue(); });
  await page.goto('./?compartilhado=1');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-v2') || '{}').paradas?.length || 0), {timeout: 30_000}).toBeGreaterThan(0);
  await expect(page).not.toHaveURL(/\?v=/);
  await expect(page.locator('[data-versao-nova]')).toBeVisible();
});
