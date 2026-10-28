import type {Page} from '@playwright/test';
import {abrir, aviso, carregar, expect, menu, montar, test, ROTA_A, type NuvemFalsa} from './apoio';

// 28/10: o dono mandou o link do Maps que o cliente de uma entrega do Luan passou, e pediu "uma
// forma mais rápida de arrumar assim". O link copiado leva o pino: do cartão da próxima, da faixa do
// "Arrumar o pino" e da do "Marcar como admin". Links inventados, no formato dos de verdade.
type Gravada = {id: string; texto: string; lat: number; lng: number; entregue: boolean; precisao: string};
const estado = (page: Page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('rota-entregas-v2')!) as {paradas: Gravada[]; rota: {areas: {ordem: string[]}[]}});
async function proxima(page: Page): Promise<Gravada> {
  const e = await estado(page);
  const id = e.rota.areas.flatMap(a => a.ordem).find(i => !e.paradas.find(p => p.id === i)!.entregue)!;
  return e.paradas.find(p => p.id === id)!;
}
const parada = async (page: Page, id: string) => (await estado(page)).paradas.find(p => p.id === id)!;
// o !3d!4d é a porta; o @ é só o enquadramento, de propósito em outro lugar
const linkDe = (p: {lat: number; lng: number}) =>
  `https://www.google.com/maps/place/Lugar+Inventado/@${(p.lat + 0.01).toFixed(7)},${(p.lng + 0.01).toFixed(7)},19z/data=!4m4!3m3!8m2!3d${p.lat.toFixed(7)}!4d${p.lng.toFixed(7)}?hl=pt-BR`;
// com seis casas, como a correção sobe
const aNorte = (p: {lat: number; lng: number}, metros: number) => ({lat: +(p.lat + metros / 111320).toFixed(6), lng: +p.lng.toFixed(6)});
const copiar = (page: Page, texto: string) => page.evaluate(t => navigator.clipboard.writeText(t), texto);
const gravadas = (nuvem: NuvemFalsa) => nuvem.pedidos.filter(p => p.metodo === 'POST' && p.caminho === 'correcoes').map(p => p.corpo as {lat: number; lng: number; chave_lugar: string});
const ondeEsta = async (page: Page, id: string) => { const p = await parada(page, id); return {lat: p.lat, lng: p.lng}; };

test.describe('Colar link do mapa', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['clipboard-read', 'clipboard-write']});

  test('do cartão da próxima: o pino vai para a porta do link, a correção sobe, e Desfazer volta', async ({page, nuvem}) => {
    const perguntas: string[] = [];
    page.on('dialog', d => { perguntas.push(d.type()); d.accept(); });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    const porta = aNorte(alvo, 200);
    await copiar(page, linkDe(porta));
    await page.locator('.proxima [data-acao="colar-link"]').click();
    await expect(aviso(page)).toContainText('Pino no local do link');
    expect(await ondeEsta(page, alvo.id)).toEqual(porta);
    expect(perguntas, 'o link copiado basta: nada de pedir para colar').not.toContain('prompt');
    await expect.poll(() => gravadas(nuvem).length).toBe(1);
    expect(gravadas(nuvem)[0]).toMatchObject(porta);
    await page.locator('#status').getByRole('button', {name: 'Desfazer'}).click();
    expect(await ondeEsta(page, alvo.id)).toEqual({lat: alvo.lat, lng: alvo.lng});
  });

  test('o link curto do Compartilhar diz por que não leva, e o pino fica', async ({page, nuvem}) => {
    const perguntas: string[] = [];
    page.on('dialog', d => { perguntas.push(d.type()); d.accept(); });
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    await copiar(page, 'https://maps.app.goo.gl/AbCdEf123Inventado?g_st=aw');
    await page.locator('.proxima [data-acao="colar-link"]').click();
    await expect(aviso(page)).toContainText('Esse link não traz a posição');
    expect(perguntas).toEqual([]);
    await page.waitForTimeout(1000);
    expect(await ondeEsta(page, alvo.id)).toEqual({lat: alvo.lat, lng: alvo.lng});
    expect(gravadas(nuvem)).toEqual([]);
  });

  // Um link velho esquecido na área de transferência, de outra entrega: longe, ele confirma.
  test('link a mais de 3 km pergunta antes; não, e o pino fica; sim, e vai', async ({page, nuvem}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    const longe = aNorte(alvo, 5000);
    await copiar(page, linkDe(longe));
    let pergunta = '';
    page.once('dialog', d => { pergunta = d.message(); d.dismiss(); });
    await page.locator('.proxima [data-acao="colar-link"]').click();
    await expect.poll(() => pergunta).toContain('O link fica a 5,0 km do pino de agora.');
    await page.waitForTimeout(1000);
    expect(await ondeEsta(page, alvo.id)).toEqual({lat: alvo.lat, lng: alvo.lng});
    expect(gravadas(nuvem)).toEqual([]);
    page.on('dialog', d => d.accept());
    await page.locator('.proxima [data-acao="colar-link"]').click();
    await expect(aviso(page)).toContainText('Pino no local do link');
    expect(await ondeEsta(page, alvo.id)).toEqual(longe);
  });

  test('da faixa do Arrumar o pino: leva ao link e sai do modo de tocar no mapa', async ({page}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    await page.getByRole('button', {name: 'Minimizar'}).click();
    await page.locator(`.pino[data-ids*="${alvo.id}"]`).click();
    await page.locator('[data-folha="pino"] [data-acao="arrumar"]').click();
    const faixa = page.locator('[data-armado]');
    await expect(faixa).toContainText('Toque no mapa');
    const porta = aNorte(alvo, 150);
    await copiar(page, linkDe(porta));
    await faixa.getByRole('button', {name: 'Colar link do mapa'}).click();
    await expect(aviso(page)).toContainText('Pino no local do link');
    await expect(faixa).toHaveCount(0);
    expect(await ondeEsta(page, alvo.id)).toEqual(porta);
  });
});

// Sem permissão para ler o que ele copiou (ou nada copiado), o app pede para colar.
test.describe('Colar link do mapa sem ler a área de transferência', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: []});

  test('pede para colar, e o link colado leva o pino', async ({page}) => {
    const alvoInicial: {lat?: number; lng?: number} = {};
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const alvo = await proxima(page);
    Object.assign(alvoInicial, alvo);
    const porta = aNorte(alvo, 120);
    const perguntas: string[] = [];
    page.on('dialog', d => { perguntas.push(d.type()); d.type() === 'prompt' ? d.accept(linkDe(porta)) : d.accept(); });
    await page.locator('.proxima [data-acao="colar-link"]').click();
    await expect(aviso(page)).toContainText('Pino no local do link');
    expect(perguntas).toContain('prompt');
    expect(await ondeEsta(page, alvo.id)).toEqual(porta);
  });
});

test.describe('Colar link do mapa no Admin', () => {
  test.use({papel: 'admin', viewport: {width: 412, height: 915}, permissions: ['clipboard-read', 'clipboard-write']});

  test('o link marca a porta de todos na chave do endereço procurado', async ({page, nuvem}) => {
    const FLORES = '49000106|900';
    await abrir(page);
    nuvem.tabelas.pacotes = [{chave_lugar: FLORES, endereco: 'Rua das Flores, 900', bairro: 'Bairro Norte', cep: '49000-106'}];
    await menu(page, /^Admin/);
    const secao = page.locator('[data-secao="Procurar um endereço"]');
    await secao.getByLabel('Procurar um endereço').fill('flores 900');
    await secao.getByRole('button', {name: 'Procurar'}).click();
    const lugar = secao.locator(`[data-lugar-achado="${FLORES}"]`);
    await expect(lugar).toContainText('Rua das Flores, 900');
    let pergunta = '';
    page.on('dialog', d => { pergunta = d.message(); d.accept(); });
    await lugar.getByRole('button', {name: 'Marcar como admin'}).click();
    const porta = {lat: -10.961234, lng: -37.048765};
    await copiar(page, linkDe(porta));
    await page.locator('[data-armado]').getByRole('button', {name: 'Colar link do mapa'}).click();
    await expect(aviso(page)).toContainText('Porta gravada: vale para todos os motoristas');
    expect(pergunta).toContain('Gravar este ponto como a porta de Rua das Flores, 900?');
    expect(gravadas(nuvem)).toEqual([expect.objectContaining({chave_lugar: FLORES, ...porta})]);
  });
});

// "Eles recebem assim pelo WhatsApp" (dono, 28/10): a localização do cliente chega pelo
// Compartilhar do celular. Com a rota na mão, ela arruma uma entrega, não vira parada nova.
test.describe('localização recebida pelo Compartilhar', () => {
  test.use({viewport: {width: 412, height: 915}});
  const compartilhar = async (page: Page, texto: string) => {
    await page.evaluate(async t => { const c = await caches.open('compartilhado'); await c.put('./compartilhado/texto', new Response(t)); }, texto);
    await page.goto('./?compartilhado=1');
  };

  test('mostra as entregas da mais perto para a mais longe, e a escolhida vai para o local', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    // a última da planilha, não a primeira: sem ordenar pela distância, ela não viria no topo
    const todas = (await estado(page)).paradas;
    const alvo = todas.filter(p => !p.entregue && p.lat != null).at(-1)!;
    const quantas = todas.length;
    const local = aNorte(alvo, 40);
    await compartilhar(page, `https://maps.google.com/maps?q=${local.lat}%2C${local.lng}&z=17&hl=pt-BR`);
    const faixa = page.locator('[data-local-recebido]');
    await expect(faixa).toContainText('Local recebido. É de qual entrega?');
    const opcoes = faixa.locator('button[data-ids]');
    await expect(opcoes.first()).toHaveAttribute('data-ids', alvo.id);
    await expect(opcoes.first()).toContainText('40 m');
    await opcoes.first().click();
    await expect(aviso(page)).toContainText('Pino no local recebido');
    await expect(faixa).toHaveCount(0);
    expect(await ondeEsta(page, alvo.id)).toEqual(local);
    expect((await estado(page)).paradas.length, 'nenhuma parada nova').toBe(quantas);
    await expect.poll(() => gravadas(nuvem).length).toBe(1);
  });

  test('o link curto diz por que não leva, sem parada nova', async ({page, nuvem}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    const quantas = (await estado(page)).paradas.length;
    await compartilhar(page, 'https://maps.app.goo.gl/AbCdEf123Inventado?g_st=aw');
    await expect(aviso(page)).toContainText('Esse link não traz a posição');
    await expect(page.locator('[data-local-recebido]')).toHaveCount(0);
    expect((await estado(page)).paradas.length).toBe(quantas);
    expect(gravadas(nuvem)).toEqual([]);
  });
});
