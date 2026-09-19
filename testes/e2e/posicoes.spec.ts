import {test, expect, abrir, carregar, aviso, aba, linhaDe, clicarMapa, montar, pontosNoMaps, ROTA_A} from './apoio';

const RUA_D = 'Rua D, 49, Perto do Vale';
const PERTO_DO_GRUPO = [-10.9605, -37.0455] as const;

async function corrigirRuaD(page) {
  await aba(page, '2. Conferir');
  await linhaDe(page, RUA_D, 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
  await clicarMapa(page, ...PERTO_DO_GRUPO);
}

test('posição longe das outras entregas vem em vermelho e sai quando o motorista corrige', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect(aviso(page)).toContainText('⚠️ 1 com posição longe das outras entregas');
  await expect(page.getByText(/❗ 1 para conferir/)).toBeVisible();
  await expect(linhaDe(page, RUA_D, 'Marcar no mapa')).toContainText('Longe das outras entregas — confira o pino');
  await corrigirRuaD(page);
  await expect(aviso(page)).toContainText('guardado para as próximas rotas');
  await expect(page.getByText(/❗ 0 para conferir/)).toBeVisible();
});

test('a correção fica guardada depois do reset e vale para a planilha e para texto colado', async ({page}) => {
  const perguntas: string[] = [];
  page.on('dialog', d => { perguntas.push(d.message()); d.accept(); });
  await abrir(page);
  await carregar(page, ROTA_A);
  await corrigirRuaD(page);

  await aba(page, '1. Endereços');
  await page.getByRole('button', {name: /Resetar rota/}).click();
  expect(perguntas.at(-1)).toContain('Quer resetar mesmo?');
  await expect(page.getByText('Adicionar endereços por área')).toBeVisible();

  await carregar(page, ROTA_A);
  await expect(aviso(page)).toContainText('📌 1 com a posição que você já tinha corrigido');
  await expect(page.getByText(/❗ 0 para conferir/)).toBeVisible();
  await expect(linhaDe(page, RUA_D, 'Marcar no mapa')).toContainText('Corrigida por você antes');

  await aba(page, '1. Endereços');
  await page.getByRole('button', {name: /Resetar rota/}).click();
  await page.getByLabel(/Endereços da área/).fill('Rua D, 49, CEP 49000-199');
  await page.getByRole('button', {name: /^Adicionar em/}).click();
  await expect(linhaDe(page, 'Rua D, 49', 'Marcar no mapa')).toContainText('Corrigida por você antes');

  await aba(page, '1. Endereços');
  await page.getByText('Posições que você corrigiu (1)').click();
  await page.getByRole('button', {name: 'Esquecer todas'}).click();
  await expect(page.getByText(/Posições que você corrigiu/)).toHaveCount(0);
});

test('entrega que a planilha joga longe vai para o bairro dela, e o Maps não recebe o ponto errado', async ({page}) => {
  await abrir(page);
  await carregar(page, 'testes/planilhas/rota-c.xlsx');
  await expect(aviso(page)).toContainText('⚠️ 1 com posição longe das outras entregas: levada(s) para o bairro certo, confira no local.');
  await expect(aviso(page)).toContainText('⚠️ 1 com posição aproximada na planilha');
  await expect(aviso(page)).toContainText('⚠️ 2 com número que não bate com a posição');
  const linha = linhaDe(page, 'Rua do Robalo Errado', 'Marcar no mapa');
  await expect(linha).toContainText('Posição pelo bairro — confira no local');
  await expect(linha).toContainText('Posição pelo bairro Bairro Robalo Teste');
  await page.locator('[data-item]').filter({hasText: 'Rua do Robalo Errado'}).getByRole('button', {name: 'Ver', exact: true}).click();
  await expect(page.getByText('Outras opções encontradas:')).toBeVisible();
  await expect(page.getByRole('button', {name: /Posição que veio na planilha/})).toBeVisible();
  await montar(page);
  const pontos = await pontosNoMaps(page);
  expect(pontos.some(p => p.startsWith('-10.92'))).toBe(false);
  expect(pontos.some(p => p.startsWith('48.'))).toBe(false);
});

test('os pinos não se movem ao arrastar o mapa, e uma correção errada se desfaz com um toque', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_A);
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  await expect(page.locator('.leaflet-marker-draggable')).toHaveCount(0);
  await corrigirRuaD(page);
  await expect(page.getByText(/❗ 0 para conferir/)).toBeVisible();
  await page.getByRole('button', {name: '↺ Desfazer'}).click();
  await expect(aviso(page)).toContainText('Posição anterior de volta.');
  await expect(page.getByText(/❗ 1 para conferir/)).toBeVisible();
  await expect(linhaDe(page, RUA_D, 'Marcar no mapa')).toContainText('Longe das outras entregas — confira o pino');
  await aba(page, '1. Endereços');
  await expect(page.getByText(/Posições que você corrigiu/)).toHaveCount(0);
});

test('reset cancelado não apaga nada', async ({page}) => {
  page.on('dialog', d => d.dismiss());
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '1. Endereços');
  await page.getByRole('button', {name: /Resetar rota/}).click();
  await aba(page, '2. Conferir');
  await expect(page.getByText(RUA_D)).toBeVisible();
});
