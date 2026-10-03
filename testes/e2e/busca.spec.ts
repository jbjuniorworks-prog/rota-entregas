import {test, expect, abrir, aba, carregar, menu, montar, ROTA_A, type NuvemFalsa} from './apoio';

// B.O. numa entrega (pedido de 02/10): achar logo qual foi, pelo código da etiqueta ou pela rua,
// numa lista de 80 que não dá para rolar procurando.
test.use({viewport: {width: 412, height: 915}});
const ROTA_GRANDE = 'testes/planilhas/rota-d.xlsx';

test('acha a entrega pelo fim do código do pacote, e diz a hora em que foi entregue', async ({page}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await carregar(page, ROTA_GRANDE);
  await montar(page);
  await page.locator('.proxima [data-acao="entregue"]').first().click();
  const entregue = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((x: any) => x.entregue);
    return {id: p.id, codigo: p.pacotes[0] as string, hora: new Date(p.entregueEm).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})};
  });

  await aba(page, '2. Conferir');
  const itens = page.locator('[data-item]');
  await expect(itens).toHaveCount(80);
  await page.getByLabel('Buscar').fill(entregue.codigo.slice(-4));
  await expect(itens).toHaveCount(1);
  const cartao = page.locator(`[data-item="${entregue.id}"]`);
  await expect(cartao.locator('[data-pacote]')).toHaveText(`Pacote ${entregue.codigo}`);
  await expect(cartao.locator('[data-entregue]')).toHaveText(`Entregue às ${entregue.hora}`);
});

test('pela rua e o número, sem confundir o 35 com o 135 da mesma avenida', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_GRANDE);
  await aba(page, '2. Conferir');
  const itens = page.locator('[data-item]');
  await page.getByLabel('Buscar').fill('central 35');
  await expect(itens.first()).toBeVisible();
  const achados = await itens.allInnerTexts();
  expect(achados.length).toBeGreaterThan(0);
  for (const t of achados) expect(t).toContain('Avenida Central, 35,');
  // a planilha tem duas Acácias 110, em bairros diferentes: o bairro separa
  await page.getByLabel('Buscar').fill('acácias 110');
  await expect(itens).toHaveCount(2);
  await page.getByLabel('Buscar').fill('acácias 110 leste');
  await expect(itens).toHaveCount(1);
  await expect(itens).toContainText('Rua das Acácias, 110, Bairro Leste');
  await page.getByLabel('Buscar').fill('rua que não existe');
  await expect(itens).toHaveCount(0);
  await expect(page.getByText('Nenhuma entrega da rota de hoje com isso.')).toBeVisible();
});

// O B.O. que chega dias depois, quando o resetar já apagou a rota do celular: só a nuvem lembra.
const EU = '00000000-0000-4000-8000-000000000001';
function entregasAntigas(nuvem: NuvemFalsa, motorista = 'Você Teste') {
  const rota = (dia: string) => ({dia, motorista_id: EU, perfis: {nome: motorista}});
  nuvem.tabelas.pacotes = [
    {spx_tn: 'BRTESTH0077', endereco: 'Rua das Acácias, 77', bairro: 'Bairro Norte', cep: '49000-777', lat: -10.9600, lng: -37.0600,
      chave_lugar: 'k77', entregue_em: '2026-09-28T17:32:00Z', criado_em: '2026-09-28T11:00:00Z', rotas: rota('2026-09-28')},
    // a nuvem de teste não filtra: quem escolhe é o celular, e esta não pode aparecer
    {spx_tn: 'BRTESTH0005', endereco: 'Avenida Qualquer, 5', bairro: 'Bairro Sul', cep: '49000-555', lat: -10.97, lng: -37.07,
      chave_lugar: 'k5', entregue_em: null, criado_em: '2026-09-27T11:00:00Z', rotas: rota('2026-09-27')},
  ];
  // o GPS de quando ele marcou a entrega, a uns 20 m da posição da planilha
  nuvem.tabelas.observacoes = [{chave_lugar: 'k77', motorista_id: EU, dia: '2026-09-28', lat: -10.9601, lng: -37.0602}];
}

test('acha nos dias anteriores, com a hora e o ponto onde ele marcou a entrega', async ({page, nuvem}) => {
  entregasAntigas(nuvem);
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  await page.getByLabel('Buscar').fill('0077');
  await expect(page.getByText('Nenhuma entrega da rota de hoje com isso.')).toBeVisible();
  await page.locator('[data-dias-anteriores]').click();
  const antiga = page.locator('[data-antiga]');
  await expect(antiga).toHaveCount(1);
  await expect(antiga).toContainText('Rua das Acácias, 77, Bairro Norte');
  await expect(antiga).toContainText('Pacote BRTESTH0077');
  await expect(antiga.locator('[data-entregue]')).toHaveText('Entregue em 28/09 às 14:32');
  const ver = antiga.getByRole('link', {name: 'Ver onde marcou a entrega'});
  await expect(ver).toHaveAttribute('href', /query=-10\.9601,-37\.0602$/);
  // o motorista só vê as dele: o nome não diz nada
  await expect(antiga.locator('[data-motorista]')).toHaveCount(0);
});

test('sem rota no celular, o menu leva à mesma busca', async ({page, nuvem}) => {
  entregasAntigas(nuvem);
  await abrir(page);
  await menu(page, 'Procurar uma entrega');
  await page.getByLabel('Buscar').fill('acacias 77');
  await page.locator('[data-dias-anteriores]').click();
  await expect(page.locator('[data-antiga]')).toHaveCount(1);
});

test('sem internet, diz que precisa dela em vez de dizer que não achou', async ({page, nuvem}) => {
  entregasAntigas(nuvem);
  await abrir(page);
  await page.route('**/rest/v1/pacotes*', r => r.abort());
  await menu(page, 'Procurar uma entrega');
  await page.getByLabel('Buscar').fill('0077');
  await page.locator('[data-dias-anteriores]').click();
  await expect(page.locator('[data-antigas-erro]')).toContainText('Precisa de internet');
  await expect(page.locator('[data-antigas-vazio]')).toHaveCount(0);
});

test.describe('quem administra', () => {
  test.use({papel: 'admin'});

  test('vê qual motorista fez a entrega', async ({page, nuvem}) => {
    entregasAntigas(nuvem, 'Pedro');
    await abrir(page);
    await menu(page, 'Procurar uma entrega');
    await page.getByLabel('Buscar').fill('0077');
    await page.locator('[data-dias-anteriores]').click();
    await expect(page.locator('[data-antiga] [data-motorista]')).toHaveText('Motorista: Pedro');
  });
});
