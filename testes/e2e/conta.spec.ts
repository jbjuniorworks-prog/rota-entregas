import {test, expect, abrir, aviso, carregar, clicarMapa, menu, ROTA_A} from './apoio';

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

  // 11/10: o Admin levava uns 6 s para abrir. A contagem das rotas baixava os 6 mil pacotes de 14
  // dias para contar, e a tela esperava ela para mostrar o que esperava decisão.
  const umaRota = (nuvem: {tabelas: Record<string, Record<string, unknown>[]>; rpc: Record<string, unknown>}) => {
    nuvem.tabelas = {
      rotas: [{id: 'r1', dia: hoje, arquivo: 'rota-luan.xlsx', criado_em: agora, motorista_id: 'm1', perfis: {nome: 'Luan'}}],
      pacotes: [
        {rota_id: 'r1', spx_tn: 'BR1', sequencia: 1, endereco: 'Rua das Acácias, 10', bairro: 'Centro', lat: -10.91, lng: -37.05, entregue_em: agora, chave_lugar: '49000100|10'},
        {rota_id: 'r1', spx_tn: 'BR2', sequencia: 2, endereco: 'Rua B, 20', bairro: 'Centro', lat: -10.92, lng: -37.06, entregue_em: null, chave_lugar: CHAVE},
      ],
      correcoes: [{chave_lugar: CHAVE, lat: -10.9201, lng: -37.0601, criado_em: agora, motorista_id: 'm1', perfis: {nome: 'Luan', papel: 'motorista'}}],
    };
    nuvem.rpc = {posicoes: [{chave_lugar: CHAVE, lat: -10.9201, lng: -37.0601, situacao: 'sugestao', motoristas: 1, minha: false}]};
  };
  // a contagem baixando pede só rota e entrega; o painel do dia também busca os pacotes de hoje, e
  // não é contagem (de dia, com a data de Maceió igual à UTC, ele entrava aqui e o teste falhava)
  const contando = (nuvem: {pedidos: {caminho: string; busca: string}[]}) =>
    nuvem.pedidos.filter(p => p.caminho === 'pacotes' && decodeURIComponent(p.busca).includes('select=rota_id,entregue_em&rota_id=in.'));

  test('com a função do banco, as rotas são contadas numa ida, sem baixar os pacotes', async ({page, nuvem}) => {
    umaRota(nuvem);
    nuvem.rpc.contagem_das_rotas = [{rota_id: 'r1', pacotes: 52, entregues: 40}];
    await abrir(page);
    await menu(page, /^Admin/);
    await expect(page.locator('[data-rota="r1"]')).toContainText('Luan · 40/52 entregues');
    expect(nuvem.pedidos.find(p => p.caminho === 'rpc/contagem_das_rotas')?.corpo).toEqual({ids: ['r1']});
    expect(contando(nuvem)).toHaveLength(0);
  });

  test('sem a função no banco, ou sem uma linha para cada rota, conta baixando, como antes', async ({page, nuvem}) => {
    umaRota(nuvem);
    nuvem.rpc.contagem_das_rotas = [{rota_id: 'outra', pacotes: 9, entregues: 9}];
    await abrir(page);
    await menu(page, /^Admin/);
    await expect(page.locator('[data-rota="r1"]')).toContainText('Luan · 1/2 entregues');
    expect(contando(nuvem).length).toBeGreaterThan(0);
  });

  test('o que espera decisão aparece sem esperar a contagem das rotas', async ({page, nuvem}) => {
    umaRota(nuvem);
    await page.route('**/rest/v1/rotas**', async r => { await new Promise(ok => setTimeout(ok, 4000)); await r.fallback(); });
    await abrir(page);
    await menu(page, /^Admin/);
    await expect(page.locator(`[data-secao="📌 Precisa de você"] [data-lugar="${CHAVE}"]`)).toContainText('Rua B, 20', {timeout: 3000});
    await expect(page.locator('[data-rota="r1"]')).toHaveCount(0);
    await expect(page.locator('[data-rota="r1"]')).toContainText('Luan · 1/2 entregues', {timeout: 10_000});
  });

  // Painel do dia (dono, 19/10): os números de hoje e a situação de cada rota, a parada primeiro.
  test('o painel do dia conta as rotas de hoje e diz qual está parada, na rua ou terminou', async ({page, nuvem}) => {
    const hojeMaceio = new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});
    const antes = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const rota = (id: string, nome: string, dia = hojeMaceio) => ({id, dia, arquivo: id + '.xlsx', criado_em: antes(400), motorista_id: nome, perfis: {nome}});
    const pacote = (rota_id: string, chave_lugar: string | null, entregue_em: string | null, endereco = 'Rua Teste, ' + chave_lugar) =>
      ({rota_id, chave_lugar, endereco, entregue_em, spx_tn: null, sequencia: null, bairro: null, lat: -10.9, lng: -37.0});
    nuvem.tabelas = {
      // a de ontem não entra no painel
      rotas: [rota('r1', 'Teste Na Rua'), rota('r2', 'Teste Terminou'), rota('r3', 'Teste Parada'), rota('r4', 'Teste Ontem', '2026-01-01')],
      pacotes: [
        pacote('r1', '49000100|10', antes(30)), pacote('r1', '49000100|20', antes(10)), pacote('r1', null, null, 'Travessa Teste, Sem N'),
        pacote('r2', '49000100|10', antes(200)), pacote('r2', '49000100|30', antes(190)),
        pacote('r3', '49000100|40', antes(125)), pacote('r3', '49000100|50', null), pacote('r3', '49000100|50', null),
        pacote('r4', '49000100|60', null),
      ],
    };
    nuvem.rpc = {posicoes: [
      {chave_lugar: '49000100|10', lat: -10.9, lng: -37.0, situacao: 'confirmado', motoristas: 2},
      {chave_lugar: '49000100|20', lat: -10.9, lng: -37.0, situacao: 'sugestao', motoristas: 1},
    ]};
    await abrir(page);
    await menu(page, /^Admin/);
    const kpi = (k: string) => page.locator(`[data-kpi="${k}"]`);
    await expect(kpi('rotas')).toContainText('3Rotas hoje1 motorista(s) na rua agora');
    await expect(kpi('entregues')).toContainText('5 de 8');
    // r1: 3 endereços (um sem chave), 1 verificado; r2: 2 e 1; r3: 2 e 0
    await expect(kpi('verificados')).toContainText('2 de 7');
    await expect(kpi('esperando')).toContainText('0');
    const linhas = page.locator('[data-secao="Rotas de hoje"] [data-rota-hoje]');
    await expect(linhas).toHaveCount(3);
    expect(await linhas.locator('[data-situacao]').evaluateAll(es => es.map(e => e.getAttribute('data-situacao')))).toEqual(['parada', 'na rua', 'terminou']);
    await expect(linhas.nth(0)).toContainText(/Teste Parada.*1\/3.*0\/2.*Parada há 2h(?!\d)/);
    await expect(linhas.nth(1)).toContainText(/Teste Na Rua.*2\/3.*1\/3.*Na rua/);
    await expect(linhas.nth(2)).toContainText(/Teste Terminou.*2\/2.*1\/2.*Terminou/);
  });

  // "Por que alguns pinos que eles finalizam a rota toda não ficam verificados" (dono, 29/10): o
  // número de verificados abre o porquê de cada endereço entregue, nas rotas de hoje e nas de 14
  // dias. Os casos medidos em 16 dias de rotas, inventados.
  test('o número de verificados abre o porquê de cada endereço entregue sem a porta verificada', async ({page, nuvem}) => {
    const hojeMaceio = new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});
    const antes = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const pacote = (chave_lugar: string | null, entregue_em: string | null, endereco = 'Rua Teste, ' + chave_lugar) =>
      ({rota_id: 'r1', chave_lugar, endereco, entregue_em, spx_tn: null, sequencia: null, bairro: null, lat: -10.9, lng: -37.0});
    const passagem = (chave_lugar: string, extra: Record<string, unknown>) =>
      ({id: chave_lugar, motorista_id: 'Teste Rua', dia: hojeMaceio, chave_lugar, lat: -10.9, lng: -37.0, criado_em: antes(100), no_pino: false, pendente: false, recusada: false, ...extra});
    nuvem.tabelas = {
      rotas: [{id: 'r1', dia: hojeMaceio, arquivo: 'r1.xlsx', criado_em: antes(400), motorista_id: 'Teste Rua', perfis: {nome: 'Teste Rua'}}],
      pacotes: [
        pacote('49000100|10', antes(120)), pacote('49000100|20', antes(5)), pacote('49000100|30', antes(120)),
        pacote('49000100|40', antes(120)), pacote(null, antes(120), 'Travessa Teste, Sem N'), pacote('49000100|50', null),
      ],
      // a 43 m do pino (0,0001 grau de latitude são uns 11 m), e uma do motorista em conferência
      observacoes: [passagem('49000100|30', {lat: -10.9 + 43 / 111320}), passagem('49000100|40', {pendente: true, no_pino: true})],
    };
    nuvem.rpc = {posicoes: [{chave_lugar: '49000100|10', lat: -10.9, lng: -37.0, situacao: 'confirmado', motoristas: 2}]};
    await abrir(page);
    await menu(page, /^Admin/);
    const hoje = page.locator('[data-secao="Rotas de hoje"]');
    await hoje.locator('[data-porque-abrir="r1"]').click();
    const porque = hoje.locator('[data-porque="r1"]');
    await expect(porque).toContainText('1 de 5 endereço(s) entregue(s) com a porta verificada; 1 ainda por entregar.');
    expect(await porque.locator('[data-motivo]').evaluateAll(es => es.map(e => e.getAttribute('data-motivo')))).toEqual(['aprovar', 'subindo', 'longe', 'sem-chave']);
    await expect(porque.locator('[data-motivo="aprovar"]')).toContainText('Esperando você aprovar (1)');
    await expect(porque.locator('[data-motivo="longe"]')).toContainText('Rua Teste, 49000100|30 · a 43 m do pino');
    await expect(porque.locator('[data-motivo="sem-chave"]')).toContainText('Travessa Teste, Sem N');
    // pedidas só as marcas do motorista da rota, no dia dela
    expect(nuvem.pedidos.filter(p => p.caminho === 'observacoes').map(p => new URLSearchParams(p.busca).get('motorista_id'))).toEqual(['eq.Teste Rua']);
    await hoje.locator('[data-porque-abrir="r1"]').click();
    await expect(porque).toHaveCount(0);

    // a mesma conta nas rotas dos últimos 14 dias
    const naLista = page.locator('[data-rota="r1"]');
    await naLista.getByRole('button', {name: 'Portas verificadas'}).click();
    await expect(naLista.locator('[data-porque="r1"]')).toContainText('1 de 5 endereço(s) entregue(s) com a porta verificada');
  });

  // Painel, parte 2 (19/10): o que tem conserto aparece com o botão que conserta. Inventados.
  test.describe('o que tem conserto no painel', () => {
    const hojeMaceio = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});
    // o dia no nome da planilha, como a Shopee escreve: o de hoje, não um fixo, que vira "outro dia" à meia-noite
    const planilha = (nome: string) => hojeMaceio().split('-').reverse().join('-') + ' ' + nome + '.xlsx';
    const antes = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const pacote = (rota_id: string, chave_lugar: string | null, endereco: string, extra: Record<string, unknown> = {}) =>
      ({rota_id, chave_lugar, endereco, entregue_em: null, spx_tn: null, sequencia: null, bairro: 'Bairro Teste', lat: -10.95, lng: -37.05, ...extra});

    test('parada de hoje sem local: o admin marca a porta pelo mapa, e a sem chave diz por quê', async ({page, nuvem}) => {
      nuvem.tabelas = {
        rotas: [{id: 'r1', dia: hojeMaceio(), arquivo: 'Teste.xlsx', criado_em: antes(90), motorista_id: 'm1', perfis: {nome: 'Teste', papel: 'motorista'}}],
        pacotes: [
          pacote('r1', '49000100|5', 'Rua Teste, 5', {entregue_em: antes(20)}),
          pacote('r1', '49000100|77', 'Rua Inventada, 77', {lat: null, lng: null}), pacote('r1', '49000100|77', 'Rua Inventada, 77', {lat: null, lng: null}),
          pacote('r1', null, 'Travessa Inventada, Casa Azul', {lat: null, lng: null}),
          // entregue sem pino: já não é problema
          pacote('r1', '49000100|88', 'Rua Inventada, 88', {lat: null, lng: null, entregue_em: antes(30)}),
        ],
      };
      await abrir(page);
      await menu(page, /^Admin/);
      const secao = page.locator('[data-secao="Paradas de hoje sem local"]');
      await expect(secao.locator('summary')).toHaveText('Paradas de hoje sem local (2)');
      await expect(page.locator('[data-kpi="esperando"]')).toContainText('2 paradas sem local');
      await expect(secao.locator('[data-sem-local="Travessa Inventada, Casa Azul"]')).toContainText('Sem número da porta: a porta marcada não fica guardada.');
      await expect(secao.locator('[data-sem-local="Travessa Inventada, Casa Azul"]').getByRole('button')).toHaveCount(0);
      const item = secao.locator('[data-sem-local="49000100|77"]');
      await expect(item).toContainText('Bairro Teste · Teste · 2 pacotes');
      page.on('dialog', d => d.accept());
      await item.getByRole('button', {name: 'Marcar como admin'}).click();
      await expect(page.locator('[data-armado]')).toContainText('Rua Inventada, 77');
      await clicarMapa(page, -10.96, -37.04);
      await expect(aviso(page)).toContainText('Porta gravada: vale para todos os motoristas');
      expect(nuvem.pedidos.filter(p => p.metodo === 'POST' && p.caminho === 'correcoes').map(p => p.corpo))
        .toEqual([expect.objectContaining({chave_lugar: '49000100|77', lat: -10.96, lng: -37.04})]);
    });

    test('rota de outro dia ou de outro motorista fica fora dos números, e se apaga daqui', async ({page, nuvem}) => {
      nuvem.tabelas = {
        perfis: [{id: 'm1', nome: 'Teste', papel: 'motorista', ativo: true}, {id: 'm2', nome: 'Fulano', papel: 'motorista', ativo: true}],
        rotas: [
          {id: 'boa', dia: hojeMaceio(), arquivo: planilha('Teste Inventado'), criado_em: antes(300), motorista_id: 'm1', perfis: {nome: 'Teste', papel: 'motorista'}},
          {id: 'dele', dia: hojeMaceio(), arquivo: planilha('Fulano Inventado'), criado_em: antes(200), motorista_id: 'm1', perfis: {nome: 'Teste', papel: 'motorista'}},
          {id: 'velha', dia: hojeMaceio(), arquivo: '01-01-2026 Teste Inventado.xlsx', criado_em: antes(100), motorista_id: 'm1', perfis: {nome: 'Teste', papel: 'motorista'}},
        ],
        pacotes: [
          pacote('boa', '49000100|1', 'Rua Teste, 1', {entregue_em: antes(10)}), pacote('boa', '49000100|2', 'Rua Teste, 2'),
          pacote('dele', '49000100|3', 'Rua Teste, 3'), pacote('velha', '49000100|4', 'Rua Teste, 4'),
        ],
      };
      await abrir(page);
      await menu(page, /^Admin/);
      const secao = page.locator('[data-secao="Rotas para conferir"]');
      await expect(secao.locator('summary')).toHaveText('Rotas para conferir (2)');
      await expect(secao.locator('[data-para-conferir="dele"]')).toContainText('Planilha de Fulano na conta de Teste');
      await expect(secao.locator('[data-para-conferir="velha"]')).toContainText('Planilha de 01/01/2026 na conta de Teste');
      // os números e a tabela só com a rota de verdade
      await expect(page.locator('[data-kpi="rotas"] .kpi-num')).toHaveText('1');
      await expect(page.locator('[data-kpi="entregues"] .kpi-num')).toHaveText('1 de 2');
      await expect(page.locator('[data-rota-hoje]')).toHaveCount(1);
      // e o mapa do dia abre só com ela, um pino por endereço
      await expect(page.locator('.mapwrap .pino')).toHaveCount(2);
      // o Atualizar refaz o dia no mapa
      nuvem.tabelas.pacotes.push(pacote('boa', '49000100|5', 'Rua Teste, 5'));
      await page.getByRole('button', {name: '↻ Atualizar'}).click();
      await expect(page.locator('.mapwrap .pino')).toHaveCount(3);

      page.on('dialog', d => d.accept());
      await secao.locator('[data-para-conferir="dele"]').getByRole('button', {name: 'Apagar rota'}).click();
      await expect(aviso(page)).toContainText('Rota apagada.');
      const apagou = nuvem.pedidos.find(p => p.metodo === 'DELETE' && p.caminho === 'rotas');
      expect(apagou?.busca).toContain('id=eq.dele');
    });

    // Dono, 19/10: "minhas rotas só é pra ficar marcado quando eu marcar algum pino na rota
    // (entreguei aqui), de resto é somente eu testando".
    test('rota na conta de quem administra só entra no painel com uma marcação dele nela', async ({page, nuvem}) => {
      const EU = '00000000-0000-4000-8000-000000000001';
      const minha = (id: string, arquivo: string) => ({id, dia: hojeMaceio(), arquivo, criado_em: antes(100), motorista_id: EU, perfis: {nome: 'Você Teste', papel: 'admin'}});
      nuvem.tabelas = {
        rotas: [
          {id: 'boa', dia: hojeMaceio(), arquivo: 'Teste.xlsx', criado_em: antes(300), motorista_id: 'm1', perfis: {nome: 'Teste', papel: 'motorista'}},
          minha('testando', planilha('Fulano Inventado')), minha('de-verdade', planilha('Ciclano Inventado')),
        ],
        pacotes: [pacote('boa', '49000100|9', 'Rua Teste, 9'), pacote('testando', '49000100|1', 'Rua Teste, 1'), pacote('de-verdade', '49000100|2', 'Rua Teste, 2', {entregue_em: antes(10)})],
        correcoes: [{chave_lugar: '49000100|2', lat: -10.95, lng: -37.05, criado_em: antes(10), motorista_id: EU, perfis: {nome: 'Você Teste', papel: 'admin'}}],
      };
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(page.locator('[data-rota-hoje]')).toHaveCount(2);
      await expect(page.locator('[data-rota-hoje="de-verdade"]')).toContainText('Você Teste');
      await expect(page.locator('[data-rota-hoje="testando"]')).toHaveCount(0);
      // nem para conferir: some do painel inteiro
      await expect(page.locator('[data-secao="Rotas para conferir"]')).toHaveCount(0);
    });

    // O César de 19/10 marcou cinco endereços de duas ruas parado num lugar só.
    test('em conferência, avisa quando endereços de ruas diferentes saíram do mesmo ponto', async ({page, nuvem}) => {
      const marca = (chave_lugar: string) => ({motorista_id: 'n1', chave_lugar, lat: -10.95, lng: -37.05, criado_em: antes(30), pendente: true, recusada: false});
      nuvem.tabelas = {observacoes: [marca('49000100|155'), marca('49000100|66'), marca('49000200|60')], correcoes: []};
      nuvem.rpc = {marcas_em_conferencia: [{
        motorista_id: 'n1', nome: 'Novo', chave_lugar: '49000100|155', endereco: 'Rua Inventada, 155', criado_em: antes(30),
        lat: -10.95, lng: -37.05, situacao: 'confirmado', lat_antes: null, lng_antes: null, situacao_antes: null, pino_lat: -10.953, pino_lng: -37.05, no_pino: false,
      }]};
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(page.locator('[data-conferir="49000100|155"] [data-mesmo-ponto]'))
        .toHaveText('Marcada do mesmo ponto que outros 2 endereços, de 2 ruas diferentes. Confira antes de aprovar.');
    });
  });

  // Dono, 19/10: "a lista gigante" das marcadas pelos motoristas, 342 endereços numa semana. Uma linha
  // por motorista, e a lista dele de 20 em 20. A semana inteira: só as 500 mais novas eram uns 3 dias.
  test('as marcadas pelos motoristas vêm uma linha por motorista, com a semana inteira, e a lista de 20 em 20', async ({page, nuvem}) => {
    const antes = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const marca = (i: number, motorista_id: string, nome: string) =>
      ({id: motorista_id + i, chave_lugar: `4900${motorista_id === 'm1' ? 1 : 2}${String(i).padStart(3, '0')}|${i}`, lat: -10.9, lng: -37.0, criado_em: antes(60 + i), motorista_id, perfis: {nome, papel: 'motorista'}});
    nuvem.tabelas = {correcoes: [...Array.from({length: 1050}, (_, i) => marca(i, 'm1', 'Pedro')), ...Array.from({length: 3}, (_, i) => marca(i, 'm2', 'Luan'))]};
    await abrir(page);
    await menu(page, /^Admin/);
    const linhas = page.locator('[data-marcadas-de]');
    await expect(linhas).toHaveCount(2, {timeout: 20_000});
    await expect(linhas.nth(0)).toContainText('Pedro · 1050 endereço(s)');
    await expect(linhas.nth(1)).toContainText('Luan · 3 endereço(s)');
    const doPedro = linhas.nth(0);
    await doPedro.locator('summary', {hasText: 'Ver a lista (1050)'}).click();
    await expect(doPedro.locator('[data-lugar]')).toHaveCount(20);
    await doPedro.getByRole('button', {name: 'Mostrar mais 20 de 1030'}).click();
    await expect(doPedro.locator('[data-lugar]')).toHaveCount(40);
  });

  // Dono, 19/10: o cartão mostrava a chave no lugar do nome. O pedaço de 100 endereços para nas
  // 1.000 linhas, e um endereço com muitas entregas enchia a resposta. Inventados.
  test('cada marcação tem o nome do endereço, mesmo ao lado de um com mil entregas, e o da rota de vídeo', async ({page, nuvem}) => {
    const antes = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const marca = (chave_lugar: string) => ({id: chave_lugar, chave_lugar, lat: -10.9, lng: -37.0, criado_em: antes(60), motorista_id: 'm1', perfis: {nome: 'Pedro', papel: 'motorista'}});
    nuvem.tabelas = {
      correcoes: [marca('49000100|1'), marca('49000100|2'), marca('49000100|3'), marca('49000100|4')],
      pacotes: [
        ...Array.from({length: 1000}, () => ({chave_lugar: '49000100|1', endereco: 'Rua Muito Entregue, 1', bairro: 'Bairro Teste'})),
        {chave_lugar: '49000100|2', endereco: 'Rua Pouco Entregue, 2', bairro: 'Bairro Teste'},
      ],
      // rota lida de vídeo não sobe pacote: o nome fica na passagem
      observacoes: [{chave_lugar: '49000100|3', endereco: 'Rua Do Video, 3'}],
    };
    await abrir(page);
    await menu(page, /^Admin/);
    const doPedro = page.locator('[data-marcadas-de="Pedro"]');
    await doPedro.locator('summary', {hasText: 'Ver a lista (4)'}).click();
    await expect(doPedro.locator('[data-lugar="49000100|1"] .orig')).toHaveText('Rua Muito Entregue, 1');
    await expect(doPedro.locator('[data-lugar="49000100|2"] .orig')).toHaveText('Rua Pouco Entregue, 2');
    await expect(doPedro.locator('[data-lugar="49000100|3"] .orig')).toHaveText('Rua Do Video, 3');
    // sem nome em lugar nenhum: a chave escrita como endereço, não crua
    await expect(doPedro.locator('[data-lugar="49000100|4"] .orig')).toHaveText('CEP 49000-100, nº 4');
  });

  // Revisão de 19/10: o novo de um motorista não é o do outro no mesmo endereço.
  test('os novos de cada motorista são os que ele marcou depois da última visita', async ({page, context, nuvem}) => {
    const antes = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const marca = (chave_lugar: string, motorista_id: string, nome: string, min: number) =>
      ({id: chave_lugar + motorista_id, chave_lugar, lat: -10.9, lng: -37.0, criado_em: antes(min), motorista_id, perfis: {nome, papel: 'motorista'}});
    nuvem.tabelas = {correcoes: [marca('49000100|1', 'm1', 'Pedro', 2 * 1440), marca('49000100|1', 'm2', 'Luan', 60), marca('49000100|2', 'm1', 'Pedro', 3 * 1440)]};
    // a visita anterior foi há 12 horas
    await context.addInitScript(t => { if (!localStorage.getItem('rota-entregas-admin-visto')) localStorage.setItem('rota-entregas-admin-visto', t); }, String(Date.now() - 12 * 3600e3));
    await abrir(page);
    await menu(page, /^Admin/);
    // a linha de cada um; o cartão do endereço, lá dentro, continua com o selo de novo
    const linha = (nome: string) => page.locator(`[data-marcadas-de="${nome}"] > div`).first();
    await expect(linha('Luan')).toHaveText('Luan · 1 endereço(s) · 1 novo(s)');
    await expect(linha('Pedro')).toHaveText('Pedro · 2 endereço(s)');
  });

  // Desempenho, revisão de 19/10: o mesmo resultado, com menos coisa antes de a tela servir.
  test.describe('cargas em partes', () => {
    const antes = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const hojeMaceio = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});
    const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};
    const responder = (r: any, corpo: unknown, status = 200) => r.fulfill({status, contentType: 'application/json', headers: CORS, body: JSON.stringify(corpo)});
    const portao = () => { let abrir!: () => void; const p = new Promise<void>(ok => { abrir = ok; }); return {p, abrir}; };
    const K = '49000100|20';
    // uma marcação só do Luan, que espera decisão; sem pacote, o nome dela vem da passagem
    const umaDecisao = (nuvem: any) => {
      nuvem.tabelas = {
        perfis: [{id: 'm3', nome: 'César', papel: 'motorista', ativo: true, conferir: true}],
        correcoes: [{id: 1, chave_lugar: K, lat: -10.92, lng: -37.06, criado_em: antes(60), motorista_id: 'm2', perfis: {nome: 'Luan', papel: 'motorista'}}],
        observacoes: [{chave_lugar: K, endereco: 'Rua Inventada, 20', criado_em: antes(60)}],
      };
      nuvem.rpc = {posicoes: [{chave_lugar: K, lat: -10.92, lng: -37.06, situacao: 'sugestao', motoristas: 1, entregas: 0, fonte: 'correcao', minha: false}]};
    };
    const cartao = (page: any) => page.locator(`[data-secao="📌 Precisa de você"] [data-lugar="${K}"]`);
    const gravarAvisos = (page: any) => page.addInitScript(() => {
      const vistos: string[] = (window as any).__avisos = [];
      new MutationObserver(() => {
        const t = document.getElementById('status')?.textContent || '';
        if (t && t !== vistos[vistos.length - 1]) vistos.push(t);
      }).observe(document, {subtree: true, childList: true, characterData: true});
    });

    test('as decisões aparecem antes dos nomes, com o endereço escrito pela chave, e o nome que chega é o mesmo', async ({page, nuvem}) => {
      umaDecisao(nuvem);
      const nomes = portao();
      await page.route('**/rest/v1/observacoes**', async r => { await nomes.p; await r.fallback(); });
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page)).toContainText('Só Luan marcou');
      await expect(cartao(page).locator('.orig')).toHaveText('CEP 49000-100, nº 20');
      await expect(cartao(page).locator('.orig')).toHaveClass(/provisorio/);
      // a lista está pronta: o Atualizar já não espera os nomes
      await expect(page.getByRole('button', {name: '↻ Atualizar'})).toBeEnabled();
      nomes.abrir();
      await expect(cartao(page).locator('.orig')).toHaveText('Rua Inventada, 20');
      await expect(cartao(page).locator('.orig')).not.toHaveClass(/provisorio/);
    });

    test('a busca de nomes falhando não tira as decisões, e não cobre o aviso de quem acabou de agir', async ({page, nuvem}) => {
      umaDecisao(nuvem);
      await gravarAvisos(page);
      await page.route('**/rest/v1/observacoes**', r => responder(r, {message: 'falhou'}, 500));
      await page.route('**/rest/v1/pacotes**', r => decodeURIComponent(r.request().url()).includes('chave_lugar=in.') ? responder(r, {message: 'falhou'}, 500) : r.fallback());
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page)).toContainText('Só Luan marcou');
      await expect(cartao(page).locator('.orig')).toHaveText('CEP 49000-100, nº 20');
      await expect(page.getByText(/Não consegui carregar/)).toHaveCount(0);
      page.on('dialog', d => d.accept());
      await page.locator('summary', {hasText: /^Motoristas/}).click();
      await page.locator('[data-motorista="César"]').getByRole('button', {name: 'Encerrar conferência'}).click();
      await expect(aviso(page)).toContainText('César: conferência encerrada.');
      // a carga que a ação pediu termina, e os nomes falham de novo, calados
      await expect(page.getByRole('button', {name: '↻ Atualizar'})).toBeEnabled();
      await page.waitForTimeout(800);
      const avisos: string[] = await page.evaluate(() => (window as any).__avisos);
      expect(avisos[avisos.length - 1]).toBe('César: conferência encerrada.');
      await expect(cartao(page)).toContainText('Só Luan marcou');
    });

    test('o nome de uma carga anterior, chegando atrasado, não troca o da carga atual', async ({page, nuvem}) => {
      umaDecisao(nuvem);
      const primeira = portao();
      let vez = 0;
      await page.route('**/rest/v1/observacoes**', async r => {
        if (++vez === 1) { await primeira.p; return responder(r, [{chave_lugar: K, endereco: 'Rua Velha, 20'}]); }
        return responder(r, [{chave_lugar: K, endereco: 'Rua Nova, 20'}]);
      });
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page).locator('.orig')).toHaveText('CEP 49000-100, nº 20');
      await page.getByRole('button', {name: '↻ Atualizar'}).click();
      await expect(cartao(page).locator('.orig')).toHaveText('Rua Nova, 20');
      primeira.abrir();
      await page.waitForTimeout(800);
      await expect(cartao(page).locator('.orig')).toHaveText('Rua Nova, 20');
    });

    test('uma ação no meio da carga recarrega, e a resposta antiga das marcações não volta por cima', async ({page, nuvem}) => {
      umaDecisao(nuvem);
      const B = '49000100|30';
      const marcaDe = (chave_lugar: string) => [{id: 9, chave_lugar, lat: -10.92, lng: -37.06, criado_em: antes(30), motorista_id: 'm2', perfis: {nome: 'Luan', papel: 'motorista'}}];
      nuvem.rpc.posicoes = [
        {chave_lugar: K, lat: -10.92, lng: -37.06, situacao: 'sugestao', motoristas: 1, entregas: 0, fonte: 'correcao', minha: false},
        {chave_lugar: B, lat: -10.92, lng: -37.06, situacao: 'sugestao', motoristas: 1, entregas: 0, fonte: 'correcao', minha: false},
      ];
      const primeira = portao();
      // o app também lê as marcações ao abrir, para o selo do botão Mais: só as do Admin contam
      let noAdmin = false, vez = 0;
      await page.route('**/rest/v1/correcoes**', async r => {
        if (!noAdmin || !decodeURIComponent(r.request().url()).includes('criado_em=gte.')) return r.fallback();
        if (++vez === 1) { await primeira.p; return responder(r, marcaDe(K)); }
        return responder(r, marcaDe(B));
      });
      page.on('dialog', d => d.accept());
      await abrir(page);
      await page.waitForLoadState('networkidle');
      noAdmin = true;
      await menu(page, /^Admin/);
      // a primeira carga está presa nas marcações: o Atualizar espera, mas a ação não pode ser perdida
      await expect(page.getByRole('button', {name: 'Buscando…'})).toBeDisabled();
      await page.locator('summary', {hasText: /^Motoristas/}).click();
      await page.locator('[data-motorista="César"]').getByRole('button', {name: 'Encerrar conferência'}).click();
      await expect(page.locator(`[data-secao="📌 Precisa de você"] [data-lugar="${B}"]`)).toBeVisible();
      primeira.abrir();
      await page.waitForTimeout(800);
      await expect(page.locator(`[data-secao="📌 Precisa de você"] [data-lugar="${B}"]`)).toBeVisible();
      await expect(page.locator(`[data-lugar="${K}"]`)).toHaveCount(0);
      await expect(page.getByRole('button', {name: '↻ Atualizar'})).toBeEnabled();
    });

    test('os números do dia não esperam a contagem das rotas, e ela não os troca quando chega', async ({page, nuvem}) => {
      nuvem.tabelas = {
        rotas: [{id: 'r1', dia: hojeMaceio(), arquivo: 'Teste.xlsx', criado_em: antes(120), motorista_id: 'm1', perfis: {nome: 'Teste', papel: 'motorista'}}],
        pacotes: [
          {rota_id: 'r1', chave_lugar: '49000100|1', endereco: 'Rua Teste, 1', entregue_em: antes(10), lat: -10.9, lng: -37.0},
          {rota_id: 'r1', chave_lugar: '49000100|2', endereco: 'Rua Teste, 2', entregue_em: null, lat: -10.91, lng: -37.0},
        ],
      };
      const contagem = portao();
      nuvem.rpc.contagem_das_rotas = [{rota_id: 'r1', pacotes: 2, entregues: 1}];
      await page.route('**/rest/v1/rpc/contagem_das_rotas', async r => { await contagem.p; await r.fallback(); });
      await abrir(page);
      await menu(page, /^Admin/);
      const numeros = page.locator('[data-kpi]');
      await expect(page.locator('[data-kpi="entregues"] .kpi-num')).toHaveText('1 de 2');
      await expect(page.locator('[data-rota-hoje="r1"]')).toContainText('1/2');
      await expect(page.locator('[data-rota="r1"]')).toHaveCount(0);
      const enquantoContava = await numeros.allInnerTexts();
      contagem.abrir();
      await expect(page.locator('[data-rota="r1"]')).toContainText('1/2 entregues');
      expect(await numeros.allInnerTexts()).toEqual(enquantoContava);
    });

    test('a base de ruas só conta quando a seção abre, diz que está contando, e o erro tem tentar de novo', async ({page, nuvem}) => {
      nuvem.rpc.cobertura = [{ruas_com_nome: 3548, trechos_sem_nome: 970, trechos_nossos: 4, passagens: 130, lugares: 96, lugares_confirmados: 21}];
      const conta = portao();
      let vez = 0;
      await page.route('**/rest/v1/rpc/cobertura', async r => {
        if (++vez === 1) return responder(r, {message: 'falhou'}, 500);
        await conta.p;
        await r.fallback();
      });
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(page.getByRole('button', {name: '↻ Atualizar'})).toBeEnabled();
      // contado aqui: as respostas deste teste não passam pela nuvem falsa
      expect(vez, 'fechada, não conta').toBe(0);
      const secao = page.locator('[data-secao="Nossa base de ruas"]');
      await secao.locator('summary').click();
      await expect(secao.locator('[data-erro-base]')).toContainText('Não consegui contar a base de ruas');
      await expect(secao).not.toContainText(/\d+ ruas com nome/);
      await secao.getByRole('button', {name: 'Tentar de novo'}).click();
      await expect(secao.locator('[data-contando]')).toHaveText('Contando a base de ruas…');
      await expect(secao).not.toContainText(/\d+ ruas com nome/);
      conta.abrir();
      await expect(secao).toContainText('3548 ruas com nome · 970 trechos ainda sem nome');
      await expect(secao.locator('[data-contando], [data-erro-base]')).toHaveCount(0);
    });
  });

  // "As 500 mais novas" sem buscar de novo o que a semana já trouxe (revisão de 19/10): o conjunto
  // tem de ser o mesmo, nos limites e com horários empatados. Cada marcação num endereço só dela.
  test.describe('as marcações lidas', () => {
    const cep = (n: number) => String(n).padStart(8, '0');
    const semana = (n: number) => Array.from({length: n}, (_, i) => ({id: 10000 + i, chave_lugar: `${cep(49100000 + i)}|1`,
      lat: -10.9, lng: -37.0, criado_em: new Date(Date.now() - (i + 1) * 60000).toISOString(), motorista_id: 'm1', perfis: {nome: 'Pedro', papel: 'motorista'}}));
    // as mais velhas, j = 0 a mais nova; as de `empate` com o mesmo horário
    const velhas = (n: number, empate: number[] = []) => Array.from({length: n}, (_, j) => ({id: 20000 + j, chave_lugar: `${cep(49200000 + j)}|1`,
      lat: -10.9, lng: -37.0, criado_em: new Date(Date.now() - 8 * 864e5 - (empate.includes(j) ? empate[0] : j) * 60000).toISOString(), motorista_id: 'm1', perfis: {nome: 'Pedro', papel: 'motorista'}}));
    const velha = (j: number) => `${cep(49200000 + j)}|1`;
    const antigas = (page: any) => page.locator('[data-secao="Marcações mais antigas"]');

    for (const [nome, n, esperadas] of [['menos de 500', 499, [0]], ['exatamente 500', 500, []], ['mais de 500', 600, []]] as const) {
      test(`com ${nome} na semana`, async ({page, nuvem}) => {
        nuvem.tabelas = {correcoes: [...semana(n), ...velhas(30)]};
        await abrir(page);
        await menu(page, /^Admin/);
        await expect(page.locator('[data-marcadas-de="Pedro"]')).toContainText(`Pedro · ${n} endereço(s)`, {timeout: 20_000});
        if (esperadas.length) {
          await expect(antigas(page).locator('summary')).toHaveText(`Marcações mais antigas (${esperadas.length})`);
          for (const j of esperadas) await expect(antigas(page).locator(`[data-lugar="${velha(j)}"]`)).toHaveCount(1);
        } else {
          await expect(antigas(page)).toHaveCount(0);
          expect(nuvem.pedidos.filter(p => p.caminho === 'correcoes' && decodeURIComponent(p.busca).includes('criado_em=lt.')), 'a semana já tem as 500').toHaveLength(0);
        }
      });
    }

    test('com horários empatados no corte, entram as de id maior, sem repetir nem perder', async ({page, nuvem}) => {
      // faltam 10: as 7 mais novas e 3 das 6 empatadas (7 a 12), as de id maior
      nuvem.tabelas = {correcoes: [...semana(490), ...velhas(30, [7, 8, 9, 10, 11, 12])]};
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(antigas(page).locator('summary')).toHaveText('Marcações mais antigas (10)', {timeout: 20_000});
      for (const j of [0, 1, 2, 3, 4, 5, 6, 10, 11, 12]) await expect(antigas(page).locator(`[data-lugar="${velha(j)}"]`)).toHaveCount(1);
      for (const j of [7, 8, 9, 13]) await expect(page.locator(`[data-lugar="${velha(j)}"]`)).toHaveCount(0);
    });
  });

  // O servidor devolve 1.000 linhas e cala: 30 dias de uso dos botões passam disso no ritmo de
  // outubro, e 14 dias de rotas com uns 70 motoristas por dia.
  test('o Admin lê tudo em partes: uso dos botões e rotas acima de 1.000', async ({page, nuvem}) => {
    // longe de hoje em qualquer fuso, para o painel do dia não buscar os pacotes delas
    const ontem = new Date(Date.now() - 2 * 864e5).toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});
    nuvem.tabelas = {
      uso_dos_botoes: Array.from({length: 1200}, (_, i) => ({dia: ontem, botao: 'aqui', antes: '', vezes: 1, motorista_id: 'm' + i})),
      rotas: Array.from({length: 1001}, (_, i) => ({id: 'r' + i, dia: ontem, arquivo: null, criado_em: ontem + 'T12:00:00Z', motorista_id: 'm1', perfis: {nome: 'Teste'}})),
    };
    // a contagem responde só pelas rotas que pediram, e também para em 1.000
    nuvem.rpc = {contagem_das_rotas: (corpo: {ids: string[]}) => corpo.ids.map(id => ({rota_id: id, pacotes: 2, entregues: 1}))};
    await abrir(page);
    await menu(page, /^Admin/);
    await expect(page.locator('summary', {hasText: /^Rotas dos últimos 14 dias/})).toHaveText('Rotas dos últimos 14 dias (1001)', {timeout: 15_000});
    await expect(page.locator('[data-rota="r1000"]')).toContainText('1/2 entregues');
    // contou no banco, sem cair em baixar os pacotes
    expect(nuvem.pedidos.filter(p => p.caminho === 'pacotes' && decodeURIComponent(p.busca).includes('rota_id=in.'))).toHaveLength(0);
    await page.locator('summary', {hasText: 'Uso dos botões do cartão'}).click();
    await page.getByRole('button', {name: 'Ver a medição'}).click();
    await expect(page.locator('.item', {hasText: 'Estou aqui'})).toContainText('Estou aqui · 1200 vez(es)');
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
      await expect(page.locator('[data-resumo]')).toContainText('1 esperando você.');
      await expect(page.locator('[data-resumo]')).toContainText('🆕 1 marcação(ões) nova(s) desde');

      // na ordem da tela: primeiro o que espera decisão, depois o que chegou, e o resto por último
      const secoes = await page.locator('#painel details > summary').allInnerTexts();
      expect(secoes.slice(0, 2)).toEqual(['📌 Precisa de você (1)', '🆕 Marcadas pelos motoristas nos últimos 7 dias (1)']);
      expect(secoes.indexOf('Marcações mais antigas (1)')).toBeGreaterThan(secoes.findIndex(s => s.startsWith('Rotas')));

      const decidir = page.locator(`[data-secao="📌 Precisa de você"] [data-lugar="${DECIDIR}"]`);
      await expect(decidir).toContainText('Só Luan marcou, e ninguém entregou nesse ponto ainda.');
      await expect(decidir.getByRole('button', {name: 'Confirmar'})).toBeVisible();
      await expect(decidir).not.toContainText('novo');

      // uma linha por motorista; a lista dele abre de 20 em 20
      const doPedro = page.locator('[data-marcadas-de="Pedro"]');
      await expect(doPedro).toContainText('Pedro · 1 endereço(s) · 1 novo(s)');
      await doPedro.locator('summary', {hasText: 'Ver a lista (1)'}).click();
      const porta = page.locator(`[data-secao="🆕 Marcadas pelos motoristas nos últimos 7 dias"] [data-lugar="${PORTA}"]`);
      await expect(porta).toContainText('Confirmada na porta, com a entrega');
      await expect(porta).toContainText('novo');
      // a antiga existe, mas guardada: não disputa a vista com o que é de hoje
      await expect(page.locator(`[data-lugar="${VELHA}"]`)).toBeHidden();

      // voltando depois, o que ele já viu deixa de ser novo
      await page.locator('.cabecalho').getByRole('button', {name: 'Voltar'}).click();
      await menu(page, /^Admin/);
      await expect(page.locator('[data-resumo]')).toContainText('Nada novo desde');
      await expect(doPedro).not.toContainText('novo');
      await doPedro.locator('summary', {hasText: 'Ver a lista (1)'}).click();
      await expect(porta).toBeVisible();
      await expect(porta).not.toContainText('novo');
    });

    // 15/10: a porta que o Pedro verificou no lugar errado só se arrumava carregando a planilha dele.
    // A chave gravada tem de ser a que uma rota com esse endereço pergunta à nuvem: é por ela que o
    // celular do motorista recebe a porta ("porta verificada depois da rota montada").
    test('procurar um endereço mostra a porta que vale e de onde vem; marcar como admin grava na chave da rota, uma vez só, e cancelar não grava', async ({page, nuvem}) => {
      const FLORES = '49000106|900';
      await abrir(page);
      await carregar(page, ROTA_A);
      await expect.poll(() => nuvem.pedidos.some(p => p.caminho === 'rpc/posicoes' && (p.corpo as any)?.chaves?.includes(FLORES)),
        'a rota com a Rua das Flores, 900 pergunta por esta chave').toBe(true);

      nuvem.tabelas.pacotes = [
        {chave_lugar: FLORES, endereco: 'Rua das Flores, 900', bairro: 'Bairro Norte', cep: '49000-106'},
        {chave_lugar: '49000106|90', endereco: 'Rua das Flores, 90', bairro: 'Bairro Norte', cep: '49000-106'},
        {chave_lugar: '49000101|10', endereco: 'Rua das Acácias, 10', bairro: 'Bairro Norte', cep: '49000-101'},
      ];
      nuvem.rpc = {posicoes: [{chave_lugar: FLORES, lat: -10.963, lng: -37.047, situacao: 'confirmado', motoristas: 0, entregas: 1, fonte: 'entrega', minha: false}]};
      await menu(page, /^Admin/);
      const secao = page.locator('[data-secao="Procurar um endereço"]');
      await secao.getByLabel('Procurar um endereço').fill('flores 900');
      await secao.getByRole('button', {name: 'Procurar'}).click();
      const lugar = secao.locator(`[data-lugar-achado="${FLORES}"]`);
      await expect(lugar).toContainText('Rua das Flores, 900');
      await expect(lugar).toContainText('Verificada');
      await expect(lugar).toContainText('Por 1 entrega(s).');
      await expect(secao.locator('[data-lugar-achado]'), 'nem o 90 da mesma rua, nem outra rua').toHaveCount(1);
      const gravados = () => nuvem.pedidos.filter(p => p.metodo === 'POST' && p.caminho === 'correcoes');

      page.once('dialog', d => d.dismiss());
      await lugar.getByRole('button', {name: 'Marcar como admin'}).click();
      await expect(page.locator('[data-armado]')).toContainText('Toque no mapa, no lugar certo de Rua das Flores, 900.');
      await clicarMapa(page, -10.97, -37.05);
      await expect(aviso(page)).toContainText('Nada gravado.');
      await expect(page.locator('[data-armado]')).toHaveCount(0);
      expect(gravados(), 'cancelar não grava').toHaveLength(0);

      nuvem.rpc = {posicoes: [{chave_lugar: FLORES, lat: -10.97, lng: -37.05, situacao: 'confirmado', motoristas: 1, entregas: 0, fonte: 'admin', minha: true}]};
      // daqui em diante toda pergunta é aceita: se o modo não desarmasse, o segundo toque gravaria
      page.on('dialog', d => d.accept());
      await lugar.getByRole('button', {name: 'Marcar como admin'}).click();
      await clicarMapa(page, -10.97, -37.05);
      await clicarMapa(page, -10.98, -37.06);
      await expect(aviso(page)).toContainText('Porta gravada: vale para todos os motoristas');
      await expect(lugar, 'procurou de novo depois de gravar').toContainText('Marcada por quem administra.');
      expect(gravados()).toHaveLength(1);
      expect(gravados()[0].corpo).toMatchObject({chave_lugar: FLORES, lat: -10.97, lng: -37.05});
    });

    // 15/10: um dos dois motoristas novos marcou duas portas erradas, e uma já apareceu verificada
    // para todos. Em conferência, o que ele marca ou entrega espera aqui (022).
    test('o motorista em conferência espera o admin: aprova um por um, as do pino de uma vez, apaga, e encerra a conferência', async ({page, nuvem}) => {
      page.on('dialog', d => d.accept());
      const [LONGE, PERTO, PINO1, PINO2, PENDENTE] = ['49000100|1', '49000100|2', '49000100|3', '49000100|4', '49000100|5'];
      const pino = {lat: -10.95, lng: -37.05}, casa = {lat: -10.9185, lng: -37.05};
      const doNovo = (chave: string, extra: Record<string, unknown>) => ({
        motorista_id: 'm3', nome: 'César', chave_lugar: chave, endereco: `Rua E, ${chave.split('|')[1]}, Centro`, criado_em: new Date().toISOString(),
        situacao: 'confirmado', lat_antes: null, lng_antes: null, situacao_antes: null, pino_lat: pino.lat, pino_lng: pino.lng, no_pino: false, ...extra,
      });
      nuvem.tabelas = {
        perfis: [{id: 'm1', nome: 'Luan', papel: 'motorista', ativo: true, conferir: false}, {id: 'm3', nome: 'César', papel: 'motorista', ativo: true, conferir: true}],
        rotas: [],
        pacotes: [{chave_lugar: PENDENTE, endereco: 'Rua E, 5', bairro: 'Centro'}],
        // a marcação dele está no banco, mas pendente: não é uma "só Luan marcou" para decidir
        correcoes: [{chave_lugar: PENDENTE, lat: casa.lat, lng: casa.lng, criado_em: new Date().toISOString(), pendente: true, motorista_id: 'm3', perfis: {nome: 'César', papel: 'motorista'}}],
      };
      nuvem.rpc = {marcas_em_conferencia: [
        doNovo(PERTO, {lat: -10.9502, lng: -37.05}),
        doNovo(LONGE, casa),
        doNovo(PINO1, {...pino, no_pino: true}),
        doNovo(PINO2, {...pino, no_pino: true}),
      ]};

      await abrir(page);
      await expect(page.getByRole('button', {name: 'Mais', exact: true}).locator('[data-selo]')).toHaveText('4');
      await menu(page, /^Admin/);
      await expect(page.locator('[data-resumo]')).toContainText('4 esperando você.');
      await expect(page.locator(`[data-lugar="${PENDENTE}"]`), 'a pendente não aparece como marcação comum').toHaveCount(0);

      const secao = page.locator('[data-secao="Em conferência"]');
      await expect(secao.locator('summary').first()).toHaveText('Em conferência (4)');
      // a mais longe do pino primeiro
      await expect(secao.locator('[data-conferencia="César"] > [data-conferir]')).toHaveCount(2);
      const longe = secao.locator('[data-conferencia="César"] > [data-conferir]').first();
      await expect(longe).toHaveAttribute('data-conferir', LONGE);
      await expect(longe).toContainText('A 3,5 km do pino da rota. Aprovada, fica verificada.');

      const decididas = () => nuvem.pedidos.filter(p => p.caminho === 'rpc/decidir_marcas').map(p => p.corpo);
      await longe.getByRole('button', {name: 'Aprovar'}).click();
      await expect(aviso(page)).toContainText('Aprovada: vale para todos os motoristas.');
      await secao.getByRole('button', {name: 'Aprovar as 2 entregues no pino da rota'}).click();
      await expect.poll(() => decididas().length).toBe(2);
      await longe.getByRole('button', {name: 'Apagar'}).click();
      await expect(aviso(page)).toContainText('Apagada: não vale para ninguém.');
      expect(decididas()).toEqual([
        {motorista: 'm3', chaves: [LONGE], aprovar: true},
        {motorista: 'm3', chaves: [PINO1, PINO2], aprovar: true},
        {motorista: 'm3', chaves: [LONGE], aprovar: false},
      ]);

      await page.getByText(/^Motoristas \(/).click();
      await expect(page.locator('[data-motorista="César"] .tag')).toHaveText('em conferência');
      await expect(page.locator('[data-motorista="Luan"] .tag')).toHaveCount(0);
      await expect(page.locator('[data-motorista="Luan"]').getByRole('button', {name: 'Pôr em conferência'})).toBeVisible();
      await page.locator('[data-motorista="César"]').getByRole('button', {name: 'Encerrar conferência'}).click();
      await expect(aviso(page)).toContainText('César: conferência encerrada.');
      const mudou = nuvem.pedidos.find(p => p.metodo === 'PATCH' && p.caminho === 'perfis')!;
      expect(mudou.corpo).toEqual({conferir: false});
      expect(mudou.busca).toContain('id=eq.m3');
    });

    // 16/10: o César chegou com 33 endereços longe do pino, e apagar um por um era um saco.
    test('em conferência, escolhe várias e apaga juntas, numa pergunta só', async ({page, nuvem}) => {
      const chaves = ['49000200|1', '49000200|2', '49000200|3', '49000200|4'];
      const pino = {lat: -10.95, lng: -37.05};
      nuvem.tabelas = {perfis: [{id: 'm3', nome: 'César', papel: 'motorista', ativo: true, conferir: true}], rotas: [], pacotes: [], correcoes: []};
      // a do pino fica de fora: "Escolher as N" pega só as que mudam a porta
      nuvem.rpc = {marcas_em_conferencia: chaves.map((chave, k) => ({
        motorista_id: 'm3', nome: 'César', chave_lugar: chave, endereco: `Rua F, ${k + 1}, Centro`, criado_em: new Date().toISOString(),
        situacao: 'sugestao', lat_antes: null, lng_antes: null, situacao_antes: null, pino_lat: pino.lat, pino_lng: pino.lng,
        ...(k < 3 ? {lat: -10.96 - k / 100, lng: -37.05, no_pino: false} : {...pino, no_pino: true}),
      }))};
      await abrir(page);
      await menu(page, /^Admin/);
      const secao = page.locator('[data-secao="Em conferência"]');
      const doCesar = secao.locator('[data-conferencia="César"]');
      const linha = (chave: string) => doCesar.locator(`[data-conferir="${chave}"]`);
      const lote = doCesar.locator('[data-lote]');
      const decididas = () => nuvem.pedidos.filter(p => p.caminho === 'rpc/decidir_marcas').map(p => p.corpo);
      await expect(lote).toHaveCount(0);

      // tocar no endereço marca; a ordem do pedido é a da lista (a mais longe primeiro), não a dos toques
      await linha(chaves[0]).getByText('Rua F, 1, Centro').click();
      await linha(chaves[2]).getByRole('checkbox').check();
      await expect(lote.getByRole('button', {name: 'Apagar as 2 escolhidas'})).toBeVisible();

      page.once('dialog', d => d.dismiss());
      await lote.getByRole('button', {name: 'Apagar as 2 escolhidas'}).click();
      await expect(lote, 'cancelar não desmarca').toContainText('Apagar as 2 escolhidas');
      expect(decididas(), 'cancelar não apaga').toEqual([]);

      page.once('dialog', d => { expect(d.message()).toContain('Apagar o que César marcou em 2 endereços?'); d.accept(); });
      await lote.getByRole('button', {name: 'Apagar as 2 escolhidas'}).click();
      await expect(aviso(page)).toContainText('Apagadas as 2: não valem para ninguém.');
      expect(decididas()).toEqual([{motorista: 'm3', chaves: [chaves[2], chaves[0]], aprovar: false}]);
      await expect(lote, 'as apagadas saem da escolha').toHaveCount(0);

      await doCesar.locator('[data-escolher-todas]').click();
      await expect(lote.getByRole('button', {name: 'Apagar as 3 escolhidas'})).toBeVisible();
      await expect(linha(chaves[3]).getByRole('checkbox', {includeHidden: true})).not.toBeChecked();
      await lote.getByRole('button', {name: 'Desmarcar'}).click();
      await expect(lote).toHaveCount(0);
      await expect(doCesar.getByRole('checkbox', {checked: true})).toHaveCount(0);
    });
  });
});

// GitHub, 19/10: sem posição nenhuma no dia, o Admin abria o mapa do dia vazio a cada carga, e o
// "Nada com posição para mostrar" apagava o aviso de quem tinha acabado de agir.
test.describe('o Admin sem entrega com posição no dia', () => {
  test.use({papel: 'admin'});
  test('não avisa nada sobre o mapa ao abrir nem ao atualizar', async ({page}) => {
    await page.addInitScript(() => {
      const vistos: string[] = (window as any).__avisos = [];
      new MutationObserver(() => {
        const t = document.getElementById('status')?.textContent || '';
        if (t && t !== vistos[vistos.length - 1]) vistos.push(t);
      }).observe(document, {subtree: true, childList: true, characterData: true});
    });
    await abrir(page);
    await menu(page, /^Admin/);
    await expect(page.locator('[data-secao="Rotas de hoje"]')).toContainText('Nenhuma rota enviada hoje.');
    await page.getByRole('button', {name: '↻ Atualizar'}).click();
    await expect(page.getByRole('button', {name: '↻ Atualizar'})).toBeEnabled();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__avisos)).not.toContain('Nada com posição para mostrar.');
  });
});
