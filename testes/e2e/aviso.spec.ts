import {abrir, carregar, menu, montar, test, expect, ROTA_A} from './apoio';

// O toque perto do pino (dono, 15/11): indo para uma entrega, ele passa na porta de outra sem ver,
// olhando a rua ou o outro celular. O teste escuta o que o app pede ao aparelho: a vibração do
// aviso e os bipes.
const LONGE = {latitude: -10.9300, longitude: -37.0300, accuracy: 10};
const VIBRACAO_DO_AVISO = JSON.stringify([150, 80, 150]);

test.describe('o toque perto do pino', () => {
  test.use({viewport: {width: 412, height: 915}, permissions: ['geolocation'], geolocation: LONGE});

  test.beforeEach(async ({context}) => {
    await context.addInitScript(() => {
      const w = window as any;
      w.vibracoes = [];
      w.bipes = 0;
      Object.defineProperty(navigator, 'vibrate', {configurable: true, value: (p: unknown) => { w.vibracoes.push(JSON.stringify(p)); return true; }});
      const criar = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (this: AudioContext) { w.bipes++; return criar.call(this); };
    });
  });

  const avisos = (page) => page.evaluate(v => (window as any).vibracoes.filter((x: string) => x === v).length, VIBRACAO_DO_AVISO);
  const bipes = (page) => page.evaluate(() => (window as any).bipes);
  // uma parada ainda por entregar, com pino que não está em dúvida, do estado guardado no aparelho
  const umPino = (page) => page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('rota-entregas-v2')!);
    const duvida = ['ruim', 'nao', 'longe', 'bairro', 'aproximada', 'numero'];
    const p = e.paradas.find((x: any) => !x.entregue && x.lat != null && !duvida.includes(x.precisao));
    return {lat: p.lat as number, lng: p.lng as number};
  });
  const aNorteDe = (p: {lat: number; lng: number}, metros: number) => ({latitude: p.lat + metros / 111320, longitude: p.lng, accuracy: 8});
  // espera a leitura chegar ao app: só então dá para dizer que ela não tocou
  const chegou = (page, g: {latitude: number}) =>
    expect.poll(() => page.evaluate(() => (window as any).rotaTeste?.eu()?.lat), {timeout: 10_000}).toBeCloseTo(g.latitude, 6);

  test('chegando perto de um pino por entregar, o celular vibra e bipa; parado ali, não repete', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await chegou(page, LONGE);
    expect(await avisos(page), 'longe de tudo, tocou').toBe(0);

    const pino = await umPino(page);
    await context.setGeolocation(aNorteDe(pino, 20));
    await expect.poll(() => avisos(page), {timeout: 10_000}).toBe(1);
    expect(await bipes(page), 'os dois bipes do aviso').toBe(2);

    const parado = aNorteDe(pino, 15);
    await context.setGeolocation(parado);
    await chegou(page, parado);
    expect(await avisos(page), 'parado na porta, tocou de novo').toBe(1);
  });

  test('com o som desligado no Mais, chegar perto não toca', async ({page, context}) => {
    await abrir(page);
    await carregar(page, ROTA_A);
    await montar(page);
    await menu(page, 'Desligar o som perto do pino');
    await expect(page.locator('#status')).toContainText('Som perto do pino desligado.');

    const perto = aNorteDe(await umPino(page), 20);
    await context.setGeolocation(perto);
    await chegou(page, perto);
    expect(await avisos(page)).toBe(0);
  });
});
