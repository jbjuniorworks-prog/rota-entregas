import type {Page} from '@playwright/test';
import {abrir, aba, carregar, clicarMapa, garantirMapa, linhaDe, montar, verNoMapa, test, expect, ROTA_A} from './apoio';

// Dono, 15/11: duas casas uma em frente à outra viraram um pino só, e nenhum zoom separava ("pra
// arrumar é um saco"). No zoom máximo, cada endereço tem o seu pino.
const PINO = '[data-folha="pino"]';
const UMA = 'Avenida Central, 1500';
const OUTRA = 'Travessa Um, 45';
const AQUI = [-10.9640, -37.0430] as const;
// a 1,5 m: o pino de uma cobre o da outra até no zoom máximo
const QUASE = [-10.96401, -37.04301] as const;

const idDe = (page: Page, texto: string) => page.evaluate(t =>
  JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas.find((p: {texto: string}) => p.texto.startsWith(t)).id as string, texto);

test.describe('no zoom máximo, casa diferente não divide pino', () => {
  test.use({viewport: {width: 412, height: 915}});

  test('duas casas quase no mesmo ponto: um pino de longe, dois no zoom máximo, cada um com o seu cartão', async ({page}) => {
    // marcar a segunda perto da primeira pergunta se viram uma parada só: aqui são casas diferentes
    page.on('dialog', d => d.message().includes('virarem uma parada só') ? d.dismiss() : d.accept());
    await abrir(page);
    await carregar(page, ROTA_A);
    await aba(page, '2. Conferir');
    await linhaDe(page, UMA, 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
    await clicarMapa(page, ...AQUI);
    await linhaDe(page, OUTRA, 'Marcar no mapa').getByRole('button', {name: 'Marcar no mapa'}).click();
    await clicarMapa(page, ...QUASE);
    await montar(page);
    await garantirMapa(page);
    const [uma, outra] = [await idDe(page, UMA), await idDe(page, OUTRA)];
    const pinoSo = (id: string) => page.locator(`.pino[data-ids="${id}"]`);

    // de longe, um pino com as duas: a tela não vira confusão
    await verNoMapa(page, ...AQUI, 18);
    await expect(page.locator(`.pino[data-ids*="${uma}"][data-ids*="${outra}"]`)).toHaveCount(1);

    // no zoom máximo, um pino para cada, sem um cobrir o outro
    await verNoMapa(page, ...AQUI, 19);
    await expect(pinoSo(uma)).toBeVisible();
    await expect(pinoSo(outra)).toBeVisible();
    const [a, b] = [(await pinoSo(uma).boundingBox())!, (await pinoSo(outra).boundingBox())!];
    expect(Math.hypot(a.x - b.x, a.y - b.y), 'os dois pinos se cobrem').toBeGreaterThanOrEqual(28);

    // cada pino abre só a sua entrega, com o seu Arrumar
    await pinoSo(outra).click();
    await expect(page.locator(PINO)).toContainText(OUTRA);
    await expect(page.locator(PINO)).not.toContainText(UMA);
    await expect(page.locator(`${PINO} [data-acao=arrumar]`)).toHaveCount(1);
    await page.locator(PINO).getByRole('button', {name: 'Fechar'}).click();
    await pinoSo(uma).click();
    await expect(page.locator(PINO)).toContainText(UMA);
    await expect(page.locator(PINO)).not.toContainText(OUTRA);
  });
});
