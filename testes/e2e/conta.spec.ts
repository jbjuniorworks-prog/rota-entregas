import {test, expect, abrir, aviso} from './apoio';

test.describe('sem conta', () => {
  test.use({papel: null});

  test('o app pede login antes de mostrar a rota, e senha errada avisa', async ({page, context}) => {
    await context.route('**://hkclzmlcfiksaqqspqsy.supabase.co/auth/v1/token**', r => r.fulfill({
      status: 400, contentType: 'application/json', headers: {'access-control-allow-origin': '*'},
      body: JSON.stringify({code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials'}),
    }));
    await page.goto('./');
    await expect(page.getByText('Entre com a conta que o responsável criou para você.')).toBeVisible();
    await expect(page.getByRole('button', {name: '1. Endereços'})).toHaveCount(0);
    await page.getByLabel('E-mail').fill('alguem@exemplo.com');
    const senha = page.getByLabel('Senha', {exact: true});
    await senha.fill('errada');
    await expect(senha).toHaveAttribute('type', 'password');
    await page.getByRole('button', {name: 'Mostrar senha'}).click();
    await expect(senha).toHaveAttribute('type', 'text');
    await expect(senha).toHaveValue('errada');
    await page.getByRole('button', {name: 'Esconder senha'}).click();
    await expect(senha).toHaveAttribute('type', 'password');
    await senha.press('Enter');
    await expect(aviso(page)).toHaveText('E-mail ou senha errados.');
    await expect(page.getByRole('button', {name: '1. Endereços'})).toHaveCount(0);
  });
});

test('motorista entra direto se já tinha entrado, não vê a aba Admin, e ao sair volta para o login', async ({page}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await expect(page.getByText('Conectado como Você Teste')).toBeVisible();
  await expect(page.getByRole('button', {name: '⚙️ Admin'})).toHaveCount(0);
  await page.getByRole('button', {name: 'Sair'}).click();
  await expect(page.getByText('Entre com a conta que o responsável criou para você.')).toBeVisible();
});

test.describe('administrador', () => {
  test.use({papel: 'admin'});
  const agora = new Date().toISOString(), hoje = agora.slice(0, 10);
  const CHAVE = '49000100|20';

  test('vê motoristas, rotas e pinos corrigidos, e confirma, apaga e desativa', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    nuvem.tabelas = {
      perfis: [{id: 'm1', nome: 'Luan', papel: 'motorista', ativo: true}, {id: 'm2', nome: 'Pedro', papel: 'motorista', ativo: true}],
      rotas: [{id: 'r1', dia: hoje, arquivo: 'rota-luan.xlsx', criado_em: agora, motorista_id: 'm1', perfis: {nome: 'Luan'}}],
      pacotes: [
        {rota_id: 'r1', spx_tn: 'BR1', sequencia: 1, endereco: 'Rua das Acácias, 10', bairro: 'Centro', lat: -10.91, lng: -37.05, entregue_em: agora, chave_lugar: '49000100|10'},
        {rota_id: 'r1', spx_tn: 'BR2', sequencia: 2, endereco: 'Rua B, 20', bairro: 'Centro', lat: -10.92, lng: -37.06, entregue_em: null, chave_lugar: CHAVE},
      ],
      correcoes: [
        {chave_lugar: CHAVE, lat: -10.9201, lng: -37.0601, criado_em: agora, motorista_id: 'm1', perfis: {nome: 'Luan', papel: 'motorista'}},
        {chave_lugar: CHAVE, lat: -10.93, lng: -37.07, criado_em: agora, motorista_id: 'm2', perfis: {nome: 'Pedro', papel: 'motorista'}},
      ],
    };
    nuvem.rpc = {
      posicoes: [{chave_lugar: CHAVE, lat: -10.9201, lng: -37.0601, situacao: 'sugestao', motoristas: 1, minha: false}],
      cobertura: [{ruas_com_nome: 3548, trechos_sem_nome: 970, trechos_nossos: 4, passagens: 130, lugares: 96, lugares_confirmados: 21}],
      nomear_ruas: [{trechos: 4, ruas: 2}],
    };

    await abrir(page);
    await page.getByRole('button', {name: '⚙️ Admin'}).click();
    await expect(page.getByText('Motoristas (2)')).toBeVisible();

    await expect(page.getByText(/3548 ruas com nome · 970 trechos ainda sem nome/)).toBeVisible();
    await expect(page.getByText(/130 entregas marcadas na porta, em 96 endereços · 21 já com posição confirmada/)).toBeVisible();
    await page.getByRole('button', {name: 'Nomear ruas com as entregas'}).click();
    await expect(aviso(page)).toContainText('4 trecho(s) ganharam nome, em 2 rua(s).');
    expect(nuvem.pedidos.some(p => p.caminho === 'rpc/nomear_ruas')).toBe(true);

    const rota = page.locator('[data-rota="r1"]');
    await expect(rota).toContainText('Luan · 1/2 entregues');
    await rota.getByRole('button', {name: 'Ver entregas'}).click();
    await expect(rota).toContainText('Rua B, 20');
    await rota.getByRole('button', {name: 'Ver no mapa'}).click();
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);

    const lugar = page.locator(`[data-lugar="${CHAVE}"]`);
    await expect(lugar).toContainText('Rua B, 20');
    await expect(lugar).toContainText('Sugestão');
    await expect(lugar.locator('[data-marcacao="Luan"]')).toContainText('✓ a que vale');
    await expect(lugar.locator('[data-marcacao="Pedro"]')).toContainText('da que vale');

    await page.route('**/rest/v1/correcoes**', async r => {
      if (r.request().method() === 'POST') await new Promise(ok => setTimeout(ok, 1500));
      await r.fallback();
    });
    const botaoConfirmar = lugar.locator('[data-marcacao="Luan"]').getByRole('button', {name: 'Confirmar'});
    await botaoConfirmar.click();
    await expect(lugar.getByRole('button', {name: 'Confirmando…'})).toBeDisabled();
    await lugar.getByRole('button', {name: 'Confirmando…'}).dispatchEvent('click');
    await lugar.getByRole('button', {name: 'Confirmando…'}).dispatchEvent('click');
    await expect(lugar.locator('[data-marcacao="Pedro"]').getByRole('button', {name: 'Apagar'})).toBeDisabled();
    await expect(aviso(page)).toContainText('Posição confirmada', {timeout: 10_000});
    expect(nuvem.pedidos.filter(p => p.metodo === 'POST' && p.caminho === 'correcoes')).toHaveLength(1);

    expect(nuvem.pedidos.find(p => p.metodo === 'POST' && p.caminho === 'correcoes')?.corpo).toMatchObject({chave_lugar: CHAVE, lat: -10.9201, lng: -37.0601});

    await lugar.locator('[data-marcacao="Pedro"]').getByRole('button', {name: 'Apagar'}).click();
    await expect(aviso(page)).toContainText('Marcação apagada.');
    const apagou = nuvem.pedidos.find(p => p.metodo === 'DELETE' && p.caminho === 'correcoes')!;
    expect(decodeURIComponent(apagou.busca)).toContain('motorista_id=eq.m2');

    await page.locator('[data-motorista="Pedro"]').getByRole('button', {name: 'Desativar'}).click();
    await expect(aviso(page)).toContainText('Pedro desativado(a).');
    const mudou = nuvem.pedidos.find(p => p.metodo === 'PATCH' && p.caminho === 'perfis')!;
    expect(mudou.corpo).toEqual({ativo: false});
    expect(mudou.busca).toContain('id=eq.m2');
    await expect(page.locator('[data-motorista="Você Teste"]').getByRole('button')).toHaveCount(0);
  });
});
