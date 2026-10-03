import {test, expect, abrir, aviso, menu} from './apoio';

test.describe('sem conta', () => {
  test.use({papel: null});

  test('o app pede login antes de mostrar a rota, e senha errada avisa', async ({page, context}) => {
    await context.route('**://hkclzmlcfiksaqqspqsy.supabase.co/auth/v1/token**', r => r.fulfill({
      status: 400, contentType: 'application/json', headers: {'access-control-allow-origin': '*'},
      body: JSON.stringify({code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials'}),
    }));
    await page.goto('./');
    await expect(page.getByText('Entre com a conta que o responsável criou para você.')).toBeVisible();
    await expect(page.locator('#app')).toHaveCount(0);
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
    await expect(page.locator('#app')).toHaveCount(0);
  });
});

test('motorista entra direto se já tinha entrado, não vê a aba Admin, e ao sair volta para o login', async ({page}) => {
  page.on('dialog', d => d.accept());
  await abrir(page);
  await page.getByRole('button', {name: 'Mais', exact: true}).click();
  await expect(page.getByText('Conectado como Você Teste')).toBeVisible();
  await expect(page.locator('.menu').getByRole('button', {name: /^Admin/})).toHaveCount(0);
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
    await menu(page, /^Admin/);
    await expect(page.getByText('Motoristas (2)')).toBeVisible();

    await page.getByText('Nossa base de ruas').click();
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

    const lugar = page.locator(`[data-secao="📌 Precisa de você"] [data-lugar="${CHAVE}"]`);
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

    await page.getByText('Motoristas (2)').click();
    await page.locator('[data-motorista="Pedro"]').getByRole('button', {name: 'Desativar'}).click();
    await expect(aviso(page)).toContainText('Pedro desativado(a).');
    const mudou = nuvem.pedidos.find(p => p.metodo === 'PATCH' && p.caminho === 'perfis')!;
    expect(mudou.corpo).toEqual({ativo: false});
    expect(mudou.busca).toContain('id=eq.m2');
    await expect(page.locator('[data-motorista="Você Teste"]').getByRole('button')).toHaveCount(0);
  });

  // Pedido de 03/10: colar o e-mail e sair com a senha, em vez do terminal. Que a conta entra de
  // verdade com ela, quem garante é o teste @nuvem; aqui é a tela.
  test('cria a conta de um motorista colando o e-mail, e a senha sai pronta para o WhatsApp', async ({page, context, nuvem}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    nuvem.rpc = {criar_motorista: [{id: 'm9', nome: 'Motorista Inventado', senha: 'Abc23defGhjkmn'}]};
    await abrir(page);
    await menu(page, /^Admin/);
    await page.locator('summary', {hasText: /^Motoristas/}).click();
    await page.getByLabel('E-mail do motorista').fill('  Motorista.Inventado@Exemplo.com ');
    await page.getByLabel('Nome do motorista').fill('Motorista Inventado');
    await page.getByRole('button', {name: 'Criar conta'}).click();

    await expect(page.locator('[data-senha]')).toHaveText('Abc23defGhjkmn');
    expect(nuvem.pedidos.find(p => p.caminho === 'rpc/criar_motorista')?.corpo)
      .toEqual({email_: 'motorista.inventado@exemplo.com', nome_: 'Motorista Inventado'});
    await expect(page.getByLabel('E-mail do motorista')).toHaveValue('');

    await page.getByRole('button', {name: 'Copiar para o WhatsApp'}).click();
    // a área de transferência do Windows devolve as quebras de linha como \r\n
    const copiado = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    expect(copiado).toMatch(/^Seu acesso ao app de rota:\nhttp\S+\nE-mail: motorista\.inventado@exemplo\.com\nSenha: Abc23defGhjkmn$/);
  });

  test('sem o SQL da conta rodado, diz o que falta em vez de uma senha', async ({page, context}) => {
    await context.route('**/rest/v1/rpc/criar_motorista', r => r.fulfill({
      status: 404, contentType: 'application/json', headers: {'access-control-allow-origin': '*'},
      body: JSON.stringify({code: 'PGRST202', message: 'Could not find the function public.criar_motorista(email_, nome_) in the schema cache'}),
    }));
    await abrir(page);
    await menu(page, /^Admin/);
    await page.locator('summary', {hasText: /^Motoristas/}).click();
    await page.getByLabel('E-mail do motorista').fill('motorista.inventado@exemplo.com');
    await page.getByRole('button', {name: 'Criar conta'}).click();
    await expect(aviso(page)).toContainText('falta rodar o supabase/019_criar_motorista.sql');
    await expect(page.locator('[data-senha]')).toHaveCount(0);
  });

  // Pedido de 28/09: "não faz sentido eu ter que procurar as mudanças que eles pedirem". As
  // marcações ficavam no fim da página, depois de 14 dias de rotas, todas misturadas.
  test.describe('no celular', () => {
    test.use({viewport: {width: 412, height: 915}});

    test('o que espera decisão aparece antes de tudo, e o novo desde a última visita vem marcado', async ({page, nuvem, context}) => {
      const hora = 3600e3, dia = 864e5, antes = (ms: number) => new Date(Date.now() - ms).toISOString();
      const [DECIDIR, PORTA, VELHA] = ['49000100|20', '49000100|30', '49000100|40'];
      const luan = {motorista_id: 'm1', perfis: {nome: 'Luan', papel: 'motorista'}};
      const pedro = {motorista_id: 'm2', perfis: {nome: 'Pedro', papel: 'motorista'}};
      nuvem.tabelas = {
        perfis: [{id: 'm1', nome: 'Luan', papel: 'motorista', ativo: true}, {id: 'm2', nome: 'Pedro', papel: 'motorista', ativo: true}],
        rotas: [],
        pacotes: [
          {chave_lugar: DECIDIR, endereco: 'Rua B, 20', bairro: 'Centro'},
          {chave_lugar: PORTA, endereco: 'Rua C, 30', bairro: 'Centro'},
          {chave_lugar: VELHA, endereco: 'Rua D, 40', bairro: 'Centro'},
        ],
        correcoes: [
          {chave_lugar: PORTA, lat: -10.93, lng: -37.07, criado_em: antes(hora), ...pedro},
          {chave_lugar: DECIDIR, lat: -10.92, lng: -37.06, criado_em: antes(dia), ...luan},
          {chave_lugar: VELHA, lat: -10.94, lng: -37.08, criado_em: antes(20 * dia), ...luan},
          {chave_lugar: VELHA, lat: -10.94, lng: -37.08, criado_em: antes(20 * dia), ...pedro},
        ],
      };
      nuvem.rpc = {posicoes: [
        {chave_lugar: DECIDIR, lat: -10.92, lng: -37.06, situacao: 'sugestao', motoristas: 1, entregas: 0, fonte: 'correcao', minha: false},
        {chave_lugar: PORTA, lat: -10.93, lng: -37.07, situacao: 'confirmado', motoristas: 1, entregas: 1, fonte: 'correcao', minha: false},
        {chave_lugar: VELHA, lat: -10.94, lng: -37.08, situacao: 'confirmado', motoristas: 2, entregas: 0, fonte: 'correcao', minha: false},
      ]};
      // a última vez que ele abriu o Admin foi há 12 horas
      await context.addInitScript(t => { if (!localStorage.getItem('rota-entregas-admin-visto')) localStorage.setItem('rota-entregas-admin-visto', t); }, String(Date.now() - 12 * hora));

      await abrir(page);
      // o aviso chega antes de ele entrar no Admin: o número fica na própria aba
      // o número fica no botão Mais, à vista em toda tela, e de novo no item do Admin
      await expect(page.getByRole('button', {name: 'Mais', exact: true}).locator('[data-selo]')).toHaveText('1');
      await page.getByRole('button', {name: 'Mais', exact: true}).click();
      await expect(page.locator('.menu').getByRole('button', {name: /^Admin/}).locator('[data-selo]')).toHaveText('1');
      await page.locator('.menu').getByRole('button', {name: /^Admin/}).click();
      await expect(page.locator('[data-resumo]')).toContainText('📌 1 esperando você.');
      await expect(page.locator('[data-resumo]')).toContainText('🆕 1 marcação(ões) nova(s) desde');

      // na ordem da tela: primeiro o que espera decisão, depois o que chegou, e o resto por último
      const secoes = await page.locator('#painel details > summary').allInnerTexts();
      expect(secoes.slice(0, 2)).toEqual(['📌 Precisa de você (1)', '🆕 Marcadas pelos motoristas nos últimos 7 dias (1)']);
      expect(secoes.indexOf('Marcações mais antigas (1)')).toBeGreaterThan(secoes.findIndex(s => s.startsWith('Rotas')));

      const decidir = page.locator(`[data-secao="📌 Precisa de você"] [data-lugar="${DECIDIR}"]`);
      await expect(decidir).toContainText('Só Luan marcou, e ninguém entregou nesse ponto ainda.');
      await expect(decidir.getByRole('button', {name: 'Confirmar'})).toBeVisible();
      await expect(decidir).not.toContainText('novo');

      const porta = page.locator(`[data-secao="🆕 Marcadas pelos motoristas nos últimos 7 dias"] [data-lugar="${PORTA}"]`);
      await expect(porta).toContainText('Confirmada na porta, com a entrega');
      await expect(porta).toContainText('novo');
      // a antiga existe, mas guardada: não disputa a vista com o que é de hoje
      await expect(page.locator(`[data-lugar="${VELHA}"]`)).toBeHidden();

      // voltando depois, o que ele já viu deixa de ser novo
      await page.locator('.cabecalho').getByRole('button', {name: 'Voltar'}).click();
      await menu(page, /^Admin/);
      await expect(page.locator('[data-resumo]')).toContainText('Nada novo desde');
      await expect(porta).toBeVisible();
      await expect(porta).not.toContainText('novo');
    });
  });
});
