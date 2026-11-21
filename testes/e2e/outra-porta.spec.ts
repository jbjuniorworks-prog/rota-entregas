import type {Page} from '@playwright/test';
import {abrir, aviso, carregar, expect, menu, test, type NuvemFalsa} from './apoio';

// Dono, 21/11: dois clientes no mesmo número (Chico Mendes 100 e 15, Matapoã 42) dividiam a porta,
// e a entrega certa de um virava disputa com a do outro. Separar era um script. Agora o Admin separa
// na disputa, e a próxima planilha leva aquela entrada para a porta dela. Planilha inventada (rota-e:
// a mesma rodovia e o mesmo número para a mercearia, o condomínio e uma casa).
const ROTA_E = 'testes/planilhas/rota-e.xlsx';
const ROTA_F = 'testes/planilhas/rota-f.xlsx';
const CONDOMINIO = {lat: -10.9626, lng: -37.05};
const DA_PLANILHA = {lat: -10.95, lng: -37.05};
const BOTAO = 'Separar como outra porta';

interface Pacote {rota_id: string; endereco: string; bairro: string | null; cep: string | null; chave_lugar: string}
const paradas = (page: Page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as {texto: string; lat: number; lng: number; separada?: boolean}[]);
const subidos = (nuvem: NuvemFalsa) => nuvem.pedidos.filter(p => p.metodo === 'POST' && p.caminho === 'pacotes').flatMap(p => p.corpo as Pacote[]);
const portasGravadas = (nuvem: NuvemFalsa) => nuvem.pedidos.filter(p => p.metodo === 'POST' && p.caminho === 'correcoes').map(p => p.corpo);
const decididas = (nuvem: NuvemFalsa) => nuvem.pedidos.filter(p => p.caminho === 'rpc/decidir_marcas').map(p => p.corpo);

test.use({papel: 'admin', viewport: {width: 412, height: 915}});

// A nuvem falsa guarda o que o Admin gravou e responde as portas com isso, como a de verdade.
function lembrarAsPortas(nuvem: NuvemFalsa) {
  nuvem.rpc.posicoes = (corpo: {chaves: string[]}) => portasGravadas(nuvem)
    .flatMap(c => Array.isArray(c) ? c : [c])
    .filter((c: any) => corpo.chaves.includes(c.chave_lugar))
    .map((c: any) => ({chave_lugar: c.chave_lugar, lat: c.lat, lng: c.lng, situacao: 'confirmado', motoristas: 1, entregas: 0, fonte: 'admin', minha: false}));
}

// Lê a rota-e e devolve os pacotes da rodovia como subiram para a nuvem.
async function lerARodovia(page: Page, nuvem: NuvemFalsa): Promise<Pacote[]> {
  await carregar(page, ROTA_E);
  await expect.poll(() => subidos(nuvem).length).toBeGreaterThan(0);
  return subidos(nuvem).filter(p => p.endereco.startsWith('Rodovia'));
}

// O Luan entregou no condomínio, longe da porta geral verificada: a marca dele fica em disputa.
function emDisputa(nuvem: NuvemFalsa, doLuan: Pacote[]) {
  const chave = doLuan[0].chave_lugar;
  nuvem.tabelas = {
    perfis: [{id: 'm1', nome: 'Luan', papel: 'motorista', ativo: true, conferir: false}],
    rotas: [{id: doLuan[0].rota_id, motorista_id: 'm1'}],
    pacotes: doLuan.map(p => ({...p, criado_em: new Date().toISOString()})),
    correcoes: [],
  };
  nuvem.rpc.marcas_em_conferencia = [{
    motorista_id: 'm1', nome: 'Luan', chave_lugar: chave, endereco: doLuan[0].endereco, criado_em: new Date().toISOString(),
    situacao: 'confirmado', ...DA_PLANILHA, lat_antes: DA_PLANILHA.lat, lng_antes: DA_PLANILHA.lng, situacao_antes: 'confirmado',
    pino_lat: null, pino_lng: null, no_pino: false, disputa: true, marca_lat: CONDOMINIO.lat, marca_lng: CONDOMINIO.lng,
  }];
  return chave;
}

async function separarNaDisputa(page: Page, chave: string) {
  await menu(page, /^Admin/);
  await page.locator(`[data-secao="Em conferência"] [data-conferir="${chave}"]`).getByRole('button', {name: BOTAO}).click();
}

test('separada no Admin, a próxima planilha leva aquela entrada para a porta dela, e as outras ficam', async ({page, nuvem}) => {
  page.on('dialog', d => d.accept());
  lembrarAsPortas(nuvem);
  await abrir(page);
  const rodovia = await lerARodovia(page, nuvem);
  const condominio = rodovia.find(p => p.endereco.includes('condomínio'))!;
  const chave = emDisputa(nuvem, [condominio]);

  await separarNaDisputa(page, chave);
  await expect(aviso(page)).toContainText('Separada: a entrada "por tras do condominio portal teste" tem a porta dela.');

  // a planilha lida de novo, num celular sem a rota
  await page.evaluate(() => localStorage.removeItem('rota-entregas-v2'));
  await page.reload();
  await carregar(page, ROTA_E);
  await expect(aviso(page)).toContainText('com as entregas separadas pelo complemento');
  const todas = await paradas(page);
  expect(todas.find(p => p.texto.includes('condomínio'))).toMatchObject({separada: true, lat: CONDOMINIO.lat, lng: CONDOMINIO.lng});
  for (const p of todas.filter(p => p.texto.startsWith('Rodovia') && !p.texto.includes('condomínio'))) expect(p.lat).toBeCloseTo(DA_PLANILHA.lat, 3);
});

// O Matapoã 42 tem CEP próprio: a chave da entrada sai do CEP, que o pacote guarda à parte do endereço.
test('com CEP próprio, a próxima planilha também leva a entrada separada para a porta dela', async ({page, nuvem}) => {
  page.on('dialog', d => d.accept());
  lembrarAsPortas(nuvem);
  await abrir(page);
  await carregar(page, ROTA_F);
  await expect.poll(() => subidos(nuvem).length).toBeGreaterThan(0);
  const blocoD = subidos(nuvem).find(p => p.endereco.includes('bloco D'))!;
  expect(blocoD.cep, 'a premissa: o pacote guarda o CEP à parte').toBe('49098232');
  const chave = emDisputa(nuvem, [blocoD]);
  await separarNaDisputa(page, chave);
  await expect(aviso(page)).toContainText('Separada:');
  await page.evaluate(() => localStorage.removeItem('rota-entregas-v2'));
  await page.reload();
  await carregar(page, ROTA_F);
  const todas = await paradas(page);
  expect(todas.find(p => p.texto.includes('bloco D'))).toMatchObject({separada: true, lat: CONDOMINIO.lat, lng: CONDOMINIO.lng});
});

test('separar grava só a porta da entrada, no ponto da marca, e tira a marca da disputa', async ({page, nuvem}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  const condominio = (await lerARodovia(page, nuvem)).find(p => p.endereco.includes('condomínio'))!;
  const chave = emDisputa(nuvem, [condominio]);
  await separarNaDisputa(page, chave);
  await expect(aviso(page)).toContainText('Separada:');
  expect(portasGravadas(nuvem)).toEqual([{chave_lugar: `${chave}|por tras do condominio portal teste`, ...CONDOMINIO}]);
  expect(decididas(nuvem)).toEqual([{motorista: 'm1', chaves: [chave], aprovar: false}]);
});

test('sem a separação, a planilha não separa nada: a marca em disputa não cria porta', async ({page, nuvem}) => {
  page.on('dialog', d => d.accept());
  lembrarAsPortas(nuvem);
  await abrir(page);
  await lerARodovia(page, nuvem);
  expect((await paradas(page)).filter(p => p.separada)).toEqual([]);
  expect(portasGravadas(nuvem)).toEqual([]);
});

test('cancelar a confirmação não grava nada', async ({page, nuvem}) => {
  await abrir(page);
  const condominio = (await lerARodovia(page, nuvem)).find(p => p.endereco.includes('condomínio'))!;
  const chave = emDisputa(nuvem, [condominio]);
  page.once('dialog', d => { expect(d.message()).toContain('A porta geral não muda.'); d.dismiss(); });
  await separarNaDisputa(page, chave);
  await expect(page.getByRole('button', {name: BOTAO})).toBeEnabled();
  expect(portasGravadas(nuvem)).toEqual([]);
  expect(decididas(nuvem)).toEqual([]);
});

test('com entregas de entradas diferentes no número, não escolhe nenhuma e diz por quê', async ({page, nuvem}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  const chave = emDisputa(nuvem, await lerARodovia(page, nuvem));
  await separarNaDisputa(page, chave);
  await expect(aviso(page)).toContainText('Luan tinha neste número entregas de entradas diferentes');
  expect(portasGravadas(nuvem)).toEqual([]);
  expect(decididas(nuvem)).toEqual([]);
});

test('sem complemento no pacote, não há outra porta', async ({page, nuvem}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  const casa = (await lerARodovia(page, nuvem)).find(p => p.endereco === 'Rodovia Teste Ecológica, 67')!;
  const chave = emDisputa(nuvem, [casa]);
  await separarNaDisputa(page, chave);
  await expect(aviso(page)).toContainText('não tem complemento: não há outra porta para separar');
  expect(portasGravadas(nuvem)).toEqual([]);
});
