import {test, expect, abrir, menu, type NuvemFalsa} from './apoio';

// Print do dono de 08/11: o cartão "Esperando você" dizia 1, a linha embaixo dizia "Nada esperando
// você", o cartão não levava a lugar nenhum, e a rota para conferir só tinha "Apagar rota".
// Motoristas, ruas e arquivos inventados.
const hojeMaceio = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});
const planilha = (nome: string) => hojeMaceio().split('-').reverse().join('-') + ' ' + nome + '.xlsx';
const antes = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit', timeZone: 'America/Maceio'});

const LUAN = {id: 'm1', nome: 'Luan', papel: 'motorista', ativo: true};
const PEDRO = {id: 'm2', nome: 'Pedro', papel: 'motorista', ativo: true};
const rota = (id: string, conta: {id: string; nome: string}, arquivo: string, criado_em: string) =>
  ({id, dia: hojeMaceio(), arquivo, criado_em, motorista_id: conta.id, perfis: {nome: conta.nome, papel: 'motorista'}});
const pacote = (rota_id: string, i: number, extra: Record<string, unknown> = {}) => ({rota_id, chave_lugar: `49000100|${i}`, endereco: `Rua Inventada, ${i}`,
  entregue_em: null, spx_tn: null, sequencia: i, bairro: 'Bairro Teste', lat: -10.95 + i * 0.002, lng: -37.07 + (i % 3) * 0.002, ...extra});

const ABERTA_LUAN = antes(200), ABERTA_PEDRO = antes(190);
// o print: a planilha com o nome do Luan aberta na conta do Pedro; a do Luan, na conta dele
function doPrint(nuvem: NuvemFalsa) {
  nuvem.tabelas = {
    perfis: [LUAN, PEDRO],
    rotas: [rota('r-luan', LUAN, planilha('Luan Inventado Teste'), ABERTA_LUAN), rota('r-pedro', PEDRO, planilha('Luan Inventado Teste'), ABERTA_PEDRO)],
    pacotes: [...[1, 2, 3].map(i => pacote('r-luan', i)), ...[1, 2, 3, 4].map(i => pacote('r-pedro', i + 10))],
  };
}

// uma decisão (só o Luan marcou, ninguém entregou), paradas sem local e a rota para conferir
function deTudo(nuvem: NuvemFalsa, semLocal = 1) {
  doPrint(nuvem);
  nuvem.tabelas.pacotes.push(...Array.from({length: semLocal}, (_, i) => pacote('r-luan', 100 + i, {lat: null, lng: null})));
  nuvem.tabelas.correcoes = [{id: 1, chave_lugar: '49000300|20', lat: -10.92, lng: -37.06, criado_em: antes(60), motorista_id: 'm1', perfis: {nome: 'Luan', papel: 'motorista'}}];
  nuvem.tabelas.observacoes = [{chave_lugar: '49000300|20', endereco: 'Rua Decidir, 20', criado_em: antes(60)}];
  nuvem.rpc = {posicoes: [{chave_lugar: '49000300|20', lat: -10.92, lng: -37.06, situacao: 'sugestao', motoristas: 1, entregas: 0, fonte: 'correcao', minha: false}]};
}

const resumo = (page: any) => page.locator('[data-resumo]');
const cartao = (page: any) => page.locator('[data-kpi="esperando"]');
const secao = (page: any, nome: string) => page.locator(`details[data-secao="${nome}"]`);
// a distância do topo da área que rola até o elemento: no celular o painel rola embaixo do mapa
const doAlto = (loc: any) => loc.evaluate((el: HTMLElement) => {
  let p = el.parentElement;
  while (p && !(p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
  return el.getBoundingClientRect().top - (p ? p.getBoundingClientRect().top : 0);
});

for (const [tamanho, viewport] of [['celular', {width: 412, height: 915}], ['computador', {width: 1280, height: 900}]] as const) {
  test.describe(`Admin, pendências (${tamanho})`, () => {
    test.use({papel: 'admin', viewport});

    test('o cenário do print: o resumo conta a rota para conferir, como o cartão', async ({page, nuvem}) => {
      doPrint(nuvem);
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page).locator('.kpi-num')).toHaveText('1');
      await expect(resumo(page)).toContainText('1 esperando você: 1 rota para conferir.');
      await expect(resumo(page)).not.toContainText('Nada esperando');
    });

    test('enquanto as rotas do dia não chegam, o resumo não diz "nada"', async ({page, nuvem}) => {
      doPrint(nuvem);
      let abrirRotas!: () => void;
      const rotasChegam = new Promise<void>(ok => { abrirRotas = ok; });
      await page.route('**/rest/v1/rotas**', async r => { await rotasChegam; await r.fallback(); });
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(resumo(page)).toContainText('Contando o que espera você…');
      await expect(cartao(page).locator('.kpi-num')).toHaveText('…');
      abrirRotas();
      await expect(resumo(page)).toContainText('1 esperando você: 1 rota para conferir.');
    });

    // Revisão de 08/11: com o painel do dia em erro, as paradas sem local e as rotas para conferir
    // são desconhecidas, não zero. Só a leitura de pacotes do painel do dia falha; o resto chega.
    const derrubarODia = (page: any) => page.route('**/rest/v1/pacotes**', (r: any) =>
      decodeURIComponent(r.request().url()).includes('select=rota_id,chave_lugar,endereco,bairro,lat,lng,entregue_em')
        ? r.fulfill({status: 500, contentType: 'application/json', headers: {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'},
          body: JSON.stringify({message: 'falha simulada', code: 'XX000'})})
        : r.fallback());

    test('com o painel do dia em erro e nada nas marcações, o total é desconhecido, não zero', async ({page, nuvem}) => {
      doPrint(nuvem);
      await derrubarODia(page);
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(page.getByText('Não consegui montar o painel do dia')).toBeVisible();
      await expect(cartao(page).locator('.kpi-num')).toHaveText('?');
      await expect(cartao(page).locator('[data-incompleto]')).toHaveText('sem o painel do dia, o total está incompleto');
      await expect(cartao(page)).not.toContainText('nada para resolver');
      await expect(resumo(page)).toContainText('Nada nas marcações. O painel do dia não carregou: paradas sem local e rotas para conferir não foram contadas.');
      await expect(resumo(page)).not.toContainText('Nada esperando você');
      await expect(resumo(page)).not.toContainText('Contando');
    });

    test('com o painel do dia em erro e uma decisão, o total é "pelo menos" e a decisão continua a um toque', async ({page, nuvem}) => {
      deTudo(nuvem, 2);
      await derrubarODia(page);
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page).locator('.kpi-num')).toHaveText('1+');
      await expect(cartao(page).locator('.kpi-sub button')).toHaveText(['1 decisão']);
      await expect(cartao(page).locator('[data-incompleto]')).toHaveText('; sem o painel do dia, o total está incompleto');
      await expect(resumo(page)).toContainText('Pelo menos 1 esperando você: 1 decisão. O painel do dia não carregou: paradas sem local e rotas para conferir não foram contadas.');
      const decidir = secao(page, '📌 Precisa de você');
      await decidir.locator('> summary').click();
      await cartao(page).locator('[data-ir="📌 Precisa de você"]').click();
      await expect(decidir).toHaveAttribute('open');
      await expect(decidir.locator('[data-lugar="49000300|20"]')).toBeVisible();
    });

    // Revisão de 08/11: "Em conferência" em erro também é desconhecido, não zero.
    const derrubarAConferencia = (page: any) => page.route('**/rest/v1/rpc/marcas_em_conferencia**', (r: any) => r.fulfill({status: 500, contentType: 'application/json',
      headers: {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}, body: JSON.stringify({message: 'falha simulada', code: 'XX000'})}));
    const SEM_CONFERENCIA = '"Em conferência" não carregou: as marcações em conferência não foram contadas.';

    test('com "Em conferência" em erro e nada conhecido, o total é desconhecido e nada diz "nada"', async ({page, nuvem}) => {
      nuvem.tabelas = {perfis: [LUAN], rotas: [rota('r-luan', LUAN, planilha('Luan Inventado Teste'), ABERTA_LUAN)], pacotes: [pacote('r-luan', 1)]};
      await derrubarAConferencia(page);
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(page.getByText('Não consegui ver as marcações em conferência')).toBeAttached();
      await expect(cartao(page).locator('.kpi-num')).toHaveText('?');
      await expect(cartao(page).locator('[data-incompleto]')).toHaveText('sem "Em conferência", o total está incompleto');
      await expect(cartao(page)).not.toContainText('nada para resolver');
      await expect(resumo(page)).toContainText(SEM_CONFERENCIA);
      for (const nada of ['Nada esperando você', 'Nada nas marcações', 'Contando']) await expect(resumo(page)).not.toContainText(nada);
    });

    test('com "Em conferência" em erro e uma rota para conferir, o total é "pelo menos" e a rota continua a um toque', async ({page, nuvem}) => {
      doPrint(nuvem);
      await derrubarAConferencia(page);
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page).locator('.kpi-num')).toHaveText('1+');
      await expect(cartao(page).locator('.kpi-sub button')).toHaveText(['1 rota para conferir']);
      await expect(resumo(page)).toContainText('Pelo menos 1 esperando você: 1 rota para conferir. ' + SEM_CONFERENCIA);
      const conferir = secao(page, 'Rotas para conferir');
      await conferir.locator('> summary').click();
      await cartao(page).locator('[data-ir="Rotas para conferir"]').click();
      await expect(conferir).toHaveAttribute('open');
    });

    test('com o painel do dia e "Em conferência" em erro, as duas ausências aparecem e o total não é completo', async ({page, nuvem}) => {
      deTudo(nuvem, 2);
      await derrubarODia(page);
      await derrubarAConferencia(page);
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page).locator('.kpi-num')).toHaveText('1+');
      await expect(cartao(page).locator('[data-incompleto]')).toHaveText('; sem o painel do dia e "Em conferência", o total está incompleto');
      await expect(resumo(page)).toContainText('Pelo menos 1 esperando você: 1 decisão. O painel do dia não carregou: paradas sem local e rotas para conferir não foram contadas. ' + SEM_CONFERENCIA);
    });

    // Achado na captura de 08/11: com a leitura das rotas recusada, o dia nunca chegava, nem como erro.
    test('com a leitura das rotas em erro, a tela não fica contando para sempre', async ({page, nuvem}) => {
      deTudo(nuvem, 2);
      await page.route('**/rest/v1/rotas**', (r: any) => r.fulfill({status: 500, contentType: 'application/json',
        headers: {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}, body: JSON.stringify({message: 'falha simulada', code: 'XX000'})}));
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page).locator('.kpi-num')).toHaveText('1+');
      await expect(resumo(page)).toContainText('Pelo menos 1 esperando você: 1 decisão. O painel do dia não carregou');
      await expect(resumo(page)).not.toContainText('Contando');
    });

    test('sem nada pendente, o resumo diz que não há nada e o cartão não é botão', async ({page, nuvem}) => {
      nuvem.tabelas = {perfis: [LUAN], rotas: [rota('r-luan', LUAN, planilha('Luan Inventado Teste'), ABERTA_LUAN)], pacotes: [pacote('r-luan', 1)]};
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page).locator('.kpi-num')).toHaveText('0');
      await expect(cartao(page)).toContainText('nada para resolver');
      await expect(resumo(page)).toHaveText(/^Nada esperando você\./);
      await expect(cartao(page).locator('button')).toHaveCount(0);
    });

    test('com várias partes, o resumo e o cartão dizem cada uma, com o mesmo total', async ({page, nuvem}) => {
      deTudo(nuvem, 2);
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(cartao(page).locator('.kpi-num')).toHaveText('4');
      await expect(resumo(page)).toContainText('4 esperando você: 1 decisão, 2 paradas sem local, 1 rota para conferir.');
      await expect(cartao(page).locator('.kpi-sub button')).toHaveText(['1 decisão', '2 paradas sem local', '1 rota para conferir']);
    });

    test('cada parte do cartão abre a seção dela e rola até ela, mesmo fechada', async ({page, nuvem}) => {
      // 15 paradas sem local empurram a rota para conferir para longe do cartão
      deTudo(nuvem, 15);
      await abrir(page);
      await menu(page, /^Admin/);
      const conferir = secao(page, 'Rotas para conferir');
      await conferir.locator('> summary').click();
      await expect(conferir).not.toHaveAttribute('open');
      await cartao(page).locator('[data-ir="Rotas para conferir"]').click();
      await expect(conferir).toHaveAttribute('open');
      await expect(conferir.locator('> summary')).toBeInViewport();
      await expect(conferir.locator('[data-para-conferir="r-pedro"]')).toBeVisible();

      const decidir = secao(page, '📌 Precisa de você');
      await decidir.locator('> summary').click();
      await expect(decidir).not.toHaveAttribute('open');
      await cartao(page).locator('[data-ir="📌 Precisa de você"]').click();
      await expect(decidir).toHaveAttribute('open');
      await expect(decidir.locator('> summary')).toBeInViewport();
    });

    test('o número, com várias partes, leva ao bloco das pendências e reabre as fechadas', async ({page, nuvem}) => {
      deTudo(nuvem, 15);
      await abrir(page);
      await menu(page, /^Admin/);
      const conferir = secao(page, 'Rotas para conferir');
      await conferir.locator('> summary').click();
      await expect(conferir).not.toHaveAttribute('open');
      // longe do topo antes do toque
      await page.locator('[data-secao="Nossa base de ruas"]').scrollIntoViewIfNeeded();
      await cartao(page).locator('[data-ir="pendencias"]').click();
      await expect(conferir).toHaveAttribute('open');
      // no alto da tela, não só em algum canto dela: no computador o bloco aparecia embaixo do cartão
      // mesmo sem rolar (sabotagem de 08/11)
      await expect.poll(() => doAlto(page.locator('[data-pendencias]'))).toBeLessThan(60);
    });

    test('o número, com uma parte só, vai direto à seção dela', async ({page, nuvem}) => {
      doPrint(nuvem);
      await abrir(page);
      await menu(page, /^Admin/);
      const conferir = secao(page, 'Rotas para conferir');
      await conferir.locator('> summary').click();
      await cartao(page).locator('[data-ir="pendencias"]').click();
      await expect(conferir).toHaveAttribute('open');
      await expect.poll(() => doAlto(conferir)).toBeLessThan(60);
    });

    test('a rota para conferir explica o que o nome do arquivo tem e o que se achou na outra conta', async ({page, nuvem}) => {
      doPrint(nuvem);
      await abrir(page);
      await menu(page, /^Admin/);
      const item = page.locator('[data-para-conferir="r-pedro"]');
      await expect(item).toContainText('"Luan" no nome do arquivo, na conta de Pedro');
      await expect(item).toContainText(`aberta às ${horaDe(ABERTA_PEDRO)} · nenhuma entrega`);
      await expect(item.locator('[data-explicacao]')).toHaveText([
        'O nome do arquivo tem "Luan", e a conta é de Pedro.',
        `Na conta de Luan, hoje, há uma rota com o mesmo nome de arquivo, aberta às ${horaDe(ABERTA_LUAN)}, com nenhuma entrega.`,
        'A comparação é só pelo nome do arquivo.',
      ]);
      // "Ver no mapa" e "Apagar rota" separados
      await expect(item.getByRole('button')).toHaveText(['Ver no mapa', 'Apagar rota']);
    });

    test('sem a mesma planilha na outra conta, diz que não encontrou', async ({page, nuvem}) => {
      doPrint(nuvem);
      nuvem.tabelas.rotas[0].arquivo = planilha('Outro Nome Inventado');
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(page.locator('[data-para-conferir="r-pedro"] [data-explicacao]').nth(1))
        .toHaveText('Na conta de Luan, não encontrei hoje uma rota com o mesmo nome de arquivo.');
    });

    test('com o primeiro nome de dois motoristas, mostra a limitação e não escolhe nenhum', async ({page, nuvem}) => {
      doPrint(nuvem);
      nuvem.tabelas.perfis.push({id: 'm3', nome: 'Luan Outro', papel: 'motorista', ativo: true});
      await abrir(page);
      await menu(page, /^Admin/);
      const item = page.locator('[data-para-conferir="r-pedro"]');
      await expect(item).toContainText('Nome de outro motorista no nome do arquivo, na conta de Pedro');
      await expect(item.locator('[data-explicacao]')).toHaveText([
        'O nome do arquivo tem "Luan", primeiro nome de mais de um motorista (Luan e Luan Outro): não dá para dizer de qual é.',
        'Por isso não procurei a mesma planilha na conta de nenhum deles.',
      ]);
    });

    test('ver no mapa mostra os pinos da rota, diz qual é, e não pede nada à nuvem nem muda os números', async ({page, nuvem}) => {
      doPrint(nuvem);
      await abrir(page);
      await menu(page, /^Admin/);
      const item = page.locator('[data-para-conferir="r-pedro"]');
      await expect(page.locator('.mapwrap .pino')).toHaveCount(3);
      const numeros = await page.locator('[data-kpi]').allInnerTexts();
      const pedidos = nuvem.pedidos.length;
      await item.getByRole('button', {name: 'Ver no mapa'}).click();
      // os 4 endereços da rota do Pedro, no lugar dos 3 do dia
      await expect(page.locator('.mapwrap .pino')).toHaveCount(4);
      await expect(item.locator('[data-mostrando]')).toHaveText(`Mostrando no mapa: planilha ${planilha('Luan Inventado Teste')} na conta de Pedro.`);
      await page.locator('.mapwrap .pino').first().click();
      await expect(page.locator('.leaflet-popup-content')).toContainText(/^Conta de Pedro · Rua Inventada, 1[1-4]$/);
      expect(nuvem.pedidos.length, 'olhar a rota não pede nada à nuvem').toBe(pedidos);
      expect(await page.locator('[data-kpi]').allInnerTexts()).toEqual(numeros);
      // outro desenho no mapa tira o "Mostrando"
      await page.locator('[data-dia-no-mapa]').click();
      await expect(item.locator('[data-mostrando]')).toHaveCount(0);
      await expect(page.locator('.mapwrap .pino')).toHaveCount(3);
    });

    test('seção vazia e o histórico começam fechados, e o que pede ação vem antes', async ({page, nuvem}) => {
      doPrint(nuvem);
      nuvem.tabelas.correcoes = [{id: 1, chave_lugar: '49000300|30', lat: -10.93, lng: -37.07, criado_em: antes(60), motorista_id: 'm2', perfis: {nome: 'Pedro', papel: 'motorista'}}];
      nuvem.rpc = {posicoes: [{chave_lugar: '49000300|30', lat: -10.93, lng: -37.07, situacao: 'confirmado', motoristas: 1, entregas: 1, fonte: 'correcao', minha: false}]};
      await abrir(page);
      await menu(page, /^Admin/);
      await expect(secao(page, 'Rotas para conferir')).toHaveAttribute('open');
      const vazia = secao(page, '📌 Precisa de você');
      await expect(vazia.locator('> summary')).toHaveText('📌 Precisa de você (0)');
      await expect(vazia).not.toHaveAttribute('open');
      await expect(secao(page, '🆕 Marcadas pelos motoristas nos últimos 7 dias')).not.toHaveAttribute('open');
      const ordem = await page.locator('[data-pendencias] > details').evaluateAll(ds => ds.map(d => d.getAttribute('data-secao')));
      expect(ordem).toEqual(['Rotas para conferir', '📌 Precisa de você']);
    });
  });
}
