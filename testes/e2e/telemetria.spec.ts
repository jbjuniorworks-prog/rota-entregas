import type {Page} from '@playwright/test';
import {abrir, aviso, colar, expect, test, type NuvemFalsa} from './apoio';

// O registro de cada busca de lista (026). Vale pouco se não chegar, e não pode custar nada ao
// motorista: estes testes seguem o caminho inteiro, da lista colada até o pedido que o banco recebe.

const LISTA = ['Rua Teste Um, 10, Centro', 'Rua Teste Dois, 20, Centro', 'Avenida Teste Tres, 30, Centro'];
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};

const enviados = (nuvem: NuvemFalsa) => nuvem.pedidos.filter(p => p.caminho === 'buscas_de_lista' && p.metodo === 'POST');
const corpo = (c: unknown) => (Array.isArray(c) ? c[0] : c) as Record<string, unknown>;
const guardados = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rota-entregas-buscas') || '[]') as {id: string}[]);

async function colarLista(page: Page) {
  await abrir(page);
  await colar(page);
  await page.getByLabel('Cidade padrão').fill('Aracaju, SE');
  await page.getByLabel(/Endereços da área/).fill(LISTA.join('\n'));
  await page.getByRole('button', {name: /^Adicionar em/}).click();
}

test('a busca de uma lista colada manda um registro só com números, que o banco ignora se repetir', async ({page, nuvem}) => {
  await colarLista(page);
  await expect.poll(() => enviados(nuvem).length, {timeout: 40_000}).toBe(1);
  const pedido = enviados(nuvem)[0], ev = corpo(pedido.corpo);

  // o "se já existe, ignora" é do banco, pelo id: a fila pode reenviar sem saber se chegou
  expect(pedido.busca).toContain('on_conflict=id');
  expect(pedido.prefer).toContain('resolution=ignore-duplicates');
  expect(ev.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // de quem buscou: se outra conta entrar no aparelho antes do envio, o banco recusa
  expect(ev.motorista_id).toBe('00000000-0000-4000-8000-000000000001');
  expect(ev.origem).toBe('colada');
  expect(ev.paradas).toBe(3);
  expect(ev.pendentes).toBe(3);
  const n = (k: string) => ev[k] as number;
  const soma = Object.keys(ev).filter(k => k.startsWith('terminou_')).reduce((s, k) => s + n(k), 0);
  expect(soma, 'onde cada pendente terminou soma as pendentes').toBe(3);
  expect(n('tempo_ms')).toBeGreaterThanOrEqual(n('nominatim_espera_ms') + n('nominatim_ms') + n('banco_ms') + n('censo_ms') + n('cep_ms'));
  for (const k of Object.keys(ev)) if (!['id', 'motorista_id', 'origem', 'buscado_em', 'versao'].includes(k)) expect(Number.isInteger(ev[k]), k).toBe(true);
  // e nada da lista sai daqui
  const texto = JSON.stringify(ev);
  for (const s of ['Rua', 'Teste', 'Centro', 'Aracaju', 'Avenida']) expect(texto).not.toContain(s);
  await expect.poll(() => guardados(page)).toEqual([]);
});

test('sem rede na hora do envio, o registro fica no aparelho e volta com o mesmo id', async ({page, nuvem}) => {
  let semRede = true;
  await page.route('**/rest/v1/buscas_de_lista**', r => semRede ? r.abort() : r.fallback());
  await colarLista(page);
  await expect.poll(async () => (await guardados(page)).length, {timeout: 40_000}).toBe(1);
  const [{id}] = await guardados(page);
  expect(enviados(nuvem)).toHaveLength(0);

  // fechar e abrir o app com sinal de volta
  semRede = false;
  await page.reload();
  await expect.poll(() => enviados(nuvem).length, {timeout: 20_000}).toBe(1);
  expect(corpo(enviados(nuvem)[0].corpo).id).toBe(id);
  await expect.poll(() => guardados(page)).toEqual([]);
});

test('recusado pelo banco (motorista desativado) sai calado e não atrapalha a busca', async ({page}) => {
  await page.route('**/rest/v1/buscas_de_lista**', r => r.request().method() === 'OPTIONS'
    ? r.fulfill({status: 204, headers: CORS})
    : r.fulfill({status: 403, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({code: '42501', message: 'new row violates row-level security policy for table "buscas_de_lista"'})}));
  await colarLista(page);
  await expect(aviso(page)).toContainText(/Pronto|Alguns falharam/, {timeout: 40_000});
  await expect.poll(() => guardados(page)).toEqual([]);
  await expect(page.getByText(/recusou um envio/)).toHaveCount(0);
});
