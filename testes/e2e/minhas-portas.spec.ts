import type {Page} from '@playwright/test';
import {abrir, carregar, EU, lista, menu, montar, test, expect, ROTA_A} from './apoio';

// Luan, pelo dono, 15/11: "aquela lista de verificados aparecendo pra eles também". Cada motorista
// vê as portas verificadas das rotas dele; as dos outros não aparecem.
const diaEmMaceio = (atras: number) => new Date(Date.now() - atras * 864e5).toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});
const horasAtras = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const HOJE = diaEmMaceio(0), ONTEM = diaEmMaceio(1);

// Endereços inventados. Na rota de ontem, duas portas verificadas; na de hoje, uma verificada e uma
// entregue sem marca. A rota de outro motorista, com uma porta verificada, não pode entrar na conta.
const ROTAS = [
  {id: 'r-ontem', motorista_id: EU.id, dia: ONTEM, arquivo: 'ontem.xlsx'},
  {id: 'r-hoje', motorista_id: EU.id, dia: HOJE, arquivo: 'hoje.xlsx'},
  {id: 'r-outro', motorista_id: 'outro-motorista', dia: HOJE, arquivo: 'do-outro.xlsx'},
];
const pacote = (rota_id: string, chave: string, endereco: string, entregue: boolean) =>
  ({rota_id, chave_lugar: chave, endereco, lat: -10.95, lng: -37.05, entregue_em: entregue ? horasAtras(3) : null});
const PACOTES = [
  pacote('r-ontem', '49000-001|10', 'Rua Inventada A, 10', true),
  pacote('r-ontem', '49000-001|20', 'Rua Inventada A, 20', true),
  pacote('r-hoje', '49000-001|30', 'Rua Inventada B, 30', true),
  pacote('r-hoje', '49000-001|40', 'Rua Inventada B, 40', true),
  pacote('r-hoje', '49000-001|50', 'Rua Inventada B, 50', false),
  pacote('r-outro', '49000-001|60', 'Rua Inventada C, 60', true),
];
const VERIFICADAS = new Set(['49000-001|10', '49000-001|20', '49000-001|30', '49000-001|60']);

async function comAsRotas(page: Page, nuvem: {tabelas: Record<string, unknown[]>; rpc: Record<string, unknown>}) {
  nuvem.tabelas.rotas = ROTAS;
  nuvem.tabelas.pacotes = PACOTES;
  nuvem.rpc.posicoes = (corpo: {chaves: string[]}) => corpo.chaves.filter(k => VERIFICADAS.has(k))
    .map(k => ({chave_lugar: k, lat: -10.95, lng: -37.05, situacao: 'confirmado', motoristas: 1, minha: false}));
  await abrir(page);
  await menu(page, 'Minhas portas verificadas');
  await expect(page.locator('.cabecalho .titulo')).toHaveText('Minhas portas verificadas');
}

for (const papel of ['motorista', 'admin'] as const) {
  test.describe(`as portas verificadas do próprio motorista (${papel})`, () => {
    test.use({viewport: {width: 412, height: 915}, papel});

    test('o total e cada rota são só dele; o porquê abre na rota', async ({page, nuvem}) => {
      await comAsRotas(page, nuvem as never);
      const tela = page.locator('[data-minhas-portas]');
      await expect(tela.locator('[data-total]')).toHaveText('3 de 4 endereço(s) entregue(s) com a porta verificada (75%), em 2 rota(s).');
      await expect(tela.locator('[data-rota]')).toHaveCount(2);
      await expect(tela.locator('[data-rota="r-outro"]')).toHaveCount(0);
      // a mais nova primeiro
      await expect(tela.locator('[data-rota]').first()).toHaveAttribute('data-rota', 'r-hoje');
      await expect(tela.locator('[data-rota="r-hoje"]')).toContainText('1 de 2 verificado(s)');
      await expect(tela.locator('[data-rota="r-ontem"]')).toContainText('2 de 2 verificado(s)');
      // tudo verificado: nada para explicar
      await expect(tela.locator('[data-rota="r-ontem"]').getByRole('button')).toHaveCount(0);

      await tela.locator('[data-rota="r-hoje"]').getByRole('button', {name: 'Por que algum não verificou?'}).click();
      const porque = tela.locator('[data-porque="r-hoje"]');
      await expect(porque).toContainText('A entrega não marcou o lugar (1)');
      await expect(porque).toContainText('Rua Inventada B, 40');
      await expect(porque).not.toContainText('Rua Inventada C');
    });
  });
}

// Dono, 15/11: "no fim da rota"; e, na tela dos pinos, "a da própria rota, o que eles forem
// verificando, só mostra 13/45".
test.describe('a tela dos 14 dias pelo fim da rota, e a porta das entregues de hoje verificada', () => {
  test.use({viewport: {width: 412, height: 915}});

  const entregues = (page: Page) => page.evaluate(() =>
    JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.filter((p: {entregue: boolean}) => p.entregue).length as number);

  test('abre do cartão de fim da rota, e o voltar leva de volta a ele', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const fim = page.locator('[data-folha="fim"]');
    for (let i = 0; i < 20 && !(await fim.isVisible()); i++) {
      await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
      await page.waitForTimeout(150);
    }
    await expect(fim).toBeVisible();
    await fim.locator('[data-minhas-portas-abrir="fim"]').click();
    await expect(page.locator('.cabecalho .titulo')).toHaveText('Minhas portas verificadas');
    await page.locator('.cabecalho').getByRole('button', {name: 'Voltar'}).click();
    await expect(fim).toBeVisible();
    // na lista, atalho nenhum: a tela abre pelo Mais e pelo cartão do fim
    await lista(page);
    await expect(page.locator('[data-minhas-portas-abrir]')).toHaveCount(0);
  });

  // A nuvem de mentira dá como verificada só a pergunta pelas entregues (uma ou duas chaves): a dos
  // pinos que faltam (oito ou nove) volta vazia, para nenhum pino que falta mudar e contar junto.
  const verificaAsEntregues = (nuvem: {rpc: Record<string, unknown>}) => {
    nuvem.rpc.posicoes = (corpo: {chaves: string[]}) => corpo.chaves.length <= 2
      ? corpo.chaves.map(k => ({chave_lugar: k, lat: -10.95, lng: -37.05, situacao: 'confirmado', motoristas: 2, minha: true}))
      : [];
  };
  const entregarUma = async (page: Page) => {
    await page.locator('[data-folha="proxima"] [data-acao="entregue"]').first().click();
    await expect.poll(() => entregues(page)).toBeGreaterThan(0);
    return entregues(page);
  };
  // O topo mostrava "N/M verificados" até 17/11, quando passou a contar as paradas da Shopee
  // (paradas-topo.spec.ts). A marca de porta verificada continua chegando às entregues e é o que o
  // cartão de montar conta; estes testes a leem guardada no celular.
  const verificadas = (page: Page) => page.evaluate(() =>
    JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.filter((p: {portaVerificada?: boolean}) => p.portaVerificada).length as number);

  for (const como of ['voltando para o app', 'abrindo o app'] as const) {
    test(`a entregue fica com a porta verificada quando a nuvem verifica (${como})`, async ({page, nuvem}) => {
      page.on('dialog', d => d.accept());
      await abrir(page);
      await carregar(page, ROTA_A);
      await montar(page);
      const feitas = await entregarUma(page);
      expect(await verificadas(page)).toBe(0);
      verificaAsEntregues(nuvem as never);
      if (como === 'abrindo o app') await page.reload();
      else await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect.poll(() => verificadas(page)).toBe(feitas);

      // desfeitas na lista, voltam a ser das que faltam e perdem a marca
      await lista(page);
      await page.locator('details.feitas > summary').click();
      for (let i = feitas; i > 0; i--) await page.locator('details.feitas [aria-label="Desfazer"]').first().click();
      await expect.poll(() => verificadas(page)).toBe(0);
    });
  }

  test('com o app aberto o tempo todo, a marca também chega, de 3 em 3 minutos', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    await page.clock.install();
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const feitas = await entregarUma(page);
    verificaAsEntregues(nuvem as never);
    await page.clock.fastForward('01:00');
    expect(await verificadas(page)).toBe(0);
    await page.clock.fastForward('02:10');
    await expect.poll(() => verificadas(page)).toBe(feitas);
  });
});
