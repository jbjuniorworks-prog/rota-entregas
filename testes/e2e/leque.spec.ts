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

// Dono, 18/11: dois pinos no mesmo ponto ficavam um em cima do outro, ligados por uma barra em pé
// que sumia atrás deles. Em V, por cima do ponto e inclinados para ele, se vê que é um lugar só.
test.describe('as do mesmo ponto abrem em V', () => {
  test.use({viewport: {width: 412, height: 915}});

  const separar = async (page: Page) => {
    page.on('dialog', d => d.accept());
    await abrir(page);
    await carregar(page, 'testes/planilhas/rota-e.xlsx');
    await montar(page);
    await page.locator('[data-folha="proxima"]').getByRole('button', {name: 'Separar os 4 pacotes'}).click();
    const separadas = await page.evaluate(() => (JSON.parse(localStorage.getItem('rota-entregas-v2')!).paradas as
      {id: string; lat: number; lng: number; separada?: boolean}[]).filter(p => p.separada));
    expect(separadas).toHaveLength(4);
    const mapa = (await page.locator('#map').boundingBox())!;
    const c = await page.evaluate(([a, b]) => (window as any).rotaTeste.pixel(a, b), [separadas[0].lat, separadas[0].lng]);
    const pinos: {x: number; y: number; giro: number}[] = [];
    for (const p of separadas) {
      const el = page.locator(`.pino[data-ids="${p.id}"]`);
      const caixa = (await el.boundingBox())!;
      // o giro que a tela mostra, de quem segura o pino
      const giro = await el.evaluate(e => { const m = new DOMMatrix(getComputedStyle(e.parentElement!).transform); return Math.atan2(m.b, m.a) * 180 / Math.PI; });
      pinos.push({x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2, giro});
    }
    return {ponto: {x: mapa.x + c.x, y: mapa.y + c.y}, pinos};
  };

  test('os pinos ficam todos por cima do ponto', async ({page}) => {
    const {ponto, pinos} = await separar(page);
    for (const p of pinos) expect(p.y).toBeLessThan(ponto.y);
  });

  test('cada pino se inclina para o ponto: o da esquerda para a esquerda, o da direita para a direita', async ({page}) => {
    const {ponto, pinos} = await separar(page);
    for (const p of pinos) expect(Math.sign(p.giro)).toBe(Math.sign(p.x - ponto.x));
  });
});
